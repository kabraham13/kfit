import { exportWorkoutCSV } from './csvHandler';
import { todayISO } from './date';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const STORAGE_KEY_TOKEN = 'kfit_gdrive_token';
const STORAGE_KEY_TOKEN_EXPIRY = 'kfit_gdrive_token_expiry';
const STORAGE_KEY_USER = 'kfit_gdrive_user';
const STORAGE_KEY_LAST_BACKUP = 'kfit_gdrive_last_backup';
const STORAGE_KEY_LAST_BACKUP_MS = 'kfit_gdrive_last_backup_ms';
// Set once the user has granted access. Survives token expiry, which is what
// lets us renew silently instead of showing "Not Linked" every hour.
const STORAGE_KEY_LINKED = 'kfit_gdrive_linked';
const STORAGE_KEY_NEEDS_REAUTH = 'kfit_gdrive_needs_reauth';
const STORAGE_KEY_LAST_ERROR = 'kfit_gdrive_last_error';
// Last silent-renew outcome, verbatim, so Settings can say *why* rather than a
// generic "reconnect".
const STORAGE_KEY_RENEW_DIAG = 'kfit_gdrive_renew_diag';
// Backoff gate: a transient renew failure should retry later, not hammer GIS on
// every window focus.
const STORAGE_KEY_NEXT_RENEW_MS = 'kfit_gdrive_next_renew_ms';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const MAX_BACKUPS_TO_RETAIN = 7; // Keep rolling 7 most recent backups (1 week)
// Renew this far ahead of expiry so a backup never starts with a token that
// dies mid-request.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const DEFAULT_CLIENT_ID =
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  '727165202795-3e4em19rp6c5neeos6sk92t5dv66i54r.apps.googleusercontent.com';

export interface RenewDiagnostic {
  /** Epoch ms of the attempt. */
  at: number;
  ok: boolean;
  /** GIS/OAuth error code, or 'ok'. */
  code: string;
  message: string;
  /** True when retrying later could plausibly succeed with no user action. */
  transient: boolean;
  consecutiveFailures: number;
}

export interface GoogleDriveStatus {
  isConnected: boolean;
  /** Still linked, but the token could not be renewed without user action. */
  needsReauth: boolean;
  lastError?: string;
  userEmail?: string;
  lastBackupTime?: string;
  autoBackupEnabled: boolean;
  /** Result of the most recent silent-renew attempt, for troubleshooting. */
  renewDiagnostic?: RenewDiagnostic;
  /** Epoch ms before which no further silent renew will be attempted. */
  nextRenewAttemptMs?: number;
}

// Migration: accounts linked under the old implicit flow have a token but no
// linked flag. The Google-side grant is still valid, so mark them linked and let
// the silent renew take over rather than forcing another sign-in.
(function migrateLegacyLink() {
  try {
    if (localStorage.getItem(STORAGE_KEY_TOKEN) && !localStorage.getItem(STORAGE_KEY_LINKED)) {
      localStorage.setItem(STORAGE_KEY_LINKED, 'true');
      // Unknown age — treat as expired so the first use renews it.
      localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRY, '0');
    }
  } catch {
    /* storage unavailable */
  }
})();

export function getStoredGDriveStatus(): GoogleDriveStatus {
  return {
    // Based on the grant, not on whether an unexpired token happens to be in
    // hand — tokens only live an hour and are renewed on demand.
    isConnected: localStorage.getItem(STORAGE_KEY_LINKED) === 'true',
    needsReauth: localStorage.getItem(STORAGE_KEY_NEEDS_REAUTH) === 'true',
    lastError: localStorage.getItem(STORAGE_KEY_LAST_ERROR) || undefined,
    userEmail: localStorage.getItem(STORAGE_KEY_USER) || undefined,
    lastBackupTime: localStorage.getItem(STORAGE_KEY_LAST_BACKUP) || undefined,
    autoBackupEnabled: localStorage.getItem('kfit_gdrive_autobackup') === 'true',
    renewDiagnostic: readRenewDiagnostic(),
    nextRenewAttemptMs: Number(localStorage.getItem(STORAGE_KEY_NEXT_RENEW_MS) || '0') || undefined,
  };
}

