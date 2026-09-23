import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Mic,
  MicOff,
  Sparkles,
  Clock,
  MessageSquare,
  Bot,
  Lock,
  Unlock,
  PanelRightClose,
  BookOpen
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';

interface VoiceChatPanelProps {
  currentVideoTime?: number;
  onSeekVideo?: (delta: number) => void;
  mode?: 'video' | 'pdf' | 'general';
  activePdfTitle?: string;
  activePdfPage?: number;
  onJumpPdfPage?: (page: number) => void;
  onClose?: () => void;
  title?: string;
}

export const VoiceChatPanel: React.FC<VoiceChatPanelProps> = ({
  currentVideoTime = 0,
  mode = 'video',
  activePdfTitle,
  activePdfPage,
  onJumpPdfPage,
  onClose,
  title
}) => {
  const {
    chatMessages,
    sendChatMessage,
    peers,
    currentUser,
    isMicMuted,
    toggleMic,
    isVoiceUnlocked,
    sendVideoSeek,
    addToast
  } = useSocket();

  const [inputText, setInputText] = useState('');
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const [isAskingAi, setIsAskingAi] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = (asAiDoubt: boolean = false) => {
    if (!inputText.trim()) return;

    if (mode === 'pdf') {
      sendChatMessage(
        inputText,
        undefined,
        asAiDoubt || isAskingAi,
        includeTimestamp && activePdfPage ? { pdfPage: activePdfPage, pdfDocTitle: activePdfTitle } : undefined
      );
    } else {
      sendChatMessage(
        inputText,
        includeTimestamp ? Math.floor(currentVideoTime) : undefined,
        asAiDoubt || isAskingAi
      );
    }

    if (asAiDoubt || isAskingAi) {
      addToast(
        'Doubt Sent to AI Teacher',
        mode === 'pdf'
          ? `AI Teacher is analyzing Page ${activePdfPage || 1}...`
          : 'AI Teacher is analyzing this lecture timestamp...',
        'info'
      );
    }

    setInputText('');
    setIsAskingAi(false);
  };

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl h-full">
      
      {/* Top Bar: Peer Voice Presence & Security Gate */}
      <div className="p-3 border-b border-white/10 bg-slate-950/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider truncate max-w-[140px] sm:max-w-none">
            {title || (mode === 'pdf' ? 'PDF Discussion & Doubts' : 'Live Discussion & Doubts')}
          </h3>
        </div>
        
        <div className="flex items-center gap-1.5">
          {/* Voice Lock / Unlock Button */}
          <button
            onClick={toggleMic}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
              !isVoiceUnlocked
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                : isMicMuted
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 animate-pulse'
            }`}
            title={!isVoiceUnlocked ? 'Voice chat locked by default. Click to enter password' : 'Toggle Mic'}
          >
            {!isVoiceUnlocked ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Voice Locked</span>
              </>
            ) : isMicMuted ? (
              <>
                <MicOff className="w-3.5 h-3.5" />
                <span>Muted</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>Live</span>
              </>
            )}
          </button>

          {/* Close / Collapse Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Hide Chat (Full Screen Reading)"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Active Study Buddies Presence Bar with Live Situations */}
      <div className="px-3 py-2 bg-slate-950/40 border-b border-white/5 flex items-center gap-3 overflow-x-auto shrink-0">
        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">In Room:</span>
        {peers.map((peer) => (
          <div key={peer.userId} className="flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <img
                src={peer.avatar}
                alt={peer.name}
                className={`w-7 h-7 rounded-full border-2 ${
                  !peer.isMuted
                    ? 'border-emerald-400 shadow-sm shadow-emerald-400/50'
                    : 'border-slate-700'
                }`}
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-900 ${
                  !peer.isMuted ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
            </div>
            <div className="text-[11px]">
              <p className="font-semibold text-white leading-tight">{peer.name.split(' ')[0]}</p>
              <p className="text-[9px] text-slate-400 truncate max-w-[90px]">
                {peer.currentActivity || peer.status}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Chat Messages Stream */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {chatMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <Bot className="w-8 h-8 text-indigo-400/50 mb-2" />
            <p className="text-xs font-medium text-slate-300">Start the group discussion!</p>
            <p className="text-[11px] text-slate-500 mt-1">
              {mode === 'pdf'
                ? 'Discuss formulas, questions, or ask the AI Teacher directly about any page.'
                : 'Voice chat is paused by default. Unlock with password or type doubts freely!'}
            </p>
          </div>
        )}

        {chatMessages.map((msg) => {
          const isMe = msg.userId === currentUser.id;
          const isAi = msg.userId === 'ai_coach' || msg.isAiDoubt;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {!isMe && (
                  <img
                    src={msg.userAvatar}
                    alt={msg.userName}
                    className="w-4 h-4 rounded-full"
                  />
                )}
                <span className="text-[10px] font-semibold text-slate-400">
                  {msg.userName}
                </span>

                {/* Clickable Video Timestamp Chip */}
                {msg.videoTimestamp !== undefined && (
                  <button
                    onClick={() => sendVideoSeek(msg.videoTimestamp!)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 text-[10px] font-mono font-medium border border-indigo-500/30 transition-colors"
                    title="Click to jump video to this timestamp for both students"
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <span>{formatTimestamp(msg.videoTimestamp)}</span>
                  </button>
                )}

                {/* Clickable PDF Page Chip */}
                {msg.pdfPage !== undefined && (
                  <button
                    onClick={() => onJumpPdfPage?.(msg.pdfPage!)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 text-[10px] font-mono font-bold border border-cyan-500/30 transition-colors"
                    title={`Click to jump PDF to Page ${msg.pdfPage}`}
                  >
                    <BookOpen className="w-2.5 h-2.5" />
                    <span>P. {msg.pdfPage}</span>
                  </button>
                )}
              </div>

              {/* Message Bubble */}
              <div
                className={`max-w-[90%] p-2.5 rounded-2xl text-xs leading-relaxed ${
                  isAi
                    ? 'bg-gradient-to-br from-indigo-950/80 to-slate-900 border border-indigo-500/30 text-indigo-100 shadow-lg'
                    : isMe
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-slate-800 text-slate-200 border border-white/5 rounded-tl-sm'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={chatScrollRef} />
      </div>

      {/* Chat Input & AI Doubt Solver Integration */}
      <div className="p-2.5 bg-slate-950 border-t border-white/10 flex flex-col gap-2 shrink-0">
        
        <div className="flex items-center justify-between text-[11px]">
          {mode === 'pdf' ? (
            activePdfPage ? (
              <label className="flex items-center gap-1.5 text-slate-400 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTimestamp}
                  onChange={(e) => setIncludeTimestamp(e.target.checked)}
                  className="rounded bg-slate-800 border-white/10 text-cyan-600 focus:ring-0"
                />
                <span>Attach Page (<span className="text-cyan-400 font-mono font-bold">P. {activePdfPage}</span>)</span>
              </label>
            ) : (
              <span className="text-slate-500">Live Peer Discussion</span>
            )
          ) : (
            <label className="flex items-center gap-1.5 text-slate-400 hover:text-white cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeTimestamp}
                onChange={(e) => setIncludeTimestamp(e.target.checked)}
                className="rounded bg-slate-800 border-white/10 text-indigo-600 focus:ring-0"
              />
              <span>Attach Timestamp (<span className="text-cyan-400 font-mono">{formatTimestamp(currentVideoTime)}</span>)</span>
            </label>
          )}

          <button
            type="button"
            onClick={() => setIsAskingAi(!isAskingAi)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] transition-colors ${
              isAskingAi
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>{mode === 'pdf' && activePdfPage ? `Ask AI (P.${activePdfPage})` : 'Ask AI Teacher'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder={
              isAskingAi
                ? mode === 'pdf'
                  ? `Ask AI doubt about Page ${activePdfPage || ''}...`
                  : "Ask AI doubt about this video moment..."
                : mode === 'pdf'
                ? "Type doubt or question (use /ai for teacher)..."
                : "Type message or doubt (use /ai to ask coach)..."
            }
            className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />

          <button
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim()}
            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all shadow-md shadow-indigo-500/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

      </div>

    </div>
  );
};
