import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';

export type AmbientSoundType = 'none' | 'lofi' | 'rain' | 'library' | 'whitenoise';

interface StudyContextType {
  // Timer
  timerMode: 'focus' | 'short_break' | 'long_break';
  timeLeft: number;
  isRunning: boolean;
  totalFocusSecondsToday: number;
  breakCountToday: number;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  setTimerMode: (mode: 'focus' | 'short_break' | 'long_break') => void;

  // Ambient Audio
  ambientSound: AmbientSoundType;
  ambientVolume: number;
  setAmbientSound: (sound: AmbientSoundType) => void;
  setAmbientVolume: (vol: number) => void;

  // Gamification & Rewards (Zero-Start)
  xp: number;
  level: number;
  coins: number;
  streak: number;
  badges: string[];
  addXp: (amount: number, reason?: string) => void;
  triggerCelebration: () => void;
}

const StudyContext = createContext<StudyContextType | null>(null);

export const StudyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Focus Timer States (25m focus, 5m short break, 15m long break)
  const [timerMode, setTimerModeState] = useState<'focus' | 'short_break' | 'long_break'>('focus');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [totalFocusSecondsToday, setTotalFocusSecondsToday] = useState(0); // Starts at 0
  const [breakCountToday, setBreakCountToday] = useState(0); // Starts at 0

  // Gamification States (Starts at pure 0)
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [coins, setCoins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [badges, setBadges] = useState<string[]>([]);

  // Ambient Sounds
  const [ambientSound, setAmbientSound] = useState<AmbientSoundType>('none');
  const [ambientVolume, setAmbientVolume] = useState(0.5);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseNodeRef = useRef<AudioNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const triggerCelebration = useCallback(() => {
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 }
    });
  }, []);

  const addXp = useCallback((amount: number, _reason?: string) => {
    setXp(prev => {
      const newXp = prev + amount;
      const nextLevel = Math.floor(newXp / 400) + 1;
      if (nextLevel > level) {
        setLevel(nextLevel);
        triggerCelebration();
      }
      return newXp;
    });
    setCoins(prev => prev + Math.floor(amount / 5));
    setStreak(s => (s === 0 ? 1 : s));
  }, [level, triggerCelebration]);

  const setTimerMode = useCallback((mode: 'focus' | 'short_break' | 'long_break') => {
    setTimerModeState(mode);
    setIsRunning(false);
    if (mode === 'focus') setTimeLeft(25 * 60);
    else if (mode === 'short_break') setTimeLeft(5 * 60);
    else setTimeLeft(15 * 60);
  }, []);

  const startTimer = () => setIsRunning(true);
  const pauseTimer = () => setIsRunning(false);
  const resetTimer = () => {
    setIsRunning(false);
    setTimerMode(timerMode);
  };

  // Timer Tick
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsRunning(false);

          if (timerMode === 'focus') {
            addXp(100, 'Completed Focus Session');
            triggerCelebration();
            setTimerMode('short_break');
          } else {
            setBreakCountToday(b => b + 1);
            setTimerMode('focus');
          }
          return 0;
        }
        if (timerMode === 'focus') {
          setTotalFocusSecondsToday(s => s + 1);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timerMode, addXp, triggerCelebration, setTimerMode]);

  // Ambient Sounds synthesis
  useEffect(() => {
    if (noiseNodeRef.current) {
      try {
        (noiseNodeRef.current as any).stop?.();
        noiseNodeRef.current.disconnect();
      } catch (e) {}
      noiseNodeRef.current = null;
    }

    if (ambientSound === 'none') return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const gain = ctx.createGain();
      gain.gain.value = ambientVolume * 0.15;
      gain.connect(ctx.destination);
      gainNodeRef.current = gain;

      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (ambientSound === 'rain') {
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 2.5;
        } else if (ambientSound === 'whitenoise') {
          data[i] = white * 0.4;
        } else if (ambientSound === 'library') {
          data[i] = (lastOut + 0.01 * white) / 1.01;
          lastOut = data[i];
          data[i] *= 1.8;
        } else if (ambientSound === 'lofi') {
          data[i] = white * 0.05 + Math.sin(i / 120) * 0.08;
        }
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;
      noiseSource.connect(gain);
      noiseSource.start();
      noiseNodeRef.current = noiseSource;
    } catch (err) {}

    return () => {
      if (noiseNodeRef.current) {
        try {
          (noiseNodeRef.current as any).stop?.();
          noiseNodeRef.current.disconnect();
        } catch (e) {}
        noiseNodeRef.current = null;
      }
    };
  }, [ambientSound, ambientVolume]);

  return (
    <StudyContext.Provider
      value={{
        timerMode,
        timeLeft,
        isRunning,
        totalFocusSecondsToday,
        breakCountToday,
        startTimer,
        pauseTimer,
        resetTimer,
        setTimerMode,
        ambientSound,
        ambientVolume,
        setAmbientSound,
        setAmbientVolume,
        xp,
        level,
        coins,
        streak,
        badges,
        addXp,
        triggerCelebration
      }}
    >
      {children}
    </StudyContext.Provider>
  );
};

export const useStudy = () => {
  const context = useContext(StudyContext);
  if (!context) throw new Error('useStudy must be used within a StudyProvider');
  return context;
};
