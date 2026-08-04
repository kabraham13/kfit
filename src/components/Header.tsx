import React from 'react';
import { Dumbbell, Settings, Calendar, ChevronLeft, ChevronRight, Bell, Pause, Play, X } from 'lucide-react';

interface HeaderProps {
  activeTab: 'workout' | 'library' | 'history' | 'settings';
  setActiveTab: (tab: 'workout' | 'library' | 'history' | 'settings') => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  timerSecondsLeft: number | null;
  isTimerActive: boolean;
  onPauseToggleTimer: () => void;
  onCloseTimer: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  selectedDate,
  setSelectedDate,
  timerSecondsLeft,
  isTimerActive,
  onPauseToggleTimer,
  onCloseTimer
}) => {
  const shiftDate = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  const formatDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatTimerTime = (secs: number) => {
    const m = Math.floor(Math.max(0, secs) / 60);
    const s = Math.max(0, secs) % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <header className="sticky top-0 z-30 bg-[#090a0f]/95 backdrop-blur-md border-b border-surfaceBorder">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Dumbbell className="w-5 h-5 text-white transform -rotate-45" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white">
            kfit
          </h1>
        </div>

        {/* Date Navigator (Shown when on workout log view) */}
        {activeTab === 'workout' && (
          <div className="flex items-center bg-surface border border-surfaceBorder rounded-xl p-1">
            <button
              onClick={() => shiftDate(-1)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <label className="relative flex items-center gap-1.5 px-2 cursor-pointer text-xs sm:text-sm font-semibold text-slate-200 hover:text-brand-400 transition">
              <Calendar className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <span>{isToday ? 'Today' : formatDateDisplay(selectedDate)}</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>

            <button
              onClick={() => shiftDate(1)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Settings Icon Button in Top Right */}
        <button
          onClick={() => setActiveTab(activeTab === 'settings' ? 'workout' : 'settings')}
          className={`p-2.5 rounded-xl border transition shadow-md ${
            activeTab === 'settings'
              ? 'bg-brand-600 border-brand-500 text-white shadow-brand-600/30'
              : 'bg-surface border-surfaceBorder text-slate-400 hover:text-white hover:border-slate-700'
          }`}
          title="Settings & Backup"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Active Rest Timer Top Bar (Ticking down when navigating outside or back) */}
      {timerSecondsLeft !== null && (
        <div className="bg-[#12141d] border-t border-brand-500/30 px-4 py-2 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 font-bold text-white">
            <Bell className="w-4 h-4 text-brand-400 animate-pulse" />
            <span className="text-slate-400 uppercase tracking-wider text-[10px]">Rest Timer:</span>
            <span className="text-sm font-black text-brand-400 font-mono">
              {formatTimerTime(timerSecondsLeft)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onPauseToggleTimer}
              className={`p-1 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                isTimerActive
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {isTimerActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isTimerActive ? 'Pause' : 'Resume'}</span>
            </button>

            <button
              onClick={onCloseTimer}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              title="Dismiss Timer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