function readRenewDiagnostic(): RenewDiagnostic | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RENEW_DIAG);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return typeof parsed?.at === 'number' ? (parsed as RenewDiagnostic) : undefined;
  } catch {
    return undefined;
  }
}

function setSyncError(message: string | null) {
  if (message) localStorage.setItem(STORAGE_KEY_LAST_ERROR, message);
  else localStorage.removeItem(STORAGE_KEY_LAST_ERROR);
}

function markNeedsReauth(message: string) {
  localStorage.setItem(STORAGE_KEY_NEEDS_REAUTH, 'true');
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
  setSyncError(message);
  notifyStatusChanged();
}

function markHealthy() {
  localStorage.removeItem(STORAGE_KEY_NEEDS_REAUTH);
  localStorage.removeItem(STORAGE_KEY_NEXT_RENEW_MS);
  setSyncError(null);
  notifyStatusChanged();
}

// --- Renew failure classification --------------------------------------------

/**
 * A renew failure that genuinely requires the user: the grant is gone, revoked,
 * or Google will not issue a token without an interactive prompt. Only these
 * justify parking the UI on "Reconnect".
 */
const DEFINITIVE_CODES = new Set([
  'access_denied',
  'invalid_grant',
  'consent_required',
  'interaction_required',
  'login_required',
  'admin_policy_enforced',
  'unauthorized_client',
  'invalid_client',
  'invalid_scope',
]);

class TokenRenewError extends Error {
  code: string;
  transient: boolean;
  constructor(message: string, code: string, transient: boolean) {
    super(message);
    this.name = 'TokenRenewError';
    this.code = code;
    this.transient = transient;
  }
}

/**
 * Anything not on the definitive list is treated as transient. That asymmetry is
 * deliberate: wrongly retrying costs a background request, wrongly latching
 * "Reconnect" silently stops backups until the user notices.
 */
function classify(code: string, message: string): TokenRenewError {
  return new TokenRenewError(message, code, !DEFINITIVE_CODES.has(code));
}

function asRenewError(err: unknown): TokenRenewError {
  if (err instanceof TokenRenewError) return err;
  const message = (err as any)?.message || 'Unknown error renewing Google Drive access.';
  return new TokenRenewError(message, 'unknown', true);
}

// 30s, 1m, 2m, 4m, 8m, then capped. Long enough not to spam GIS on every focus,
// short enough that a session recovers within one gym visit.
const RENEW_BACKOFF_STEPS_MS = [30_000, 60_000, 120_000, 240_000, 480_000];
const RENEW_BACKOFF_CAP_MS = 15 * 60 * 1000;

function writeRenewDiagnostic(diag: RenewDiagnostic) {
  try {
    localStorage.setItem(STORAGE_KEY_RENEW_DIAG, JSON.stringify(diag));
  } catch {
    /* storage unavailable */
  }
}

function recordRenewSuccess() {
  writeRenewDiagnostic({
    at: Date.now(),
    ok: true,
    code: 'ok',
    message: 'Access renewed silently.',
    transient: false,
    consecutiveFailures: 0,
  });
  localStorage.removeItem(STORAGE_KEY_NEXT_RENEW_MS);
}

function recordRenewFailure(err: TokenRenewError) {
  const previous = readRenewDiagnostic();
  const consecutiveFailures = (previous && !previous.ok ? previous.consecutiveFailures : 0) + 1;

  writeRenewDiagnostic({
    at: Date.now(),
    ok: false,
    code: err.code,
    message: err.message,
    transient: err.transient,
    consecutiveFailures,
  });

  if (err.transient) {
    const step =
      RENEW_BACKOFF_STEPS_MS[Math.min(consecutiveFailures - 1, RENEW_BACKOFF_STEPS_MS.length - 1)] ??
      RENEW_BACKOFF_CAP_MS;
    localStorage.setItem(
      STORAGE_KEY_NEXT_RENEW_MS,
      String(Date.now() + Math.min(step, RENEW_BACKOFF_CAP_MS))
    );
  }
}

