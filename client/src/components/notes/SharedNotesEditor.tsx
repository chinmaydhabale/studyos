import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Download,
  Copy,
  Sparkles,
  Check,
  Code,
  Table,
  Sigma,
  BookOpen,
  Eye,
  Edit3
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { API_BASE_URL } from '../../config.js';

export const SharedNotesEditor: React.FC = () => {
  const { sharedNote, updateSharedNote, addToast } = useSocket();
  const [copied, setCopied] = useState(false);
  const [activeMode, setActiveMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [isAiExpanding, setIsAiExpanding] = useState(false);

  const content = sharedNote?.content || '';

  // Mirror the latest note content so async actions (AI summary, templates) append
  // to the freshest value instead of the one captured at render time.
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateSharedNote(e.target.value);
  };

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(contentRef.current);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addToast('Notes Copied', 'Collaborative notes copied to clipboard.', 'success');
    } catch (e) {
      console.error(e);
      addToast('Copy Failed', 'Could not copy notes to clipboard. Please copy manually.', 'alert');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([contentRef.current], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `StudyOS-Notes-${sharedNote?.title || 'SharedNotes'}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    addToast('Notes Downloaded', 'Exported notes as Markdown file.', 'success');
  };

  const handleInsertTemplate = (type: 'math' | 'code' | 'table') => {
    let snippet = '';
    if (type === 'math') {
      snippet = '\n\n$$\\text{CI} - \\text{SI} = P \\left(\\frac{R}{100}\\right)^2$$\nWhere $P$ is principal and $R$ is annual rate for 2 years.\n';
    } else if (type === 'code') {
      snippet = '\n\n```python\n# Speed Math LCM Method for Time & Work\ndef time_and_work(a_days, b_days):\n    import math\n    lcm = math.lcm(a_days, b_days)\n    eff_a = lcm / a_days\n    eff_b = lcm / b_days\n    return lcm / (eff_a + eff_b)\n```\n';
    } else if (type === 'table') {
      snippet = '\n\n| Topic | Short Trick / Formula | Exam Notes |\n| :--- | :--- | :--- |\n| 2-Year Diff (CI - SI) | $D = P (R/100)^2$ | Direct IBPS PO Short Trick |\n| 3-Year Diff (CI - SI) | $D = P (R/100)^2 \\times (3 + R/100)$ | High Frequency in Mains |\n| Relative Speed (Opposite) | $S_{rel} = S_1 + S_2$ | Trains & Boats |\n';
    }
    updateSharedNote(contentRef.current + snippet);
  };

  const handleAiSummarize = async () => {
    setIsAiExpanding(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/handwritten-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'Quantitative Aptitude & Reasoning Ability Golden Shortcuts' })
      });
      if (!res.ok) {
        throw new Error(`AI request failed with status ${res.status}`);
      }
      const data = await res.json();
      const firstSection = data?.sections?.[0];

      const summaryMarkdown = `\n\n---
### 🤖 AI Study Coach Summary & Golden Formulas:
- **Core Shortcut:** ${firstSection?.notes?.join(' ') || 'Always simplify ratio and percentage fractions (1/8 = 12.5%, 1/7 = 14.28%).'}
- **Exam Warning:** ${firstSection?.highlight || 'Avoid long algebraic equations in prelims; apply digital root or unit digit elimination.'}
- **Speed Math Formulas:**
  - Compound Interest: $A = P (1 + R/100)^T$
  - 2-Year CI vs SI Difference: $\\Delta = P (R/100)^2$
  - Work Done: $\\text{Total Work} = \\text{LCM}(\\text{Individual Days})$
`;
      updateSharedNote(contentRef.current + summaryMarkdown);
      addToast('AI Summary Added', 'AI Teacher injected formula synthesis directly into notes!', 'success');
    } catch (e) {
      console.error(e);
      addToast('AI Summary Failed', 'Could not generate the AI summary. Please try again.', 'alert');
    } finally {
      setIsAiExpanding(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)]">
      
      {/* Top Header & Toolbar */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-3 mb-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span>{sharedNote?.title || 'Study Room Collaborative Notes'}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Live Auto-Saving
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Last modified by: <span className="text-cyan-300 font-medium">{sharedNote?.lastModifiedBy || 'You'}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          
          {/* Mode switch */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setActiveMode('split')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                activeMode === 'split' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Split View
            </button>
            <button
              onClick={() => setActiveMode('edit')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                activeMode === 'edit' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5 inline mr-1" />
              Editor
            </button>
            <button
              onClick={() => setActiveMode('preview')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                activeMode === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5 inline mr-1" />
              Preview
            </button>
          </div>

          {/* Quick Insert Templates */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => handleInsertTemplate('math')}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs flex items-center gap-1 border border-white/5"
              title="Insert Math LaTeX Equation"
            >
              <Sigma className="w-3.5 h-3.5 text-cyan-400" />
              <span>Math</span>
            </button>
            <button
              onClick={() => handleInsertTemplate('code')}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs flex items-center gap-1 border border-white/5"
              title="Insert Code Block"
            >
              <Code className="w-3.5 h-3.5 text-emerald-400" />
              <span>Code</span>
            </button>
            <button
              onClick={() => handleInsertTemplate('table')}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs flex items-center gap-1 border border-white/5"
              title="Insert Table"
            >
              <Table className="w-3.5 h-3.5 text-amber-400" />
              <span>Table</span>
            </button>
          </div>

          {/* AI Helper Button */}
          <button
            onClick={handleAiSummarize}
            disabled={isAiExpanding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
            <span>{isAiExpanding ? 'Synthesizing...' : 'AI Summarize'}</span>
          </button>

          {/* Copy & Download */}
          <button
            onClick={handleCopy}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-colors"
            title="Copy Markdown"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition-colors"
            title="Download .md file"
          >
            <Download className="w-4 h-4" />
          </button>

        </div>

      </div>

      {/* Editor & Preview Split Stage */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 overflow-hidden">
        
        {/* Editor Pane */}
        {(activeMode === 'split' || activeMode === 'edit') && (
          <div className="flex-1 flex flex-col bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="px-4 py-2 border-b border-white/10 bg-slate-950/60 text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Markdown & LaTeX Input</span>
              <span className="text-[10px] text-indigo-400">Supports KaTeX Math ($$formula$$)</span>
            </div>
            <textarea
              value={content}
              onChange={handleChange}
              placeholder="# Start writing collaborative notes with your study partner..."
              className="flex-1 w-full p-4 bg-transparent text-slate-100 text-xs md:text-sm font-mono leading-relaxed resize-none focus:outline-none placeholder:text-slate-600"
            />
          </div>
        )}

        {/* Live Formatted Preview Pane */}
        {(activeMode === 'split' || activeMode === 'preview') && (
          <div className="flex-1 flex flex-col bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="px-4 py-2 border-b border-white/10 bg-slate-950/60 text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Live Formatted Preview</span>
              <span className="text-[10px] text-emerald-400">Synchronized View</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 text-slate-200 text-xs md:text-sm leading-relaxed space-y-3 prose prose-invert max-w-none">
              <div className="whitespace-pre-wrap font-sans">
                {content}
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
