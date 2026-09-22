import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Award,
  Coins,
  Mic,
  MicOff,
  Lock,
  Unlock,
  Bell,
  Volume2,
  VolumeX,
  Share2,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Search,
  User,
  Activity,
  LogOut,
  Users,
  FolderLock,
  Cloud,
  Menu,
  X,
  ChevronDown,
  Tv,
  BookOpen,
  Columns,
  FolderKanban,
  FileText,
  PenTool,
  BarChart3,
  Calendar,
  Trophy,
  Check,
  Bot
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { useStudy, AmbientSoundType } from '../../context/StudyContext.js';

interface NavItem {
  id: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  color: string;
}

interface NavGroup {
  id: 'study' | 'tools' | 'progress';
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'study',
    label: 'Co-Study Rooms',
    shortLabel: 'Co-Study',
    icon: Tv,
    items: [
      {
        id: 'video',
        label: 'Video Theater',
        desc: 'Sync YouTube lectures & live playback',
        icon: Tv,
        color: 'text-rose-400 bg-rose-500/10'
      },
      {
        id: 'pdf',
        label: 'PDF Reader',
        desc: 'Solo self-reading & synchronized page turns',
        icon: BookOpen,
        badge: 'New',
        color: 'text-indigo-400 bg-indigo-500/10'
      },
      {
        id: 'split',
        label: 'Split Screen',
        desc: 'Dual view: watch video + notes/whiteboard',
        icon: Columns,
        color: 'text-emerald-400 bg-emerald-500/10'
      }
    ]
  },
  {
    id: 'tools',
    label: 'Workspace & Vault',
    shortLabel: 'Workspace',
    icon: FolderKanban,
    items: [
      {
        id: 'vault',
        label: 'Telegram Vault',
        desc: 'Cloud storage & exam PDF notes library',
        icon: FolderLock,
        color: 'text-sky-400 bg-sky-500/10'
      },
      {
        id: 'notes',
        label: 'Shared Notes',
        desc: 'Collaborative markdown & speed math formulas',
        icon: FileText,
        color: 'text-amber-400 bg-amber-500/10'
      },
      {
        id: 'whiteboard',
        label: 'Whiteboard',
        desc: 'Freehand drawings, puzzle flowcharts & diagrams',
        icon: PenTool,
        color: 'text-purple-400 bg-purple-500/10'
      }
    ]
  },
  {
    id: 'progress',
    label: 'Performance & Tracking',
    shortLabel: 'Progress',
    icon: BarChart3,
    items: [
      {
        id: 'tracker',
        label: 'Live Situation',
        desc: 'Real-time stopwatch & peer activity feed',
        icon: Activity,
        color: 'text-emerald-400 bg-emerald-500/10'
      },
      {
        id: 'analytics',
        label: 'Study Analytics',
        desc: 'Hours studied, subject velocity & daily goals',
        icon: BarChart3,
        color: 'text-cyan-400 bg-cyan-500/10'
      },
      {
        id: 'calendar',
        label: 'Study Calendar',
        desc: 'Streak heatmaps & exam revision timeline',
        icon: Calendar,
        color: 'text-indigo-400 bg-indigo-500/10'
      },
      {
        id: 'leaderboards',
        label: 'Leaderboards',
        desc: 'Room, friend & national exam rankings',
        icon: Trophy,
        color: 'text-amber-400 bg-amber-500/10'
      }
    ]
  }
];

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  toggleNotifications: () => void;
  unreadCount: number;
  openCommandPalette: () => void;
  onOpenAuthModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  toggleNotifications,
  unreadCount,
  openCommandPalette,
  onOpenAuthModal
}) => {
  const {
    roomId,
    currentUser,
    isAuthenticated,
    isMicMuted,
    toggleMic,
    isVoiceUnlocked,
    peers,
    addToast,
    setIsRoomModalOpen,
    setIsAuthModalOpen,
    logoutUser,
    openPeerDossier
  } = useSocket();

  const {
    timerMode,
    timeLeft,
    isRunning,
    startTimer,
    pauseTimer,
    resetTimer,
    ambientSound,
    setAmbientSound,
    streak,
    level,
    coins
  } = useStudy();

  const [showAmbientMenu, setShowAmbientMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        setShowUserMenu(false);
        setShowAmbientMenu(false);
        setShowMobileNav(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const copyRoomInvite = () => {
    if (!roomId) {
      setIsRoomModalOpen(true);
      return;
    }
    navigator.clipboard?.writeText(roomId);
    addToast('Group ID Copied!', `Share Group ID "${roomId}" with your study partner to study together.`, 'success');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#090d16]/90 backdrop-blur-xl px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        
        {/* Logo & Study Room Code */}
        <div className="flex items-center gap-3">
          <div 
            onClick={() => setActiveTab('video')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-lg text-white">Study<span className="text-indigo-400">OS</span></span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  RRB/IBPS PO
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                {roomId ? (
                  <button
                    onClick={() => setIsRoomModalOpen(true)}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                    title="Click to Switch or View Group Info"
                  >
                    <span>Room:</span>
                    <span className="font-mono text-cyan-300 font-bold underline decoration-dotted">{roomId}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsRoomModalOpen(true)}
                    className="text-amber-400 font-semibold hover:underline animate-pulse"
                  >
                    No Room Joined (Click to Enter)
                  </button>
                )}
                {roomId && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-400 text-[10px] font-medium">{peers.length} Live</span>
                    <div className="hidden md:flex items-center -space-x-1.5 ml-1">
                      {peers.slice(0, 4).map((p) => (
                        <button
                          key={p.userId}
                          onClick={(e) => {
                            e.stopPropagation();
                            openPeerDossier(p);
                          }}
                          className="relative rounded-full hover:scale-110 hover:z-10 transition-transform"
                          title={`${p.name} - Click to see live activity dossier & breakdown`}
                        >
                          <img
                            src={p.avatar}
                            alt={p.name}
                            className="w-4 h-4 rounded-full border border-slate-900 ring-1 ring-emerald-500/50"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsRoomModalOpen(true)}
            title="Switch or Join Study Group"
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span>{roomId ? 'Switch Group' : 'Join Group'}</span>
          </button>
        </div>

        {/* Global Navigation Tabs (Clean Organized Dropdown Submenus) */}
        <nav ref={navRef} className="hidden md:flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-2xl border border-white/10 shadow-inner">
          {NAV_GROUPS.map((group) => {
            const isGroupActive = group.items.some(item => item.id === activeTab);
            const activeItem = group.items.find(item => item.id === activeTab);
            const isOpen = openDropdown === group.id;
            const GroupIcon = group.icon;

            return (
              <div key={group.id} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenDropdown(isOpen ? null : group.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                    isGroupActive
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-sm shadow-indigo-600/25 border border-indigo-400/40'
                      : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                  title={`${group.label} - Click to browse tools`}
                >
                  <GroupIcon className={`w-3.5 h-3.5 ${isGroupActive ? 'text-cyan-300' : 'text-slate-400'}`} />
                  <span>{group.shortLabel}</span>
                  {isGroupActive && activeItem && (
                    <span className="hidden xl:inline-block text-[10px] text-cyan-200 bg-black/20 px-1.5 py-0.5 rounded-md font-medium border border-white/10">
                      {activeItem.label.split(' ')[0]}
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : 'text-slate-400'}`} />
                </button>

                {/* Glassmorphic Dropdown Popover */}
                {isOpen && (
                  <div className="absolute top-full left-0 mt-2 w-72 rounded-2xl bg-[#0b101e]/95 backdrop-blur-2xl border border-white/15 p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1">
                    <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-white/10 pb-1.5 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-indigo-300">
                        <GroupIcon className="w-3 h-3" />
                        <span>{group.label}</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-500">{group.items.length} tools</span>
                    </div>

                    {group.items.map((item) => {
                      const isSelected = activeTab === item.id;
                      const ItemIcon = item.icon;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(item.id);
                            setOpenDropdown(null);
                          }}
                          className={`w-full text-left p-2 rounded-xl flex items-start gap-2.5 transition-all group/item ${
                            isSelected
                              ? 'bg-indigo-600/25 border border-indigo-500/40 text-white shadow-sm'
                              : 'hover:bg-white/5 text-slate-300 hover:text-white border border-transparent'
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : `${item.color} group-hover/item:scale-105 transition-transform`
                          }`}>
                            <ItemIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-200 group-hover/item:text-white'}`}>
                                {item.label}
                              </p>
                              {item.badge && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                  {item.badge}
                                </span>
                              )}
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 leading-tight mt-0.5 line-clamp-1">
                              {item.desc}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Standalone Flagship AI Coach Tab */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('ai-coach');
              setOpenDropdown(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 ${
              activeTab === 'ai-coach'
                ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/30 border border-white/20'
                : 'text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/40'
            }`}
            title="Open Personal AI Study Coach"
          >
            <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'ai-coach' ? 'text-cyan-200 animate-spin' : 'text-indigo-400'}`} />
            <span>AI Coach</span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          </button>
        </nav>

        {/* Right Controls */}
        <div className="flex items-center gap-2">

          {/* Voice Talk Mic Button (Password Protected) */}
          <button
            onClick={toggleMic}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
              !isVoiceUnlocked
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                : isMicMuted
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/10'
            }`}
            title={!isVoiceUnlocked ? 'Voice chat locked. Click to enter password' : 'Toggle Voice Mic'}
          >
            {!isVoiceUnlocked ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Voice Locked</span>
              </>
            ) : isMicMuted ? (
              <>
                <MicOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Muted</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 animate-pulse" />
                <span className="hidden sm:inline">Mic Live</span>
              </>
            )}
          </button>

          {/* Pomodoro Timer Badge */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-indigo-500/30 rounded-xl px-2.5 py-1">
            <span className="text-xs font-mono font-bold text-indigo-300">
              {formatTime(timeLeft)}
            </span>
            <button
              onClick={isRunning ? pauseTimer : startTimer}
              className="p-1 rounded-md hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              title={isRunning ? 'Pause Timer' : 'Start Focus Session'}
            >
              {isRunning ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />}
            </button>
            <button
              onClick={resetTimer}
              className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="Reset Timer"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* Ambient Sound Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowAmbientMenu(!showAmbientMenu)}
              className={`p-2 rounded-xl border transition-colors ${
                ambientSound !== 'none'
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
              }`}
              title="Ambient Study Sounds (Rain, Lo-Fi, Library)"
            >
              {ambientSound !== 'none' ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {showAmbientMenu && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-slate-900 border border-white/15 p-2 shadow-2xl z-50 flex flex-col gap-1 text-xs">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 py-1">Ambient Focus Audio</span>
                {[
                  { id: 'none', label: 'Off / Silent' },
                  { id: 'lofi', label: '🎧 Lo-Fi Beats & Hiss' },
                  { id: 'rain', label: '🌧️ Gentle Monsoon Rain' },
                  { id: 'library', label: '📚 Quiet Library Ambience' },
                  { id: 'whitenoise', label: '🌊 Deep Focus White Noise' }
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setAmbientSound(s.id as AmbientSoundType);
                      setShowAmbientMenu(false);
                    }}
                    className={`text-left px-2.5 py-1.5 rounded-lg transition-colors ${
                      ambientSound === s.id
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Streak & Coins */}
          <div className="hidden xl:flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-xl px-2.5 py-1 text-xs">
            <div className="flex items-center gap-1 text-amber-400 font-semibold" title="Current Study Streak">
              <Flame className="w-3.5 h-3.5 fill-amber-400 animate-bounce" />
              <span>{streak}d</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div className="flex items-center gap-1 text-indigo-300 font-medium" title="Level">
              <Award className="w-3.5 h-3.5 text-indigo-400" />
              <span>Lv.{level}</span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div className="flex items-center gap-1 text-yellow-400 font-medium" title="Coins">
              <Coins className="w-3.5 h-3.5 text-yellow-400" />
              <span>{coins}</span>
            </div>
          </div>

          {/* Notification Bell */}
          <button
            onClick={toggleNotifications}
            className="relative p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-colors"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white font-bold text-[10px] rounded-full flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {/* User Account / Profile Menu */}
          {isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-2xl bg-slate-900 border border-white/10 hover:border-indigo-500/40 transition-colors"
                title="Account Settings & Profile"
              >
                <img
                  src={currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.name || 'Student'}&backgroundColor=6366f1`}
                  alt="Avatar"
                  className="w-6 h-6 rounded-lg"
                />
                <div className="text-left hidden md:block">
                  <p className="text-[11px] font-bold text-white leading-none">
                    {currentUser.name}
                  </p>
                  <p className="text-[9px] font-mono text-cyan-300 leading-none mt-0.5">
                    @{currentUser.username || 'aspirant'}
                  </p>
                </div>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-white/15 p-2 shadow-2xl z-50 flex flex-col gap-1 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="p-2.5 border-b border-white/10">
                    <p className="font-bold text-white text-xs">{currentUser.name}</p>
                    <p className="text-[11px] font-mono text-cyan-300">@{currentUser.username}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{currentUser.targetExam}</p>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); setIsAuthModalOpen(true); }}
                    className="text-left px-2.5 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Switch Account / Sign In</span>
                  </button>
                  <button
                    onClick={() => { setShowUserMenu(false); logoutUser(); }}
                    className="text-left px-2.5 py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center gap-2 font-semibold"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}

          {/* Mobile Navigation Toggle Button */}
          <button
            type="button"
            onClick={() => setShowMobileNav(!showMobileNav)}
            className="md:hidden p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-white transition-colors"
            title="Toggle Menu"
          >
            {showMobileNav ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

        </div>
      </div>

      {/* Enhanced Grouped Mobile Navigation Drawer */}
      {showMobileNav && (
        <div className="md:hidden pt-3 pb-3 border-t border-white/10 mt-2 max-w-7xl mx-auto animate-in slide-in-from-top-2 duration-150 space-y-3">
          
          {/* AI Coach Quick Hero Banner on Mobile */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('ai-coach');
              setShowMobileNav(false);
            }}
            className={`w-full p-2.5 rounded-xl flex items-center justify-between border transition-all ${
              activeTab === 'ai-coach'
                ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 text-white border-white/30 shadow-lg shadow-indigo-500/20'
                : 'bg-gradient-to-r from-indigo-950/60 to-slate-900 border-indigo-500/30 text-indigo-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                <Sparkles className="w-4 h-4 text-cyan-300" />
              </div>
              <div className="text-left">
                <p className="text-xs font-extrabold text-white">🤖 AI Coach & Teacher</p>
                <p className="text-[10px] text-slate-400">Ask doubts, generate formulas & speed tricks</p>
              </div>
            </div>
            {activeTab === 'ai-coach' ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">Active</span>
            ) : (
              <ChevronDown className="w-4 h-4 -rotate-90 text-indigo-400" />
            )}
          </button>

          {/* Grouped Category Grids */}
          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <div key={group.id} className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <GroupIcon className="w-3 h-3 text-indigo-400" />
                    <span>{group.label}</span>
                  </span>
                  <span className="text-[9px] text-slate-500">{group.items.length} tools</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {group.items.map((item) => {
                    const isSelected = activeTab === item.id;
                    const ItemIcon = item.icon;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setShowMobileNav(false);
                        }}
                        className={`text-left p-2 rounded-xl flex items-center justify-between border transition-all ${
                          isSelected
                            ? 'bg-indigo-600/30 border-indigo-500/50 text-white shadow-sm'
                            : 'bg-slate-900/70 border-white/5 text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : item.color}`}>
                            <ItemIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-bold leading-none ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                              {item.label}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">
                              {item.desc}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

        </div>
      )}
    </header>
  );
};
