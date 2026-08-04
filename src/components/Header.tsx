import React from 'react';
import { Dumbbell, Settings, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface HeaderProps {
  activeTab: 'workout' | 'library' | 'history' | 'settings';
  setActiveTab: (tab: 'workout' | 'library' | 'history' | 'settings') => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  selectedDate,
  setSelectedDate
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
    </header>
  );
};
