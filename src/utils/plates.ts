import type { Equipment, Exercise } from '../db';

/** Standard commercial-gym rack, one side's worth. */
export const DEFAULT_PLATES_LBS = [45, 35, 25, 10, 5, 2.5];
export const DEFAULT_BAR_LBS = 45;
export const DEFAULT_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_BAR_KG = 20;

export function defaultPlatesFor(unit: 'lbs' | 'kg') {
  return unit === 'kg'
    ? { plates: DEFAULT_PLATES_KG, bar: DEFAULT_BAR_KG }
    : { plates: DEFAULT_PLATES_LBS, bar: DEFAULT_BAR_LBS };
}

// Plate weights are decimal (2.5, 1.25) and the greedy loop below subtracts
// repeatedly, so floating point drift would eventually mis-compare. Everything
// is done in hundredths as integers instead.
const SCALE = 100;
const toInt = (n: number) => Math.round(n * SCALE);
const fromInt = (n: number) => n / SCALE;

/**
 * Guesses how an exercise is loaded from its name.
 *
 * Seeded and CSV-imported exercises have no equipment field, and asking the user
 * to classify several hundred of them before the plate breakdown does anything
 * would be worse than a wrong guess they can override per exercise.
 */
export function inferEquipment(exercise: Pick<Exercise, 'name' | 'isCardio'>): Equipment {
  if (exercise.isCardio) return 'other';
  const name = exercise.name.toLowerCase();

  // Checked before 'barbell' so "Smith Machine Bench" is not treated as a bar
  // the user loads to a known starting weight. MTS is Hammer Strength's plate-
  // loaded machine line — without it "MTS Row" falls through to the row rule
  // below and is offered a plate breakdown for a bar it does not have.
  if (/\b(machine|mts|cable|smith|lever|pulldown|push ?down|pec deck|leg press|hack squat)\b/.test(name)) {
    return 'machine';
  }
  if (/\bdumbbell\b|\bdb\b/.test(name)) return 'dumbbell';
  if (/\b(barbell|bb|ez[- ]?bar|trap bar|hex bar)\b/.test(name)) return 'barbell';
  // Trailing s? throughout: these are as often logged plural ("Pushups", "Dips").
  if (/\b(pull[- ]?ups?|chin[- ]?ups?|push[- ]?ups?|dips?|planks?|sit[- ]?ups?|crunch(es)?|lunges?|bodyweight)\b/.test(name)) {
    return 'bodyweight';
  }

  // The classic barbell lifts are usually logged without the word "barbell".
  if (/\b(bench press|squat|deadlift|overhead press|military press|row|clean|snatch|jerk|thruster|good morning|hip thrust|rack pull|shrug|curl)\b/.test(name)) {
    return 'barbell';
  }
  return 'other';
}

export function equipmentOf(exercise: Pick<Exercise, 'name' | 'isCardio' | 'equipment'>): Equipment {
  return exercise.equipment ?? inferEquipment(exercise);
}

export interface PlateLoad {
  /** Plates for ONE side, heaviest first. */
  perSide: number[];
  /** Bar weight used. */
  bar: number;
  /** What the bar actually weighs once loaded as above. */
  achieved: number;
  /** True when `achieved` equals the requested weight. */
  exact: boolean;
  /** Nearest loadable weights either side, for the "can't load that" hint. */
  nearestBelow: number;
  nearestAbove: number;
}

/**
 * Works out what goes on each side of the bar.
 *
 * Greedy heaviest-first, which is both what lifters actually do and optimal for
 * any sane plate set. Plates are assumed to be available in quantity — a gym
 * that runs out of 45s is not something the log can know about.
 *
 * Returns null when the weight is below the bar, or when there is no bar at all
 * (dumbbells, machines), since there is nothing meaningful to show.
 */
export function computePlateLoad(
  targetWeight: number,
  barWeight: number,
  availablePlates: number[]
): PlateLoad | null {
  if (!Number.isFinite(targetWeight) || targetWeight <= 0) return null;
  if (!Number.isFinite(barWeight) || barWeight < 0) return null;

  const plates = availablePlates
    .filter((p) => Number.isFinite(p) && p > 0)
    .map(toInt)
    .sort((a, b) => b - a);
  if (plates.length === 0) return null;

  const target = toInt(targetWeight);
  const bar = toInt(barWeight);
  if (target < bar) return null;

  // Everything is symmetric, so solve one side and double it.
  const half = Math.floor((target - bar) / 2);
  const perSide: number[] = [];
  let remaining = half;

  for (const plate of plates) {
    while (remaining >= plate) {
      perSide.push(plate);
      remaining -= plate;
    }
  }

  const loadedPerSide = perSide.reduce((sum, p) => sum + p, 0);
  const achieved = bar + loadedPerSide * 2;
  const smallest = plates[plates.length - 1];
  const step = smallest * 2;

  return {
    perSide: perSide.map(fromInt),
    bar: barWeight,
    achieved: fromInt(achieved),
    exact: achieved === target,
    nearestBelow: fromInt(achieved),
    // An odd target (or one below the smallest increment) rounds down to
    // `achieved`; one more of the smallest plate per side is the next rung up.
    nearestAbove: fromInt(achieved + step),
  };
}

/** Trims trailing zeros so 2.5 stays "2.5" and 45 does not become "45.0". */
export function formatPlate(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Number(weight.toFixed(2)));
}
