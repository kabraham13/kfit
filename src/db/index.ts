import Dexie, { Table } from 'dexie';

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
  distance?: number; // for cardio
  timeSeconds?: number; // for cardio
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

// Pre-seeded Default Exercises (matching FitNotes taxonomy)
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'chest', name: 'Chest', isCardio: false, color: '#ef4444' },
  { id: 'back', name: 'Back', isCardio: false, color: '#3b82f6' },
  { id: 'legs', name: 'Legs', isCardio: false, color: '#10b981' },
  { id: 'shoulders', name: 'Shoulders', isCardio: false, color: '#f59e0b' },
  { id: 'arms', name: 'Arms', isCardio: false, color: '#8b5cf6' },
  { id: 'abs', name: 'Abs', isCardio: false, color: '#ec4899' },
  { id: 'cardio', name: 'Cardio', isCardio: true, color: '#06b6d4' }
];

export const DEFAULT_EXERCISES: Exercise[] = [
  // Chest
  { id: 'barbell-bench-press', name: 'Barbell Bench Press', categoryId: 'chest', categoryName: 'Chest', isCardio: false, primaryMuscle: 'Chest' },
  { id: 'incline-dumbbell-press', name: 'Incline Dumbbell Press', categoryId: 'chest', categoryName: 'Chest', isCardio: false, primaryMuscle: 'Chest' },
  { id: 'dumbbell-fly', name: 'Dumbbell Fly', categoryId: 'chest', categoryName: 'Chest', isCardio: false, primaryMuscle: 'Chest' },
  { id: 'push-up', name: 'Push Up', categoryId: 'chest', categoryName: 'Chest', isCardio: false, primaryMuscle: 'Chest' },
  { id: 'cable-crossover', name: 'Cable Crossover', categoryId: 'chest', categoryName: 'Chest', isCardio: false, primaryMuscle: 'Chest' },
  
  // Back
  { id: 'deadlift', name: 'Deadlift (Barbell)', categoryId: 'back', categoryName: 'Back', isCardio: false, primaryMuscle: 'Lower Back / Hamstrings' },
  { id: 'lat-pulldown', name: 'Lat Pulldown', categoryId: 'back', categoryName: 'Back', isCardio: false, primaryMuscle: 'Lats' },
  { id: 'bent-over-row', name: 'Bent Over Barbell Row', categoryId: 'back', categoryName: 'Back', isCardio: false, primaryMuscle: 'Upper Back' },
  { id: 'pull-up', name: 'Pull Up', categoryId: 'back', categoryName: 'Back', isCardio: false, primaryMuscle: 'Lats' },
  { id: 'seated-cable-row', name: 'Seated Cable Row', categoryId: 'back', categoryName: 'Back', isCardio: false, primaryMuscle: 'Mid Back' },
  
  // Legs
  { id: 'barbell-squat', name: 'Barbell Squat', categoryId: 'legs', categoryName: 'Legs', isCardio: false, primaryMuscle: 'Quadriceps / Glutes' },
  { id: 'leg-press', name: 'Leg Press', categoryId: 'legs', categoryName: 'Legs', isCardio: false, primaryMuscle: 'Quadriceps' },
  { id: 'romanian-deadlift', name: 'Romanian Deadlift', categoryId: 'legs', categoryName: 'Legs', isCardio: false, primaryMuscle: 'Hamstrings' },
  { id: 'leg-extension', name: 'Leg Extension', categoryId: 'legs', categoryName: 'Legs', isCardio: false, primaryMuscle: 'Quadriceps' },
  { id: 'leg-curl', name: 'Seated Leg Curl', categoryId: 'legs', categoryName: 'Legs', isCardio: false, primaryMuscle: 'Hamstrings' },
  { id: 'calf-raise', name: 'Standing Calf Raise', categoryId: 'legs', categoryName: 'Legs', isCardio: false, primaryMuscle: 'Calves' },

  // Shoulders
  { id: 'overhead-press', name: 'Overhead Press (Barbell)', categoryId: 'shoulders', categoryName: 'Shoulders', isCardio: false, primaryMuscle: 'Front Delts' },
  { id: 'dumbbell-lateral-raise', name: 'Dumbbell Lateral Raise', categoryId: 'shoulders', categoryName: 'Shoulders', isCardio: false, primaryMuscle: 'Side Delts' },
  { id: 'face-pull', name: 'Cable Face Pull', categoryId: 'shoulders', categoryName: 'Shoulders', isCardio: false, primaryMuscle: 'Rear Delts' },
  { id: 'dumbbell-shoulder-press', name: 'Dumbbell Shoulder Press', categoryId: 'shoulders', categoryName: 'Shoulders', isCardio: false, primaryMuscle: 'Front Delts' },

  // Arms
  { id: 'barbell-curl', name: 'Barbell Bicep Curl', categoryId: 'arms', categoryName: 'Arms', isCardio: false, primaryMuscle: 'Biceps' },
  { id: 'tricep-rope-pushdown', name: 'Tricep Rope Pushdown', categoryId: 'arms', categoryName: 'Arms', isCardio: false, primaryMuscle: 'Triceps' },
  { id: 'hammer-curl', name: 'Dumbbell Hammer Curl', categoryId: 'arms', categoryName: 'Arms', isCardio: false, primaryMuscle: 'Biceps / Forearms' },
  { id: 'skullcrusher', name: 'Barbell Skullcrusher', categoryId: 'arms', categoryName: 'Arms', isCardio: false, primaryMuscle: 'Triceps' },

  // Abs
  { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', categoryId: 'abs', categoryName: 'Abs', isCardio: false, primaryMuscle: 'Abs' },
  { id: 'cable-crunch', name: 'Cable Crunch', categoryId: 'abs', categoryName: 'Abs', isCardio: false, primaryMuscle: 'Abs' },
  { id: 'plank', name: 'Plank', categoryId: 'abs', categoryName: 'Abs', isCardio: false, primaryMuscle: 'Core' },

  // Cardio
  { id: 'treadmill-running', name: 'Treadmill / Running', categoryId: 'cardio', categoryName: 'Cardio', isCardio: true },
  { id: 'stationary-bike', name: 'Stationary Cycling', categoryId: 'cardio', categoryName: 'Cardio', isCardio: true },
  { id: 'rowing-machine', name: 'Rowing Machine', categoryId: 'cardio', categoryName: 'Cardio', isCardio: true },
  { id: 'stair-master', name: 'Stair Master', categoryId: 'cardio', categoryName: 'Cardio', isCardio: true }
];

export async function initDatabaseDefaults() {
  const catCount = await db.categories.count();
  if (catCount === 0) {
    await db.categories.bulkAdd(DEFAULT_CATEGORIES);
  }
  const exCount = await db.exercises.count();
  if (exCount === 0) {
    await db.exercises.bulkAdd(DEFAULT_EXERCISES);
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
