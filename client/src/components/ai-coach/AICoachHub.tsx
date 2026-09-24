import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Send,
  HelpCircle,
  FileQuestion,
  Layers,
  FileText,
  Video,
  Clock,
  Calendar,
  CheckCircle,
  ArrowRight,
  TrendingDown,
  BookOpen,
  Award,
  Zap,
  Printer,
  ChevronRight,
  Cpu
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { useStudy } from '../../context/StudyContext.js';
import { Flashcard, QuizQuestion } from '../../types.js';
import { API_BASE_URL } from '../../config.js';

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

export const AICoachHub: React.FC<AICoachHubProps> = ({ initialPrompt = '', onNavigateToCalendar }) => {
  const { addToast, currentUser } = useSocket();
  const { addXp, triggerCelebration } = useStudy();

  const [activeSubTab, setActiveSubTab] = useState<'planner' | 'doubts' | 'handwritten' | 'quiz' | 'flashcards' | 'summarize'>('planner');
  const [promptInput, setPromptInput] = useState(initialPrompt || 'Tomorrow should include 30 minutes of Current Affairs.');
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);

  // Planner States
  const [plannerResult, setPlannerResult] = useState<{
    message: string;
    task: any;
    suggestedSchedule: Array<{ time: string; activity: string; duration: string }>;
    source?: 'gemini' | 'fallback';
  } | null>(null);

  // Doubt Solver States
  const [doubtQuestion, setDoubtQuestion] = useState('Why does Carnot engine have maximum theoretical efficiency?');
  const [doubtSolution, setDoubtSolution] = useState<{
    explanation: string;
    steps: string[];
    keyFormula?: string;
    practiceTip: string;
    source?: 'gemini' | 'fallback';
  } | null>(null);

  // Handwritten Notes States
  const [handwrittenTopic, setHandwrittenTopic] = useState('Thermodynamics & Carnot Cycle');
  const [handwrittenData, setHandwrittenData] = useState<any>(null);

  // Quiz topic input
  const [quizTopic, setQuizTopic] = useState('Indian Economy & Thermodynamics');

  // Flashcard topic input
  const [flashcardTopic, setFlashcardTopic] = useState('Quantitative Aptitude Formulas');

  // Flashcards States
  const [flashcards, setFlashcards] = useState<Flashcard[]>([
    {
      id: 'fc-1',
      front: 'What is the Second Law of Thermodynamics in terms of entropy?',
      back: 'In an isolated system, total entropy never decreases over time: ΔS_total ≥ 0.',
      subject: 'Physics',
      masteryLevel: 'reviewing'
    },
    {
      id: 'fc-2',
      front: 'What is the Current Affairs focus of G20 New Delhi Declaration?',
      back: 'Inclusive global growth, digital public infrastructure (DPI), green development pact, and multilateral bank reforms.',
      subject: 'Current Affairs',
      masteryLevel: 'learning'
    }
  ]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Quiz States
  const [quizList, setQuizList] = useState<QuizQuestion[]>([
    {
      id: 'q-1',
      question: 'Which international organization publishes the World Economic Outlook report?',
      options: ['World Bank', 'International Monetary Fund (IMF)', 'World Trade Organization', 'OECD'],
      correctAnswer: 1,
      explanation: 'The International Monetary Fund (IMF) publishes the World Economic Outlook twice a year.',
      subject: 'Current Affairs',
      topic: 'Global Institutions'
    },
    {
      id: 'q-2',
      question: 'For an adiabatic reversible expansion of an ideal gas, which quantity remains constant?',
      options: ['P · V', 'P · V^γ', 'T · V', 'P / T'],
      correctAnswer: 1,
      explanation: 'In an adiabatic reversible process (PV^γ = constant), no heat enters or leaves the system.',
      subject: 'Physics',
      topic: 'Thermodynamics'
    }
  ]);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [qId: string]: number }>({});
  const [showQuizResults, setShowQuizResults] = useState(false);

  // Report which backend is actually answering: live Gemini or offline templates.
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

  // Handler: Parse NLP Schedule Prompt
  const handleRunSchedulePrompt = async (textToRun?: string) => {
    const text = textToRun || promptInput;
    if (!text.trim()) return;
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/schedule-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, userId: currentUser.id })
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
  const handleSolveDoubt = async () => {
    if (!doubtQuestion.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/doubt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: doubtQuestion, context: { userId: currentUser.id } })
      });
      const data = await res.json();
      setDoubtSolution(data);
      addToast('Doubt Solved', 'AI Teacher provided complete conceptual breakdown.', 'info');
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Generate Handwritten Notes
  const handleGenerateHandwritten = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/handwritten-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: handwrittenTopic, userId: currentUser.id })
      });
      const data = await res.json();
      setHandwrittenData(data);
      addToast('Handwritten Notes Ready', 'Generated realistic notebook study sheet!', 'success');
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Generate a fresh AI quiz for the chosen topic
  const handleGenerateQuiz = async () => {
    if (!quizTopic.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: quizTopic, count: 3 })
      });
      const data: QuizQuestion[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('AI returned no questions');
      }
      setQuizList(data);
      setSelectedAnswers({});
      setShowQuizResults(false);
      addToast('Quiz Generated', `${data.length} AI questions on ${quizTopic}.`, 'success');
    } catch (e) {
      console.error(e);
      addToast('Quiz Failed', 'Could not generate a quiz right now.', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler: Generate AI flashcards for the chosen topic
  const handleGenerateFlashcards = async () => {
    if (!flashcardTopic.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: flashcardTopic, count: 6 })
      });
      const data: Flashcard[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('AI returned no cards');
      }
      setFlashcards(data);
      setCurrentCardIndex(0);
      setIsFlipped(false);
      addToast('Flashcards Generated', `${data.length} AI cards on ${flashcardTopic}.`, 'success');
    } catch (e) {
      console.error(e);
      addToast('Flashcards Failed', 'Could not generate flashcards right now.', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  const quizScore = quizList.reduce(
    (score, q) => (selectedAnswers[q.id] === q.correctAnswer ? score + 1 : score),
    0
  );

  return (
    <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)]">
      
      {/* Top AI Coach Banner & Navigation Sub-Tabs */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 mb-4 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Sparkles className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>Personal AI Study Coach & Teacher</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1 ${
                    aiStatus?.enabled
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                  }`}
                  title={
                    aiStatus?.enabled
                      ? 'Responses are generated live by Gemini'
                      : 'GEMINI_API_KEY is not configured, so built-in offline templates are used'
                  }
                >
                  <Cpu className="w-3 h-3" />
                  <span>
                    {aiStatus === null
                      ? 'Checking AI...'
                      : aiStatus.enabled
                      ? `Gemini · ${aiStatus.model}`
                      : 'Offline templates'}
                  </span>
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Natural schedule planning, instant doubt breakdowns, handwritten study sheets & flashcard mastery
              </p>
            </div>
          </div>

          {/* Sub-tab Navigation */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/10 overflow-x-auto">
            {[
              { id: 'planner', label: '📅 AI Schedule Planner', icon: Calendar },
              { id: 'doubts', label: '💡 Doubt Solver', icon: HelpCircle },
              { id: 'handwritten', label: '✍️ Handwritten Notes', icon: FileText },
              { id: 'flashcards', label: '🎴 Flashcards (SM-2)', icon: Layers },
              { id: 'quiz', label: '🎯 Quiz & Mock Test', icon: FileQuestion }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSubTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    activeSubTab === tab.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Feature Content Container */}
      <div className="flex-1 overflow-y-auto">
        
        {/* SUBTAB 1: AI Schedule Planner */}
        {activeSubTab === 'planner' && (
          <div className="space-y-4">
            
            {/* Prompt Bar Card */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-500/30 shadow-2xl">
              <label className="block text-xs font-semibold uppercase tracking-wider text-indigo-300 mb-2">
                Tell your AI Coach what to schedule:
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRunSchedulePrompt()}
                  placeholder='Try: "Tomorrow should include 30 minutes of Current Affairs."'
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-950/80 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 transition-colors"
                />
                <button
                  onClick={() => handleRunSchedulePrompt()}
                  disabled={isLoading}
                  className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                  <span>{isLoading ? 'Planning...' : 'Schedule with AI'}</span>
                </button>
              </div>

              {/* Quick Prompt Ideas */}
              <div className="flex items-center gap-2 mt-3 overflow-x-auto text-[11px] text-slate-400">
                <span className="font-semibold text-slate-500">Quick Prompts:</span>
                {[
                  'Tomorrow should include 30 minutes of Current Affairs.',
                  'Schedule 45 minutes of Physics Thermodynamics for tomorrow morning.',
                  'Add 1 hour of Calculus problem solving today at 2 PM.'
                ].map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setPromptInput(sample);
                      handleRunSchedulePrompt(sample);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 truncate max-w-xs transition-colors"
                  >
                    "{sample}"
                  </button>
                ))}
              </div>
            </div>

            {/* AI Coach Generated Response & Schedule Blocks */}
            {plannerResult && (
              <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl space-y-4 animate-in fade-in duration-200">
                
                {/* Notification Message */}
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

                {/* Generated Daily Time-Blocking Schedule */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <span>Optimized Daily Schedule for Tomorrow</span>
                    </h3>
                    <button
                      onClick={onNavigateToCalendar}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
                    >
                      <span>Open Study Calendar</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {plannerResult.suggestedSchedule.map((slot, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-xl border flex items-center justify-between ${
                          slot.activity.includes('Current Affairs')
                            ? 'bg-cyan-500/10 border-cyan-500/30 text-white'
                            : 'bg-slate-950/60 border-white/5 text-slate-300'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-semibold">{slot.activity}</p>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{slot.time}</p>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 font-mono font-medium">
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

        {/* SUBTAB 2: Doubt Solver */}
        {activeSubTab === 'doubts' && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Ask your conceptual doubt (Math, Science, Current Affairs):
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={doubtQuestion}
                  onChange={(e) => setDoubtQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSolveDoubt()}
                  placeholder="e.g. Why does entropy increase in irreversible thermodynamic processes?"
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 transition-colors"
                />
                <button
                  onClick={handleSolveDoubt}
                  disabled={isLoading}
                  className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                  <span>{isLoading ? 'Solving...' : 'Solve Doubt'}</span>
                </button>
              </div>
            </div>

            {doubtSolution && (
              <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl space-y-4 animate-in fade-in duration-200">
                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Conceptual Explanation</h3>
                  <p className="text-xs text-slate-200 leading-relaxed">{doubtSolution.explanation}</p>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Step-by-Step Logic</h4>
                  <div className="space-y-2">
                    {doubtSolution.steps.map((step, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-white/5 text-xs text-slate-300 flex items-start gap-2.5">
                        <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {doubtSolution.keyFormula && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-indigo-500/30 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Governing Formula</span>
                      <p className="text-sm font-mono font-bold text-white mt-0.5">{doubtSolution.keyFormula}</p>
                    </div>
                    <span className="text-xs text-slate-400">KaTeX Formatted</span>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                  💡 <strong>Exam Practice Tip:</strong> {doubtSolution.practiceTip}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 3: Realistic Handwritten Notes Style */}
        {activeSubTab === 'handwritten' && (
          <div className="space-y-4">
            
            <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[280px] flex items-center gap-2">
                <input
                  type="text"
                  value={handwrittenTopic}
                  onChange={(e) => setHandwrittenTopic(e.target.value)}
                  placeholder="Enter topic for handwritten summary sheet..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-xs text-white focus:outline-none focus:border-indigo-400"
                />
                <button
                  onClick={handleGenerateHandwritten}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
                >
                  Generate Notebook Sheet
                </button>
              </div>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs border border-white/10 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
            </div>

            {/* Ruled Notebook Page Simulator */}
            <div className="ruled-paper p-8 rounded-2xl border border-stone-300 max-w-4xl mx-auto shadow-2xl min-h-[500px] text-slate-900 font-handwritten text-xl select-none">

              {/* Header */}
              <div className="border-b-2 border-red-300/80 pb-3 mb-6 flex items-center justify-between pl-10">
                <div>
                  <h2 className="text-3xl font-bold text-indigo-900">
                    {handwrittenData?.title || `${handwrittenTopic} — Master Study Sheet`}
                  </h2>
                  <p className="text-base text-stone-600 font-sans mt-0.5">
                    Topic: {handwrittenTopic} • Date: {handwrittenData?.date || new Date().toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right font-sans text-xs text-stone-500">
                  <p>Student: <strong>{handwrittenData?.studentName || currentUser.name || 'Student'}</strong></p>
                  <p>{handwrittenData?.source === 'gemini' ? 'Generated by Gemini' : 'Offline template sheet'}</p>
                </div>
              </div>

              {/* Sections */}
              <div className="space-y-6 pl-10 leading-loose">
                {handwrittenData?.sections?.length ? (
                  handwrittenData.sections.map((section: any, idx: number) => (
                    <div key={idx}>
                      <h3 className="text-2xl font-bold text-red-700 underline decoration-wavy">
                        {section.heading}
                      </h3>
                      {section.notes?.map((note: string, noteIdx: number) => (
                        <p key={noteIdx} className="mt-1">• {note}</p>
                      ))}
                      {section.highlight && (
                        <p className="mt-2 text-stone-800 italic bg-amber-100 p-2 rounded border-l-4 border-amber-500">
                          {section.highlight}
                        </p>
                      )}
                      {section.sketch && (
                        <p className="mt-2 p-3 bg-stone-100 rounded-lg border border-stone-300 font-mono text-base text-slate-900">
                          ✎ Sketch: {section.sketch}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-stone-500 font-sans text-base">
                    Enter a topic above and hit <strong>Generate Notebook Sheet</strong> to build a revision sheet.
                  </div>
                )}
              </div>

            </div>

          </div>
        )}

        {/* SUBTAB 4: Spaced Repetition Flashcards */}
        {activeSubTab === 'flashcards' && (
          <div className="max-w-xl mx-auto space-y-4 pt-4">

            {/* AI card generation */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={flashcardTopic}
                onChange={(e) => setFlashcardTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateFlashcards()}
                placeholder="Topic for AI flashcards, e.g. Indian Polity Articles"
                className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-xs text-white focus:outline-none focus:border-indigo-400"
              />
              <button
                onClick={handleGenerateFlashcards}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-all"
              >
                {isLoading ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Card {currentCardIndex + 1} of {flashcards.length}</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-mono">
                {flashcards[currentCardIndex]?.subject}
              </span>
            </div>

            {/* 3D Flip Card */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="w-full h-72 rounded-3xl bg-gradient-to-br from-slate-900 to-indigo-950/60 border border-white/15 p-6 flex flex-col items-center justify-center text-center cursor-pointer shadow-2xl relative select-none hover:border-indigo-400/50 transition-all"
            >
              <span className="absolute top-4 left-4 text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                {isFlipped ? 'Answer (Click to flip)' : 'Question (Click to reveal)'}
              </span>

              <p className="text-base sm:text-lg font-semibold text-white px-4 leading-relaxed">
                {isFlipped ? flashcards[currentCardIndex]?.back : flashcards[currentCardIndex]?.front}
              </p>

              <span className="absolute bottom-4 text-xs text-slate-500">
                Click anywhere to flip ⟳
              </span>
            </div>

            {/* Spaced Repetition Rating Buttons */}
            {isFlipped && (
              <div className="grid grid-cols-3 gap-2 animate-in fade-in duration-200">
                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentCardIndex((i) => (i + 1) % flashcards.length);
                    addToast('Review Scheduled', 'Marked Hard: Will repeat in 10 minutes.', 'info');
                  }}
                  className="py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-semibold text-xs transition-colors"
                >
                  🔴 Hard (10m)
                </button>
                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentCardIndex((i) => (i + 1) % flashcards.length);
                    addXp(20);
                    addToast('Review Scheduled', 'Marked Good: Will repeat tomorrow.', 'success');
                  }}
                  className="py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold text-xs transition-colors"
                >
                  🟡 Good (1 Day)
                </button>
                <button
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentCardIndex((i) => (i + 1) % flashcards.length);
                    addXp(40);
                    triggerCelebration();
                    addToast('Mastered Card', 'Marked Easy: Will repeat in 4 days.', 'success');
                  }}
                  className="py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold text-xs transition-colors"
                >
                  🟢 Easy (4 Days)
                </button>
              </div>
            )}

          </div>
        )}

        {/* SUBTAB 5: Quiz & Mock Test */}
        {activeSubTab === 'quiz' && (
          <div className="max-w-2xl mx-auto space-y-4 pt-2">
            
            <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Daily Mastery Quiz</h3>
                  <p className="text-[11px] text-slate-400">
                    {quizList.length} question{quizList.length === 1 ? '' : 's'} on {quizList[0]?.topic || 'your syllabus'}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 font-mono text-xs font-semibold">
                  +100 XP Upon Completion
                </span>
              </div>

              {/* Generate a fresh AI quiz */}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={quizTopic}
                  onChange={(e) => setQuizTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGenerateQuiz()}
                  placeholder="Topic for AI questions, e.g. Union Budget 2026"
                  className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-xs text-white focus:outline-none focus:border-indigo-400"
                />
                <button
                  onClick={handleGenerateQuiz}
                  disabled={isLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-all"
                >
                  {isLoading ? 'Generating...' : 'Generate Quiz with AI'}
                </button>
              </div>
            </div>

            {quizList.map((q, idx) => (
              <div key={q.id} className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-xl space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-indigo-400">Question {idx + 1}</span>
                  <span className="px-2 py-0.5 rounded bg-white/5 font-mono text-[10px]">{q.subject}</span>
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
                        className={`w-full text-left p-3 rounded-xl border text-xs font-medium transition-all ${btnStyle}`}
                      >
                        {String.fromCharCode(65 + optIdx)}. {opt}
                      </button>
                    );
                  })}
                </div>

                {showQuizResults && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-white/5 text-xs text-slate-300 mt-2">
                    💡 <strong>Explanation:</strong> {q.explanation}
                  </div>
                )}
              </div>
            ))}

            {!showQuizResults ? (
              <button
                onClick={() => {
                  setShowQuizResults(true);
                  const percent = Math.round((quizScore / Math.max(1, quizList.length)) * 100);
                  addXp(100);
                  if (percent >= 80) triggerCelebration();
                  addToast(
                    'Quiz Completed!',
                    `You scored ${quizScore}/${quizList.length} (${percent}%). +100 XP awarded!`,
                    percent >= 80 ? 'success' : 'info'
                  );
                }}
                disabled={Object.keys(selectedAnswers).length < quizList.length}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-indigo-500/25 transition-all"
              >
                Submit Answers & Evaluate
              </button>
            ) : (
              <>
                <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 text-center">
                  <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">Your Score</p>
                  <p className="text-2xl font-extrabold text-white mt-1">
                    {quizScore} / {quizList.length}
                    <span className="text-sm text-indigo-300 ml-2">
                      ({Math.round((quizScore / Math.max(1, quizList.length)) * 100)}%)
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowQuizResults(false);
                    setSelectedAnswers({});
                  }}
                  className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-colors"
                >
                  Try Another Diagnostic Quiz
                </button>
              </>
            )}

          </div>
        )}

      </div>

    </div>
  );
};
