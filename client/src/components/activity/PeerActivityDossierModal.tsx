import React, { useEffect, useState } from 'react';
import {
  X,
  Clock,
  BookOpen,
  Tv,
  Flame,
  Award,
  Calendar,
  Activity,
  Zap,
  Sparkles,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  BarChart2
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { RoomPeer, PeerDailySummary } from '../../types.js';
import { API_BASE_URL } from '../../config.js';

interface PeerActivityDossierModalProps {
  onNavigateToVideo?: () => void;
  onNavigateToPdf?: () => void;
}

export const PeerActivityDossierModal: React.FC<PeerActivityDossierModalProps> = ({
  onNavigateToVideo,
  onNavigateToPdf
}) => {
  const {
    selectedPeerForDossier,
    closePeerDossier,
    tuneInToPeerVideo,
    tuneInToPeerPdf,
    addToast
  } = useSocket();

  const [peerSummary, setPeerSummary] = useState<PeerDailySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());

  // Clock ticker for live stopwatch calculation
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch detailed peer daily activity summary from server
  useEffect(() => {
    if (!selectedPeerForDossier) {
      setPeerSummary(null);
      return;
    }

    const requestedPeerId = selectedPeerForDossier.userId;
    let isCurrent = true;

    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    setLoadingSummary(true);
    fetch(`${API_BASE_URL}/api/activity/peer-summary?userId=${encodeURIComponent(requestedPeerId)}&date=${localDate}`)
      .then(res => res.json())
      .then((data: PeerDailySummary) => {
        // Ignore responses for a peer that is no longer selected
        if (!isCurrent) return;
        setPeerSummary(data);
      })
      .catch(() => {})
      .finally(() => {
        if (isCurrent) setLoadingSummary(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedPeerForDossier]);

  if (!selectedPeerForDossier) return null;

  const peer = selectedPeerForDossier;

  // Format elapsed time for current running activity
  const formatElapsed = (startTime?: number | null) => {
    if (!startTime) return '00:00';
    const diff = Math.max(0, Math.floor((now - startTime) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    if (h > 0) {
      return `${h}h ${m}m ${s}s`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Format total seconds to readable string
  const formatHoursMinutes = (totalSeconds: number) => {
    if (!totalSeconds || totalSeconds === 0) return '0 mins';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const handleWatchAlong = () => {
    tuneInToPeerVideo(peer);
    closePeerDossier();
    onNavigateToVideo?.();
  };

  const handleReadAlong = () => {
    tuneInToPeerPdf(peer);
    closePeerDossier();
    onNavigateToPdf?.();
  };

  const handleSendHighFive = () => {
    addToast('High-Five Sent! 🙌', `Sent a study boost high-five to ${peer.name}!`, 'success');
  };

  const subjectEntries = Object.entries(peerSummary?.subjectBreakdown || peer.subjectBreakdown || {});
  const totalBreakdownSeconds = subjectEntries.reduce((acc, [, secs]) => acc + secs, 0) || 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col gap-4 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={closePeerDossier}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Close Dossier"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Peer Profile Header */}
        <div className="flex items-center gap-3.5 border-b border-white/10 pb-4">
          <div className="relative">
            <img
              src={peer.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${peer.name}&backgroundColor=6366f1`}
              alt={peer.name}
              className="w-14 h-14 rounded-2xl border-2 border-indigo-500/40 object-cover shadow-lg shadow-indigo-500/20"
            />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-900 animate-pulse" />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-white">{peer.name}</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {peer.targetExam || 'RRB PO & IBPS PO'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {peer.college || 'Study Partner'} • Active in Group
            </p>
          </div>

          <button
            onClick={handleSendHighFive}
            className="p-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1 transition-all"
            title="Send study cheer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Cheer</span>
          </button>
        </div>

        {/* SECTION 1: Current Live Situation & Active Stopwatch */}
        <div className="p-4 bg-slate-950/80 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 shadow-lg shadow-emerald-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                Live Now:
              </span>
              <p className="text-sm font-extrabold text-white mt-0.5">
                {peer.currentActivity || peer.status || 'Ready to Study'}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Elapsed Time:
            </span>
            <p className="font-mono text-xl font-extrabold text-cyan-300">
              {peer.activityStartTime ? formatElapsed(peer.activityStartTime) : 'Idle'}
            </p>
          </div>
        </div>

        {/* SECTION 2: Live Media Watching or Reading (With 1-Click Tune-In) */}
        {(peer.currentVideo || peer.currentDocument) && (
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Current Study Material In Use:</span>
            </h4>

            {/* YouTube Live Video Peek */}
            {peer.currentVideo && (
              <div className="p-3.5 bg-slate-950/90 border border-rose-500/30 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                    <Tv className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-white truncate">
                      {peer.currentVideo.title || 'YouTube Lecture Video'}
                    </p>
                    <p className="text-[11px] font-mono text-rose-300">
                      Timestamp: {Math.floor((peer.currentVideo.currentTime || 0) / 60)}:{(Math.floor(peer.currentVideo.currentTime || 0) % 60).toString().padStart(2, '0')}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleWatchAlong}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/25 transition-all"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>Watch Along</span>
                </button>
              </div>
            )}

            {/* Telegram PDF Document Peek */}
            {peer.currentDocument && (
              <div className="p-3.5 bg-slate-950/90 border border-sky-500/30 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-white truncate">
                      {peer.currentDocument.title || 'Study PDF Notes'}
                    </p>
                    <p className="text-[11px] font-mono text-sky-300">
                      Currently Reading: Page {peer.currentDocument.currentPage || 1}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleReadAlong}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md shadow-sky-600/25 transition-all"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Read Along</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: Today's Total Study Time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-950/60 border border-white/10 rounded-2xl">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Today's Total Hours:</span>
            </span>
            <p className="text-xl font-extrabold text-white mt-1">
              {formatHoursMinutes(peerSummary?.todayStudySeconds ?? peer.todayStudySeconds ?? 0)}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Across {peerSummary?.sessionCount ?? 1} study sessions
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 border border-white/10 rounded-2xl">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Focus Status:</span>
            </span>
            <p className="text-xl font-extrabold text-emerald-400 mt-1">
              {((peerSummary?.todayHours || peer.todayHours || 0) >= 3) ? '🔥 Super Focus' : '✨ Steady Pace'}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Logged in MongoDB Cloud
            </p>
          </div>
        </div>

        {/* SECTION 4: Konse Subject Ko Kitne Time Padha (Subject Breakdown) */}
        <div className="p-4 bg-slate-950/70 border border-white/10 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Today's Subject-Wise Time:</span>
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              {subjectEntries.length} Subjects Studied
            </span>
          </div>

          {subjectEntries.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2 text-center">
              No sessions logged yet today. Live study stopwatch is tracking!
            </p>
          ) : (
            <div className="space-y-2.5">
              {subjectEntries.map(([subject, seconds]) => {
                const percentage = Math.min(100, Math.round((seconds / totalBreakdownSeconds) * 100));
                return (
                  <div key={subject} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium truncate max-w-[240px]">
                        {subject}
                      </span>
                      <span className="font-mono text-indigo-300 font-semibold">
                        {formatHoursMinutes(seconds)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
