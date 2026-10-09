import React, { useState } from 'react';
import katex from 'katex';
import {
  Sparkles,
  Copy,
  Check,
  Zap,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { FormattedAiMessage } from './FormattedAiMessage.js';

export type AiBlock =
  | {
      type: 'concept';
      title?: string;
      content: string;
    }
  | {
      type: 'formula';
      title?: string;
      latex: string;
      variables?: Array<{ symbol: string; label: string }>;
      shortcutNote?: string;
    }
  | {
      type: 'steps';
      title?: string;
      steps: Array<{
        stepNumber: number;
        title: string;
        explanation: string;
        latex?: string;
      }>;
    }
  | {
      type: 'shortcut';
      title?: string;
      trick: string;
      speedGain?: string;
    }
  | {
      type: 'trap';
      warning: string;
    }
  | {
      type: 'quiz';
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }
  | {
      type: 'key_points';
      points: string[];
    };

export interface StructuredAiResponse {
  heading: string;
  topic?: string;
  difficulty?: 'Basic' | 'Moderate' | 'Exam Standard';
  blocks: AiBlock[];
  formula?: string;
  keyPoints?: string[];
  followUp?: string;
}

// ----------------------------------------------------
// 1. FORMULA CARD COMPONENT
// ----------------------------------------------------
export const FormulaCard: React.FC<{
  latex: string;
  title?: string;
  variables?: Array<{ symbol: string; label: string }>;
  shortcutNote?: string;
}> = ({ latex, title, variables, shortcutNote }) => {
  const [copied, setCopied] = useState(false);

  const cleanLatex = (latex || '').trim();
  let renderedHtml = '';
  try {
    renderedHtml = katex.renderToString(cleanLatex, {
      displayMode: true,
      throwOnError: false,
      errorColor: '#f87171'
    });
  } catch {
    renderedHtml = `<span class="font-mono text-cyan-300">${cleanLatex}</span>`;
  }

  const handleCopy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(cleanLatex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-2xl bg-gradient-to-b from-indigo-950/40 to-slate-950 border border-indigo-500/30 overflow-hidden shadow-xl">
      {/* Card Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-indigo-950/60 border-b border-indigo-500/20">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider truncate">
            {title || 'Key Formula'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            KaTeX
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-medium transition-colors border border-white/10"
            title="Copy formula LaTeX to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main KaTeX Equation Canvas */}
      <div className="p-4 text-center overflow-x-auto custom-scrollbar">
        <div
          className="inline-block min-w-full text-base sm:text-lg text-white"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>

      {/* Variables Breakdown Pill List */}
      {variables && variables.length > 0 && (
        <div className="px-3 py-2 bg-slate-900/60 border-t border-white/5 flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
            Where:
          </span>
          {variables.map((v, i) => (
            <span
              key={i}
              className="text-[11px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300"
            >
              <span className="font-mono font-bold text-indigo-300 mr-1">{v.symbol}</span>= {v.label}
            </span>
          ))}
        </div>
      )}

      {/* Shortcut Note Footer */}
      {shortcutNote && (
        <div className="px-3 py-1.5 bg-amber-500/5 border-t border-amber-500/10 text-[11px] text-amber-200/90 flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-amber-400 shrink-0" />
          <span>{shortcutNote}</span>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------
// 2. STEP-BY-STEP TIMELINE COMPONENT
// ----------------------------------------------------
export const StepTimeline: React.FC<{
  steps: Array<{
    stepNumber: number;
    title: string;
    explanation: string;
    latex?: string;
  }>;
  title?: string;
}> = ({ steps, title }) => {
  return (
    <div className="my-3 p-3 sm:p-4 rounded-2xl bg-slate-950/80 border border-white/10 shadow-lg">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
        <BookOpen className="w-4 h-4 text-indigo-400" />
        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
          {title || 'Step-by-Step Derivation & Solution'}
        </h4>
      </div>

      <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-indigo-500/20 before:z-0">
        {steps.map((st, idx) => {
          let mathHtml = '';
          if (st.latex && st.latex.trim()) {
            try {
              mathHtml = katex.renderToString(st.latex.trim(), {
                displayMode: true,
                throwOnError: false
              });
            } catch {}
          }

          return (
            <div key={idx} className="relative z-10 flex items-start gap-3">
              {/* Number Badge */}
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/30 ring-2 ring-slate-900">
                {st.stepNumber || idx + 1}
              </div>

              {/* Step Content Card */}
              <div className="flex-1 min-w-0 p-3 rounded-xl bg-slate-900/90 border border-white/10 shadow-sm">
                <div className="text-xs font-bold text-indigo-200 mb-1">
                  {st.title}
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  <FormattedAiMessage content={st.explanation} />
                </div>

                {/* Intermediate Equation if any */}
                {mathHtml && (
                  <div className="mt-2 p-2 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-center overflow-x-auto custom-scrollbar">
                    <div
                      className="inline-block text-xs text-cyan-200"
                      dangerouslySetInnerHTML={{ __html: mathHtml }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ----------------------------------------------------
// 3. INTERACTIVE QUIZ COMPONENT
// ----------------------------------------------------
export const InteractiveQuiz: React.FC<{
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}> = ({ question, options, correctIndex, explanation }) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const isAnswered = selectedIdx !== null;
  const isCorrect = selectedIdx === correctIndex;

  return (
    <div className="my-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-indigo-950/30 via-slate-950 to-slate-950 border border-indigo-500/30 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
            Quick Concept Check
          </span>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
          Instant Practice
        </span>
      </div>

      <p className="text-xs font-semibold text-white mb-3 leading-relaxed">
        {question}
      </p>

      {/* Option Buttons */}
      <div className="space-y-2">
        {options.map((opt, i) => {
          let btnStyle = 'bg-slate-900/90 border-white/10 text-slate-200 hover:bg-slate-800 hover:border-indigo-500/40';

          if (isAnswered) {
            if (i === correctIndex) {
              btnStyle = 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200 shadow-sm shadow-emerald-500/20';
            } else if (i === selectedIdx) {
              btnStyle = 'bg-rose-500/20 border-rose-500/60 text-rose-200 shadow-sm shadow-rose-500/20';
            } else {
              btnStyle = 'bg-slate-900/40 border-white/5 text-slate-500 opacity-60';
            }
          }

          return (
            <button
              key={i}
              type="button"
              disabled={isAnswered}
              onClick={() => setSelectedIdx(i)}
              className={`w-full text-left p-2.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-between gap-2 ${btnStyle}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-md bg-white/10 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="truncate">{opt}</span>
              </div>

              {isAnswered && i === correctIndex && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              {isAnswered && i === selectedIdx && i !== correctIndex && (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Answer Feedback & Pedagogy */}
      {isAnswered && (
        <div
          className={`mt-3 p-3 rounded-xl border text-xs leading-relaxed animate-in fade-in duration-200 ${
            isCorrect
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
          }`}
        >
          <div className="font-bold flex items-center gap-1.5 mb-1">
            {isCorrect ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Correct Answer! (+10 XP)</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Incorrect — Option {String.fromCharCode(65 + correctIndex)} is correct</span>
              </>
            )}
          </div>
          <div className="text-slate-300">
            <FormattedAiMessage content={explanation} />
          </div>
          <button
            type="button"
            onClick={() => setSelectedIdx(null)}
            className="mt-2 text-[10px] text-cyan-300 hover:underline flex items-center gap-1"
          >
            <span>Try Again</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------
// 4. SHORTCUT & TRAP CARDS
// ----------------------------------------------------
export const ShortcutCard: React.FC<{
  title?: string;
  trick: string;
  speedGain?: string;
}> = ({ title, trick, speedGain }) => (
  <div className="my-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-yellow-500/5 to-transparent border border-amber-500/30 shadow-md">
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-center gap-1.5">
        <Zap className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
          {title || '⚡ 30-Second Exam Shortcut'}
        </span>
      </div>
      {speedGain && (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {speedGain}
        </span>
      )}
    </div>
    <div className="text-xs text-amber-100 leading-relaxed">
      <FormattedAiMessage content={trick} />
    </div>
  </div>
);

export const TrapAlertCard: React.FC<{ warning: string }> = ({ warning }) => (
  <div className="my-3 p-3.5 rounded-2xl bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-transparent border border-rose-500/30 text-rose-100 shadow-md flex items-start gap-2.5">
    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
    <div className="flex-1 text-xs leading-relaxed">
      <div className="font-bold text-rose-300 mb-0.5">⚠️ Common Exam Trap / Negative Marking Warning:</div>
      <FormattedAiMessage content={warning} />
    </div>
  </div>
);

// ----------------------------------------------------
// 5. MASTER STRUCTURED AI BLOCKS RENDERER
// ----------------------------------------------------
interface StructuredAiBlocksProps {
  blocks?: AiBlock[];
  rawFallback?: string;
  className?: string;
}

export const StructuredAiBlocks: React.FC<StructuredAiBlocksProps> = ({
  blocks,
  rawFallback = '',
  className = ''
}) => {
  // If structured blocks are provided, render each typed component card
  if (Array.isArray(blocks) && blocks.length > 0) {
    return (
      <div className={`space-y-3 ${className}`}>
        {blocks.map((block, index) => {
          switch (block.type) {
            case 'concept':
              return (
                <div key={index} className="text-xs text-slate-200 leading-relaxed">
                  {block.title && (
                    <h3 className="text-sm font-bold text-white mb-1.5">
                      {block.title}
                    </h3>
                  )}
                  <FormattedAiMessage content={block.content} />
                </div>
              );

            case 'formula':
              return (
                <FormulaCard
                  key={index}
                  latex={block.latex}
                  title={block.title}
                  variables={block.variables}
                  shortcutNote={block.shortcutNote}
                />
              );

            case 'steps':
              return (
                <StepTimeline
                  key={index}
                  steps={block.steps || []}
                  title={block.title}
                />
              );

            case 'shortcut':
              return (
                <ShortcutCard
                  key={index}
                  title={block.title}
                  trick={block.trick}
                  speedGain={block.speedGain}
                />
              );

            case 'trap':
              return <TrapAlertCard key={index} warning={block.warning} />;

            case 'quiz':
              return (
                <InteractiveQuiz
                  key={index}
                  question={block.question}
                  options={block.options || []}
                  correctIndex={block.correctIndex ?? 0}
                  explanation={block.explanation || ''}
                />
              );

            case 'key_points':
              return (
                <div
                  key={index}
                  className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2"
                >
                  <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Key Points to Remember</span>
                  </span>
                  <ul className="space-y-1.5">
                    {(block.points || []).map((pt, pIdx) => (
                      <li
                        key={pIdx}
                        className="text-xs text-slate-300 leading-relaxed flex items-start gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-1.5" />
                        <FormattedAiMessage content={pt} />
                      </li>
                    ))}
                  </ul>
                </div>
              );

            default:
              return null;
          }
        })}
      </div>
    );
  }

  // 100% Backward compatible fallback: render normal markdown + KaTeX
  return <FormattedAiMessage content={rawFallback} className={className} />;
};
