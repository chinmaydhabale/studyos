import React, { useState, useRef, useEffect } from 'react';
import {
  Users,
  Copy,
  Check,
  ChevronDown,
  Sparkles,
  ArrowRightLeft,
  Radio,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { useSocket } from '../../../context/SocketContext.js';

export const RoomContextChip: React.FC = () => {
  const {
    roomId,
    currentUser,
    peers,
    isConnected,
    setIsRoomModalOpen,
    openPeerDossier,
    addToast
  } = useSocket();

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const copyRoomId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!roomId) return;
    navigator.clipboard?.writeText(roomId);
    setCopied(true);
    addToast('Group ID Copied!', `Group ID "${roomId}" is in your clipboard. Share with friends!`, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative select-none" ref={containerRef}>
      
      {/* Sleek Room Context Pill */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/80 border border-white/10 hover:border-cyan-500/30 text-xs shadow-sm transition-all group"
        title="Study Room Status & Roster"
      >
        {/* Pulsing Live Connection Indicator */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isConnected
                ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse'
                : 'bg-rose-400 animate-ping'
            }`}
          />
          <span className="font-mono font-bold text-white text-xs tracking-tight group-hover:text-cyan-300 transition-colors truncate max-w-[70px] sm:max-w-[100px]">
            {roomId || 'Join Room'}
          </span>
        </div>

        {/* Peer Count Badge */}
        {roomId && (
          <div className="flex items-center gap-1 bg-white/5 px-1.5 py-0.5 rounded-lg border border-white/10 text-[10px] text-cyan-300 font-semibold shrink-0">
            <Users className="w-3 h-3 text-cyan-400" />
            <span>{peers.length}</span>
          </div>
        )}

        <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : ''}`} />
      </button>

      {/* Room Roster & Quick Actions Popover */}
      {isOpen && (
        <div className="fixed inset-x-3 top-[56px] sm:top-auto sm:inset-x-auto sm:absolute sm:left-0 sm:mt-2 w-auto sm:w-72 max-w-[calc(100vw-24px)] rounded-3xl bg-[#0b101e]/95 backdrop-blur-2xl border border-white/15 p-3.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-3 text-slate-100">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>Study Room Hub</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20">
              {isConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          {/* Current Room ID & Copy Link */}
          <div className="p-3 bg-slate-950/70 border border-white/5 rounded-2xl flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Current Room ID</span>
              <p className="font-mono text-sm font-black text-cyan-300 truncate">{roomId || 'No Room'}</p>
            </div>

            <button
              type="button"
              onClick={copyRoomId}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
              title="Copy Room ID to Clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {/* Active Buddies in Room */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 px-1">
              Active Buddies ({peers.length})
            </span>

            <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar">
              {peers.length === 0 ? (
                <div className="p-3 rounded-xl bg-white/5 text-center text-xs text-slate-500">
                  No other peers in this room yet.
                </div>
              ) : (
                peers.map((peer) => (
                  <button
                    key={peer.userId}
                    type="button"
                    onClick={() => {
                      openPeerDossier(peer);
                      setIsOpen(false);
                    }}
                    className="w-full p-2 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-between gap-2 text-left transition-colors group/peer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img src={peer.avatar} alt={peer.name} className="w-6 h-6 rounded-lg shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate group-hover/peer:text-cyan-300">
                          {peer.name} {peer.userId === currentUser.id && <span className="text-[10px] text-indigo-400 font-normal">(You)</span>}
                        </p>
                        <p className="text-[10px] text-emerald-400 truncate font-mono">
                          {peer.currentActivity || peer.status || 'Ready to Study'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-cyan-400 shrink-0 opacity-0 group-hover/peer:opacity-100 transition-opacity">
                      Dossier →
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Switch Room Action Button */}
          <button
            type="button"
            onClick={() => {
              setIsRoomModalOpen(true);
              setIsOpen(false);
            }}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Switch or Create Room</span>
          </button>

        </div>
      )}

    </div>
  );
};
