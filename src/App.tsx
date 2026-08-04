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

export function App() {
  const [activeTab, setActiveTab] = useState<'workout' | 'library' | 'history' | 'settings'>('workout');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedHistoryExerciseId, setSelectedHistoryExerciseId] = useState<string | null>(null);

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
        setActiveTab={setActiveTab}
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

      {/* Fixed Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
}
export default App;
