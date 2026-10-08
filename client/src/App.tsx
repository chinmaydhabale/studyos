import React, { useState } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext.js';
import { StudyProvider } from './context/StudyContext.js';
import { Header } from './components/common/Header.js';
import { NotificationDrawer } from './components/common/NotificationDrawer.js';
import { CommandPalette } from './components/common/CommandPalette.js';
import { AuthModal } from './components/auth/AuthModal.js';
import { VoicePasswordModal } from './components/voice-chat/VoicePasswordModal.js';
import { LiveSituationTracker } from './components/activity/LiveSituationTracker.js';
import { SyncTheater } from './components/video-sync/SyncTheater.js';
import { WhiteboardCanvas } from './components/whiteboard/WhiteboardCanvas.js';
import { SharedNotesEditor } from './components/notes/SharedNotesEditor.js';
import { AICoachHub } from './components/ai-coach/AICoachHub.js';
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard.js';
import { StudyCalendarView } from './components/calendar/StudyCalendarView.js';
import { LeaderboardsView } from './components/gamification/LeaderboardsView.js';
import { TelegramVaultView } from './components/vault/TelegramVaultView.js';
import { RoomGatewayModal } from './components/rooms/RoomGatewayModal.js';
import { PDFReaderView } from './components/pdf-reader/PDFReaderView.js';
import { WebNotesView } from './components/notes/WebNotesView.js';
import { PeerActivityDossierModal } from './components/activity/PeerActivityDossierModal.js';
import { MathGamesArena } from './components/math-games/MathGamesArena.js';
import { PenTool, FileText, Activity, Tv, BookOpen, Globe, Gamepad2, Sparkles } from 'lucide-react';

