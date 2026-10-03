import React, { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Sparkles,
  ArrowLeft,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  HelpCircle,
  Check,
  Undo2,
  X,
  Trophy,
  Flame
} from 'lucide-react';
import { Target24Question, GameSummary } from '../types.js';
import { generateTarget24Question, evaluateMathExpression } from '../engines/target24Engine.js';
import { mathSounds } from '../engines/mathSoundEffects.js';
import { GameOverModal } from '../shared/GameOverModal.js';

interface Target24GameProps {
  onBackToHub: () => void;
}

export const Target24Game: React.FC<Target24GameProps> = ({ onBackToHub }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQ, setCurrentQ] = useState<Target24Question | null>(null);
  const [usedCardIndices, setUsedCardIndices] = useState<number[]>([]);
  const [tokens, setTokens] = useState<Array<{ type: 'num' | 'op' | 'paren'; val: string; cardIndex?: number }>>([]);
  const [score, setScore] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successAnimation, setSuccessAnimation] = useState(false);
  const [gameSummary, setGameSummary] = useState<GameSummary | null>(null);
  const [isMuted, setIsMuted] = useState(mathSounds.getMuted());

  const toggleMute = () => {
    const next = !isMuted;
    mathSounds.setMuted(next);
    setIsMuted(next);
  };

  const startNewGame = useCallback(() => {
    setScore(0);
    setSolvedCount(0);
    setStreak(0);
    setMaxStreak(0);
    setUsedCardIndices([]);
    setTokens([]);
    setHintUsed(false);
    setShowHint(false);
    setErrorMsg(null);
    setGameSummary(null);

    const q = generateTarget24Question();
    setCurrentQ(q);
    setIsPlaying(true);
  }, []);

  const handleCardClick = (num: number, index: number) => {
    if (usedCardIndices.includes(index)) return;
    mathSounds.playClick();
    setErrorMsg(null);
    setTokens((prev) => [...prev, { type: 'num', val: String(num), cardIndex: index }]);
    setUsedCardIndices((prev) => [...prev, index]);
  };

  const handleOperatorClick = (op: string) => {
    mathSounds.playClick();
    setErrorMsg(null);
    setTokens((prev) => [...prev, { type: 'op', val: op }]);
  };

  const handleParenClick = (paren: '(' | ')') => {
    mathSounds.playClick();
    setErrorMsg(null);
    setTokens((prev) => [...prev, { type: 'paren', val: paren }]);
  };

  const handleUndo = () => {
    mathSounds.playClick();
    setErrorMsg(null);
    if (tokens.length === 0) return;
    const lastToken = tokens[tokens.length - 1];
    if (lastToken.cardIndex !== undefined) {
      setUsedCardIndices((prev) => prev.filter((idx) => idx !== lastToken.cardIndex));
    }
    setTokens((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    mathSounds.playClick();
    setErrorMsg(null);
    setTokens([]);
    setUsedCardIndices([]);
  };

  // Build formula string
  const formulaString = tokens.map((t) => t.val).join(' ');
  const liveEval = evaluateMathExpression(formulaString);

  // Check Solution
  const handleCheckSolution = () => {
    if (!currentQ) return;

    if (usedCardIndices.length < 4) {
      setErrorMsg('You must use all 4 number cards to solve Target 24!');
      mathSounds.playWrong();
      return;
    }

    if (!liveEval.isValid || liveEval.result === null) {
      setErrorMsg(liveEval.error || 'Invalid equation syntax');
      mathSounds.playWrong();
      return;
    }

    if (Math.abs(liveEval.result - 24) < 0.001) {
      // SUCCESS!
      mathSounds.playCorrect(streak + 1);
      setSuccessAnimation(true);
      const points = hintUsed ? 20 : 50 + streak * 10;
      setScore((prev) => prev + points);
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > maxStreak) setMaxStreak(nextStreak);
      const nextSolved = solvedCount + 1;
      setSolvedCount(nextSolved);

      if (nextSolved >= 5) {
        setTimeout(() => {
          setIsPlaying(false);
          const earnedXp = Math.floor((score + points) * 0.9);
          setGameSummary({
            mode: 'target24',
            totalQuestions: 5,
            correctCount: 5,
            wrongCount: 0,
            score: score + points,
            accuracy: 100,
            highestStreak: Math.max(maxStreak, nextStreak),
            avgTimePerQuestionMs: 6500,
            xpEarned: earnedXp,
            coinsEarned: Math.floor(earnedXp / 4),
            questionsReview: [
              {
                prompt: 'Target 24 Puzzle Set',
                userAnswer: 'Solved 5/5 Target 24 Puzzles',
                correctAnswer: '24',
                isCorrect: true
              }
            ]
          });
        }, 800);
        return;
      }

      setTimeout(() => {
        setSuccessAnimation(false);
        setTokens([]);
        setUsedCardIndices([]);
        setHintUsed(false);
        setShowHint(false);
        setErrorMsg(null);
        setCurrentQ(generateTarget24Question());
      }, 700);
    } else {
      setErrorMsg(`Equation equals ${liveEval.result}, but target is 24!`);
      mathSounds.playWrong();
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 text-slate-100 animate-in fade-in duration-200">
      
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-xl">
        <button
          type="button"
          onClick={() => {
            if (isPlaying && window.confirm('Exit Target 24 game?')) {
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
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-md">
            <Target className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
            Target 24 Puzzle IQ
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

      {/* Intro Screen */}
      {!isPlaying && (
        <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6 text-center">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-white">Can You Make 24?</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Combine all 4 number cards using operations (+, -, ×, ÷) and brackets to reach exactly 24. A classic mathematical brain-trainer!
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 py-2">
            {[4, 6, 8, 2].map((n, i) => (
              <div
                key={i}
                className="w-14 h-18 sm:w-16 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-indigo-500/20 border-2 border-amber-400/50 flex items-center justify-center text-2xl font-black text-white shadow-lg"
              >
                {n}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={startNewGame}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-black text-base sm:text-lg shadow-xl shadow-amber-950/60 flex items-center justify-center gap-2 border border-amber-400/30 transition-all active:scale-[0.99]"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>START 5-PUZZLE TARGET 24 SPRINT</span>
          </button>
        </div>
      )}

      {/* Active Puzzle Playground */}
      {isPlaying && currentQ && (
        <div className="flex flex-col gap-4">
          
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 bg-slate-900/80 border border-white/10 rounded-2xl p-3 shadow-xl text-center items-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Score</span>
              <div className="text-xl sm:text-2xl font-black text-amber-400">{score}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Solved</span>
              <div className="text-xl sm:text-2xl font-black text-cyan-400">{solvedCount} / 5</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target</span>
              <div className="text-xl sm:text-2xl font-black text-emerald-400">24</div>
            </div>
          </div>

          {/* 4 Cards Grid */}
          <div className="grid grid-cols-4 gap-3 bg-slate-900/90 border border-white/10 rounded-3xl p-5 shadow-2xl">
            {currentQ.numbers.map((num, idx) => {
              const isUsed = usedCardIndices.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleCardClick(num, idx)}
                  disabled={isUsed}
                  className={`h-24 sm:h-28 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                    isUsed
                      ? 'bg-slate-950/40 border-white/5 text-slate-600 scale-95 opacity-40 cursor-not-allowed'
                      : 'bg-gradient-to-tr from-slate-900 to-indigo-950 border-amber-400/40 hover:border-amber-300 text-white shadow-xl hover:-translate-y-1 active:scale-95'
                  }`}
                >
                  <span className="text-3xl sm:text-4xl font-black font-mono">{num}</span>
                  <span className="text-[10px] uppercase font-bold text-amber-400 mt-1">
                    {isUsed ? 'Used' : 'Tap Card'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Formula Builder Screen */}
          <div
            className={`bg-slate-950/80 border-2 rounded-2xl p-4 sm:p-5 flex flex-col gap-2 transition-all ${
              successAnimation
                ? 'border-emerald-500 bg-emerald-950/20'
                : errorMsg
                ? 'border-rose-500/50'
                : 'border-indigo-500/30'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Your Equation:</span>
              {liveEval.isValid && liveEval.result !== null && (
                <span className="font-mono text-cyan-300 font-bold">
                  Current Result = <span className="text-white text-sm">{liveEval.result}</span>
                </span>
              )}
            </div>

            <div className="min-h-12 flex items-center font-mono font-bold text-xl sm:text-2xl text-white tracking-wider flex-wrap gap-1">
              {tokens.length === 0 ? (
                <span className="text-slate-600 text-sm font-normal">Tap cards and operators below to build equation...</span>
              ) : (
                tokens.map((t, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 rounded-lg ${
                      t.type === 'num'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : t.type === 'op'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'bg-purple-500/20 text-purple-300'
                    }`}
                  >
                    {t.val}
                  </span>
                ))
              )}
            </div>

            {errorMsg && (
              <div className="text-xs text-rose-400 font-medium animate-in fade-in">
                ⚠️ {errorMsg}
              </div>
            )}
          </div>

          {/* Operator Buttons & Controls */}
          <div className="grid grid-cols-6 gap-2 bg-slate-900/80 border border-white/10 rounded-2xl p-3 shadow-xl">
            {['+', '-', '×', '÷', '(', ')'].map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => (op === '(' || op === ')' ? handleParenClick(op) : handleOperatorClick(op))}
                className="h-12 rounded-xl bg-slate-950/70 hover:bg-slate-800 border border-white/10 active:scale-95 text-lg font-bold text-cyan-300 shadow-md flex items-center justify-center"
              >
                {op}
              </button>
            ))}
          </div>

          {/* Action Row: Undo, Clear, Hint, Submit */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={tokens.length === 0}
              className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs font-bold text-slate-300 border border-white/10 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Undo2 className="w-4 h-4" />
              <span>Undo</span>
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={tokens.length === 0}
              className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs font-bold text-rose-400 border border-white/10 flex items-center justify-center gap-1.5 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowHint(true);
                setHintUsed(true);
              }}
              className="flex-1 py-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-bold text-indigo-300 border border-indigo-500/20 flex items-center justify-center gap-1.5 transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <span>Hint</span>
            </button>

            <button
              type="button"
              onClick={handleCheckSolution}
              className="flex-2 py-3 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              <span>CHECK 24</span>
            </button>
          </div>

          {/* Hint Card */}
          {showHint && currentQ && (
            <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-2xl flex items-start justify-between gap-2 text-xs text-amber-200 animate-in fade-in">
              <div>
                <span className="font-bold text-amber-300">Solution Clue: </span>
                <span className="font-mono">{currentQ.solutionHint}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHint(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

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
