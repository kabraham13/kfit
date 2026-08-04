import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, WorkoutSet, Exercise } from '../db';
import { Plus, Check, Trash2, Dumbbell, Flame, ArrowLeft, ChevronRight, History, Play, Pause, RotateCcw, Bell } from 'lucide-react';
import { checkAndCelebratePR } from '../utils/prCalculator';

interface WorkoutLogViewProps {
  selectedDate: string;
  onStartTimer: (seconds?: number) => void;
  weightUnit: string;
  onSelectExerciseHistory: (exerciseId: string) => void;
  timerSecondsLeft: number | null;
  totalTimerSeconds: number;
  isTimerActive: boolean;
  onPauseToggleTimer: () => void;
  onResetTimer: () => void;
  onAddTimerSeconds: (sec: number) => void;
}

export const WorkoutLogView: React.FC<WorkoutLogViewProps> = ({
  selectedDate,
  onStartTimer,
  weightUnit,
  onSelectExerciseHistory,
  timerSecondsLeft,
  totalTimerSeconds,
  isTimerActive,
  onPauseToggleTimer,
  onResetTimer,
  onAddTimerSeconds
}) => {
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Fetch sets for selectedDate
  const workoutSets = useLiveQuery(
    () => db.workoutSets.where('date').equals(selectedDate).toArray(),
    [selectedDate]
  );

  // Fetch all unique workout dates for streak and weekly tracker
  const allLogs = useLiveQuery(() => db.workoutLogs.toArray());
  const categories = useLiveQuery(() => db.categories.toArray());
  const exercises = useLiveQuery(() => db.exercises.toArray());

  // Group sets by exercise for selected date
  const exerciseGroupMap = new Map<string, WorkoutSet[]>();
  if (workoutSets) {
    for (const set of workoutSets) {
      if (!exerciseGroupMap.has(set.exerciseId)) {
        exerciseGroupMap.set(set.exerciseId, []);
      }
      exerciseGroupMap.get(set.exerciseId)!.push(set);
    }
  }

  // Active workout dates set
  const activeDatesSet = new Set<string>();
  if (allLogs) {
    for (const log of allLogs) {
      activeDatesSet.add(log.date);
    }
  }

  // Compute Current Streak
  let currentStreak = 0;
  const today = new Date();
  let checkDate = new Date(today);
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  if (!activeDatesSet.has(formatDate(checkDate))) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (activeDatesSet.has(formatDate(checkDate))) {
    currentStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Compute Week Days (Monday to Sunday)
  const getWeekDays = (baseDateStr: string) => {
    const d = new Date(baseDateStr + 'T00:00:00');
    const dayOfWeek = d.getDay();
    const distanceToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(d);
    monday.setDate(d.getDate() + distanceToMon);

    const week = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const dateStr = formatDate(day);
      week.push({
        dateStr,
        dayName: day.toLocaleDateString('en-US', { weekday: 'narrow' }),
        dayNum: day.getDate(),
        isToday: dateStr === formatDate(today),
        isSelected: dateStr === selectedDate,
        hasWorkout: activeDatesSet.has(dateStr)
      });
    }
    return week;
  };

  const weekDays = getWeekDays(selectedDate);
  const workoutsThisWeek = weekDays.filter((d) => d.hasWorkout).length;

  const addExerciseToDate = async (exercise: Exercise) => {
    const lastSessionSets = await db.workoutSets
      .where('exerciseId')
      .equals(exercise.id)
      .reverse()
      .limit(1)
      .toArray();

    const initialWeight = lastSessionSets.length > 0 ? lastSessionSets[0].weight : 135;
    const initialReps = lastSessionSets.length > 0 ? lastSessionSets[0].reps : 10;

    await db.workoutSets.add({
      workoutId: selectedDate,
      date: selectedDate,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      setOrder: 1,
      weight: exercise.isCardio ? 0 : initialWeight,
      reps: exercise.isCardio ? 0 : initialReps,
      distance: exercise.isCardio ? 1.0 : undefined,
      timeSeconds: exercise.isCardio ? 900 : undefined,
      isCompleted: false,
      timestamp: Date.now()
    });

    setIsAddExerciseModalOpen(false);
    // Immediately open In-Exercise View!
    setActiveExerciseId(exercise.id);
  };

  const addSetToExercise = async (exerciseId: string, exerciseName: string) => {
    const existingSets = await db.workoutSets
      .where('[date+exerciseId]')
      .equals([selectedDate, exerciseId])
      .toArray();

    const lastSet = existingSets.length > 0 ? existingSets[existingSets.length - 1] : null;

    await db.workoutSets.add({
      workoutId: selectedDate,
      date: selectedDate,
      exerciseId,
      exerciseName,
      setOrder: existingSets.length + 1,
      weight: lastSet ? lastSet.weight : 135,
      reps: lastSet ? lastSet.reps : 10,
      distance: lastSet?.distance,
      timeSeconds: lastSet?.timeSeconds,
      isCompleted: false,
      timestamp: Date.now()
    });
  };

  const updateSet = async (setId: number, updates: Partial<WorkoutSet>) => {
    await db.workoutSets.update(setId, updates);
  };

  const toggleSetComplete = async (set: WorkoutSet) => {
    if (!set.id) return;
    const nextState = !set.isCompleted;
    await db.workoutSets.update(set.id, { isCompleted: nextState });

    if (nextState) {
      const logExists = await db.workoutLogs.get(selectedDate);
      if (!logExists) {
        await db.workoutLogs.add({ id: selectedDate, date: selectedDate });
      }

      onStartTimer();
      if (set.weight > 0 && set.reps > 0) {
        await checkAndCelebratePR(set.exerciseId, set.weight, set.reps, set.id);
      }
    }
  };

  const deleteSet = async (setId: number) => {
    await db.workoutSets.delete(setId);
  };

  const filteredExercises = exercises?.filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory ? ex.categoryId === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  const formatTimerTime = (secs: number) => {
    const m = Math.floor(Math.max(0, secs) / 60);
    const s = Math.max(0, secs) % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // -------------------------------------------------------------
  // VIEW 2: DEDICATED IN-EXERCISE VIEW (Full screen sets real estate)
  // -------------------------------------------------------------
  if (activeExerciseId) {
    const sets = exerciseGroupMap.get(activeExerciseId) || [];
    const exInfo = exercises?.find((e) => e.id === activeExerciseId);
    const isCardio = exInfo?.isCardio || false;
    const exerciseName = sets[0]?.exerciseName || exInfo?.name || 'Exercise';

    return (
      <div className="max-w-3xl mx-auto px-4 py-4 pb-32">
        {/* Back Navigation & Exercise Title Bar */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-surfaceBorder">
          <button
            onClick={() => setActiveExerciseId(null)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-surfaceBorder hover:bg-slate-800 text-slate-200 text-sm font-bold transition"
          >
            <ArrowLeft className="w-4 h-4 text-brand-400" />
            <span>Workout Log</span>
          </button>

          <button
            onClick={() => onSelectExerciseHistory(activeExerciseId)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-surfaceBorder hover:border-brand-500/40 text-slate-300 text-xs font-semibold transition"
          >
            <History className="w-4 h-4 text-brand-400" />
            <span>History</span>
          </button>
        </div>

        {/* Exercise Header Details */}
        <div className="bg-surface border border-surfaceBorder rounded-2xl p-4 mb-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
              {exInfo?.categoryName || 'General'}
            </span>
            <h2 className="text-2xl font-black text-white mt-1">{exerciseName}</h2>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-400">
              {sets.filter((s) => s.isCompleted).length} / {sets.length} Sets Done
            </span>
          </div>
        </div>

        {/* Integrated Top Rest Timer Header Component */}
        {timerSecondsLeft !== null && (
          <div className="bg-[#12141d] border border-brand-500/40 rounded-2xl p-4 mb-5 shadow-lg relative overflow-hidden">
            <div className="w-full bg-slate-800/60 rounded-full h-1.5 mb-3 overflow-hidden">
              <div
                className="bg-brand-500 h-full transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${totalTimerSeconds > 0 ? ((totalTimerSeconds - timerSecondsLeft) / totalTimerSeconds) * 100 : 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold">
                  <Bell className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Rest Timer</div>
                  <div className="text-2xl font-black text-white font-mono">{formatTimerTime(timerSecondsLeft)}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAddTimerSeconds(-15)}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                >
                  -15s
                </button>
                <button
                  onClick={() => onAddTimerSeconds(30)}
                  className="px-2.5 py-1.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                >
                  +30s
                </button>
                <button
                  onClick={onPauseToggleTimer}
                  className={`p-2 rounded-xl font-bold transition ${
                    isTimerActive
                      ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                  }`}
                >
                  {isTimerActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                </button>
                <button
                  onClick={onResetTimer}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full-Screen Real Estate Sets Table */}
        <div className="bg-surface border border-surfaceBorder rounded-2xl overflow-hidden shadow-xl p-4 mb-6">
          <div className="grid grid-cols-12 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2 mb-2 border-b border-surfaceBorder/80">
            <div className="col-span-2">SET</div>
            <div className="col-span-4">{isCardio ? 'DISTANCE' : `WEIGHT (${weightUnit})`}</div>
            <div className="col-span-4">{isCardio ? 'TIME (MIN)' : 'REPS'}</div>
            <div className="col-span-2 text-right">STATUS</div>
          </div>

          {sets.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              No sets added yet. Tap "+ Add Set" below!
            </div>
          ) : (
            <div className="space-y-3">
              {sets.map((set, index) => (
                <div
                  key={set.id || index}
                  className={`grid grid-cols-12 items-center p-3 rounded-2xl border transition ${
                    set.isCompleted
                      ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-100'
                      : 'bg-card border-surfaceBorder text-white'
                  }`}
                >
                  <div className="col-span-2 flex items-center gap-1 font-extrabold text-base text-slate-400">
                    <span>#{index + 1}</span>
                  </div>

                  <div className="col-span-4 pr-3">
                    <input
                      type="number"
                      step={isCardio ? '0.1' : '2.5'}
                      value={isCardio ? set.distance || '' : set.weight || ''}
                      onChange={(e) =>
                        set.id &&
                        updateSet(set.id, {
                          [isCardio ? 'distance' : 'weight']: parseFloat(e.target.value) || 0
                        })
                      }
                      className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white font-mono font-black text-center py-2.5 rounded-xl text-base outline-none transition"
                    />
                  </div>

                  <div className="col-span-4 pr-3">
                    <input
                      type="number"
                      value={isCardio ? (set.timeSeconds ? Math.floor(set.timeSeconds / 60) : '') : set.reps || ''}
                      onChange={(e) =>
                        set.id &&
                        updateSet(set.id, {
                          [isCardio ? 'timeSeconds' : 'reps']: (parseInt(e.target.value) || 0) * (isCardio ? 60 : 1)
                        })
                      }
                      className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white font-mono font-black text-center py-2.5 rounded-xl text-base outline-none transition"
                    />
                  </div>

                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => toggleSetComplete(set)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold transition shadow-md ${
                        set.isCompleted
                          ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <Check className="w-5 h-5 stroke-[3]" />
                    </button>

                    <button
                      onClick={() => set.id && deleteSet(set.id)}
                      className="p-2 text-slate-500 hover:text-rose-400 transition rounded-lg"
                      title="Delete Set"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Set Action Controls */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => addSetToExercise(activeExerciseId, exerciseName)}
            className="py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30 transition"
          >
            <Plus className="w-5 h-5" />
            <span>Add Set</span>
          </button>

          <button
            onClick={() => setActiveExerciseId(null)}
            className="py-3.5 rounded-2xl bg-surface border border-surfaceBorder text-slate-300 font-bold flex items-center justify-center gap-2 transition hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Done</span>
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW 1: DAILY WORKOUT OVERVIEW (List of added exercises)
  // -------------------------------------------------------------
  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-32">
      {/* Fitness Streak & Weekly Activity Dashboard */}
      <div className="bg-gradient-to-br from-[#12141d] via-[#181b26] to-[#121829] border border-surfaceBorder rounded-3xl p-5 mb-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <Flame className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-white font-mono">
                  {currentStreak} {currentStreak === 1 ? 'Day' : 'Days'}
                </span>
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  🔥 Streak
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {workoutsThisWeek} {workoutsThisWeek === 1 ? 'workout' : 'workouts'} logged this week
              </p>
            </div>
          </div>
        </div>

        {/* Weekly Activity Day Strip */}
        <div className="grid grid-cols-7 gap-1.5 pt-2 border-t border-surfaceBorder/60">
          {weekDays.map((day) => (
            <div
              key={day.dateStr}
              className={`p-2 rounded-2xl flex flex-col items-center justify-center transition border ${
                day.isSelected
                  ? 'bg-brand-600/20 border-brand-500 text-white shadow-md'
                  : day.hasWorkout
                  ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
                  : 'bg-card/40 border-surfaceBorder/60 text-slate-400 hover:border-slate-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase opacity-75">{day.dayName}</span>
              <span className="text-sm font-black mt-0.5 font-mono">{day.dayNum}</span>

              <div className="mt-1">
                {day.hasWorkout ? (
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-700/60" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily Exercises List Overview */}
      {Array.from(exerciseGroupMap.entries()).length === 0 ? (
        <div className="text-center py-14 px-4 bg-surface/50 border border-surfaceBorder/60 rounded-3xl">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center mx-auto mb-4 border border-brand-500/20">
            <Dumbbell className="w-8 h-8 transform -rotate-45" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No Workout Logged for This Date</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
            Tap below to select an exercise and start logging your sets!
          </p>
          <button
            onClick={() => setIsAddExerciseModalOpen(true)}
            className="px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold flex items-center gap-2 mx-auto shadow-lg shadow-brand-600/30 transition"
          >
            <Plus className="w-5 h-5" />
            <span>Add Exercise</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-1 flex items-center justify-between">
            <span>Exercises Logged Today</span>
            <span>Tap to edit sets</span>
          </div>

          {Array.from(exerciseGroupMap.entries()).map(([exerciseId, sets]) => {
            const exInfo = exercises?.find((e) => e.id === exerciseId);
            const completedCount = sets.filter((s) => s.isCompleted).length;
            const maxW = Math.max(...sets.map((s) => s.weight || 0));

            return (
              <button
                key={exerciseId}
                onClick={() => setActiveExerciseId(exerciseId)}
                className="w-full text-left bg-surface border border-surfaceBorder hover:border-brand-500/50 rounded-2xl p-4 flex items-center justify-between transition group shadow-md"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-card border border-surfaceBorder flex items-center justify-center text-brand-400 group-hover:bg-brand-600 group-hover:text-white transition">
                    <Dumbbell className="w-5 h-5 transform -rotate-45" />
                  </div>
                  <div>
                    <div className="font-bold text-white text-base group-hover:text-brand-400 transition flex items-center gap-2">
                      <span>{sets[0]?.exerciseName}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{exInfo?.categoryName || 'General'}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-semibold">
                        {completedCount} / {sets.length} sets completed
                      </span>
                      {maxW > 0 && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-slate-300">{maxW} {weightUnit} max</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-xl bg-card border border-surfaceBorder flex items-center justify-center text-slate-400 group-hover:text-white group-hover:border-brand-500/40 transition">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            );
          })}

          <div className="pt-3">
            <button
              onClick={() => setIsAddExerciseModalOpen(true)}
              className="w-full py-3.5 rounded-2xl bg-surface border border-brand-500/40 hover:bg-brand-600/10 text-brand-400 font-bold flex items-center justify-center gap-2 transition shadow-lg"
            >
              <Plus className="w-5 h-5" />
              <span>Add Another Exercise</span>
            </button>
          </div>
        </div>
      )}

      {/* Add Exercise Modal */}
      {isAddExerciseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-[#12141d] border border-surfaceBorder w-full max-w-lg rounded-t-3xl md:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-surfaceBorder flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Dumbbell className="w-5 h-5 text-brand-400" />
                <span>Select Exercise</span>
              </h3>
              <button
                onClick={() => setIsAddExerciseModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-3 border-b border-surfaceBorder/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedCategory === null ? 'bg-brand-600 text-white' : 'bg-surface border border-surfaceBorder text-slate-400'
                }`}
              >
                All
              </button>
              {categories?.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                    selectedCategory === cat.id ? 'bg-brand-600 text-white' : 'bg-surface border border-surfaceBorder text-slate-400'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="p-3">
              <input
                type="text"
                placeholder="Search exercise..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white px-4 py-2.5 rounded-xl text-sm outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {filteredExercises?.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => addExerciseToDate(ex)}
                  className="w-full text-left p-3 rounded-xl bg-card/60 hover:bg-card border border-surfaceBorder/60 hover:border-brand-500/40 flex items-center justify-between transition group"
                >
                  <div>
                    <div className="font-bold text-white group-hover:text-brand-400 transition">{ex.name}</div>
                    <div className="text-xs text-slate-400">{ex.categoryName}</div>
                  </div>
                  <Plus className="w-5 h-5 text-slate-500 group-hover:text-brand-400 transition" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