function renewBackoffActive(): boolean {
  const next = Number(localStorage.getItem(STORAGE_KEY_NEXT_RENEW_MS) || '0');
  return next > Date.now();
}

/** Lets the Settings UI react when a background sync changes connection state. */
export const GDRIVE_STATUS_EVENT = 'kfit-gdrive-status';

function notifyStatusChanged() {
  try {
    window.dispatchEvent(new CustomEvent(GDRIVE_STATUS_EVENT));
  } catch {
    /* non-browser context */
  }
}

// --- Google Identity Services -------------------------------------------------

declare global {
  interface Window {
    google?: any;
  }
}

let gisLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoadPromise = null;
      reject(
        new TokenRenewError(
          'Could not reach Google sign-in. Check your connection.',
          'script_load_failed',
          true
        )
      );
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

let tokenClient: any = null;
/** Resolver for the in-flight token request; GIS reports results via callback. */
let pendingTokenRequest: {
  resolve: (token: string) => void;
  reject: (err: Error) => void;
} | null = null;

async function getTokenClient(clientId?: string) {
  await loadGisScript();
  if (tokenClient) return tokenClient;

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId || DEFAULT_CLIENT_ID,
    scope: SCOPES,
    callback: (response: any) => {
      const pending = pendingTokenRequest;
      pendingTokenRequest = null;
      if (!pending) return;

      if (response.error || !response.access_token) {
        const code = String(response.error || 'no_token_returned');
        pending.reject(
          classify(code, response.error_description || `Google returned "${code}".`)
        );
        return;
      }

      localStorage.setItem(STORAGE_KEY_TOKEN, response.access_token);
      // expires_in is seconds (typically 3600).
      const expiresInMs = (Number(response.expires_in) || 3600) * 1000;
      localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRY, String(Date.now() + expiresInMs));
      localStorage.setItem(STORAGE_KEY_LINKED, 'true');
      markHealthy();
      pending.resolve(response.access_token);
    },
    error_callback: (err: any) => {
      const pending = pendingTokenRequest;
      pendingTokenRequest = null;
      // GIS reports `type` here: popup_failed_to_open (blocked, because a silent
      // renew is not a user gesture), popup_closed, or unknown. None of these
      // mean the grant is gone, so all classify as transient.
      const code = String(err?.type || 'unknown');
      pending?.reject(classify(code, err?.message || `Authorization did not complete (${code}).`));
    },
  });

  return tokenClient;
}

/**
 * Requests an access token.
 * `interactive: false` renews silently in a hidden iframe using the existing
 * Google session — this is what keeps the link alive across the hourly token
 * expiry without dragging the user through the consent screen again.
 */
async function requestToken(interactive: boolean, clientId?: string): Promise<string> {
  const client = await getTokenClient(clientId);

  if (pendingTokenRequest) {
    throw new TokenRenewError(
      'A Google Drive authorization is already in progress.',
      'request_in_flight',
      true
    );
  }

  return new Promise<string>((resolve, reject) => {
    // A silent renew that stalls (blocked third-party cookies, signed-out
    // session) never invokes either callback, so bound the wait.
    const timeoutId = window.setTimeout(() => {
      if (pendingTokenRequest) {
        pendingTokenRequest = null;
        reject(
          new TokenRenewError(
            'Google Drive did not respond in time.',
            'timeout',
            true
          )
        );
      }
    }, interactive ? 120_000 : 15_000);

    pendingTokenRequest = {
      resolve: (token) => {
        window.clearTimeout(timeoutId);
        resolve(token);
      },
      reject: (err) => {
        window.clearTimeout(timeoutId);
        reject(err);
      },
    };

    try {
      client.requestAccessToken({
        // Empty prompt = no UI when the grant is still valid.
        //
        // Re-linking an account that Google has already granted must NOT force
        // 'consent': that re-runs the whole account-picker + consent screen
        // every time, which is what made sign-in feel like a daily chore. Only
        // a genuinely first-time link needs the consent screen.
        prompt: interactive && localStorage.getItem(STORAGE_KEY_LINKED) !== 'true' ? 'consent' : '',
      });
    } catch (err: any) {
      window.clearTimeout(timeoutId);
      pendingTokenRequest = null;
      reject(
        new TokenRenewError(
          err?.message || 'Could not start Google authorization.',
          'request_failed',
          true
        )
      );
    }
  });
}

