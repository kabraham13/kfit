import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Category, Exercise } from '../db';
import { ArrowLeft, Search, Plus, Dumbbell, ChevronRight, Activity } from 'lucide-react';

interface ExerciseSelectorViewProps {
  onSelectExercise: (exercise: Exercise) => void;
  onCancel: () => void;
}

export const ExerciseSelectorView: React.FC<ExerciseSelectorViewProps> = ({
  onSelectExercise,
  onCancel
}) => {
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

  // New Custom Exercise Form State
  const [newExName, setNewExName] = useState('');
  const [newExCategory, setNewExCategory] = useState<string>('chest');
  const [newExIsCardio, setNewExIsCardio] = useState(false);

  const categories = useLiveQuery(() => db.categories.toArray());
  const exercises = useLiveQuery(() => db.exercises.toArray());

  // Handle Android Native Back Button / Swipe Gesture Navigation
  useEffect(() => {
    window.history.pushState({ addExercise: true, step: selectedCategory ? 2 : 1 }, '');

    const handlePopState = () => {
      if (selectedCategory) {
        setSelectedCategory(null);
      } else {
        onCancel();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [selectedCategory]);

  const handleBack = () => {
    if (selectedCategory) {
      setSelectedCategory(null);
    } else {
      onCancel();
    }
  };

  const handleCreateCustomExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExName.trim()) return;

    const cat = categories?.find((c) => c.id === newExCategory);
    const newEx: Exercise = {
      id: `custom-${Date.now()}`,
      name: newExName.trim(),
      categoryId: newExCategory,
      categoryName: cat?.name || 'Custom',
      isCardio: newExIsCardio,
      isCustom: true
    };

    await db.exercises.add(newEx);
    setIsCustomModalOpen(false);
    onSelectExercise(newEx);
  };

  // Filter exercises
  const filteredExercises = exercises?.filter((ex) => {
    const matchesSearch = searchQuery
      ? ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ex.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
      : true;

    const matchesCat = selectedCategory ? ex.categoryId === selectedCategory.id : true;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-32 animate-fade-in">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-surfaceBorder">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface border border-surfaceBorder hover:bg-slate-800 text-slate-200 text-sm font-bold transition"
        >
          <ArrowLeft className="w-4 h-4 text-brand-400" />
          <span>{selectedCategory ? 'Categories' : 'Back to Log'}</span>
        </button>

        <span className="text-xs font-extrabold uppercase px-2.5 py-1 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
          Step {selectedCategory || searchQuery ? '2 of 2: Select Exercise' : '1 of 2: Select Category'}
        </span>
      </div>

      {/* Global Search Bar */}
      <div className="relative mb-6">
        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-3.5" />
        <input
          type="text"
          placeholder="Search all exercises (e.g. Bench Press, Squat, Running)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#12141d] border border-surfaceBorder focus:border-brand-500 text-white pl-12 pr-4 py-3 rounded-2xl text-sm outline-none shadow-lg transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-3 text-slate-400 hover:text-white text-xs font-bold bg-slate-800 px-2 py-1 rounded-lg"
          >
            Clear
          </button>
        )}
      </div>

      {/* STEP 1: CATEGORY SELECTION GRID */}
      {!selectedCategory && !searchQuery ? (
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-lg font-black text-white">Choose Category</h2>
            <span className="text-xs font-bold text-slate-400">{categories?.length || 0} Muscle Groups</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {categories?.map((cat) => {
              const exCount = exercises?.filter((e) => e.categoryId === cat.id).length || 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat)}
                  className="bg-surface hover:bg-card border border-surfaceBorder hover:border-brand-500/50 rounded-2xl p-4 text-left transition group shadow-md flex flex-col justify-between h-32"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center group-hover:bg-brand-600 group-hover:text-white transition">
                      {cat.isCardio ? <Activity className="w-5 h-5" /> : <Dumbbell className="w-5 h-5 transform -rotate-45" />}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition" />
                  </div>

                  <div>
                    <div className="font-extrabold text-white text-base group-hover:text-brand-400 transition">
                      {cat.name}
                    </div>
                    <div className="text-xs text-slate-400 font-semibold mt-0.5">
                      {exCount} {exCount === 1 ? 'exercise' : 'exercises'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Custom Exercise Trigger */}
          <div className="pt-2">
            <button
              onClick={() => setIsCustomModalOpen(true)}
              className="w-full py-3.5 rounded-2xl bg-surface border border-surfaceBorder hover:border-brand-500/40 text-slate-300 font-bold flex items-center justify-center gap-2 transition hover:bg-slate-800"
            >
              <Plus className="w-5 h-5 text-brand-400" />
              <span>Create Custom Exercise</span>
            </button>
          </div>
        </div>
      ) : (
        /* STEP 2: EXERCISES LIST */
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <div>
              <h2 className="text-lg font-black text-white">
                {selectedCategory ? `${selectedCategory.name} Exercises` : 'Search Results'}
              </h2>
              <p className="text-xs text-slate-400">Tap an exercise to add it to today's workout</p>
            </div>

            <button
              onClick={() => setIsCustomModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-brand-600/20 text-brand-400 border border-brand-500/30 text-xs font-bold flex items-center gap-1.5 transition hover:bg-brand-600/30"
            >
              <Plus className="w-4 h-4" />
              <span>+ Custom</span>
            </button>
          </div>

          <div className="space-y-2 mb-6">
            {filteredExercises && filteredExercises.length > 0 ? (
              filteredExercises.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => onSelectExercise(ex)}
                  className="w-full text-left bg-surface border border-surfaceBorder hover:border-brand-500/50 rounded-2xl p-4 flex items-center justify-between transition group shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-card border border-surfaceBorder flex items-center justify-center text-brand-400 group-hover:bg-brand-600 group-hover:text-white transition">
                      {ex.isCardio ? <Activity className="w-5 h-5" /> : <Dumbbell className="w-5 h-5 transform -rotate-45" />}
                    </div>
                    <div>
                      <div className="font-bold text-white text-base group-hover:text-brand-400 transition">
                        {ex.name}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="font-semibold">{ex.categoryName}</span>
                        {ex.primaryMuscle && (
                          <>
                            <span>•</span>
                            <span>{ex.primaryMuscle}</span>
                          </>
                        )}
                        {ex.isCustom && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400">
                            Custom
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="w-8 h-8 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold shadow-md shadow-brand-600/20 group-hover:scale-105 transition">
                    <Plus className="w-4 h-4 stroke-[3]" />
                  </div>
                </button>
              ))
            ) : (
              <div className="text-center py-12 bg-surface/50 border border-surfaceBorder rounded-2xl">
                <p className="text-slate-400 text-sm mb-4">No exercises found matching "{searchQuery}"</p>
                <button
                  onClick={() => setIsCustomModalOpen(true)}
                  className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Create "{searchQuery}" as Custom Exercise
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Custom Exercise Modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCustomExercise}
            className="bg-[#12141d] border border-surfaceBorder w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-surfaceBorder pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-brand-400" />
                <span>Create Custom Exercise</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Exercise Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Belt Squat, Cable Lateral Raise"
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white px-4 py-2.5 rounded-xl text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Category / Muscle Group
              </label>
              <select
                value={newExCategory}
                onChange={(e) => {
                  setNewExCategory(e.target.value);
                  const cat = categories?.find((c) => c.id === e.target.value);
                  setNewExIsCardio(cat?.isCardio || false);
                }}
                className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white px-4 py-2.5 rounded-xl text-sm outline-none"
              >
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="flex-1 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm shadow-md transition"
              >
                Save & Add
              </button>
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="px-4 py-3 rounded-xl bg-surface border border-surfaceBorder text-slate-400 font-bold text-sm hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
