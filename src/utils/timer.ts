// Shared AudioContext. Creating a new one per chime leaks contexts (browsers cap
// them at ~6 per page) and a fresh context starts suspended when the page is
// backgrounded, so the chime never sounds. One context, resumed on user gesture.
let audioCtx: AudioContext | null = null;
let chimeAudioEl: HTMLAudioElement | null = null;

/**
 * Mix with whatever else is playing instead of taking audio focus.
 *
 * Without this Android treats the app as a media player: starting a rest timer
 * ducked the user's music for the whole set, and the completion chime paused it
 * outright. "ambient" tells the platform this is incidental audio — no ducking,
 * no pause, no media-session takeover.
 */
function configureAudioSession() {
  try {
    const session = (navigator as any).audioSession;
    if (session && session.type !== 'ambient') session.type = 'ambient';
  } catch {
    /* Audio Session API unsupported — the WebAudio path below still mixes */
  }
}

function getAudioContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    configureAudioSession();
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch (err) {
    console.warn('AudioContext unavailable:', err);
    return null;
  }
}

/**
 * Call from a user gesture (e.g. tapping "start timer") to unlock audio on mobile.
 *
 * Deliberately WebAudio-only. Priming the HTML5 element with a silent play/pause
 * cycle grabbed Android's audio focus at the moment the timer started, which is
 * exactly what made the user's music dim for the whole rest period.
 */
export function primeAudio() {
  getAudioContext();
}

export async function playRestTimerChime() {
  // 1. Primary: WebAudio synthesiser. It mixes with other apps' audio rather
  // than requesting exclusive focus, so music keeps playing underneath.
  if (await playSynthesisedChime()) return;

  // 2. Fallback only: an HTML5 element does interrupt other audio on Android,
  // but a chime that pauses Spotify still beats no chime at all. Reached when
  // the AudioContext could not be resumed (typically a long screen-off period).
  try {
    configureAudioSession();
    if (!chimeAudioEl) {
      chimeAudioEl = new Audio('/kfit/chime.wav');
    }
    chimeAudioEl.volume = 1.0;
    chimeAudioEl.currentTime = 0;
    await chimeAudioEl.play();
  } catch (err) {
    console.warn('HTML5 chime playback failed:', err);
  }
}

/** Returns false if WebAudio could not produce sound, so the caller can fall back. */
async function playSynthesisedChime(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    // A suspended context accepts scheduling calls silently and plays nothing,
    // so check rather than assume the resume worked.
    if (ctx.state !== 'running') return false;

    const start = ctx.currentTime;

    const bursts = [
      { delay: 0.0, freqs: [659.25, 830.61, 987.77] },
      { delay: 0.75, freqs: [659.25, 830.61, 987.77, 1318.51] },
      { delay: 1.5, freqs: [830.61, 987.77, 1318.51] },
    ];

    bursts.forEach((burst) => {
      burst.freqs.forEach((freq, noteIdx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        const noteTime = start + burst.delay + noteIdx * 0.1;

        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0, noteTime);
        gain.gain.linearRampToValueAtTime(0.3, noteTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.55);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteTime);
        osc.stop(noteTime + 0.6);
      });
    });
    return true;
  } catch (err) {
    console.warn('Audio chime playback error:', err);
    return false;
  }
}

// Opt-in background keep-alive.
//
// Android freezes the page and suspends WebAudio once the screen has been off
// for a while, so the chime cannot fire from here — only the service worker's
// notification gets through. Holding a silent looping audio element keeps the
// page awake and the chime reliable, at the cost of holding audio focus for the
// whole rest period, which dims other apps' music. That trade is the user's to
// make, so this runs only when they enable it in Settings.
const SILENT_WAV_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let silentAudioEl: HTMLAudioElement | null = null;

function getKeepAliveElement(): HTMLAudioElement | null {
  try {
    configureAudioSession();
    if (!silentAudioEl) {
      silentAudioEl = new Audio(SILENT_WAV_URI);
      silentAudioEl.loop = true;
      silentAudioEl.volume = 0.0001;
    }
    return silentAudioEl;
  } catch (err) {
    console.warn('Keep-alive audio unavailable:', err);
    return null;
  }
}

/**
 * Unlock the keep-alive element during the user gesture that starts the timer.
 *
 * The keep-alive itself is not started until the screen goes off, and by then
 * there is no gesture to authorise playback. Priming it here — a play/pause on a
 * silent element — buys the permission up front so the later start succeeds.
 */
export function primeBackgroundKeepAlive() {
  const el = getKeepAliveElement();
  if (!el) return;
  void el
    .play()
    .then(() => {
      el.pause();
      el.currentTime = 0;
    })
    .catch(() => {});
}

