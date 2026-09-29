import React, { useState } from 'react';
import {
  Trophy,
  X,
  Award,
  Sparkles,
  CheckCircle2,
  Zap,
  Target,
  BarChart2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { API_BASE_URL } from '../../config.js';
import { useSocket } from '../../context/SocketContext.js';

interface MockScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPlatform?: string;
  onSaved?: () => void;
}

const POPULAR_PLATFORMS = [
  'Guidely',
  'Testbook',
  'Oliveboard',
  'PracticeMock',
  'Adda247',
  'Smartkeeda',
  'Career Power',
  'Other'
];

export const MockScoreModal: React.FC<MockScoreModalProps> = ({
  isOpen,
  onClose,
  defaultPlatform = 'Guidely',
  onSaved
}) => {
  const { currentUser, roomId, addToast } = useSocket();

  const [platform, setPlatform] = useState(defaultPlatform);
  const [testTitle, setTestTitle] = useState('');
  const [score, setScore] = useState('');
  const [totalMarks, setTotalMarks] = useState('80');
  const [attempted, setAttempted] = useState('');
  const [totalQuestions, setTotalQuestions] = useState('80');
  const [accuracy, setAccuracy] = useState('');
  const [percentile, setPercentile] = useState('');
  const [timeTakenMinutes, setTimeTakenMinutes] = useState('60');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Auto-calculate accuracy if attempted and score are filled
  const handleScoreChange = (val: string) => {
    setScore(val);
    const numScore = parseFloat(val);
    const numAttempted = parseFloat(attempted);
    if (!isNaN(numScore) && !isNaN(numAttempted) && numAttempted > 0) {
      const estimatedAccuracy = Math.min(100, Math.max(0, Math.round((numScore / numAttempted) * 100)));
      if (!accuracy) setAccuracy(estimatedAccuracy.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!score || !totalMarks) {
      addToast('Missing Score', 'Please enter your score and total marks', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/mock/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          userName: currentUser.name || 'Student',
          roomId,
          platform,
          testTitle: testTitle.trim() || `${platform} Mock Test`,
          score: parseFloat(score),
          totalMarks: parseFloat(totalMarks),
          accuracy: accuracy ? parseFloat(accuracy) : Math.round((parseFloat(score) / (parseFloat(attempted) || parseFloat(totalMarks))) * 100),
          percentile: percentile ? parseFloat(percentile) : undefined,
          attemptedQuestions: attempted ? parseInt(attempted) : undefined,
          totalQuestions: totalQuestions ? parseInt(totalQuestions) : undefined,
          timeTakenMinutes: timeTakenMinutes ? parseInt(timeTakenMinutes) : undefined
        })
      });

      if (!res.ok) {
        throw new Error('Failed to save mock test score');
      }

      // Celebrate!
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {}

      addToast(
        '🏆 Scorecard Saved!',
        `Recorded ${score}/${totalMarks} on ${platform}. Earned +150 XP!`,
        'success'
      );

      if (onSaved) onSaved();
      onClose();
    } catch (err: any) {
      addToast('Error', err.message || 'Could not save scorecard', 'alert');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden flex flex-col gap-4">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Record Mock Test Score</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300">
                  +150 XP
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Log your performance from Guidely, Testbook, Oliveboard, etc.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Platform Picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Mock Portal / Provider
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {POPULAR_PLATFORMS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`py-1.5 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                    platform === p
                      ? 'bg-amber-600 text-white border-amber-500 shadow-md font-bold'
                      : 'bg-slate-950/60 text-slate-400 border-white/5 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Test Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Test Name / Description
            </label>
            <input
              type="text"
              placeholder="e.g. RRB PO Prelims Live Mock #4"
              value={testTitle}
              onChange={e => setTestTitle(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Score & Total Marks */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Marks Obtained *
              </label>
              <input
                type="number"
                step="0.25"
                placeholder="e.g. 64.25"
                value={score}
                onChange={e => handleScoreChange(e.target.value)}
                required
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm font-semibold text-emerald-400 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Total Marks *
              </label>
              <input
                type="number"
                placeholder="80 or 100"
                value={totalMarks}
                onChange={e => setTotalMarks(e.target.value)}
                required
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Accuracy & Percentile */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Attempted Qs
              </label>
              <input
                type="number"
                placeholder="e.g. 68"
                value={attempted}
                onChange={e => setAttempted(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Accuracy %
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 92.5"
                value={accuracy}
                onChange={e => setAccuracy(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-cyan-400 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Percentile %
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 96.4"
                value={percentile}
                onChange={e => setPercentile(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-amber-400 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-amber-600 hover:bg-amber-500 active:scale-95 text-white shadow-lg shadow-amber-600/30 transition-all disabled:opacity-50"
            >
              <Award className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save & Share with Room'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
