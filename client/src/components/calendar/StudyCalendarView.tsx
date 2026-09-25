import React, { useEffect, useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Flame,
  CheckCircle,
  Clock,
  Plus,
  ChevronRight,
  TrendingUp,
  Award
} from 'lucide-react';
import { CalendarDayRecord, StudyTask } from '../../types.js';
import { useSocket } from '../../context/SocketContext.js';
import { API_BASE_URL } from '../../config.js';

export const StudyCalendarView: React.FC = () => {
  const { addToast, currentUser } = useSocket();
  const [history, setHistory] = useState<CalendarDayRecord[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [selectedDay, setSelectedDay] = useState<CalendarDayRecord | null>(null);

  // Generate 120-day timeline matrix ending today so matrix always shows full contribution grid
  const timelineDays = useMemo(() => {
    const historyMap = new Map<string, CalendarDayRecord>();
    history.forEach(r => historyMap.set(r.date, r));

    const days: CalendarDayRecord[] = [];
    const now = new Date();

    for (let i = 119; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      const existing = historyMap.get(dateStr);
      if (existing) {
        days.push(existing);
      } else {
        days.push({
          date: dateStr,
          userId: currentUser.id,
          hoursStudied: 0,
          deepFocusHours: 0,
          subjects: [],
          tasksDone: 0,
          tasksPlanned: 0,
          status: 'missed'
        });
      }
    }
    return days;
  }, [history, currentUser.id]);

  const activeStreak = currentUser.streak || (selectedDay && selectedDay.hoursStudied > 0 ? 1 : 0);
  const consistencyRate = useMemo(() => {
    if (history.length === 0) return 100;
    const completedDays = history.filter(h => h.status === 'strong' || h.status === 'moderate' || h.hoursStudied >= 3).length;
    return Math.round((completedDays / Math.max(history.length, 1)) * 100);
  }, [history]);
  const avgHours = useMemo(() => {
    if (history.length === 0) return 0;
    const total = history.reduce((sum, h) => sum + h.hoursStudied, 0);
    return +(total / history.length).toFixed(1);
  }, [history]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/calendar?userId=${encodeURIComponent(currentUser.id)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Calendar request failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) {
          setHistory([]);
          setSelectedDay(null);
          addToast('Calendar Unavailable', 'Could not load your study calendar. Please try again.', 'alert');
          return;
        }
        setHistory(data);
        if (data.length > 0) {
          // Records come back in insertion order, so pick today's LOCAL date
          // explicitly and fall back to the most recent record.
          const now = new Date();
          const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const todayRecord = data.find((r: CalendarDayRecord) => r.date === todayLocal);
          setSelectedDay(todayRecord || data[data.length - 1]);
        } else {
          setSelectedDay(null);
        }
      })
      .catch((err) => {
        setHistory([]);
        setSelectedDay(null);
        addToast('Calendar Error', err?.message || 'Failed to load study calendar.', 'alert');
      });

    fetch(`${API_BASE_URL}/api/tasks?userId=${encodeURIComponent(currentUser.id)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Tasks request failed (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) {
          setTasks([]);
          addToast('Tasks Unavailable', 'Could not load your study tasks. Please try again.', 'alert');
          return;
        }
        setTasks(data);
      })
      .catch((err) => {
        setTasks([]);
        addToast('Tasks Error', err?.message || 'Failed to load study tasks.', 'alert');
      });
  }, [currentUser.id, addToast]);

  const handleToggleTask = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/tasks/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, userName: currentUser.name })
      });
      if (!res.ok) {
        throw new Error(`Task update failed (${res.status})`);
      }
      const updated = await res.json();
      if (!updated || typeof updated !== 'object' || !('id' in updated)) {
        throw new Error('Unexpected task response');
      }
      setTasks(prev => prev.map(t => t.id === id ? updated : t));
      addToast('Task Status Updated', `Task marked as ${updated.completed ? 'completed (+50 XP)' : 'pending'}.`, 'success');
    } catch (e: any) {
      addToast('Task Update Failed', e?.message || 'Could not update the task. Please try again.', 'alert');
    }
  };

  // Color mapper based on study hours like GitHub
  const getCellColor = (hours: number, status: string) => {
    if (hours === 0 || status === 'missed') return 'bg-slate-800/60 border-white/5';
    if (hours < 3) return 'bg-emerald-950 border-emerald-800 text-emerald-300';
    if (hours < 5) return 'bg-emerald-700 border-emerald-600 text-white';
    return 'bg-emerald-400 border-emerald-300 text-slate-950 font-bold shadow-sm shadow-emerald-400/30';
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)] overflow-y-auto space-y-4">
      
      {/* Top Banner */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <CalendarIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white">Study Activity Calendar</h1>
            <p className="text-xs text-slate-400">GitHub-style 120-day contribution graph & daily goal planner</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold">
            <Flame className="w-4 h-4 fill-amber-400" />
            <span>🔥 {activeStreak}-Day Active Streak</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <CheckCircle className="w-4 h-4" />
            <span>{consistencyRate}% Consistency Rate</span>
          </div>
        </div>
      </div>

      {/* GitHub-style Contribution Heatmap */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            120-Day Study Activity Matrix
          </h3>
          
          {/* Legend */}
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span>Less</span>
            <span className="w-3 h-3 rounded-sm bg-slate-800 border border-white/5 inline-block" />
            <span className="w-3 h-3 rounded-sm bg-emerald-950 border border-emerald-800 inline-block" />
            <span className="w-3 h-3 rounded-sm bg-emerald-700 border border-emerald-600 inline-block" />
            <span className="w-3 h-3 rounded-sm bg-emerald-400 inline-block shadow-xs shadow-emerald-400" />
            <span>More</span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-flow-col grid-rows-7 gap-1.5 min-w-[700px]">
            {timelineDays.map((record) => {
              const isSelected = selectedDay?.date === record.date;
              return (
                <button
                  key={record.date}
                  onClick={() => setSelectedDay(record)}
                  title={`${record.date}: ${record.hoursStudied} hours studied (${record.status})`}
                  className={`w-4 h-4 rounded-sm border transition-all ${getCellColor(record.hoursStudied, record.status)} ${
                    isSelected ? 'ring-2 ring-indigo-400 scale-125 z-10' : 'hover:scale-110'
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-white/5">
          <span>Click any square to inspect that day's session details & subjects</span>
          <span>120 Days Tracked • Average {avgHours} hrs/day</span>
        </div>
      </div>

      {/* Row 2: Selected Day Details Inspector + Study Task Planner */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Selected Day Inspector */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Day Inspection: {selectedDay?.date || 'Today'}</span>
            </h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
              selectedDay?.status === 'strong'
                ? 'bg-emerald-500/20 text-emerald-300'
                : selectedDay?.status === 'moderate'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'bg-rose-500/20 text-rose-300'
            }`}>
              {selectedDay?.status || 'normal'} Day
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-950 border border-white/5">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Studied</span>
              <strong className="text-lg text-white font-mono">{selectedDay?.hoursStudied || 0} hrs</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-white/5">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Deep Focus</span>
              <strong className="text-lg text-cyan-300 font-mono">{selectedDay?.deepFocusHours || 0} hrs</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-white/5">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Tasks Completed</span>
              <strong className="text-lg text-emerald-300 font-mono">
                {selectedDay?.tasksDone} / {selectedDay?.tasksPlanned}
              </strong>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-slate-400 mb-2 block">Subjects Covered:</span>
            <div className="flex flex-wrap gap-2">
              {selectedDay?.subjects && selectedDay.subjects.length > 0 ? (
                selectedDay.subjects.map((sub, i) => (
                  <span key={i} className="px-3 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
                    📚 {sub}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">Rest / Recovery Day</span>
              )}
            </div>
          </div>
        </div>

        {/* Study Task Planner (Includes Tomorrow's Current Affairs!) */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-indigo-400" />
              <span>Target Study Tasks</span>
            </h3>
            <span className="text-xs text-slate-400">{tasks.filter(t => t.completed).length} of {tasks.length} Completed</span>
          </div>

          <div className="space-y-2.5 max-h-64 overflow-y-auto">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleToggleTask(task.id)}
                className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  task.completed
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-slate-400'
                    : 'bg-slate-950 border-white/5 text-white hover:border-indigo-500/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-lg border flex items-center justify-center ${
                    task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600'
                  }`}>
                    {task.completed && <CheckCircle className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${task.completed ? 'line-through text-slate-500' : 'text-white'}`}>
                      {task.title}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{task.subject}</span>
                      <span>•</span>
                      <span>Target: {task.targetDate}</span>
                      {task.isAiGenerated && (
                        <span className="text-indigo-400 font-semibold bg-indigo-500/10 px-1.5 py-0.2 rounded">
                          AI Scheduled
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-mono text-cyan-300 font-semibold">
                  {task.durationMinutes}m
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