export function startBackgroundKeepAlive() {
  const el = getKeepAliveElement();
  if (!el) return;
  void el.play().catch(() => {});
}

export function stopBackgroundKeepAlive() {
  if (!silentAudioEl) return;
  try {
    silentAudioEl.pause();
    silentAudioEl.currentTime = 0;
  } catch (err) {
    console.warn('Keep-alive audio stop error:', err);
  }
}

export function triggerTimerVibration() {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([400, 200, 400, 200, 400, 200, 600]);
    } catch (e) {
      console.warn('Vibration API error:', e);
    }
  }
}

/**
 * Ask for notification permission. Must be triggered by a user gesture on
 * Android/iOS, so this is called when a rest timer is started rather than on load.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch (err) {
    console.warn('Notification permission error:', err);
    return false;
  }
}

// The live countdown and the completion alert must not share a tag. Android
// treats a same-tag post as an *update* to an existing notification, and an
// update to a notification that was created silent stays silent — which is why
// the "Rest Timer Complete" alert made no sound. Separate tags mean the
// completion alert is a genuinely new notification and gets the full treatment.
const ONGOING_NOTIFICATION_TAG = 'kfit-rest-timer';
const DONE_NOTIFICATION_TAG = 'kfit-rest-timer-done';

function formatClock(secs: number) {
  const m = Math.floor(Math.max(0, secs) / 60);
  const s = Math.max(0, secs) % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Live countdown on the lock screen while the app is backgrounded.
 *
 * The web has no self-ticking chronometer notification, so this re-posts under a
 * fixed tag, which replaces the existing notification in place. `silent` and
 * `renotify: false` keep it from buzzing on every update — only the completion
 * notification is allowed to make noise.
 */
export async function showOngoingTimerNotification(secondsLeft: number, isPaused = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  const options = {
    body: isPaused ? 'Rest timer paused' : 'Resting — tap to return to your workout',
    icon: '/kfit/pwa-192.png',
    badge: '/kfit/badge-96.png',
    tag: ONGOING_NOTIFICATION_TAG,
    renotify: false,
    requireInteraction: true,
    silent: true,
  } as NotificationOptions;

  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(`${formatClock(secondsLeft)} remaining`, options);
  } catch (err) {
    console.warn('Ongoing timer notification error:', err);
  }
}

async function clearOngoingNotification() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.getNotifications({ tag: ONGOING_NOTIFICATION_TAG });
    existing.forEach((n) => n.close());
  } catch (err) {
    console.warn('Could not clear ongoing timer notification:', err);
  }
}

export async function clearTimerNotification() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    for (const tag of [ONGOING_NOTIFICATION_TAG, DONE_NOTIFICATION_TAG]) {
      const existing = await reg.getNotifications({ tag });
      existing.forEach((n) => n.close());
    }
  } catch (err) {
    console.warn('Could not clear timer notification:', err);
  }
}

export async function showTimerNotification(
  title: string,
  body: string,
  prefs: { sound?: boolean; vibration?: boolean } = {}
) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const { sound = true, vibration = true } = prefs;

  const options: NotificationOptions = {
    body,
    icon: '/kfit/pwa-192.png',
    badge: '/kfit/badge-96.png',
    tag: DONE_NOTIFICATION_TAG,
    renotify: true,
    requireInteraction: true,
    // Explicit: the countdown notification sets silent, and an unset value here
    // was being inherited as "no sound" on some Android builds. With the screen
    // off this notification is the only thing that can make a sound at all.
    silent: !sound,
    vibrate: vibration ? [300, 150, 300, 150, 500] : [],
  } as NotificationOptions;

  // Retire the silent countdown first, so the alert arrives as a new
  // notification rather than as a quiet update to the running one.
  await clearOngoingNotification();

  // Installed PWAs on Android only allow notifications through the service
  // worker registration — `new Notification()` throws there.
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return;
    }
  } catch (err) {
    console.warn('SW notification failed, falling back:', err);
  }

  try {
    new Notification(title, options);
  } catch (err) {
    console.warn('Notification error:', err);
  }
}

export async function scheduleServiceWorkerTimer(
  endsAt: number,
  prefs: { sound?: boolean; vibration?: boolean } = {}
) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active) {
      reg.active.postMessage({
        type: 'SCHEDULE_REST_TIMER',
        endsAt,
        sound: prefs.sound !== false,
        vibration: prefs.vibration !== false,
      });
    }
  } catch (err) {
    console.warn('Could not schedule SW timer:', err);
  }
}

export async function cancelServiceWorkerTimer() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active) {
      reg.active.postMessage({ type: 'CANCEL_REST_TIMER' });
    }
  } catch (err) {
    console.warn('Could not cancel SW timer:', err);
  }
}
