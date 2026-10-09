import React, { useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Copy, Check, Sparkles, Lightbulb, AlertTriangle } from 'lucide-react';

interface FormattedAiMessageProps {
  content: string;
  className?: string;
}

/** Guarded clipboard copy with a legacy execCommand fallback for insecure/old contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
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
    const data = (envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)
      ? envelope.data
      : envelope) as Record<string, unknown>;

    const answer = [
      data.explanation,
      data.content,
      data.solution_breakdown,
      data.answer,
      data.markdown,
      data.text,
      data.solution
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);

    const coachMessage = typeof data.coach_message === 'string' ? data.coach_message.trim() : '';

    if (!answer && !coachMessage) return current;

    const parts: string[] = [];
    if (coachMessage) parts.push(coachMessage);

    const heading = typeof data.heading === 'string' ? data.heading.trim() : '';
    if (heading && answer && !answer.includes(heading)) {
      parts.push(`# ${heading}`);
    }

    if (answer) parts.push(answer.trim());

    const formula = typeof data.formula === 'string' ? data.formula.trim() : '';
    if (formula && answer && !answer.includes(formula)) {
      parts.push(`$$\n${formula}\n$$`);
    }

    const keyPoints = Array.isArray(data.keyPoints)
      ? data.keyPoints
      : Array.isArray(data.key_points)
      ? data.key_points
      : null;
    if (keyPoints && keyPoints.length > 0) {
      const validPoints = keyPoints.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
      if (validPoints.length > 0) {
        parts.push(`### Key Points to Remember\n${validPoints.map(p => `- ${p.trim()}`).join('\n')}`);
      }
    }

    const followUp =
      typeof data.followUp === 'string'
        ? data.followUp.trim()
        : typeof data.follow_up === 'string'
        ? data.follow_up.trim()
        : '';
    if (followUp && answer && !answer.includes(followUp)) {
      parts.push(`> 💡 **Follow-up Challenge:** ${followUp}`);
    }

    current = parts.filter(Boolean).join('\n\n');
  }

  return current;
}

/**
 * Normalizes AI output into clean Markdown for the AST pipeline:
 * - unwraps transport envelopes and raw JSON responses
 * - converts literal escaped newlines/tabs into real ones, while preserving KaTeX commands (\neq, \nu, \theta, \times, etc.)
 * - rewrites LaTeX-style \[...\] and \(...\) delimiters to $$...$$ / $...$ for remark-math
 */
