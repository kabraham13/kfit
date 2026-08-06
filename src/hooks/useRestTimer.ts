import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearTimerNotification,
  playRestTimerChime,
  primeAudio,
  requestNotificationPermission,
  showOngoingTimerNotification,
  showTimerNotification,
  startBackgroundKeepAlive,
  stopBackgroundKeepAlive,
  triggerTimerVibration,
} from '../utils/timer';

const STORAGE_KEY = 'kfit.restTimer';

interface PersistedTimer {
  total: number;
  /** Epoch ms the timer fires at. Null while paused. */
  endsAt: number | null;
  /** Seconds remaining while paused. Null while running. */
  remaining: number | null;
  fired: boolean;
}

function readPersisted(): PersistedTimer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedTimer) : null;
  } catch {
    return null;
  }
}

function writePersisted(state: PersistedTimer | null) {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — timer still works for this session */
  }
}

export function useRestTimer(defaultTimerSec: number) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number>(defaultTimerSec);
  const [isActive, setIsActive] = useState<boolean>(false);

  // Deadline is the source of truth: the countdown is computed from the wall
  // clock, so a frozen/throttled background tab still shows the correct time
  // the moment it is resumed.
  const endsAtRef = useRef<number | null>(null);
  const firedRef = useRef<boolean>(false);
  const totalRef = useRef<number>(defaultTimerSec);
  // Last value pushed to the ongoing notification, so we re-post once per
  // second rather than on every 250ms tick.
  const lastNotifiedSecondRef = useRef<number | null>(null);

  const persist = useCallback((remaining: number | null) => {
    writePersisted({
      total: totalRef.current,
      endsAt: endsAtRef.current,
      remaining,
      fired: firedRef.current,
    });
  }, []);

  const fireAlert = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    playRestTimerChime();
    triggerTimerVibration();
    void showTimerNotification('Rest Timer Complete! 🔔', 'Time for your next set!');
    stopBackgroundKeepAlive();
  }, []);

  /** Recompute the display from the deadline; fire the alert if we passed it. */
  const sync = useCallback(() => {
    const endsAt = endsAtRef.current;
    if (endsAt === null) return;
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));

    if (remaining === 0) {
      fireAlert();
      setIsActive(false);
      endsAtRef.current = null;
      lastNotifiedSecondRef.current = null;
      // Clear rather than parking at 0:00 — a finished timer offering "Resume"
      // and "Stop" is just clutter above the log. The chime, vibration and
      // notification have already fired.
      setSecondsLeft(null);
      writePersisted(null);
      return;
    }

    setSecondsLeft(remaining);

    // Keep the lock-screen countdown current while the app is in the
    // background. Pointless while the app is on screen, where the overlay
    // already shows the time.
    if (document.hidden && remaining !== lastNotifiedSecondRef.current) {
      lastNotifiedSecondRef.current = remaining;
      void showOngoingTimerNotification(remaining);
    }
  }, [fireAlert, persist]);

  // Restore an in-flight timer after a reload or an app cold start.
  useEffect(() => {
    const saved = readPersisted();
    if (!saved) return;

    totalRef.current = saved.total;
    setTotalSeconds(saved.total);
    firedRef.current = saved.fired;

    if (saved.endsAt !== null) {
      const remaining = Math.ceil((saved.endsAt - Date.now()) / 1000);
      if (remaining > 0) {
        endsAtRef.current = saved.endsAt;
        setSecondsLeft(remaining);
        setIsActive(true);
        return;
      }
      // Expired while we were away — a finished timer is not shown at all.
      writePersisted(null);
      return;
    }

    if (saved.remaining !== null) setSecondsLeft(saved.remaining);
  }, []);

  // Ticking only drives the display. A throttled tick is harmless because each
  // tick recomputes from the deadline rather than decrementing a counter.
  useEffect(() => {
    if (!isActive || endsAtRef.current === null) return;
    sync();
    const id = setInterval(sync, 250);
    return () => clearInterval(id);
  }, [isActive, sync]);

  // The decisive fix for "the timer died while I was in another app": re-sync
  // the instant the page becomes visible again, and on the events Android/iOS
  // fire when returning to a backgrounded PWA.
  useEffect(() => {
    const onWake = () => {
      if (endsAtRef.current !== null) sync();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        // Post the countdown immediately on leaving, so it is on the lock
        // screen right away rather than up to a second later.
        if (endsAtRef.current !== null) sync();
        return;
      }
      // Back in the app — the overlay takes over, so retire the notification.
      lastNotifiedSecondRef.current = null;
      void clearTimerNotification();
      onWake();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);
    window.addEventListener('resume', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
      window.removeEventListener('resume', onWake);
    };
  }, [sync]);

  useEffect(() => stopBackgroundKeepAlive, []);

  const start = useCallback(
    (sec?: number) => {
      const duration = sec || defaultTimerSec;

      // Both of these need the user gesture that got us here: audio must be
      // unlocked before it can play from the background, and Android only shows
      // the permission prompt in response to a tap.
      primeAudio();
      void requestNotificationPermission();

      totalRef.current = duration;
      firedRef.current = false;
      endsAtRef.current = Date.now() + duration * 1000;

      setTotalSeconds(duration);
      setSecondsLeft(duration);
      setIsActive(true);
      startBackgroundKeepAlive();
      persist(null);
    },
    [defaultTimerSec, persist]
  );

  const pauseToggle = useCallback(() => {
    if (isActive) {
      const remaining =
        endsAtRef.current !== null
          ? Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000))
          : secondsLeft ?? 0;
      endsAtRef.current = null;
      setSecondsLeft(remaining);
      setIsActive(false);
      stopBackgroundKeepAlive();
      persist(remaining);
      lastNotifiedSecondRef.current = null;
      if (document.hidden) void showOngoingTimerNotification(remaining, true);
      else void clearTimerNotification();
    } else {
      const remaining = secondsLeft ?? totalRef.current;
      if (remaining <= 0) return;
      firedRef.current = false;
      endsAtRef.current = Date.now() + remaining * 1000;
      setIsActive(true);
      primeAudio();
      startBackgroundKeepAlive();
      persist(null);
    }
  }, [isActive, secondsLeft, persist]);

  const reset = useCallback(() => {
    firedRef.current = false;
    endsAtRef.current = Date.now() + totalRef.current * 1000;
    setSecondsLeft(totalRef.current);
    setIsActive(true);
    primeAudio();
    startBackgroundKeepAlive();
    persist(null);
  }, [persist]);

  const addSeconds = useCallback(
    (sec: number) => {
      if (secondsLeft === null) return;
      const updated = Math.max(0, secondsLeft + sec);
      totalRef.current = Math.max(totalRef.current, updated);
      setTotalSeconds(totalRef.current);
      setSecondsLeft(updated);

      if (isActive) {
        firedRef.current = updated > 0 ? false : firedRef.current;
        endsAtRef.current = Date.now() + updated * 1000;
        persist(null);
      } else {
        persist(updated);
      }
    },
    [secondsLeft, isActive, persist]
  );

  const close = useCallback(() => {
    endsAtRef.current = null;
    firedRef.current = false;
    lastNotifiedSecondRef.current = null;
    setIsActive(false);
    setSecondsLeft(null);
    stopBackgroundKeepAlive();
    void clearTimerNotification();
    writePersisted(null);
  }, []);

  // Keep the restored default in sync if settings load after mount.
  useEffect(() => {
    if (secondsLeft === null && !isActive) {
      totalRef.current = defaultTimerSec;
      setTotalSeconds(defaultTimerSec);
    }
  }, [defaultTimerSec]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    secondsLeft,
    totalSeconds,
    isActive,
    start,
    pauseToggle,
    reset,
    addSeconds,
    close,
  };
}
