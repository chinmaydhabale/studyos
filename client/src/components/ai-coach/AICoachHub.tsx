import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Send,
  HelpCircle,
  FileQuestion,
  Layers,
  Clock,
  Calendar,
  CheckCircle,
  ArrowRight,
  BookOpen,
  Award,
  Zap,
  ChevronRight,
  Cpu,
  Brain,
  Lightbulb,
  Check,
  RotateCcw,
  Target,
  Flame,
  Radio,
  FileText,
  Volume2
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { useStudy } from '../../context/StudyContext.js';
import { Flashcard, QuizQuestion } from '../../types.js';
import { API_BASE_URL } from '../../config.js';
import { NotebookStudio } from './NotebookStudio.js';

interface AICoachHubProps {
  initialPrompt?: string;
  onNavigateToCalendar?: () => void;
}

interface AIStatus {
  enabled: boolean;
  provider: string;
  model: string;
  defaultModel: string;
}

type SubTabId = 'notebook' | 'doubts' | 'flashcards' | 'quiz' | 'planner';

export const AICoachHub: React.FC<AICoachHubProps> = ({ initialPrompt = '', onNavigateToCalendar }) => {
  const { addToast, currentUser } = useSocket();
  const { addXp, triggerCelebration } = useStudy();

  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('notebook');
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);

  // Planner States
  const [promptInput, setPromptInput] = useState(initialPrompt || 'Tomorrow should include 45 minutes of Physics Thermodynamics focus block.');
  const [plannerResult, setPlannerResult] = useState<{
    message: string;
    task: any;
    suggestedSchedule: Array<{ time: string; activity: string; duration: string }>;
    source?: 'gemini' | 'fallback';
  } | null>(null);

  // Doubt Solver States
  const [doubtQuestion, setDoubtQuestion] = useState('Why does Carnot engine have maximum theoretical efficiency?');
  const [doubtSubject, setDoubtSubject] = useState('Physics');
  const [doubtSolution, setDoubtSolution] = useState<{
    explanation: string;
    steps: string[];
    keyFormula?: string;
    practiceTip: string;
    source?: 'gemini' | 'fallback';
  } | null>(null);

  // Flashcards States
  const [flashcardTopic, setFlashcardTopic] = useState('Thermodynamics & Heat Engines');
  const [flashcardCount, setFlashcardCount] = useState<number>(8);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([
    {
      id: 'fc-1',
      front: 'What is the Second Law of Thermodynamics in terms of entropy?',
      back: 'In an isolated system, total entropy never decreases over time: ΔS_total ≥ 0. Entropy remains constant in reversible processes and increases in irreversible ones.',
      subject: 'Physics',
      masteryLevel: 'reviewing'
    },
    {
      id: 'fc-2',
      front: 'What is the Carnot efficiency formula and critical unit constraint?',
      back: 'η = 1 - (T_C / T_H). Both reservoir temperatures T_C and T_H must strictly be in Kelvin (K = °C + 273.15).',
      subject: 'Physics',
      masteryLevel: 'learning'
    },
    {
      id: 'fc-3',
      front: 'What is the Monetary Policy Committee (MPC) inflation target in India?',
      back: 'Flexible inflation target of 4% Consumer Price Index (CPI) with a tolerance band of ±2% (2% to 6%), under Section 45ZB of the RBI Act.',
      subject: 'Economics',
      masteryLevel: 'mastered'
    }
  ]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Quiz States
  const [quizTopic, setQuizTopic] = useState('Thermodynamics & Carnot Cycle');
  const [quizList, setQuizList] = useState<QuizQuestion[]>([
    {
      id: 'q-1',
      question: 'Which of the following processes in a Carnot cycle involves heat absorption at high temperature?',
      options: [
        'Reversible Isothermal Expansion',
        'Reversible Adiabatic Expansion',
        'Reversible Isothermal Compression',
        'Reversible Adiabatic Compression'
      ],
      correctAnswer: 0,
      explanation: 'In stage 1 of the Carnot cycle, the working gas expands isothermally at high temperature T_H, absorbing heat Q_H from the source.',
      subject: 'Physics',
      topic: 'Thermodynamics'
    },
    {
      id: 'q-2',
      question: 'For an adiabatic reversible expansion of an ideal gas, which relationship holds true?',
      options: ['P · V = constant', 'P · V^γ = constant', 'T / P = constant', 'V / T^γ = constant'],
      correctAnswer: 1,
      explanation: 'In an adiabatic reversible process with no heat exchange (dQ = 0), the state equation is P · V^γ = constant.',
      subject: 'Physics',
      topic: 'Thermodynamics'
    }
  ]);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [qId: string]: number }>({});
  const [showQuizResults, setShowQuizResults] = useState(false);

  // Sync initialPrompt changes (e.g. from SyncTheater "Ask AI at timestamp")
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      setPromptInput(initialPrompt);
      setDoubtQuestion(initialPrompt);
      setActiveSubTab('doubts');
    }
  }, [initialPrompt]);

  // Report which backend is actively answering: live Gemini or offline templates.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/ai/status`)
      .then(res => res.json())
      .then((data: AIStatus) => {
        if (!cancelled) setAiStatus(data);
      })
      .catch(() => {
        if (!cancelled) setAiStatus({ enabled: false, provider: 'gemini', model: 'unavailable', defaultModel: '' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Handler: Run Schedule Prompt
  const handleRunSchedulePrompt = async (textToRun?: string) => {
    const text = textToRun || promptInput;
    if (!text.trim()) return;
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/schedule-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, userId: currentUser?.id })
      });
      const data = await res.json();
      setPlannerResult(data);
      addToast('Schedule Updated by AI Coach', data.message, 'success');
      addXp(50, 'Organized Daily Schedule');
    } catch (e) {
      console.error(e);
      addToast('Error', 'Could not parse schedule prompt', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Solve Doubt
  const handleSolveDoubt = async (customQ?: string) => {
    const q = customQ || doubtQuestion;
    if (!q.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/doubt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.trim(),
          context: {
            subject: doubtSubject,
            userId: currentUser?.id
          }
        })
      });
      const data = await res.json();
      setDoubtSolution(data);
      addToast('Doubt Solved', 'AI Coach provided complete conceptual breakdown.', 'info');
      addXp(25, 'Solved Concept Doubt');
    } catch (e) {
      console.error(e);
      addToast('Failed', 'Could not reach AI doubt service', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Generate AI Flashcards
  const handleGenerateFlashcards = async () => {
    if (!flashcardTopic.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: flashcardTopic.trim(), count: flashcardCount })
      });
      const data: Flashcard[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('AI returned no cards');
      }
      setFlashcards(data);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      addToast('Flashcards Ready', `Generated ${data.length} high-yield cards via Gemini 3.7 Flash.`, 'success');
      addXp(40, 'Generated Flashcard Deck');
    } catch (e) {
      console.error(e);
      addToast('Flashcards Failed', 'Could not generate flashcards right now.', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Generate AI Quiz
  const handleGenerateQuiz = async () => {
    if (!quizTopic.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: quizTopic.trim(), count: 4 })
      });
      const data: QuizQuestion[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('AI returned no questions');
      }
      setQuizList(data);
      setSelectedAnswers({});
      setShowQuizResults(false);
      addToast('Quiz Generated', `${data.length} diagnostic questions on ${quizTopic}.`, 'success');
      addXp(30, 'Generated Diagnostic Quiz');
    } catch (e) {
      console.error(e);
      addToast('Quiz Failed', 'Could not generate a quiz right now.', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  const quizScore = quizList.reduce(
    (score, q) => (selectedAnswers[q.id] === q.correctAnswer ? score + 1 : score),
    0
  );

  const masteredCount = flashcards.filter(f => f.masteryLevel === 'mastered').length;
  const reviewingCount = flashcards.filter(f => f.masteryLevel === 'reviewing').length;

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 flex flex-col h-[calc(100vh-4.5rem)]">
      
      {/* ========================================================================= */}
      {/* 1. TOP COMMAND BAR: StudyOS AI Coach 2.0 Glassmorphic Header */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-3 sm:p-4 mb-3 shadow-2xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -top-12 -left-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 relative z-10">
          
          {/* Brand & Status */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                  <span>StudyOS AI Coach</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-indigo-500 to-cyan-500 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-sm">
                    2.0 Pro
                  </span>
                </h1>

                {/* Model Indicator Pill */}
                <div
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 transition-all ${
                    aiStatus?.enabled
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-300 border-white/10'
                  }`}
                  title={
                    aiStatus?.enabled
                      ? 'Connected to Gemini API & Microsoft Edge Neural TTS'
                      : 'GEMINI_API_KEY not detected, using intelligent built-in templates'
                  }
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  <span>
                    {aiStatus === null
                      ? 'Connecting AI...'
                      : aiStatus.enabled
                      ? `Gemini ${aiStatus.model} · Neural Studio`
                      : 'Offline Engine Active'}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400 hidden sm:block mt-0.5">
                Google NotebookLM Studio, Neural Audio Podcast, Step-by-Step Doubt Solver & Flashcards
              </p>
            </div>
          </div>

          {/* Quick Metrics & Subtab Navigation */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-white/10 overflow-x-auto scrollbar-none">
            {[
              { id: 'notebook', label: '🎙️ NotebookLM Studio', badge: 'Flagship' },
              { id: 'doubts', label: '⚡ Doubt Solver', badge: '' },
              { id: 'flashcards', label: '🎴 Flashcard Vault', badge: 'SM-2' },
              { id: 'quiz', label: '🎯 Diagnostic Drill', badge: '' },
              { id: 'planner', label: '📅 AI Daily Planner', badge: '' }
            ].map((tab) => {
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as SubTabId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/30 scale-[1.02]'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase tracking-wider ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-indigo-500/20 text-indigo-300'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN ACTIVE VIEW CONTAINER */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto pr-1">
        
        {/* SUBTAB 0: Flagship NotebookLM Studio */}
        {activeSubTab === 'notebook' && (
          <NotebookStudio />
        )}

        {/* SUBTAB 1: Smart Doubt Solver */}
        {activeSubTab === 'doubts' && (
          <div className="max-w-4xl mx-auto space-y-4">
            
            {/* Input Card */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/30 shadow-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-cyan-300" />
                  <span>Ask Your Conceptual Doubt (Formulas, Derivations, Proofs):</span>
                </label>
                <div className="flex items-center gap-1 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-500">Subject:</span>
                  <select
                    value={doubtSubject}
                    onChange={(e) => setDoubtSubject(e.target.value)}
                    className="bg-slate-950 border border-white/10 rounded-lg px-2 py-0.5 text-xs text-white focus:outline-none"
                  >
                    <option value="Physics">Physics</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Banking & Economy">Banking & Economy</option>
                    <option value="Indian Polity">Indian Polity</option>
                    <option value="Chemistry">Chemistry</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={doubtQuestion}
                  onChange={(e) => setDoubtQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSolveDoubt()}
                  placeholder="e.g. Why does entropy increase in irreversible thermodynamic processes?"
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-950/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 transition-colors"
                />
                <button
                  onClick={() => handleSolveDoubt()}
                  disabled={isLoading}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition-all shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                  <span>{isLoading ? 'Breaking Down...' : 'Solve Doubt'}</span>
                </button>
              </div>

              {/* Quick Doubt Chips */}
              <div className="flex items-center gap-2 overflow-x-auto text-[11px] pt-1">
                <span className="font-semibold text-slate-500 whitespace-nowrap">Try asking:</span>
                {[
                  'Why does Carnot engine have maximum theoretical efficiency?',
                  'Explain Repo Rate vs Reverse Repo Rate impact on inflation.',
                  'Difference between Fundamental Rights and DPSP in Indian Constitution.',
                  'Why is work done in a cyclic process equal to enclosed area on P-V diagram?'
                ].map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setDoubtQuestion(sample);
                      handleSolveDoubt(sample);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 truncate max-w-xs transition-colors shrink-0"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            {/* Solution Display */}
            {doubtSolution && (
              <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl space-y-4 animate-in fade-in duration-200">
                
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Conceptual Breakdown & Solution</span>
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    {doubtSolution.source === 'gemini' ? '⚡ Gemini 3.8 Live Solution' : 'Verified Knowledge Template'}
                  </span>
                </div>

                {/* Core Conceptual Explanation */}
                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                  <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Big Picture Intuition</h4>
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
                    {doubtSolution.explanation}
                  </p>
                </div>

                {/* Step-by-Step Logic */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step-by-Step Derivation & Logic:</h4>
                  <div className="space-y-2">
                    {doubtSolution.steps.map((step, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 text-xs text-slate-300 flex items-start gap-3 hover:border-white/10 transition-colors"
                      >
                        <span className="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-mono text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Governing Formula */}
                {doubtSolution.keyFormula && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Governing Mathematical Law:</span>
                      <p className="text-base font-mono font-bold text-white mt-1 select-all">{doubtSolution.keyFormula}</p>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded bg-white/5 text-slate-400 border border-white/5 whitespace-nowrap self-start sm:self-auto">
                      LaTeX Standard
                    </span>
                  </div>
                )}

                {/* Exam Tip & Trap */}
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="text-amber-200">Topper Exam Tip & Pitfall:</strong> {doubtSolution.practiceTip}
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* SUBTAB 2: Flashcard Vault (Spaced Repetition SM-2) */}
        {activeSubTab === 'flashcards' && (
          <div className="max-w-2xl mx-auto space-y-4 pt-2">
            
            {/* Top Deck Generator Bar */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>Spaced Repetition Flashcard Vault</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Active recall calibrated with SM-2 spaced repetition intervals
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono text-[10px]">
                    Mastered: {masteredCount}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono text-[10px]">
                    Reviewing: {reviewingCount}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={flashcardTopic}
                  onChange={(e) => setFlashcardTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerateFlashcards()}
                  placeholder="Enter topic e.g. Thermodynamics, Indian Polity Articles..."
                  className="flex-1 min-w-[220px] px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-xs text-white focus:outline-none focus:border-indigo-400"
                />
                <select
                  value={flashcardCount}
                  onChange={(e) => setFlashcardCount(parseInt(e.target.value, 10))}
                  className="px-2.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-xs text-slate-300 focus:outline-none"
                >
                  <option value={6}>6 Cards</option>
                  <option value={10}>10 Cards</option>
                  <option value={16}>16 Cards</option>
                </select>
                <button
                  onClick={handleGenerateFlashcards}
                  disabled={isLoading}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-all shrink-0"
                >
                  {isLoading ? 'Generating Cards...' : 'Generate with Gemini 3.7'}
                </button>
              </div>
            </div>

            {/* Flashcard Player */}
            {flashcards.length > 0 ? (
              <div className="space-y-3">
                
                {/* Progress Indicator */}
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span>Card {currentCardIndex + 1} of {flashcards.length}</span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-white/5 text-slate-300 text-[11px] font-mono">
                      {flashcards[currentCardIndex]?.subject || 'General'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider ${
                        flashcards[currentCardIndex]?.masteryLevel === 'mastered'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : flashcards[currentCardIndex]?.masteryLevel === 'reviewing'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-indigo-500/20 text-indigo-300'
                      }`}
                    >
                      {flashcards[currentCardIndex]?.masteryLevel || 'learning'}
                    </span>
                  </div>
                </div>

                {/* 3D Flip Card */}
                <div
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="w-full min-h-[260px] sm:min-h-[290px] rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/60 border border-white/15 p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer shadow-2xl relative select-none hover:border-indigo-400/50 transition-all group"
                >
                  <div className="absolute top-4 left-5 flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400">
                      {isFlipped ? '💡 Answer (Click to flip back)' : '❓ Question (Click to reveal answer)'}
                    </span>
                  </div>

                  <p className="text-base sm:text-lg font-semibold text-white px-2 leading-relaxed">
                    {isFlipped ? flashcards[currentCardIndex]?.back : flashcards[currentCardIndex]?.front}
                  </p>

                  <div className="absolute bottom-4 flex items-center gap-1.5 text-xs text-slate-500 group-hover:text-slate-400 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Click anywhere to flip</span>
                  </div>
                </div>

                {/* SM-2 Spaced Repetition Grading */}
                {isFlipped && (
                  <div className="grid grid-cols-3 gap-2.5 animate-in fade-in duration-200">
                    <button
                      onClick={() => {
                        setIsFlipped(false);
                        setCurrentCardIndex((i) => (flashcards.length > 0 ? (i + 1) % flashcards.length : 0));
                        addToast('Review Scheduled', 'Marked Hard: Repeated in 10 minutes.', 'info');
                      }}
                      className="py-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-bold text-xs flex flex-col items-center gap-0.5 transition-colors"
                    >
                      <span>🔴 Hard</span>
                      <span className="text-[10px] text-rose-400 font-mono">Repeat in 10m</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsFlipped(false);
                        setCurrentCardIndex((i) => (flashcards.length > 0 ? (i + 1) % flashcards.length : 0));
                        addXp(20);
                        addToast('Progress Saved', 'Marked Good: Scheduled for tomorrow.', 'success');
                      }}
                      className="py-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs flex flex-col items-center gap-0.5 transition-colors"
                    >
                      <span>🟡 Good</span>
                      <span className="text-[10px] text-amber-400 font-mono">Next: Tomorrow</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsFlipped(false);
                        flashcards[currentCardIndex].masteryLevel = 'mastered';
                        setCurrentCardIndex((i) => (flashcards.length > 0 ? (i + 1) % flashcards.length : 0));
                        addXp(40);
                        triggerCelebration();
                        addToast('Card Mastered! 🎉', 'Marked Easy: Scheduled in 4 days (+40 XP)', 'success');
                      }}
                      className="py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex flex-col items-center gap-0.5 transition-colors"
                    >
                      <span>🟢 Easy</span>
                      <span className="text-[10px] text-emerald-400 font-mono">Next: 4 Days</span>
                    </button>
                  </div>
                )}

                {/* Card Navigation */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => {
                      setIsFlipped(false);
                      setCurrentCardIndex((i) => (i > 0 ? i - 1 : flashcards.length - 1));
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition-colors"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => {
                      setIsFlipped(false);
                      setCurrentCardIndex((i) => (i + 1) % flashcards.length);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold border border-white/10 transition-colors"
                  >
                    Next →
                  </button>
                </div>

              </div>
            ) : (
              <div className="p-8 rounded-3xl bg-slate-900 border border-white/10 text-center space-y-3">
                <p className="text-xs text-slate-400">Generate a deck above to begin your active recall session.</p>
              </div>
            )}

          </div>
        )}

        {/* SUBTAB 3: Diagnostic Quiz Drill */}
        {activeSubTab === 'quiz' && (
          <div className="max-w-2xl mx-auto space-y-4 pt-2">
            
            {/* Top Config Card */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-cyan-400" />
                    <span>Diagnostic Exam Drill & Mock Test</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Real-time calibrated MCQs with detailed explanations
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/20">
                  +100 XP On Completion
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={quizTopic}
                  onChange={(e) => setQuizTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerateQuiz()}
                  placeholder="Enter exam topic e.g. Union Budget 2026, Thermodynamics..."
                  className="flex-1 min-w-[200px] px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-xs text-white focus:outline-none focus:border-indigo-400"
                />
                <button
                  onClick={handleGenerateQuiz}
                  disabled={isLoading}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-all shrink-0"
                >
                  {isLoading ? 'Crafting Questions...' : 'Generate New Drill'}
                </button>
              </div>
            </div>

            {/* Questions List */}
            {quizList.map((q, idx) => (
              <div key={q.id} className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-xl space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold text-indigo-400">Question {idx + 1} of {quizList.length}</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 font-mono text-[10px] text-slate-300">{q.subject}</span>
                </div>
                
                <h4 className="text-sm font-semibold text-white leading-relaxed">{q.question}</h4>

                <div className="space-y-2 pt-1">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = selectedAnswers[q.id] === optIdx;
                    const isCorrect = q.correctAnswer === optIdx;

                    let btnStyle = 'bg-slate-950 border-white/10 hover:border-indigo-500/50 text-slate-300';
                    if (showQuizResults) {
                      if (isCorrect) btnStyle = 'bg-emerald-500/20 border-emerald-500 text-emerald-200';
                      else if (isSelected && !isCorrect) btnStyle = 'bg-rose-500/20 border-rose-500 text-rose-200';
                    } else if (isSelected) {
                      btnStyle = 'bg-indigo-600/30 border-indigo-500 text-white';
                    }

                    return (
                      <button
                        key={optIdx}
                        disabled={showQuizResults}
                        onClick={() => setSelectedAnswers(prev => ({ ...prev, [q.id]: optIdx }))}
                        className={`w-full text-left p-3.5 rounded-xl border text-xs font-medium transition-all ${btnStyle}`}
                      >
                        <span className="font-mono font-bold mr-2 text-indigo-400">{String.fromCharCode(65 + optIdx)}.</span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {showQuizResults && (
                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-white/5 text-xs text-slate-300 mt-2 leading-relaxed">
                    💡 <strong className="text-indigo-300">Explanation:</strong> {q.explanation}
                  </div>
                )}
              </div>
            ))}

            {/* Submit or Score Bar */}
            {!showQuizResults ? (
              <button
                onClick={() => {
                  setShowQuizResults(true);
                  const percent = Math.round((quizScore / Math.max(1, quizList.length)) * 100);
                  addXp(100);
                  if (percent >= 75) triggerCelebration();
                  addToast(
                    'Drill Completed!',
                    `You scored ${quizScore}/${quizList.length} (${percent}%). +100 XP awarded!`,
                    percent >= 75 ? 'success' : 'info'
                  );
                }}
                disabled={Object.keys(selectedAnswers).length < quizList.length}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 transition-all"
              >
                Submit Answers & Evaluate Performance
              </button>
            ) : (
              <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 text-center space-y-3 shadow-xl">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Your Score</p>
                <p className="text-3xl font-extrabold text-white">
                  {quizScore} / {quizList.length}
                  <span className="text-base text-indigo-300 ml-2 font-mono">
                    ({Math.round((quizScore / Math.max(1, quizList.length)) * 100)}%)
                  </span>
                </p>
                <button
                  onClick={() => {
                    setShowQuizResults(false);
                    setSelectedAnswers({});
                  }}
                  className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-colors"
                >
                  Try Another Drill
                </button>
              </div>
            )}

          </div>
        )}

        {/* SUBTAB 4: Intelligent Daily Planner */}
        {activeSubTab === 'planner' && (
          <div className="max-w-4xl mx-auto space-y-4">
            
            {/* NLP Schedule Bar */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/30 shadow-2xl space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-cyan-300" />
                <span>Tell your AI Coach what to organize in your schedule:</span>
              </label>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRunSchedulePrompt()}
                  placeholder='Try: "Tomorrow should include 45 minutes of Physics Thermodynamics Focus Block."'
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-950/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 transition-colors"
                />
                <button
                  onClick={() => handleRunSchedulePrompt()}
                  disabled={isLoading}
                  className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition-all shrink-0"
                >
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                  <span>{isLoading ? 'Planning...' : 'Schedule with AI'}</span>
                </button>
              </div>

              {/* Quick Prompts */}
              <div className="flex items-center gap-2 overflow-x-auto text-[11px] pt-1">
                <span className="font-semibold text-slate-500 whitespace-nowrap">Quick Prompts:</span>
                {[
                  'Tomorrow should include 45 minutes of Physics Thermodynamics focus block.',
                  'Schedule 30 minutes of Current Affairs revision for tomorrow morning.',
                  'Add 1 hour of Banking Aptitude problem solving today at 3 PM.'
                ].map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setPromptInput(sample);
                      handleRunSchedulePrompt(sample);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 truncate max-w-xs transition-colors shrink-0"
                  >
                    "{sample}"
                  </button>
                ))}
              </div>
            </div>

            {/* Generated Timetable */}
            {plannerResult && (
              <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl space-y-4 animate-in fade-in duration-200">
                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-indigo-600 text-white mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">AI Coach Confirmation</h3>
                    <div className="text-xs text-indigo-200 mt-1 leading-relaxed whitespace-pre-wrap">
                      {plannerResult.message}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <span>Optimized Daily Schedule</span>
                    </h3>
                    {onNavigateToCalendar && (
                      <button
                        onClick={onNavigateToCalendar}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold"
                      >
                        <span>Open Study Calendar</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {plannerResult.suggestedSchedule.map((slot, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl border bg-slate-950/70 border-white/5 flex items-center justify-between hover:border-white/10 transition-colors"
                      >
                        <div>
                          <p className="text-xs font-semibold text-white">{slot.activity}</p>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{slot.time}</p>
                        </div>
                        <span className="text-[11px] px-2.5 py-1 rounded-md bg-white/10 text-slate-300 font-mono font-medium">
                          {slot.duration}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

      </div>

    </div>
  );
};
