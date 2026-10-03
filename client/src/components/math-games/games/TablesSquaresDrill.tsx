import React, { useState, useEffect, useCallback } from 'react';
import {
  Table2,
  Sparkles,
  ArrowLeft,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  BookOpen,
  Award
} from 'lucide-react';
import { TableRecallQuestion, GameSummary } from '../types.js';
import { generateTableRecallQuestion } from '../engines/mathEngine.js';
import { mathSounds } from '../engines/mathSoundEffects.js';
import { MathNumpad } from '../shared/MathNumpad.js';
import { ComboStreakBadge } from '../shared/ComboStreakBadge.js';
import { GameOverModal } from '../shared/GameOverModal.js';

interface TablesSquaresDrillProps {
  onBackToHub: () => void;
}

export const TablesSquaresDrill: React.FC<TablesSquaresDrillProps> = ({ onBackToHub }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentQ, setCurrentQ] = useState<TableRecallQuestion | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [questionsLeft, setQuestionsLeft] = useState(15);
  const [questionsAnswered, setQuestionsAnswered] = useState<Array<TableRecallQuestion & { userAnswer: number; isCorrect: boolean }>>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
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
    setQuestionsAnswered([]);
    setQuestionsLeft(15);
    setInputVal('');
    setFeedback(null);
    setGameSummary(null);

    const q = generateTableRecallQuestion();
    setCurrentQ(q);
    setIsPlaying(true);
  }, []);

  const finishDrill = useCallback((results: Array<TableRecallQuestion & { userAnswer: number; isCorrect: boolean }>, finalScore: number, finalStreak: number) => {
    setIsPlaying(false);
    const total = results.length;
    const correct = results.filter((r) => r.isCorrect).length;
    const wrong = total - correct;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const earnedXp = Math.max(12, Math.floor(finalScore * 0.85) + finalStreak * 5);

    setGameSummary({
      mode: 'tables',
      totalQuestions: total,
      correctCount: correct,
      wrongCount: wrong,
      score: finalScore,
      accuracy,
      highestStreak: finalStreak,
      avgTimePerQuestionMs: 2000,
      xpEarned: earnedXp,
      coinsEarned: Math.floor(earnedXp / 4),
      questionsReview: results.map((r) => ({
        prompt: r.prompt,
        userAnswer: String(r.userAnswer),
        correctAnswer: String(r.answer),
        isCorrect: r.isCorrect
      }))
    });
  }, []);

  const submitAnswer = useCallback(() => {
    if (!currentQ || inputVal.trim() === '') return;
    const userNum = parseInt(inputVal.trim(), 10);
    const isCorrect = userNum === currentQ.answer;

    const record = {
      ...currentQ,
      userAnswer: userNum,
      isCorrect
    };

    const updated = [...questionsAnswered, record];
    setQuestionsAnswered(updated);

    let nextScore = score;
    let nextStreak = streak;
    let nextMaxStreak = maxStreak;

    if (isCorrect) {
      nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > maxStreak) {
        nextMaxStreak = nextStreak;
        setMaxStreak(nextStreak);
      }
      nextScore = score + (nextStreak >= 5 ? 25 : nextStreak >= 3 ? 15 : 10);
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
        finishDrill(updated, nextScore, nextMaxStreak);
      }, 500);
      return;
    }

    setTimeout(() => {
      setFeedback(null);
      setInputVal('');
      setCurrentQ(generateTableRecallQuestion());
    }, 250);
  }, [currentQ, inputVal, questionsAnswered, score, streak, maxStreak, questionsLeft, finishDrill]);

  // Keyboard support
  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, submitAnswer]);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 text-slate-100 animate-in fade-in duration-200">
      
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-xl">
        <button
          type="button"
          onClick={() => {
            if (isPlaying && window.confirm('Exit Tables & Squares drill?')) {
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
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
            <Table2 className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
            Tables, Squares & Cubes Drill
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
            <h3 className="text-xl font-black text-white">Direct Muscle Memory Recall</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Test your direct recall of Tables (11 to 29), Squares (11 to 35), and Cubes (4 to 18) to eliminate scratchwork during competitive exams.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto w-full">
            <div className="p-3 bg-slate-950/60 border border-white/5 rounded-2xl">
              <span className="text-xs font-bold text-amber-300">Tables</span>
              <div className="text-[11px] text-slate-400 mt-0.5">11 × 17, 19 × 7...</div>
            </div>
            <div className="p-3 bg-slate-950/60 border border-white/5 rounded-2xl">
              <span className="text-xs font-bold text-cyan-300">Squares</span>
              <div className="text-[11px] text-slate-400 mt-0.5">23², 29², 32²...</div>
            </div>
            <div className="p-3 bg-slate-950/60 border border-white/5 rounded-2xl">
              <span className="text-xs font-bold text-purple-300">Cubes</span>
              <div className="text-[11px] text-slate-400 mt-0.5">7³, 12³, 15³...</div>
            </div>
          </div>

          <button
            type="button"
            onClick={startDrill}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 text-white font-black text-base sm:text-lg shadow-xl shadow-amber-950/60 flex items-center justify-center gap-2 border border-amber-400/30 transition-all active:scale-[0.99]"
          >
            <Play className="w-5 h-5 fill-white" />
            <span>START 15-QUESTION RAPID RECALL</span>
          </button>
        </div>
      )}

      {/* Active Drill */}
      {isPlaying && currentQ && (
        <div className="flex flex-col gap-4">
          
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-2 bg-slate-900/80 border border-white/10 rounded-2xl p-3 shadow-xl text-center items-center">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Score</span>
              <div className="text-xl sm:text-2xl font-black text-amber-400">{score}</div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Streak</span>
              {streak >= 3 ? (
                <ComboStreakBadge streak={streak} />
              ) : (
                <div className="text-xl sm:text-2xl font-black text-cyan-400">{streak}</div>
              )}
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Remaining</span>
              <div className="text-xl sm:text-2xl font-black font-mono text-purple-400">
                {questionsLeft} / 15
              </div>
            </div>
          </div>

          {/* Question Card */}
          <div
            className={`bg-slate-900/90 border rounded-3xl p-8 sm:p-12 shadow-2xl flex flex-col items-center justify-center gap-5 transition-all duration-150 ${
              feedback === 'correct'
                ? 'border-emerald-500 bg-emerald-950/20'
                : feedback === 'wrong'
                ? 'border-rose-500 bg-rose-950/20 animate-shake'
                : 'border-white/10'
            }`}
          >
            <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
              {currentQ.type === 'table' ? 'Multiplication Table' : currentQ.type === 'square' ? 'Square Recall' : 'Cube Recall'}
            </span>

            <div className="text-4xl sm:text-6xl font-black font-mono tracking-tight text-white text-center">
              {currentQ.prompt}
            </div>

            <div className="w-full max-w-xs h-16 sm:h-20 rounded-2xl bg-slate-950/80 border-2 border-amber-500/40 flex items-center justify-center text-3xl sm:text-4xl font-mono font-black text-white shadow-inner relative">
              <span>{inputVal || ''}</span>
              {!inputVal && (
                <span className="text-slate-600 text-lg font-normal">Enter recall...</span>
              )}
              <div className="w-1 h-8 bg-amber-400 ml-1 animate-pulse" />
            </div>
          </div>

          {/* Touch Numpad */}
          <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-4 shadow-2xl">
            <MathNumpad
              onDigit={(d) => setInputVal((prev) => (prev.length < 8 ? prev + d : prev))}
              onBackspace={() => setInputVal((prev) => prev.slice(0, -1))}
              onClear={() => setInputVal('')}
              onSubmit={submitAnswer}
            />
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
