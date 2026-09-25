import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  Clock,
  CheckCircle,
  Coffee,
  BookOpen,
  Zap,
  Activity,
  UserCheck,
  ChevronRight,
  Flame,
  Award,
  Tv,
  BarChart2,
  Eye,
  ExternalLink
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { useStudy } from '../../context/StudyContext.js';

interface LiveSituationTrackerProps {
  onNavigateToTab?: (tab: string) => void;
}

export const RRB_IBPS_ACTIVITIES = [
  // RRB & IBPS PO Core Subjects
  { id: 'quant', name: '📐 Quantitative Aptitude (Quant)', category: 'study' as const, color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10' },
  { id: 'reasoning', name: '🧩 Reasoning Ability (Puzzles)', category: 'study' as const, color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' },
  { id: 'english', name: '📖 English Language (Reading & Cloze)', category: 'study' as const, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  { id: 'ga', name: '🌍 General Awareness & Current Affairs', category: 'study' as const, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  { id: 'computer', name: '💻 Computer Aptitude', category: 'study' as const, color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  { id: 'banking', name: '🏦 Banking & Financial Awareness', category: 'study' as const, color: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
  { id: 'mock', name: '📝 Full Mock Test / Analysis', category: 'study' as const, color: 'text-pink-400 border-pink-500/30 bg-pink-500/10' },
  { id: 'descriptive', name: '✍️ Descriptive Writing', category: 'study' as const, color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },

  // Extra Personal & Rest Situations
  { id: 'break', name: '☕ Short Break (Tea / Water)', category: 'break' as const, color: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  { id: 'rest', name: '🛋️ Rest / Power Nap', category: 'break' as const, color: 'text-slate-300 border-slate-500/30 bg-slate-500/10' },
  { id: 'chatting', name: '💬 Group Discussion / Chatting', category: 'personal' as const, color: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' },
  { id: 'music', name: '🎵 Listening to Focus Music', category: 'personal' as const, color: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' },
  { id: 'chores', name: '🏠 Homebased Work / Chores', category: 'personal' as const, color: 'text-rose-300 border-rose-500/30 bg-rose-500/10' },
  { id: 'doubts', name: '🎯 Doubts Revision with Partner', category: 'study' as const, color: 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10' }
];

export const LiveSituationTracker: React.FC<LiveSituationTrackerProps> = ({ onNavigateToTab }) => {
  const {
    currentUser,
    peers,
    socket,
    roomId,
    addToast,
    openPeerDossier,
    tuneInToPeerPdf,
    tuneInToPeerVideo
  } = useSocket();

  const { triggerCelebration } = useStudy();

  const [selectedActivity, setSelectedActivity] = useState<string>(RRB_IBPS_ACTIVITIES[0].name);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [activeActivityName, setActiveActivityName] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<'study' | 'break' | 'personal'>('study');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [clockNow, setClockNow] = useState<number>(Date.now());

  // Continuous 1-second ticker so remote peers' elapsed times tick live even when local user is idle
  useEffect(() => {
    const timer = setInterval(() => {
      setClockNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedSeconds = isTimerRunning && startTime ? Math.max(0, Math.floor((clockNow - startTime) / 1000)) : 0;

  // Start an activity
  const handleStartActivity = (activityToStart?: string) => {
    const actName = activityToStart || selectedActivity;
    const actDef = RRB_IBPS_ACTIVITIES.find(a => a.name === actName) || RRB_IBPS_ACTIVITIES[0];
    
    const now = Date.now();
    setStartTime(now);
    setActiveActivityName(actDef.name);
    setActiveCategory(actDef.category);
    setIsTimerRunning(true);

    // Broadcast to room via socket
    socket?.emit('activity:start', {
      roomId,
      userId: currentUser.id,
      userName: currentUser.name,
      activityName: actDef.name,
      category: actDef.category
    });

    addToast(
      'Live Situation Updated',
      `Started ${actDef.name}. Timer is counting. Room members can see your live situation!`,
      actDef.category === 'break' ? 'warning' : 'success'
    );
  };

  // Stop an activity
  const handleStopActivity = () => {
    if (!isTimerRunning) return;

    // Compute the true duration at the moment the user stops, not the last tick
    const duration = startTime ? Math.max(0, Math.floor((Date.now() - startTime) / 1000)) : elapsedSeconds;
    const actName = activeActivityName;
    const cat = activeCategory;

    setIsTimerRunning(false);
    setStartTime(null);

    // Local calendar day so the server can book the session against the user's day
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Notify socket to record session and stop peer timer.
    // The server is the single source of XP for activity sessions, so we do NOT
    // award XP here — we only fire the celebration.
    socket?.emit('activity:stop', {
      roomId,
      userId: currentUser.id,
      userName: currentUser.name,
      activityName: actName,
      category: cat,
      durationSeconds: duration,
      localDate
    });

    if (cat === 'study' && duration >= 30) {
      triggerCelebration();
    }

    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    addToast(
      'Activity Finished & Saved',
      `Completed ${timeStr} of ${actName}! Time logged into analytics.`,
      'info'
    );
  };

  const formatStopwatch = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Format remote peer elapsed time
  const getPeerElapsed = (peerStartTime?: number | null) => {
    if (!peerStartTime) return '00:00';
    const diff = Math.max(0, Math.floor((clockNow - peerStartTime) / 1000));
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl space-y-4">
      
      {/* Top Banner: Your Live Situation Control */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
        
        {/* Left info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Activity className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-white">Live Situation & Subject Tracker</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                RRB / IBPS PO Track
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Update what you're doing right now. The timer runs continuously until you stop!
            </p>
          </div>
        </div>

        {/* Center/Right: Active Running Timer or Selector */}
        <div className="flex flex-wrap items-center gap-3">
          
          {isTimerRunning ? (
            /* Active Stopwatch Controls */
            <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-2xl border border-emerald-500/40 shadow-lg shadow-emerald-500/10">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  Active: {activeActivityName}
                </span>
                <p className="text-2xl font-mono font-extrabold text-white tracking-wider">
                  {formatStopwatch(elapsedSeconds)}
                </p>
              </div>

              <button
                onClick={handleStopActivity}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all ml-2"
                title="Stop current activity and log study hours"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>Stop & Save</span>
              </button>
            </div>
          ) : (
            /* Activity Selector + Start Button */
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedActivity}
                onChange={(e) => setSelectedActivity(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-xs text-white focus:outline-none focus:border-indigo-400 font-medium max-w-xs"
              >
                <optgroup label="RRB & IBPS PO Subjects">
                  {RRB_IBPS_ACTIVITIES.filter(a => a.category === 'study').map(a => (
                    <option key={a.id} value={a.name} className="bg-slate-900 text-white">
                      {a.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Personal / Breaks">
                  {RRB_IBPS_ACTIVITIES.filter(a => a.category !== 'study').map(a => (
                    <option key={a.id} value={a.name} className="bg-slate-900 text-white">
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              </select>

              <button
                onClick={() => handleStartActivity()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start Activity</span>
              </button>
            </div>
          )}

        </div>

      </div>

      {/* Quick Switch Chips (Fast one-click subject & break buttons) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
          Quick Switch:
        </span>
        {RRB_IBPS_ACTIVITIES.slice(0, 6).map((act) => (
          <button
            key={act.id}
            onClick={() => {
              if (isTimerRunning) {
                handleStopActivity();
              }
              handleStartActivity(act.name);
            }}
            className={`px-3 py-1.5 rounded-xl border font-semibold shrink-0 transition-all hover:scale-105 ${act.color} ${
              activeActivityName === act.name && isTimerRunning ? 'ring-2 ring-white/50 scale-105' : ''
            }`}
          >
            {act.name.split('(')[0]}
          </button>
        ))}
      </div>

      {/* Group Members Live Situation Feed (See what everyone is studying right now!) */}
      <div className="bg-slate-950/70 p-3 rounded-xl border border-white/5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>Group Members' Live Situation Feed</span>
          </span>
          <span className="text-[11px] text-slate-500">{peers.length} active in room</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {peers.map((peer) => {
            const isMe = peer.userId === currentUser.id;
            const currentAct = isMe && isTimerRunning ? activeActivityName : (peer.currentActivity || peer.status || 'Idle 💤');
            const currentCategory = isMe && isTimerRunning
              ? activeCategory
              : (peer.activityCategory || (currentAct.includes('Break') || currentAct.includes('Rest') ? 'break' : currentAct === 'Idle 💤' || currentAct === 'Ready to Study' ? 'personal' : 'study'));
            const isStudying = currentCategory === 'study' && currentAct !== 'Idle 💤' && currentAct !== 'Ready to Study';
            const isBreak = currentCategory === 'break' || currentAct.includes('Break') || currentAct.includes('Rest');
            const hasDoc = peer.currentDocument && peer.currentDocument.title;
            const hasVideo = peer.currentVideo && peer.currentVideo.title;
            const todayStudyMins = peer.todayStudySeconds ? Math.floor(peer.todayStudySeconds / 60) : 0;

            return (
              <div
                key={peer.userId}
                onClick={() => openPeerDossier(peer)}
                className={`p-3 rounded-2xl border flex flex-col justify-between gap-2.5 cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:border-indigo-500/40 hover:shadow-lg ${
                  isMe
                    ? 'bg-indigo-950/30 border-indigo-500/30 hover:border-indigo-400/50'
                    : 'bg-slate-900/80 border-white/5 hover:bg-slate-900'
                }`}
              >
                {/* Header: Avatar, Name & Live Elapsed Timer */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <img
                        src={peer.avatar}
                        alt={peer.name}
                        className="w-8 h-8 rounded-full border border-white/10"
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-900 ${
                          isStudying ? 'bg-emerald-400 animate-pulse' : isBreak ? 'bg-amber-400' : 'bg-slate-500'
                        }`}
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span>{peer.name}</span>
                        {isMe && <span className="text-[10px] text-indigo-400 font-normal">(You)</span>}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
                        {currentAct}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                      isStudying ? 'bg-emerald-500/10 text-emerald-300' : isBreak ? 'bg-amber-500/10 text-amber-300' : 'bg-white/5 text-slate-400'
                    }`}>
                      {isMe ? formatStopwatch(elapsedSeconds) : getPeerElapsed(peer.activityStartTime)}
                    </span>
                  </div>
                </div>

                {/* Live PDF Document Peek (if studying/reading a document) */}
                {hasDoc && (
                  <div className="p-2 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between gap-2 animate-in fade-in duration-200">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-[11px] text-indigo-200 font-medium truncate">
                        {peer.currentDocument?.title}
                        <span className="text-[10px] text-indigo-400 font-mono ml-1">
                          (p. {peer.currentDocument?.currentPage || 1})
                        </span>
                      </span>
                    </div>
                    {!isMe && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          tuneInToPeerPdf(peer);
                          onNavigateToTab?.('pdf');
                        }}
                        className="px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold shrink-0 transition-colors shadow-sm"
                        title="Open same PDF and jump to this page"
                      >
                        Read Along
                      </button>
                    )}
                  </div>
                )}

                {/* Live YouTube Video Peek (if watching a video) */}
                {hasVideo && (
                  <div className="p-2 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-between gap-2 animate-in fade-in duration-200">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Tv className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="text-[11px] text-rose-200 font-medium truncate">
                        {peer.currentVideo?.title || 'YouTube Study Lecture'}
                      </span>
                    </div>
                    {!isMe && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          tuneInToPeerVideo(peer);
                          onNavigateToTab?.('video');
                        }}
                        className="px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold shrink-0 transition-colors shadow-sm"
                        title="Tune into friend's synchronized lecture"
                      >
                        Watch Along
                      </button>
                    )}
                  </div>
                )}

                {/* Bottom Stats & Activity Dossier Trigger */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px]">
                  <div className="flex items-center gap-2 text-slate-400">
                    {peer.todayHours !== undefined && peer.todayHours > 0 ? (
                      <span className="flex items-center gap-1 text-amber-300 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        <Flame className="w-3 h-3 text-amber-400" />
                        <span>{peer.todayHours}h studied today</span>
                      </span>
                    ) : todayStudyMins > 0 ? (
                      <span className="flex items-center gap-1 text-cyan-300 font-semibold bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                        <Flame className="w-3 h-3 text-cyan-400" />
                        <span>{todayStudyMins}m today</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">No sessions logged yet</span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openPeerDossier(peer);
                    }}
                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
                  >
                    <BarChart2 className="w-3 h-3" />
                    <span>Dossier</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
