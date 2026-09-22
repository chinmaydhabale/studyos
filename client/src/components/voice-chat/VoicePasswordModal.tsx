import React, { useState } from 'react';
import { Lock, Unlock, X, ShieldCheck, AlertCircle } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { API_BASE_URL } from '../../config.js';

interface VoicePasswordModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export const VoicePasswordModal: React.FC<VoicePasswordModalProps> = ({
  isOpen,
  onSuccess,
  onClose
}) => {
  const { roomId, addToast } = useSocket();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);

    // Verify password with server
    fetch(`${API_BASE_URL}/api/voice/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, password })
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.success) {
          addToast('Voice Chat Unlocked! 🎙️', 'Microphone enabled. You can now talk with your study partner.', 'success');
          onSuccess();
          onClose();
        } else {
          setError(data.message || 'Incorrect room password. (Hint: study123)');
        }
      })
      .catch(() => {
        setError('Server error verifying password.');
      })
      .finally(() => setIsVerifying(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col gap-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/25">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-white">Voice Room Password Protection</h2>
            <p className="text-xs text-slate-400">Voice chat is paused by default to prevent distractions</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-xl border border-white/5">
          🛡️ To maintain a deep focus study environment, two-way audio discussion requires the room passkey. Enter the password to unlock microphone and live voice.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Enter Room Voice Password:
            </label>
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password (e.g. study123)..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Room: {roomId}</span>
            <span>Default Passkey: <strong className="text-indigo-400 font-mono">study123</strong></span>
          </div>

          <button
            type="submit"
            disabled={isVerifying || !password}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-rose-500/20 transition-all flex items-center justify-center gap-2 mt-2"
          >
            <Unlock className="w-4 h-4" />
            <span>{isVerifying ? 'Verifying...' : 'Unlock Voice Chat'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
