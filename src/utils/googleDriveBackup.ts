import { exportFitNotesCSV } from './csvHandler';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const STORAGE_KEY_TOKEN = 'kfit_gdrive_token';
const STORAGE_KEY_USER = 'kfit_gdrive_user';
const STORAGE_KEY_LAST_BACKUP = 'kfit_gdrive_last_backup';
const STORAGE_KEY_LAST_BACKUP_MS = 'kfit_gdrive_last_backup_ms';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const MAX_BACKUPS_TO_RETAIN = 7; // Keep rolling 7 most recent backups (1 week)

export interface GoogleDriveStatus {
  isConnected: boolean;
  userEmail?: string;
  lastBackupTime?: string;
  autoBackupEnabled: boolean;
}

export function getStoredGDriveStatus(): GoogleDriveStatus {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN);
  const userEmail = localStorage.getItem(STORAGE_KEY_USER) || undefined;
  const lastBackupTime = localStorage.getItem(STORAGE_KEY_LAST_BACKUP) || undefined;

  return {
    isConnected: !!token,
    userEmail,
    lastBackupTime,
    autoBackupEnabled: localStorage.getItem('kfit_gdrive_autobackup') === 'true'
  };
}

/**
 * Initializes Google OAuth2 Implicit Flow Popup for Client-side PWA
 */
export function initiateGoogleDriveAuth(clientId?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Baked-in default OAuth Client ID or user-provided Client ID
    const effectiveClientId =
      clientId ||
      (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
      '727165202795-3e4em19rp6c5neeos6sk92t5dv66i54r.apps.googleusercontent.com';

    const redirectUri = window.location.origin + window.location.pathname;

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(effectiveClientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&include_granted_scopes=true` +
      `&prompt=consent`;

    // Open auth popup window
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'GoogleDriveAuth',
      `width=${width},height=${height},top=${top},left=${left}`
    );

    if (!popup) {
      reject(new Error('Popup blocked! Please allow popups for kfit to link Google Drive.'));
      return;
    }

    // Interval listener for redirect hash
    const timer = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(timer);
          reject(new Error('Google Drive linking was cancelled.'));
          return;
        }

        if (popup.location.href.includes(redirectUri)) {
          const hash = popup.location.hash;
          if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.replace('#', '?'));
            const accessToken = params.get('access_token');
            if (accessToken) {
              localStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
              clearInterval(timer);
              popup.close();
              resolve(accessToken);
            }
          }
        }
      } catch (e) {
        // Cross-origin restriction until redirect URL matches
      }
    }, 500);
  });
}

export function disconnectGoogleDrive() {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
  localStorage.removeItem(STORAGE_KEY_LAST_BACKUP);
  localStorage.removeItem(STORAGE_KEY_LAST_BACKUP_MS);
  localStorage.setItem('kfit_gdrive_autobackup', 'false');
}

export function setAutoBackupEnabled(enabled: boolean) {
  localStorage.setItem('kfit_gdrive_autobackup', enabled ? 'true' : 'false');
}

/**
 * Uploads current FitNotes CSV backup directly to user's Google Drive inside 'kfit_backups' folder,
 * and automatically purges old backups past 7 days (rolling 1 week compaction).
 */
export async function uploadBackupToGoogleDrive(tokenOverride?: string): Promise<{ filename: string; fileId: string }> {
  const token = tokenOverride || localStorage.getItem(STORAGE_KEY_TOKEN);
  if (!token) {
    throw new Error('Google Drive is not linked. Please connect your account first.');
  }

  // Generate CSV backup
  const csvData = await exportFitNotesCSV();
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `FitNotes_Export_${dateStr}.csv`;

  // 1. Find or create 'kfit_backups' folder
  let folderId = await getOrCreateBackupFolder(token);

  // 2. Upload file via Google Drive Multipart REST API
  const metadata = {
    name: filename,
    mimeType: 'text/csv',
    parents: folderId ? [folderId] : []
  };

  const boundary = 'foo_bar_baz';
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

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: multipartRequestBody
  });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      throw new Error('Google Drive session expired. Please re-connect your account.');
    }
    const errText = await res.text();
    throw new Error(`Google Drive API error (${res.status}): ${errText}`);
  }

  const fileJson = await res.json();
  const nowMs = Date.now();
  const nowDisplay = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString();
  
  localStorage.setItem(STORAGE_KEY_LAST_BACKUP, nowDisplay);
  localStorage.setItem(STORAGE_KEY_LAST_BACKUP_MS, String(nowMs));

  // 3. Smart Compaction: Auto-purge files older than 7 most recent backups
  await cleanUpOldBackups(token, folderId, MAX_BACKUPS_TO_RETAIN);

  return {
    filename,
    fileId: fileJson.id
  };
}

async function cleanUpOldBackups(token: string, folderId: string | null, keepCount = MAX_BACKUPS_TO_RETAIN) {
  if (!folderId) return;

  try {
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `'${folderId}' in parents and trashed = false`
    )}&orderBy=createdTime desc&fields=files(id, name, createdTime)`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return;

    const data = await res.json();
    const files = data.files || [];

    if (files.length > keepCount) {
      const filesToDelete = files.slice(keepCount);
      for (const f of filesToDelete) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`Smart Cleanup: Purged old Google Drive backup ${f.name} (${f.id})`);
      }
    }
  } catch (e) {
    console.warn('Smart backup cleanup error:', e);
  }
}

async function getOrCreateBackupFolder(token: string): Promise<string | null> {
  try {
    // Search for existing kfit_backups folder
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        "name = 'kfit_backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
      )}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (searchRes.ok) {
      const searchJson = await searchRes.json();
      if (searchJson.files && searchJson.files.length > 0) {
        return searchJson.files[0].id;
      }
    }

    // Create kfit_backups folder if not found
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'kfit_backups',
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (createRes.ok) {
      const folderJson = await createRes.json();
      return folderJson.id;
    }
  } catch (e) {
    console.warn('Could not query/create kfit_backups folder, uploading to root:', e);
  }
  return null;
}

/**
 * Trigger background auto-backup if enabled (24-hour daily frequency)
 */
export async function triggerAutoBackupIfEnabled(force = false) {
  const status = getStoredGDriveStatus();
  if (!status.isConnected || !status.autoBackupEnabled) return;

  const lastBackupMs = Number(localStorage.getItem(STORAGE_KEY_LAST_BACKUP_MS) || '0');
  const now = Date.now();

  if (force || now - lastBackupMs >= TWENTY_FOUR_HOURS_MS) {
    try {
      await uploadBackupToGoogleDrive();
      console.log('24-hour daily auto-backup to Google Drive completed successfully.');
    } catch (e) {
      console.warn('Auto-backup background sync warning:', e);
    }
  } else {
    const hoursLeft = ((TWENTY_FOUR_HOURS_MS - (now - lastBackupMs)) / (1000 * 60 * 60)).toFixed(1);
    console.log(`Auto-backup skipped: Next daily sync in ${hoursLeft} hours.`);
  }
}
