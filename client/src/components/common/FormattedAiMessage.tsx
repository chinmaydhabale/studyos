import React, { useMemo, useState } from 'react';
import katex from 'katex';
import { Copy, Check, Sparkles, Lightbulb, AlertTriangle, BookOpen } from 'lucide-react';

interface FormattedAiMessageProps {
  content: string;
  className?: string;
}

function normalizeTexCommands(tex: string): string {
  // Repair doubled backslashes on recognized multi-letter LaTeX commands (from JSON over-escaping),
  // while preserving intentional LaTeX double-backslash row separators (\\) in cases, matrices, aligned, etc.
  return tex.replace(
    /\\\\(frac|dfrac|tfrac|sqrt|times|text|mathbf|mathrm|mathit|operatorname|overline|underline|vec|left|right|begin|end|cdot|pm|approx|alpha|beta|gamma|theta|sum|int|infty|ge|le|neq|div|quad|xrightarrow|binom|over|partial|lim|log|ln|sin|cos|tan|pi|lambda|sigma|omega|delta|nabla|phi|psi|rho|tau|mu|nu|zeta|eta|epsilon)\b/g,
    '\\$1'
  );
}

function cleanTex(tex: string): string {
  return normalizeTexCommands(tex).trim();
}

/**
 * Safely renders LaTeX math using KaTeX.
 * Returns rendered HTML or raw text fallback on error.
 */
function renderKaTeX(tex: string, displayMode: boolean): string {
  try {
    const cleaned = cleanTex(tex);
    return katex.renderToString(cleaned, {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml'
    });
  } catch (e) {
    return `<span class="font-mono text-xs text-amber-300">${escapeHtml(tex)}</span>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Some AI providers return a transport envelope as a JSON string inside a
 * markdown code fence. That envelope is metadata, not the student's answer.
 * Unwrap only the known assistant envelope shape so real JSON/code examples
 * continue to render as code.
 */
function unwrapAiResponseEnvelope(content: string): string {
  let current = content.trim();

  for (let depth = 0; depth < 2; depth++) {
    const fenced = current.match(/^```\s*(json)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
    const candidate = fenced ? fenced[2].trim() : current;
    let parsed: unknown;

    try {
      parsed = JSON.parse(candidate);
    } catch {
      return current;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return current;

    const envelope = parsed as Record<string, unknown>;
    const payload = envelope.data;
    const isAiEnvelope = envelope.response_type === 'json' && payload && typeof payload === 'object' && !Array.isArray(payload);
    if (!isAiEnvelope) return current;

    const data = payload as Record<string, unknown>;
    const answer = [data.solution_breakdown, data.answer, data.explanation, data.content, data.markdown, data.text]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const coachMessage = typeof data.coach_message === 'string' ? data.coach_message.trim() : '';

    if (!answer && !coachMessage) return current;
    current = answer
      ? [coachMessage, answer.trim()].filter(Boolean).join('\n\n')
      : coachMessage;
  }

  return current;
}

function isMathLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 600) return false;
  // Does it contain clear LaTeX math commands?
  const hasLatex = /\\(frac|times|sqrt|xrightarrow|left|right|text\{|pm|cdot|approx|alpha|beta|theta|sum|int|partial|infty|ge|le|neq|div|over|binom|quad|pi)/.test(t);
  if (hasLatex) {
    const startsWithLatexCommand = /^\\[a-zA-Z]+/.test(t);
    const hasProse = /\b(?:the|is|are|was|were|be|been|being|this|that|these|those|we|you|it|they|using|use|take|where|when|then|because|so|and|but|if|for|from|with|by|of|to|in|on|as|let|consider|substitute|calculate|find|solve|result|therefore|thus|hence|which|value|formula|equation|answer|gives|means|equals)\b/i.test(t);
    return startsWithLatexCommand && !hasProse;
  }
  // Does it look like a standalone mathematical equation line (e.g. "MP = CP + 40")
  if (/^[A-Za-z0-9_\(\)]+\s*=\s*[A-Za-z0-9_\(\)\+\-\*\/\^\s\\]+$/.test(t) && !t.includes('http') && !t.includes('**')) {
    return true;
  }
  return false;
}

/**
 * Parses inline text for Markdown emphasis/code, delimited math, and common bare LaTeX commands.
 */
