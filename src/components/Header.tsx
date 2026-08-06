import React, { useState } from 'react';
import { Dumbbell, Settings, Calendar, ChevronLeft, ChevronRight, Bell, Pause, Play, Square } from 'lucide-react';
import { MonthCalendarModal } from './MonthCalendarModal';

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
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

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
    <header className="sticky top-0 z-30 bg-[#09090b]/95 backdrop-blur-md border-b border-zinc-800">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-md">
            <Dumbbell className="w-5 h-5 text-white transform -rotate-45" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white font-mono">
            kfit
          </h1>
        </div>

        {/* Date Navigator (Shown when on workout log view) */}
        {activeTab === 'workout' && (
          <div className="flex items-center bg-[#121215] border border-zinc-800 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => shiftDate(-1)}
              aria-label="Previous Day"
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsCalendarOpen(true)}
              aria-label="Open Month Calendar"
              className="flex items-center gap-1.5 px-2.5 text-xs sm:text-sm font-bold text-zinc-200 hover:text-brand-400 transition"
              title="Open Month Calendar"
            >
              <Calendar className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <span>{isToday ? 'Today' : formatDateDisplay(selectedDate)}</span>
            </button>

            <button
              onClick={() => shiftDate(1)}
              aria-label="Next Day"
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Settings Icon Button in Top Right */}
        <button
          onClick={() => setActiveTab(activeTab === 'settings' ? 'workout' : 'settings')}
          aria-label="Settings and Backup"
          className={`p-2.5 rounded-xl border transition shadow-sm ${
            activeTab === 'settings'
              ? 'bg-brand-600 border-brand-500 text-white'
              : 'bg-[#121215] border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
          }`}
          title="Settings & Backup"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Full Month Calendar View Modal */}
      {isCalendarOpen && (
        <MonthCalendarModal
          selectedDate={selectedDate}
          onSelectDate={(d) => setSelectedDate(d)}
          onClose={() => setIsCalendarOpen(false)}
        />
      )}

      {/* Active Rest Timer Top Bar (Ticking down when navigating outside or back) */}
      {timerSecondsLeft !== null && (
        <div className="bg-[#121215] border-t border-zinc-800 px-4 py-2 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 font-bold text-white">
            <Bell className="w-4 h-4 text-brand-400 animate-pulse" />
            <span className="text-zinc-400 uppercase tracking-wider text-[10px]">Rest Timer:</span>
            <span className="text-sm font-black text-brand-400 font-mono">
              {formatTimerTime(timerSecondsLeft)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onPauseToggleTimer}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
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
              className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1 transition"
              title="Stop & Delete Timer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
