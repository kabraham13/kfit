import Dexie, { Table } from 'dexie';
import { SEED_CATEGORIES, SEED_EXERCISES, SEED_LOGS, SEED_SETS } from './fitnotesSeed';

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
}

class KFitDatabase extends Dexie {
  categories!: Table<Category, string>;
  exercises!: Table<Exercise, string>;
  workoutLogs!: Table<WorkoutLog, string>;
  workoutSets!: Table<WorkoutSet, number>;
  userSettings!: Table<UserSettings, string>;

  constructor() {
    super('kfit_database');
    this.version(1).stores({
      categories: 'id, name, isCardio',
      exercises: 'id, name, categoryId, categoryName, isCardio',
      workoutLogs: 'id, date',
      workoutSets: '++id, workoutId, date, exerciseId, [date+exerciseId]',
      userSettings: 'id'
    });
  }
}

export const db = new KFitDatabase();

export async function seedFitnotesDatabase() {
  await db.transaction('rw', [db.categories, db.exercises, db.workoutLogs, db.workoutSets, db.userSettings], async () => {
    // Clear existing sample data if seeding fresh history
    await db.categories.clear();
    await db.exercises.clear();
    await db.workoutLogs.clear();
    await db.workoutSets.clear();

    await db.categories.bulkAdd(SEED_CATEGORIES);
    await db.exercises.bulkAdd(SEED_EXERCISES);
    await db.workoutLogs.bulkAdd(SEED_LOGS);
    await db.workoutSets.bulkAdd(SEED_SETS as WorkoutSet[]);
  });
}

export async function initDatabaseDefaults() {
  const catCount = await db.categories.count();
  const setCount = await db.workoutSets.count();

  // If database is empty or has only demo data with no sets, seed with full FitNotes history
  if (catCount === 0 || setCount < 100) {
    await seedFitnotesDatabase();
  }

  const settingsCount = await db.userSettings.count();
  if (settingsCount === 0) {
    await db.userSettings.add({
      id: 'default',
      weightUnit: 'lbs',
      distanceUnit: 'miles',
      defaultRestTimerSeconds: 90,
      soundEnabled: true,
      vibrationEnabled: true
    });
  }
}