function getCachedToken(): string | null {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  const expiry = Number(localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY) || '0');
  if (!token) return null;
  if (Date.now() + TOKEN_REFRESH_MARGIN_MS >= expiry) return null;
  return token;
}

/**
 * Returns a usable access token, renewing silently when the cached one is
 * expired or about to expire. Throws (and flags re-auth) if renewal needs the user.
 */
export async function getValidAccessToken(forceRenew = false): Promise<string> {
  if (localStorage.getItem(STORAGE_KEY_LINKED) !== 'true') {
    throw new Error('Google Drive is not linked. Please connect your account first.');
  }

  if (!forceRenew) {
    const cached = getCachedToken();
    if (cached) return cached;
  }

  try {
    const token = await requestToken(false);
    recordRenewSuccess();
    // A successful silent renew clears any stale "reconnect" state.
    markHealthy();
    return token;
  } catch (err) {
    // Being offline is not a broken grant — don't nag the user to reconnect
    // over a dropped signal in the gym.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const renewErr = offline
      ? new TokenRenewError(
          'No connection — Google Drive backup will retry when you are back online.',
          'offline',
          true
        )
      : asRenewError(err);

    recordRenewFailure(renewErr);

    // Only a definitive signal parks the UI on "Reconnect". A timeout, a blocked
    // popup, or a dropped connection used to latch that flag permanently, which
    // is what made the link look like it broke every day.
    if (!renewErr.transient) {
      markNeedsReauth(
        `Google Drive access needs to be renewed (${renewErr.code}). Tap Reconnect to resume backups.`
      );
      throw new Error(`Google Drive access was revoked or expired (${renewErr.code}).`);
    }

    setSyncError(`Could not renew Google Drive access (${renewErr.code}). Will retry automatically.`);
    notifyStatusChanged();
    throw renewErr;
  }
}

/** Interactive link/re-link. Must be called from a user gesture. */
export async function initiateGoogleDriveAuth(clientId?: string): Promise<string> {
  const token = await requestToken(true, clientId);
  recordRenewSuccess();
  markHealthy();
  await fetchAndStoreUserEmail(token);
  return token;
}

async function fetchAndStoreUserEmail(token: string) {
  // drive.file does not grant profile scope; the Drive "about" endpoint returns
  // the account email for the granted Drive access.
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const json = await res.json();
    const email = json?.user?.emailAddress;
    if (email) localStorage.setItem(STORAGE_KEY_USER, email);
  } catch {
    /* email is cosmetic — never block linking on it */
  }
}

export function disconnectGoogleDrive() {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (token && window.google?.accounts?.oauth2) {
    // Actually revoke rather than just forgetting the token locally.
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch {
      /* revocation is best-effort */
    }
  }

  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
  localStorage.removeItem(STORAGE_KEY_USER);
  localStorage.removeItem(STORAGE_KEY_LAST_BACKUP);
  localStorage.removeItem(STORAGE_KEY_LAST_BACKUP_MS);
  localStorage.removeItem(STORAGE_KEY_LINKED);
  localStorage.removeItem(STORAGE_KEY_NEEDS_REAUTH);
  localStorage.removeItem(STORAGE_KEY_LAST_ERROR);
  localStorage.removeItem(STORAGE_KEY_RENEW_DIAG);
  localStorage.removeItem(STORAGE_KEY_NEXT_RENEW_MS);
  localStorage.setItem('kfit_gdrive_autobackup', 'false');
  notifyStatusChanged();
}

