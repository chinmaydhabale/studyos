import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  Flame,
  Zap,
  ArrowLeft,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Sparkles,
  Award
} from 'lucide-react';
import {
  ArithmeticQuestion,
  OperationType,
  MultiOperationType,
  DifficultyLevel,
  TimeMode,
  GameSummary
} from '../types.js';
import { generateArithmeticQuestion } from '../engines/mathEngine.js';
import { mathSounds } from '../engines/mathSoundEffects.js';
import { MathNumpad } from '../shared/MathNumpad.js';
import { ComboStreakBadge } from '../shared/ComboStreakBadge.js';
import { GameOverModal } from '../shared/GameOverModal.js';

interface SpeedArithmeticBlitzProps {
  onBackToHub: () => void;
}

export const SpeedArithmeticBlitz: React.FC<SpeedArithmeticBlitzProps> = ({ onBackToHub }) => {
  // Config state
  const [isMultiOp, setIsMultiOp] = useState<boolean>(false);
  const [operation, setOperation] = useState<OperationType>('mixed');
  const [multiType, setMultiType] = useState<MultiOperationType>('mixed');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [timeMode, setTimeMode] = useState<TimeMode>('60s');
  const [isPlaying, setIsPlaying] = useState(false);

  // Active game state
  const [currentQ, setCurrentQ] = useState<ArithmeticQuestion | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [questionsAnswered, setQuestionsAnswered] = useState<ArithmeticQuestion[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [gameSummary, setGameSummary] = useState<GameSummary | null>(null);
  const [isMuted, setIsMuted] = useState(mathSounds.getMuted());

  // Sound toggle
  const toggleMute = () => {
    const next = !isMuted;
    mathSounds.setMuted(next);
    setIsMuted(next);
  };

  const getInitialSeconds = useCallback((mode: TimeMode) => {
    if (mode === '60s') return 60;
    if (mode === '120s') return 120;
    return 9999; // Sudden Death: ended on first mistake
  }, []);

  const startNewGame = useCallback(() => {
    const initialSec = getInitialSeconds(timeMode);
    setTimeLeft(initialSec);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setQuestionsAnswered([]);
    setInputVal('');
    setFeedback(null);
    setGameSummary(null);

    const firstQ = generateArithmeticQuestion(operation, difficulty, isMultiOp, multiType);
    setCurrentQ(firstQ);
    setQuestionStartTime(Date.now());
    setIsPlaying(true);
  }, [operation, difficulty, timeMode, isMultiOp, multiType, getInitialSeconds]);

  // Finish game calculation
  const finishGame = useCallback(() => {
    setIsPlaying(false);
    const total = questionsAnswered.length;
    const correct = questionsAnswered.filter((q) => q.isCorrect).length;
    const wrong = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const totalTimeSpent = questionsAnswered.reduce((sum, q) => sum + (q.timeSpentMs || 0), 0);
    const avgTime = total > 0 ? Math.round(totalTimeSpent / total) : 0;

    const earnedXp = Math.max(10, Math.floor(score * 0.8) + maxStreak * 5);
    const earnedCoins = Math.floor(earnedXp / 4);

    setGameSummary({
      mode: 'blitz',
      totalQuestions: total,
      correctCount: correct,
      wrongCount: wrong,
      score,
      accuracy,
      highestStreak: maxStreak,
      avgTimePerQuestionMs: avgTime,
      xpEarned: earnedXp,
      coinsEarned: earnedCoins,
      questionsReview: questionsAnswered.map((q) => ({
        prompt: q.expression || `${q.num1} ${q.operation} ${q.num2}`,
        userAnswer: q.userAnswer !== undefined ? String(q.userAnswer) : 'None',
        correctAnswer: String(q.answer),
        isCorrect: !!q.isCorrect
      }))
    });
  }, [questionsAnswered, score, maxStreak]);

  const finishGameRef = useRef(finishGame);
  finishGameRef.current = finishGame;

  // Timer loop
  useEffect(() => {
    if (!isPlaying) return;

    if (timeMode !== 'suddendeath') {
      const interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            finishGameRef.current();
            return 0;
          }
          if (prev <= 10) {
            mathSounds.playTick();
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isPlaying, timeMode]);

  // Handle Answer Submission
  const submitAnswer = useCallback(() => {
    if (!currentQ || inputVal.trim() === '') return;

    const userNum = parseInt(inputVal.trim(), 10);
    const isCorrect = userNum === currentQ.answer;
    const timeSpent = Date.now() - questionStartTime;

    const qWithResult: ArithmeticQuestion = {
      ...currentQ,
      userAnswer: userNum,
      isCorrect,
      timeSpentMs: timeSpent
    };

    setQuestionsAnswered((prev) => [...prev, qWithResult]);

    if (isCorrect) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > maxStreak) setMaxStreak(nextStreak);

      const multiplier = nextStreak >= 10 ? 3.0 : nextStreak >= 5 ? 2.0 : nextStreak >= 3 ? 1.5 : 1.0;
      const speedBonus = timeSpent < 1500 ? 5 : 0;
      const points = Math.round((10 + speedBonus) * multiplier);

      setScore((prev) => prev + points);
      setFeedback('correct');
      mathSounds.playCorrect(nextStreak);
    } else {
      setStreak(0);
      setFeedback('wrong');
      mathSounds.playWrong();

      if (timeMode === 'suddendeath') {
        setTimeout(() => {
          finishGame();
        }, 300);
        return;
      }
    }

    // Flash feedback and spawn next question
    setTimeout(() => {
      setFeedback(null);
      setInputVal('');
      const nextQ = generateArithmeticQuestion(operation, difficulty, isMultiOp, multiType);
      setCurrentQ(nextQ);
      setQuestionStartTime(Date.now());
    }, 180);
  }, [currentQ, inputVal, questionStartTime, streak, maxStreak, timeMode, operation, difficulty, isMultiOp, multiType, finishGame]);

  // Physical Keyboard Listeners
  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        mathSounds.playClick();
        setInputVal((prev) => (prev.length < 8 ? prev + e.key : prev));
      } else if (e.key === '-' || e.key === '_') {
        mathSounds.playClick();
        setInputVal((prev) => (prev === '' ? '-' : prev));
      } else if (e.key === 'Backspace') {
        mathSounds.playClick();
        setInputVal((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submitAnswer();
      } else if (e.key === 'Escape') {
        setInputVal('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, submitAnswer]);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 text-slate-100 animate-in fade-in duration-200">
      
      {/* Top Bar: Navigation, Title & Sound */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-xl">
        <button
          type="button"
          onClick={() => {
            if (isPlaying) {
              if (window.confirm('Leave active game? Your current progress will be lost.')) {
                setIsPlaying(false);
                onBackToHub();
              }
            } else {
              onBackToHub();
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold border border-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Hub</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
            <Zap className="w-4 h-4 fill-white" />
          </div>
          <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
            Speed Arithmetic Blitz
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
          title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* SETUP VIEW (When not playing) */}
      {!isPlaying && (
        <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6">
          <div className="text-center space-y-1">
            <h3 className="text-xl font-black text-white">Configure Your Arithmetic Workout</h3>
            <p className="text-xs text-slate-400">
              Customize operations, difficulty tier, and duration for targeted competitive calculation drills.
            </p>
          </div>

          {/* Operation Complexity Selector (Single vs Multi-Op) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Calculation Complexity</label>
              <span className="text-[11px] text-cyan-400 font-semibold">
                {isMultiOp ? 'Multi-Operation Chain Mode' : 'Single Operation Mode'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/70 border border-white/10 rounded-2xl">
              <button
                type="button"
                onClick={() => setIsMultiOp(false)}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                  !isMultiOp
                    ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Single Operation</span>
                <span className="text-[10px] opacity-75 px-1.5 py-0.5 rounded bg-black/30">a ± b</span>
              </button>
              <button
                type="button"
                onClick={() => setIsMultiOp(true)}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                  isMultiOp
                    ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Multi-Op (BODMAS)</span>
                <span className="text-[10px] opacity-75 px-1.5 py-0.5 rounded bg-black/30">a × b + c</span>
              </button>
            </div>
          </div>

          {/* Operation / Chain Type Selector */}
          {!isMultiOp ? (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Single Operation</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {(
                  [
                    { id: 'mixed', label: 'All Mixed', icon: '±' },
                    { id: 'add', label: 'Add (+)', icon: '+' },
                    { id: 'subtract', label: 'Subtract (-)', icon: '-' },
                    { id: 'multiply', label: 'Multiply (×)', icon: '×' },
                    { id: 'divide', label: 'Divide (÷)', icon: '÷' }
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOperation(item.id)}
                    className={`p-2.5 sm:p-3 rounded-2xl border text-center font-bold text-xs sm:text-sm transition-all ${
                      operation === item.id
                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/30 scale-[1.02]'
                        : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="text-base sm:text-lg mb-0.5">{item.icon}</div>
                    <div className="truncate text-[11px] sm:text-xs">{item.label}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Multi-Op Chain Pattern</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(
                  [
                    { id: 'mixed', label: 'All Mixed Chain', desc: 'Random BODMAS' },
                    { id: 'chain_add_sub', label: 'Add & Sub', desc: 'a + b - c' },
                    { id: 'chain_mult_add', label: 'Mult & Add', desc: 'a × b + c' },
                    { id: 'chain_mult_sub', label: 'Mult & Sub', desc: 'a × b - c' },
                    { id: 'chain_bodmas', label: 'Full BODMAS', desc: '(a ± b) × c' }
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMultiType(m.id)}
                    className={`p-2.5 sm:p-3 rounded-2xl border text-center font-bold text-xs transition-all ${
                      multiType === m.id
                        ? 'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-600/30 scale-[1.02]'
                        : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-extrabold text-amber-200">{m.label}</div>
                    <div className="text-[10px] text-slate-300 font-mono mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Difficulty Selector (4 Levels: Easy, Medium, Hard, Extreme Hard) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Difficulty Level</label>
              <span className="text-[11px] text-slate-400 font-medium">4 Scaled Tiers</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(
                [
                  { id: 'easy', label: 'Easy', tag: 'Beginner', desc: '1-2 digits, warm-up', color: 'border-emerald-500/50 text-emerald-400 bg-emerald-950/20' },
                  { id: 'medium', label: 'Medium', tag: 'Intermediate', desc: '2-3 digits, competitive', color: 'border-cyan-500/50 text-cyan-400 bg-cyan-950/20' },
                  { id: 'hard', label: 'Hard', tag: 'Exam Beast', desc: 'Large numbers, high speed', color: 'border-amber-500/50 text-amber-400 bg-amber-950/20' },
                  { id: 'extreme', label: 'Extreme Hard', tag: 'God Level', desc: '3-4 digits, intense chains', color: 'border-rose-500/50 text-rose-400 bg-rose-950/20' }
                ] as const
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDifficulty(d.id)}
                  className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden ${
                    difficulty === d.id
                      ? `${d.color} shadow-lg ring-1 ring-white/20 scale-[1.02]`
                      : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs sm:text-sm">{d.label}</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-white/10 font-bold">
                      {d.tag}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-snug">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Time Mode Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Game Mode</label>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: '60s', label: '60s Blitz', desc: 'Quick rapid-fire sprint' },
                  { id: '120s', label: '120s Marathon', desc: 'Endurance calculation test' },
                  { id: 'suddendeath', label: 'Sudden Death', desc: '1 strike and game over!' }
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTimeMode(t.id)}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    timeMode === t.id
                      ? 'bg-amber-600/30 border-amber-400/60 text-white shadow-lg shadow-amber-600/20'
                      : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="font-bold text-xs sm:text-sm text-amber-300">{t.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Big Start Button */}
          <button
            type="button"
            onClick={startNewGame}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-black text-base sm:text-lg shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 border border-emerald-400/30 transition-all active:scale-[0.99]"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>START CALCULATION BLITZ</span>
          </button>
        </div>
      )}

      {/* ACTIVE GAME PLAYGROUND */}
      {isPlaying && currentQ && (
        <div className="flex flex-col gap-4">
          
          {/* Live Stats Header: Score, Streak, Timer */}
          <div className="grid grid-cols-3 gap-2 bg-slate-900/80 border border-white/10 rounded-2xl p-3 shadow-xl text-center items-center">
            
            {/* Score */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Score</span>
              <div className="text-xl sm:text-2xl font-black text-cyan-400">{score}</div>
            </div>

            {/* Streak & Multiplier */}
            <div className="flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Streak</span>
              {streak >= 3 ? (
                <ComboStreakBadge streak={streak} />
              ) : (
                <div className="text-xl sm:text-2xl font-black text-amber-400">{streak}</div>
              )}
            </div>

            {/* Timer */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {timeMode === 'suddendeath' ? 'Mode' : 'Time Left'}
              </span>
              <div
                className={`text-xl sm:text-2xl font-black font-mono flex items-center justify-center gap-1 ${
                  timeMode === 'suddendeath'
                    ? 'text-rose-400 text-sm sm:text-base'
                    : timeLeft <= 10
                    ? 'text-rose-400 animate-pulse'
                    : timeLeft <= 20
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{timeMode === 'suddendeath' ? '1-Strike' : `${timeLeft}s`}</span>
              </div>
            </div>

          </div>

          {/* Question Stage Card */}
          <div
            className={`bg-slate-900/90 border rounded-3xl p-4 sm:p-8 shadow-2xl flex flex-col items-center justify-center gap-4 sm:gap-6 transition-all duration-150 ${
              feedback === 'correct'
                ? 'border-emerald-500 bg-emerald-950/20 ring-4 ring-emerald-500/30 scale-[1.01]'
                : feedback === 'wrong'
                ? 'border-rose-500 bg-rose-950/20 ring-4 ring-rose-500/30 animate-shake'
                : 'border-white/10'
            }`}
          >
            {/* Difficulty & Mode Badge */}
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-white/10 text-slate-300 border border-white/10">
                {currentQ.difficulty || difficulty}
              </span>
              {(currentQ.isMultiOp || isMultiOp) && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  BODMAS CHAIN
                </span>
              )}
            </div>

            {/* Math Expression */}
            <div className="flex items-center justify-center flex-wrap gap-2 sm:gap-4 text-2xl sm:text-4xl md:text-5xl font-black font-mono tracking-tight text-white select-none text-center px-2">
              <span>{currentQ.expression || `${currentQ.num1} ${currentQ.operation} ${currentQ.num2}`}</span>
              <span className="text-slate-500">=</span>
              <span className="text-cyan-400">?</span>
            </div>

            {/* Answer Display Box */}
            <div className="w-full max-w-xs h-12 sm:h-16 rounded-2xl bg-slate-950/80 border-2 border-indigo-500/40 flex items-center justify-center text-2xl sm:text-4xl font-mono font-black text-white shadow-inner relative">
              <span>{inputVal || ''}</span>
              {!inputVal && (
                <span className="text-slate-600 text-base sm:text-lg font-normal tracking-normal animate-pulse">
                  Type answer...
                </span>
              )}
              {/* Blinking Cursor */}
              <div className="w-1 h-6 sm:h-8 bg-cyan-400 ml-1 animate-pulse" />
            </div>
          </div>

          {/* On-Screen Touch Numpad */}
          <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-4 shadow-2xl">
            <MathNumpad
              onDigit={(d) => setInputVal((prev) => (prev.length < 8 ? prev + d : prev))}
              onBackspace={() => setInputVal((prev) => prev.slice(0, -1))}
              onClear={() => setInputVal('')}
              onSubmit={submitAnswer}
              allowNegative={true}
            />
          </div>

        </div>
      )}

      {/* Game Over Summary Modal */}
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
