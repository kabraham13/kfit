import confetti from 'canvas-confetti';
import { db } from '../db';

export interface PREvaluation {
  isMaxWeightPR: boolean;
  is1RMPR: boolean;
  isRepsPR: boolean;
  previousMaxWeight: number;
  previous1RM: number;
  calculated1RM: number;
}

export function calculate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  // Cap effective reps at 12 to prevent wild 1RM overestimations on high-rep sets
  const effectiveReps = Math.min(reps, 12);
  return Math.round(weight * (1 + effectiveReps / 30) * 10) / 10;
}

export async function checkAndCelebratePR(
  exerciseId: string,
  newWeight: number,
  newReps: number,
  currentSetId?: number
): Promise<PREvaluation> {
  const previousSets = await db.workoutSets
    .where('exerciseId')
    .equals(exerciseId)
    .toArray();

  const historicalSets = previousSets.filter((s) => s.id !== currentSetId && s.isCompleted);

  let prevMaxWeight = 0;
  let prevMax1RM = 0;
  let prevMaxRepsAtWeight = 0;

  for (const s of historicalSets) {
    if (s.weight > prevMaxWeight) prevMaxWeight = s.weight;
    const est1RM = calculate1RM(s.weight, s.reps);
    if (est1RM > prevMax1RM) prevMax1RM = est1RM;
    if (s.weight === newWeight && s.reps > prevMaxRepsAtWeight) {
      prevMaxRepsAtWeight = s.reps;
    }
  }

  const current1RM = calculate1RM(newWeight, newReps);

  // Only trigger PR when prior history exists for this exercise
  const hasHistory = historicalSets.length > 0;
  const isMaxWeightPR = hasHistory && newWeight > prevMaxWeight && prevMaxWeight > 0;
  const is1RMPR = hasHistory && current1RM > prevMax1RM && prevMax1RM > 0;
  const isRepsPR = hasHistory && newReps > prevMaxRepsAtWeight && prevMaxRepsAtWeight > 0;

  const isAnyPR = isMaxWeightPR || is1RMPR || isRepsPR;

  if (isAnyPR) {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.7 }
    });
  }

  return {
    isMaxWeightPR,
    is1RMPR,
    isRepsPR,
    previousMaxWeight: prevMaxWeight,
    previous1RM: prevMax1RM,
    calculated1RM: current1RM
  };
}
