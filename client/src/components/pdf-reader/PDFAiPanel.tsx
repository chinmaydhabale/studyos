import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  BookOpen,
  Loader2,
  X,
  HelpCircle,
  Cpu,
  Quote,
  Lightbulb,
  Copy,
  Check,
  ChevronDown,
  RotateCcw,
  Maximize2,
  Minimize2,
  Zap,
  BrainCircuit,
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { API_BASE_URL } from '../../config.js';
import { FormattedAiMessage } from '../common/FormattedAiMessage.js';

const MAX_PAGE_TEXT_CHARS = 10000;

export interface PdfAssistResult {
  mode: 'page' | 'selection' | 'question';
  heading: string;
  explanation: string;
  keyPoints: string[];
  formula?: string;
  followUp?: string;
  source: 'gemini' | 'fallback';
  modelUsed?: string;
}

export interface AIModelOption {
  id: string;
  name: string;
  tag: string;
  description: string;
  badgeColor: string;
}

const DEFAULT_MODELS: AIModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    tag: 'Default • Ultra Fast',
    description: 'Instant answers for quick formula checks, rapid doubt resolution, and exam shortcuts',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    tag: 'Recommended & Stable',
    description: 'Rock solid, comprehensive textbook explanations with guaranteed instant availability',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tag: 'Next-Gen Reasoning',
    description: 'Next-Gen intelligence, ultra-fast step-by-step reasoning & complex math solver',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    tag: 'Math & Logic',
    description: 'Deep analytical thinking for complex mathematical derivations & proofs',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    tag: 'High Precision',
    description: 'Rigorous calculation accuracy and formula verification',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    tag: 'Fast & Balanced',
    description: 'High reliability, balanced speed and comprehensive derivations',
    badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    tag: 'Deep Analytical',
    description: 'High capability model for intricate multi-step problem solving',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    tag: 'Low Latency',
    description: 'Fast response times for rapid revision blocks',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  },
  {
    id: 'gemini-2.0-flash-lite',
    name: 'Gemini 2.0 Flash Lite',
    tag: 'Lite Engine',
    description: 'Lightweight and instant concept clarifications',
    badgeColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    tag: 'Classic Stable',
    description: 'Proven long-context understanding for dense multi-page chapters',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30'
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    tag: 'Classic Pro',
    description: 'High context window with deep exam-level precision',
    badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30'
  }
];

