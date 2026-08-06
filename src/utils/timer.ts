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
    const now = ctx.currentTime;

    const freqs = [659.25, 830.61, 987.77];
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.12);

      gain.gain.setValueAtTime(0, now + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.25, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.12 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.35);
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
      navigator.vibrate([300, 150, 300, 150, 500]);
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

export async function showTimerNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const options: NotificationOptions = {
    body,
    icon: '/kfit/pwa-192.png',
    badge: '/kfit/pwa-192.png',
    tag: 'kfit-rest-timer',
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
