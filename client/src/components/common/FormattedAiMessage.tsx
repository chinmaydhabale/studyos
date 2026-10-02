import React, { useMemo, useState } from 'react';
import katex from 'katex';
import { Copy, Check, Sparkles, Lightbulb, AlertTriangle, BookOpen } from 'lucide-react';

interface FormattedAiMessageProps {
  content: string;
  className?: string;
}

/**
 * Safely renders LaTeX math using KaTeX.
 * Returns rendered HTML or raw text fallback on error.
 */
function renderKaTeX(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex.trim(), {
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
 * Parses inline text for bold, italics, code, and inline LaTeX ($...$ and \(...\))
 */
const InlineFormattedText: React.FC<{ text: string }> = ({ text }) => {
  const parts = useMemo(() => {
    // Regex matches:
    // 1. Inline math: $...$ or \(...\)
    // 2. Bold: **...**
    // 3. Inline code: `...`
    // 4. Italic: *...*
    const tokens: React.ReactNode[] = [];
    const regex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$(?!\s)([^\$\n]+?)(?<!\s)\$|\\\([\s\S]+?\\\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
    
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(text.substring(lastIndex, match.index));
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
      } else if (match[4]) {
        // Bold: **text**
        tokens.push(
          <strong key={match.index} className="font-bold text-white tracking-wide">
            {match[4]}
          </strong>
        );
      } else if (match[5]) {
        // Code: `code`
        tokens.push(
          <code
            key={match.index}
            className="px-1.5 py-0.5 rounded-md bg-slate-800 text-cyan-300 font-mono text-[11px] border border-white/10"
          >
            {match[5]}
          </code>
        );
      } else if (match[6]) {
        // Italic: *text*
        tokens.push(
          <em key={match.index} className="italic text-slate-200">
            {match[6]}
          </em>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      tokens.push(text.substring(lastIndex));
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

  // Block parser splits content by code fences, math display blocks, tables, and paragraphs
  const renderedBlocks = useMemo(() => {
    if (!content) return null;

    const lines = content.split('\n');
    const blocks: React.ReactNode[] = [];
    let currentTableRows: string[] = [];
    let inCodeBlock = false;
    let codeLanguage = '';
    let codeContent: string[] = [];
    let inMathBlock = false;
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Math block fence: $$ or \[
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 3) {
        flushTable(i);
        const math = trimmed.slice(2, -2);
        const html = renderKaTeX(math, true);
        blocks.push(
          <div
            key={`math-one-${i}`}
            className="my-3 p-3 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 text-center overflow-x-auto custom-scrollbar shadow-inner"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
        continue;
      }

      if (trimmed === '$$' || trimmed === '\\[') {
        flushTable(i);
        if (inMathBlock) {
          // Close
          const math = mathContent.join('\n');
          mathContent = [];
          inMathBlock = false;
          const html = renderKaTeX(math, true);
          blocks.push(
            <div
              key={`math-block-${i}`}
              className="my-3 p-3 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 text-center overflow-x-auto custom-scrollbar shadow-inner"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } else {
          // Open
          inMathBlock = true;
          mathContent = [];
        }
        continue;
      }

      if (inMathBlock) {
        if (trimmed === '$$' || trimmed === '\\]') {
          const math = mathContent.join('\n');
          mathContent = [];
          inMathBlock = false;
          const html = renderKaTeX(math, true);
          blocks.push(
            <div
              key={`math-block-${i}`}
              className="my-3 p-3 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 text-center overflow-x-auto custom-scrollbar shadow-inner"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } else {
          mathContent.push(line);
        }
        continue;
      }

      // Code block fence ```
      if (trimmed.startsWith('```')) {
        flushTable(i);
        if (inCodeBlock) {
          const code = codeContent.join('\n');
          codeContent = [];
          inCodeBlock = false;
          const blockIdx = i;
          blocks.push(
            <div key={`code-${i}`} className="my-3 rounded-2xl bg-slate-950 border border-white/10 overflow-hidden shadow-xl">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-white/5 text-[11px] text-slate-400">
                <span className="font-mono text-cyan-400">{codeLanguage || 'code'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(code, blockIdx)}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  {copiedCodeIdx === blockIdx ? (
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
        } else {
          inCodeBlock = true;
          codeLanguage = trimmed.slice(3).trim();
          codeContent = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
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

    flushTable('end');
    return blocks;
  }, [content, copiedCodeIdx]);

  return (
    <div className={`space-y-1 font-sans selection:bg-indigo-600 selection:text-white ${className}`}>
      {renderedBlocks}
    </div>
  );
};