const InlineFormattedText: React.FC<{ text: string }> = ({ text }) => {
  const parts = useMemo(() => {
    const sourceText = normalizeTexCommands(text);
    // Regex matches:
    // 1. Display math: $$...$$ or \[...\]
    // 2. Inline math: $...$ or \(...\)
    // 3. Bold: **...**
    // 4. Inline code: `...`
    // 5. Italic: *...*
    // 6. Common unwrapped LaTeX commands used inline by generated answers
    const tokens: React.ReactNode[] = [];
    const regex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$([^\$\n]+?)\$|\\\([\s\S]+?\\\)|\*\*([^*]+)\*\*|`([^`]+)`|\\(?:frac|dfrac|tfrac|binom)\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*\{(?:[^{}]|\{[^{}]*\})*\}|\\sqrt(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}|\\(?:text|mathrm|mathbf|mathit|operatorname|overline|underline|vec)\s*\{(?:[^{}]|\{[^{}]*\})*\}|\\(?:times|cdot|pm|approx|alpha|beta|gamma|theta|sum|int|partial|infty|ge|le|neq|div|quad|pi|lambda|sigma|omega|delta|nabla|phi|psi|rho|tau|mu|nu|zeta|eta|epsilon)\b|\*([^*]+)\*)/g;
    
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sourceText)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(sourceText.substring(lastIndex, match.index));
      }

      const fullMatch = match[0];

      if (fullMatch.startsWith('$$') && fullMatch.endsWith('$$')) {
        // Display math inline
        const math = fullMatch.slice(2, -2);
        const html = renderKaTeX(math, true);
        tokens.push(
          <span
            key={match.index}
            className="my-2 block text-center overflow-x-auto custom-scrollbar py-1"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } else if (fullMatch.startsWith('\\[') && fullMatch.endsWith('\\]')) {
        const math = fullMatch.slice(2, -2);
        const html = renderKaTeX(math, true);
        tokens.push(
          <span
            key={match.index}
            className="my-2 block text-center overflow-x-auto custom-scrollbar py-1"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } else if (fullMatch.startsWith('$') && fullMatch.endsWith('$')) {
        const math = fullMatch.slice(1, -1);
        const html = renderKaTeX(math, false);
        tokens.push(
          <span
            key={match.index}
            className="inline-block px-1 align-baseline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } else if (fullMatch.startsWith('\\(') && fullMatch.endsWith('\\)')) {
        const math = fullMatch.slice(2, -2);
        const html = renderKaTeX(math, false);
        tokens.push(
          <span
            key={match.index}
            className="inline-block px-1 align-baseline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } else if (match[3]) {
        // Bold: **text**
        tokens.push(
          <strong key={match.index} className="font-bold text-white tracking-wide">
            <InlineFormattedText text={match[3]} />
          </strong>
        );
      } else if (match[4]) {
        // Code: `code`
        tokens.push(
          <code
            key={match.index}
            className="px-1.5 py-0.5 rounded-md bg-slate-800 text-cyan-300 font-mono text-[11px] border border-white/10"
          >
            {match[4]}
          </code>
        );
      } else if (match[5]) {
        // Italic: *text*
        tokens.push(
          <em key={match.index} className="italic text-slate-200">
            <InlineFormattedText text={match[5]} />
          </em>
        );
      } else if (fullMatch.startsWith('\\')) {
        const html = renderKaTeX(fullMatch, false);
        tokens.push(
          <span
            key={match.index}
            className="inline-block px-1 align-baseline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < sourceText.length) {
      tokens.push(sourceText.substring(lastIndex));
    }

    return tokens;
  }, [text]);

  return <>{parts}</>;
};

export const FormattedAiMessage: React.FC<FormattedAiMessageProps> = ({ content, className = '' }) => {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 2000);
  };

  const normalizedContent = useMemo(() => {
    if (!content) return '';
    let s = unwrapAiResponseEnvelope(content);
    // Replace literal escaped newlines and tabs without corrupting LaTeX commands
    s = s
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n(?![a-zA-Z])/g, '\n')
      .replace(/\\r(?![a-zA-Z])/g, '\n')
      .replace(/\\t(?![a-zA-Z])/g, '  ');
    return s;
  }, [content]);

  // Block parser splits content by code fences, math display blocks, tables, and paragraphs
  const renderedBlocks = useMemo(() => {
    if (!normalizedContent) return null;

    const lines = normalizedContent.split('\n');
    const blocks: React.ReactNode[] = [];
    let currentTableRows: string[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeContent: string[] = [];
    let mathBlockClose: '$$' | '\\]' | null = null;
    let mathContent: string[] = [];

    const flushTable = (key: string | number) => {
      if (currentTableRows.length === 0) return;
      const rows = currentTableRows.map(r =>
        r
          .split('|')
          .slice(1, -1)
          .map(cell => cell.trim())
      );
      currentTableRows = [];

      if (rows.length === 0) return;
      const headerRow = rows[0];
      // Filter out divider row (---)
      const dataRows = rows.slice(1).filter(r => !r.every(c => c.replace(/[-:]/g, '') === ''));

      blocks.push(
        <div key={`table-${key}`} className="my-3 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/70 shadow-md">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 border-b border-white/10 text-cyan-300 font-semibold">
                {headerRow.map((cell, cIdx) => (
                  <th key={cIdx} className="p-2.5 px-3">
                    <InlineFormattedText text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {dataRows.map((r, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'}>
                  {r.map((cell, cIdx) => (
                    <td key={cIdx} className="p-2.5 px-3 text-slate-200">
                      <InlineFormattedText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    const flushCodeBlock = (key: string | number) => {
      if (!inCodeBlock) return;
      const code = codeContent.join('\n');
      codeContent = [];
      inCodeBlock = false;
      const language = codeLanguage;
      codeLanguage = '';

      blocks.push(
        <div key={`code-${key}`} className="my-3 rounded-2xl bg-slate-950 border border-white/10 overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-white/5 text-[11px] text-slate-400">
            <span className="font-mono text-cyan-400">{language || 'code'}</span>
            <button
              type="button"
              onClick={() => handleCopy(code, typeof key === 'number' ? key : lines.length)}
              className="flex items-center gap-1 hover:text-white transition-colors"
            >
              {copiedCodeIdx === (typeof key === 'number' ? key : lines.length) ? (
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
          <pre className="p-3 text-xs font-mono text-cyan-200 overflow-x-auto custom-scrollbar leading-relaxed">
            {code}
          </pre>
        </div>
      );
    };

    const flushMathBlock = (key: string | number) => {
      if (!mathBlockClose) return;
      const math = mathContent.join('\n').trim();
      mathContent = [];
      mathBlockClose = null;
      if (!math) return;

      const html = renderKaTeX(math, true);
      blocks.push(
        <div
          key={`math-block-${key}`}
          className="my-3 p-3 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 text-center overflow-x-auto custom-scrollbar shadow-inner"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Code fences take priority so math-like code stays literal text.
      if (inCodeBlock) {
        if (trimmed.startsWith('```')) {
          flushCodeBlock(i);
        } else {
          codeContent.push(line);
        }
        continue;
      }

      // Once a display-math block starts, collect every line until its matching fence.
      if (mathBlockClose) {
        if (trimmed === mathBlockClose) {
          flushMathBlock(i);
        } else {
          mathContent.push(line);
        }
        continue;
      }

      if (trimmed.startsWith('```')) {
        flushTable(i);
        inCodeBlock = true;
        codeLanguage = trimmed.slice(3).trim();
        codeContent = [];
        continue;
      }

      // Math block fence: $$ or \[
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 3) {
        flushTable(i);
        const math = trimmed.slice(2, -2);
        const html = renderKaTeX(math, true);
        blocks.push(
          <div
            key={`math-one-${i}`}
            className="my-3 p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/25 text-center overflow-x-auto custom-scrollbar shadow-inner"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
        continue;
      }

      // Single dollar standalone line: $...$
      if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2) {
        flushTable(i);
        const math = trimmed.slice(1, -1);
        const html = renderKaTeX(math, true);
        blocks.push(
          <div
            key={`math-dollar-${i}`}
            className="my-3 p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/25 text-center overflow-x-auto custom-scrollbar shadow-inner"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
        continue;
      }

      // Standalone unwrapped LaTeX or math equation line
      if (isMathLine(trimmed)) {
        try {
          const cleaned = cleanTex(trimmed);
          const html = katex.renderToString(cleaned, { displayMode: true, throwOnError: true });
          flushTable(i);
          blocks.push(
            <div
              key={`math-auto-${i}`}
              className="my-3 p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/25 text-center overflow-x-auto custom-scrollbar shadow-inner"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
          continue;
        } catch {
          // If KaTeX parsing threw an error, fall through to regular line processing
        }
      }

      if (trimmed === '$$' || trimmed === '\\[') {
        flushTable(i);
        mathBlockClose = trimmed === '$$' ? '$$' : '\\]';
        mathContent = [];
        continue;
      }

      // Tables starting with |
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        currentTableRows.push(trimmed);
        continue;
      } else {
        flushTable(i);
      }

      // Blank line
      if (!trimmed) {
        blocks.push(<div key={`sp-${i}`} className="h-2" />);
        continue;
      }

      // Horizontal separator
      if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
        blocks.push(<hr key={`hr-${i}`} className="border-white/10 my-3" />);
        continue;
      }

      // Headings
      if (trimmed.startsWith('### ')) {
        blocks.push(
          <h3 key={`h3-${i}`} className="text-sm font-bold text-cyan-300 mt-3.5 mb-1.5 flex items-center gap-2">
            <span className="w-1.5 h-3.5 bg-cyan-400 rounded-full" />
            <InlineFormattedText text={trimmed.slice(4)} />
          </h3>
        );
        continue;
      }

      if (trimmed.startsWith('## ')) {
        blocks.push(
          <h2 key={`h2-${i}`} className="text-base font-extrabold text-white mt-4 mb-2 pb-1 border-b border-white/10 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <InlineFormattedText text={trimmed.slice(3)} />
          </h2>
        );
        continue;
      }

      if (trimmed.startsWith('# ')) {
        blocks.push(
          <h1 key={`h1-${i}`} className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-cyan-300 mt-5 mb-2.5">
            <InlineFormattedText text={trimmed.slice(2)} />
          </h1>
        );
        continue;
      }

      // Pro Tip / Shortcut / Important Callout Cards
      const lowerTrimmed = trimmed.toLowerCase();
      if (
        lowerTrimmed.startsWith('💡') ||
        lowerTrimmed.startsWith('shortcut:') ||
        lowerTrimmed.startsWith('**shortcut') ||
        lowerTrimmed.startsWith('tip:') ||
        lowerTrimmed.startsWith('**tip:') ||
        lowerTrimmed.startsWith('pro tip:')
      ) {
        blocks.push(
          <div
            key={`tip-${i}`}
            className="my-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-500/30 text-amber-100 flex items-start gap-2.5 shadow-md"
          >
            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed flex-1">
              <InlineFormattedText text={trimmed.replace(/^[💡\s]+/, '')} />
            </div>
          </div>
        );
        continue;
      }

      if (
        lowerTrimmed.startsWith('⚠️') ||
        lowerTrimmed.startsWith('trap:') ||
        lowerTrimmed.startsWith('**trap:') ||
        lowerTrimmed.startsWith('caution:') ||
        lowerTrimmed.startsWith('common mistake:')
      ) {
        blocks.push(
          <div
            key={`trap-${i}`}
            className="my-3 p-3.5 rounded-2xl bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/30 text-rose-100 flex items-start gap-2.5 shadow-md"
          >
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed flex-1">
              <InlineFormattedText text={trimmed.replace(/^[⚠️\s]+/, '')} />
            </div>
          </div>
        );
        continue;
      }

      // Step cards e.g. "Step 1: ...", "**Step 1:**"
      if (/^(\*\*Step\s+\d+[:\.]?\*\*|Step\s+\d+[:\.]?)/i.test(trimmed)) {
        blocks.push(
          <div
            key={`step-${i}`}
            className="my-2 p-3 rounded-2xl bg-slate-900/90 border-l-4 border-indigo-500 border-t border-r border-b border-white/10 shadow-sm"
          >
            <div className="text-xs text-slate-200 leading-relaxed font-medium">
              <InlineFormattedText text={trimmed} />
            </div>
          </div>
        );
        continue;
      }

      // Bullet lists
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
        const bulletText = trimmed.replace(/^[-*•]\s+/, '');
        blocks.push(
          <div key={`li-${i}`} className="flex items-start gap-2.5 my-1 ml-1 text-xs text-slate-200 leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 shrink-0" />
            <div className="flex-1">
              <InlineFormattedText text={bulletText} />
            </div>
          </div>
        );
        continue;
      }

      // Numbered lists e.g. "1. ", "2. "
      const numMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)/);
      if (numMatch) {
        blocks.push(
          <div key={`ol-${i}`} className="flex items-start gap-2.5 my-1 ml-1 text-xs text-slate-200 leading-relaxed">
            <span className="px-1.5 py-0.2 rounded-md bg-indigo-500/20 text-indigo-300 font-mono text-[11px] font-bold border border-indigo-500/30 shrink-0 mt-0.5">
              {numMatch[1]}
            </span>
            <div className="flex-1">
              <InlineFormattedText text={numMatch[2]} />
            </div>
          </div>
        );
        continue;
      }

      // Standard paragraph
      blocks.push(
        <p key={`p-${i}`} className="text-xs leading-relaxed text-slate-200 my-1">
          <InlineFormattedText text={line} />
        </p>
      );
    }

    // Preserve model output when a generated code/math fence is missing its closer.
    if (inCodeBlock) flushCodeBlock('end');
    if (mathBlockClose) flushMathBlock('end');
    flushTable('end');
    return blocks;
  }, [content, copiedCodeIdx]);

  return (
    <div className={`space-y-1 font-sans selection:bg-indigo-600 selection:text-white ${className}`}>
      {renderedBlocks}
    </div>
  );
};
