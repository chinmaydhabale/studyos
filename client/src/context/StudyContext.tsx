import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { useSocket } from './SocketContext.js';

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

  // Gamification & Rewards
  xp: number;
  level: number;
  coins: number;
  streak: number;
  badges: string[];
  addXp: (amount: number, reason?: string) => void;
  triggerCelebration: () => void;
}

const StudyContext = createContext<StudyContextType | null>(null);

const XP_PER_LEVEL = 400;

const modeDurations = {
  focus: 25 * 60,
  short_break: 5 * 60,
  long_break: 15 * 60
} as const;

export const StudyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, updateUserProfile, socket, roomId } = useSocket();

  // Focus Timer States (25m focus, 5m short break, 15m long break)
  const [timerMode, setTimerModeState] = useState<'focus' | 'short_break' | 'long_break'>('focus');
  const [timeLeft, setTimeLeft] = useState(modeDurations.focus);
  const [isRunning, setIsRunning] = useState(false);
  const [totalFocusSecondsToday, setTotalFocusSecondsToday] = useState(0);
  const [breakCountToday, setBreakCountToday] = useState(0);

  // Gamification States - synchronized with currentUser
  const [xp, setXp] = useState(currentUser?.xp ?? 0);
  const [coins, setCoins] = useState(currentUser?.coins ?? 0);
  const [streak, setStreak] = useState(currentUser?.streak ?? 0);
  const [badges, setBadges] = useState<string[]>(currentUser?.badges ?? []);

  // When currentUser updates from server / login / database, keep StudyContext in sync
  useEffect(() => {
    if (currentUser) {
      setXp(currentUser.xp ?? 0);
      setCoins(currentUser.coins ?? 0);
      setStreak(currentUser.streak ?? 0);
      setBadges(currentUser.badges ?? []);
    }
  }, [currentUser?.id, currentUser?.xp, currentUser?.coins, currentUser?.streak]);

  // Level is derived from XP so it can never drift out of sync
  const level = useMemo(() => Math.floor(xp / XP_PER_LEVEL) + 1, [xp]);

  // Ambient Sounds
  const [ambientSound, setAmbientSound] = useState<AmbientSoundType>('none');
  const [ambientVolume, setAmbientVolume] = useState(0.5);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseNodeRef = useRef<AudioNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const celebratedLevelRef = useRef(1);

  const triggerCelebration = useCallback(() => {
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 }
    });
  }, []);

  // State updaters stay pure — XP/coins/streak are updated locally and synced to currentUser profile.
  const addXp = useCallback((amount: number, _reason?: string) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const earnedCoins = Math.floor(amount / 5);
    setXp(prevXp => {
      const nextXp = prevXp + amount;
      setCoins(prevCoins => {
        const nextCoins = prevCoins + earnedCoins;
        setStreak(prevStreak => {
          const nextStreak = prevStreak === 0 ? 1 : prevStreak;
          updateUserProfile({
            xp: nextXp,
            coins: nextCoins,
            streak: nextStreak
          });
          return nextStreak;
        });
        return nextCoins;
      });
      return nextXp;
    });
  }, [updateUserProfile]);

  useEffect(() => {
    if (level > celebratedLevelRef.current) {
      celebratedLevelRef.current = level;
      triggerCelebration();
    }
  }, [level, triggerCelebration]);

  const setTimerMode = useCallback((mode: 'focus' | 'short_break' | 'long_break') => {
    setTimerModeState(mode);
    setIsRunning(false);
    setTimeLeft(modeDurations[mode]);
  }, []);

  const startTimer = () => setIsRunning(true);
  const pauseTimer = () => setIsRunning(false);
  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setTimerModeState(prev => {
      setTimeLeft(modeDurations[prev]);
      return prev;
    });
  }, []);

  // Timer Tick — the updater only counts down; nothing else happens inside it.
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1));
      if (timerMode === 'focus') {
        setTotalFocusSecondsToday(s => s + 1);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timerMode]);

  // Handle a finished interval outside of the updater so StrictMode's double
  // invocation of updaters can never award XP or fire confetti twice.
  useEffect(() => {
    if (!isRunning || timeLeft > 0) return;

    setIsRunning(false);
    if (timerMode === 'focus') {
      addXp(100, 'Completed Focus Session');
      triggerCelebration();

      // Log Pomodoro session to server persistent activity sessions & calendar
      if (socket?.connected && roomId) {
        socket.emit('activity:stop', {
          roomId,
          userId: currentUser.id,
          userName: currentUser.name || currentUser.username || 'Student',
          activityName: '🍅 Pomodoro Focus Session',
          category: 'study',
          durationSeconds: modeDurations.focus,
          localDate: new Date().toLocaleDateString('en-CA')
        });
      }

      setTimerMode('short_break');
    } else {
      setBreakCountToday(b => b + 1);
      setTimerMode('focus');
    }
  }, [timeLeft, isRunning, timerMode, addXp, triggerCelebration, setTimerMode]);

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
