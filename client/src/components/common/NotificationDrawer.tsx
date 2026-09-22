import React from 'react';
import {
  Bell,
  X,
  Clock,
  CheckCircle,
  Flame,
  AlertTriangle,
  UserCheck,
  ChevronRight
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onNavigateTab
}) => {
  const { notifications, dismissNotification } = useSocket();

  // Curated proactive system reminders
  const systemReminders = [
    {
      id: 'sys-rem-1',
      title: 'Friend Studying Live',
      message: 'Aarav Patel started studying "Physics - Thermodynamics" in room study-room-alpha.',
      type: 'info',
      icon: UserCheck,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      action: () => onNavigateTab('video'),
      actionText: 'Join Lecture'
    },
    {
      id: 'sys-rem-2',
      title: 'Assigned Task Pending',
      message: 'Task "30 minutes of Current Affairs" is scheduled for tomorrow at 09:00 AM.',
      type: 'warning',
      icon: Clock,
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
      action: () => onNavigateTab('ai-coach'),
      actionText: 'View in AI Planner'
    },
    {
      id: 'sys-rem-3',
      title: 'Maintain Your 7-Day Streak 🔥',
      message: 'Complete today\'s planned Calculus session to preserve your 7-day study streak!',
      type: 'alert',
      icon: Flame,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      action: () => onNavigateTab('calendar'),
      actionText: 'View Calendar'
    },
    {
      id: 'sys-rem-4',
      title: 'Time for Spaced Revision',
      message: 'Organic Chemistry Reaction Mechanisms are due for review today.',
      type: 'info',
      icon: CheckCircle,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      action: () => onNavigateTab('ai-coach'),
      actionText: 'Review Flashcards'
    }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-slate-900/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">StudyOS Notifications</h3>
            <p className="text-xs text-slate-400">Smart accountability & study reminders</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* Dynamic Socket Notifications */}
        {notifications.length > 0 && (
          <div>
            <span className="text-[11px] uppercase tracking-wider font-semibold text-indigo-400 mb-2 block">
              Recent Live Updates
            </span>
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-xl bg-slate-800/80 border border-white/10 relative group"
                >
                  <button
                    onClick={() => dismissNotification(n.id)}
                    className="absolute top-2 right-2 text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-semibold text-white">{n.title}</h4>
                    <span className="text-[10px] text-slate-400">{n.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{n.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Intelligent Scheduled Reminders */}
        <div>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2 block">
            Accountability & Reminders
          </span>
          <div className="space-y-2.5">
            {systemReminders.map((rem) => {
              const Icon = rem.icon;
              return (
                <div
                  key={rem.id}
                  className={`p-3.5 rounded-xl border ${rem.color} transition-all`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-xs font-semibold text-white">{rem.title}</h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{rem.message}</p>
                      
                      <button
                        onClick={() => {
                          rem.action();
                          onClose();
                        }}
                        className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-white px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
                      >
                        <span>{rem.actionText}</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 bg-slate-950/60 text-center">
        <p className="text-[11px] text-slate-500">
          Intelligent AI alerts active • Syncing with StudyOS Engine
        </p>
      </div>

    </div>
  );
};