interface PDFAiPanelProps {
  docTitle: string;
  currentPage: number;
  userId: string;
  selectedText: string;
  autoRunSelection?: number;
  onClearSelection: () => void;
  onClose: () => void;
  getPageText: (page: number) => Promise<string>;
  onOpenCoachHub?: () => void;
  isPreparingCoachHub?: boolean;
  addToast: (title: string, message: string, type?: 'success' | 'info' | 'alert') => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

interface Exchange {
  id: string;
  question?: string;
  selectedText?: string;
  page: number;
  result: PdfAssistResult;
  timestamp: Date;
}

export const PDFAiPanel: React.FC<PDFAiPanelProps> = ({
  docTitle,
  currentPage,
  userId,
  selectedText,
  autoRunSelection,
  onClearSelection,
  onClose,
  getPageText,
  onOpenCoachHub,
  isPreparingCoachHub = false,
  addToast,
  isExpanded,
  onToggleExpand
}) => {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [models, setModels] = useState<AIModelOption[]>(DEFAULT_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window === 'undefined') return 'gemini-3.5-flash-lite';
    try {
      const saved = localStorage.getItem('studyos_pdf_ai_model');
      if (saved) return saved;
    } catch {}
    return 'gemini-3.5-flash-lite';
  });
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);

  // Fetch AI server status and available models
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/api/ai/status`)
      .then(res => res.json())
      .then((data: { enabled: boolean }) => {
        if (!cancelled) setAiEnabled(Boolean(data?.enabled));
      })
      .catch(() => {
        if (!cancelled) setAiEnabled(false);
      });

    fetch(`${API_BASE_URL}/api/ai/models`)
      .then(res => res.json())
      .then((data: { models: AIModelOption[] }) => {
        if (!cancelled && Array.isArray(data?.models) && data.models.length > 0) {
          setModels(data.models);
        }
      })
      .catch(() => {
        // Fallback to DEFAULT_MODELS
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Close model picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    if (showModelPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showModelPicker]);

  // Save model choice
  const handleSelectModel = (modelId: string) => {
    setSelectedModel(modelId);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('studyos_pdf_ai_model', modelId);
      }
    } catch {}
    setShowModelPicker(false);
    const m = models.find(x => x.id === modelId);
    addToast('Model Changed', `Now using ${m?.name || modelId} for step-by-step reasoning.`, 'info');
  };

  // Scroll to bottom on new answers
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [exchanges.length, isLoading]);

  const activeModelObj = models.find(m => m.id === selectedModel) || models[0];

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Clipboard API can throw in insecure (plain http) contexts — fall through to the legacy path.
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopySolution = async (ex: Exchange) => {
    const isFallback = ex.result.source === 'fallback';
    const fallbackNotice = isFallback ? `> *[Note: Extracted Page Text (AI Offline Fallback)]*\n\n` : '';
    const fullText = `${fallbackNotice}# ${ex.result.heading}\n\n${ex.result.explanation}${
      ex.result.formula ? `\n\n### ${isFallback ? 'Formula Snippet' : 'Primary Formula'}:\n$$${ex.result.formula}$$` : ''
    }${
      ex.result.keyPoints?.length
        ? `\n\n### ${isFallback ? 'Extracted Key Sentences' : 'Key Exam Takeaways'}:\n${ex.result.keyPoints.map(p => `- ${p}`).join('\n')}`
        : ''
    }`;
    const ok = await copyToClipboard(fullText);
    if (!ok) {
      addToast('Copy Failed', 'Clipboard is unavailable in this browser context. Select and copy the text manually.', 'alert');
      return;
    }
    setCopiedId(ex.id);
    addToast(
      isFallback ? 'Copied Extracted Text' : 'Copied to Clipboard',
      isFallback ? 'Extracted text note copied.' : 'Full step-by-step solution copied with formulas.',
      'success'
    );
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleClearHistory = () => {
    if (exchanges.length === 0) return;
    setExchanges([]);
    addToast('Session Cleared', 'Started a fresh AI study session.', 'info');
  };

  const runAssist = async (opts: {
    mode: 'page' | 'selection' | 'question';
    selected?: string;
    ask?: string;
    page?: number;
  }) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    const page = opts.page ?? currentPage;
    const effectiveSelectedText = opts.mode === 'page' ? undefined : opts.selected;
    setIsLoading(true);
    try {
      const rawText = await getPageText(page);
      const pageText = rawText.slice(0, MAX_PAGE_TEXT_CHARS);

      // Build previous conversation turns for multi-turn context
      const conversationHistory = exchanges.slice(-6).flatMap(ex => {
        const turns: Array<{ role: 'user' | 'assistant'; text: string }> = [];
        if (ex.question) {
          turns.push({ role: 'user', text: ex.question });
        } else if (ex.selectedText) {
          turns.push({ role: 'user', text: `Explain this passage from Page ${ex.page}: "${ex.selectedText}"` });
        }
        if (ex.result.explanation) {
          turns.push({ role: 'assistant', text: ex.result.explanation });
        }
        return turns;
      });

      const res = await fetch(`${API_BASE_URL}/api/ai/pdf-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: opts.mode,
          docTitle,
          page,
          pageText,
          selectedText: effectiveSelectedText,
          question: opts.ask,
          userId,
          model: selectedModel,
          conversationHistory
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: PdfAssistResult = await res.json();

      setExchanges(prev => [
        ...prev,
        {
          id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          question: opts.ask,
          selectedText: effectiveSelectedText,
          page,
          result,
          timestamp: new Date()
        }
      ]);

      if (result.source === 'fallback') {
        if (aiEnabled === false) {
          // Server has no key configured — the extracted PDF text is the best we can show.
          addToast(
            'AI Offline',
            pageText || effectiveSelectedText
              ? 'Showing extracted page text instead — set GEMINI_API_KEY on the server for real AI explanations.'
              : 'No PDF text was available for a grounded answer, and the AI service is offline. Set GEMINI_API_KEY to answer general questions.',
            'info'
          );
        } else {
          // Key is configured but the model was rate-limited / busy / returned nothing usable.
          addToast(
            'AI Model Busy',
            'The AI model is rate-limited or busy right now — showing extracted page text. Please try again in a moment.',
            'info'
          );
        }
      }
    } catch (err) {
      console.error('PDF AI assist failed:', err);
      addToast('AI Unavailable', 'Could not reach the AI professor for this page. Please try again.', 'alert');
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleAsk = () => {
    const ask = question.trim();
    if (!ask || isLoadingRef.current) return;
    const selected = selectedText || undefined;
    setQuestion('');
    runAssist({ mode: 'question', ask, selected });
    // Consume the passage so it isn't silently re-attached (with a mismatched page) to later questions.
    if (selected) onClearSelection();
  };

  // Triggered when student taps "Explain with AI" from the PDF text selection popover.
  // The parent increments `autoRunSelection` monotonically; this ref de-dupes so each
  // distinct trigger runs exactly once and never re-fires on unrelated re-renders.
  const lastAutoRunRef = useRef<number>(0);
  useEffect(() => {
    if (isLoading || !autoRunSelection || autoRunSelection === lastAutoRunRef.current) return;
    if (!selectedText || !selectedText.trim()) return;
    lastAutoRunRef.current = autoRunSelection;
    runAssist({ mode: 'selection', selected: selectedText });
  }, [autoRunSelection, selectedText, isLoading]);

  return (
    <div className="h-full flex flex-col bg-slate-950/95 backdrop-blur-md overflow-hidden text-slate-100 select-text">
      {/* 1. Header with Model Selector & Quick Controls */}
      <div className="p-3 border-b border-white/10 bg-slate-900/80 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Title & Document Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-cyan-400 flex items-center justify-center shadow-md shadow-indigo-500/25 shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-black text-white tracking-tight truncate">
                  AI Study Professor
                </h3>
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-bold">
                  PRO
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                {docTitle} • <span className="text-cyan-300 font-mono font-semibold">Page {currentPage}</span>
              </p>
            </div>
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-1 shrink-0">
            {exchanges.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                title="Clear current session history"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors hidden sm:block"
                title={isExpanded ? 'Collapse to standard width' : 'Expand panel for wider equations'}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Close AI panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* AI Model Switcher Dropdown Trigger */}
        <div className="relative" ref={modelPickerRef}>
          <button
            type="button"
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-white/10 hover:border-indigo-500/40 text-left transition-all group"
            title="Switch AI Reasoning Engine"
          >
            <div className="flex items-center gap-2 min-w-0">
              <BrainCircuit className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white group-hover:text-cyan-200 transition-colors truncate">
                    {activeModelObj.name}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${activeModelObj.badgeColor}`}
                  >
                    {activeModelObj.tag}
                  </span>
                </div>
              </div>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${
                showModelPicker ? 'rotate-180 text-white' : ''
              }`}
            />
          </button>

          {/* Model Selector Popover */}
          {showModelPicker && (
            <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-2xl bg-[#0b101e]/98 backdrop-blur-2xl border border-white/15 p-2 shadow-2xl space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-white/10 pb-1 mb-1 flex items-center justify-between">
                <span>Select AI Model</span>
                <span className="text-[9px] font-mono text-cyan-400">Gemini 2026 Engine</span>
              </div>

              {models.map(m => {
                const isSelected = m.id === selectedModel;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectModel(m.id)}
                    className={`w-full text-left p-2 rounded-xl flex items-start justify-between gap-2 transition-all ${
                      isSelected
                        ? 'bg-indigo-600/30 border border-indigo-400/50 text-white shadow-sm'
                        : 'hover:bg-white/5 text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                          {m.name}
                        </span>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${m.badgeColor}`}>
                          {m.tag}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5 line-clamp-1">
                        {m.description}
                      </p>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. Chat / Solution Feed */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 custom-scrollbar">
        {aiEnabled === false && (
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
            <strong>GEMINI_API_KEY is not configured</strong> on the server. AI features are operating in fallback mode.
          </div>
        )}

        {/* Welcome & How-to guide when no chat yet */}
        {exchanges.length === 0 && !isLoading && (
          <div className="p-4 rounded-3xl bg-slate-900/60 border border-white/10 text-xs text-slate-300 leading-relaxed space-y-3 shadow-lg">
            <div className="flex items-center gap-2 text-white font-extrabold text-sm border-b border-white/10 pb-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Step-by-Step AI Problem Solver</span>
            </div>
            <p className="text-slate-300">
              Ask anything about this document! Get comprehensive, Gemini-level answers with complete step-by-step
              working, KaTeX math formatting, and shortcut tricks.
            </p>
            <div className="space-y-2 pt-1 text-[11px]">
              <div className="flex items-start gap-2 p-2 rounded-xl bg-white/5 border border-white/5">
                <span className="text-indigo-400 font-bold shrink-0">1.</span>
                <span>
                  <strong>Ask any Math or Logic Question:</strong> Type question in Hindi, Hinglish, or English.
                </span>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-xl bg-white/5 border border-white/5">
                <span className="text-cyan-400 font-bold shrink-0">2.</span>
                <span>
                  <strong>Highlight Text in PDF:</strong> Select any text, theorem, or problem, then click &ldquo;Explain selection&rdquo;.
                </span>
              </div>
              <div className="flex items-start gap-2 p-2 rounded-xl bg-white/5 border border-white/5">
                <span className="text-emerald-400 font-bold shrink-0">3.</span>
                <span>
                  <strong>Full Page Breakdown:</strong> Tap &ldquo;Explain Page {currentPage}&rdquo; for an end-to-end breakdown.
                </span>
              </div>
            </div>

            {/* Quick Prompt Starters */}
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick Starters:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => runAssist({ mode: 'page' })}
                  className="px-2.5 py-1 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[11px] font-medium transition-all"
                >
                  📖 Explain Page {currentPage} End-to-End
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runAssist({
                      mode: 'question',
                      ask: 'Is page par jo main formulas aur concepts hain, unhe step-by-step detail me samjhao with shortcuts.'
                    })
                  }
                  className="px-2.5 py-1 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[11px] font-medium transition-all"
                >
                  ⚡ Formulas & Shortcut Tricks
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runAssist({
                      mode: 'question',
                      ask: 'Is page ke topic par competitive exam me aane wale 3 typical questions banawo aur unka step by step solution do.'
                    })
                  }
                  className="px-2.5 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-medium transition-all"
                >
                  🎯 Exam Questions & Solutions
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Selected text waiting for explanation */}
        {selectedText && (
          <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-2.5 shadow-md">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-bold text-indigo-300 flex items-center gap-1.5">
                <Quote className="w-3.5 h-3.5" />
                <span>Selected PDF Passage (Page {currentPage})</span>
              </span>
              <button
                onClick={onClearSelection}
                className="text-[10px] text-slate-400 hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed max-h-28 overflow-y-auto custom-scrollbar p-2 bg-slate-950/60 rounded-xl border border-white/5 font-mono">
              &ldquo;{selectedText}&rdquo;
            </p>
            <button
              onClick={() => runAssist({ mode: 'selection', selected: selectedText })}
              disabled={isLoading}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 transition-all"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{isLoading ? 'Analyzing Passage...' : 'Explain Passage Step-by-Step'}</span>
            </button>
          </div>
        )}

        {/* List of Solution Exchanges */}
        {exchanges.map(ex => (
          <div
            key={ex.id}
            className="p-4 rounded-3xl bg-slate-900/80 border border-white/15 space-y-3.5 shadow-xl transition-all"
          >
            {/* Answer Header Bar */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="p-1 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0">
                  {ex.result.mode === 'question' ? (
                    <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                  ) : (
                    <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                </span>
                <span className="font-extrabold text-xs text-white truncate">{ex.result.heading}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-md">
                  P.{ex.page}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopySolution(ex)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Copy full solution"
                >
                  {copiedId === ex.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Prompt context (if user asked a question) */}
            {ex.question && (
              <div className="p-2.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/20 flex items-start gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-indigo-200 leading-relaxed">{ex.question}</p>
              </div>
            )}

            {/* Main Step-by-Step Solution Body (Rendered with KaTeX Math & Markdown) */}
            <div className="text-xs leading-relaxed text-slate-200">
              <FormattedAiMessage content={ex.result.explanation} />
            </div>

            {/* Formula Callout Card */}
            {ex.result.formula && (
              <div className="p-3 rounded-2xl bg-slate-950 border border-indigo-500/30 space-y-1.5 shadow-inner">
                <div className="flex items-center justify-between text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Primary Formula</span>
                  </span>
                  <span className="text-[9px] font-mono text-slate-500">LaTeX KaTeX</span>
                </div>
                <FormattedAiMessage content={`$$${ex.result.formula}$$`} />
              </div>
            )}

            {/* Key Takeaways / Exam Rules */}
            {ex.result.keyPoints && ex.result.keyPoints.length > 0 && (
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2">
                <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center gap-1">
                  <Check className="w-3 h-3 text-cyan-400" />
                  <span>Key Points to Remember</span>
                </span>
                <ul className="space-y-1.5">
                  {ex.result.keyPoints.map((point, idx) => (
                    <li key={idx} className="text-xs text-slate-300 leading-relaxed flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-1.5" />
                      <FormattedAiMessage content={point} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Interactive Follow-Up Suggestion Chip */}
            {ex.result.followUp && (
              <button
                type="button"
                disabled={isLoading}
                onClick={() => runAssist({ mode: 'question', ask: ex.result.followUp })}
                className="w-full text-left p-2.5 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs text-cyan-200 transition-all flex items-center justify-between group"
                title="Tap to ask this follow-up question"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Lightbulb className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">
                    <strong>Follow-up Challenge:</strong> {ex.result.followUp}
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-cyan-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}

            {/* Footer Tag */}
            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-white/5">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-indigo-400" />
                <span>Engine: {ex.result.modelUsed || selectedModel}</span>
              </span>
              <span>{ex.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="p-4 rounded-3xl bg-slate-900/90 border border-indigo-500/30 flex items-center gap-3 animate-pulse shadow-lg">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white">
                {activeModelObj.name} is solving step-by-step...
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                Analyzing page {currentPage} formulas, intermediate steps & concepts
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Input & Action Bar */}
      <div className="p-3 sm:p-4 border-t border-white/10 bg-slate-900/90 shrink-0 space-y-2.5">
        {/* Quick Action Pills */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => runAssist({ mode: 'page' })}
            disabled={isLoading}
            className="flex-1 py-1.5 px-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Explain Page {currentPage}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              runAssist({
                mode: 'question',
                ask: 'Is question ka complete mathematical derivation aur shortcut method dono detail me batao.'
              })
            }
            disabled={isLoading}
            className="flex-1 py-1.5 px-2.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Derivation & Shortcut</span>
          </button>
        </div>

        {/* Question Textarea & Send Button */}
        <div className="flex items-end gap-2 bg-slate-950 border border-white/15 focus-within:border-indigo-400 rounded-2xl p-1.5 transition-colors">
          <textarea
            value={question}
            disabled={isLoading}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              // The isComposing / keyCode 229 guard stops an IME commit (common for Hindi/
              // Devanagari input) from being swallowed as a submit instead of confirming the word.
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !isLoading &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                handleAsk();
              }
            }}
            rows={2}
            placeholder="Ask AI Teacher: solve question, explain formula, proof... (Enter to send)"
            className="flex-1 resize-none bg-transparent px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none select-text custom-scrollbar leading-relaxed"
          />
          <button
            type="button"
            onClick={handleAsk}
            disabled={isLoading || !question.trim()}
            className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 disabled:opacity-40 text-white shadow-md shadow-indigo-600/25 transition-all shrink-0"
            title="Send question to AI"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        {onOpenCoachHub && (
          <button
            type="button"
            onClick={onOpenCoachHub}
            disabled={isPreparingCoachHub}
            className="w-full text-[10px] text-slate-400 hover:text-indigo-300 transition-colors text-center disabled:opacity-50"
            title="Open the full AI Coach hub for custom tests, notes & audio summaries"
          >
            {isPreparingCoachHub ? 'Extracting PDF text for AI Coach Hub…' : 'Need flashcards or audio overview? Open AI Coach Hub →'}
          </button>
        )}
      </div>
    </div>
  );
};
