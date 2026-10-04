import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Sparkles,
  ArrowLeft,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock
} from 'lucide-react';
import { DetectiveQuestion, DifficultyLevel, GameSummary } from '../types.js';
import { generateDetectiveQuestion } from '../engines/mathEngine.js';
import { mathSounds } from '../engines/mathSoundEffects.js';
import { ComboStreakBadge } from '../shared/ComboStreakBadge.js';
import { GameOverModal } from '../shared/GameOverModal.js';

interface EquationDetectiveProps {
  onBackToHub: () => void;
}

export const EquationDetective: React.FC<EquationDetectiveProps> = ({ onBackToHub }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [isMultiOp, setIsMultiOp] = useState<boolean>(false);
  const [currentQ, setCurrentQ] = useState<DetectiveQuestion | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState<Array<DetectiveQuestion & { userAnswer: string; isCorrect: boolean }>>([]);
  const [questionsLeft, setQuestionsLeft] = useState(12);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [gameSummary, setGameSummary] = useState<GameSummary | null>(null);
  const [isMuted, setIsMuted] = useState(mathSounds.getMuted());

  const toggleMute = () => {
    const next = !isMuted;
    mathSounds.setMuted(next);
    setIsMuted(next);
  };

  const startNewGame = useCallback(() => {
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setQuestionsAnswered([]);
    setQuestionsLeft(12);
    setFeedback(null);
    setSelectedOpt(null);
    setGameSummary(null);

    const q = generateDetectiveQuestion(difficulty, isMultiOp);
    setCurrentQ(q);
    setIsPlaying(true);
  }, [difficulty, isMultiOp]);

  const finishGame = useCallback((results: Array<DetectiveQuestion & { userAnswer: string; isCorrect: boolean }>, finalScore: number, finalStreak: number) => {
    setIsPlaying(false);
    const total = results.length;
    const correct = results.filter((r) => r.isCorrect).length;
    const wrong = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const earnedXp = Math.max(12, Math.floor(finalScore * 0.8) + finalStreak * 5);

    setGameSummary({
      mode: 'detective',
      totalQuestions: total,
      correctCount: correct,
      wrongCount: wrong,
      score: finalScore,
      accuracy,
      highestStreak: finalStreak,
      avgTimePerQuestionMs: 2200,
      xpEarned: earnedXp,
      coinsEarned: Math.floor(earnedXp / 4),
      questionsReview: results.map((r) => ({
        prompt: r.prompt,
        userAnswer: r.userAnswer,
        correctAnswer: r.correctAnswer,
        isCorrect: r.isCorrect
      }))
    });
  }, []);

  const handleSelectOption = (opt: string) => {
    if (!currentQ || feedback !== null) return;
    mathSounds.playClick();
    setSelectedOpt(opt);

    const isCorrect = opt === currentQ.correctAnswer;
    const record = {
      ...currentQ,
      userAnswer: opt,
      isCorrect
    };

    const updated = [...questionsAnswered, record];
    setQuestionsAnswered(updated);

    let nextScore = score;
    let nextMaxStreak = maxStreak;

    if (isCorrect) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > maxStreak) {
        nextMaxStreak = nextStreak;
        setMaxStreak(nextStreak);
      }
      nextScore = score + (nextStreak >= 5 ? 25 : nextStreak >= 3 ? 18 : 12);
      setScore(nextScore);
      setFeedback('correct');
      mathSounds.playCorrect(nextStreak);
    } else {
      setStreak(0);
      setFeedback('wrong');
      mathSounds.playWrong();
    }

    const nextLeft = questionsLeft - 1;
    setQuestionsLeft(nextLeft);

    if (nextLeft <= 0) {
      setTimeout(() => {
        finishGame(updated, nextScore, nextMaxStreak);
      }, 600);
      return;
    }

    setTimeout(() => {
      setFeedback(null);
      setSelectedOpt(null);
      setCurrentQ(generateDetectiveQuestion(difficulty, isMultiOp));
    }, 400);
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 text-slate-100 animate-in fade-in duration-200">
      
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-xl">
        <button
          type="button"
          onClick={() => {
            if (isPlaying && window.confirm('Exit Equation Detective?')) {
              setIsPlaying(false);
              onBackToHub();
            } else if (!isPlaying) {
              onBackToHub();
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold border border-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Hub</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md">
            <Search className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
            Equation Detective
          </span>
        </div>

        <button
          type="button"
          onClick={toggleMute}
          className={`p-2 rounded-xl border transition-colors ${
            isMuted
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
          }`}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Intro */}
      {!isPlaying && (
        <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6 text-center">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-white">Find The Missing Link!</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Test your BODMAS and operational balance agility. Deduce missing signs (+, -, ×, ÷) and missing operands under pressure!
            </p>
          </div>

          {/* Complexity Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Equation Complexity</label>
              <span className="text-[11px] text-cyan-400 font-semibold">
                {isMultiOp ? 'Multi-Op Equation' : 'Single Op Equation'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/70 border border-white/10 rounded-2xl">
              <button
                type="button"
                onClick={() => setIsMultiOp(false)}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                  !isMultiOp
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Single Op</span>
                <span className="text-[10px] opacity-75 px-1.5 py-0.5 rounded bg-black/30">a [ ? ] b = c</span>
              </button>
              <button
                type="button"
                onClick={() => setIsMultiOp(true)}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                  isMultiOp
                    ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Multi-Op (BODMAS)</span>
                <span className="text-[10px] opacity-75 px-1.5 py-0.5 rounded bg-black/30">a × [ ? ] - b = c</span>
              </button>
            </div>
          </div>

          {/* Difficulty Tier (4 Scaled Levels) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Difficulty Level</label>
              <span className="text-[11px] text-slate-400 font-medium">4 Scaled Tiers</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(
                [
                  { id: 'easy', label: 'Easy', tag: 'Beginner', desc: '1-digit factors, basic signs', color: 'border-emerald-500/50 text-emerald-400 bg-emerald-950/20' },
                  { id: 'medium', label: 'Medium', tag: 'Intermediate', desc: 'Standard 2-digit deduction', color: 'border-cyan-500/50 text-cyan-400 bg-cyan-950/20' },
                  { id: 'hard', label: 'Hard', tag: 'Exam Beast', desc: 'Multi-digit & mixed ops', color: 'border-amber-500/50 text-amber-400 bg-amber-950/20' },
                  { id: 'extreme', label: 'Extreme Hard', tag: 'God Level', desc: 'Intense BODMAS mystery', color: 'border-rose-500/50 text-rose-400 bg-rose-950/20' }
                ] as const
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDifficulty(d.id)}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    difficulty === d.id
                      ? `${d.color} shadow-lg ring-1 ring-white/20 scale-[1.02]`
                      : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs sm:text-sm">{d.label}</span>
                    <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-white/10 font-bold">{d.tag}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-snug">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 border border-white/5 rounded-2xl max-w-sm mx-auto font-mono text-lg sm:text-xl font-bold text-cyan-300">
            {isMultiOp ? '14 × [ ? ] - 18 = 94' : '18  [ ? ]  3  =  54'}
          </div>

          <button
            type="button"
            onClick={startNewGame}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-black text-base sm:text-lg shadow-xl shadow-cyan-950/60 flex items-center justify-center gap-2 border border-cyan-400/30 transition-all active:scale-[0.99]"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>START 12-QUESTION DETECTIVE SPRINT</span>
          </button>
        </div>
      )}

      {/* Active Game */}
      {isPlaying && currentQ && (
        <div className="flex flex-col gap-4">
          
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 bg-slate-900/80 border border-white/10 rounded-2xl p-3 shadow-xl text-center items-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Score</span>
              <div className="text-xl sm:text-2xl font-black text-cyan-400">{score}</div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Streak</span>
              {streak >= 3 ? (
                <ComboStreakBadge streak={streak} />
              ) : (
                <div className="text-xl sm:text-2xl font-black text-amber-400">{streak}</div>
              )}
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Remaining</span>
              <div className="text-xl sm:text-2xl font-black font-mono text-purple-400">
                {questionsLeft} / 12
              </div>
            </div>
          </div>

          {/* Question Stage Card */}
          <div
            className={`bg-slate-900/90 border rounded-3xl p-8 sm:p-12 shadow-2xl flex flex-col items-center justify-center gap-5 transition-all duration-150 ${
              feedback === 'correct'
                ? 'border-emerald-500 bg-emerald-950/20'
                : feedback === 'wrong'
                ? 'border-rose-500 bg-rose-950/20 animate-shake'
                : 'border-white/10'
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              {currentQ.type === 'missing_op' ? 'Deduce Missing Operator' : 'Deduce Missing Number'}
            </span>

            <div className="text-3xl sm:text-5xl font-black font-mono tracking-tight text-white text-center py-2">
              {currentQ.prompt}
            </div>
          </div>

          {/* 4 Options Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/80 border border-white/10 rounded-3xl p-4 shadow-xl">
            {currentQ.options.map((opt, idx) => {
              const isSelected = selectedOpt === opt;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectOption(opt)}
                  disabled={feedback !== null}
                  className={`h-16 sm:h-20 rounded-2xl border font-mono font-bold text-2xl sm:text-3xl transition-all shadow-lg flex items-center justify-center ${
                    isSelected && feedback === 'correct'
                      ? 'bg-emerald-600 border-emerald-400 text-white scale-102'
                      : isSelected && feedback === 'wrong'
                      ? 'bg-rose-600 border-rose-400 text-white'
                      : 'bg-slate-950/70 hover:bg-indigo-600/30 border-white/10 hover:border-cyan-400 text-white active:scale-95'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

        </div>
      )}

      {/* Summary Modal */}
      {gameSummary && (
        <GameOverModal
          summary={gameSummary}
          onPlayAgain={startNewGame}
          onExit={() => {
            setGameSummary(null);
            setIsPlaying(false);
          }}
        />
      )}

    </div>
  );
};
