import React, { useState } from 'react';
import { Users, Plus, LogIn, Key, Copy, Check, AlertCircle, X, Sparkles, Shield } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';

interface RoomGatewayModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const RoomGatewayModal: React.FC<RoomGatewayModalProps> = ({
  isOpen,
  onClose
}) => {
  const { roomId, createGroup, joinGroup, addToast } = useSocket();
  const [tab, setTab] = useState<'join' | 'create'>('join');

  // Join state
  const [inputRoomId, setInputRoomId] = useState('');

  // Create state
  const [groupName, setGroupName] = useState('');
  const [targetExam, setTargetExam] = useState('RRB PO & Clerk');
  const [voicePassword, setVoicePassword] = useState('study123');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!inputRoomId.trim()) {
      setError('Please enter the Group ID to join.');
      return;
    }

    setLoading(true);
    const result = await joinGroup(inputRoomId.trim().toUpperCase());
    setLoading(false);

    if (!result.success) {
      setError(result.message || 'Invalid Group ID. This room does not exist.');
    } else {
      if (onClose) onClose();
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!groupName.trim()) {
      setError('Please enter a name for your study group.');
      return;
    }

    setLoading(true);
    try {
      await createGroup(groupName.trim(), targetExam, voicePassword.trim() || 'study123');
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const copyCurrentRoomId = () => {
    if (!roomId) return;
    navigator.clipboard?.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast('Group ID Copied!', `Share code "${roomId}" with your study partner.`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col gap-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-1.5">
              Study Group Gateway
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                Unique IDs
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Each study room is strictly protected by a unique ID. No one can join without your Room ID.
            </p>
          </div>
        </div>

        {/* Current Room Info Banner if already in a room */}
        {roomId && (
          <div className="p-3 bg-slate-950/70 border border-cyan-500/20 rounded-2xl flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-slate-400 font-medium">Currently in Group:</p>
              <p className="font-mono text-sm font-bold text-cyan-300">{roomId}</p>
            </div>
            <button
              onClick={copyCurrentRoomId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-semibold border border-cyan-500/30 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy ID'}</span>
            </button>
          </div>
        )}

        {/* Tabs: Join by ID vs Create New Group */}
        <div className="flex p-1 bg-slate-950/70 border border-white/10 rounded-2xl">
          <button
            type="button"
            onClick={() => { setTab('join'); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === 'join'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Join Group by ID</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('create'); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === 'create'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Group</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: JOIN GROUP BY ID */}
        {tab === 'join' && (
          <form onSubmit={handleJoinSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Enter Unique Group ID:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Key className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. RRB-7225 or IBPS-8419"
                  value={inputRoomId}
                  onChange={(e) => setInputRoomId(e.target.value.toUpperCase().trim())}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl pl-9 pr-3.5 py-3 text-white font-mono text-sm tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                🔒 You can only enter this room if your partner gave you their exact Group ID.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold rounded-2xl shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? 'Verifying Room ID...' : 'Enter Study Group'}
              <LogIn className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* TAB 2: CREATE NEW STUDY GROUP */}
        {tab === 'create' && (
          <form onSubmit={handleCreateSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Group Name:
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Mission RRB PO 2026 Batch"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-3.5 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Target Banking Exam:
              </label>
              <select
                value={targetExam}
                onChange={(e) => setTargetExam(e.target.value)}
                className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="RRB PO & Clerk">RRB PO & Clerk</option>
                <option value="IBPS PO / Clerk">IBPS PO / Clerk</option>
                <option value="SBI PO / Clerk">SBI PO / Clerk</option>
                <option value="RBI Grade B">RBI Grade B</option>
                <option value="General Banking Aspirants">General Banking Aspirants</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Voice Room Password (Default: study123):
              </label>
              <input
                type="text"
                placeholder="study123"
                value={voicePassword}
                onChange={(e) => setVoicePassword(e.target.value)}
                className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-3.5 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? 'Creating Group...' : 'Generate Unique Group ID & Enter'}
              <Sparkles className="w-4 h-4" />
            </button>
          </form>
        )}

        {!roomId && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-center text-xs text-slate-500 hover:text-indigo-400 transition-colors py-1 underline decoration-dotted"
          >
            Or browse solo study tools & vault for now →
          </button>
        )}
      </div>
    </div>
  );
};
