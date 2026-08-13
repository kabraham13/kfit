import Dexie, { Table } from 'dexie';
import { DEFAULT_BAR_LBS, DEFAULT_PLATES_LBS } from '../utils/plates';
/**
 * Populates a brand-new database with the starter FitNotes history.
 *
 * Never clears existing tables. An earlier version opened with .clear() on all
 * four tables, which combined with a `setCount < 100` seed condition meant any
 * user whose log dipped below 100 sets had their entire history destroyed on the
 * next app load. Seeding is now additive and gated on a truly empty database.
 */
export async function seedFitnotesDatabase() {
  const { SEED_CATEGORIES, SEED_EXERCISES, SEED_LOGS, SEED_SETS } = await import('./fitnotesSeed');
  await db.transaction('rw', [db.categories, db.exercises, db.workoutLogs, db.workoutSets, db.userSettings], async () => {
    // bulkPut, not bulkAdd: idempotent if this ever runs twice.
    await db.categories.bulkPut(SEED_CATEGORIES);
    await db.exercises.bulkPut(SEED_EXERCISES);
    await db.workoutLogs.bulkPut(SEED_LOGS);
    await db.workoutSets.bulkPut(SEED_SETS as WorkoutSet[]);
  });
}

export interface Category {
  id: string;
  name: string;
  isCardio: boolean;
  color?: string;
}

export interface Exercise {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  isCardio: boolean;
  defaultUnit?: string; // 'lbs' | 'kg'
  primaryMuscle?: string;
  notes?: string;
  isCustom?: boolean;
  /**
   * How the weight is loaded. Drives whether a plate breakdown is shown at all.
   * Left unset on seeded and imported exercises, where it is inferred from the
   * name — see utils/plates.ts. Set explicitly only when the user overrides it.
   */
  equipment?: Equipment;
  /** Overrides the global bar weight: EZ bar, trap bar, safety squat bar. */
  barWeight?: number;
}

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'other';

/**
 * A free-text note attached to one exercise on one day, e.g. "left elbow ached"
 * or "belt from set 3". Deliberately per exercise-day rather than per workout:
 * feedback you want later is almost always about a specific lift.
 *
 * Round-trips through the FitNotes CSV `Comment` column.
 */
export interface ExerciseNote {
  date: string; // YYYY-MM-DD
  exerciseId: string;
  text: string;
  updatedAt: number;
}

export interface WorkoutLog {
  id: string;
  date: string; // YYYY-MM-DD
  notes?: string;
}

export interface WorkoutSet {
  id?: number;
  workoutId: string; // link to date (YYYY-MM-DD)
  date: string; // YYYY-MM-DD
  exerciseId: string;
  exerciseName: string;
  setOrder: number;
  weight: number; // in user preferred unit or kg
  reps: number;
  distance?: number | null; // for cardio
  timeSeconds?: number | null; // for cardio
  isCompleted: boolean;
  isWarmup?: boolean;
  timestamp: number;
}

export interface UserSettings {
  id: string;
  weightUnit: 'lbs' | 'kg';
  distanceUnit: 'miles' | 'km';
  defaultRestTimerSeconds: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  /**
   * Plate sizes on hand, one side's worth, in the user's weight unit. Gyms
   * differ, so this is not hardcoded.
   */
  availablePlates?: number[];
  /** Weight of the standard barbell, before any per-exercise override. */
  defaultBarWeight?: number;
  /**
   * Holds a silent audio loop for the duration of a rest so the chime still
   * fires with the screen off. Costs audio focus, which dims other apps' music,
   * so it is opt-in rather than the default.
   */
  keepAudioAliveInBackground?: boolean;
  /** Set once the starter data has been installed, so seeding never re-runs. */
  hasSeeded?: boolean;
}

class KFitDatabase extends Dexie {
  categories!: Table<Category, string>;
  exercises!: Table<Exercise, string>;
  workoutLogs!: Table<WorkoutLog, string>;
  workoutSets!: Table<WorkoutSet, number>;
  userSettings!: Table<UserSettings, string>;
  exerciseNotes!: Table<ExerciseNote, [string, string]>;

  constructor() {
    super('kfit_database');
    this.version(1).stores({
      categories: 'id, name, isCardio',
      exercises: 'id, name, categoryId, categoryName, isCardio',
      workoutLogs: 'id, date',
      workoutSets: '++id, workoutId, date, exerciseId, [date+exerciseId]',
      userSettings: 'id'
    });

    // v2 adds per-exercise-day notes. Dexie carries forward every table not
    // named here, and the new optional Exercise/UserSettings fields need no
    // migration because they are not indexed.
    this.version(2).stores({
      exerciseNotes: '[date+exerciseId], date, exerciseId'
    });
  }
}

export const db = new KFitDatabase();



/**
 * Drops workout-day markers that no longer have a completed set behind them.
 *
 * Deleting the last set used to leave its workoutLogs row in place, so an
 * emptied day still showed a dot on the week strip and calendar and still
 * counted toward "workouts this week". The write path is fixed, but existing
 * databases carry orphans, so they are swept on load. Logs carrying notes are
 * left alone — those are user content, not just a marker.
 */
async function repairOrphanedWorkoutLogs() {
  const logs = await db.workoutLogs.toArray();
  if (logs.length === 0) return;

  const datesWithCompletedSets = new Set<string>();
  await db.workoutSets.each((s) => {
    if (s.isCompleted) datesWithCompletedSets.add(s.date);
  });

  const orphans = logs
    .filter((l) => !datesWithCompletedSets.has(l.date) && !l.notes)
    .map((l) => l.id);

  if (orphans.length > 0) {
    await db.workoutLogs.bulkDelete(orphans);
    console.log(`Removed ${orphans.length} workout day marker(s) with no completed sets.`);
  }
}

export async function initDatabaseDefaults() {
  const settings = await db.userSettings.get('default');

  // A persisted marker, not a row-count heuristic. Counts cannot distinguish
  // "new install" from "user deleted most of their sets", and guessing wrong
  // costs the user their training history.
  if (!settings?.hasSeeded) {
    const catCount = await db.categories.count();
    const setCount = await db.workoutSets.count();

    // Only ever seed a genuinely empty database.
    if (catCount === 0 && setCount === 0) {
      await seedFitnotesDatabase();
    }
  }

  await repairOrphanedWorkoutLogs();

  if (!settings) {
    await db.userSettings.add({
      id: 'default',
      weightUnit: 'lbs',
      distanceUnit: 'miles',
      defaultRestTimerSeconds: 90,
      soundEnabled: true,
      vibrationEnabled: true,
      availablePlates: DEFAULT_PLATES_LBS,
      defaultBarWeight: DEFAULT_BAR_LBS,
      keepAudioAliveInBackground: false,
      hasSeeded: true
    });
  } else if (settings.availablePlates === undefined) {
    // Installs that predate the plate calculator get the standard set rather
    // than an empty rack, so the breakdown works before anyone visits Settings.
    await db.userSettings.update('default', {
      availablePlates: DEFAULT_PLATES_LBS,
      defaultBarWeight: DEFAULT_BAR_LBS,
      hasSeeded: true
    });
  } else if (!settings.hasSeeded) {
    // Existing installs predate the marker — record it so the seed check is
    // never re-evaluated against row counts again.
    await db.userSettings.update('default', { hasSeeded: true });
  }
}
