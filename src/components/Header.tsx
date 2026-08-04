import React from 'react';
import { Dumbbell, Library, Award, Settings, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

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
    <header className="sticky top-0 z-30 bg-[#090a0f]/90 backdrop-blur-md border-b border-surfaceBorder">
      <div className="max-w-3xl mx-auto px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Dumbbell className="w-5 h-5 text-white transform -rotate-45" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                kfit <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 font-semibold border border-brand-500/30">PWA</span>
              </h1>
            </div>
          </div>

          {activeTab === 'workout' && (
            <div className="flex items-center bg-surface border border-surfaceBorder rounded-xl p-1">
              <button
                onClick={() => shiftDate(-1)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <label className="relative flex items-center gap-1.5 px-2.5 cursor-pointer text-sm font-semibold text-slate-200 hover:text-brand-400 transition">
                <Calendar className="w-3.5 h-3.5 text-brand-400" />
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
        </div>

        <nav className="flex bg-surface/80 p-1 rounded-xl border border-surfaceBorder text-xs font-semibold">
          <button
            onClick={() => setActiveTab('workout')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'workout'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Dumbbell className="w-4 h-4" />
            <span>Log</span>
          </button>

          <button
            onClick={() => setActiveTab('library')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'library'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Library className="w-4 h-4" />
            <span>Exercises</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'history'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>History</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
              activeTab === 'settings'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Backup & Settings</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
