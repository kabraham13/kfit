import Papa from 'papaparse';
import { db, WorkoutSet, Exercise, Category, WorkoutLog, ExerciseNote } from '../db';

export interface CSVImportResult {
  workoutsImported: number;
  setsImported: number;
  /** Rows that already existed and were left untouched. */
  setsSkipped: number;
  exercisesCreated: number;
  categoriesCreated: number;
  /** Exercise-day notes recovered from the CSV `Comment` column. */
  notesImported: number;
  /** Unit the file was read as, after header detection. */
  detectedUnit: 'lbs' | 'kg';
  /** Fatal — the import did not complete. */
  errors: string[];
  /** Non-fatal notes: converted units, skipped rows. */
  warnings: string[];
}

const LBS_PER_KG = 2.20462;

/** FitNotes writes YYYY-MM-DD. Anything else would never match our indexes. */
function normaliseDate(raw: string): string | null {
  const s = String(raw).trim().split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Accept the common slash forms rather than silently dropping the row.
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, a, b, y] = slash;
    // Ambiguous D/M vs M/D: treat >12 in the first position as the day.
    const [month, day] = Number(a) > 12 ? [b, a] : [a, b];
    return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function detectUnit(fields: string[]): 'lbs' | 'kg' | null {
  const joined = fields.join('|').toLowerCase();
  if (joined.includes('weight (kg)')) return 'kg';
  if (joined.includes('weight (lbs)')) return 'lbs';
  return null;
}