export function setAutoBackupEnabled(enabled: boolean) {
  localStorage.setItem('kfit_gdrive_autobackup', enabled ? 'true' : 'false');
}

/**
 * Single choke point for Drive API calls: attaches a fresh token and, on a 401,
 * renews once and retries before giving up. Previously a 401 dropped the token
 * on the floor with no retry and no user-visible signal.
 */
async function driveFetch(url: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  const token = await getValidAccessToken(isRetry);

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401 && !isRetry) {
    return driveFetch(url, init, true);
  }

  if (res.status === 401) {
    markNeedsReauth('Google Drive access was revoked or expired. Please reconnect.');
    throw new Error('Google Drive session expired. Please re-connect your account.');
  }

  return res;
}

/**
 * Uploads the current CSV backup to the user's Google Drive inside the
 * 'kfit_backups' folder, then purges all but the 7 most recent backups.
 */
export async function uploadBackupToGoogleDrive(): Promise<{ filename: string; fileId: string }> {
  const csvData = await exportWorkoutCSV();
  const dateStr = todayISO();
  const filename = `kfit_export_${dateStr}.csv`;

  const folderId = await getOrCreateBackupFolder();

  const metadata = {
    name: filename,
    mimeType: 'text/csv',
    parents: folderId ? [folderId] : [],
  };

  // Randomised so a boundary string can never collide with CSV contents and
  // truncate the upload.
  const boundary = `kfit_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: text/csv\r\n\r\n' +
    csvData +
    closeDelimiter;

  const res = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipartRequestBody,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    setSyncError(`Backup failed (${res.status}).`);
    notifyStatusChanged();
    throw new Error(`Google Drive API error (${res.status}): ${errText}`);
  }

  const fileJson = await res.json();

  // Verify before the cleanup pass is allowed to delete anything. A truncated
  // or empty upload still returns 200, and deleting older backups on the
  // strength of a bad one is how a backup system loses data.
  const expectedBytes = new Blob([csvData]).size;
  try {
    const check = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${fileJson.id}?fields=size`
    );
    if (check.ok) {
      const meta = await check.json();
      const actual = Number(meta.size);
      if (Number.isFinite(actual) && actual !== expectedBytes) {
        setSyncError('Backup upload looked incomplete — older backups were kept.');
        notifyStatusChanged();
        throw new Error(
          `Backup verification failed: uploaded ${actual} bytes, expected ${expectedBytes}.`
        );
      }
    }
  } catch (err: any) {
    if (err?.message?.startsWith('Backup verification failed')) throw err;
    // A failed verification request is not proof of a bad upload; carry on but
    // skip the destructive cleanup below.
    console.warn('Could not verify backup upload:', err);
  }

  const nowMs = Date.now();
  const nowDisplay =
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) +
    ', ' +
    new Date().toLocaleDateString();

  localStorage.setItem(STORAGE_KEY_LAST_BACKUP, nowDisplay);
  localStorage.setItem(STORAGE_KEY_LAST_BACKUP_MS, String(nowMs));
  markHealthy();

  await cleanUpOldBackups(folderId, MAX_BACKUPS_TO_RETAIN);

  return { filename, fileId: fileJson.id };
}

