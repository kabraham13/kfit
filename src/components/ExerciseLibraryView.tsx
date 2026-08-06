import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Plus, Search, FolderPlus, ChevronRight } from 'lucide-react';
import { CategoryIcon, getCategoryBadgeStyle } from './CategoryIcon';

interface ExerciseLibraryViewProps {
  onSelectExerciseHistory: (exerciseId: string) => void;
}

export const ExerciseLibraryView: React.FC<ExerciseLibraryViewProps> = ({
  onSelectExerciseHistory
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const [newExName, setNewExName] = useState('');
  const [newExCategory, setNewExCategory] = useState('chest');
  const [newExIsCardio, setNewExIsCardio] = useState(false);

  const categories = useLiveQuery(() => db.categories.toArray());
  const exercises = useLiveQuery(() => db.exercises.toArray());

  const handleCreateCustomExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExName.trim()) return;

    const cat = categories?.find((c) => c.id === newExCategory);
    const exId = 'custom-' + newExName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();

    await db.exercises.add({
      id: exId,
      name: newExName.trim(),
      categoryId: newExCategory,
      categoryName: cat?.name || 'Custom',
      isCardio: newExIsCardio,
      isCustom: true
    });

    setNewExName('');
    setIsAddModalOpen(false);
  };

  const filteredExercises = exercises?.filter((ex) => {
    const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory ? ex.categoryId === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 pb-32">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-black text-white">Exercise Library</h2>
          <p className="text-xs text-slate-400">Browse or create exercises</p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-brand-600/30 transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Exercise</span>
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
        <input
          type="text"
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-surface border border-surfaceBorder focus:border-brand-500 text-white pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-6">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
            selectedCategory === null ? 'bg-brand-600 text-white shadow-md' : 'bg-surface border border-surfaceBorder text-slate-400'
          }`}
        >
          All ({exercises?.length || 0})
        </button>
        {categories?.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
              selectedCategory === cat.id ? 'bg-brand-600 text-white shadow-md' : 'bg-surface border border-surfaceBorder text-slate-400'
            }`}
          >
            <CategoryIcon categoryName={cat.name} categoryId={cat.id} size="sm" />
            <span>{cat.name}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filteredExercises?.map((ex) => {
          const badgeStyle = getCategoryBadgeStyle(ex.categoryName, ex.categoryId);
          return (
            <button
              key={ex.id}
              onClick={() => onSelectExerciseHistory(ex.id)}
              className="w-full text-left p-3.5 rounded-2xl bg-surface border border-surfaceBorder hover:border-brand-500/40 flex items-center justify-between transition group"
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center transition ${badgeStyle}`}>
                  <CategoryIcon categoryName={ex.categoryName} categoryId={ex.categoryId} size="md" />
                </div>
                <div>
                  <div className="font-bold text-white group-hover:text-brand-400 transition">
                    {ex.name}
                  </div>
                  <div className="text-xs text-slate-400">{ex.categoryName}</div>
                </div>
              </div>

              {/* Affordance only — the whole row opens history now. */}
              <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-brand-400 transition shrink-0" />
            </button>
          );
        })}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12141d] border border-surfaceBorder w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-brand-400" />
              <span>New Exercise</span>
            </h3>

            <form onSubmit={handleCreateCustomExercise} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Exercise Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Belt Squat"
                  value={newExName}
                  onChange={(e) => setNewExName(e.target.value)}
                  className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white px-4 py-2.5 rounded-xl text-sm outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Category
                </label>
                <select
                  value={newExCategory}
                  onChange={(e) => setNewExCategory(e.target.value)}
                  className="w-full bg-[#090a0f] border border-surfaceBorder focus:border-brand-500 text-white px-4 py-2.5 rounded-xl text-sm outline-none"
                >
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isCardio"
                  checked={newExIsCardio}
                  onChange={(e) => setNewExIsCardio(e.target.checked)}
                  className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
                />
                <label htmlFor="isCardio" className="text-sm font-semibold text-slate-200 cursor-pointer">
                  This is a Cardio exercise (Distance & Time)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surfaceBorder">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm shadow-lg shadow-brand-600/30 transition"
                >
                  Save Exercise
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
