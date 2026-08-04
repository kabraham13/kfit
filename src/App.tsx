import { useEffect, useState } from 'react';
import { initDatabaseDefaults, db } from './db';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { WorkoutLogView } from './components/WorkoutLogView';
import { ExerciseLibraryView } from './components/ExerciseLibraryView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { InstallPwaBanner } from './components/InstallPwaBanner';
import { playRestTimerChime, triggerTimerVibration, showTimerNotification } from './utils/timer';
import { LogOut } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'workout' | 'library' | 'history' | 'settings'>('workout');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedHistoryExerciseId, setSelectedHistoryExerciseId] = useState<string | null>(null);

  // Exit App Warning Modal State
  const [showExitModal, setShowExitModal] = useState(false);

  // Settings
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
  const [defaultTimerSec, setDefaultTimerSec] = useState<number>(90);

  // Rest Timer State
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number | null>(null);
  const [totalTimerSeconds, setTotalTimerSeconds] = useState<number>(90);
  const [isTimerActive, setIsTimerActive] = useState<boolean>(false);

  // Database initialization
  useEffect(() => {
    initDatabaseDefaults().then(async () => {
      const userSettings = await db.userSettings.get('default');
      if (userSettings) {
        setWeightUnit(userSettings.weightUnit || 'lbs');
        setDefaultTimerSec(userSettings.defaultRestTimerSeconds || 90);
        setTotalTimerSeconds(userSettings.defaultRestTimerSeconds || 90);
      }
    });
  }, []);

  // Global Android Back Navigation & Tab Fallback Router
  useEffect(() => {
    // Set base app root anchor
    if (!window.history.state || !window.history.state.tab) {
      window.history.replaceState({ appRoot: true }, '');
      window.history.pushState({ tab: activeTab }, '');
    }

    const handlePopState = (e: PopStateEvent) => {
      // If inside sub-views (In-Exercise or 2-Step Exercise Selector), let sub-views handle it
      if (e.state && (e.state.inExercise || e.state.addExercise)) {
        return;
      }

      // If popstate returned to appRoot base anchor, show Exit Warning Modal
      if (!e.state || e.state.appRoot) {
        setShowExitModal(true);
        return;
      }

      // If on non-log tabs (library, history, settings), fallback to 'workout' (Log) tab
      if (activeTab !== 'workout') {
        setActiveTab('workout');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeTab]);

  // Timer Tick Interval Effect
  useEffect(() => {
    let interval: any = null;
    if (isTimerActive && timerSecondsLeft !== null && timerSecondsLeft > 0) {
      interval = setInterval(() => {
        setTimerSecondsLeft((prev) => {
          if (prev === null || prev <= 1) {
            playRestTimerChime();
            triggerTimerVibration();
            showTimerNotification('Rest Timer Complete! 🔔', 'Time for your next set!');
            setIsTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerActive, timerSecondsLeft]);

  // Start Rest Timer
  const handleStartTimer = (sec?: number) => {
    const duration = sec || defaultTimerSec;
    setTotalTimerSeconds(duration);
    setTimerSecondsLeft(duration);
    setIsTimerActive(true);
  };

  const handlePauseToggleTimer = () => {
    setIsTimerActive(!isTimerActive);
  };

  const handleResetTimer = () => {
    setTimerSecondsLeft(totalTimerSeconds);
    setIsTimerActive(true);
  };

  const handleAddTimerSeconds = (sec: number) => {
    if (timerSecondsLeft !== null) {
      const updated = Math.max(0, timerSecondsLeft + sec);
      setTimerSecondsLeft(updated);
      setTotalTimerSeconds((prev) => Math.max(prev, updated));
    }
  };

  const handleCloseTimer = () => {
    setIsTimerActive(false);
    setTimerSecondsLeft(null);
  };

  const handleSelectExerciseHistory = (exerciseId: string) => {
    setSelectedHistoryExerciseId(exerciseId);
    setActiveTab('history');
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 selection:bg-brand-600 selection:text-white">
      {/* Install PWA Prompt Banner */}
      <InstallPwaBanner />

      {/* Top Header with Brand Title, Date Picker, Settings Icon, and Active Rest Timer Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => {
          window.history.pushState({ tab }, '');
          setActiveTab(tab);
        }}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        timerSecondsLeft={timerSecondsLeft}
        isTimerActive={isTimerActive}
        onPauseToggleTimer={handlePauseToggleTimer}
        onCloseTimer={handleCloseTimer}
      />

      {/* Main View Router */}
      <main>
        {activeTab === 'workout' && (
          <WorkoutLogView
            selectedDate={selectedDate}
            onStartTimer={handleStartTimer}
            weightUnit={weightUnit}
            onSelectExerciseHistory={handleSelectExerciseHistory}
            timerSecondsLeft={timerSecondsLeft}
            totalTimerSeconds={totalTimerSeconds}
            isTimerActive={isTimerActive}
            onPauseToggleTimer={handlePauseToggleTimer}
            onResetTimer={handleResetTimer}
            onAddTimerSeconds={handleAddTimerSeconds}
            onCloseTimer={handleCloseTimer}
          />
        )}

        {activeTab === 'library' && (
          <ExerciseLibraryView onSelectExerciseHistory={handleSelectExerciseHistory} />
        )}

        {activeTab === 'history' && (
          <HistoryView
            initialExerciseId={selectedHistoryExerciseId}
            weightUnit={weightUnit}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            weightUnit={weightUnit}
            setWeightUnit={setWeightUnit}
            defaultTimerSec={defaultTimerSec}
            setDefaultTimerSec={setDefaultTimerSec}
          />
        )}
      </main>

      {/* Exit App Confirmation Modal */}
      {showExitModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#12141d] border border-surfaceBorder w-full max-w-xs rounded-3xl p-5 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
              <LogOut className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Exit kfit?</h3>
              <p className="text-slate-400 text-xs mt-1">
                Are you sure you want to leave the app?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => {
                  setShowExitModal(false);
                  window.history.back();
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition"
              >
                Exit
              </button>
              <button
                onClick={() => {
                  setShowExitModal(false);
                  window.history.pushState({ tab: 'workout' }, '');
                }}
                className="flex-1 py-2.5 rounded-xl bg-surface border border-surfaceBorder text-slate-300 font-bold text-xs hover:text-white"
              >
                Stay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={(tab) => {
          window.history.pushState({ tab }, '');
          setActiveTab(tab);
        }}
      />
    </div>
  );
}
export default App;
