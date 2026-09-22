import React, { useEffect, useState } from 'react';
import {
  Trophy,
  Award,
  Flame,
  Coins,
  Shield,
  Star,
  Users,
  Building,
  MapPin,
  Globe,
  Sparkles,
  Zap
} from 'lucide-react';
import { LeaderboardEntry } from '../../types.js';
import { useStudy } from '../../context/StudyContext.js';
import { API_BASE_URL } from '../../config.js';

type TierFilter = 'Friends' | 'Study Room' | 'College' | 'City' | 'Country' | 'Global';

export const LeaderboardsView: React.FC = () => {
  const { xp, level, coins, streak, badges, triggerCelebration } = useStudy();
  const [filter, setFilter] = useState<TierFilter>('Global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/leaderboard?filter=${encodeURIComponent(filter)}`)
      .then((res) => res.json())
      .then((data) => setEntries(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [filter]);

  const achievementBadges = [
    { title: '🔥 7-Day Streak', desc: 'Maintained 7 consecutive study days without missing.', unlocked: true, color: 'from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-300' },
    { title: '🏆 100 Study Hours', desc: 'Accumulated over 100 deep focus hours on StudyOS.', unlocked: true, color: 'from-yellow-500/20 to-amber-500/20 border-yellow-500/30 text-yellow-300' },
    { title: '⚡ No Break Session', desc: 'Completed a 50-minute uninterrupted deep focus block.', unlocked: true, color: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/30 text-cyan-300' },
    { title: '📚 Completed 500 Tasks', desc: 'Crushed 500 individual study objectives and quizzes.', unlocked: false, color: 'from-slate-800 to-slate-900 border-white/5 text-slate-500' },
    { title: '🎯 Perfect Week', desc: 'Hit 100% of planned study targets for 7 days straight.', unlocked: true, color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-300' }
  ];

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'Diamond': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'Platinum': return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      case 'Gold': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      default: return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto space-y-4">
      
      {/* Top Banner & Wallet */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-yellow-500 via-amber-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white">Gamification & Multi-Tier Leaderboards</h1>
            <p className="text-xs text-slate-400">
              Holistic rankings: Hours + Focus Score + Consistency + XP + Accuracy
            </p>
          </div>
        </div>

        {/* User Stats Card */}
        <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-xl border border-white/10 text-xs">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold">
            <Flame className="w-4 h-4 fill-amber-400 animate-bounce" />
            <span>{streak}-Day Streak</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-1.5 text-indigo-300 font-semibold">
            <Zap className="w-4 h-4 text-indigo-400" />
            <span>Level {level} ({xp} XP)</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-1.5 text-yellow-400 font-bold">
            <Coins className="w-4 h-4 text-yellow-400" />
            <span>{coins} Coins</span>
          </div>
        </div>
      </div>

      {/* Row: Achievements & Badges Showcase */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-400" />
            <span>Unlocked Study Achievements & Badges</span>
          </h3>
          <button
            onClick={triggerCelebration}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Celebrate Progress</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {achievementBadges.map((badge, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border bg-gradient-to-br ${badge.color} flex flex-col justify-between transition-transform hover:scale-105`}
            >
              <div>
                <p className="text-xs font-bold">{badge.title}</p>
                <p className="text-[10px] opacity-80 mt-1 leading-relaxed">{badge.desc}</p>
              </div>
              <span className="text-[9px] uppercase font-mono font-bold tracking-wider mt-2 block">
                {badge.unlocked ? '✓ Unlocked' : '🔒 In Progress (48/500)'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Multi-tier Filter Switcher */}
      <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-2xl border border-white/10 overflow-x-auto">
        {[
          { id: 'Friends', icon: Users },
          { id: 'Study Room', icon: Shield },
          { id: 'College', icon: Building },
          { id: 'City', icon: MapPin },
          { id: 'Country', icon: Globe },
          { id: 'Global', icon: Trophy }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as TierFilter)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                filter === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.id} Leaderboard</span>
            </button>
          );
        })}
      </div>

      {/* Leaderboard Table */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 font-semibold uppercase text-[10px]">
                <th className="py-3 px-3">Rank</th>
                <th className="py-3 px-3">Student</th>
                <th className="py-3 px-3">College / Location</th>
                <th className="py-3 px-3">Study Hours</th>
                <th className="py-3 px-3">Focus Score</th>
                <th className="py-3 px-3">Consistency</th>
                <th className="py-3 px-3">Accuracy</th>
                <th className="py-3 px-3">XP</th>
                <th className="py-3 px-3 text-right">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {entries.map((student) => {
                const isMe = student.id === 'user_self';
                return (
                  <tr
                    key={student.id}
                    className={`transition-colors ${
                      isMe
                        ? 'bg-indigo-950/40 font-semibold text-white'
                        : 'hover:bg-white/5 text-slate-300'
                    }`}
                  >
                    <td className="py-3.5 px-3 font-mono">
                      {student.rank === 1 ? '🥇 1' : student.rank === 2 ? '🥈 2' : student.rank === 3 ? '🥉 3' : `#${student.rank}`}
                    </td>
                    <td className="py-3.5 px-3 flex items-center gap-2.5">
                      <img
                        src={student.avatar}
                        alt={student.name}
                        className="w-7 h-7 rounded-full border border-white/10"
                      />
                      <div>
                        <p className={`font-semibold ${isMe ? 'text-indigo-300 font-bold' : 'text-white'}`}>
                          {student.name}
                        </p>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-slate-400 text-[11px]">
                      {student.college} • {student.city}
                    </td>
                    <td className="py-3.5 px-3 font-mono font-bold text-white">
                      {student.studyHours} hrs
                    </td>
                    <td className="py-3.5 px-3 font-mono text-cyan-300">
                      {student.focusScore}%
                    </td>
                    <td className="py-3.5 px-3 font-mono text-emerald-300">
                      {student.consistency}%
                    </td>
                    <td className="py-3.5 px-3 font-mono text-amber-300">
                      {student.accuracy}%
                    </td>
                    <td className="py-3.5 px-3 font-mono text-indigo-300">
                      {student.xp} XP
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getTierBadge(student.tier)}`}>
                        {student.tier}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
