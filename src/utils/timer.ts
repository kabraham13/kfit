// Shared AudioContext. Creating a new one per chime leaks contexts (browsers cap
// them at ~6 per page) and a fresh context starts suspended when the page is
// backgrounded, so the chime never sounds. One context, resumed on user gesture.
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch (err) {
    console.warn('AudioContext unavailable:', err);
    return null;
  }
}

/** Call from a user gesture (e.g. tapping "start timer") to unlock audio. */
export function primeAudio() {
  getAudioContext();
}

export function playRestTimerChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const start = ctx.currentTime;

    // 3 chime bursts spread over 2.5 seconds so the alert rings out clearly
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
  } catch (err) {
    console.warn('Audio chime playback error:', err);
  }
}

// Near-silent oscillator kept running while a rest timer is counting down.
// Chrome throttles background pages hard (timers clamped to once per minute, or
// frozen outright), but a page producing audio is exempt. WebAudio is used rather
// than an <audio> element so we mix with the user's music instead of stealing
// audio focus and pausing it.
let keepAliveNodes: { osc: OscillatorNode; gain: GainNode } | null = null;

export function startBackgroundKeepAlive() {
  if (keepAliveNodes) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(20, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    keepAliveNodes = { osc, gain };
  } catch (err) {
    console.warn('Keep-alive start error:', err);
  }
}

export function stopBackgroundKeepAlive() {
  if (!keepAliveNodes) return;
  try {
    keepAliveNodes.osc.stop();
    keepAliveNodes.osc.disconnect();
    keepAliveNodes.gain.disconnect();
  } catch (err) {
    console.warn('Keep-alive stop error:', err);
  }
  keepAliveNodes = null;
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

const TIMER_NOTIFICATION_TAG = 'kfit-rest-timer';

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
    tag: TIMER_NOTIFICATION_TAG,
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

export async function clearTimerNotification() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.getNotifications({ tag: TIMER_NOTIFICATION_TAG });
    existing.forEach((n) => n.close());
  } catch (err) {
    console.warn('Could not clear timer notification:', err);
  }
}

export async function showTimerNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const options: NotificationOptions = {
    body,
    icon: '/kfit/pwa-192.png',
    badge: '/kfit/badge-96.png',
    tag: TIMER_NOTIFICATION_TAG,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 150, 300, 150, 500],
  } as NotificationOptions;

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

export async function scheduleServiceWorkerTimer(endsAt: number) {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg.active) {
      reg.active.postMessage({ type: 'SCHEDULE_REST_TIMER', endsAt });
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
