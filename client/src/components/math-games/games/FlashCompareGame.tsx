import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scale,
  Sparkles,
  ArrowLeft,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Clock,
  ArrowLeftRight
} from 'lucide-react';
import { CompareQuestion, DifficultyLevel, GameSummary } from '../types.js';
import { generateCompareQuestion } from '../engines/mathEngine.js';
import { mathSounds } from '../engines/mathSoundEffects.js';
import { ComboStreakBadge } from '../shared/ComboStreakBadge.js';
import { GameOverModal } from '../shared/GameOverModal.js';

interface FlashCompareGameProps {
  onBackToHub: () => void;
}

export const FlashCompareGame: React.FC<FlashCompareGameProps> = ({ onBackToHub }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [isMultiOp, setIsMultiOp] = useState<boolean>(false);
  const [currentQ, setCurrentQ] = useState<CompareQuestion | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [questionsAnswered, setQuestionsAnswered] = useState<Array<CompareQuestion & { userAnswer: string; isCorrect: boolean }>>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
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
    setTimeLeft(60);
    setQuestionsAnswered([]);
    setFeedback(null);
    setGameSummary(null);

    const q = generateCompareQuestion(difficulty, isMultiOp);
    setCurrentQ(q);
    setIsPlaying(true);
  }, [difficulty, isMultiOp]);

  const finishGame = useCallback(() => {
    setIsPlaying(false);
    const total = questionsAnswered.length;
    const correct = questionsAnswered.filter((q) => q.isCorrect).length;
    const wrong = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const earnedXp = Math.max(10, Math.floor(score * 0.8) + maxStreak * 4);

    setGameSummary({
      mode: 'compare',
      totalQuestions: total,
      correctCount: correct,
      wrongCount: wrong,
      score,
      accuracy,
      highestStreak: maxStreak,
      avgTimePerQuestionMs: 1600,
      xpEarned: earnedXp,
      coinsEarned: Math.floor(earnedXp / 4),
      questionsReview: questionsAnswered.map((q) => ({
        prompt: `${q.leftExpr}  vs  ${q.rightExpr}`,
        userAnswer: q.userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect: q.isCorrect
      }))
    });
  }, [questionsAnswered, score, maxStreak]);

  const finishGameRef = useRef(finishGame);
  finishGameRef.current = finishGame;

  // Timer loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          finishGameRef.current();
          return 0;
        }
        if (prev <= 10) mathSounds.playTick();
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleChoice = useCallback((choice: '<' | '=' | '>') => {
    if (!currentQ || feedback !== null) return;
    mathSounds.playClick();

    const isCorrect = choice === currentQ.correctAnswer;
    const record = {
      ...currentQ,
      userAnswer: choice,
      isCorrect
    };

    setQuestionsAnswered((prev) => [...prev, record]);

    if (isCorrect) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > maxStreak) setMaxStreak(nextStreak);
      const points = 10 + (nextStreak >= 5 ? 15 : nextStreak >= 3 ? 8 : 0);
      setScore((prev) => prev + points);
      setFeedback('correct');
      mathSounds.playCorrect(nextStreak);
    } else {
      setStreak(0);
      setFeedback('wrong');
      mathSounds.playWrong();
    }

    setTimeout(() => {
      setFeedback(null);
      setCurrentQ(generateCompareQuestion(difficulty, isMultiOp));
    }, 200);
  }, [currentQ, feedback, streak, maxStreak, difficulty, isMultiOp]);

  // Keyboard navigation: Left Arrow (<), Down Arrow (=), Right Arrow (>)
  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        handleChoice('<');
      } else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
        handleChoice('=');
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        handleChoice('>');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, handleChoice]);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 text-slate-100 animate-in fade-in duration-200">
      
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-xl">
        <button
          type="button"
          onClick={() => {
            if (isPlaying && window.confirm('Exit Flash Compare game?')) {
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
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-600 flex items-center justify-center text-white shadow-md">
            <Scale className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
            Flash Compare (&lt; = &gt;)
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
            <h3 className="text-xl font-black text-white">Rapid Expression Comparison</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Compare two mathematical expressions in split seconds. Essential for Data Interpretation and Quantitative Estimation!
            </p>
          </div>

          {/* Complexity Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Expression Complexity</label>
              <span className="text-[11px] text-teal-400 font-semibold">
                {isMultiOp ? 'Multi-Op Expressions' : 'Single Op Expressions'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/70 border border-white/10 rounded-2xl">
              <button
                type="button"
                onClick={() => setIsMultiOp(false)}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                  !isMultiOp
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Single Op</span>
                <span className="text-[10px] opacity-75 px-1.5 py-0.5 rounded bg-black/30">14 × 6 vs 15²</span>
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
                <span className="text-[10px] opacity-75 px-1.5 py-0.5 rounded bg-black/30">a × b - c</span>
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
                  { id: 'easy', label: 'Easy', tag: 'Beginner', desc: '1-2 digits, warm-up', color: 'border-emerald-500/50 text-emerald-400 bg-emerald-950/20' },
                  { id: 'medium', label: 'Medium', tag: 'Intermediate', desc: 'Competitive speed', color: 'border-cyan-500/50 text-cyan-400 bg-cyan-950/20' },
                  { id: 'hard', label: 'Hard', tag: 'Exam Beast', desc: 'Close estimations', color: 'border-amber-500/50 text-amber-400 bg-amber-950/20' },
                  { id: 'extreme', label: 'Extreme Hard', tag: 'God Level', desc: 'Razor-thin margins', color: 'border-rose-500/50 text-rose-400 bg-rose-950/20' }
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
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-white/10 font-bold">{d.tag}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-snug">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={startNewGame}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black text-base sm:text-lg shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 border border-emerald-400/30 transition-all active:scale-[0.99]"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>START 60s FLASH COMPARE</span>
          </button>
        </div>
      )}

      {/* Active Game Stage */}
      {isPlaying && currentQ && (
        <div className="flex flex-col gap-4">
          
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 bg-slate-900/80 border border-white/10 rounded-2xl p-3 shadow-xl text-center items-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Score</span>
              <div className="text-xl sm:text-2xl font-black text-emerald-400">{score}</div>
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
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Time Left</span>
              <div
                className={`text-xl sm:text-2xl font-black font-mono flex items-center justify-center gap-1 ${
                  timeLeft <= 10 ? 'text-rose-400 animate-pulse' : 'text-cyan-400'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{timeLeft}s</span>
              </div>
            </div>
          </div>

          {/* Comparison Arena Card */}
          <div
            className={`bg-slate-900/90 border rounded-3xl p-6 sm:p-10 shadow-2xl flex flex-col items-center justify-center gap-6 transition-all duration-150 ${
              feedback === 'correct'
                ? 'border-emerald-500 bg-emerald-950/20'
                : feedback === 'wrong'
                ? 'border-rose-500 bg-rose-950/20 animate-shake'
                : 'border-white/10'
            }`}
          >
            <div className="w-full flex items-center justify-around gap-4 text-center">
              
              {/* Left Expr */}
              <div className="flex-1 p-4 sm:p-6 rounded-2xl bg-slate-950/70 border border-white/10 flex flex-col items-center justify-center shadow-inner">
                <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Left Side</span>
                <span className="text-2xl sm:text-4xl font-black font-mono text-cyan-300">
                  {currentQ.leftExpr}
                </span>
              </div>

              {/* VS Divider */}
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-xs font-black text-slate-400 shrink-0">
                VS
              </div>

              {/* Right Expr */}
              <div className="flex-1 p-4 sm:p-6 rounded-2xl bg-slate-950/70 border border-white/10 flex flex-col items-center justify-center shadow-inner">
                <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">Right Side</span>
                <span className="text-2xl sm:text-4xl font-black font-mono text-purple-300">
                  {currentQ.rightExpr}
                </span>
              </div>

            </div>
          </div>

          {/* 3 Large Decision Buttons: <, =, > */}
          <div className="grid grid-cols-3 gap-3 bg-slate-900/80 border border-white/10 rounded-3xl p-4 shadow-xl select-none">
            <button
              type="button"
              onClick={() => handleChoice('<')}
              className="h-20 sm:h-24 rounded-2xl bg-slate-950/80 hover:bg-cyan-600/30 border border-white/10 hover:border-cyan-400 active:scale-95 text-3xl sm:text-5xl font-black font-mono text-cyan-400 shadow-xl flex flex-col items-center justify-center gap-1 transition-all"
            >
              <span>&lt;</span>
              <span className="text-[10px] font-sans font-bold text-slate-400">Left is Smaller</span>
            </button>

            <button
              type="button"
              onClick={() => handleChoice('=')}
              className="h-20 sm:h-24 rounded-2xl bg-slate-950/80 hover:bg-amber-600/30 border border-white/10 hover:border-amber-400 active:scale-95 text-3xl sm:text-5xl font-black font-mono text-amber-400 shadow-xl flex flex-col items-center justify-center gap-1 transition-all"
            >
              <span>=</span>
              <span className="text-[10px] font-sans font-bold text-slate-400">Both are Equal</span>
            </button>

            <button
              type="button"
              onClick={() => handleChoice('>')}
              className="h-20 sm:h-24 rounded-2xl bg-slate-950/80 hover:bg-purple-600/30 border border-white/10 hover:border-purple-400 active:scale-95 text-3xl sm:text-5xl font-black font-mono text-purple-400 shadow-xl flex flex-col items-center justify-center gap-1 transition-all"
            >
              <span>&gt;</span>
              <span className="text-[10px] font-sans font-bold text-slate-400">Left is Bigger</span>
            </button>
          </div>

          <div className="text-center text-[11px] text-slate-500">
            Keyboard shortcuts: <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">←</kbd> for &lt;, <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">↓</kbd> for =, <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">→</kbd> for &gt;
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
