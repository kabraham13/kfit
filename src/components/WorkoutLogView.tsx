import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, WorkoutSet, Exercise, Category } from '../db';
import { Plus, Check, Dumbbell, ArrowLeft, ChevronRight, History, Play, Pause, RotateCcw, Bell, Square, Calendar as CalendarIcon } from 'lucide-react';
import { checkAndCelebratePR } from '../utils/prCalculator';
import { ExerciseSelectorView } from './ExerciseSelectorView';
import { SwipeToDelete } from './SwipeToDelete';
import { CategoryIcon, getCategoryBadgeStyle } from './CategoryIcon';
import { parseLocalDate, toLocalISODate } from '../utils/date';
import { PlateLoadBar } from './PlateLoadBar';
import { equipmentOf, defaultPlatesFor } from '../utils/plates';
import { ExerciseNoteField } from './ExerciseNoteField';
import { ExerciseEquipmentControl } from './ExerciseEquipmentControl';
import { MonthCalendarModal } from './MonthCalendarModal';
import { triggerAutoBackupIfEnabled } from '../utils/googleDriveBackup';

interface WorkoutLogViewProps {
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  onStartTimer: (seconds?: number) => void;
  weightUnit: string;
  onSelectExerciseHistory: (exerciseId: string) => void;
  timerSecondsLeft: number | null;
  totalTimerSeconds: number;
  isTimerActive: boolean;
  onPauseToggleTimer: () => void;
  onResetTimer: () => void;
  onAddTimerSeconds: (sec: number) => void;
  onCloseTimer: () => void;
}

type LogSubView =
  | { type: 'overview' }
  | { type: 'selector-categories' }
  | { type: 'selector-exercises'; category: Category }
  | { type: 'in-exercise'; exerciseId: string };

export interface PreviousSession {
  date: string;
  sets: WorkoutSet[];
}

/**
 * The most recent completed session for an exercise strictly before `beforeDate`.
 * Ordering is by date, never by insertion order.
 */
async function findPreviousSession(
  exerciseId: string,
  beforeDate: string
): Promise<PreviousSession | null> {
  const rows = await db.workoutSets.where('exerciseId').equals(exerciseId).toArray();
  const prior = rows.filter((s) => s.date < beforeDate && s.isCompleted);
  if (prior.length === 0) return null;

  const latest = prior.reduce((max, s) => (s.date > max ? s.date : max), prior[0].date);
  return {
    date: latest,
    sets: prior.filter((s) => s.date === latest).sort((a, b) => a.setOrder - b.setOrder)
  };
}

function subViewFromHistoryState(s: any): LogSubView {
  if (!s || !s.subViewType) return { type: 'overview' };
  if (s.subViewType === 'in-exercise' && s.exerciseId) {
    return { type: 'in-exercise', exerciseId: s.exerciseId };
  }
  if (s.subViewType === 'selector-exercises' && s.category) {
    return { type: 'selector-exercises', category: s.category };
  }
  if (s.subViewType === 'selector-categories') return { type: 'selector-categories' };
  return { type: 'overview' };
}