async function cleanUpOldBackups(folderId: string | null, keepCount = MAX_BACKUPS_TO_RETAIN) {
  if (!folderId) return;

  try {
    const searchUrl =
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `'${folderId}' in parents and trashed = false`
      )}&orderBy=createdTime desc&fields=files(id, name, createdTime)`;

    const res = await driveFetch(searchUrl);
    if (!res.ok) return;

    const data = await res.json();
    const files = data.files || [];

    // Retain by distinct calendar day, not by file count. Drive allows
    // duplicate filenames, so several manual backups in one day used to evict
    // every genuinely older backup and collapse the window to a single day.
    const seenDays = new Set<string>();
    const doomed: Array<{ id: string; name: string }> = [];

    for (const f of files) {
      const day = String(f.createdTime || '').split('T')[0];
      if (seenDays.size < keepCount || seenDays.has(day)) {
        seenDays.add(day);
        continue;
      }
      doomed.push(f);
    }

    for (const f of doomed) {
      // Trash, not permanent delete: a mistake here is otherwise unrecoverable.
      await driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
      console.log(`Smart Cleanup: Trashed old Google Drive backup ${f.name} (${f.id})`);
    }
  } catch (e) {
    // Cleanup is housekeeping — never fail a successful backup over it.
    console.warn('Smart backup cleanup error:', e);
  }
}

async function getOrCreateBackupFolder(): Promise<string | null> {
  try {
    const searchRes = await driveFetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        "name = 'kfit_backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
      )}`
    );

    if (searchRes.ok) {
      const searchJson = await searchRes.json();
      if (searchJson.files && searchJson.files.length > 0) {
        return searchJson.files[0].id;
      }
    }

    const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'kfit_backups',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (createRes.ok) {
      const folderJson = await createRes.json();
      return folderJson.id;
    }
  } catch (e) {
    console.warn('Could not query/create kfit_backups folder, uploading to root:', e);
    throw e;
  }
  return null;
}

/**
 * Renews the access token, but only when a backup is actually close to due.
 *
 * This used to renew on every app start and every window focus the moment the
 * hourly token lapsed. With backups running daily that meant ~20 pointless
 * token requests a day, and each one is a chance for GIS to decide it needs the
 * user — which is why sign-in kept reappearing, sometimes more than once a day.
 * Nothing needs a token until a backup runs, so don't ask for one until then.
 *
 * Safe to call on app start and on tab focus.
 */
export async function ensureDriveSessionFresh() {
  const status = getStoredGDriveStatus();
  if (!status.isConnected || status.needsReauth) return;
  if (getCachedToken()) return;
  // A previous transient failure asked us to wait before trying again. Unlike
  // the old behaviour this expires on its own — it never permanently gives up.
  if (renewBackoffActive()) return;
  if (!status.autoBackupEnabled) return;

  // Within an hour of the next scheduled backup is close enough: a token lives
  // an hour, so renewing now means the backup will not stall on auth.
  const lastBackupMs = Number(localStorage.getItem(STORAGE_KEY_LAST_BACKUP_MS) || '0');
  const msUntilDue = lastBackupMs + TWENTY_FOUR_HOURS_MS - Date.now();
  if (msUntilDue > 60 * 60 * 1000) return;

  try {
    await getValidAccessToken();
  } catch {
    // getValidAccessToken already recorded the outcome and notified the UI.
  }
}

/**
 * Trigger background auto-backup if enabled (24-hour daily frequency).
 * Returns true when a backup was uploaded.
 */
export async function triggerAutoBackupIfEnabled(force = false): Promise<boolean> {
  const status = getStoredGDriveStatus();
  if (!status.isConnected || !status.autoBackupEnabled) return false;

  if (status.needsReauth && !force) return false;

  const lastBackupMs = Number(localStorage.getItem(STORAGE_KEY_LAST_BACKUP_MS) || '0');
  const now = Date.now();

  if (!force && now - lastBackupMs < TWENTY_FOUR_HOURS_MS) {
    const hoursLeft = ((TWENTY_FOUR_HOURS_MS - (now - lastBackupMs)) / (1000 * 60 * 60)).toFixed(1);
    console.log(`Auto-backup skipped: Next daily sync in ${hoursLeft} hours.`);
    return false;
  }

  try {
    await uploadBackupToGoogleDrive();
    console.log('24-hour daily auto-backup to Google Drive completed successfully.');
    return true;
  } catch (e: any) {
    // Record it so Settings can show what happened. This used to be a bare
    // console.warn, which is why the broken link went unnoticed.
    console.warn('Auto-backup background sync warning:', e);
    setSyncError(e?.message || 'Automatic backup failed.');
    notifyStatusChanged();
    return false;
  }
}
