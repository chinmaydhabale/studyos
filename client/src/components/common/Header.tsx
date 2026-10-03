import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Award,
  Coins,
  Mic,
  MicOff,
  Lock,
  Bell,
  Sparkles,
  Search,
  User,
  Activity,
  LogOut,
  Users,
  FolderLock,
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
  Globe,
  Radio,
  Gamepad2,
  Sliders,
  ShieldCheck,
  ArrowRightLeft
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { useStudy } from '../../context/StudyContext.js';
import { FocusCapsule } from './navbar/FocusCapsule.js';
import { RoomContextChip } from './navbar/RoomContextChip.js';
import { CommandSearchTrigger } from './navbar/CommandSearchTrigger.js';

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
    label: 'Study Rooms',
    shortLabel: 'Rooms',
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
        id: 'web-notes',
        label: 'Web Notes & Study',
        desc: 'Read online notes, editorials & live chat',
        icon: Globe,
        color: 'text-cyan-400 bg-cyan-500/10'
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
    label: 'Tools & Games',
    shortLabel: 'Tools',
    icon: FolderKanban,
    items: [
      {
        id: 'math-games',
        label: 'Math Speed Arena',
        desc: 'Speed calculations, Vedic shortcuts & 1v1 duels',
        icon: Gamepad2,
        badge: 'Hot',
        color: 'text-amber-400 bg-amber-500/10'
      },
      {
        id: 'ai-coach',
        label: 'AI Study Coach',
        desc: 'Instant doubt solver, hints & custom roadmaps',
        icon: Sparkles,
        badge: 'AI',
        color: 'text-cyan-400 bg-cyan-500/10'
      },
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
        color: 'text-emerald-400 bg-emerald-500/10'
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
    isConnected,
    serverUrl,
    setServerUrl,
    addToast,
    setIsRoomModalOpen,
    setIsAuthModalOpen,
    logoutUser
  } = useSocket();

  const { streak, level, coins } = useStudy();

  const [showServerModal, setShowServerModal] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState(serverUrl || '');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const navRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (navRef.current && !navRef.current.contains(target)) {
        setOpenDropdown(null);
      }
      if (!userMenuRef.current || !userMenuRef.current.contains(target)) {
        setShowUserMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenDropdown(null);
        setShowUserMenu(false);
        setShowMobileNav(false);
        setShowServerModal(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#090d16]/90 backdrop-blur-2xl px-3 sm:px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2.5 sm:gap-3">
        
        {/* =================================================================== */}
        {/* ZONE 1: BRAND IDENTITY & UNIFIED ROOM CONTEXT (LEFT) */}
        {/* =================================================================== */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          
          {/* Logo & Platform Name */}
          <div
            onClick={() => setActiveTab('video')}
            className="flex items-center gap-2 cursor-pointer group select-none"
            title="StudyOS - Home"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-black tracking-tight text-base sm:text-lg text-white">
                Study<span className="text-indigo-400">OS</span>
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                PRO
              </span>
            </div>
          </div>

          {/* Unified Room Context Chip */}
          <RoomContextChip />
        </div>

        {/* =================================================================== */}
        {/* ZONE 2: CENTER NAVIGATION & COMMAND SEARCH ISLAND */}
        {/* =================================================================== */}
        <div className="hidden lg:flex items-center gap-2">
          
          {/* Segmented Category Pill Navigation */}
          <nav
            ref={navRef}
            className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-2xl border border-white/10 shadow-inner"
          >
            {NAV_GROUPS.map((group) => {
              const isGroupActive = group.items.some((item) => item.id === activeTab);
              const activeItem = group.items.find((item) => item.id === activeTab);
              const isOpen = openDropdown === group.id;
              const GroupIcon = group.icon;

              return (
                <div key={group.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(isOpen ? null : group.id)}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                      isGroupActive
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-sm shadow-indigo-600/25 border border-indigo-400/40'
                        : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                    title={`${group.label} Menu`}
                  >
                    <GroupIcon className={`w-3.5 h-3.5 ${isGroupActive ? 'text-cyan-300' : 'text-slate-400'}`} />
                    <span>{group.shortLabel}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : 'text-slate-400'}`} />
                  </button>

                  {/* Dropdown Popover */}
                  {isOpen && (
                    <div className="absolute top-full left-0 mt-2 w-72 rounded-3xl bg-[#0b101e]/95 backdrop-blur-2xl border border-white/15 p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1">
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
                            <div
                              className={`p-1.5 rounded-lg shrink-0 mt-0.5 transition-colors ${
                                isSelected ? 'bg-indigo-600 text-white shadow-sm' : `${item.color} group-hover/item:scale-105`
                              }`}
                            >
                              <ItemIcon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                  {item.label}
                                </p>
                                {item.badge && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                    {item.badge}
                                  </span>
                                )}
                                {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
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
          </nav>

          {/* Linear-Style Command Palette Trigger */}
          <CommandSearchTrigger onClick={openCommandPalette} />
        </div>

        {/* =================================================================== */}
        {/* ZONE 3: FOCUS UTILITIES & USER PROFILE HUB (RIGHT) */}
        {/* =================================================================== */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Consolidated Focus Capsule (Timer + Ambient Sound) */}
          <FocusCapsule />

          {/* Compact Voice Talk Mic Button */}
          <button
            type="button"
            onClick={toggleMic}
            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all shrink-0 ${
              !isVoiceUnlocked
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                : isMicMuted
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/10'
            }`}
            title={
              !isVoiceUnlocked
                ? 'Voice chat locked. Click to enter password'
                : isMicMuted
                ? 'Mic Muted - Click to speak'
                : 'Mic Live - Click to mute'
            }
          >
            {!isVoiceUnlocked ? (
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            ) : isMicMuted ? (
              <MicOff className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            )}
          </button>

          {/* Compact Notification Bell */}
          <button
            type="button"
            onClick={toggleNotifications}
            className="relative w-8 h-8 rounded-xl bg-slate-900/80 border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-colors shadow-sm flex items-center justify-center shrink-0"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 text-white font-bold text-[9px] rounded-full flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* User Profile / Account Menu */}
          {isAuthenticated ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-white/10 hover:border-indigo-500/40 transition-all shadow-sm shrink-0"
                title="Account Settings & Profile"
              >
                <img
                  src={
                    currentUser.avatar ||
                    `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.name || 'Student'}&backgroundColor=6366f1`
                  }
                  alt="Avatar"
                  className="w-6 h-6 rounded-lg border border-white/10"
                />
                <span className="text-xs font-bold text-white hidden 2xl:inline truncate max-w-[80px]">
                  {currentUser.name}
                </span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180 text-white' : ''}`} />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 rounded-3xl bg-[#0b101e]/95 backdrop-blur-2xl border border-white/15 p-2.5 shadow-2xl z-50 flex flex-col gap-1.5 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="p-3 border-b border-white/10 bg-slate-950/60 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-extrabold text-white text-xs">{currentUser.name}</p>
                        <p className="text-[11px] font-mono text-cyan-300">@{currentUser.username}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Lvl {level}
                      </span>
                    </div>

                    {/* Streak & Coins in Profile Dropdown */}
                    <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-amber-400 font-bold" title="Study Streak">
                        <Flame className="w-3.5 h-3.5 fill-amber-400" />
                        <span>{streak}d Streak</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-yellow-400 font-bold" title="Math & Study Coins">
                        <Coins className="w-3.5 h-3.5 text-yellow-400" />
                        <span>{coins} Coins</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      setIsAuthModalOpen(true);
                    }}
                    className="text-left px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <User className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Switch Account / Sign In</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      logoutUser();
                    }}
                    className="text-left px-3 py-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center gap-2 font-semibold"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all shrink-0"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}

          {/* Mobile Navigation Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowMobileNav(!showMobileNav)}
            className="lg:hidden w-8 h-8 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-white transition-colors flex items-center justify-center shrink-0"
            title="Toggle Menu"
          >
            {showMobileNav ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

        </div>
      </div>

      {/* =================================================================== */}
      {/* REDESIGNED MOBILE SLIDE-OVER DRAWER */}
      {/* =================================================================== */}
      {showMobileNav && (
        <div className="lg:hidden fixed inset-0 top-[53px] z-50 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="w-full h-full bg-[#090d16] border-t border-white/10 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4">
            
            {/* 1. User Dossier Header Card */}
            {currentUser && (
              <div className="p-3.5 bg-slate-900/90 border border-white/10 rounded-3xl flex items-center justify-between gap-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <img
                    src={currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.name}&backgroundColor=6366f1`}
                    alt="Avatar"
                    className="w-10 h-10 rounded-2xl border border-white/10"
                  />
                  <div>
                    <h4 className="text-xs font-black text-white">{currentUser.name}</h4>
                    <span className="text-[10px] font-mono text-cyan-300">@{currentUser.username}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <div className="px-2 py-1 rounded-xl bg-amber-500/10 text-amber-300 font-bold border border-amber-500/20 flex items-center gap-1">
                    <Flame className="w-3 h-3 fill-amber-400" />
                    <span>{streak}d</span>
                  </div>
                  <div className="px-2 py-1 rounded-xl bg-yellow-500/10 text-yellow-300 font-bold border border-yellow-500/20 flex items-center gap-1">
                    <Coins className="w-3 h-3 text-yellow-400" />
                    <span>{coins}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Quick Action Cards (AI Coach & Math Games) */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('ai-coach');
                  setShowMobileNav(false);
                }}
                className={`p-3 rounded-2xl border flex flex-col gap-1.5 text-left transition-all ${
                  activeTab === 'ai-coach'
                    ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white border-white/30 shadow-lg'
                    : 'bg-slate-900/90 border-indigo-500/30 text-indigo-200'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                </div>
                <div className="font-extrabold text-xs text-white">🤖 AI Study Coach</div>
                <div className="text-[10px] text-slate-400">Ask doubts & formulas</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('math-games');
                  setShowMobileNav(false);
                }}
                className={`p-3 rounded-2xl border flex flex-col gap-1.5 text-left transition-all ${
                  activeTab === 'math-games'
                    ? 'bg-gradient-to-br from-amber-600 to-rose-600 text-white border-white/30 shadow-lg'
                    : 'bg-slate-900/90 border-amber-500/30 text-amber-200'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Gamepad2 className="w-4 h-4 text-amber-300" />
                </div>
                <div className="font-extrabold text-xs text-white">🎮 Math Speed Arena</div>
                <div className="text-[10px] text-slate-400">6 calculation games</div>
              </button>
            </div>

            {/* 3. Search Bar Button */}
            <button
              type="button"
              onClick={() => {
                setShowMobileNav(false);
                openCommandPalette();
              }}
              className="w-full p-2.5 rounded-2xl bg-slate-900 border border-white/10 text-xs text-slate-400 flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-400" />
                <span>Search notes, rooms, tricks...</span>
              </span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono">⌘K</kbd>
            </button>

            {/* 4. Categorized Navigation Groups */}
            <div className="space-y-3 pt-1">
              {NAV_GROUPS.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <div key={group.id} className="space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 px-1">
                      <GroupIcon className="w-3 h-3 text-indigo-400" />
                      <span>{group.label}</span>
                    </span>

                    <div className="grid grid-cols-2 gap-1.5">
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
                            className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                              isSelected
                                ? 'bg-indigo-600/30 border-indigo-400/60 text-white font-bold'
                                : 'bg-slate-900/80 border-white/5 text-slate-300 hover:bg-white/5'
                            }`}
                          >
                            <div className={`p-1.5 rounded-xl ${isSelected ? 'bg-indigo-600 text-white' : item.color}`}>
                              <ItemIcon className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 5. Footer Utility Actions */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowMobileNav(false);
                  setIsRoomModalOpen(true);
                }}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
                <span>Switch Study Room</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowMobileNav(false);
                  setShowServerModal(true);
                }}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white"
                title="Server Connection Status"
              >
                <Radio className={`w-4 h-4 ${isConnected ? 'text-emerald-400' : 'text-rose-400 animate-pulse'}`} />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Server Connection Modal */}
      {showServerModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setShowServerModal(false)}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">⚡ Server Connection Status</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isConnected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                  {isConnected ? 'Online' : 'Disconnected'}
                </span>
              </div>
              <button
                onClick={() => setShowServerModal(false)}
                aria-label="Close server connection dialog"
                className="text-slate-400 hover:text-white text-xs font-mono p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="server-backend-url" className="block text-xs font-semibold text-slate-300 mb-1">
                  Active Backend URL:
                </label>
                <input
                  id="server-backend-url"
                  type="text"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="https://...trycloudflare.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomUrlInput('https://reduction-bin-listings-train.trycloudflare.com');
                  }}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium border border-white/10 transition-colors"
                >
                  Reset Default
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (customUrlInput.trim()) {
                      setServerUrl(customUrlInput.trim());
                      addToast('Server URL Saved', 'Reconnecting to new backend...', 'success');
                      setShowServerModal(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-all"
                >
                  Save & Reconnect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </header>
  );
};
