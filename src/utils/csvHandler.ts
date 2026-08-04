import Papa from 'papaparse';
import { db, WorkoutSet, Exercise, Category, WorkoutLog } from '../db';

export interface CSVImportResult {
  workoutsImported: number;
  setsImported: number;
  exercisesCreated: number;
  categoriesCreated: number;
  errors: string[];
}

export async function parseAndImportFitNotesCSV(csvContent: string): Promise<CSVImportResult> {
  return new Promise((resolve) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const errors: string[] = [];
        try {
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
          const nowBase = Date.now();

          for (let i = 0; i < results.data.length; i++) {
            const row: any = results.data[i];
            if (!row || typeof row !== 'object') continue;

            // FitNotes CSV header column matching (handling variations)
            const rawDate = row['Date'] || row['date'] || row['DATE'] || '';
            const dateStr = String(rawDate).trim().split(' ')[0];
            const exerciseName = String(row['Exercise'] || row['exercise'] || row['EXERCISE'] || '').trim();
            const categoryName = String(row['Category'] || row['category'] || row['CATEGORY'] || 'Custom').trim();

            if (!dateStr || !exerciseName) continue;

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
              weight: isNaN(weightVal) ? 0 : weightVal,
              reps: isNaN(repsVal) ? 0 : repsVal,
              distance: isNaN(distanceVal) || distanceVal <= 0 ? undefined : distanceVal,
              timeSeconds: timeSeconds > 0 ? timeSeconds : undefined,
              isCompleted: true,
              timestamp: nowBase + i
            });
          }

          // Execute bulk batch writes inside a single Dexie transaction for instant speed
          await db.transaction('rw', [db.categories, db.exercises, db.workoutLogs, db.workoutSets], async () => {
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
              await db.workoutSets.bulkAdd(setsToInsert);
            }
          });

          resolve({
            workoutsImported: workoutDatesSet.size,
            setsImported: setsToInsert.length,
            exercisesCreated: newExercisesMap.size,
            categoriesCreated: newCategoriesMap.size,
            errors
          });
        } catch (err: any) {
          console.error('FitNotes CSV import failed:', err);
          resolve({
            workoutsImported: 0,
            setsImported: 0,
            exercisesCreated: 0,
            categoriesCreated: 0,
            errors: [err?.message || 'Error processing CSV file']
          });
        }
      },
      error: (err: any) => {
        resolve({
          workoutsImported: 0,
          setsImported: 0,
          exercisesCreated: 0,
          categoriesCreated: 0,
          errors: [err?.message || 'CSV file parse error']
        });
      }
    });
  });
}

export async function exportFitNotesCSV(): Promise<string> {
  const allSets = await db.workoutSets.orderBy('date').toArray();
  const allExercises = await db.exercises.toArray();
  const exMap = new Map(allExercises.map((e) => [e.id, e]));

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
      Weight: s.weight || 0,
      Reps: s.reps || 0,
      Distance: s.distance || '',
      Time: timeFormatted,
      Comment: ''
    };
  });

  return Papa.unparse(rows);
}
