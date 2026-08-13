import React from 'react';
import { computePlateLoad, formatPlate } from '../utils/plates';

interface PlateLoadBarProps {
  weight: number;
  barWeight: number;
  availablePlates: number[];
  weightUnit: string;
}

// Plate height is scaled between these bounds so a 45 reads as obviously bigger
// than a 2.5 without the small plates becoming invisible slivers.
const MIN_PLATE_HEIGHT_PX = 11;
const MAX_PLATE_HEIGHT_PX = 28;

/**
 * What actually goes on the bar, drawn as one side of it.
 *
 * Laid out horizontally, with each plate's weight beside it rather than beneath.
 * Labels underneath made this two lines tall, which pushed the weight input out
 * of line with the rest of the set row.
 *
 * The bar is a separate labelled chip rather than another block, because when
 * both were drawn the same way a single 45 per side looked like two plates.
 */
export const PlateLoadBar: React.FC<PlateLoadBarProps> = ({
  weight,
  barWeight,
  availablePlates,
  weightUnit,
}) => {
  const load = computePlateLoad(weight, barWeight, availablePlates);
  if (!load) return null;

  const heaviest = Math.max(...availablePlates, 1);

  const plateHeight = (plate: number) => {
    const ratio = Math.sqrt(plate / heaviest); // sqrt keeps small plates visible
    return Math.round(MIN_PLATE_HEIGHT_PX + ratio * (MAX_PLATE_HEIGHT_PX - MIN_PLATE_HEIGHT_PX));
  };

  // Repeats are collapsed to "45×3". Three separate labelled blocks cost about
  // 100px on a phone and say nothing the multiplier does not.
  const grouped: Array<{ plate: number; count: number }> = [];
  for (const plate of load.perSide) {
    const last = grouped[grouped.length - 1];
    if (last && last.plate === plate) last.count += 1;
    else grouped.push({ plate, count: 1 });
  }

  return (
    <div className="flex items-center flex-wrap gap-x-1 gap-y-1">
      {/* The bar, as a bare sleeve. It was a "BAR" chip until that turned out to
          cost ~40px of a ~130px column; now every plate carries its own number,
          so the chip was labelling something already unambiguous. The bar's
          weight is stated on the equipment line above the sets. */}
      <span className="w-2.5 h-[3px] bg-slate-600 rounded-sm shrink-0" title="Bar" />

      {grouped.length === 0 ? (
        <span className="text-[10px] font-semibold text-slate-500">empty</span>
      ) : (
        grouped.map(({ plate, count }, i) => (
          <span key={`${plate}-${i}`} className="flex items-center gap-[3px] shrink-0">
            <span
              className="w-[7px] rounded-[2px] bg-gradient-to-b from-brand-400 to-brand-600 border border-brand-300/30"
              style={{ height: `${plateHeight(plate)}px` }}
            />
            <span className="text-[10px] leading-none font-mono font-bold text-slate-400">
              {formatPlate(plate)}
              {count > 1 && <span className="text-slate-500">×{count}</span>}
            </span>
          </span>
        ))
      )}

      {!load.exact && (
        // Kept inline so an unloadable weight does not add a second line and
        // knock the row out of alignment again.
        <span
          title={`Can't load ${formatPlate(weight)} ${weightUnit} — nearest are ${formatPlate(
            load.nearestBelow
          )} and ${formatPlate(load.nearestAbove)}`}
          className="text-[10px] leading-none font-bold text-amber-400/90 shrink-0"
        >
          = {formatPlate(load.nearestBelow)}
        </span>
      )}
    </div>
  );
};
