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
import { VedicQuestion, DifficultyLevel, GameSummary } from '../types.js';
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
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [category, setCategory] = useState<string>('all');
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

    const firstQ = generateVedicQuestion(difficulty, category === 'all' ? undefined : category);
    setCurrentQ(firstQ);
    setIsPlaying(true);
  }, [difficulty, category]);

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
      const nextQ = generateVedicQuestion(difficulty, category === 'all' ? undefined : category);
      setCurrentQ(nextQ);
    }, 450);
  }, [currentQ, inputVal, roundQuestions, score, streak, maxStreak, questionsRemaining, finishDrill, difficulty, category]);

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

          {/* Category Filter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Vedic Shortcut Category</label>
              <span className="text-[11px] text-purple-400 font-semibold uppercase">
                {category === 'all' ? 'All Hacks Mixed' : category}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {(
                [
                  { id: 'all', label: 'All Mixed', desc: 'Random Hacks' },
                  { id: 'square5', label: 'Squares in 5', desc: '85², 115²...' },
                  { id: 'multiply11', label: 'Multiply by 11', desc: '48 × 11, 352 × 11' },
                  { id: 'base100', label: 'Base-100 / 1000', desc: '97 × 94, 104 × 106' },
                  { id: 'multiply25_50', label: '×25 & ×50 Tricks', desc: 'Divide by 4 / 2' },
                  { id: 'crossMultiply', label: 'Cross Multiply', desc: 'ab × cd (Urdhva)' },
                  { id: 'sumTenSameTens', label: 'Units Sum to 10', desc: '74 × 76, 91 × 99' },
                  { id: 'squareNear50', label: 'Squares Near 50', desc: '54², 46², 38²...' },
                  { id: 'base50', label: 'Base 50 Multiply', desc: '52 × 54, 48 × 46' },
                  { id: 'seriesOf9', label: 'Multiply by 9s', desc: '×99, ×999, ×9999' },
                  { id: 'cubeRoot', label: 'Instant Cube Root', desc: '∛12167 = 23 (2s)' },
                  { id: 'squareRoot', label: 'Instant Square Root', desc: '√2209 = 47, √3136' },
                  { id: 'divisionHacks', label: 'Fast ÷5, ÷25, ÷50', desc: 'Double & Decimals' },
                  { id: 'fractionPercent', label: 'Fraction to %', desc: '1/7, 1/8, 3/8' }
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`p-2.5 rounded-2xl border text-left transition-all ${
                    category === cat.id
                      ? 'bg-purple-600/40 border-purple-400 text-white shadow-lg shadow-purple-600/30 scale-[1.01]'
                      : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <div className="font-extrabold text-xs text-purple-200">{cat.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">{cat.desc}</div>
                </button>
              ))}
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
                  { id: 'easy', label: 'Easy', tag: 'Beginner', desc: 'Simple 11x, squares to 45', color: 'border-emerald-500/50 text-emerald-400 bg-emerald-950/20' },
                  { id: 'medium', label: 'Medium', tag: 'Intermediate', desc: 'Carry 11x, base 100 close', color: 'border-cyan-500/50 text-cyan-400 bg-cyan-950/20' },
                  { id: 'hard', label: 'Hard', tag: 'Exam Beast', desc: '3-digit 11x, squares 155', color: 'border-amber-500/50 text-amber-400 bg-amber-950/20' },
                  { id: 'extreme', label: 'Extreme Hard', tag: 'God Level', desc: '4-digit 11x, base 1000', color: 'border-rose-500/50 text-rose-400 bg-rose-950/20' }
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

            <div className="space-y-3 text-xs">
              {/* 1 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-purple-300">1. Squares Ending in 5 (Ekadhikena Purvena)</h4>
                <p className="text-slate-300">
                  Formula: Multiply tens digit by (tens + 1), then append 25.
                  <br />
                  <span className="font-mono text-cyan-400">75² ➔ (7 × 8 = 56) + 25 = 5625</span>
                </p>
              </div>

              {/* 2 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-cyan-300">2. Multiplication by 11</h4>
                <p className="text-slate-300">
                  Formula: Add adjacent digits from right to left with carry.
                  <br />
                  <span className="font-mono text-cyan-400">43 × 11 ➔ 4 _ 3 with (4+3=7) in middle = 473</span>
                </p>
              </div>

              {/* 3 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-amber-300">3. Base 100 Multiplication (Nikhilam Sutra)</h4>
                <p className="text-slate-300">
                  Formula: Cross-add deviations from 100, then append product of deviations.
                  <br />
                  <span className="font-mono text-cyan-400">96 × 93 (dev -4, -7) ➔ Left: 96-7=89, Right: (-4)×(-7)=28 ➔ 8928</span>
                </p>
              </div>

              {/* 4 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-emerald-300">4. Multiply by 25 & 50</h4>
                <p className="text-slate-300">
                  • ×25 is (÷ 4) × 100: <span className="font-mono text-cyan-400">64 × 25 = (64 ÷ 4)00 = 1600</span>
                  <br />
                  • ×50 is (÷ 2) × 100: <span className="font-mono text-cyan-400">38 × 50 = (38 ÷ 2)00 = 1900</span>
                </p>
              </div>

              {/* 5 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-indigo-300">5. Cross-Multiplication (Urdhva Tiryagbhyam)</h4>
                <p className="text-slate-300">
                  Universal formula: 1) Units × Units, 2) Cross-multiply & sum, 3) Tens × Tens.
                  <br />
                  <span className="font-mono text-cyan-400">23 × 14 ➔ Units: 12 (carry 1) | Cross: 8+3+1=12 (carry 1) | Tens: 2+1=3 ➔ 322</span>
                </p>
              </div>

              {/* 6 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-rose-300">6. Units Sum to 10 & Same Tens (Antyayor Dashakepi)</h4>
                <p className="text-slate-300">
                  Formula: Left: Tens × (Tens + 1), Right: Units₁ × Units₂ (2 digits).
                  <br />
                  <span className="font-mono text-cyan-400">74 × 76 ➔ (7 × 8 = 56) | (4 × 6 = 24) ➔ 5624</span>
                  <br />
                  <span className="font-mono text-cyan-400">91 × 99 ➔ (9 × 10 = 90) | (1 × 9 = 09) ➔ 9009</span>
                </p>
              </div>

              {/* 7 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-teal-300">7. Squares of Numbers Near 50 (26 to 75)</h4>
                <p className="text-slate-300">
                  Formula: Let dev = N - 50. First part = 25 + dev, Last part = dev² (2 digits).
                  <br />
                  <span className="font-mono text-cyan-400">54² ➔ (25 + 4 = 29) | (4² = 16) ➔ 2916</span>
                  <br />
                  <span className="font-mono text-cyan-400">46² ➔ (25 - 4 = 21) | (4² = 16) ➔ 2116</span>
                </p>
              </div>

              {/* 8 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-orange-300">8. Base 50 Multiplication (Working Base)</h4>
                <p className="text-slate-300">
                  Formula: Base = 100 ÷ 2. Cross-add deviations, divide by 2, append product of deviations.
                  <br />
                  <span className="font-mono text-cyan-400">52 × 54 (dev +2, +4) ➔ (52+4)/2 = 28 | (2×4 = 08) ➔ 2808</span>
                </p>
              </div>

              {/* 9 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-pink-300">9. Multiply by Series of 9s (Ekanyunena Purvena)</h4>
                <p className="text-slate-300">
                  Formula: Left: Number - 1, Right: 9's complement of each digit.
                  <br />
                  <span className="font-mono text-cyan-400">64 × 99 ➔ (64 - 1 = 63) | (99 - 63 = 36) ➔ 6336</span>
                  <br />
                  <span className="font-mono text-cyan-400">483 × 999 ➔ (483 - 1 = 482) | (999 - 482 = 517) ➔ 482517</span>
                </p>
              </div>

              {/* 10 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-sky-300">10. Instant Cube Root in 2 Seconds (Vilokanam)</h4>
                <p className="text-slate-300">
                  Formula: Unit digit comes from last digit. Strike last 3 digits; tens digit is nearest cube root below remaining part.
                  <br />
                  <span className="font-mono text-cyan-400">∛12167 ➔ Ends in 7 ➔ unit is 3. Strike 167 ➔ 12 (nearest cube 2³=8) ➔ 23!</span>
                  <br />
                  <span className="font-mono text-cyan-400">∛54872 ➔ Ends in 2 ➔ unit is 8. Strike 872 ➔ 54 (nearest cube 3³=27) ➔ 38!</span>
                </p>
              </div>

              {/* 11 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-violet-300">11. Instant Square Root (Vilokanam)</h4>
                <p className="text-slate-300">
                  Formula: Strike last 2 digits, find tens digit from nearest square. Compare with tens × (tens + 1) to pick unit digit.
                  <br />
                  <span className="font-mono text-cyan-400">√3136 ➔ Strike 36 ➔ 31 (5²=25). 31 &gt; 5×6(30) ➔ pick larger (6) ➔ 56!</span>
                  <br />
                  <span className="font-mono text-cyan-400">√2209 ➔ Strike 09 ➔ 22 (4²=16). 22 &gt; 4×5(20) ➔ pick larger (7) ➔ 47!</span>
                </p>
              </div>

              {/* 12 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-lime-300">12. Mental Division Hacks (÷5, ÷25, ÷50)</h4>
                <p className="text-slate-300">
                  • ÷5: Double number & divide by 10: <span className="font-mono text-cyan-400">243 ÷ 5 = 486 ÷ 10 = 48.6</span>
                  <br />
                  • ÷25: Multiply by 4 & divide by 100: <span className="font-mono text-cyan-400">312 ÷ 25 = 1248 ÷ 100 = 12.48</span>
                </p>
              </div>

              {/* 13 */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                <h4 className="font-bold text-yellow-300">13. Fraction to Percentage Equivalents</h4>
                <p className="text-slate-300">
                  High-yield DI table:
                  <br />
                  <span className="font-mono text-cyan-400">1/7 = 14.28% | 1/8 = 12.5% | 1/9 = 11.11% | 1/11 = 9.09% | 3/8 = 37.5%</span>
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
