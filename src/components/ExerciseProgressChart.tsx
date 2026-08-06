import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface ProgressPoint {
  date: string; // YYYY-MM-DD
  topSet: number;
  est1RM: number;
}

interface ExerciseProgressChartProps {
  points: ProgressPoint[];
  weightUnit: string;
}

// Validated against the app's #12141d surface for the dark categorical palette:
// lightness band, chroma floor, CVD separation, and 3:1 contrast all pass.
const SERIES_TOP_SET = '#3b82f6';
const SERIES_1RM = '#10b981';

const SURFACE = '#121215';

const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const HEIGHT = 220;

function formatShortDate(iso: string, withYear = false) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/**
 * Top-set weight and estimated 1RM over time.
 *
 * Both series share a unit, so they share one axis — no dual scale. Points are
 * placed by actual date rather than evenly spaced, so a layoff reads as a gap
 * instead of being silently compressed.
 */
export const ExerciseProgressChart: React.FC<ExerciseProgressChartProps> = ({
  points,
  weightUnit,
}) => {
  const [width, setWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Measure in real pixels rather than scaling a fixed viewBox, which would
  // shrink axis labels to unreadable sizes on a phone.
  //
  // A callback ref rather than useRef + useLayoutEffect([]): this component
  // renders a placeholder when an exercise has fewer than two sessions, so the
  // measured node appears and disappears across renders. A mount-only effect
  // attaches to whatever was there on first mount and never re-attaches, which
  // left the chart pinned at the fallback width after switching exercises.
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    observerRef.current = observer;
    setWidth(el.clientWidth);
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const pointsKey = points.map((p) => p.date).join(',');
  useEffect(() => {
    setHoverIndex(null);
  }, [pointsKey]);

  // Fall back to a sane width when measurement hasn't happened yet (first paint,
  // or no ResizeObserver) so the chart never renders as a blank gap.
  const w = width > 0 ? width : 320;

  const plotW = Math.max(0, w - PAD_LEFT - PAD_RIGHT);
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  if (points.length < 2) {
    return (
      <div className="text-center py-8 text-xs text-slate-400">
        Log at least two sessions to see your progress chart.
      </div>
    );
  }

  const times = points.map((p) => new Date(p.date + 'T00:00:00').getTime());
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const timeSpan = Math.max(1, maxTime - minTime);

  const values = points.flatMap((p) => [p.topSet, p.est1RM]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Headroom so the top line never rides the frame, and a floor that is not
  // forced to zero — small gains would be invisible on a 0-based axis.
  const span = rawMax - rawMin || rawMax || 1;
  const yMin = Math.max(0, rawMin - span * 0.15);
  const yMax = rawMax + span * 0.15;

  const xFor = (i: number) => PAD_LEFT + ((times[i] - minTime) / timeSpan) * plotW;
  const yFor = (v: number) => PAD_TOP + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const lineFor = (key: 'topSet' | 'est1RM') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p[key]).toFixed(1)}`).join(' ');

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * (yMax - yMin));

  // "Aug 25 → Jul 24" is ambiguous once a training history crosses a year.
  const spansYears =
    new Date(points[0].date).getFullYear() !==
    new Date(points[points.length - 1].date).getFullYear();
  const showMarkers = points.length <= 30;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(xFor(i) - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHoverIndex(nearest);
  };

  const active = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div ref={containerRef} className="w-full">
      {/* Legend — identity is never carried by colour alone. */}
      <div className="flex items-center gap-4 mb-1 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: SERIES_TOP_SET }} />
          <span className="text-[11px] font-semibold text-slate-400">Top set</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: SERIES_1RM }} />
          <span className="text-[11px] font-semibold text-slate-400">Est. 1RM</span>
        </div>
        <div className="ml-auto text-[11px] font-semibold text-slate-500">
          {points.length} sessions
        </div>
      </div>

      <svg
          width={w}
          height={HEIGHT}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
          style={{ touchAction: 'pan-y' }}
          role="img"
          aria-label={`Progress chart: top set and estimated one-rep max over ${points.length} sessions`}
        >
          {/* Recessive grid */}
          {gridValues.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD_LEFT}
                y1={yFor(v)}
                x2={w - PAD_RIGHT}
                y2={yFor(v)}
                stroke="#1e2230"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 8}
                y={yFor(v) + 3}
                textAnchor="end"
                className="fill-slate-500"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {Math.round(v)}
              </text>
            </g>
          ))}

          {/* X axis end labels only — a label per session would collide. */}
          <text x={PAD_LEFT} y={HEIGHT - 8} className="fill-slate-500" style={{ fontSize: 10, fontWeight: 600 }}>
            {formatShortDate(points[0].date, spansYears)}
          </text>
          <text
            x={w - PAD_RIGHT}
            y={HEIGHT - 8}
            textAnchor="end"
            className="fill-slate-500"
            style={{ fontSize: 10, fontWeight: 600 }}
          >
            {formatShortDate(points[points.length - 1].date, spansYears)}
          </text>

          {hoverIndex !== null && (
            <line
              x1={xFor(hoverIndex)}
              y1={PAD_TOP}
              x2={xFor(hoverIndex)}
              y2={PAD_TOP + plotH}
              stroke="#334155"
              strokeWidth={1}
            />
          )}

          <path d={lineFor('est1RM')} fill="none" stroke={SERIES_1RM} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={lineFor('topSet')} fill="none" stroke={SERIES_TOP_SET} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {showMarkers &&
            points.map((p, i) => (
              <g key={i}>
                {/* Surface ring keeps overlapping marks separable. */}
                <circle cx={xFor(i)} cy={yFor(p.est1RM)} r={4} fill={SERIES_1RM} stroke={SURFACE} strokeWidth={2} />
                <circle cx={xFor(i)} cy={yFor(p.topSet)} r={4} fill={SERIES_TOP_SET} stroke={SURFACE} strokeWidth={2} />
              </g>
            ))}

          {hoverIndex !== null && !showMarkers && (
            <g>
              <circle cx={xFor(hoverIndex)} cy={yFor(points[hoverIndex].est1RM)} r={4} fill={SERIES_1RM} stroke={SURFACE} strokeWidth={2} />
              <circle cx={xFor(hoverIndex)} cy={yFor(points[hoverIndex].topSet)} r={4} fill={SERIES_TOP_SET} stroke={SURFACE} strokeWidth={2} />
            </g>
          )}
      </svg>

      {/* Readout below the plot rather than a floating tooltip — it cannot be
          clipped by the card, and on a phone it is not hidden under a finger. */}
      <div className="flex items-center justify-center gap-4 mt-1 h-5 text-[11px] font-semibold">
        {active ? (
          <>
            <span className="text-slate-400">{formatShortDate(active.date)}</span>
            <span className="text-white font-mono">
              {active.topSet} {weightUnit}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-white font-mono">
              1RM {active.est1RM} {weightUnit}
            </span>
          </>
        ) : (
          <span className="text-slate-600">Tap or hover the chart for session details</span>
        )}
      </div>
    </div>
  );
};
