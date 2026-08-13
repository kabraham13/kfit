import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Flame } from 'lucide-react';
import { parseLocalDate, todayISO } from '../utils/date';

interface MonthCalendarModalProps {
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  onClose: () => void;
}

export const MonthCalendarModal: React.FC<MonthCalendarModalProps> = ({
  selectedDate,
  onSelectDate,
  onClose
}) => {
  // Current displayed year and month (1-indexed month 1-12)
  const initialDate = parseLocalDate(selectedDate);
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth() + 1); // 1-12

  // Fetch all logged workout dates from IndexedDB
  const allLogs = useLiveQuery(() => db.workoutLogs.toArray());
  const workoutDatesSet = new Set<string>(allLogs?.map((l) => l.date) || []);

  const todayStr = todayISO();

  const shiftMonth = (delta: number) => {
    let newM = viewMonth + delta;
    let newY = viewYear;
    if (newM > 12) {
      newM = 1;
      newY += 1;
    } else if (newM < 1) {
      newM = 12;
      newY -= 1;
    }
    setViewMonth(newM);
    setViewYear(newY);
  };

  const jumpToToday = () => {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth() + 1);
    onSelectDate(todayStr);
    onClose();
  };

  // Generate calendar grid for viewYear & viewMonth
  const generateMonthGrid = () => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const lastDay = new Date(viewYear, viewMonth, 0);
    const totalDays = lastDay.getDate();

    // Weeks start on Sunday, which is what getDay() already returns as 0, so
    // the day number is the number of blank cells needed before the 1st.
    const startDayOfWeek = firstDay.getDay();

    const grid = [];

    // Empty padding slots for days before start of month
    for (let i = 0; i < startDayOfWeek; i++) {
      grid.push(null);
    }

    // Days of current month
    for (let d = 1; d <= totalDays; d++) {
      const monthPadded = String(viewMonth).padStart(2, '0');
      const dayPadded = String(d).padStart(2, '0');
      const dateStr = `${viewYear}-${monthPadded}-${dayPadded}`;
      grid.push({
        dayNum: d,
        dateStr,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        hasWorkout: workoutDatesSet.has(dateStr)
      });
    }

    return grid;
  };

  const monthGrid = generateMonthGrid();
  const monthName = new Date(viewYear, viewMonth - 1, 1).toLocaleString('en-US', { month: 'long' });

  // Count workouts in this viewed month
  const workoutsInMonthCount = monthGrid.filter((cell) => cell && cell.hasWorkout).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#121215] border border-zinc-800 w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-600/15 border border-brand-500/30 text-brand-400 flex items-center justify-center">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Month Calendar</h3>
              <p className="text-[11px] text-zinc-400">Tap any date to switch log</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Month Calendar"
            className="p-2 text-zinc-400 hover:text-white bg-[#18181b] hover:bg-zinc-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Month Navigator Header */}
        <div className="flex items-center justify-between px-1">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous Month"
            className="p-2 rounded-xl bg-[#18181b] border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition"
            title="Previous Month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <div className="text-lg font-black text-white font-mono">
              {monthName} {viewYear}
            </div>
            <div className="text-xs text-brand-400 font-semibold flex items-center justify-center gap-1 mt-0.5">
              <Flame className="w-3.5 h-3.5" />
              <span>{workoutsInMonthCount} {workoutsInMonthCount === 1 ? 'workout' : 'workouts'} logged</span>
            </div>
          </div>

          <button
            onClick={() => shiftMonth(1)}
            aria-label="Next Month"
            className="p-2 rounded-xl bg-[#18181b] border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition"
            title="Next Month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Week Day Labels (Sun to Sat) */}
        <div className="grid grid-cols-7 text-center text-xs font-bold text-zinc-400 uppercase tracking-wider py-1 border-b border-zinc-800/80">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Month Days Grid */}
        <div className="grid grid-cols-7 gap-1.5 pt-1">
          {monthGrid.map((cell, idx) => {
            if (!cell) {
              return <div key={`empty-${idx}`} className="h-11" />;
            }

            return (
              <button
                key={cell.dateStr}
                onClick={() => {
                  onSelectDate(cell.dateStr);
                  onClose();
                }}
                aria-label={`Select ${cell.dateStr}`}
                className={`h-11 rounded-2xl flex flex-col items-center justify-center transition border relative group ${
                  cell.isSelected
                    ? 'bg-brand-600 border-brand-400 text-white shadow-md scale-105 z-10'
                    : cell.isToday
                    ? 'bg-brand-600/20 border-brand-500/50 text-brand-300 font-bold'
                    : cell.hasWorkout
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
                    : 'bg-[#18181b] border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700'
                }`}
              >
                <span className={`text-xs font-black font-mono ${cell.isSelected ? 'text-white' : ''}`}>
                  {cell.dayNum}
                </span>

                {/* Workout Indicator Dot */}
                {cell.hasWorkout && (
                  <div
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                      cell.isSelected ? 'bg-white shadow-sm' : 'bg-emerald-400 shadow-sm'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Action Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
          <button
            onClick={jumpToToday}
            className="px-4 py-2 rounded-xl bg-[#18181b] border border-zinc-800 text-zinc-300 font-bold text-xs hover:text-white transition"
          >
            Jump to Today
          </button>

          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Logged
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-brand-500" /> Selected
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
