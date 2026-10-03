import React from 'react';
import { Flame, Zap } from 'lucide-react';

interface ComboStreakBadgeProps {
  streak: number;
}

export const ComboStreakBadge: React.FC<ComboStreakBadgeProps> = ({ streak }) => {
  if (streak < 3) return null;

  const multiplier = streak >= 10 ? '3.0x' : streak >= 5 ? '2.0x' : '1.5x';
  const isSuper = streak >= 10;
  const isHigh = streak >= 5;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide border shadow-lg animate-bounce transition-all ${
        isSuper
          ? 'bg-gradient-to-r from-amber-500 via-rose-600 to-purple-600 text-white border-yellow-300 shadow-amber-500/40'
          : isHigh
          ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white border-amber-300 shadow-orange-500/30'
          : 'bg-indigo-950/80 text-cyan-300 border-cyan-500/40 shadow-cyan-500/20'
      }`}
    >
      {isSuper ? (
        <Zap className="w-3.5 h-3.5 fill-yellow-300 text-yellow-200 animate-pulse" />
      ) : (
        <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-300 animate-pulse" />
      )}
      <span>{streak} STREAK</span>
      <span className="bg-black/30 px-1.5 py-0.5 rounded-md text-[10px] font-mono text-white">
        {multiplier} XP
      </span>
    </div>
  );
};
