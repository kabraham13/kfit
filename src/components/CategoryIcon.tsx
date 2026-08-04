import React from 'react';
import {
  Shield,
  Layers,
  Footprints,
  Crosshair,
  BicepsFlexed,
  Target,
  Flame,
  HeartPulse,
  Dumbbell
} from 'lucide-react';

interface CategoryIconProps {
  categoryName?: string;
  categoryId?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  categoryName = '',
  categoryId = '',
  className = '',
  size = 'md'
}) => {
  const nameLower = categoryName.toLowerCase();
  const idLower = categoryId.toLowerCase();

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const iconClass = `${iconSizes[size]} ${className}`;

  if (nameLower.includes('chest') || idLower.includes('chest')) {
    return <Shield className={`${iconClass} text-rose-400`} />;
  }
  if (nameLower.includes('back') || idLower.includes('back')) {
    return <Layers className={`${iconClass} text-sky-400`} />;
  }
  if (nameLower.includes('leg') || idLower.includes('leg')) {
    return <Footprints className={`${iconClass} text-purple-400`} />;
  }
  if (nameLower.includes('shoulder') || idLower.includes('shoulder')) {
    return <Crosshair className={`${iconClass} text-amber-400`} />;
  }
  if (nameLower.includes('bicep') || idLower.includes('bicep')) {
    return <BicepsFlexed className={`${iconClass} text-emerald-400`} />;
  }
  if (nameLower.includes('tricep') || idLower.includes('tricep')) {
    return <Target className={`${iconClass} text-cyan-400`} />;
  }
  if (nameLower.includes('abs') || nameLower.includes('bodyweight') || nameLower.includes('core')) {
    return <Flame className={`${iconClass} text-orange-400`} />;
  }
  if (nameLower.includes('cardio') || idLower.includes('cardio')) {
    return <HeartPulse className={`${iconClass} text-pink-400`} />;
  }

  return <Dumbbell className={`${iconClass} text-brand-400 transform -rotate-45`} />;
};

export const getCategoryBadgeStyle = (categoryName: string = '', categoryId: string = '') => {
  const nameLower = categoryName.toLowerCase();
  const idLower = categoryId.toLowerCase();

  if (nameLower.includes('chest') || idLower.includes('chest')) {
    return 'bg-rose-500/15 border-rose-500/30 text-rose-400';
  }
  if (nameLower.includes('back') || idLower.includes('back')) {
    return 'bg-sky-500/15 border-sky-500/30 text-sky-400';
  }
  if (nameLower.includes('leg') || idLower.includes('leg')) {
    return 'bg-purple-500/15 border-purple-500/30 text-purple-400';
  }
  if (nameLower.includes('shoulder') || idLower.includes('shoulder')) {
    return 'bg-amber-500/15 border-amber-500/30 text-amber-400';
  }
  if (nameLower.includes('bicep') || idLower.includes('bicep')) {
    return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400';
  }
  if (nameLower.includes('tricep') || idLower.includes('tricep')) {
    return 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400';
  }
  if (nameLower.includes('abs') || nameLower.includes('bodyweight') || nameLower.includes('core')) {
    return 'bg-orange-500/15 border-orange-500/30 text-orange-400';
  }
  if (nameLower.includes('cardio') || idLower.includes('cardio')) {
    return 'bg-pink-500/15 border-pink-500/30 text-pink-400';
  }

  return 'bg-brand-500/15 border-brand-500/30 text-brand-400';
};
