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
const MIN_PLATE_HEIGHT_PX = 9;
const MAX_PLATE_HEIGHT_PX = 26;

/**
 * What actually goes on the bar, drawn as one side of it.
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

  return (
    <div className="mt-1.5 pl-0.5">
      <div className="flex items-end gap-[5px]">
        {/* The bar itself */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center">
            <span className="text-[8px] font-black tracking-wider text-slate-500 bg-slate-800/80 border border-surfaceBorder rounded px-1.5 py-[2px]">
              BAR
            </span>
            <span className="w-2.5 h-[3px] bg-slate-600" />
          </div>
          {/* Keeps the bar chip on the same baseline as the labelled plates. */}
          <span className="text-[10px] leading-none invisible">0</span>
        </div>

        {load.perSide.length === 0 ? (
          <span className="text-[10px] font-semibold text-slate-500 pb-4 pl-1">
            empty bar
          </span>
        ) : (
          load.perSide.map((plate, i) => (
            <div
              key={`${plate}-${i}`}
              className="flex flex-col items-center gap-1 min-w-[20px]"
            >
              <div
                className="w-[9px] rounded-[2px] bg-gradient-to-b from-brand-400 to-brand-600 border border-brand-300/30"
                style={{ height: `${plateHeight(plate)}px` }}
              />
              <span className="text-[10px] leading-none font-mono font-bold text-slate-400">
                {formatPlate(plate)}
              </span>
            </div>
          ))
        )}

        {load.perSide.length > 0 && (
          <span className="text-[9px] font-semibold text-slate-500 pl-1 pb-4">/side</span>
        )}
      </div>

      {!load.exact && (
        <div className="mt-1 text-[10px] font-bold text-amber-400/90">
          Can't load {formatPlate(weight)} — nearest is {formatPlate(load.nearestBelow)} or{' '}
          {formatPlate(load.nearestAbove)} {weightUnit}
        </div>
      )}
    </div>
  );
};