export async function parseAndImportFitNotesCSV(csvContent: string): Promise<CSVImportResult> {
  return new Promise((resolve) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const errors: string[] = [];
        const warnings: string[] = [];
        try {
          // The FitNotes export names its weight column with the unit. Without
          // honouring it a kg file imports as lbs and every number is wrong by
          // 2.2x — silently.
          const headerFields = (results.meta?.fields as string[]) || [];
          const fileUnit = detectUnit(headerFields);
          const settings = await db.userSettings.get('default');
          const targetUnit = settings?.weightUnit || 'lbs';
          // An unlabelled column is assumed to already be in the user's unit.
          const detectedUnit: 'lbs' | 'kg' = fileUnit || targetUnit;
          const weightFactor =
            detectedUnit === targetUnit ? 1 : detectedUnit === 'kg' ? LBS_PER_KG : 1 / LBS_PER_KG;

          if (fileUnit && fileUnit !== targetUnit) {
            warnings.push(`Converted weights from ${fileUnit} to ${targetUnit}.`);
          }

          // Pre-fetch existing data into fast O(1) Maps
          const existingCategories = await db.categories.toArray();
          const categoryMap = new Map<string, Category>(
            existingCategories.map((c) => [c.name.toLowerCase(), c])
          );

          const existingExercises = await db.exercises.toArray();
          const exerciseMap = new Map<string, Exercise>(
            existingExercises.map((e) => [e.name.toLowerCase(), e])
          );

          const newCategoriesMap = new Map<string, Category>();
          const newExercisesMap = new Map<string, Exercise>();
          const workoutDatesSet = new Set<string>();
          const setOrderTracker = new Map<string, number>();

          const setsToInsert: WorkoutSet[] = [];
          // FitNotes writes a comment per set; kfit keeps one note per exercise
          // per day, so the first non-empty comment in a group wins.
          const notesToInsert = new Map<string, ExerciseNote>();
          const nowBase = Date.now();

          for (let i = 0; i < results.data.length; i++) {
            const row: any = results.data[i];
            if (!row || typeof row !== 'object') continue;

            // FitNotes CSV header column matching (handling variations)
            const rawDate = row['Date'] || row['date'] || row['DATE'] || '';
            const exerciseName = String(row['Exercise'] || row['exercise'] || row['EXERCISE'] || '').trim();
            const categoryName = String(row['Category'] || row['category'] || row['CATEGORY'] || 'Custom').trim();

            if (!rawDate || !exerciseName) continue;

            // A date that is not YYYY-MM-DD would be written verbatim and then
            // never match the date indexes: invisible in History, undeletable,
            // but still counted. Reject rather than import a ghost row.
            const dateStr = normaliseDate(rawDate);
            if (!dateStr) {
              if (warnings.length < 20) {
                warnings.push(`Row ${i + 2}: unrecognised date "${String(rawDate).trim()}" — skipped.`);
              }
              continue;
            }

            const weightVal = parseFloat(row['Weight (lbs)'] || row['Weight (kg)'] || row['Weight'] || row['weight'] || '0');
            const repsVal = parseInt(row['Reps'] || row['reps'] || '0', 10);
            const distanceVal = parseFloat(row['Distance'] || row['distance'] || '0');
            const timeRaw = String(row['Time'] || row['time'] || '').trim();

            workoutDatesSet.add(dateStr);

            // Category Lookup / Queue
            const catKey = categoryName.toLowerCase();
            let cat = categoryMap.get(catKey) || newCategoriesMap.get(catKey);

            if (!cat) {
              const isCardio = catKey.includes('cardio') || (!isNaN(distanceVal) && distanceVal > 0);
              cat = {
                id: catKey.replace(/[^a-z0-9]/g, '-'),
                name: categoryName,
                isCardio,
                color: '#3b82f6'
              };
              newCategoriesMap.set(catKey, cat);
            }

            // Exercise Lookup / Queue
            const exKey = exerciseName.toLowerCase();
            let ex = exerciseMap.get(exKey) || newExercisesMap.get(exKey);

            if (!ex) {
              const isCardio = cat.isCardio || (!isNaN(distanceVal) && distanceVal > 0);
              ex = {
                id: exKey.replace(/[^a-z0-9]/g, '-'),
                name: exerciseName,
                categoryId: cat.id,
                categoryName: cat.name,
                isCardio,
                isCustom: true
              };
              newExercisesMap.set(exKey, ex);
            }

            // Parse Time if cardio
            let timeSeconds = 0;
            if (timeRaw) {
              const timeParts = timeRaw.split(':').map(Number);
              if (timeParts.length === 3) {
                timeSeconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
              } else if (timeParts.length === 2) {
                timeSeconds = timeParts[0] * 60 + timeParts[1];
              } else if (!isNaN(Number(timeRaw))) {
                timeSeconds = Number(timeRaw);
              }
            }

            const comment = String(row['Comment'] || row['comment'] || '').trim();
            if (comment) {
              const noteKey = `${dateStr}|${ex.id}`;
              if (!notesToInsert.has(noteKey)) {
                notesToInsert.set(noteKey, {
                  date: dateStr,
                  exerciseId: ex.id,
                  text: comment,
                  updatedAt: nowBase
                });
              }
            }

            // Fast O(1) set order tracking
            const setOrderKey = `${dateStr}_${ex.id}`;
            const currentOrder = (setOrderTracker.get(setOrderKey) || 0) + 1;
            setOrderTracker.set(setOrderKey, currentOrder);

            setsToInsert.push({
              workoutId: dateStr,
              date: dateStr,
              exerciseId: ex.id,
              exerciseName: ex.name,
              setOrder: currentOrder,
              weight: isNaN(weightVal) ? 0 : Math.round(weightVal * weightFactor * 100) / 100,
              reps: isNaN(repsVal) ? 0 : repsVal,
              distance: isNaN(distanceVal) || distanceVal <= 0 ? undefined : distanceVal,
              timeSeconds: timeSeconds > 0 ? timeSeconds : undefined,
              isCompleted: true,
              timestamp: nowBase + i
            });
          }

          let setsSkipped = 0;

          // Execute bulk batch writes inside a single Dexie transaction for instant speed
          let notesImported = 0;

          await db.transaction('rw', [db.categories, db.exercises, db.workoutLogs, db.workoutSets, db.exerciseNotes], async () => {
            if (newCategoriesMap.size > 0) {
              await db.categories.bulkPut(Array.from(newCategoriesMap.values()));
            }

            if (newExercisesMap.size > 0) {
              await db.exercises.bulkPut(Array.from(newExercisesMap.values()));
            }

            if (workoutDatesSet.size > 0) {
              const logsToPut: WorkoutLog[] = Array.from(workoutDatesSet).map((d) => ({
                id: d,
                date: d
              }));
              await db.workoutLogs.bulkPut(logsToPut);
            }

            if (setsToInsert.length > 0) {
              // Re-importing a backup used to duplicate every set: workoutSets
              // has an autoincrement key, so bulkAdd always inserted. Restoring
              // yesterday's Drive backup doubled the history; twice tripled it.
              // Skip rows already occupying the same (date, exercise, set
              // number) slot, so an import is idempotent and never clobbers an
              // edit the user made after a previous import.
              const affectedDates = Array.from(workoutDatesSet);
              const existingSets = await db.workoutSets.where('date').anyOf(affectedDates).toArray();
              const existingKeys = new Set(
                existingSets.map((s) => `${s.date}|${s.exerciseId}|${s.setOrder}`)
              );

              const fresh = setsToInsert.filter(
                (s) => !existingKeys.has(`${s.date}|${s.exerciseId}|${s.setOrder}`)
              );
              setsSkipped = setsToInsert.length - fresh.length;

              if (fresh.length > 0) await db.workoutSets.bulkAdd(fresh);
            }

            if (notesToInsert.size > 0) {
              // Never overwrite a note the user has already written here — an
              // import is additive, and a re-imported backup must not clobber
              // something edited since.
              const candidates = Array.from(notesToInsert.values());
              const existing = await db.exerciseNotes
                .where('date')
                .anyOf(Array.from(workoutDatesSet))
                .toArray();
              const existingKeys = new Set(existing.map((n) => `${n.date}|${n.exerciseId}`));

              const freshNotes = candidates.filter(
                (n) => !existingKeys.has(`${n.date}|${n.exerciseId}`)
              );

              if (freshNotes.length > 0) await db.exerciseNotes.bulkPut(freshNotes);
              notesImported = freshNotes.length;
            }
          });

          resolve({
            workoutsImported: workoutDatesSet.size,
            setsImported: setsToInsert.length - setsSkipped,
            setsSkipped,
            exercisesCreated: newExercisesMap.size,
            categoriesCreated: newCategoriesMap.size,
            notesImported,
            detectedUnit,
            errors,
            warnings
          });
        } catch (err: any) {
          console.error('FitNotes CSV import failed:', err);
          resolve({
            workoutsImported: 0,
            setsImported: 0,
            setsSkipped: 0,
            exercisesCreated: 0,
            categoriesCreated: 0,
            notesImported: 0,
            detectedUnit: 'lbs',
            errors: [err?.message || 'Error processing CSV file'],
            warnings: []
          });
        }
      },
      error: (err: any) => {
        resolve({
          workoutsImported: 0,
          setsImported: 0,
          setsSkipped: 0,
          exercisesCreated: 0,
          categoriesCreated: 0,
          notesImported: 0,
          detectedUnit: 'lbs',
          errors: [err?.message || 'CSV file parse error'],
          warnings: []
        });
      }
    });
  });
}

