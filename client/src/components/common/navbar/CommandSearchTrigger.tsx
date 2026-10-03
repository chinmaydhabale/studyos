import React from 'react';
import { Search, Command } from 'lucide-react';

interface CommandSearchTriggerProps {
  onClick: () => void;
}

export const CommandSearchTrigger: React.FC<CommandSearchTriggerProps> = ({ onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-white/10 hover:border-indigo-500/40 text-xs text-slate-400 hover:text-slate-200 transition-all shadow-inner group"
      title="Quick Search & Command Palette (Ctrl + K)"
    >
      <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
      <span className="text-[11px] font-medium hidden xl:inline text-slate-400 group-hover:text-slate-200">
        Search notes, tricks, rooms...
      </span>
      <span className="text-[11px] font-medium xl:hidden text-slate-400 group-hover:text-slate-200">
        Search...
      </span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono font-semibold text-slate-400 group-hover:text-white group-hover:border-white/20 transition-colors">
        <span>Ctrl</span>
        <span>K</span>
      </kbd>
    </button>
  );
};
