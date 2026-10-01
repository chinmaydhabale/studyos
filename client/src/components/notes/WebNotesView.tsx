import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  ExternalLink,
  BookOpen,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Maximize2,
  Minimize2,
  PenTool,
  Copy,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Send,
  HelpCircle,
  FileText,
  Volume2
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { API_BASE_URL } from '../../config.js';
import { VoiceChatPanel } from '../voice-chat/VoiceChatPanel.js';

interface PlatformPreset {
  id: string;
  name: string;
  url: string;
  color: string;
  tag: string;
}

const NOTE_PLATFORMS: PlatformPreset[] = [
  { id: 'affairscloud', name: 'AffairsCloud', url: 'https://affairscloud.com/current-affairs/', color: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30', tag: 'Daily Current Affairs & GK' },
  { id: 'thehindu_ed', name: 'The Hindu Editorial', url: 'https://www.thehindu.com/opinion/editorial/', color: 'bg-amber-600/20 text-amber-400 border-amber-500/30', tag: 'English Vocab & RC' },
  { id: 'bankersadda_ca', name: 'Bankersadda GK', url: 'https://www.bankersadda.com/current-affairs/', color: 'bg-rose-600/20 text-rose-400 border-rose-500/30', tag: 'Daily Hindu Capsule' },
  { id: 'pib_india', name: 'PIB India News', url: 'https://pib.gov.in/', color: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30', tag: 'Govt Schemes & Releases' },
  { id: 'oliveboard_ca', name: 'Oliveboard CA', url: 'https://www.oliveboard.in/current-affairs/', color: 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30', tag: 'Monthly Bolt Capsule' },
  { id: 'drishti_ias', name: 'Drishti IAS', url: 'https://www.drishtiias.com/eng', color: 'bg-violet-600/20 text-violet-400 border-violet-500/30', tag: 'In-Depth Analysis' },
  { id: 'vikaspedia', name: 'Vikaspedia', url: 'https://vikaspedia.in/', color: 'bg-teal-600/20 text-teal-400 border-teal-500/30', tag: 'Social & Rural Schemes' },
  { id: 'wikipedia_events', name: 'Wiki Current Events', url: 'https://en.wikipedia.org/wiki/Portal:Current_events', color: 'bg-blue-600/20 text-blue-400 border-blue-500/30', tag: 'Static & Global GK' }
];

interface WebNotesViewProps {
  onAskAiDoubt?: (prompt: string) => void;
}

export const WebNotesView: React.FC<WebNotesViewProps> = ({ onAskAiDoubt }) => {
  const { addToast } = useSocket();

  const [currentUrl, setCurrentUrl] = useState<string>(NOTE_PLATFORMS[0].url);
  const [urlInputValue, setUrlInputValue] = useState<string>(NOTE_PLATFORMS[0].url);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(NOTE_PLATFORMS[0].id);

  // Side-by-side workspace & live chat
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'notes' | 'ai'>('chat');

  // Scratch Notes
  const [scratchNotes, setScratchNotes] = useState<string>(() => {
    return localStorage.getItem('studyos_web_scratch_notes') || '';
  });

  // AI Doubt helper input inside sidebar
  const [quickAiDoubt, setQuickAiDoubt] = useState<string>('');

  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Save scratch notes to localStorage
  const handleScratchChange = (text: string) => {
    setScratchNotes(text);
    localStorage.setItem('studyos_web_scratch_notes', text);
  };

  const handleSelectPreset = (preset: PlatformPreset) => {
    setSelectedPresetId(preset.id);
    setCurrentUrl(preset.url);
    setUrlInputValue(preset.url);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let url = urlInputValue.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    setCurrentUrl(url);
    setSelectedPresetId('custom');
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
      addToast('URL Copied', 'Article link copied to clipboard.', 'success');
    } catch (e) {
      addToast('Copy Failed', 'Unable to copy URL to clipboard.', 'alert');
    }
  };

  const handleOpenCompanionWindow = () => {
    window.open(currentUrl, 'studyos_notes_popup', 'width=1280,height=800,menubar=no,toolbar=no,location=yes');
    addToast(
      'Companion Window Opened',
      'Article launched in a secondary window. You can keep reading notes and chat with friends right here!',
      'info'
    );
  };

  const handleAskQuickAi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAiDoubt.trim()) return;
    if (onAskAiDoubt) {
      onAskAiDoubt(`While reading notes from ${currentUrl}, I have this doubt: "${quickAiDoubt.trim()}". Please explain clearly with banking/exam context.`);
    }
    setQuickAiDoubt('');
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* 1. TOP TOOLBAR: Quick Study Presets & URL Navigation */}
      <div className="border-b border-white/10 bg-slate-900/90 px-4 py-2.5 flex flex-col gap-2">
        {/* Row 1: Presets & Chat Toggle Action */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>Notes Portals:</span>
            </span>
            {NOTE_PLATFORMS.map(preset => {
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all ${
                    isSelected
                      ? `${preset.color} ring-2 ring-white/20 shadow-md font-bold scale-[1.02]`
                      : 'bg-slate-950/60 text-slate-400 border-white/5 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>{preset.name}</span>
                  <span className="text-[9px] opacity-75 px-1 py-0.5 rounded bg-black/30 font-normal">
                    {preset.tag}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle Room Chat Sidebar */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-md ${
                isSidebarOpen
                  ? 'bg-indigo-600 text-white border-indigo-400/50 shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-300 border-white/10 hover:text-white hover:bg-slate-700'
              }`}
              title={isSidebarOpen ? 'Hide Chat Sidebar (Full Width Reading)' : 'Show Live Room Chat & Notes Sidebar'}
            >
              <MessageSquare className="w-3.5 h-3.5 text-cyan-300" />
              <span className="hidden sm:inline">{isSidebarOpen ? 'Sidebar Open' : 'Open Room Chat'}</span>
              {isSidebarOpen ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Row 2: URL Input Bar & Dual Window Launcher */}
        <form onSubmit={handleUrlSubmit} className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus-within:border-cyan-500/50 transition-colors">
            <Globe className="w-3.5 h-3.5 text-cyan-400 mr-2 shrink-0" />
            <input
              type="text"
              value={urlInputValue}
              onChange={e => setUrlInputValue(e.target.value)}
              placeholder="Enter any notes, newspaper editorial, or study portal URL (e.g. affairscloud.com, thehindu.com)..."
              className="w-full bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none font-mono text-xs"
            />
          </div>

          <button
            type="submit"
            className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-sm transition-colors"
          >
            Go
          </button>

          <button
            type="button"
            onClick={handleOpenCompanionWindow}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-colors whitespace-nowrap"
            title="Open portal in a secondary companion window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Companion Window ↗</span>
          </button>
        </form>
      </div>

      {/* 2. MAIN BODY: Website Notes Reader (Left) + Integrated Live Chat & Sidekick (Right) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left: Web Embed Frame */}
        <div className={`flex flex-col h-full overflow-hidden transition-all duration-200 ${isSidebarOpen ? 'flex-1' : 'w-full'}`}>
          <div className="flex-1 relative bg-slate-950">
            <iframe
              ref={iframeRef}
              src={`${API_BASE_URL}/api/proxy/web?url=${encodeURIComponent(currentUrl)}`}
              className="w-full h-full border-none bg-white"
              title="Study Notes Portal Frame"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>

          {/* Bottom Frame Utility Bar */}
          <div className="bg-slate-900 border-t border-white/10 px-3.5 py-1.5 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
              <span className="truncate max-w-sm sm:max-w-md font-mono text-[11px] text-slate-300">
                {currentUrl}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-[11px]"
                title="Copy Article URL"
              >
                {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span className="hidden sm:inline">{copiedUrl ? 'Copied' : 'Copy Link'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (iframeRef.current) {
                    iframeRef.current.src = `${API_BASE_URL}/api/proxy/web?url=${encodeURIComponent(currentUrl)}&t=${Date.now()}`;
                  }
                }}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Reload Website"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleOpenCompanionWindow}
                className="flex items-center gap-1 hover:text-indigo-400 transition-colors text-[11px]"
                title="Open in new browser tab"
              >
                <span>Open in Tab</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Side-by-Side Live Room Chat & Notes Sidebar */}
        {isSidebarOpen && (
          <div className="w-full lg:w-96 shrink-0 h-full border-t lg:border-t-0 lg:border-l border-white/10 bg-slate-950/95 backdrop-blur-md flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Sidebar Navigation Tabs */}
            <div className="p-2 border-b border-white/10 bg-slate-900/60 flex items-center justify-between">
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-white/10 text-xs w-full">
                <button
                  type="button"
                  onClick={() => setSidebarTab('chat')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-bold transition-all ${
                    sidebarTab === 'chat'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Room Chat</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSidebarTab('notes')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-bold transition-all ${
                    sidebarTab === 'notes'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Vocab & Notes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSidebarTab('ai')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-bold transition-all ${
                    sidebarTab === 'ai'
                      ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Doubts</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="ml-2 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Collapse sidebar for full-width reading"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>

            {/* Sidebar Tab 1: Real-time Live Voice & Room Chat */}
            {sidebarTab === 'chat' && (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <VoiceChatPanel
                  mode="general"
                  title="Web Notes Discussion"
                  onClose={() => setIsSidebarOpen(false)}
                />
              </div>
            )}

            {/* Sidebar Tab 2: Editorial Vocab Pad & Scratch Notes */}
            {sidebarTab === 'notes' && (
              <div className="flex-1 flex flex-col p-3 gap-2 overflow-hidden">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-white/5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Editorial Vocabulary & Facts Pad</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-semibold">Auto-saved</span>
                </div>

                <p className="text-[11px] text-slate-400">
                  Jot down tricky English words, synonyms, antonyms, or daily GK facts while reading the website on the left.
                </p>

                <textarea
                  value={scratchNotes}
                  onChange={e => handleScratchChange(e.target.value)}
                  placeholder="e.g.&#10;1. Inexorable = impossible to stop or prevent&#10;2. RBI Repo Rate kept unchanged at 6.5%&#10;3. Headline CPI Inflation eased to 3.65%..."
                  className="flex-1 w-full bg-slate-900 border border-white/10 rounded-2xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono resize-none leading-relaxed"
                />

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onAskAiDoubt && scratchNotes.trim()) {
                        onAskAiDoubt(`Please organize and make a revision flashcard deck out of these editorial notes:\n\n${scratchNotes}`);
                      }
                    }}
                    disabled={!scratchNotes.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all disabled:opacity-30"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate AI Flashcards from Notes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(scratchNotes);
                      addToast('Notes Copied', 'All scratch notes copied to clipboard.', 'success');
                    }}
                    disabled={!scratchNotes.trim()}
                    className="p-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-white/10 text-xs disabled:opacity-30"
                    title="Copy all notes"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Sidebar Tab 3: AI Study Coach Doubt Solver */}
            {sidebarTab === 'ai' && (
              <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
                <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900 to-cyan-950/40 border border-cyan-500/20 rounded-2xl p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-cyan-300">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>AI Reading Companion</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Stuck on an editorial sentence, economic term, or confusing GK scheme while reading? Paste it below to ask your AI Study Coach!
                  </p>
                </div>

                <form onSubmit={handleAskQuickAi} className="flex flex-col gap-2.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Your Question or Confusing Passage:</span>
                  </label>

                  <textarea
                    value={quickAiDoubt}
                    onChange={e => setQuickAiDoubt(e.target.value)}
                    placeholder="e.g. Explain this editorial phrase: 'The monetary policy committee maintained a neutral stance amid volatile food prices'..."
                    rows={4}
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none leading-relaxed"
                  />

                  <button
                    type="submit"
                    disabled={!quickAiDoubt.trim()}
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Ask AI Teacher →</span>
                  </button>
                </form>

                <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-3 flex flex-col gap-2 text-xs text-slate-400">
                  <span className="font-bold text-slate-300">💡 Quick Prompts:</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (onAskAiDoubt) {
                        onAskAiDoubt(`Explain the key vocabulary, tone, and main idea of the current editorial at: ${currentUrl}`);
                      }
                    }}
                    className="text-left p-2 rounded-xl bg-slate-950/60 hover:bg-slate-950 border border-white/5 hover:border-cyan-500/30 transition-colors text-slate-300 hover:text-cyan-300"
                  >
                    📖 "Analyze key vocabulary & tone of this editorial"
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onAskAiDoubt) {
                        onAskAiDoubt(`Summarize the top current affairs news points from: ${currentUrl} in 5 bullet points with expected exam questions.`);
                      }
                    }}
                    className="text-left p-2 rounded-xl bg-slate-950/60 hover:bg-slate-950 border border-white/5 hover:border-cyan-500/30 transition-colors text-slate-300 hover:text-cyan-300"
                  >
                    🎯 "Summarize top 5 exam points from this article"
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Chat Summon Button when sidebar is collapsed */}
      {!isSidebarOpen && (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-2xl shadow-indigo-600/50 border border-indigo-400/30 hover:scale-105 active:scale-95 transition-all"
          title="Open Live Room Chat & Notes Sidebar"
        >
          <MessageSquare className="w-4 h-4 text-cyan-300" />
          <span>Room Chat & Notes</span>
        </button>
      )}
    </div>
  );
};
