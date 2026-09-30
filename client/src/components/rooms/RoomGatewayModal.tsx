import React, { useState, useEffect } from 'react';
import { Users, Plus, LogIn, Key, Copy, Check, AlertCircle, X, Sparkles, Compass, RefreshCw, ArrowRight } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { API_BASE_URL } from '../../config.js';
import { StudyGroup } from '../../types.js';

interface RoomGatewayModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const RoomGatewayModal: React.FC<RoomGatewayModalProps> = ({
  isOpen,
  onClose
}) => {
  const { roomId, createGroup, joinGroup, addToast } = useSocket();
  const [tab, setTab] = useState<'browse' | 'join' | 'create'>('browse');

  // Browse state
  const [availableRooms, setAvailableRooms] = useState<StudyGroup[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Join state
  const [inputRoomId, setInputRoomId] = useState('');

  // Create state
  const [groupName, setGroupName] = useState('');
  const [targetExam, setTargetExam] = useState('RRB PO & Clerk');
  const [voicePassword, setVoicePassword] = useState('study123');

  const [loading, setLoading] = useState(false);
  // Which quick-join row is currently in flight, so only that button spins.
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchRooms = async () => {
    try {
      setLoadingRooms(true);
      const res = await fetch(`${API_BASE_URL}/api/rooms`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.groups)) {
          setAvailableRooms(data.groups);
        }
      }
    } catch (err) {
      console.warn('Failed to load study rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRooms();
    }
  }, [isOpen]);

  // Close on Escape when the modal is dismissible.
  useEffect(() => {
    if (!isOpen || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleQuickJoin = async (targetId: string) => {
    setError(null);
    setLoading(true);
    setJoiningRoomId(targetId);
    const result = await joinGroup(targetId);
    setLoading(false);
    setJoiningRoomId(null);
    if (!result.success) {
      setError(result.message || `Failed to enter group ${targetId}`);
    } else {
      if (onClose) onClose();
    }
  };

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => onClose?.()}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col gap-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
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
                Live Groups
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Join active study rooms with fellow banking aspirants or create your own room.
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

        {/* Tabs: Browse vs Join by ID vs Create New Group */}
        <div className="flex p-1 bg-slate-950/70 border border-white/10 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => { setTab('browse'); setError(null); fetchRooms(); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === 'browse'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Browse Groups</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('join'); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === 'join'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Join by ID</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('create'); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === 'create'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 0: BROWSE ACTIVE GROUPS */}
        {tab === 'browse' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Available Study Rooms ({availableRooms.length})</span>
              <button
                type="button"
                onClick={fetchRooms}
                disabled={loadingRooms}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${loadingRooms ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {loadingRooms && availableRooms.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-cyan-400" />
                  Loading active groups...
                </div>
              ) : availableRooms.length === 0 ? (
                <div className="py-8 text-center bg-slate-950/40 rounded-2xl border border-white/5 p-4">
                  <p className="text-xs text-slate-400 mb-2">No active groups found yet.</p>
                  <button
                    type="button"
                    onClick={() => setTab('create')}
                    className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors"
                  >
                    Create First Group
                  </button>
                </div>
              ) : (
                availableRooms.map((room) => {
                  const isCurrent = room.roomId === roomId;
                  return (
                    <div
                      key={room.roomId}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-cyan-500/10 border-cyan-500/40'
                          : 'bg-slate-950/60 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="text-xs font-bold text-white truncate">{room.name}</h4>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 font-semibold shrink-0">
                            {room.roomId}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="truncate">{room.targetExam || 'Banking'}</span>
                          <span>•</span>
                          <span className="truncate">By {room.creatorName || 'Aspirant'}</span>
                        </div>
                      </div>

                      <div>
                        {isCurrent ? (
                          <span className="text-[11px] font-bold text-cyan-400 px-2.5 py-1 rounded-xl bg-cyan-400/10 border border-cyan-400/30">
                            Current
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleQuickJoin(room.roomId)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-cyan-600/20 transition-all disabled:opacity-50"
                          >
                            {joiningRoomId === room.roomId ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Joining…</span>
                              </>
                            ) : (
                              <>
                                <span>Join</span>
                                <ArrowRight className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
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
                  placeholder="e.g. STUDY-ROOM-ALPHA or RRB-7225"
                  value={inputRoomId}
                  onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl pl-9 pr-3.5 py-3 text-white font-mono text-sm tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                🔒 Enter any Group ID shared by your study partner or coach.
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
              {loading ? 'Creating Group...' : 'Generate Group & Enter'}
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
