import React from 'react';
import { Play, Pause, RotateCcw, X, Bell } from 'lucide-react';

interface RestTimerOverlayProps {
  secondsLeft: number;
  totalSeconds: number;
  isActive: boolean;
  onPauseToggle: () => void;
  onReset: () => void;
  onAddSeconds: (sec: number) => void;
  onClose: () => void;
}

export const RestTimerOverlay: React.FC<RestTimerOverlayProps> = ({
  secondsLeft,
  totalSeconds,
  isActive,
  onPauseToggle,
  onReset,
  onAddSeconds,
  onClose
}) => {
  const formatTime = (secs: number) => {
    const m = Math.floor(Math.max(0, secs) / 60);
    const s = Math.max(0, secs) % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = totalSeconds > 0 ? Math.min(100, Math.max(0, ((totalSeconds - secondsLeft) / totalSeconds) * 100)) : 0;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 px-4 md:left-auto md:right-6 md:bottom-6 md:w-96">
      <div className="bg-[#12141d]/95 backdrop-blur-md border border-brand-500/30 rounded-2xl p-4 shadow-2xl shadow-brand-500/10 transition-all duration-300">
        <div className="w-full bg-slate-800/60 rounded-full h-1.5 mb-3 overflow-hidden">
          <div
            className="bg-brand-500 h-full transition-all duration-1000 ease-linear rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Rest Timer</div>
              <div className="text-2xl font-black text-white font-mono">{formatTime(secondsLeft)}</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onAddSeconds(-15)}
              className="p-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg transition"
              title="-15 seconds"
            >
              -15s
            </button>
            <button
              onClick={() => onAddSeconds(30)}
              className="p-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg transition"
              title="+30 seconds"
            >
              +30s
            </button>

            <button
              onClick={onPauseToggle}
              className={`p-2.5 rounded-xl font-bold transition ${
                isActive
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
              }`}
            >
              {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>

            <button
              onClick={onReset}
              className="p-2.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition"
              title="Reset Timer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-300 rounded-lg transition"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
