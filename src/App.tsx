import { useEffect, useState } from 'react';
import { initDatabaseDefaults, db } from './db';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { WorkoutLogView } from './components/WorkoutLogView';
import { ExerciseLibraryView } from './components/ExerciseLibraryView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { InstallPwaBanner } from './components/InstallPwaBanner';
import { useRestTimer } from './hooks/useRestTimer';
import { ensureDriveSessionFresh } from './utils/googleDriveBackup';
import { todayISO } from './utils/date';
import { LogOut } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'workout' | 'library' | 'history' | 'settings'>('workout');
  const [selectedDate, setSelectedDate] = useState<string>(
    todayISO()
  );
  const [selectedHistoryExerciseId, setSelectedHistoryExerciseId] = useState<string | null>(null);

  // Exit App Warning Modal State
  const [showExitModal, setShowExitModal] = useState(false);

  // Settings
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
  const [defaultTimerSec, setDefaultTimerSec] = useState<number>(90);

  // Rest Timer — wall-clock based so it survives app switching / backgrounding
  const {
    secondsLeft: timerSecondsLeft,
    totalSeconds: totalTimerSeconds,
    isActive: isTimerActive,
    start: handleStartTimer,
    pauseToggle: handlePauseToggleTimer,
    reset: handleResetTimer,
    addSeconds: handleAddTimerSeconds,
    close: handleCloseTimer,
  } = useRestTimer(defaultTimerSec);

  // Ask the browser not to evict our IndexedDB. Without this the origin is
  // "best effort" storage and the entire training history can be reclaimed
  // under storage pressure with no warning and no recovery.
  useEffect(() => {
    void (async () => {
      try {
        if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
          await navigator.storage.persist();
        }
      } catch {
        /* unsupported browser — nothing to do */
      }
    })();
  }, []);

  // Database initialization
  useEffect(() => {
    initDatabaseDefaults().then(async () => {
      const userSettings = await db.userSettings.get('default');
      if (userSettings) {
        setWeightUnit(userSettings.weightUnit || 'lbs');
        setDefaultTimerSec(userSettings.defaultRestTimerSeconds || 90);
      }
    });
  }, []);

  // Renew the Google Drive token before it lapses, so the link does not quietly
  // die between workouts. No-op when Drive is not connected.
  useEffect(() => {
    void ensureDriveSessionFresh();
    const onFocus = () => void ensureDriveSessionFresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
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

  const handleSelectExerciseHistory = (exerciseId: string) => {
    setSelectedHistoryExerciseId(exerciseId);
    // Push, like every other tab switch does. Without this the history stack
    // still points at the exercise you came from, so Back pops straight past it
    // and there is no way to return to that page.
    window.history.pushState({ tab: 'history' }, '');
    setActiveTab('history');
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-brand-600 selection:text-white">
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
            onSelectDate={setSelectedDate}
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
          <div className="bg-[#121215] border border-zinc-800 w-full max-w-xs rounded-3xl p-5 shadow-2xl space-y-4 text-center">
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
