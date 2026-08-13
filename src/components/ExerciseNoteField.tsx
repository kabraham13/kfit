import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MessageSquare } from 'lucide-react';
import { db } from '../db';

interface ExerciseNoteFieldProps {
  date: string;
  exerciseId: string;
}

const SAVE_DEBOUNCE_MS = 600;

/**
 * A note attached to one exercise on one day.
 *
 * Writes are debounced rather than saved per keystroke: this sits in the middle
 * of a workout, and a Dexie write on every character would re-run the live
 * queries feeding the set list on the same screen.
 */
export const ExerciseNoteField: React.FC<ExerciseNoteFieldProps> = ({ date, exerciseId }) => {
  const saved = useLiveQuery(
    () => db.exerciseNotes.get([date, exerciseId]),
    [date, exerciseId]
  );

  const [text, setText] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Adopt the stored note on load and when switching exercise, but never
  // clobber what is currently being typed.
  useEffect(() => {
    if (!isDirty) setText(saved?.text ?? '');
  }, [saved?.text, isDirty]);

  useEffect(() => {
    setIsDirty(false);
    setText('');
  }, [date, exerciseId]);

  const flush = async (value: string) => {
    const trimmed = value.trim();
    if (trimmed) {
      await db.exerciseNotes.put({ date, exerciseId, text: trimmed, updatedAt: Date.now() });
    } else {
      // An emptied note is a deletion, not a blank row — otherwise the CSV
      // export carries empty comments forever.
      await db.exerciseNotes.delete([date, exerciseId]);
    }
    setIsDirty(false);
  };

  const onChange = (value: string) => {
    setText(value);
    setIsDirty(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(value), SAVE_DEBOUNCE_MS);
  };

  // Tapping Back within the debounce window must not lose what was typed, so the
  // pending value is flushed on unmount rather than just cancelled. Held in a
  // ref because the cleanup below closes over its first render otherwise.
  const pendingRef = useRef<{ dirty: boolean; text: string; date: string; exerciseId: string }>({
    dirty: false,
    text: '',
    date,
    exerciseId,
  });
  pendingRef.current = { dirty: isDirty, text, date, exerciseId };

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      if (!pending.dirty) return;

      const trimmed = pending.text.trim();
      if (trimmed) {
        void db.exerciseNotes.put({
          date: pending.date,
          exerciseId: pending.exerciseId,
          text: trimmed,
          updatedAt: Date.now(),
        });
      } else {
        void db.exerciseNotes.delete([pending.date, pending.exerciseId]);
      }
    };
  }, []);

  return (
    <div className="bg-surface border border-surfaceBorder rounded-2xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-4 h-4 text-brand-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Notes for this exercise today
        </span>
        {isDirty && <span className="text-[10px] text-slate-500 ml-auto">saving…</span>}
      </div>

      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => isDirty && void flush(text)}
        rows={2}
        placeholder="Form cues, aches, bar or rack used…"
        aria-label="Notes for this exercise today"
        className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-slate-200 placeholder:text-slate-600 text-sm px-3 py-2.5 rounded-xl outline-none transition resize-y"
      />
    </div>
  );
};
