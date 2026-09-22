import React, { useEffect, useState } from 'react';
import {
  Clock,
  TrendingUp,
  Award,
  Zap,
  Coffee,
  PieChart as PieIcon,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Flame,
  Calendar,
  Sparkles
} from 'lucide-react';
import { useStudy } from '../../context/StudyContext.js';
import { API_BASE_URL } from '../../config.js';

export const AnalyticsDashboard: React.FC = () => {
  const { totalFocusSecondsToday, breakCountToday, streak } = useStudy();
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/analytics`)
      .then((res) => res.json())
      .then((data) => setSummary(data))
      .catch((err) => console.error(err));
  }, []);

  const todayHoursFormatted = (totalFocusSecondsToday / 3600).toFixed(1);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto space-y-4">
      
      {/* Top Banner */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white">Productivity & Focus Analytics</h1>
            <p className="text-xs text-slate-400">Deep session metrics, subject distribution, and learning diagnostics</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
          <Flame className="w-4 h-4 fill-amber-400" />
          <span>Active Streak: {streak} Consecutive Days</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Today's Study Hours", value: `${todayHoursFormatted} hrs`, sub: 'Target: 5.0 hrs', icon: Clock, color: 'text-indigo-400 border-indigo-500/20' },
          { label: 'Weekly Study Hours', value: `${summary?.weeklyHours || 32.5} hrs`, sub: '+14% vs last week', icon: TrendingUp, color: 'text-cyan-400 border-cyan-500/20' },
          { label: 'Monthly Progress', value: `${summary?.monthlyHours || 104.5} hrs`, sub: '87% of goal', icon: Award, color: 'text-emerald-400 border-emerald-500/20' },
          { label: 'Deep Focus Hours', value: `${summary?.deepFocusHours || 26.2} hrs`, sub: '80% focus ratio', icon: Zap, color: 'text-amber-400 border-amber-500/20' },
          { label: 'Break Frequency', value: `Every 52 min`, sub: `${breakCountToday} breaks today`, icon: Coffee, color: 'text-pink-400 border-pink-500/20' },
          { label: 'Tasks Completed', value: `${summary?.tasksCompleted || 48} Done`, sub: `${summary?.tasksMissed || 3} Missed`, icon: CheckCircle, color: 'text-purple-400 border-purple-500/20' }
        ].map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div key={idx} className={`p-4 rounded-2xl bg-slate-900 border ${kpi.color} shadow-lg flex flex-col justify-between`}>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] font-semibold">{kpi.label}</span>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-bold text-white tracking-tight">{kpi.value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{kpi.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Row 2: Subject Distribution + Diagnostic Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Subject Distribution */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-indigo-400" />
              <span>Subject Time Distribution</span>
            </h3>
            <span className="text-xs text-slate-400">Total: 104.5 hrs</span>
          </div>

          {/* Custom Horizontal Visual Distribution Bar */}
          <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-950 p-0.5 border border-white/10">
            {summary?.subjectDistribution?.map((s: any, idx: number) => (
              <div
                key={idx}
                style={{ width: `${s.percentage}%`, backgroundColor: s.color }}
                className="h-full first:rounded-l-full last:rounded-r-full"
                title={`${s.subject}: ${s.hours} hrs (${s.percentage}%)`}
              />
            ))}
          </div>

          {/* Subject Legend Rows */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            {summary?.subjectDistribution?.map((s: any, idx: number) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <div>
                    <p className="text-xs font-semibold text-white">{s.subject}</p>
                    <p className="text-[10px] text-slate-400">{s.hours} hours</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-slate-300">{s.percentage}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Learning Diagnostics & Peak Performance */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-xl space-y-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>AI Learning Diagnostics</span>
          </h3>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-950 border border-white/5 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Best Study Time</span>
                <p className="text-xs font-semibold text-white mt-0.5">{summary?.bestStudyTime}</p>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">Peak Focus</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-white/5 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-400">Strongest Topic</span>
                <p className="text-xs font-semibold text-white mt-0.5">{summary?.strongestTopic}</p>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-mono">94% Acc</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-white/5 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-rose-400">Weakest Topic (Needs Revision)</span>
                <p className="text-xs font-semibold text-white mt-0.5">{summary?.weakestTopic}</p>
              </div>
              <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 text-[10px] font-mono">62% Acc</span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-white/5">
                <span className="text-[10px] text-slate-500 block">Longest Session</span>
                <strong className="text-white">{summary?.longestSessionMinutes} minutes</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-white/5">
                <span className="text-[10px] text-slate-500 block">Average Session</span>
                <strong className="text-white">{summary?.averageSessionMinutes} minutes</strong>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
