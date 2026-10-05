import React, { useState, useEffect } from 'react';
import { useSocket } from '../../context/SocketContext.js';

interface FloatingReactionParticle {
  id: string;
  emoji: string;
  userName: string;
  leftPercent: number;
}

const EMOJI_OPTIONS = [
  { emoji: '🍿', label: 'Popcorn' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '😱', label: 'Shocked' },
  { emoji: '👏', label: 'Clap' },
  { emoji: '🎉', label: 'Party' }
];

export const MovieReactions: React.FC = () => {
  const { movieReactions, sendMovieReaction } = useSocket();
  const [activeParticles, setActiveParticles] = useState<FloatingReactionParticle[]>([]);

  // When a new reaction arrives from socket, spawn a floating particle
  useEffect(() => {
    if (movieReactions.length === 0) return;
    const latest = movieReactions[movieReactions.length - 1];
    if (!latest) return;

    const particle: FloatingReactionParticle = {
      id: latest.id,
      emoji: latest.emoji,
      userName: latest.userName,
      leftPercent: 65 + Math.random() * 25 // spawn between 65% and 90% across screen width
    };

    setActiveParticles(prev => [...prev.slice(-20), particle]);

    // Automatically remove after 2.5 seconds animation finishes
    const timer = setTimeout(() => {
      setActiveParticles(prev => prev.filter(p => p.id !== particle.id));
    }, 2500);

    return () => clearTimeout(timer);
  }, [movieReactions]);

  return (
    <>
      {/* Floating Animated Particles Overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {activeParticles.map(particle => (
          <div
            key={particle.id}
            className="absolute bottom-16 animate-float-reaction flex flex-col items-center pointer-events-none select-none transition-all"
            style={{ left: `${particle.leftPercent}%` }}
          >
            <span className="text-3xl drop-shadow-lg filter">{particle.emoji}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-black/60 backdrop-blur-sm text-white/90 border border-white/20 -mt-1 shadow-md">
              {particle.userName}
            </span>
          </div>
        ))}
      </div>

      {/* Interactive Quick Reaction Bar */}
      <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/15 shadow-xl pointer-events-auto">
        <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider mr-1">
          React:
        </span>
        {EMOJI_OPTIONS.map(({ emoji, label }) => (
          <button
            key={emoji}
            onClick={() => sendMovieReaction(emoji)}
            title={label}
            className="w-8 h-8 rounded-xl hover:bg-white/15 active:scale-125 hover:scale-110 flex items-center justify-center text-lg transition-transform"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
};