export async function exportFitNotesCSV(): Promise<string> {
  const settings = await db.userSettings.get('default');
  const unit = settings?.weightUnit || 'lbs';

  // Read both tables in one transaction. Previously a set logged between the
  // two reads exported with its category resolved to "General".
  const [allSets, allExercises, allNotes] = await db.transaction(
    'r',
    [db.workoutSets, db.exercises, db.exerciseNotes],
    async () =>
      Promise.all([
        db.workoutSets.orderBy('date').toArray(),
        db.exercises.toArray(),
        db.exerciseNotes.toArray()
      ])
  );
  const exMap = new Map(allExercises.map((e) => [e.id, e]));
  // Written onto every row of the exercise-day rather than just the first, so a
  // partial re-import still recovers the note.
  const noteMap = new Map(allNotes.map((n) => [`${n.date}|${n.exerciseId}`, n.text]));

  const rows = allSets.map((s) => {
    const ex = exMap.get(s.exerciseId);
    let timeFormatted = '';
    if (s.timeSeconds) {
      const h = Math.floor(s.timeSeconds / 3600);
      const m = Math.floor((s.timeSeconds % 3600) / 60);
      const sec = s.timeSeconds % 60;
      timeFormatted = `${h > 0 ? h + ':' : ''}${m < 10 && h > 0 ? '0' : ''}${m}:${sec < 10 ? '0' : ''}${sec}`;
    }

    return {
      Date: s.date,
      Exercise: s.exerciseName,
      Category: ex?.categoryName || 'General',
      // Unit-tagged, matching the FitNotes export format. A bare "Weight"
      // column meant a kg backup silently re-imported as lbs.
      [`Weight (${unit})`]: s.weight || 0,
      Reps: s.reps || 0,
      Distance: s.distance || '',
      Time: timeFormatted,
      Comment: noteMap.get(`${s.date}|${s.exerciseId}`) || ''
    };
  });

  return Papa.unparse(rows);
}
