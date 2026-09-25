import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, BookOpen, Loader2, X, HelpCircle, Cpu, Quote, Lightbulb } from 'lucide-react';
import { API_BASE_URL } from '../../config.js';

const MAX_PAGE_TEXT_CHARS = 6000;

export interface PdfAssistResult {
  mode: 'page' | 'selection' | 'question';
  heading: string;
  explanation: string;
  keyPoints: string[];
  formula?: string;
  followUp?: string;
  source: 'gemini' | 'fallback';
}

interface PDFAiPanelProps {
  docTitle: string;
  currentPage: number;
  userId: string;
  /** Text the student highlighted inside the PDF, if any. */
  selectedText: string;
  /** Changes when the student taps "Explain with AI"; triggers the explanation. */
  autoRunSelection?: number;
  onClearSelection: () => void;
  onClose: () => void;
  /** Extracts the text of a page from the loaded PDF. */
  getPageText: (page: number) => Promise<string>;
  /** Jumps to the full AI Coach hub for a broader session. */
  onOpenCoachHub?: () => void;
  addToast: (title: string, message: string, type?: 'success' | 'info' | 'alert') => void;
}

interface Exchange {
  id: string;
  question?: string;
  selectedText?: string;
  page: number;
  result: PdfAssistResult;
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
  addToast
}) => {
  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

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
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the newest answer in view as results stream in.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [exchanges.length, isLoading]);

  const runAssist = async (opts: { mode: 'page' | 'selection' | 'question'; selected?: string; ask?: string; page?: number }) => {
    const page = opts.page ?? currentPage;
    setIsLoading(true);
    try {
      // Match the server's prompt cap before serialization so a dense PDF page
      // cannot exceed Express's JSON body limit.
      const pageText = (await getPageText(page)).slice(0, MAX_PAGE_TEXT_CHARS);
      const res = await fetch(`${API_BASE_URL}/api/ai/pdf-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: opts.mode,
          docTitle,
          page,
          pageText,
          selectedText: opts.selected,
          question: opts.ask,
          userId
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: PdfAssistResult = await res.json();

      setExchanges(prev => [
        ...prev,
        {
          id: `ex-${Date.now()}`,
          question: opts.ask,
          selectedText: opts.selected,
          page,
          result
        }
      ]);
      if (result.source === 'fallback') {
        addToast('AI Offline', 'Showing extracted text instead — set GEMINI_API_KEY for real explanations.', 'info');
      }
    } catch (err) {
      console.error('PDF AI assist failed:', err);
      addToast('AI Unavailable', 'Could not reach the AI coach for this page.', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAsk = () => {
    const ask = question.trim();
    if (!ask) return;
    setQuestion('');
    runAssist({ mode: 'question', ask, selected: selectedText || undefined });
  };

  // The "Explain with AI" button in the reader bumps autoRunSelection.
  const lastAutoRunRef = useRef<number>(0);
  useEffect(() => {
    if (!autoRunSelection || autoRunSelection === lastAutoRunRef.current) return;
    if (!selectedText) return;
    lastAutoRunRef.current = autoRunSelection;
    runAssist({ mode: 'selection', selected: selectedText });
    // runAssist is intentionally not a dependency — it is recreated each render
    // and including it would re-fire the explanation on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunSelection]);

  return (
    <div className="h-full flex flex-col bg-slate-950/95 backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between bg-slate-900/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-500 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-extrabold text-white truncate">AI Reader Assistant</h3>
            <p className="text-[10px] text-slate-400 truncate">
              {docTitle} • page {currentPage}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors shrink-0"
          title="Close AI assistant"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {aiEnabled === false && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 leading-relaxed">
            <strong>GEMINI_API_KEY is not set</strong>, so the assistant will return the page text instead of a
            written explanation.
          </div>
        )}

        {/* How-to hint shown until the first answer arrives */}
        {exchanges.length === 0 && !isLoading && (
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/10 text-[11px] text-slate-300 leading-relaxed space-y-2">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              How to use this
            </p>
            <p>• Highlight any text in the PDF, then tap <strong>Explain selection</strong>.</p>
            <p>• Or press <strong>Explain this page</strong> for a full page breakdown.</p>
            <p>• Or just type a question below — answers use the text of the current page.</p>
          </div>
        )}

        {/* Selected text awaiting an explanation */}
        {selectedText && (
          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[10px] uppercase font-bold text-indigo-300 flex items-center gap-1">
                <Quote className="w-3 h-3" />
                Selected text
              </span>
              <button
                onClick={onClearSelection}
                className="text-[10px] text-slate-400 hover:text-white transition-colors shrink-0"
              >
                Clear
              </button>
            </div>
            <p className="text-[11px] text-slate-200 leading-relaxed max-h-24 overflow-y-auto">
              {selectedText}
            </p>
            <button
              onClick={() => runAssist({ mode: 'selection', selected: selectedText })}
              disabled={isLoading}
              className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isLoading ? 'Explaining...' : 'Explain selection'}
            </button>
          </div>
        )}

        {/* Answers */}
        {exchanges.map(ex => (
          <div key={ex.id} className="p-3 rounded-2xl bg-slate-900/70 border border-white/10 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-bold text-cyan-300 flex items-center gap-1 min-w-0">
                {ex.result.mode === 'question' ? (
                  <HelpCircle className="w-3 h-3 shrink-0" />
                ) : (
                  <BookOpen className="w-3 h-3 shrink-0" />
                )}
                <span className="truncate">{ex.result.heading}</span>
              </span>
              <span className="text-[9px] font-mono text-slate-500 shrink-0">p.{ex.page}</span>
            </div>

            {ex.question && (
              <p className="text-[11px] text-slate-400 italic border-l-2 border-slate-700 pl-2">
                {ex.question}
              </p>
            )}

            <p className="text-[11.5px] text-slate-200 leading-relaxed whitespace-pre-line">
              {ex.result.explanation}
            </p>

            {ex.result.keyPoints?.length > 0 && (
              <ul className="space-y-1 pt-1">
                {ex.result.keyPoints.map((point, idx) => (
                  <li key={idx} className="text-[11px] text-slate-300 leading-relaxed flex gap-1.5">
                    <span className="text-cyan-400 shrink-0">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            )}

            {ex.result.formula && (
              <p className="text-[11px] font-mono text-amber-200 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5">
                {ex.result.formula}
              </p>
            )}

            {ex.result.followUp && (
              <p className="text-[10.5px] text-indigo-300 flex gap-1.5">
                <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{ex.result.followUp}</span>
              </p>
            )}

            <p className="text-[9px] text-slate-500 flex items-center gap-1 pt-0.5">
              <Cpu className="w-2.5 h-2.5" />
              {ex.result.source === 'gemini' ? 'Gemini' : 'Offline (page text only)'}
            </p>
          </div>
        ))}

        {isLoading && exchanges.length === 0 && (
          <div className="flex items-center gap-2 text-[11px] text-slate-400 p-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            Reading page {currentPage}...
          </div>
        )}
      </div>

      {/* Actions + input */}
      <div className="p-3 border-t border-white/10 bg-slate-900/60 space-y-2 shrink-0">
        <button
          onClick={() => runAssist({ mode: 'page' })}
          disabled={isLoading}
          className="w-full py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 disabled:opacity-50 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/25 transition-all"
        >
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
          Explain this page
        </button>

        <div className="flex items-end gap-1.5">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAsk();
              }
            }}
            rows={2}
            placeholder="Ask about this page... (Enter to send)"
            className="flex-1 resize-none px-2.5 py-2 rounded-xl bg-slate-950 border border-white/15 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-400"
          />
          <button
            onClick={handleAsk}
            disabled={isLoading || !question.trim()}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors shrink-0"
            title="Ask AI about this page"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        {onOpenCoachHub && (
          <button
            onClick={onOpenCoachHub}
            className="w-full text-[10px] text-slate-400 hover:text-indigo-300 transition-colors text-center"
            title="Open the full AI Coach hub for a longer study session"
          >
            Need more? Open the full AI Coach hub →
          </button>
        )}
      </div>
    </div>
  );
};