function normalizeForMarkdown(content: string): string {
  let s = unwrapAiResponseEnvelope(content);
  s = s
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n(?!(?:eq|abla|atural|earrow|eg|cong|equiv|e\b|ew|exists|geq|geqq|gtr|i\b|Leftarrow|leftarrow|Leftrightarrow|leftrightarrow|leq|leqq|less|mid|obreak|ormalsize|otin|ot\b|parallel|prec|preceq|Rightarrow|rightarrow|shortmid|shortparallel|sim|subseteq|succ|succeq|supseteq|triangleleft|trianglelefteq|triangleright|trianglerighteq|u\b|VDash|Vdash|vDash|vdash)\b)/g, '\n')
    .replace(/\\r(?!(?:angle|brace|ceil|floor|group|ight|ho|m\b|oot|ule)\b)/g, '\n')
    .replace(/\\t(?!(?:au|ext|an|heta|imes|o\b|op|riangle|ilde|ag)\b)/g, '  ');
  s = s
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner) => `\n\n$$${String(inner).trim()}$$\n\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner) => `$${String(inner).trim()}$`);
  return s;
}

/** Collects visible text from a hast node (used to detect callout/step cards). */
function hastText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return typeof node.value === 'string' ? node.value : '';
  if (Array.isArray(node.children)) return node.children.map(hastText).join('');
  return '';
}

/** Styled fenced-code block with a guarded copy button; used for all block code. */
const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (await copyText(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <div className="my-3 rounded-2xl bg-slate-950 border border-white/10 overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-white/5 text-[11px] text-slate-400">
        <span className="font-mono text-cyan-400">{language || 'code'}</span>
        <button type="button" onClick={onCopy} className="flex items-center gap-1 hover:text-white transition-colors">
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
      <pre className="p-3 text-xs font-mono text-cyan-200 overflow-x-auto custom-scrollbar leading-relaxed">{code}</pre>
    </div>
  );
};

type CalloutKind = 'tip' | 'trap' | null;

function detectCallout(text: string): CalloutKind {
  const t = text.trim().toLowerCase();
  if (t.startsWith('💡') || t.startsWith('shortcut:') || t.startsWith('tip:') || t.startsWith('pro tip:')) return 'tip';
  if (t.startsWith('⚠️') || t.startsWith('trap:') || t.startsWith('caution:') || t.startsWith('common mistake:')) return 'trap';
  return null;
}

function isStepLine(text: string): boolean {
  return /^\s*Step\s+\d+[:.]?/i.test(text.trim());
}

/** Removes a leading emoji marker from the first string child, keeping inline formatting. */
function stripLeadingEmoji(children: React.ReactNode, re: RegExp): React.ReactNode {
  const arr = React.Children.toArray(children);
  if (arr.length > 0 && typeof arr[0] === 'string') {
    arr[0] = arr[0].replace(re, '');
  }
  return arr;
}

export const FormattedAiMessage: React.FC<FormattedAiMessageProps> = ({ content, className = '' }) => {
  const normalized = useMemo(() => (content ? normalizeForMarkdown(content) : ''), [content]);

  const components = useMemo<Components>(
    () => ({
      h1: ({ children }) => (
        <h1 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-cyan-300 mt-5 mb-2.5">
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="text-base font-extrabold text-white mt-4 mb-2 pb-1 border-b border-white/10 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{children}</span>
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-sm font-bold text-cyan-300 mt-3.5 mb-1.5 flex items-center gap-2">
          <span className="w-1.5 h-3.5 bg-cyan-400 rounded-full" />
          <span>{children}</span>
        </h3>
      ),
      p: ({ node, children }) => {
        const text = hastText(node);
        const callout = detectCallout(text);
        if (callout === 'tip') {
          return (
            <div className="my-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-500/30 text-amber-100 flex items-start gap-2.5 shadow-md">
              <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed flex-1">{stripLeadingEmoji(children, /^[💡\s]+/)}</div>
            </div>
          );
        }
        if (callout === 'trap') {
          return (
            <div className="my-3 p-3.5 rounded-2xl bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/30 text-rose-100 flex items-start gap-2.5 shadow-md">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed flex-1">{stripLeadingEmoji(children, /^[⚠️\s]+/)}</div>
            </div>
          );
        }
        if (isStepLine(text)) {
          return (
            <div className="my-2 p-3 rounded-2xl bg-slate-900/90 border-l-4 border-indigo-500 border-t border-r border-b border-white/10 shadow-sm">
              <div className="text-xs text-slate-200 leading-relaxed font-medium">{children}</div>
            </div>
          );
        }
        return <p className="text-xs leading-relaxed text-slate-200 my-1">{children}</p>;
      },
      strong: ({ children }) => <strong className="font-bold text-white tracking-wide">{children}</strong>,
      em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
      a: ({ children, href }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
        >
          {children}
        </a>
      ),
      hr: () => <hr className="border-white/10 my-3" />,
      blockquote: ({ children }) => (
        <blockquote className="my-3 pl-3 border-l-4 border-indigo-500/50 text-slate-300 italic">{children}</blockquote>
      ),
      ul: ({ children }) => <ul className="my-1.5 pl-5 list-disc marker:text-cyan-400 space-y-1">{children}</ul>,
      ol: ({ children }) => (
        <ol className="my-1.5 pl-5 list-decimal marker:text-indigo-300 marker:font-bold space-y-1">{children}</ol>
      ),
      li: ({ children }) => <li className="text-xs text-slate-200 leading-relaxed pl-1">{children}</li>,
      code: ({ className: cls, children }) => {
        const match = /language-(\w+)/.exec(cls || '');
        const raw = String(children ?? '');
        const isBlock = Boolean(match) || raw.includes('\n');
        if (!isBlock) {
          return (
            <code className="px-1.5 py-0.5 rounded-md bg-slate-800 text-cyan-300 font-mono text-[11px] border border-white/10">
              {children}
            </code>
          );
        }
        return <CodeBlock code={raw.replace(/\n$/, '')} language={match?.[1]} />;
      },
      pre: ({ children }) => <>{children}</>,
      table: ({ children }) => (
        <div className="my-3 overflow-x-auto rounded-xl border border-white/10 bg-slate-950/70 shadow-md">
          <table className="w-full text-left text-xs border-collapse">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="p-2.5 px-3 bg-slate-900 text-cyan-300 font-semibold border-b border-white/10">{children}</th>
      ),
      td: ({ children }) => <td className="p-2.5 px-3 text-slate-200 border-t border-white/5">{children}</td>,
    }),
    []
  );

  if (!normalized) return null;

  return (
    <div className={`space-y-1 font-sans selection:bg-indigo-600 selection:text-white break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, errorColor: '#fca5a5' }]]}
        components={components}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
};