const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('video');
  const [splitRightTool, setSplitRightTool] = useState<'tracker' | 'whiteboard' | 'notes'>('tracker');
  const [isNotifOpen, setIsNotifOpen] = useState<boolean>(false);
  const [isCommandOpen, setIsCommandOpen] = useState<boolean>(false);
  const [aiCoachPresetPrompt, setAiCoachPresetPrompt] = useState<string>('');
  const [aiCoachPresetSource, setAiCoachPresetSource] = useState<{ title: string; text: string } | null>(null);

  const {
    currentUser,
    isAuthenticated,
    updateUserProfile,
    notifications,
    isVoiceModalOpen,
    setIsVoiceModalOpen,
    isAuthModalOpen,
    setIsAuthModalOpen,
    isRoomModalOpen,
    setIsRoomModalOpen,
    unlockVoiceChat
  } = useSocket();

  const handleRunAiPrompt = (prompt: string) => {
    setAiCoachPresetSource(null);
    setAiCoachPresetPrompt(prompt);
    setActiveTab('ai-coach');
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#090d16] text-slate-100 antialiased selection:bg-indigo-500 selection:text-white overflow-hidden">
      
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        toggleNotifications={() => setIsNotifOpen(!isNotifOpen)}
        unreadCount={notifications.length}
        openCommandPalette={() => setIsCommandOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      {/* Main Tab Views */}
      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        
        {/* Tab 1: Synchronized Co-Study Theater + Quick Live Situation Bar */}
        {activeTab === 'video' && (
          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar">
            <SyncTheater
              onAskAiDoubtAtTimestamp={(timestamp) => {
                setAiCoachPresetSource(null);
                setAiCoachPresetPrompt(`Explain the concept shown at timestamp ${Math.floor(timestamp / 60)}:${Math.floor(timestamp % 60).toString().padStart(2, '0')} in our lecture video.`);
                setActiveTab('ai-coach');
              }}
            />
            <div className="max-w-7xl mx-auto w-full px-3 sm:px-4 pt-1 pb-4">
              <LiveSituationTracker onNavigateToTab={setActiveTab} />
            </div>
          </div>
        )}

        {/* Telegram Cloud Storage & Study Vault */}
        {activeTab === 'vault' && (
          <TelegramVaultView
            onNavigateToPdfReader={() => setActiveTab('pdf')}
          />
        )}

        {/* Web Study Notes & Reading with Live Room Chat */}
        {activeTab === 'web-notes' && (
          <WebNotesView
            onAskAiDoubt={(prompt) => {
              setAiCoachPresetSource(null);
              setAiCoachPresetPrompt(prompt);
              setActiveTab('ai-coach');
            }}
          />
        )}

        {/* In-App PDF Reader (Solo reading + Group Co-Study sync) */}
        {activeTab === 'pdf' && (
          <PDFReaderView
            onAskAiDoubt={(prompt, source) => {
              setAiCoachPresetSource(source ?? null);
              setAiCoachPresetPrompt(prompt);
              setActiveTab('ai-coach');
            }}
          />
        )}

        {/* Tab 2: Split-Screen Co-Study Mode */}
        {activeTab === 'split' && (
          <div className="w-full max-w-7xl mx-auto p-2 sm:p-3 flex flex-col lg:flex-row gap-3 h-full overflow-y-auto lg:overflow-hidden custom-scrollbar">
            
            {/* Left 50%: Video Player */}
            <div className="flex-1 flex flex-col h-auto lg:h-full min-h-[320px] lg:overflow-hidden">
              <SyncTheater
                onAskAiDoubtAtTimestamp={(timestamp) => {
                  setAiCoachPresetSource(null);
                  setAiCoachPresetPrompt(`Explain the concept shown at timestamp ${Math.floor(timestamp / 60)}:${Math.floor(timestamp % 60).toString().padStart(2, '0')} in our lecture video.`);
                  setActiveTab('ai-coach');
                }}
              />
            </div>

            {/* Right 50%: Toggle between Live Situation Tracker, Whiteboard, or Notes */}
            <div className="flex-1 flex flex-col h-[480px] lg:h-full bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
              <div className="p-2.5 border-b border-white/10 bg-slate-950/60 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Co-Study Workspace
                </span>
                
                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-white/10 text-xs">
                  <button
                    onClick={() => setSplitRightTool('tracker')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      splitRightTool === 'tracker' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Live Situation</span>
                  </button>
                  <button
                    onClick={() => setSplitRightTool('whiteboard')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      splitRightTool === 'whiteboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>Whiteboard</span>
                  </button>
                  <button
                    onClick={() => setSplitRightTool('notes')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      splitRightTool === 'notes' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Notes</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {splitRightTool === 'tracker' && <LiveSituationTracker onNavigateToTab={setActiveTab} />}
                {splitRightTool === 'whiteboard' && <WhiteboardCanvas />}
                {splitRightTool === 'notes' && <SharedNotesEditor />}
              </div>
            </div>

          </div>
        )}

        {/* Tab 3: Dedicated Live Situation & Stopwatch Tracker */}
        {activeTab === 'tracker' && (
          <div className="flex-1 min-h-0 max-w-5xl mx-auto w-full p-4 overflow-y-auto">
            <LiveSituationTracker onNavigateToTab={setActiveTab} />
          </div>
        )}

        {/* Tab 4: Fullscreen Shared Whiteboard */}
        {activeTab === 'whiteboard' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <WhiteboardCanvas />
          </div>
        )}

        {/* Tab 5: Collaborative Notes */}
        {activeTab === 'notes' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <SharedNotesEditor />
          </div>
        )}

        {/* Tab 6: Personal AI Study Coach & Teacher */}
        {activeTab === 'ai-coach' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <AICoachHub
              initialPrompt={aiCoachPresetPrompt}
              initialSource={aiCoachPresetSource}
              onClearInitialPrompt={() => {
                setAiCoachPresetPrompt('');
                setAiCoachPresetSource(null);
              }}
              onNavigateToCalendar={() => setActiveTab('calendar')}
            />
          </div>
        )}

        {/* Tab 7: Productivity Analytics */}
        {activeTab === 'analytics' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <AnalyticsDashboard />
          </div>
        )}

        {/* Tab 8: Study Calendar Heatmap */}
        {activeTab === 'calendar' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <StudyCalendarView />
          </div>
        )}

        {/* Tab 9: Multi-Tier Leaderboards */}
        {activeTab === 'leaderboards' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <LeaderboardsView />
          </div>
        )}

        {/* Tab 10: Speed Math & Fast Calculation Games Arena */}
        {activeTab === 'math-games' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <MathGamesArena />
          </div>
        )}

      </main>

      {/* Permanent Account Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Study Group Gateway Modal (Strict Unique Room ID Enforcement) */}
      <RoomGatewayModal
        isOpen={isRoomModalOpen && !isAuthModalOpen}
        onClose={() => setIsRoomModalOpen(false)}
      />

      {/* Voice Password Protection Modal */}
      <VoicePasswordModal
        isOpen={isVoiceModalOpen}
        onSuccess={() => unlockVoiceChat()}
        onClose={() => setIsVoiceModalOpen(false)}
      />

      {/* Notifications Drawer */}
      <NotificationDrawer
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        onNavigateTab={(tab) => {
          setActiveTab(tab);
          setIsNotifOpen(false);
        }}
      />

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandOpen}
        onOpen={() => setIsCommandOpen(true)}
        onClose={() => setIsCommandOpen(false)}
        onNavigateTab={(tab) => {
          setActiveTab(tab);
          setIsCommandOpen(false);
        }}
        onRunAiPrompt={handleRunAiPrompt}
      />

      {/* Peer Live Activity & Subject Breakdown Dossier Modal */}
      <PeerActivityDossierModal
        onNavigateToVideo={() => setActiveTab('video')}
        onNavigateToPdf={() => setActiveTab('pdf')}
      />

      {/* Mobile Bottom Tab Bar (Phone-First Fast Navigation) */}
      <nav className="lg:hidden shrink-0 h-14 bg-[#090d16]/95 backdrop-blur-2xl border-t border-white/10 px-2 flex items-center justify-around z-30 select-none pb-[env(safe-area-inset-bottom)]">
        {[
          { id: 'video', label: 'Theater', icon: Tv },
          { id: 'pdf', label: 'PDF', icon: BookOpen },
          { id: 'web-notes', label: 'Notes', icon: Globe },
          { id: 'math-games', label: 'Math Arena', icon: Gamepad2 },
          { id: 'ai-coach', label: 'AI Coach', icon: Sparkles }
        ].map((item) => {
          const Icon = item.icon;
          const isSelected = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all relative ${
                isSelected ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className={`p-1 rounded-xl transition-all ${isSelected ? 'bg-cyan-500/15 scale-110' : ''}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[64px]">
                {item.label}
              </span>
              {isSelected && (
                <span className="absolute bottom-0 w-6 h-0.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" />
              )}
            </button>
          );
        })}
      </nav>

    </div>
  );
};

export default function App() {
  return (
    <SocketProvider>
      <StudyProvider>
        <MainLayout />
      </StudyProvider>
    </SocketProvider>
  );
}
