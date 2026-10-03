import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Sparkles,
  ArrowLeft,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  BookOpen,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Lightbulb,
  X
} from 'lucide-react';
import { VedicQuestion, GameSummary } from '../types.js';
import { generateVedicQuestion } from '../engines/mathEngine.js';
import { mathSounds } from '../engines/mathSoundEffects.js';
import { MathNumpad } from '../shared/MathNumpad.js';
import { ComboStreakBadge } from '../shared/ComboStreakBadge.js';
import { GameOverModal } from '../shared/GameOverModal.js';

interface VedicHacksDrillProps {
  onBackToHub: () => void;
}

export const VedicHacksDrill: React.FC<VedicHacksDrillProps> = ({ onBackToHub }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQ, setCurrentQ] = useState<VedicQuestion | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [roundQuestions, setRoundQuestions] = useState<Array<VedicQuestion & { userAnswer: string; isCorrect: boolean }>>([]);
  const [questionsRemaining, setQuestionsRemaining] = useState(10);
  const [showTrickGuide, setShowTrickGuide] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [lastExplanation, setLastExplanation] = useState<string | null>(null);
  const [gameSummary, setGameSummary] = useState<GameSummary | null>(null);
  const [isMuted, setIsMuted] = useState(mathSounds.getMuted());

  const toggleMute = () => {
    const next = !isMuted;
    mathSounds.setMuted(next);
    setIsMuted(next);
  };

  const startDrill = useCallback(() => {
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setRoundQuestions([]);
    setQuestionsRemaining(10);
    setInputVal('');
    setFeedback(null);
    setLastExplanation(null);
    setGameSummary(null);

    const firstQ = generateVedicQuestion();
    setCurrentQ(firstQ);
    setIsPlaying(true);
  }, []);

  const finishDrill = useCallback((finalResults: Array<VedicQuestion & { userAnswer: string; isCorrect: boolean }>, finalScore: number, finalMaxStreak: number) => {
    setIsPlaying(false);
    const total = finalResults.length;
    const correct = finalResults.filter((q) => q.isCorrect).length;
    const wrong = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const earnedXp = Math.max(15, Math.floor(finalScore * 0.9) + finalMaxStreak * 6);
    const earnedCoins = Math.floor(earnedXp / 4);

    setGameSummary({
      mode: 'vedic',
      totalQuestions: total,
      correctCount: correct,
      wrongCount: wrong,
      score: finalScore,
      accuracy,
      highestStreak: finalMaxStreak,
      avgTimePerQuestionMs: 2500,
      xpEarned: earnedXp,
      coinsEarned: earnedCoins,
      questionsReview: finalResults.map((q) => ({
        prompt: q.questionText,
        userAnswer: q.userAnswer,
        correctAnswer: String(q.answer),
        isCorrect: q.isCorrect
      }))
    });
  }, []);

  const submitAnswer = useCallback((overrideAnswer?: string) => {
    if (!currentQ) return;
    const ansToCheck = (overrideAnswer !== undefined ? overrideAnswer : inputVal).trim();
    if (!ansToCheck) return;

    const isCorrect = ansToCheck.toLowerCase() === String(currentQ.answer).toLowerCase();

    const record = {
      ...currentQ,
      userAnswer: ansToCheck,
      isCorrect
    };

    const updatedResults = [...roundQuestions, record];
    setRoundQuestions(updatedResults);
    setLastExplanation(currentQ.trickExplanation);

    let nextScore = score;
    let nextMaxStreak = maxStreak;

    if (isCorrect) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > maxStreak) {
        nextMaxStreak = nextStreak;
        setMaxStreak(nextStreak);
      }
      nextScore = score + (nextStreak >= 5 ? 30 : nextStreak >= 3 ? 20 : 15);
      setScore(nextScore);
      setFeedback('correct');
      mathSounds.playCorrect(nextStreak);
    } else {
      setStreak(0);
      setFeedback('wrong');
      mathSounds.playWrong();
    }

    const nextRemaining = questionsRemaining - 1;
    setQuestionsRemaining(nextRemaining);

    if (nextRemaining <= 0) {
      setTimeout(() => {
        finishDrill(updatedResults, nextScore, nextMaxStreak);
      }, 700);
      return;
    }

    setTimeout(() => {
      setFeedback(null);
      setInputVal('');
      const nextQ = generateVedicQuestion();
      setCurrentQ(nextQ);
    }, 450);
  }, [currentQ, inputVal, roundQuestions, score, streak, maxStreak, questionsRemaining, finishDrill]);

  // Keyboard shortcut listener for options (1-4) or numpad
  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentQ?.options) {
        if (e.key === '1' && currentQ.options[0]) submitAnswer(currentQ.options[0]);
        if (e.key === '2' && currentQ.options[1]) submitAnswer(currentQ.options[1]);
        if (e.key === '3' && currentQ.options[2]) submitAnswer(currentQ.options[2]);
        if (e.key === '4' && currentQ.options[3]) submitAnswer(currentQ.options[3]);
      } else {
        if (e.key >= '0' && e.key <= '9') {
          mathSounds.playClick();
          setInputVal((prev) => (prev.length < 8 ? prev + e.key : prev));
        } else if (e.key === 'Backspace') {
          mathSounds.playClick();
          setInputVal((prev) => prev.slice(0, -1));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          submitAnswer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentQ, submitAnswer]);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 text-slate-100 animate-in fade-in duration-200">
      
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-xl">
        <button
          type="button"
          onClick={() => {
            if (isPlaying && window.confirm('Exit current Vedic drill?')) {
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
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
            <Brain className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
            Vedic & Mental Math Hacks
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowTrickGuide(true)}
            className="p-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-xs font-semibold flex items-center gap-1"
            title="View Calculation Formulas"
          >
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Cheat-Sheet</span>
          </button>

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
      </div>

      {/* SETUP / INTRODUCTION */}
      {!isPlaying && (
        <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6">
          <div className="text-center space-y-1">
            <h3 className="text-xl font-black text-white">Vedic Calculation Speed Mastery</h3>
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
              Master the exact mental math shortcuts used by exam toppers to solve complex multiplication, squares, and fraction percentages in under 3 seconds!
            </p>
          </div>

          {/* 4 Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-slate-950/60 border border-white/5 rounded-2xl flex items-start gap-3">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 font-mono font-bold text-sm">
                85²
              </div>
              <div>
                <div className="text-xs font-bold text-white">Ending in 5 Squares</div>
                <div className="text-[11px] text-slate-400">8 × 9 = 72, append 25 ➔ 7225</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950/60 border border-white/5 rounded-2xl flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 font-mono font-bold text-sm">
                ×11
              </div>
              <div>
                <div className="text-xs font-bold text-white">Multiply by 11</div>
                <div className="text-[11px] text-slate-400">Split digits, sum in middle</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950/60 border border-white/5 rounded-2xl flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 font-mono font-bold text-sm">
                Base
              </div>
              <div>
                <div className="text-xs font-bold text-white">Base-100 Deviation</div>
                <div className="text-[11px] text-slate-400">97 × 94 ➔ -3 and -6 deviations</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950/60 border border-white/5 rounded-2xl flex items-start gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 font-mono font-bold text-sm">
                1/8
              </div>
              <div>
                <div className="text-xs font-bold text-white">Fraction to % Speed</div>
                <div className="text-[11px] text-slate-400">Instant DI recall: 1/8 = 12.5%</div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={startDrill}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-black text-base sm:text-lg shadow-xl shadow-purple-950/60 flex items-center justify-center gap-2 border border-purple-400/30 transition-all active:scale-[0.99]"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>START 10-QUESTION VEDIC DRILL</span>
          </button>
        </div>
      )}

      {/* ACTIVE DRILL */}
      {isPlaying && currentQ && (
        <div className="flex flex-col gap-4">
          
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 bg-slate-900/80 border border-white/10 rounded-2xl p-3 shadow-xl text-center items-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Score</span>
              <div className="text-xl sm:text-2xl font-black text-purple-400">{score}</div>
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
              <div className="text-xl sm:text-2xl font-black font-mono text-cyan-400">
                {questionsRemaining} / 10
              </div>
            </div>
          </div>

          {/* Question Card */}
          <div
            className={`bg-slate-900/90 border rounded-3xl p-6 sm:p-10 shadow-2xl flex flex-col items-center justify-center gap-5 transition-all duration-150 ${
              feedback === 'correct'
                ? 'border-emerald-500 bg-emerald-950/20 ring-4 ring-emerald-500/30'
                : feedback === 'wrong'
                ? 'border-rose-500 bg-rose-950/20 ring-4 ring-rose-500/30 animate-shake'
                : 'border-white/10'
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
              {currentQ.title}
            </span>

            <div className="text-3xl sm:text-5xl font-black font-mono tracking-tight text-white text-center">
              {currentQ.questionText}
            </div>

            {/* If options available (Fraction mode) */}
            {currentQ.options ? (
              <div className="w-full max-w-md grid grid-cols-2 gap-2.5 mt-2">
                {currentQ.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => submitAnswer(opt)}
                    className="p-3.5 rounded-2xl bg-slate-950/70 hover:bg-indigo-600/30 border border-white/10 hover:border-indigo-400 font-mono font-bold text-base sm:text-lg text-white transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
                  >
                    <span className="text-xs text-slate-500 font-sans">({idx + 1})</span>
                    <span>{opt}</span>
                  </button>
                ))}
              </div>
            ) : (
              /* Numeric Input Display Box */
              <div className="w-full max-w-xs h-16 sm:h-20 rounded-2xl bg-slate-950/80 border-2 border-purple-500/40 flex items-center justify-center text-3xl sm:text-4xl font-mono font-black text-white shadow-inner relative">
                <span>{inputVal || ''}</span>
                {!inputVal && (
                  <span className="text-slate-600 text-lg font-normal">Enter shortcut answer...</span>
                )}
                <div className="w-1 h-8 bg-purple-400 ml-1 animate-pulse" />
              </div>
            )}
          </div>

          {/* Last Trick Explanation Banner (When answered) */}
          {lastExplanation && (
            <div className="p-3.5 bg-gradient-to-r from-purple-950/40 to-slate-900 border border-purple-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-purple-200 animate-in fade-in duration-150">
              <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold text-white">Trick Working: </span>
                <span>{lastExplanation}</span>
              </div>
            </div>
          )}

          {/* Numpad only if numeric input needed */}
          {!currentQ.options && (
            <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-4 shadow-2xl">
              <MathNumpad
                onDigit={(d) => setInputVal((prev) => (prev.length < 8 ? prev + d : prev))}
                onBackspace={() => setInputVal((prev) => prev.slice(0, -1))}
                onClear={() => setInputVal('')}
                onSubmit={() => submitAnswer()}
              />
            </div>
          )}

        </div>
      )}

      {/* TRICK CHEAT-SHEET MODAL */}
      {showTrickGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar flex flex-col gap-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-white">Mental Math & Vedic Shortcuts</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTrickGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-purple-300">1. Squares of Numbers Ending in 5 (e.g. 75²)</h4>
                <p className="text-slate-300">
                  Formula: Multiply tens digit by (tens digit + 1), then suffix 25.
                  <br />
                  <span className="font-mono text-cyan-400">75² ➔ (7 × 8 = 56) + 25 = 5625</span>
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-cyan-300">2. Multiplication by 11 (e.g. 43 × 11)</h4>
                <p className="text-slate-300">
                  Formula: Place sum of digits between the two digits.
                  <br />
                  <span className="font-mono text-cyan-400">43 × 11 ➔ 4 _ 3 with (4+3=7) in middle = 473</span>
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-amber-300">3. Base 100 Multiplication (e.g. 96 × 93)</h4>
                <p className="text-slate-300">
                  Formula: Deviations are -4 and -7.
                  <br />
                  Left: 96 - 7 = 89. Right: (-4) × (-7) = 28.
                  <br />
                  <span className="font-mono text-cyan-400">Result = 8928</span>
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-emerald-300">4. Multiply by 25 & 50</h4>
                <p className="text-slate-300">
                  • ×25 is (÷ 4) × 100: <span className="font-mono text-cyan-400">64 × 25 = (64 ÷ 4)00 = 1600</span>
                  <br />
                  • ×50 is (÷ 2) × 100: <span className="font-mono text-cyan-400">38 × 50 = (38 ÷ 2)00 = 1900</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowTrickGuide(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white"
            >
              Got it, let's practice!
            </button>
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {gameSummary && (
        <GameOverModal
          summary={gameSummary}
          onPlayAgain={startDrill}
          onExit={() => {
            setGameSummary(null);
            setIsPlaying(false);
          }}
        />
      )}

    </div>
  );
};
