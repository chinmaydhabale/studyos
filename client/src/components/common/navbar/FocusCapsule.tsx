import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Clock,
  Sparkles,
  ChevronDown,
  Headphones,
  Sliders,
  Check
} from 'lucide-react';
import { useStudy, AmbientSoundType } from '../../../context/StudyContext.js';

export const FocusCapsule: React.FC = () => {
  const {
    timerMode,
    timeLeft,
    isRunning,
    startTimer,
    pauseTimer,
    resetTimer,
    setTimerMode,
    ambientSound,
    setAmbientSound,
    ambientVolume,
    setAmbientVolume
  } = useStudy();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const ambientOptions: Array<{ id: AmbientSoundType; label: string; icon: string }> = [
    { id: 'none', label: 'Off / Silent', icon: '🔇' },
    { id: 'lofi', label: 'Lo-Fi Chill Beats', icon: '🎧' },
    { id: 'rain', label: 'Monsoon Rain', icon: '🌧️' },
    { id: 'library', label: 'Quiet Library', icon: '📚' },
    { id: 'whitenoise', label: 'Deep White Noise', icon: '🌊' }
  ];

  const totalModeDuration = timerMode === 'focus' ? 25 * 60 : timerMode === 'short_break' ? 5 * 60 : 15 * 60;
  const progressPercent = Math.max(0, Math.min(100, ((totalModeDuration - timeLeft) / totalModeDuration) * 100));

  return (
    <div className="relative select-none shrink-0" ref={containerRef}>
      
      {/* Sleek Pill Capsule Trigger */}
      <div className="flex items-center bg-slate-900/90 hover:bg-slate-800/90 border border-white/10 hover:border-indigo-500/30 rounded-xl p-0.5 sm:p-1 shadow-md transition-all">
        
        {/* Timer Trigger & Countdown */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/5 text-xs transition-colors"
          title="Focus Pomodoro & Ambient Sounds"
        >
          <div className="relative flex items-center justify-center">
            <Clock className={`w-3.5 h-3.5 ${isRunning ? 'text-emerald-400 animate-spin' : 'text-indigo-400'}`} />
          </div>
          <span className="font-mono font-bold text-white text-xs sm:text-sm tracking-tight">
            {formatTime(timeLeft)}
          </span>
          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : ''}`} />
        </button>

        {/* Divider */}
        <div className="w-px h-3.5 bg-white/10 mx-0.5" />

        {/* Quick Play/Pause Button */}
        <button
          type="button"
          onClick={isRunning ? pauseTimer : startTimer}
          className={`p-1.5 rounded-xl transition-all ${
            isRunning
              ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
          }`}
          title={isRunning ? 'Pause Focus Session' : 'Start Focus Session'}
        >
          {isRunning ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
        </button>

        {/* Ambient Sound Indicator Icon */}
        {ambientSound !== 'none' && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="p-1.5 rounded-xl text-cyan-300 bg-cyan-500/15 hover:bg-cyan-500/25 ml-0.5 transition-colors animate-pulse"
            title={`Ambient: ${ambientSound} playing. Click to adjust.`}
          >
            <Headphones className="w-3.5 h-3.5" />
          </button>
        )}

      </div>

      {/* Expanded Focus & Sound Control Popover */}
      {isOpen && (
        <div className="fixed inset-x-3 top-[56px] sm:top-auto sm:inset-x-auto sm:absolute sm:right-0 sm:mt-2 w-auto sm:w-80 max-w-[calc(100vw-24px)] rounded-3xl bg-[#0b101e]/95 backdrop-blur-2xl border border-white/15 p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-4 text-slate-100">
          
          {/* Header Title */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="font-extrabold text-xs uppercase tracking-wider text-white">Focus & Atmosphere</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Pomodoro 2.0</span>
          </div>

          {/* Mode Switcher (25m Focus / 5m Break / 15m Long Break) */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-950/70 p-1 rounded-2xl border border-white/5">
            {(
              [
                { id: 'focus', label: '25m Focus' },
                { id: 'short_break', label: '5m Break' },
                { id: 'long_break', label: '15m Break' }
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setTimerMode(m.id)}
                className={`py-1.5 rounded-xl text-[11px] font-bold transition-all text-center ${
                  timerMode === m.id
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Big Time Display & Progress Bar */}
          <div className="bg-slate-950/80 border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 shadow-inner">
            <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white">
              {formatTime(timeLeft)}
            </span>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Play, Pause, Reset Controls */}
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={isRunning ? pauseTimer : startTimer}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                  isRunning
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isRunning ? 'Pause' : 'Start Focus'}</span>
              </button>

              <button
                type="button"
                onClick={resetTimer}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
                title="Reset Timer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Ambient Sound Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1 text-cyan-300">
                <Volume2 className="w-3.5 h-3.5" />
                <span>Ambient Soundscapes</span>
              </span>
              <span className="text-[10px] text-slate-500">
                {ambientSound === 'none' ? 'Muted' : 'Playing'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1">
              {ambientOptions.map((opt) => {
                const isSelected = ambientSound === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAmbientSound(opt.id)}
                    className={`w-full px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-indigo-600/30 border border-indigo-500/40 text-white font-bold'
                        : 'hover:bg-white/5 text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                  </button>
                );
              })}
            </div>

            {/* Volume Slider if sound is playing */}
            {ambientSound !== 'none' && (
              <div className="pt-2 border-t border-white/10 flex items-center gap-2 text-xs text-slate-400">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px]">Volume</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={ambientVolume}
                  onChange={(e) => setAmbientVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] font-mono text-cyan-300">
                  {Math.round(ambientVolume * 100)}%
                </span>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
};
