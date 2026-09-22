import React, { useState } from 'react';
import { User, Lock, KeyRound, Check, X, Shield, ArrowRight, UserPlus, LogIn, Sparkles } from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose
}) => {
  const { currentUser, isAuthenticated, loginUser, registerUser } = useSocket();
  const [tab, setTab] = useState<'login' | 'signup'>(isAuthenticated ? 'login' : 'signup');

  // Login form state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form state
  const [name, setName] = useState(currentUser.name || '');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [targetExam, setTargetExam] = useState(currentUser.targetExam || 'RRB PO & Clerk');
  const [city, setCity] = useState(currentUser.city || '');
  const [selectedAvatarSeed, setSelectedAvatarSeed] = useState('Scholar');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const exams = [
    'RRB PO & Clerk (Regional Rural Bank)',
    'IBPS PO / Clerk (Public Sector Banks)',
    'SBI PO / Clerk (State Bank of India)',
    'RBI Grade B / Assistant',
    'SSC CGL / CHSL',
    'UPSC CSE / State PCS',
    'College Studies & Engineering'
  ];

  const avatarSeeds = ['Scholar', 'Priya', 'Chinmay', 'Aarav', 'Rahul', 'Sneha', 'Ananya', 'Vikram'];

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setError('Please enter both username and password.');
      return;
    }
    setLoading(true);
    try {
      await loginUser(loginUsername.trim(), loginPassword);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!signupUsername.trim() || !signupPassword.trim() || !name.trim()) {
      setError('Full Name, Username, and Password are all required.');
      return;
    }
    if (signupUsername.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (signupPassword.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setLoading(true);
    try {
      const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(selectedAvatarSeed)}&backgroundColor=6366f1`;
      await registerUser({
        username: signupUsername.trim(),
        password: signupPassword,
        name: name.trim(),
        targetExam,
        city: city.trim() || 'India',
        avatar: avatarUrl
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Account creation failed. Username may already exist.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col gap-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {isAuthenticated && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-1.5">
              StudyOS Student Authentication
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Permanent
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Cloud-persisted in MongoDB Atlas. Login anytime with your unique username & password.
            </p>
          </div>
        </div>

        {/* Tabs: Sign In / Create Account */}
        <div className="flex p-1 bg-slate-950/70 border border-white/10 rounded-2xl">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === 'login'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('signup'); setError(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all ${
              tab === 'signup'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Account</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs flex items-center gap-2">
            <span className="font-bold">Error:</span> {error}
          </div>
        )}

        {/* TAB 1: LOGIN FORM */}
        {tab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Username:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. rohit_po"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value.toLowerCase())}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl pl-9 pr-3.5 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Password:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  placeholder="Enter your account password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl pl-9 pr-3.5 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In to StudyOS'}
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-center text-slate-500 text-[11px] pt-1">
              New here? <button type="button" onClick={() => setTab('signup')} className="text-indigo-400 hover:underline">Create a permanent account</button>
            </p>
          </form>
        )}

        {/* TAB 2: SIGNUP FORM */}
        {tab === 'signup' && (
          <form onSubmit={handleSignupSubmit} className="space-y-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
            
            {/* Avatar Selector */}
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Choose Avatar:
              </label>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {avatarSeeds.map((seed) => {
                  const url = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&backgroundColor=6366f1`;
                  const isSelected = selectedAvatarSeed === seed;
                  return (
                    <button
                      key={seed}
                      type="button"
                      onClick={() => setSelectedAvatarSeed(seed)}
                      className={`p-1 rounded-2xl border transition-all shrink-0 ${
                        isSelected 
                          ? 'border-cyan-400 bg-cyan-400/20 shadow-md shadow-cyan-400/20 scale-105' 
                          : 'border-white/10 bg-slate-950/60 hover:border-white/25'
                      }`}
                    >
                      <img src={url} alt={seed} className="w-9 h-9 rounded-xl" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Full Name */}
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Full Name:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chinmay Dhabale"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-3.5 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* City */}
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  City / State:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pune, Maharashtra"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-3.5 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Username */}
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Permanent Username:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    @
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="chinmay_po"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-2xl pl-7 pr-3.5 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Create Password:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <KeyRound className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="Min 4 characters"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-2xl pl-8 pr-3.5 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Target Exam */}
            <div>
              <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Target Banking Exam:
              </label>
              <select
                value={targetExam}
                onChange={(e) => setTargetExam(e.target.value)}
                className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-3.5 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                {exams.map((ex) => (
                  <option key={ex} value={ex} className="bg-slate-900 text-white">
                    {ex}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? 'Creating Permanent Account...' : 'Create Account & Start Studying'}
              <Check className="w-4 h-4" />
            </button>

            <p className="text-center text-slate-500 text-[11px] pt-1">
              Already have an account? <button type="button" onClick={() => setTab('login')} className="text-indigo-400 hover:underline">Sign In here</button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
