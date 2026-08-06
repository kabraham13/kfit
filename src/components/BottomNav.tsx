import React from 'react';
import { Dumbbell, Library, Award } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'workout' | 'library' | 'history' | 'settings';
  setActiveTab: (tab: 'workout' | 'library' | 'history' | 'settings') => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#09090b]/95 backdrop-blur-lg border-t border-zinc-800 px-4 py-2 shadow-lg">
      <nav className="max-w-md mx-auto flex items-center justify-around">
        {/* Log Tab */}
        <button
          onClick={() => setActiveTab('workout')}
          aria-label="Workout Log Tab"
          aria-current={activeTab === 'workout' ? 'page' : undefined}
          className={`flex flex-col items-center gap-1 py-1.5 px-5 rounded-2xl transition ${
            activeTab === 'workout'
              ? 'text-brand-400 font-bold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition ${activeTab === 'workout' ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30' : ''}`}>
            <Dumbbell className="w-5 h-5" />
          </div>
          <span className="text-[11px] tracking-tight">Log</span>
        </button>

        {/* Exercises Tab */}
        <button
          onClick={() => setActiveTab('library')}
          aria-label="Exercise Library Tab"
          aria-current={activeTab === 'library' ? 'page' : undefined}
          className={`flex flex-col items-center gap-1 py-1.5 px-5 rounded-2xl transition ${
            activeTab === 'library'
              ? 'text-brand-400 font-bold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition ${activeTab === 'library' ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30' : ''}`}>
            <Library className="w-5 h-5" />
          </div>
          <span className="text-[11px] tracking-tight">Exercises</span>
        </button>

        {/* History Tab */}
        <button
          onClick={() => setActiveTab('history')}
          aria-label="Workout History Tab"
          aria-current={activeTab === 'history' ? 'page' : undefined}
          className={`flex flex-col items-center gap-1 py-1.5 px-5 rounded-2xl transition ${
            activeTab === 'history'
              ? 'text-brand-400 font-bold'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition ${activeTab === 'history' ? 'bg-brand-600/20 text-brand-400 border border-brand-500/30' : ''}`}>
            <Award className="w-5 h-5" />
          </div>
          <span className="text-[11px] tracking-tight">History</span>
        </button>
      </nav>
    </div>
  );
};
