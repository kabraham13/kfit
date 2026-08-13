import React, { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { db, Equipment, Exercise } from '../db';
import { equipmentOf, formatPlate, inferEquipment } from '../utils/plates';

interface ExerciseEquipmentControlProps {
  exercise: Exercise;
  defaultBarWeight: number;
  weightUnit: string;
}

const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine / cable',
  bodyweight: 'Bodyweight',
  other: 'Other',
};

/**
 * Per-exercise equipment and bar weight.
 *
 * Gyms have more than one bar — an EZ bar and a trap bar do not weigh what the
 * standard barbell does, so a single global setting would put the plate maths
 * out for every exercise that uses one. Left unset, both values fall back to the
 * inferred equipment and the global bar weight.
 */
export const ExerciseEquipmentControl: React.FC<ExerciseEquipmentControlProps> = ({
  exercise,
  defaultBarWeight,
  weightUnit,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const equipment = equipmentOf(exercise);
  const isInferred = exercise.equipment === undefined;
  const barWeight = exercise.barWeight ?? defaultBarWeight;

  const update = async (patch: Partial<Exercise>) => {
    await db.exercises.update(exercise.id, patch);
  };

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 text-[11px] font-bold text-slate-400 hover:text-slate-200 transition"
      >
        <Settings2 className="w-3.5 h-3.5" />
        <span>
          {EQUIPMENT_LABELS[equipment]}
          {equipment === 'barbell' && ` · ${formatPlate(barWeight)} ${weightUnit} bar`}
          {isInferred && <span className="text-slate-600"> (auto)</span>}
        </span>
      </button>

      {isOpen && (
        <div className="mt-2 p-3.5 bg-card border border-surfaceBorder rounded-2xl space-y-3">
          <div>
            <label
              htmlFor="equipment-select"
              className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Equipment
            </label>
            <select
              id="equipment-select"
              value={exercise.equipment ?? ''}
              onChange={(e) =>
                void update({
                  equipment: e.target.value ? (e.target.value as Equipment) : undefined,
                })
              }
              className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white font-bold px-3 py-2 rounded-xl text-xs outline-none cursor-pointer"
            >
              <option value="">
                Auto — {EQUIPMENT_LABELS[inferEquipment(exercise)]}
              </option>
              {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((key) => (
                <option key={key} value={key}>
                  {EQUIPMENT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {equipment === 'barbell' && (
            <div>
              <label
                htmlFor="bar-weight-input"
                className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                Bar weight ({weightUnit})
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="bar-weight-input"
                  type="number"
                  step="0.5"
                  min="0"
                  value={exercise.barWeight ?? ''}
                  placeholder={`${formatPlate(defaultBarWeight)} (default)`}
                  onChange={(e) => {
                    const raw = e.target.value;
                    void update({
                      barWeight: raw === '' ? undefined : parseFloat(raw) || 0,
                    });
                  }}
                  className="flex-1 min-w-0 bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white font-mono font-bold px-3 py-2 rounded-xl text-sm outline-none transition"
                />
                {exercise.barWeight !== undefined && (
                  <button
                    onClick={() => void update({ barWeight: undefined })}
                    className="px-3 py-2 rounded-xl bg-surface border border-surfaceBorder text-slate-300 hover:text-white font-bold text-xs transition shrink-0"
                  >
                    Use default
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
