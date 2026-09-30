import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Clock,
  CheckCircle2,
  ChevronRight,
  Flame,
  Award,
  AlertCircle
} from 'lucide-react';

export interface SectionConfig {
  id: string;
  name: string;
  durationMinutes: number;
  questionCount: number;
  color: string;
}

const PRELIMS_SECTIONS: SectionConfig[] = [
  { id: 'english', name: 'English Language', durationMinutes: 20, questionCount: 30, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { id: 'quant', name: 'Quantitative Aptitude', durationMinutes: 20, questionCount: 35, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  { id: 'reasoning', name: 'Reasoning Ability', durationMinutes: 20, questionCount: 35, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' }
];

const MAINS_SECTIONS: SectionConfig[] = [
  { id: 'reasoning_comp', name: 'Reasoning & Computer', durationMinutes: 45, questionCount: 45, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { id: 'data_analysis', name: 'Data Analysis & Quant', durationMinutes: 45, questionCount: 35, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  { id: 'general_awareness', name: 'General & Banking Awareness', durationMinutes: 35, questionCount: 40, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  { id: 'english_mains', name: 'English Language', durationMinutes: 35, questionCount: 35, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' }
];

let sharedAudioContext: AudioContext | null = null;
function getSharedAudioContext(): AudioContext | null {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioContextClass();
    }
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch (e) {
    return null;
  }
}

interface MockTimerProps {
  onExamFinish?: (totalSecondsTaken: number, examMode: string) => void;
  onSectionChange?: (sectionName: string) => void;
}

export const MockTimer: React.FC<MockTimerProps> = ({
  onExamFinish,
  onSectionChange
}) => {
  const [examMode, setExamMode] = useState<'prelims' | 'mains' | 'stopwatch'>('prelims');
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(20 * 60);
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Bug 19 fix: store parent callbacks in refs so inline arrows don't tear down interval
  const onExamFinishRef = useRef(onExamFinish);
  onExamFinishRef.current = onExamFinish;
  const onSectionChangeRef = useRef(onSectionChange);
  onSectionChangeRef.current = onSectionChange;

  const sections = examMode === 'prelims' ? PRELIMS_SECTIONS : MAINS_SECTIONS;
  const currentSection = sections[currentSectionIndex] || sections[0];
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const currentSectionIndexRef = useRef(currentSectionIndex);
  currentSectionIndexRef.current = currentSectionIndex;

  // Bug 22 fix: track end timestamp to prevent cumulative clock drift
  const targetEndTimeRef = useRef<number | null>(null);

  const totalExamDurationSeconds = sections.reduce((acc, s) => acc + s.durationMinutes * 60, 0);

  // Play audio chime (Bug 21 fix: reuse singleton AudioContext)
  const playAlertSound = (freq = 880) => {
    if (!soundEnabled) return;
    try {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {}
  };

  // Change exam mode
  const handleModeChange = (mode: 'prelims' | 'mains' | 'stopwatch') => {
    setIsRunning(false);
    targetEndTimeRef.current = null;
    setExamMode(mode);
    setCurrentSectionIndex(0);
    if (mode === 'prelims') {
      setSecondsRemaining(PRELIMS_SECTIONS[0].durationMinutes * 60);
    } else if (mode === 'mains') {
      setSecondsRemaining(MAINS_SECTIONS[0].durationMinutes * 60);
    } else {
      setStopwatchSeconds(0);
    }
  };

  // Reset timer
  const handleReset = () => {
    setIsRunning(false);
    targetEndTimeRef.current = null;
    setCurrentSectionIndex(0);
    if (examMode === 'stopwatch') {
      setStopwatchSeconds(0);
    } else {
      setSecondsRemaining(sections[0].durationMinutes * 60);
    }
  };

  // Jump to specific section
  const handleJumpToSection = (index: number) => {
    setCurrentSectionIndex(index);
    const newSeconds = sections[index].durationMinutes * 60;
    setSecondsRemaining(newSeconds);
    if (isRunning) {
      targetEndTimeRef.current = Date.now() + newSeconds * 1000;
    }
    if (onSectionChangeRef.current) onSectionChangeRef.current(sections[index].name);
  };

  // Timer Tick Interval (Bugs 19, 20, 22 fixed)
  useEffect(() => {
    if (!isRunning) {
      targetEndTimeRef.current = null;
      return;
    }

    if (examMode === 'stopwatch') {
      const stopwatchStart = Date.now() - stopwatchSeconds * 1000;
      const interval = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - stopwatchStart) / 1000);
        setStopwatchSeconds(elapsed);
      }, 500);
      return () => clearInterval(interval);
    }

    // Exam countdown mode with drift-free timestamp math
    if (targetEndTimeRef.current === null) {
      targetEndTimeRef.current = Date.now() + secondsRemaining * 1000;
    }

    const interval = window.setInterval(() => {
      if (!targetEndTimeRef.current) return;
      const remainingMs = targetEndTimeRef.current - Date.now();
      const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));

      setSecondsRemaining(prev => {
        if (remainingSecs === 120 && prev > 120) {
          playAlertSound(660); // 2 minute warning
        }

        // Bug 20 fix: section completes once remaining reaches 0 (displaying 00:00)
        if (remainingSecs <= 0) {
          playAlertSound(1100);
          const curIdx = currentSectionIndexRef.current;
          const curSections = sectionsRef.current;
          if (curIdx < curSections.length - 1) {
            const nextIdx = curIdx + 1;
            setCurrentSectionIndex(nextIdx);
            if (onSectionChangeRef.current) {
              onSectionChangeRef.current(curSections[nextIdx].name);
            }
            const nextSecs = curSections[nextIdx].durationMinutes * 60;
            targetEndTimeRef.current = Date.now() + nextSecs * 1000;
            return nextSecs;
          } else {
            // Whole mock complete!
            setIsRunning(false);
            targetEndTimeRef.current = null;
            playAlertSound(1320);
            if (onExamFinishRef.current) {
              onExamFinishRef.current(totalExamDurationSeconds, examMode);
            }
            return 0;
          }
        }

        return remainingSecs;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [isRunning, examMode, totalExamDurationSeconds]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentDisplayTime = examMode === 'stopwatch'
    ? formatTime(stopwatchSeconds)
    : formatTime(secondsRemaining);

  return (
    <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col gap-3">
      {/* Top Header & Mode Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Mock Exam Timer
          </span>
          {isRunning && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Live Exam Clock
            </span>
          )}
        </div>

        {/* Exam Presets */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-white/10 text-xs">
          <button
            onClick={() => handleModeChange('prelims')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              examMode === 'prelims' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Prelims (60m)
          </button>
          <button
            onClick={() => handleModeChange('mains')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              examMode === 'mains' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mains (150m)
          </button>
          <button
            onClick={() => handleModeChange('stopwatch')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              examMode === 'stopwatch' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Stopwatch
          </button>
        </div>
      </div>

      {/* Main Timer Display & Controls */}
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight text-white font-mono drop-shadow-md">
            {currentDisplayTime}
          </span>
          {examMode !== 'stopwatch' && (
            <span className="text-xs text-slate-400 font-medium">
              / {currentSection.durationMinutes}:00
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border transition-colors ${
              soundEnabled
                ? 'bg-slate-800 text-slate-300 border-white/10 hover:text-white'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
            title={soundEnabled ? 'Mute Chimes' : 'Enable Chimes'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={handleReset}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-white/10 hover:text-white hover:bg-slate-700 transition-colors"
            title="Reset Timer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95 ${
              isRunning
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>
                  {examMode === 'stopwatch'
                    ? (stopwatchSeconds === 0 ? 'Start' : 'Resume')
                    : (secondsRemaining === sections[currentSectionIndex].durationMinutes * 60 && currentSectionIndex === 0
                        ? 'Start Exam'
                        : 'Resume')}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Banking Section Tabs (Prelims / Mains) */}
      {examMode !== 'stopwatch' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          {sections.map((sec, idx) => {
            const isCurrent = idx === currentSectionIndex;
            const isPast = idx < currentSectionIndex;
            return (
              <button
                key={sec.id}
                onClick={() => handleJumpToSection(idx)}
                className={`p-2.5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col gap-0.5 ${
                  isCurrent
                    ? `${sec.color} ring-2 ring-indigo-500/50 shadow-md`
                    : isPast
                    ? 'bg-slate-950/40 border-white/5 text-slate-500 hover:text-slate-300'
                    : 'bg-slate-950/60 border-white/10 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="truncate">{sec.name}</span>
                  {isPast && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {isCurrent && isRunning && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>{sec.durationMinutes} mins</span>
                  <span>{sec.questionCount} Questions</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
