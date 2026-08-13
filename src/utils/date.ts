/**
 * Dates in this app are calendar days, not instants: a workout logged on the
 * 12th belongs to the 12th regardless of what time it was.
 *
 * `Date.toISOString()` formats in UTC, so it is the wrong tool for that. West of
 * Greenwich it rolls the date over early: at UTC-4, anything logged after 8pm
 * was filed under tomorrow, so an evening workout landed on the wrong day and
 * the header stopped saying "Today". East of Greenwich the same call applied to
 * a local midnight lands on the previous UTC day, which broke the day-arrow
 * navigation. Everything that turns a Date into a YYYY-MM-DD key goes here.
 */
export function toLocalISODate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a stored YYYY-MM-DD back into a Date at local midnight.
 *
 * `new Date('2026-08-12')` is defined to parse as UTC midnight, which then
 * displays as the previous day in any negative offset. The explicit time
 * component forces local interpretation.
 */
export function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/** Today's calendar date in the user's own timezone. */
export function todayISO(): string {
  return toLocalISODate(new Date());
}