export const WorkoutLogView: React.FC<WorkoutLogViewProps> = ({
  selectedDate,
  onSelectDate,
  onStartTimer,
  weightUnit,
  onSelectExerciseHistory,
  timerSecondsLeft,
  totalTimerSeconds,
  isTimerActive,
  onPauseToggleTimer,
  onResetTimer,
  onAddTimerSeconds,
  onCloseTimer
}) => {
  // Derived from history.state rather than hardcoded to 'overview': this view
  // unmounts when the History tab is opened from inside an exercise, taking its
  // popstate listener with it. On Back it remounts, and without this it would
  // ignore the restored history entry and drop you on the log overview instead
  // of the exercise you came from.
  const [subView, setSubView] = useState<LogSubView>(() => subViewFromHistoryState(window.history.state));
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Single Central PopState Listener for Log Sub-Views
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      setSubView(subViewFromHistoryState(e.state));
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Navigation Trigger Functions (Push state ONLY on user click)
  const openAddExerciseCategories = () => {
    window.history.pushState({ subViewType: 'selector-categories' }, '');
    setSubView({ type: 'selector-categories' });
  };

  const selectCategory = (category: Category) => {
    window.history.pushState({ subViewType: 'selector-exercises', category }, '');
    setSubView({ type: 'selector-exercises', category });
  };

  const openInExercise = (exerciseId: string) => {
    window.history.pushState({ subViewType: 'in-exercise', exerciseId }, '');
    setSubView({ type: 'in-exercise', exerciseId });
  };

  const navigateSubViewBack = () => {
    window.history.back();
  };

  // Fetch sets for selectedDate
  const workoutSets = useLiveQuery(
    () => db.workoutSets.where('date').equals(selectedDate).toArray(),
    [selectedDate]
  );

  // Fetch all unique workout dates for streak and weekly tracker
  // Previous session for the exercise being edited. Kept at the top level
  // because hooks cannot live inside the sub-view branches below.
  const activeExerciseId = subView.type === 'in-exercise' ? subView.exerciseId : null;
  const previousSession = useLiveQuery(
    () => (activeExerciseId ? findPreviousSession(activeExerciseId, selectedDate) : null),
    [activeExerciseId, selectedDate]
  );

  const allLogs = useLiveQuery(() => db.workoutLogs.toArray());
  const exercises = useLiveQuery(() => db.exercises.toArray());
  const settings = useLiveQuery(() => db.userSettings.get('default'));

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

  const today = new Date();
  const formatDate = toLocalISODate;

  // Compute Week Days (Sunday to Saturday)
  const getWeekDays = (baseDateStr: string) => {
    const d = parseLocalDate(baseDateStr);
    // getDay() is already Sunday-indexed (0 = Sunday), so the offset back to the
    // start of the week is just the day number itself.
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - d.getDay());

    const week = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(sunday);
      day.setDate(sunday.getDate() + i);
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
    // Prefill from the most recent *session*, not the highest primary key.
    // .reverse().limit(1) on the exerciseId index returns whichever row was
    // inserted last, so backfilling a missed workout poisoned every future
    // prefill with numbers from the wrong date.
    const prior = await findPreviousSession(exercise.id, selectedDate);
    const lastSet = prior ? prior.sets[prior.sets.length - 1] : null;

    const initialWeight = lastSet ? lastSet.weight : 0;
    const initialReps = lastSet ? lastSet.reps : 10;

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

    // Replace current selector state with in-exercise view
    window.history.replaceState({ subViewType: 'in-exercise', exerciseId: exercise.id }, '');
    setSubView({ type: 'in-exercise', exerciseId: exercise.id });
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

  /**
   * A date counts as a workout day exactly while it has at least one completed
   * set. Deleting or un-completing the last set used to leave the workoutLogs
   * row behind, so an emptied day stayed marked on the week strip and calendar
   * and kept counting toward "workouts this week".
   */
  const syncWorkoutLogForDate = async (date: string) => {
    const setsForDate = await db.workoutSets.where('date').equals(date).toArray();
    const hasCompleted = setsForDate.some((s) => s.isCompleted);
    const log = await db.workoutLogs.get(date);

    if (hasCompleted && !log) {
      await db.workoutLogs.add({ id: date, date });
    } else if (!hasCompleted && log && !log.notes) {
      // Keep a log that carries notes — those are user content, not a marker.
      await db.workoutLogs.delete(date);
    }
  };

  const toggleSetComplete = async (set: WorkoutSet) => {
    if (!set.id) return;
    const nextState = !set.isCompleted;
    await db.workoutSets.update(set.id, { isCompleted: nextState });
    await syncWorkoutLogForDate(selectedDate);

    if (nextState) {
      onStartTimer();
      if (set.weight > 0 && set.reps > 0) {
        await checkAndCelebratePR(set.exerciseId, set.weight, set.reps, set.id);
      }

      // Silent background auto-backup to Google Drive if linked & enabled
      triggerAutoBackupIfEnabled();
    }
  };

  const deleteSet = async (setId: number) => {
    const set = await db.workoutSets.get(setId);
    await db.workoutSets.delete(setId);
    if (set) await syncWorkoutLogForDate(set.date);
  };

  const formatTimerTime = (secs: number) => {
    const m = Math.floor(Math.max(0, secs) / 60);
    const s = Math.max(0, secs) % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // -------------------------------------------------------------
  // FULL-PAGE MODE A: 2-STEP EXERCISE SELECTOR VIEW
  // -------------------------------------------------------------
  if (subView.type === 'selector-categories' || subView.type === 'selector-exercises') {
    const selectedCat = subView.type === 'selector-exercises' ? subView.category : null;
    return (
      <ExerciseSelectorView
        selectedCategory={selectedCat}
        onSelectCategory={selectCategory}
        onSelectExercise={addExerciseToDate}
        onBack={navigateSubViewBack}
      />
    );
  }

  // -------------------------------------------------------------
  // FULL-PAGE MODE B: DEDICATED IN-EXERCISE VIEW
  // -------------------------------------------------------------
  if (subView.type === 'in-exercise') {
    const sets = exerciseGroupMap.get(activeExerciseId!) || [];
    const exInfo = exercises?.find((e) => e.id === activeExerciseId);
    const prevDateLabel = previousSession
      ? parseLocalDate(previousSession.date).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        })
      : null;
    const isCardio = exInfo?.isCardio || false;
    const exerciseName = sets[0]?.exerciseName || exInfo?.name || 'Exercise';
    const badgeStyle = getCategoryBadgeStyle(exInfo?.categoryName, exInfo?.categoryId);

    // Plate breakdown only makes sense for something you load a bar with.
    // Equipment is inferred from the name unless the user has overridden it.
    const unitDefaults = defaultPlatesFor(weightUnit === 'kg' ? 'kg' : 'lbs');
    const availablePlates = settings?.availablePlates?.length
      ? settings.availablePlates
      : unitDefaults.plates;
    const barWeight = exInfo?.barWeight ?? settings?.defaultBarWeight ?? unitDefaults.bar;
    const showPlates = !isCardio && exInfo != null && equipmentOf(exInfo) === 'barbell';

    return (
      <div className="max-w-3xl mx-auto px-4 py-4 pb-32">
        {/* Back Navigation & Exercise Title Bar */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-surfaceBorder">
          <button
            onClick={navigateSubViewBack}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-surfaceBorder hover:bg-slate-800 text-slate-200 text-sm font-bold transition"
          >
            <ArrowLeft className="w-4 h-4 text-brand-400" />
            <span>Workout Log</span>
          </button>

          <button
            onClick={() => onSelectExerciseHistory(activeExerciseId!)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-surfaceBorder hover:border-brand-500/40 text-slate-300 text-xs font-semibold transition"
          >
            <History className="w-4 h-4 text-brand-400" />
            <span>History</span>
          </button>
        </div>

        {/* Exercise Header Details */}
        <div className="bg-surface border border-surfaceBorder rounded-2xl p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${badgeStyle}`}>
              <CategoryIcon categoryName={exInfo?.categoryName} categoryId={exInfo?.categoryId} size="lg" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
                {exInfo?.categoryName || 'General'}
              </span>
              <h2 className="text-2xl font-black text-white mt-0.5">{exerciseName}</h2>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold text-slate-400">
              {sets.filter((s) => s.isCompleted).length} / {sets.length} Sets Done
            </span>
          </div>
        </div>

        {/* Equipment / bar weight, which drive the plate breakdown below. */}
        {!isCardio && exInfo && (
          <ExerciseEquipmentControl
            exercise={exInfo}
            defaultBarWeight={settings?.defaultBarWeight ?? unitDefaults.bar}
            weightUnit={weightUnit}
          />
        )}

        {/* Last session — the reference point for whether today is progress.
            Without it you have to leave the exercise to answer that. */}
        {previousSession && previousSession.sets.length > 0 && (
          <div className="bg-card border border-surfaceBorder rounded-2xl px-4 py-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Last time
              </span>
              <span className="text-[11px] font-semibold text-slate-500">{prevDateLabel}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {previousSession.sets.map((s, i) => (
                <span
                  key={s.id ?? i}
                  className="px-2.5 py-1 rounded-lg bg-[#090a0f] border border-surfaceBorder/80 font-mono text-xs font-bold text-slate-300"
                >
                  {isCardio ? (
                    <>
                      {s.distance ?? 0} · {Math.floor((s.timeSeconds || 0) / 60)}m
                    </>
                  ) : (
                    <>
                      {s.weight} × {s.reps}
                    </>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Integrated Top Rest Timer Header Component with Stop / Cancel button */}
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

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onAddTimerSeconds(-15)}
                  className="px-2 py-1.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                >
                  -15s
                </button>
                <button
                  onClick={() => onAddTimerSeconds(30)}
                  className="px-2 py-1.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
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
                  title="Reset Timer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={onCloseTimer}
                  className="p-2 text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition border border-rose-500/30"
                  title="Stop & Delete Timer"
                >
                  <Square className="w-4 h-4 fill-current" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full-Screen Real Estate Sets Table */}
        <div className="bg-surface border border-surfaceBorder rounded-2xl overflow-hidden shadow-xl p-4 mb-6">
          <div className="grid grid-cols-12 text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2 mb-2 border-b border-surfaceBorder/80">
            {/* Abbreviated only in the plates layout, where this column is about
                97px and the full label wraps onto a second line. */}
            <div className={`${showPlates ? 'col-span-3' : 'col-span-5'} pr-1`}>
              {isCardio ? 'DISTANCE' : showPlates ? `WT (${weightUnit})` : `WEIGHT (${weightUnit})`}
            </div>
            {showPlates && <div className="col-span-5 pr-1">PLATES</div>}
            <div className={`${showPlates ? 'col-span-2' : 'col-span-5'} pr-1`}>
              {isCardio ? 'TIME (MIN)' : 'REPS'}
            </div>
            <div className="col-span-2 text-right">STATUS</div>
          </div>

          {sets.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              No sets added yet. Tap "+ Add Set" below!
            </div>
          ) : (
            <div className="space-y-3">
              {sets.map((set, index) => (
                <SwipeToDelete
                  key={set.id || index}
                  onDelete={() => set.id && deleteSet(set.id)}
                >
                <div
                  className={`p-3 rounded-2xl border transition ${
                    set.isCompleted
                      ? 'bg-emerald-950/25 border-emerald-500/40 text-emerald-100'
                      : 'bg-card border-surfaceBorder text-white'
                  }`}
                >
                  <div className="grid grid-cols-12 items-center">
                  <div className={`${showPlates ? 'col-span-3 pr-2' : 'col-span-5 pr-3'}`}>
                    <input
                      type="number"
                      step={isCardio ? '0.1' : '2.5'}
                      aria-label={`Set ${index + 1} ${isCardio ? 'distance' : 'weight in ' + weightUnit}`}
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

                  {showPlates && (
                    <div className="col-span-5 pr-2">
                      {set.weight > 0 && (
                        <PlateLoadBar
                          weight={set.weight}
                          barWeight={barWeight}
                          availablePlates={availablePlates}
                          weightUnit={weightUnit}
                        />
                      )}
                    </div>
                  )}

                  <div className={`${showPlates ? 'col-span-2 pr-2' : 'col-span-5 pr-3'}`}>
                    <input
                      type="number"
                      aria-label={`Set ${index + 1} ${isCardio ? 'time in minutes' : 'reps'}`}
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

                  <div className="col-span-2 flex items-center justify-end">
                    {/* Now the only control in this cell, so it gets the full
                        width the trash button used to crowd. */}
                    <button
                      onClick={() => toggleSetComplete(set)}
                      aria-label={`Mark set ${index + 1} as ${set.isCompleted ? 'incomplete' : 'complete'}`}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold transition shadow-md ${
                        set.isCompleted
                          ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <Check className="w-5 h-5 stroke-[3]" />
                    </button>
                  </div>
                  </div>

                </div>
                </SwipeToDelete>
              ))}
            </div>
          )}
        </div>

        {/* Set Action Controls */}
        <button
          onClick={() => addSetToExercise(activeExerciseId!, exerciseName)}
          className="w-full py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-brand-600/30 transition"
        >
          <Plus className="w-5 h-5" />
          <span>Add Set</span>
        </button>

        <div className="mt-6">
          <ExerciseNoteField date={selectedDate} exerciseId={activeExerciseId!} />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // MAIN MODE: DAILY WORKOUT OVERVIEW
  // -------------------------------------------------------------
  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-32">
      {/* Weekly Activity Dashboard */}
      <div className="bg-[#121215] border border-zinc-800 rounded-3xl p-5 mb-6 shadow-sm relative overflow-hidden">
        {/* The count and its pill stack vertically rather than competing with
            Month View for one row — side by side they overflowed on a phone. */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 shrink-0 rounded-2xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-md">
              <Dumbbell className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-xl font-black text-white font-mono leading-tight truncate">
                {workoutsThisWeek} {workoutsThisWeek === 1 ? 'Workout' : 'Workouts'}
              </div>
              <span className="inline-block mt-1 text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30 whitespace-nowrap">
                This Week
              </span>
            </div>
          </div>

          {/* Month Calendar Quick Trigger Button */}
          <button
            onClick={() => setIsCalendarOpen(true)}
            aria-label="Open Month Calendar"
            className="shrink-0 px-3 py-2.5 rounded-xl bg-[#18181b] border border-zinc-800 hover:border-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition shadow-sm whitespace-nowrap"
            title="Open Month Calendar"
          >
            <CalendarIcon className="w-4 h-4 text-brand-400" />
            <span className="hidden min-[380px]:inline">Month View</span>
            <span className="min-[380px]:hidden">Month</span>
          </button>
        </div>

        {/* Weekly Activity Day Strip */}
        <div className="grid grid-cols-7 gap-1.5 pt-2 border-t border-zinc-800/80">
          {weekDays.map((day) => (
            <button
              key={day.dateStr}
              onClick={() => onSelectDate(day.dateStr)}
              aria-label={`Select ${day.dayName} ${day.dayNum}`}
              className={`p-2 rounded-2xl flex flex-col items-center justify-center transition border ${
                day.isSelected
                  ? 'bg-brand-600 border-brand-500 text-white shadow-sm scale-105'
                  : day.hasWorkout
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
                  : 'bg-[#18181b] border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase opacity-75">{day.dayName}</span>
              <span className="text-sm font-black mt-0.5 font-mono">{day.dayNum}</span>

              <div className="mt-1">
                {day.hasWorkout ? (
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Month Calendar View Modal */}
      {isCalendarOpen && (
        <MonthCalendarModal
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          onClose={() => setIsCalendarOpen(false)}
        />
      )}

      {/* Daily Exercises List Overview */}
      {Array.from(exerciseGroupMap.entries()).length === 0 ? (
        <div className="text-center py-14 px-4 bg-[#121215] border border-zinc-800 rounded-3xl">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center mx-auto mb-4 border border-brand-500/20">
            <Dumbbell className="w-8 h-8 transform -rotate-45" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No Workout Logged for This Date</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
            Tap below to select an exercise and start logging your sets!
          </p>
          <button
            onClick={openAddExerciseCategories}
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
            const badgeStyle = getCategoryBadgeStyle(exInfo?.categoryName, exInfo?.categoryId);

            return (
              <button
                key={exerciseId}
                onClick={() => openInExercise(exerciseId)}
                className="w-full text-left bg-surface border border-surfaceBorder hover:border-brand-500/50 rounded-2xl p-4 flex items-center justify-between transition group shadow-md"
              >
                <div className="flex items-center gap-3.5">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center transition ${badgeStyle}`}>
                    <CategoryIcon categoryName={exInfo?.categoryName} categoryId={exInfo?.categoryId} size="md" />
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
              onClick={openAddExerciseCategories}
              className="w-full py-3.5 rounded-2xl bg-surface border border-brand-500/40 hover:bg-brand-600/10 text-brand-400 font-bold flex items-center justify-center gap-2 transition shadow-lg"
            >
              <Plus className="w-5 h-5" />
              <span>Add Another Exercise</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
