import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, WorkoutSet } from '../db';
import { Award, Calendar, Trophy, TrendingUp } from 'lucide-react';
import { calculate1RM } from '../utils/prCalculator';
import { ExerciseProgressChart } from './ExerciseProgressChart';

interface HistoryViewProps {
  initialExerciseId?: string | null;
  weightUnit: string;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  initialExerciseId,
  weightUnit
}) => {
  const exercises = useLiveQuery(() => db.exercises.toArray());
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>(
    initialExerciseId || 'barbell-bench-press'
  );

  const selectedExercise = exercises?.find((e) => e.id === selectedExerciseId);

  const exerciseSets = useLiveQuery(
    () =>
      db.workoutSets
        .where('exerciseId')
        .equals(selectedExerciseId)
        .reverse()
        .toArray(),
    [selectedExerciseId]
  );

  let maxWeight = 0;
  let max1RM = 0;

  const dateGroupMap = new Map<string, WorkoutSet[]>();

  if (exerciseSets) {
    for (const set of exerciseSets) {
      if (!set.isCompleted) continue;
      if (set.weight > maxWeight) maxWeight = set.weight;
      const est1RM = calculate1RM(set.weight, set.reps);
      if (est1RM > max1RM) max1RM = est1RM;

      if (!dateGroupMap.has(set.date)) {
        dateGroupMap.set(set.date, []);
      }
      dateGroupMap.get(set.date)!.push(set);
    }
  }

  const dateEntries = Array.from(dateGroupMap.entries());

  // Oldest → newest, one point per session: the heaviest set of the day and the
  // best estimated 1RM of the day.
  const progressPoints = React.useMemo(() => {
    return dateEntries
      .map(([date, sets]) => ({
        date,
        topSet: Math.max(...sets.map((s) => s.weight || 0)),
        est1RM: Math.max(...sets.map((s) => calculate1RM(s.weight, s.reps))),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dateEntries.length, exerciseSets]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-32">
      <div className="bg-surface border border-surfaceBorder rounded-2xl p-4 mb-6 shadow-md">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          Select Exercise to View History
        </label>
        <select
          value={selectedExerciseId}
          onChange={(e) => setSelectedExerciseId(e.target.value)}
          className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white px-4 py-3 rounded-xl font-bold text-base outline-none transition cursor-pointer"
        >
          {exercises?.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name} ({ex.categoryName})
            </option>
          ))}
        </select>
      </div>

      {selectedExercise && (
        <div className="bg-gradient-to-br from-surface via-card to-indigo-950/30 border border-brand-500/30 rounded-3xl p-5 mb-6 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs uppercase font-bold px-2.5 py-1 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
                {selectedExercise.categoryName}
              </span>
              <h2 className="text-2xl font-black text-white mt-2">{selectedExercise.name}</h2>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center border border-brand-500/20 shadow-lg">
              <Trophy className="w-6 h-6" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="bg-[#090a0f]/60 backdrop-blur-md rounded-2xl p-3 border border-surfaceBorder/80">
              <div className="text-[11px] font-bold uppercase text-slate-400">Max Weight</div>
              <div className="text-lg font-black text-white font-mono mt-0.5">
                {maxWeight} <span className="text-xs text-slate-400 font-normal">{weightUnit}</span>
              </div>
            </div>

            <div className="bg-[#090a0f]/60 backdrop-blur-md rounded-2xl p-3 border border-surfaceBorder/80">
              <div className="text-[11px] font-bold uppercase text-slate-400">Est. 1RM</div>
              <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                {max1RM} <span className="text-xs text-slate-400 font-normal">{weightUnit}</span>
              </div>
            </div>

            <div className="bg-[#090a0f]/60 backdrop-blur-md rounded-2xl p-3 border border-surfaceBorder/80">
              <div className="text-[11px] font-bold uppercase text-slate-400">Sessions</div>
              <div className="text-lg font-black text-brand-400 font-mono mt-0.5">
                {dateEntries.length}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedExercise && !selectedExercise.isCardio && progressPoints.length > 0 && (
        <div className="bg-surface border border-surfaceBorder rounded-3xl p-4 mb-6 shadow-xl">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-400" />
            <span>Progress</span>
          </h3>
          <ExerciseProgressChart points={progressPoints} weightUnit={weightUnit} />
        </div>
      )}

      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-brand-400" />
        <span>Past Workout History</span>
      </h3>

      {dateEntries.length === 0 ? (
        <div className="text-center py-12 px-4 bg-surface/50 border border-surfaceBorder/60 rounded-2xl">
          <div className="text-slate-400 text-sm">No completed workout history recorded yet for this exercise.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {dateEntries.map(([dateStr, sets]) => {
            const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });

            const dayMaxWeight = Math.max(...sets.map((s) => s.weight || 0));
            const isDayPR = dayMaxWeight === maxWeight && maxWeight > 0;

            return (
              <div
                key={dateStr}
                className="bg-surface border border-surfaceBorder rounded-2xl p-4 hover:border-brand-500/40 transition shadow-md"
              >
                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-surfaceBorder/60">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{formattedDate}</span>
                    {isDayPR && (
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1">
                        <Award className="w-3 h-3" /> PR Session
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-slate-400">{sets.length} sets</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {sets.map((set, idx) => (
                    <div
                      key={set.id || idx}
                      className="px-3 py-1.5 rounded-xl bg-card border border-surfaceBorder/80 font-mono text-xs font-bold text-slate-200"
                    >
                      {selectedExercise?.isCardio ? (
                        <span>
                          {set.distance} mi • {Math.floor((set.timeSeconds || 0) / 60)} min
                        </span>
                      ) : (
                        <span>
                          {set.weight} {weightUnit} × {set.reps}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
