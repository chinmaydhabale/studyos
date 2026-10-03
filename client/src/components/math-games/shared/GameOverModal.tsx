import React, { useEffect, useState } from 'react';
import {
  Trophy,
  Award,
  Zap,
  Clock,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Coins,
  Flame,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { GameSummary } from '../types.js';
import { mathSounds } from '../engines/mathSoundEffects.js';
import { useStudy } from '../../../context/StudyContext.js';

interface GameOverModalProps {
  summary: GameSummary;
  onPlayAgain: () => void;
  onExit: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  summary,
  onPlayAgain,
  onExit
}) => {
  const { addXp, triggerCelebration } = useStudy();
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    mathSounds.playVictory();
    if (summary.xpEarned > 0) {
      addXp(summary.xpEarned, `Math Speed Game: ${summary.mode}`);
    }
    if (summary.accuracy >= 75 || summary.highestStreak >= 5) {
      triggerCelebration();
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col gap-5 text-slate-100 relative">
        
        {/* Header Hero Banner */}
        <div className="text-center space-y-2 pt-2">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 via-indigo-600 to-cyan-400 mx-auto flex items-center justify-center shadow-xl shadow-indigo-500/20 ring-4 ring-white/10">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Round Complete!</h2>
          <p className="text-xs text-slate-400">
            Mental math session finished. Here is your speed & accuracy breakdown:
          </p>
        </div>

        {/* Big Score Card */}
        <div className="bg-gradient-to-br from-indigo-950/60 via-slate-950 to-purple-950/40 border border-indigo-500/30 rounded-2xl p-4 flex items-center justify-around shadow-inner">
          <div className="text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Final Score</span>
            <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-300">
              {summary.score}
            </div>
          </div>
          <div className="h-10 w-px bg-white/10" />
          <div className="text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">XP Earned</span>
            <div className="text-2xl font-black text-amber-400 flex items-center justify-center gap-1">
              <Zap className="w-5 h-5 fill-amber-400" />
              <span>+{summary.xpEarned}</span>
            </div>
          </div>
          <div className="h-10 w-px bg-white/10" />
          <div className="text-center">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Coins</span>
            <div className="text-2xl font-black text-yellow-300 flex items-center justify-center gap-1">
              <Coins className="w-5 h-5" />
              <span>+{summary.coinsEarned}</span>
            </div>
          </div>
        </div>

        {/* 4 Performance Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-950/60 border border-white/5 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500">Accuracy</span>
            <div className={`text-lg font-black mt-0.5 ${summary.accuracy >= 80 ? 'text-emerald-400' : summary.accuracy >= 60 ? 'text-amber-400' : 'text-rose-400'}`}>
              {summary.accuracy}%
            </div>
            <span className="text-[10px] text-slate-400">{summary.correctCount} / {summary.totalQuestions}</span>
          </div>

          <div className="bg-slate-950/60 border border-white/5 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500">Max Streak</span>
            <div className="text-lg font-black text-amber-400 mt-0.5 flex items-center justify-center gap-0.5">
              <Flame className="w-4 h-4 fill-amber-400" />
              <span>{summary.highestStreak}</span>
            </div>
            <span className="text-[10px] text-slate-400">Consecutive</span>
          </div>

          <div className="bg-slate-950/60 border border-white/5 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500">Speed / Q</span>
            <div className="text-lg font-black text-cyan-400 mt-0.5 flex items-center justify-center gap-0.5">
              <Clock className="w-4 h-4" />
              <span>{(summary.avgTimePerQuestionMs / 1000).toFixed(1)}s</span>
            </div>
            <span className="text-[10px] text-slate-400">Avg solve time</span>
          </div>

          <div className="bg-slate-950/60 border border-white/5 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500">Errors</span>
            <div className="text-lg font-black text-rose-400 mt-0.5">
              {summary.wrongCount}
            </div>
            <span className="text-[10px] text-slate-400">Missed</span>
          </div>
        </div>

        {/* Collapsible Question Review Sheet */}
        {summary.questionsReview.length > 0 && (
          <div className="border border-white/10 rounded-2xl overflow-hidden bg-slate-950/40">
            <button
              type="button"
              onClick={() => setShowReview(!showReview)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white transition-colors"
            >
              <span>Review Attempted Questions ({summary.questionsReview.length})</span>
              {showReview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showReview && (
              <div className="p-3 border-t border-white/5 max-h-52 overflow-y-auto space-y-1.5 custom-scrollbar text-xs">
                {summary.questionsReview.map((q, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-2 rounded-xl border ${
                      q.isCorrect ? 'bg-emerald-950/20 border-emerald-500/20' : 'bg-rose-950/20 border-rose-500/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {q.isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="font-mono text-slate-200">{q.prompt}</span>
                    </div>

                    <div className="text-right font-mono">
                      {q.isCorrect ? (
                        <span className="text-emerald-400 font-bold">{q.userAnswer}</span>
                      ) : (
                        <span className="text-rose-400">
                          <span className="line-through text-slate-500 mr-1.5">{q.userAnswer || 'Timed out'}</span>
                          <span className="text-emerald-400 font-bold">{q.correctAnswer}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onPlayAgain}
            className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold text-sm shadow-xl shadow-indigo-950/60 flex items-center justify-center gap-2 border border-indigo-400/30 transition-all active:scale-98"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Play Again</span>
          </button>

          <button
            type="button"
            onClick={onExit}
            className="px-5 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-semibold text-sm border border-white/10 transition-colors flex items-center justify-center gap-1.5"
          >
            <span>Hub</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
