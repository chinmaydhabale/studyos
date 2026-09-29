import React, { useState, useEffect, useRef } from 'react';
import {
  MonitorPlay,
  Cast,
  Laptop,
  Globe,
  ExternalLink,
  FileText,
  Clock,
  Eye,
  Share2,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Radio,
  Tv,
  Trophy,
  Shield,
  ShieldAlert,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  BookOpen,
  Volume2,
  VolumeX,
  Flame,
  Award,
  PenTool,
  Send,
  MessageSquare
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { API_BASE_URL } from '../../config.js';
import { useScreenShare } from '../../hooks/useScreenShare.js';
import { MockTimer } from './MockTimer.js';
import { MockScoreModal } from './MockScoreModal.js';
import { MockTestRecord } from '../../types.js';

interface PlatformPreset {
  id: string;
  name: string;
  url: string;
  category: 'mock' | 'notes';
  color: string;
  tag: string;
}

const MOCK_PLATFORMS: PlatformPreset[] = [
  { id: 'guidely', name: 'Guidely', url: 'https://guidely.in/mock-test', category: 'mock', color: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30', tag: 'Top Banking PO' },
  { id: 'testbook', name: 'Testbook', url: 'https://testbook.com/test-series', category: 'mock', color: 'bg-sky-600/20 text-sky-400 border-sky-500/30', tag: 'Mega Test Series' },
  { id: 'oliveboard', name: 'Oliveboard', url: 'https://www.oliveboard.in/mock-tests/', category: 'mock', color: 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30', tag: 'High-Level Mains' },
  { id: 'practicemock', name: 'PracticeMock', url: 'https://www.practicemock.com/', category: 'mock', color: 'bg-amber-600/20 text-amber-400 border-amber-500/30', tag: 'Exact Exam Interface' },
  { id: 'adda247', name: 'Adda247', url: 'https://www.adda247.com/mock-test', category: 'mock', color: 'bg-rose-600/20 text-rose-400 border-rose-500/30', tag: 'Speed & Quizzes' },
  { id: 'smartkeeda', name: 'Smartkeeda', url: 'https://www.smartkeeda.com/', category: 'mock', color: 'bg-purple-600/20 text-purple-400 border-purple-500/30', tag: 'Puzzles & DI' }
];

const NOTE_PLATFORMS: PlatformPreset[] = [
  { id: 'affairscloud', name: 'AffairsCloud', url: 'https://affairscloud.com/current-affairs/', category: 'notes', color: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30', tag: 'Daily CA & Quizzes' },
  { id: 'bankersadda_ca', name: 'Bankersadda GK', url: 'https://www.bankersadda.com/current-affairs/', category: 'notes', color: 'bg-rose-600/20 text-rose-400 border-rose-500/30', tag: 'Daily Hindu Capsule' },
  { id: 'thehindu_ed', name: 'The Hindu Editorial', url: 'https://www.thehindu.com/opinion/editorial/', category: 'notes', color: 'bg-amber-600/20 text-amber-400 border-amber-500/30', tag: 'English Vocab & RC' },
  { id: 'pib_india', name: 'PIB India News', url: 'https://pib.gov.in/', category: 'notes', color: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30', tag: 'Govt Schemes' },
  { id: 'oliveboard_ca', name: 'Oliveboard CA', url: 'https://www.oliveboard.in/current-affairs/', category: 'notes', color: 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30', tag: 'Monthly Bolt Capsule' }
];

interface MockArenaViewProps {
  onAskAiDoubt?: (prompt: string) => void;
}

export const MockArenaView: React.FC<MockArenaViewProps> = ({ onAskAiDoubt }) => {
  const { socket, roomId, currentUser, addToast } = useSocket();

  // Screen Sharing Hook
  const {
    isSharing,
    isViewing,
    isPresenter,
    localStream,
    remoteStream,
    activeShare,
    viewerCount,
    startSharing,
    stopSharing,
    joinStream,
    leaveStream
  } = useScreenShare({
    socket,
    roomId,
    currentUserId: currentUser.id,
    currentUserName: currentUser.name || 'Student',
    currentUserAvatar: currentUser.avatar,
    onToast: addToast
  });

  // Navigation & View States
  const [activeSubTab, setActiveSubTab] = useState<'mock' | 'notes' | 'stream'>('mock');
  const [currentUrl, setCurrentUrl] = useState<string>(MOCK_PLATFORMS[0].url);
  const [urlInputValue, setUrlInputValue] = useState<string>(MOCK_PLATFORMS[0].url);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(MOCK_PLATFORMS[0].id);

  // Split View: Web on Left + Workspace on Right
  const [isSplitView, setIsSplitView] = useState<boolean>(true);
  const [rightWorkspaceTab, setRightWorkspaceTab] = useState<'timer' | 'notes' | 'history'>('timer');

  // Quick Scratch Notepad
  const [scratchNotes, setScratchNotes] = useState<string>(() => {
    return localStorage.getItem('studyos_mock_scratch_notes') || '';
  });

  // Mock Score Logger
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [mockRecords, setMockRecords] = useState<MockTestRecord[]>([]);

  // Video Element Ref for Viewer
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Auto-switch to Stream tab when a peer starts sharing
  useEffect(() => {
    if (activeShare && activeShare.isActive && activeShare.presenterId !== currentUser.id) {
      // Prompt user or switch tab
    }
  }, [activeShare, currentUser.id]);

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, activeSubTab]);

  // Attach local stream to preview element
  useEffect(() => {
    if (localPreviewVideoRef.current && localStream) {
      localPreviewVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isSharing]);

  // Save scratch notes to localStorage
  const handleScratchChange = (text: string) => {
    setScratchNotes(text);
    localStorage.setItem('studyos_mock_scratch_notes', text);
  };

  // Load user mock records
  const fetchMockRecords = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/mock/records?userId=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setMockRecords(data);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchMockRecords();
  }, [currentUser.id]);

  // Launch Portal
  const handleSelectPreset = (preset: PlatformPreset) => {
    setSelectedPresetId(preset.id);
    setCurrentUrl(preset.url);
    setUrlInputValue(preset.url);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let url = urlInputValue.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    setCurrentUrl(url);
    setSelectedPresetId('custom');
  };

  // Open in Dedicated Companion Dual Window
  const handleOpenDualWindow = () => {
    window.open(currentUrl, 'studyos_mock_popup', 'width=1280,height=800,menubar=no,toolbar=no,location=yes');
    addToast(
      'Dual Companion Window Launched',
      'Mock portal opened in separate window. You can now click "Share Screen" to stream it live to friends!',
      'info'
    );
  };

  // Handle Live Share Toggle (Strict User Control)
  const handleToggleScreenShare = async () => {
    if (isSharing) {
      stopSharing();
    } else {
      const currentPreset = MOCK_PLATFORMS.find(p => p.id === selectedPresetId) || NOTE_PLATFORMS.find(p => p.id === selectedPresetId);
      await startSharing({
        title: `Live Exam Mock - ${currentPreset?.name || 'Mock Portal'}`,
        platformName: currentPreset?.name || 'Mock Portal',
        streamType: activeSubTab === 'notes' ? 'notes' : 'mock'
      });
    }
  };

  // Get active stream presenter
  const isSomeoneElseStreaming = activeShare && activeShare.isActive && activeShare.presenterId !== currentUser.id;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Banner if someone else is actively streaming in the room */}
      {isSomeoneElseStreaming && (
        <div className="bg-gradient-to-r from-red-950/80 via-slate-900 to-indigo-950/80 border-b border-red-500/30 px-4 py-2 flex items-center justify-between flex-wrap gap-2 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-red-300">{activeShare.presenterName}</span>
              <span className="text-slate-300">is LIVE giving a mock test on</span>
              <span className="font-semibold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                {activeShare.platformName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeSubTab === 'stream' && isViewing ? (
              <button
                onClick={leaveStream}
                className="px-3 py-1 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white border border-white/10"
              >
                Leave Stream
              </button>
            ) : (
              <button
                onClick={() => {
                  setActiveSubTab('stream');
                  joinStream();
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md shadow-red-600/30 active:scale-95 transition-all"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Watch Stream Live</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Sub-Navbar & Arena Controls */}
      <div className="border-b border-white/10 bg-slate-900/90 px-4 py-2.5 flex items-center justify-between flex-wrap gap-3">
        {/* Left: Mode Picker */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-2xl border border-white/10 text-xs">
          <button
            onClick={() => setActiveSubTab('mock')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeSubTab === 'mock'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Mock Test Arena</span>
          </button>

          <button
            onClick={() => setActiveSubTab('notes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all ${
              activeSubTab === 'notes'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Web Notes & Editorials</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('stream');
              if (isSomeoneElseStreaming && !isViewing) {
                joinStream();
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all relative ${
              activeSubTab === 'stream'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>Room Live Stream</span>
            {isSomeoneElseStreaming && (
              <span className="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
            )}
          </button>
        </div>

        {/* Right: Explicit User Screen Share Control + Actions */}
        <div className="flex items-center gap-2">
          {/* Live Share Toggle: Strict User Control */}
          <button
            onClick={handleToggleScreenShare}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 shadow-lg ${
              isSharing
                ? 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-red-600/30 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-white/10 hover:border-white/20'
            }`}
            title={isSharing ? 'Stop streaming and make screen private' : 'Broadcast your mock test screen to friends in this room'}
          >
            {isSharing ? (
              <>
                <Radio className="w-3.5 h-3.5 text-white animate-spin" />
                <span>Stop Sharing ({viewerCount} Watching)</span>
              </>
            ) : (
              <>
                <Cast className="w-3.5 h-3.5 text-amber-400" />
                <span>Share Screen with Friends (OFF)</span>
              </>
            )}
          </button>

          {/* Record Scorecard Button */}
          <button
            onClick={() => setIsScoreModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-colors"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Record Score</span>
          </button>

          {/* Split Mode Toggle */}
          <button
            onClick={() => setIsSplitView(!isSplitView)}
            className={`p-1.5 rounded-xl border text-xs font-medium transition-colors ${
              isSplitView
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-400 border-white/10 hover:text-white'
            }`}
            title="Toggle Split View (Web + StudyOS Sidekick)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Platform Presets & Custom URL Bar */}
      {activeSubTab !== 'stream' && (
        <div className="px-4 py-2 border-b border-white/5 bg-slate-900/50 flex flex-col gap-2">
          {/* Quick Presets Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
              {activeSubTab === 'mock' ? 'Mock Portals:' : 'Study Sources:'}
            </span>
            {(activeSubTab === 'mock' ? MOCK_PLATFORMS : NOTE_PLATFORMS).map(preset => {
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
                  <span className="text-[9px] opacity-70 px-1 py-0.2 rounded bg-black/30">
                    {preset.tag}
                  </span>
                </button>
              );
            })}
          </div>

          {/* URL Search & Dual Launch Bar */}
          <form onSubmit={handleUrlSubmit} className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200">
              <Globe className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                value={urlInputValue}
                onChange={e => setUrlInputValue(e.target.value)}
                placeholder="Enter any mock test portal or web notes article URL..."
                className="w-full bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-white/10 transition-colors"
            >
              Go
            </button>

            {/* Launch Dual Companion Window */}
            <button
              type="button"
              onClick={handleOpenDualWindow}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-colors whitespace-nowrap"
              title="Open full portal in a dedicated companion window (best for official mock logins)"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Launch Companion Window ↗</span>
            </button>
          </form>
        </div>
      )}

      {/* Main Body Workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Stream Viewer Mode */}
        {activeSubTab === 'stream' ? (
          <div className="flex-1 flex flex-col h-full bg-black p-3 overflow-hidden">
            {isViewing && remoteStream ? (
              <div className="flex-1 flex flex-col relative rounded-2xl overflow-hidden bg-slate-950 border border-white/10 shadow-2xl">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  controls
                  className="w-full h-full object-contain bg-black"
                />
                <div className="absolute top-3 left-3 bg-red-600/90 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-md">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                  <span>LIVE: {activeShare?.presenterName} ({activeShare?.platformName})</span>
                </div>
              </div>
            ) : isSharing && localStream ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="max-w-md w-full bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                    <Radio className="w-8 h-8 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">You are Live Streaming</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Friends in this study room can watch your mock test in real-time.
                    </p>
                  </div>

                  {/* Local Stream Thumbnail Preview */}
                  <div className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/10 relative">
                    <video
                      ref={localPreviewVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 bg-black/80 px-2 py-0.5 rounded text-[10px] text-slate-300">
                      Live Preview ({viewerCount} watching)
                    </div>
                  </div>

                  <button
                    onClick={stopSharing}
                    className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-600/30 transition-all active:scale-95"
                  >
                    Stop Sharing (Make Private)
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <Tv className="w-16 h-16 mb-4 text-slate-600" />
                <h3 className="text-lg font-bold text-white">No Active Stream in this Room</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
                  When a study peer starts sharing their Guidely, Testbook, or Oliveboard mock test, it will appear here in real-time.
                </p>
                <button
                  onClick={handleToggleScreenShare}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg transition-all"
                >
                  <Cast className="w-4 h-4" />
                  <span>Start Sharing Your Screen Instead</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Normal Web Embed Mode */
          <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
            {/* Left Portion: Web Embed Frame */}
            <div className={`flex flex-col h-full overflow-hidden ${isSplitView ? 'flex-1' : 'w-full'}`}>
              <div className="flex-1 relative bg-slate-950">
                <iframe
                  ref={iframeRef}
                  src={`${API_BASE_URL}/api/proxy/web?url=${encodeURIComponent(currentUrl)}`}
                  className="w-full h-full border-none bg-white"
                  title="Study Portal Frame"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
              </div>

              {/* Bottom Frame Utility Bar */}
              <div className="bg-slate-900 border-t border-white/10 px-3 py-1.5 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="truncate max-w-md font-mono text-[11px] text-slate-300">
                    {currentUrl}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (iframeRef.current) {
                        iframeRef.current.src = `${API_BASE_URL}/api/proxy/web?url=${encodeURIComponent(currentUrl)}&t=${Date.now()}`;
                      }
                    }}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    title="Reload Frame"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={handleOpenDualWindow}
                    className="flex items-center gap-1 hover:text-indigo-400 transition-colors"
                  >
                    <span>Open in Window</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right Portion: StudyOS Sidekick Workspace (Split View) */}
            {isSplitView && (
              <div className="w-full lg:w-96 flex flex-col bg-slate-900/95 border-t lg:border-t-0 lg:border-l border-white/10 overflow-hidden shadow-2xl">
                {/* Sidekick Header Tabs */}
                <div className="p-2 border-b border-white/10 bg-slate-950/60 flex items-center justify-between">
                  <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-white/10 text-xs w-full">
                    <button
                      onClick={() => setRightWorkspaceTab('timer')}
                      className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg font-medium transition-all ${
                        rightWorkspaceTab === 'timer'
                          ? 'bg-amber-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      <span>Exam Timer</span>
                    </button>

                    <button
                      onClick={() => setRightWorkspaceTab('notes')}
                      className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg font-medium transition-all ${
                        rightWorkspaceTab === 'notes'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <PenTool className="w-3 h-3" />
                      <span>Scratch Notes</span>
                    </button>

                    <button
                      onClick={() => setRightWorkspaceTab('history')}
                      className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-lg font-medium transition-all ${
                        rightWorkspaceTab === 'history'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Trophy className="w-3 h-3" />
                      <span>Score History</span>
                    </button>
                  </div>
                </div>

                {/* Sidekick Tab Content */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                  {/* Tab 1: Mock Sectional Timer */}
                  {rightWorkspaceTab === 'timer' && (
                    <div className="flex flex-col gap-3">
                      <MockTimer
                        onExamFinish={(secs, mode) => {
                          addToast('Exam Finished!', `Finished ${mode} test in ${Math.round(secs / 60)} minutes. Time to record your scorecard!`, 'success');
                          setIsScoreModalOpen(true);
                        }}
                      />

                      {/* Quick AI Doubt Solver Card */}
                      <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-indigo-400">
                          <Sparkles className="w-4 h-4" />
                          <span>AI Study Coach Shortcut</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Stuck on a tricky syllogism, seating puzzle, or arithmetic question from this mock?
                        </p>
                        <button
                          onClick={() => {
                            if (onAskAiDoubt) {
                              onAskAiDoubt(`Explain this mock test problem from ${selectedPresetId}: `);
                            }
                          }}
                          className="w-full py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-all text-center"
                        >
                          Ask AI Teacher Doubt Solver →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Scratch Notes & Speed Math Formula Pad */}
                  {rightWorkspaceTab === 'notes' && (
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Speed Formula & Vocab Pad</span>
                        <span className="text-[10px] text-emerald-400">Auto-saved</span>
                      </div>
                      <textarea
                        value={scratchNotes}
                        onChange={e => handleScratchChange(e.target.value)}
                        placeholder="Write down tricky puzzle conditions, speed math formulas (e.g. 1/7 = 14.28%), vocabulary words from Hindu editorial..."
                        className="flex-1 w-full bg-slate-950 border border-white/10 rounded-2xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono resize-none min-h-[300px]"
                      />
                    </div>
                  )}

                  {/* Tab 3: Score History */}
                  {rightWorkspaceTab === 'history' && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-white/5">
                        <span className="font-semibold">Recent Mock Attempts</span>
                        <button
                          onClick={() => setIsScoreModalOpen(true)}
                          className="text-[11px] text-amber-400 hover:underline font-bold"
                        >
                          + Log Score
                        </button>
                      </div>

                      {mockRecords.length === 0 ? (
                        <div className="text-center py-8 text-xs text-slate-500">
                          <Trophy className="w-8 h-8 mx-auto mb-2 text-slate-700" />
                          <p>No mock test scores logged yet.</p>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Give a mock on Guidely or Testbook and log your score to earn +150 XP!
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {mockRecords.map(m => (
                            <div
                              key={m.id}
                              className="bg-slate-950/80 border border-white/5 rounded-xl p-2.5 flex flex-col gap-1 hover:border-white/20 transition-colors"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-white truncate max-w-[180px]">
                                  {m.testTitle}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  {m.platform}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                                <span className="font-bold text-emerald-400">
                                  Score: {m.score} / {m.totalMarks}
                                </span>
                                <span>{m.accuracy}% Acc</span>
                                {m.percentile !== undefined && (
                                  <span className="text-amber-400">{m.percentile}%ile</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mock Score Modal */}
      <MockScoreModal
        isOpen={isScoreModalOpen}
        onClose={() => setIsScoreModalOpen(false)}
        defaultPlatform={selectedPresetId === 'custom' ? 'Guidely' : selectedPresetId.toUpperCase()}
        onSaved={fetchMockRecords}
      />
    </div>
  );
};
