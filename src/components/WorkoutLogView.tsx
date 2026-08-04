import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, WorkoutSet, Exercise } from '../db';
import { Plus, Check, Trash2, Dumbbell, Flame } from 'lucide-react';
import { checkAndCelebratePR } from '../utils/prCalculator';

interface WorkoutLogViewProps {
  selectedDate: string;
  onStartTimer: (seconds?: number) => void;
  weightUnit: string;
}

export const WorkoutLogView: React.FC<WorkoutLogViewProps> = ({
  selectedDate,
  onStartTimer,
  weightUnit
}) => {
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

  // Compute Active Workout Dates Set
  const activeDatesSet = new Set<string>();
  if (allLogs) {
    for (const log of allLogs) {
      activeDatesSet.add(log.date);
    }
  }

  // Compute Current Streak (Consecutive days ending today/yesterday)
  let currentStreak = 0;
  const today = new Date();
  let checkDate = new Date(today);
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  // If today isn't logged yet, check starting from yesterday
  if (!activeDatesSet.has(formatDate(checkDate))) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (activeDatesSet.has(formatDate(checkDate))) {
    currentStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Compute Week Days (Monday to Sunday) for Selected Date
  const getWeekDays = (baseDateStr: string) => {
    const d = new Date(baseDateStr + 'T00:00:00');
    const dayOfWeek = d.getDay(); // 0 is Sun, 1 is Mon...
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-32">
      {/* Fitness Streak & Weekly Activity Dashboard */}
      <div className="bg-gradient-to-br from-[#12141d] via-[#181b26] to-[#121829] border border-surfaceBorder rounded-3xl p-5 mb-6 shadow-xl relative overflow-hidden">
        {/* Streak & Weekly Progress Header */}
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

        {/* Interactive Weekly Activity Day Strip */}
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

              {/* Workout Indicator Dot */}
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

      {/* Logged Exercises List */}
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
        <div className="space-y-6">
          {Array.from(exerciseGroupMap.entries()).map(([exerciseId, sets]) => {
            const exInfo = exercises?.find((e) => e.id === exerciseId);
            const isCardio = exInfo?.isCardio || false;

            return (
              <div key={exerciseId} className="bg-surface border border-surfaceBorder rounded-2xl overflow-hidden shadow-md">
                <div className="bg-card px-4 py-3 border-b border-surfaceBorder flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-7 rounded-full bg-brand-500" />
                    <div>
                      <h3 className="font-bold text-white text-base">{sets[0]?.exerciseName}</h3>
                      <div className="text-xs font-semibold text-slate-400">{exInfo?.categoryName || 'General'}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => addSetToExercise(exerciseId, sets[0]?.exerciseName)}
                    className="px-3 py-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 text-xs font-bold flex items-center gap-1 transition border border-brand-500/30"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Set</span>
                  </button>
                </div>

                <div className="p-3">
                  <div className="grid grid-cols-12 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 mb-1">
                    <div className="col-span-2">SET</div>
                    <div className="col-span-4">{isCardio ? 'DISTANCE' : `WEIGHT (${weightUnit})`}</div>
                    <div className="col-span-4">{isCardio ? 'TIME (MIN)' : 'REPS'}</div>
                    <div className="col-span-2 text-right">STATUS</div>
                  </div>

                  <div className="space-y-2">
                    {sets.map((set, index) => (
                      <div
                        key={set.id || index}
                        className={`grid grid-cols-12 items-center p-2 rounded-xl border transition ${
                          set.isCompleted
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-100'
                            : 'bg-card/70 border-surfaceBorder/80 text-white'
                        }`}
                      >
                        <div className="col-span-2 flex items-center gap-1 font-bold text-sm text-slate-400">
                          <span>#{index + 1}</span>
                        </div>

                        <div className="col-span-4 pr-2">
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
                            className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white font-mono font-bold text-center py-2 rounded-lg text-sm outline-none transition"
                          />
                        </div>

                        <div className="col-span-4 pr-2">
                          <input
                            type="number"
                            value={isCardio ? (set.timeSeconds ? Math.floor(set.timeSeconds / 60) : '') : set.reps || ''}
                            onChange={(e) =>
                              set.id &&
                              updateSet(set.id, {
                                [isCardio ? 'timeSeconds' : 'reps']: (parseInt(e.target.value) || 0) * (isCardio ? 60 : 1)
                              })
                            }
                            className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white font-mono font-bold text-center py-2 rounded-lg text-sm outline-none transition"
                          />
                        </div>

                        <div className="col-span-2 flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => toggleSetComplete(set)}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold transition shadow-md ${
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
                </div>
              </div>
            );
          })}

          <div className="pt-2">
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
