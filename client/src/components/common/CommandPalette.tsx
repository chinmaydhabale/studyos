import React, { useState, useEffect } from 'react';
import {
  Search,
  Sparkles,
  Video,
  PenTool,
  FileText,
  Calendar,
  Trophy,
  Play,
  RotateCcw,
  Volume2
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext.js';

interface CommandPaletteProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onNavigateTab: (tab: string) => void;
  onRunAiPrompt: (prompt: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onOpen,
  onClose,
  onNavigateTab,
  onRunAiPrompt
}) => {
  const [query, setQuery] = useState('');
  const { startTimer, resetTimer, setAmbientSound } = useStudy();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        const isTypingInPalette =
          isOpen && (tag === 'input' || tag === 'textarea' || target?.isContentEditable === true);
        if (isTypingInPalette) return;
        e.preventDefault();
        if (isOpen) onClose();
        else onOpen();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    {
      id: 'ai-prompt-current-affairs',
      title: 'AI Coach: "Tomorrow should include 30 minutes of Current Affairs."',
      subtitle: 'Automatically schedule 30m of Current Affairs for tomorrow into calendar',
      icon: Sparkles,
      color: 'text-indigo-400 bg-indigo-500/10',
      run: () => {
        onRunAiPrompt('Tomorrow should include 30 minutes of Current Affairs.');
        onNavigateTab('ai-coach');
      }
    },
    {
      id: 'nav-video',
      title: 'Go to Synchronized Video Lecture Theater',
      subtitle: 'Watch class together with synced play/pause and live voice chat',
      icon: Video,
      color: 'text-cyan-400 bg-cyan-500/10',
      run: () => onNavigateTab('video')
    },
    {
      id: 'nav-split',
      title: 'Split-Screen Mode: Video + Whiteboard / Notes',
      subtitle: 'Dual co-study view to watch lectures while solving equations',
      icon: Video,
      color: 'text-emerald-400 bg-emerald-500/10',
      run: () => onNavigateTab('split')
    },
    {
      id: 'nav-whiteboard',
      title: 'Open Collaborative Whiteboard',
      subtitle: 'Draw equations, shapes, and mind-maps with peers simultaneously',
      icon: PenTool,
      color: 'text-pink-400 bg-pink-500/10',
      run: () => onNavigateTab('whiteboard')
    },
    {
      id: 'nav-notes',
      title: 'Open Collaborative Notes',
      subtitle: 'Live synchronized markdown notes with LaTeX math and code blocks',
      icon: FileText,
      color: 'text-amber-400 bg-amber-500/10',
      run: () => onNavigateTab('notes')
    },
    {
      id: 'action-timer',
      title: 'Start 25-Minute Focus Session',
      subtitle: 'Activate deep focus timer and earn +100 XP upon completion',
      icon: Play,
      color: 'text-emerald-400 bg-emerald-500/10',
      run: () => startTimer()
    },
    {
      id: 'action-rain',
      title: 'Play Gentle Rain Ambience',
      subtitle: 'Turn on soothing background monsoon rain sound',
      icon: Volume2,
      color: 'text-cyan-400 bg-cyan-500/10',
      run: () => setAmbientSound('rain')
    },
    {
      id: 'nav-calendar',
      title: 'Open GitHub-Style Study Activity Calendar',
      subtitle: 'Review strong days, weak days, and 7-day study streak',
      icon: Calendar,
      color: 'text-indigo-400 bg-indigo-500/10',
      run: () => onNavigateTab('calendar')
    },
    {
      id: 'nav-leaderboard',
      title: 'View Multi-Tier Leaderboards',
      subtitle: 'Compare rankings across Friends, Room, College, City, and Global',
      icon: Trophy,
      color: 'text-yellow-400 bg-yellow-500/10',
      run: () => onNavigateTab('leaderboards')
    }
  ];

  const filtered = actions.filter(
    (a) =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.subtitle.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-xl bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-slate-950/50">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command or ask AI Coach (e.g., 'Tomorrow should include 30 minutes of Current Affairs')..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (filtered.length > 0) {
                  filtered[0].run();
                  onClose();
                } else if (query.trim()) {
                  onRunAiPrompt(query);
                  onNavigateTab('ai-coach');
                  onClose();
                }
              }
            }}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] font-mono text-slate-400">ESC</kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {query.trim() && !filtered.some(a => a.id === 'ai-prompt-current-affairs') && (
            <button
              onClick={() => {
                onRunAiPrompt(query);
                onNavigateTab('ai-coach');
                onClose();
              }}
              className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors group"
            >
              <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  Ask AI Coach: "{query}"
                </p>
                <p className="text-[11px] text-slate-400">
                  Parse schedule or solve doubt instantly
                </p>
              </div>
            </button>
          )}

          {filtered.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => {
                  action.run();
                  onClose();
                }}
                className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors group"
              >
                <div className={`p-2 rounded-lg ${action.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                    {action.title}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {action.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-slate-950/60 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
          <span>Tip: You can paste any YouTube URL or schedule prompt directly</span>
          <span>Press Enter to select</span>
        </div>
      </div>
    </div>
  );
};
