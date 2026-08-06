import React, { useCallback, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

interface SwipeToDeleteProps {
  onDelete: () => void;
  children: React.ReactNode;
  /** Fraction of row width that must be dragged to commit the delete. */
  threshold?: number;
}

// Below this the gesture is treated as a tap, so a stray pixel of movement on a
// button press never starts a swipe.
const DRAG_START_SLOP = 8;

/**
 * Swipe a row left to delete it.
 *
 * Replaces the tiny trash button that sat next to the complete button — the two
 * were adjacent and easy to mis-hit mid-workout, with deletion the destructive
 * outcome of the two.
 */
export const SwipeToDelete: React.FC<SwipeToDeleteProps> = ({
  onDelete,
  children,
  threshold = 0.4,
}) => {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  // null = direction not yet decided; false = vertical scroll, hands off.
  const isHorizontalRef = useRef<boolean | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Deliberately started anywhere on the row, inputs included. The weight and
    // reps inputs occupy the middle two-thirds, so excluding them left only the
    // narrow "#1" label as a grab area and most swipes did nothing. Taps are
    // still safe: the gesture only engages past DRAG_START_SLOP of
    // horizontal-dominant movement, so a tap never captures the pointer and the
    // input focus / button click proceeds normally.
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    isHorizontalRef.current = null;
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      const dx = e.clientX - startXRef.current;
      const dy = e.clientY - startYRef.current;

      // Decide once whether this is a horizontal swipe or a vertical scroll, so
      // scrolling the set list never drags rows sideways.
      if (isHorizontalRef.current === null) {
        if (Math.abs(dx) < DRAG_START_SLOP && Math.abs(dy) < DRAG_START_SLOP) return;
        isHorizontalRef.current = Math.abs(dx) > Math.abs(dy);
        if (isHorizontalRef.current) {
          // Only capture once we've claimed the gesture, otherwise we swallow
          // the page scroll.
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
      }

      if (!isHorizontalRef.current) return;

      // Left only. A little rightward give makes the row feel physical rather
      // than stuck, without implying a right-swipe action exists.
      setOffset(dx < 0 ? dx : dx * 0.2);
    },
    [isDragging]
  );

  const finishDrag = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const width = containerRef.current?.offsetWidth || 1;
    const committed = offset < -width * threshold;

    if (committed) {
      // Slide the row fully out before removing it, so the list doesn't jump.
      setIsRemoving(true);
      setOffset(-width);
      window.setTimeout(onDelete, 180);
    } else {
      setOffset(0);
    }
    isHorizontalRef.current = null;
  }, [isDragging, offset, threshold, onDelete]);

  const width = containerRef.current?.offsetWidth || 1;
  // Backdrop fades in as the row clears it, signalling the commit point.
  const revealProgress = Math.min(1, Math.abs(offset) / (width * threshold));

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-2xl">
      <div
        // Fully transparent at rest: set rows use translucent backgrounds
        // (bg-emerald-950/25), so any resting opacity here bleeds red through
        // completed sets.
        className="absolute inset-0 flex items-center justify-end pr-6 rounded-2xl bg-rose-600"
        style={{ opacity: offset < 0 ? revealProgress : 0 }}
        aria-hidden="true"
      >
        <Trash2
          className="w-5 h-5 text-white transition-transform"
          style={{ transform: `scale(${0.8 + revealProgress * 0.3})` }}
        />
      </div>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        style={{
          transform: `translateX(${offset}px)`,
          // No transition while dragging, so the row tracks the finger exactly.
          transition: isDragging ? 'none' : 'transform 180ms ease-out',
          opacity: isRemoving ? 0 : 1,
          touchAction: 'pan-y',
        }}
        className="relative"
      >
        {children}
      </div>
    </div>
  );
};
