import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  Zap,
  Brain,
  Target,
  Search,
  Scale,
  Table2,
  Swords,
  Trophy,
  Flame,
  Clock,
  Sparkles,
  Volume2,
  VolumeX,
  Play,
  ArrowRight,
  Award,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { GameModeId } from './types.js';
import { SpeedArithmeticBlitz } from './games/SpeedArithmeticBlitz.js';
import { VedicHacksDrill } from './games/VedicHacksDrill.js';
import { Target24Game } from './games/Target24Game.js';
import { EquationDetective } from './games/EquationDetective.js';
import { FlashCompareGame } from './games/FlashCompareGame.js';
import { TablesSquaresDrill } from './games/TablesSquaresDrill.js';
import { MultiplayerDuelArena } from './duel/MultiplayerDuelArena.js';
import { mathSounds } from './engines/mathSoundEffects.js';
import { useStudy } from '../../context/StudyContext.js';
import { useSocket } from '../../context/SocketContext.js';

export const MathGamesArena: React.FC = () => {
  const { xp, level, coins } = useStudy();
  const { peers } = useSocket();
  const [activeGame, setActiveGame] = useState<GameModeId | null>(null);
  const [isMuted, setIsMuted] = useState(mathSounds.getMuted());

  // Sound toggle
  const toggleMute = () => {
    const next = !isMuted;
    mathSounds.setMuted(next);
    setIsMuted(next);
  };

  const gameCards: Array<{
    id: GameModeId;
    title: string;
    subtitle: string;
    badge: string;
    icon: React.ComponentType<{ className?: string }>;
    gradient: string;
    shadow: string;
    border: string;
    popular?: boolean;
    multiplayer?: boolean;
  }> = [
    {
      id: 'blitz',
      title: 'Speed Arithmetic Blitz',
      subtitle: 'Rapid-fire +, -, ×, ÷ with streak multiplier combos. 60s, 120s & Sudden Death.',
      badge: 'Popular',
      icon: Zap,
      gradient: 'from-rose-500/20 via-slate-900 to-indigo-950/40',
      shadow: 'shadow-rose-950/40',
      border: 'border-rose-500/30 hover:border-rose-400',
      popular: true
    },
    {
      id: 'vedic',
      title: 'Vedic & Mental Math Hacks',
      subtitle: 'Squares ending in 5, multiply by 11 & 25, base-100 & fraction % shortcuts with trick guides.',
      badge: 'Exam Hacks',
      icon: Brain,
      gradient: 'from-purple-500/20 via-slate-900 to-indigo-950/40',
      shadow: 'shadow-purple-950/40',
      border: 'border-purple-500/30 hover:border-purple-400'
    },
    {
      id: 'duel',
      title: '1v1 Room Math Duel',
      subtitle: 'Challenge your co-study buddies to a live synchronized 60-second speed math showdown!',
      badge: 'Multiplayer',
      icon: Swords,
      gradient: 'from-amber-500/20 via-slate-900 to-rose-950/40',
      shadow: 'shadow-amber-950/40',
      border: 'border-amber-500/30 hover:border-amber-400',
      multiplayer: true
    },
    {
      id: 'target24',
      title: 'Target 24 Puzzle IQ',
      subtitle: 'Combine 4 number cards with operations & brackets to form exactly 24. Math IQ challenge.',
      badge: 'Logic Puzzle',
      icon: Target,
      gradient: 'from-emerald-500/20 via-slate-900 to-teal-950/40',
      shadow: 'shadow-emerald-950/40',
      border: 'border-emerald-500/30 hover:border-emerald-400'
    },
    {
      id: 'detective',
      title: 'Equation Detective',
      subtitle: 'Missing operator (+, -, ×, ÷) and missing operand deduction under time pressure.',
      badge: 'BODMAS',
      icon: Search,
      gradient: 'from-cyan-500/20 via-slate-900 to-blue-950/40',
      shadow: 'shadow-cyan-950/40',
      border: 'border-cyan-500/30 hover:border-cyan-400'
    },
    {
      id: 'compare',
      title: 'Flash Compare (< = >)',
      subtitle: 'Compare two mathematical expressions in split seconds. Fast quantitative estimation test.',
      badge: 'Estimation',
      icon: Scale,
      gradient: 'from-teal-500/20 via-slate-900 to-emerald-950/40',
      shadow: 'shadow-teal-950/40',
      border: 'border-teal-500/30 hover:border-teal-400'
    },
    {
      id: 'tables',
      title: 'Tables, Squares & Cubes',
      subtitle: 'Rapid muscle memory drill for Tables (1-30), Squares (1-50), and Cubes (1-30).',
      badge: 'Direct Recall',
      icon: Table2,
      gradient: 'from-blue-500/20 via-slate-900 to-indigo-950/40',
      shadow: 'shadow-blue-950/40',
      border: 'border-blue-500/30 hover:border-blue-400'
    }
  ];

  // Render active game stage if selected
  if (activeGame === 'blitz') {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto custom-scrollbar">
        <SpeedArithmeticBlitz onBackToHub={() => setActiveGame(null)} />
      </div>
    );
  }

  if (activeGame === 'vedic') {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto custom-scrollbar">
        <VedicHacksDrill onBackToHub={() => setActiveGame(null)} />
      </div>
    );
  }

  if (activeGame === 'target24') {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto custom-scrollbar">
        <Target24Game onBackToHub={() => setActiveGame(null)} />
      </div>
    );
  }

  if (activeGame === 'detective') {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto custom-scrollbar">
        <EquationDetective onBackToHub={() => setActiveGame(null)} />
      </div>
    );
  }

  if (activeGame === 'compare') {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto custom-scrollbar">
        <FlashCompareGame onBackToHub={() => setActiveGame(null)} />
      </div>
    );
  }

  if (activeGame === 'tables') {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto custom-scrollbar">
        <TablesSquaresDrill onBackToHub={() => setActiveGame(null)} />
      </div>
    );
  }

  if (activeGame === 'duel') {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto custom-scrollbar">
        <MultiplayerDuelArena onBackToHub={() => setActiveGame(null)} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto space-y-4 custom-scrollbar text-slate-100">
      
      {/* Top Banner & Audio Controller */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <Gamepad2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
                Speed Math & Calculation Games Arena
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Live Gaming
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Supercharge your calculation reflexes, learn mental math shortcuts, and battle room buddies in real time!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Audio Sound Toggle */}
          <button
            type="button"
            onClick={toggleMute}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
              isMuted
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span>{isMuted ? 'Muted' : 'Sound FX On'}</span>
          </button>

          {/* Quick 1v1 Room Challenge Banner */}
          <button
            type="button"
            onClick={() => setActiveGame('duel')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg shadow-rose-950/50 transition-all active:scale-95"
          >
            <Swords className="w-4 h-4" />
            <span>Room 1v1 Duel</span>
            {peers.length > 1 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                {peers.length - 1} Online
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Gamification Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-3.5 flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Study Level</span>
            <div className="text-base font-black text-white">Level {level}</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-3.5 flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Zap className="w-5 h-5 fill-indigo-400" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Experience Points</span>
            <div className="text-base font-black text-cyan-300">{xp} XP</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-3.5 flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Math Arena Coins</span>
            <div className="text-base font-black text-yellow-300">{coins} Coins</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-3.5 flex items-center gap-3 shadow-md">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <Swords className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400">Room Status</span>
            <div className="text-base font-black text-white">
              {peers.length > 1 ? `${peers.length} Peers Ready` : 'Solo Practice'}
            </div>
          </div>
        </div>
      </div>

      {/* Game Mode Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {gameCards.map((game) => {
          const Icon = game.icon;
          return (
            <div
              key={game.id}
              onClick={() => {
                mathSounds.playClick();
                setActiveGame(game.id);
              }}
              className={`bg-gradient-to-br ${game.gradient} border ${game.border} rounded-3xl p-5 shadow-xl ${game.shadow} hover:-translate-y-1 hover:shadow-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4 group`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-2xl bg-slate-900/90 border border-white/10 flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white border border-white/15">
                    {game.badge}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-black text-white group-hover:text-cyan-300 transition-colors">
                    {game.title}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {game.subtitle}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold text-slate-300 group-hover:text-white">
                <span className="flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play Game</span>
                </span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
};
