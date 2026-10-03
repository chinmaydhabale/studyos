import React from 'react';
import { Search } from 'lucide-react';

interface CommandSearchTriggerProps {
  onClick: () => void;
}

export const CommandSearchTrigger: React.FC<CommandSearchTriggerProps> = ({ onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-white/10 hover:border-indigo-500/40 text-xs text-slate-400 hover:text-slate-200 transition-all shadow-inner group shrink-0"
      title="Quick Search & Command Palette (Ctrl + K)"
    >
      <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
      <span className="hidden 2xl:inline text-[11px] text-slate-400 group-hover:text-slate-300">
        Search...
      </span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono font-semibold text-slate-400 group-hover:text-white group-hover:border-white/20 transition-colors">
        Ctrl K
      </kbd>
    </button>
  );
};
