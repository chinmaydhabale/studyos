import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  ExternalLink,
  BookOpen,
  MessageSquare,
  Sparkles,
  RefreshCw,
  PenTool,
  Copy,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Send,
  HelpCircle,
  FileText,
  Star,
  Search,
  X,
  Plus,
  Trash2,
  Tag,
  ChevronRight,
  RotateCcw,
  Type,
  Layers,
  BookMarked
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { API_BASE_URL } from '../../config.js';
import { VoiceChatPanel } from '../voice-chat/VoiceChatPanel.js';

// --- Preset Study Portals ---
interface PlatformPreset {
  id: string;
  name: string;
  url: string;
  color: string;
  tag: string;
  category: BookmarkCategory;
}

export type BookmarkCategory = 'Editorials' | 'Current Affairs' | 'Banking & GK' | 'Govt Schemes' | 'Custom';

const NOTE_PLATFORMS: PlatformPreset[] = [
  { id: 'affairscloud', name: 'AffairsCloud', url: 'https://affairscloud.com/current-affairs/', color: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30', tag: 'Daily CA & GK', category: 'Current Affairs' },
  { id: 'thehindu_ed', name: 'The Hindu Editorial', url: 'https://www.thehindu.com/opinion/editorial/', color: 'bg-amber-600/20 text-amber-400 border-amber-500/30', tag: 'English & RC', category: 'Editorials' },
  { id: 'bankersadda_ca', name: 'Bankersadda GK', url: 'https://www.bankersadda.com/current-affairs/', color: 'bg-rose-600/20 text-rose-400 border-rose-500/30', tag: 'Hindu Capsule', category: 'Banking & GK' },
  { id: 'pib_india', name: 'PIB India News', url: 'https://pib.gov.in/', color: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30', tag: 'Govt Releases', category: 'Govt Schemes' },
  { id: 'oliveboard_ca', name: 'Oliveboard CA', url: 'https://www.oliveboard.in/current-affairs/', color: 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30', tag: 'Bolt Capsule', category: 'Banking & GK' },
  { id: 'drishti_ias', name: 'Drishti IAS', url: 'https://www.drishtiias.com/eng', color: 'bg-violet-600/20 text-violet-400 border-violet-500/30', tag: 'News Analysis', category: 'Current Affairs' },
  { id: 'vikaspedia', name: 'Vikaspedia', url: 'https://vikaspedia.in/', color: 'bg-teal-600/20 text-teal-400 border-teal-500/30', tag: 'Rural Schemes', category: 'Govt Schemes' },
  { id: 'wikipedia_events', name: 'Wiki Events', url: 'https://en.wikipedia.org/wiki/Portal:Current_events', color: 'bg-blue-600/20 text-blue-400 border-blue-500/30', tag: 'Global GK', category: 'Current Affairs' }
];

export interface WebBookmark {
  id: string;
  title: string;
  url: string;
  category: BookmarkCategory;
  addedAt: number;
}

const DEFAULT_BOOKMARKS: WebBookmark[] = NOTE_PLATFORMS.map(p => ({
  id: `default_${p.id}`,
  title: p.name,
  url: p.url,
  category: p.category,
  addedAt: Date.now()
}));

// --- Search Providers ---
interface SearchProvider {
  id: string;
  name: string;
  icon: string;
  buildUrl: (query: string) => string;
}

const SEARCH_PROVIDERS: SearchProvider[] = [
  {
    id: 'ddg',
    name: 'DuckDuckGo (Fast Proxy)',
    icon: '🦆',
    buildUrl: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q + ' notes')}`
  },
  {
    id: 'google',
    name: 'Google Search',
    icon: '🔍',
    buildUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q + ' exam notes banking')}`
  },
  {
    id: 'wikipedia',
    name: 'Wikipedia',
    icon: '📚',
    buildUrl: (q) => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`
  },
  {
    id: 'affairscloud',
    name: 'AffairsCloud Search',
    icon: '⚡',
    buildUrl: (q) => `https://affairscloud.com/?s=${encodeURIComponent(q)}`
  }
];

const SEARCH_SUGGESTIONS = [
  'RBI Circulars & Monetary Policy',
  'The Hindu Editorial Today',
  'Daily Current Affairs 2026',
  'PIB Cabinet Decisions',
  'Union Budget & Economic Survey',
  'Banking Awareness Static GK'
];

interface ExtractedArticle {
  success: boolean;
  title: string;
  source: string;
  url: string;
  byline?: string;
  publishedTime?: string;
  leadImageUrl?: string;
  contentHtml: string;
  textContent: string;
  wordCount: number;
  readingTimeMinutes: number;
}

interface WebNotesViewProps {
  onAskAiDoubt?: (prompt: string) => void;
}

export const WebNotesView: React.FC<WebNotesViewProps> = ({ onAskAiDoubt }) => {
  const { addToast } = useSocket();

  // Navigation & URL
  const [currentUrl, setCurrentUrl] = useState<string>(NOTE_PLATFORMS[0].url);
  const [urlInputValue, setUrlInputValue] = useState<string>(NOTE_PLATFORMS[0].url);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(NOTE_PLATFORMS[0].id);
  const [selectedSearchProvider, setSelectedSearchProvider] = useState<string>('ddg');

  // View Mode: 'embed' (interactive iframe) vs 'reader' (clean distraction-free text)
  const [viewMode, setViewMode] = useState<'embed' | 'reader'>('embed');
  const [articleData, setArticleData] = useState<ExtractedArticle | null>(null);
  const [isLoadingArticle, setIsLoadingArticle] = useState<boolean>(false);
  const [readerFontSize, setReaderFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [readerTheme, setReaderTheme] = useState<'slate' | 'sepia' | 'black'>('slate');

  // Side-by-side workspace & live chat
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'bookmarks' | 'notes' | 'ai'>('chat');

  // Bookmarking System
  const [bookmarks, setBookmarks] = useState<WebBookmark[]>(() => {
    try {
      const saved = localStorage.getItem('studyos_web_bookmarks_v1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_BOOKMARKS;
  });
  const [bookmarkSearchFilter, setBookmarkSearchFilter] = useState<string>('');
  const [selectedBookmarkCategory, setSelectedBookmarkCategory] = useState<string>('All');
  const [isAddingBookmark, setIsAddingBookmark] = useState<boolean>(false);
  const [newBookmarkTitle, setNewBookmarkTitle] = useState<string>('');
  const [newBookmarkUrl, setNewBookmarkUrl] = useState<string>('');
  const [newBookmarkCategory, setNewBookmarkCategory] = useState<BookmarkCategory>('Editorials');

  // Scratch Notes
  const [scratchNotes, setScratchNotes] = useState<string>(() => {
    return localStorage.getItem('studyos_web_scratch_notes') || '';
  });

  // AI Doubt helper input inside sidebar
  const [quickAiDoubt, setQuickAiDoubt] = useState<string>('');

  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Sync bookmarks to localStorage
  const saveBookmarksToStorage = (updated: WebBookmark[]) => {
    setBookmarks(updated);
    try {
      localStorage.setItem('studyos_web_bookmarks_v1', JSON.stringify(updated));
    } catch {}
  };

  // Determine if current URL is bookmarked
  const normalizeUrlForCompare = (u: string) => u.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
  const currentBookmark = bookmarks.find(b => normalizeUrlForCompare(b.url) === normalizeUrlForCompare(currentUrl));
  const isCurrentBookmarked = !!currentBookmark;

  // Detect whether current input is a direct URL or search term
  const isQueryAUrl = (text: string): boolean => {
    const trimmed = text.trim();
    if (/^https?:\/\//i.test(trimmed)) return true;
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(trimmed) && !trimmed.includes(' ')) {
      return true;
    }
    return false;
  };

  // Listen to postMessages from proxied iframe (for seamless in-app navigation and reader fallback)
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.data?.type === 'STUDYOS_NAVIGATE' && typeof event.data?.url === 'string') {
        const nextUrl = event.data.url;
        setCurrentUrl(nextUrl);
        setUrlInputValue(nextUrl);
        setSelectedPresetId('custom');
      }
      if (event.data?.type === 'STUDYOS_SWITCH_READER') {
        const target = typeof event.data?.url === 'string' ? event.data.url : currentUrl;
        setViewMode('reader');
        fetchArticleContent(target);
      }
    };
    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [currentUrl]);

  // Fetch clean article for Reader Mode
  const fetchArticleContent = async (url: string) => {
    setIsLoadingArticle(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/proxy/article?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data: ExtractedArticle = await res.json();
      setArticleData(data);
    } catch (err: any) {
      setArticleData({
        success: false,
        title: 'Unable to Extract Clean Article',
        source: new URL(url).hostname || 'Study Notes',
        url,
        contentHtml: `<p class="text-slate-400">Could not extract article text from this portal. You can switch to Web View or open in a Companion Window.</p>`,
        textContent: '',
        wordCount: 0,
        readingTimeMinutes: 1
      });
    } finally {
      setIsLoadingArticle(false);
    }
  };

  // Switch between Embed View and Reader View
  const handleToggleViewMode = (mode: 'embed' | 'reader') => {
    setViewMode(mode);
    if (mode === 'reader' && (!articleData || articleData.url !== currentUrl)) {
      fetchArticleContent(currentUrl);
    }
  };

  // Save scratch notes to localStorage
  const handleScratchChange = (text: string) => {
    setScratchNotes(text);
    localStorage.setItem('studyos_web_scratch_notes', text);
  };

  const handleSelectPreset = (preset: PlatformPreset) => {
    setSelectedPresetId(preset.id);
    setCurrentUrl(preset.url);
    setUrlInputValue(preset.url);
    if (viewMode === 'reader') {
      fetchArticleContent(preset.url);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = urlInputValue.trim();
    if (!input) return;

    if (isQueryAUrl(input)) {
      let finalUrl = input;
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `https://${finalUrl}`;
      }
      setCurrentUrl(finalUrl);
      setSelectedPresetId('custom');
      if (viewMode === 'reader') {
        fetchArticleContent(finalUrl);
      }
    } else {
      // Treat as search query via chosen search provider
      const provider = SEARCH_PROVIDERS.find(p => p.id === selectedSearchProvider) || SEARCH_PROVIDERS[0];
      const searchUrl = provider.buildUrl(input);
      setCurrentUrl(searchUrl);
      setSelectedPresetId('custom');
      if (viewMode === 'reader') {
        // Switch back to embed so search results page can be interacted with
        setViewMode('embed');
      }
      addToast('Searching Notes', `Searching "${input}" via ${provider.name}`, 'info');
    }
  };

  // Quick Suggestion Click
  const handleSearchSuggestionClick = (query: string) => {
    setUrlInputValue(query);
    const provider = SEARCH_PROVIDERS.find(p => p.id === selectedSearchProvider) || SEARCH_PROVIDERS[0];
    const searchUrl = provider.buildUrl(query);
    setCurrentUrl(searchUrl);
    setSelectedPresetId('custom');
    if (viewMode === 'reader') setViewMode('embed');
    addToast('Searching Notes', `Searching "${query}" via ${provider.name}`, 'info');
  };

  // Toggle Bookmark
  const handleToggleBookmark = () => {
    if (isCurrentBookmarked && currentBookmark) {
      const updated = bookmarks.filter(b => b.id !== currentBookmark.id);
      saveBookmarksToStorage(updated);
      addToast('Bookmark Removed', `Removed "${currentBookmark.title}" from saved bookmarks.`, 'info');
    } else {
      let title = '';
      const preset = NOTE_PLATFORMS.find(p => normalizeUrlForCompare(p.url) === normalizeUrlForCompare(currentUrl));
      if (preset) {
        title = preset.name;
      } else if (articleData?.title) {
        title = articleData.title;
      } else {
        try {
          title = new URL(currentUrl).hostname.replace(/^www\./, '');
        } catch {
          title = 'Study Notes Bookmark';
        }
      }

      const newBm: WebBookmark = {
        id: `bm_${Date.now()}`,
        title,
        url: currentUrl,
        category: preset ? preset.category : 'Custom',
        addedAt: Date.now()
      };
      const updated = [newBm, ...bookmarks];
      saveBookmarksToStorage(updated);
      addToast('Bookmark Saved ⭐', `"${title}" added to your study bookmarks list!`, 'success');
    }
  };

  // Add Custom Bookmark form submit
  const handleAddCustomBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookmarkUrl.trim()) return;
    let url = newBookmarkUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    const title = newBookmarkTitle.trim() || new URL(url).hostname;
    const newBm: WebBookmark = {
      id: `bm_${Date.now()}`,
      title,
      url,
      category: newBookmarkCategory,
      addedAt: Date.now()
    };
    saveBookmarksToStorage([newBm, ...bookmarks]);
    setIsAddingBookmark(false);
    setNewBookmarkTitle('');
    setNewBookmarkUrl('');
    addToast('Bookmark Created ⭐', `Added "${title}" to your ${newBookmarkCategory} bookmarks!`, 'success');
  };

  // Delete Bookmark
  const handleDeleteBookmark = (id: string, title: string) => {
    const updated = bookmarks.filter(b => b.id !== id);
    saveBookmarksToStorage(updated);
    addToast('Bookmark Deleted', `Deleted "${title}".`, 'info');
  };

  // Open Bookmark in viewer
  const handleOpenBookmark = (bm: WebBookmark) => {
    setCurrentUrl(bm.url);
    setUrlInputValue(bm.url);
    setSelectedPresetId('custom');
    if (viewMode === 'reader') {
      fetchArticleContent(bm.url);
    }
  };

  // Restore Default Bookmarks
  const handleRestoreDefaults = () => {
    saveBookmarksToStorage(DEFAULT_BOOKMARKS);
    addToast('Bookmarks Restored', 'Restored default study and current affairs bookmarks.', 'info');
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

  // Filter Bookmarks
  const filteredBookmarks = bookmarks.filter(b => {
    const matchesCat = selectedBookmarkCategory === 'All' || b.category === selectedBookmarkCategory;
    const matchesSearch = !bookmarkSearchFilter.trim() ||
      b.title.toLowerCase().includes(bookmarkSearchFilter.toLowerCase()) ||
      b.url.toLowerCase().includes(bookmarkSearchFilter.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* 1. TOP TOOLBAR: Quick Study Presets, URL / Search Navigation & Bookmarking */}
      <div className="border-b border-white/10 bg-slate-900/95 px-4 py-2.5 flex flex-col gap-2 shadow-md">
        {/* Row 1: Presets & Reader/Chat Toggles */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1.5 mr-1">
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>Study Portals:</span>
            </span>
            {NOTE_PLATFORMS.map(preset => {
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold whitespace-nowrap transition-all ${
                    isSelected
                      ? `${preset.color} ring-2 ring-white/20 shadow-md font-bold scale-[1.02]`
                      : 'bg-slate-950/60 text-slate-400 border-white/5 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>{preset.name}</span>
                  <span className="text-[9px] opacity-75 px-1 py-0.2 rounded bg-black/30 font-normal">
                    {preset.tag}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Toolbar Controls: View Mode & Sidebar Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {/* View Mode Toggle: Interactive Web vs Clean Reader */}
            <div className="flex items-center bg-slate-950 border border-white/10 rounded-xl p-0.5 text-xs">
              <button
                type="button"
                onClick={() => handleToggleViewMode('embed')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  viewMode === 'embed'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="View full interactive website"
              >
                <Globe className="w-3 h-3" />
                <span>Web View</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleViewMode('reader')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  viewMode === 'reader'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Clean, distraction-free reader mode"
              >
                <FileText className="w-3 h-3" />
                <span>Reader Mode</span>
              </button>
            </div>

            {/* Toggle Room Chat & Bookmarks Sidebar */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-md ${
                isSidebarOpen
                  ? 'bg-indigo-600 text-white border-indigo-400/50 shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-300 border-white/10 hover:text-white hover:bg-slate-700'
              }`}
              title={isSidebarOpen ? 'Hide Sidebar (Full Width Reading)' : 'Show Live Chat, Bookmarks & Notes'}
            >
              <MessageSquare className="w-3.5 h-3.5 text-cyan-300" />
              <span className="hidden sm:inline">{isSidebarOpen ? 'Sidebar' : 'Chat & Notes'}</span>
              {isSidebarOpen ? (
                <PanelRightClose className="w-3.5 h-3.5" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Dedicated URL & Notes Search Bar with Bookmark Star */}
        <form onSubmit={handleUrlSubmit} className="flex items-center gap-2">
          <div className="flex-1 flex items-center bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus-within:border-cyan-500/50 transition-colors">
            {/* Search Provider Selector */}
            <select
              value={selectedSearchProvider}
              onChange={e => setSelectedSearchProvider(e.target.value)}
              className="bg-transparent text-slate-400 hover:text-slate-200 focus:outline-none text-[11px] font-semibold border-r border-white/10 pr-2 mr-2 cursor-pointer"
              title="Select Search Engine for Notes Search"
            >
              {SEARCH_PROVIDERS.map(sp => (
                <option key={sp.id} value={sp.id} className="bg-slate-900 text-slate-200">
                  {sp.icon} {sp.name}
                </option>
              ))}
            </select>

            {/* Input icon dynamically switches based on whether input looks like a URL or search phrase */}
            {isQueryAUrl(urlInputValue) ? (
              <Globe className="w-3.5 h-3.5 text-cyan-400 mr-2 shrink-0" />
            ) : (
              <Search className="w-3.5 h-3.5 text-amber-400 mr-2 shrink-0" />
            )}

            <input
              type="text"
              value={urlInputValue}
              onChange={e => setUrlInputValue(e.target.value)}
              placeholder="Search study topics (e.g. 'RBI circulars', 'the hindu editorial') or enter any website URL..."
              className="w-full bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none font-mono text-xs"
            />

            {urlInputValue && (
              <button
                type="button"
                onClick={() => setUrlInputValue('')}
                className="p-0.5 text-slate-500 hover:text-slate-300 mr-1"
                title="Clear input"
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Bookmark Star Button (Right inside the URL bar like standard browsers!) */}
            <button
              type="button"
              onClick={handleToggleBookmark}
              className={`p-1 rounded-lg transition-all ${
                isCurrentBookmarked
                  ? 'text-amber-400 hover:text-amber-300 scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                  : 'text-slate-500 hover:text-slate-300 hover:scale-105'
              }`}
              title={isCurrentBookmarked ? 'Bookmarked! Click to remove' : 'Bookmark this website / article'}
            >
              <Star className={`w-4 h-4 ${isCurrentBookmarked ? 'fill-amber-400' : ''}`} />
            </button>
          </div>

          {/* Go / Search Action Button */}
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-xs font-bold text-white shadow-md transition-all shrink-0 active:scale-95"
          >
            {isQueryAUrl(urlInputValue) ? (
              <>
                <Globe className="w-3 h-3" />
                <span>Open URL</span>
              </>
            ) : (
              <>
                <Search className="w-3 h-3" />
                <span>Search Notes</span>
              </>
            )}
          </button>

          {/* Dual Window Companion Button */}
          <button
            type="button"
            onClick={handleOpenCompanionWindow}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
            title="Open portal in secondary companion window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Companion Tab ↗</span>
          </button>
        </form>

        {/* Row 3: Quick Topic Suggestions Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-[11px]">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider shrink-0">
            Quick Search:
          </span>
          {SEARCH_SUGGESTIONS.map((topic, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSearchSuggestionClick(topic)}
              className="px-2 py-0.5 rounded-lg bg-slate-950/70 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 border border-white/5 transition-colors whitespace-nowrap"
            >
              {topic}
            </button>
          ))}
        </div>
      </div>

      {/* 2. MAIN BODY: Website Notes Reader / Embed (Left) + Sidebar (Right) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left: Content Viewing Area */}
        <div className={`flex flex-col h-full overflow-hidden transition-all duration-200 ${isSidebarOpen ? 'flex-1' : 'w-full'}`}>
          {viewMode === 'embed' ? (
            /* Mode 1: Web Embed Frame (with enhanced anti-blocking proxy) */
            <div className="flex-1 relative bg-slate-950">
              <iframe
                ref={iframeRef}
                src={`${API_BASE_URL}/api/proxy/web?url=${encodeURIComponent(currentUrl)}`}
                className="w-full h-full border-none bg-white"
                title="Study Notes Portal Frame"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
              />
            </div>
          ) : (
            /* Mode 2: Clean Distraction-Free Reader Mode */
            <div className={`flex-1 overflow-y-auto p-6 md:p-10 transition-colors ${
              readerTheme === 'slate' ? 'bg-slate-950 text-slate-100' :
              readerTheme === 'sepia' ? 'bg-[#1c1917] text-[#fed7aa]' :
              'bg-black text-slate-200'
            }`}>
              <div className="max-w-3xl mx-auto flex flex-col gap-6">
                {/* Reader Controls Toolbar */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Clean Reader Mode</span>
                    </span>
                    {articleData?.readingTimeMinutes && (
                      <span className="text-xs text-slate-400">
                        ⏱️ ~{articleData.readingTimeMinutes} min read ({articleData.wordCount} words)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Font Size Selector */}
                    <div className="flex items-center bg-slate-900 border border-white/10 rounded-xl p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setReaderFontSize('sm')}
                        className={`px-2 py-0.5 rounded-lg ${readerFontSize === 'sm' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}
                        title="Small font"
                      >
                        A-
                      </button>
                      <button
                        type="button"
                        onClick={() => setReaderFontSize('base')}
                        className={`px-2 py-0.5 rounded-lg ${readerFontSize === 'base' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}
                        title="Default font"
                      >
                        A
                      </button>
                      <button
                        type="button"
                        onClick={() => setReaderFontSize('lg')}
                        className={`px-2 py-0.5 rounded-lg ${readerFontSize === 'lg' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}
                        title="Large font"
                      >
                        A+
                      </button>
                    </div>

                    {/* Reader Theme Selector */}
                    <div className="flex items-center bg-slate-900 border border-white/10 rounded-xl p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setReaderTheme('slate')}
                        className={`px-2 py-0.5 rounded-lg ${readerTheme === 'slate' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                      >
                        Dark
                      </button>
                      <button
                        type="button"
                        onClick={() => setReaderTheme('sepia')}
                        className={`px-2 py-0.5 rounded-lg ${readerTheme === 'sepia' ? 'bg-amber-900/60 text-amber-200' : 'text-slate-400'}`}
                      >
                        Sepia
                      </button>
                      <button
                        type="button"
                        onClick={() => setReaderTheme('black')}
                        className={`px-2 py-0.5 rounded-lg ${readerTheme === 'black' ? 'bg-zinc-800 text-white' : 'text-slate-400'}`}
                      >
                        OLED
                      </button>
                    </div>

                    {/* Switch to Web View */}
                    <button
                      type="button"
                      onClick={() => handleToggleViewMode('embed')}
                      className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/10 text-xs font-semibold"
                    >
                      Web View
                    </button>
                  </div>
                </div>

                {isLoadingArticle ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
                    <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin" />
                    <p className="text-sm font-semibold">Extracting clean article notes from source...</p>
                  </div>
                ) : (
                  <>
                    {/* Article Header */}
                    <div className="flex flex-col gap-2">
                      <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                        {articleData?.title || 'Study Article'}
                      </h1>

                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        {articleData?.source && (
                          <span className="font-semibold text-cyan-400">
                            {articleData.source}
                          </span>
                        )}
                        {articleData?.byline && (
                          <span>By {articleData.byline}</span>
                        )}
                        {articleData?.publishedTime && (
                          <span>📅 {articleData.publishedTime}</span>
                        )}
                      </div>
                    </div>

                    {/* Quick Action to send content to Scratchpad */}
                    <div className="flex items-center gap-2 py-2 border-y border-white/5">
                      <button
                        type="button"
                        onClick={() => {
                          if (articleData?.textContent) {
                            const newContent = `${scratchNotes ? scratchNotes + '\n\n' : ''}--- ${articleData.title} ---\n${articleData.textContent.slice(0, 1000)}...`;
                            handleScratchChange(newContent);
                            addToast('Notes Appended', 'Article excerpt added to your Vocab & Notes pad!', 'success');
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-colors"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>Save Excerpt to Scratch Notes</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (onAskAiDoubt && articleData?.title) {
                            onAskAiDoubt(`Please provide a concise summary, key exam points, and 3 expected questions from this article: "${articleData.title}" (${articleData.url})\n\nExcerpt:\n${articleData.textContent.slice(0, 1500)}`);
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Ask AI Coach for Exam Summary</span>
                      </button>
                    </div>

                    {/* Article Body Content */}
                    <div
                      className={`leading-relaxed prose prose-invert max-w-none ${
                        readerFontSize === 'sm' ? 'text-xs' :
                        readerFontSize === 'base' ? 'text-sm' :
                        readerFontSize === 'lg' ? 'text-base' :
                        'text-lg'
                      }`}
                      dangerouslySetInnerHTML={{ __html: articleData?.contentHtml || '' }}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Bottom Frame Utility Bar */}
          <div className="bg-slate-900 border-t border-white/10 px-3.5 py-1.5 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
              <span className="truncate max-w-sm sm:max-w-md font-mono text-[11px] text-slate-300">
                {currentUrl}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Bookmark Toggle in Bottom Bar */}
              <button
                type="button"
                onClick={handleToggleBookmark}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg transition-colors text-[11px] font-semibold ${
                  isCurrentBookmarked
                    ? 'text-amber-400 bg-amber-500/10'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title="Toggle Bookmark"
              >
                <Star className={`w-3 h-3 ${isCurrentBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
                <span>{isCurrentBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyUrl}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors text-[11px]"
                title="Copy Article URL"
              >
                {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span className="hidden sm:inline">{copiedUrl ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (viewMode === 'embed' && iframeRef.current) {
                    iframeRef.current.src = `${API_BASE_URL}/api/proxy/web?url=${encodeURIComponent(currentUrl)}&t=${Date.now()}`;
                  } else {
                    fetchArticleContent(currentUrl);
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
                <span>New Tab</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Side-by-Side Live Room Chat, Bookmarks & Notes Sidebar */}
        {isSidebarOpen && (
          <div className="w-full lg:w-96 shrink-0 h-full border-t lg:border-t-0 lg:border-l border-white/10 bg-slate-950/95 backdrop-blur-md flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Sidebar Navigation Tabs */}
            <div className="p-2 border-b border-white/10 bg-slate-900/60 flex items-center justify-between">
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-white/10 text-xs w-full overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSidebarTab('chat')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold transition-all whitespace-nowrap ${
                    sidebarTab === 'chat'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Live Room Chat with friends"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSidebarTab('bookmarks')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold transition-all whitespace-nowrap ${
                    sidebarTab === 'bookmarks'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Saved Study Bookmarks"
                >
                  <Star className="w-3.5 h-3.5" />
                  <span>Bookmarks ({bookmarks.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSidebarTab('notes')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold transition-all whitespace-nowrap ${
                    sidebarTab === 'notes'
                      ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Scratchpad & Vocab notes"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Notes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSidebarTab('ai')}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg font-bold transition-all whitespace-nowrap ${
                    sidebarTab === 'ai'
                      ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="AI Study Coach Doubts"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Doubts</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="ml-2 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
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

            {/* Sidebar Tab 2: Study Bookmarks Manager */}
            {sidebarTab === 'bookmarks' && (
              <div className="flex-1 flex flex-col p-3 gap-2.5 overflow-hidden">
                {/* Bookmarks Header & Add Button */}
                <div className="flex items-center justify-between pb-1 border-b border-white/5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <BookMarked className="w-3.5 h-3.5" />
                    <span>Saved Study Bookmarks</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingBookmark(!isAddingBookmark)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Link</span>
                  </button>
                </div>

                {/* Inline Add Bookmark Form */}
                {isAddingBookmark && (
                  <form onSubmit={handleAddCustomBookmark} className="bg-slate-900 border border-amber-500/30 rounded-2xl p-3 flex flex-col gap-2 shadow-lg animate-in fade-in duration-200">
                    <span className="text-xs font-bold text-amber-300">Add New Bookmark</span>
                    <input
                      type="text"
                      value={newBookmarkTitle}
                      onChange={e => setNewBookmarkTitle(e.target.value)}
                      placeholder="Title (e.g. RBI Notification, Drishti CA)..."
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                    <input
                      type="text"
                      value={newBookmarkUrl}
                      onChange={e => setNewBookmarkUrl(e.target.value)}
                      placeholder="URL (e.g. affairscloud.com or full link)..."
                      required
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 font-mono"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={newBookmarkCategory}
                        onChange={e => setNewBookmarkCategory(e.target.value as BookmarkCategory)}
                        className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                      >
                        <option value="Editorials">Editorials</option>
                        <option value="Current Affairs">Current Affairs</option>
                        <option value="Banking & GK">Banking & GK</option>
                        <option value="Govt Schemes">Govt Schemes</option>
                        <option value="Custom">Custom</option>
                      </select>
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-sm"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingBookmark(false)}
                        className="px-2 py-1.5 text-slate-400 hover:text-white text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Bookmark Search & Category Filter */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1 text-xs text-slate-200">
                    <Search className="w-3 h-3 text-slate-400 mr-1.5 shrink-0" />
                    <input
                      type="text"
                      value={bookmarkSearchFilter}
                      onChange={e => setBookmarkSearchFilter(e.target.value)}
                      placeholder="Filter bookmarks..."
                      className="w-full bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none text-[11px]"
                    />
                    {bookmarkSearchFilter && (
                      <button type="button" onClick={() => setBookmarkSearchFilter('')}>
                        <X className="w-3 h-3 text-slate-400" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5 text-[10px]">
                    {['All', 'Editorials', 'Current Affairs', 'Banking & GK', 'Govt Schemes'].map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedBookmarkCategory(cat)}
                        className={`px-2 py-0.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                          selectedBookmarkCategory === cat
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                            : 'bg-slate-900 text-slate-400 hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bookmarks List */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                  {filteredBookmarks.length === 0 ? (
                    <div className="text-center py-10 flex flex-col items-center gap-2 text-slate-500">
                      <Star className="w-6 h-6 text-slate-600" />
                      <p className="text-xs">No bookmarks found.</p>
                      <button
                        type="button"
                        onClick={handleRestoreDefaults}
                        className="text-[11px] text-amber-400 hover:underline"
                      >
                        Restore standard study portals
                      </button>
                    </div>
                  ) : (
                    filteredBookmarks.map(bm => {
                      const isActive = normalizeUrlForCompare(bm.url) === normalizeUrlForCompare(currentUrl);
                      return (
                        <div
                          key={bm.id}
                          className={`p-2.5 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                            isActive
                              ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
                              : 'bg-slate-900/60 border-white/5 hover:border-white/15 hover:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenBookmark(bm)}
                              className="text-left font-bold text-xs text-slate-200 hover:text-amber-300 line-clamp-1 flex-1 flex items-center gap-1"
                            >
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                              <span>{bm.title}</span>
                            </button>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => window.open(bm.url, '_blank')}
                                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                                title="Open in new tab"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBookmark(bm.id, bm.title)}
                                className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
                                title="Delete Bookmark"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span className="truncate max-w-[180px] font-mono opacity-70">
                              {bm.url.replace(/^https?:\/\//i, '')}
                            </span>
                            <span className="px-1.5 py-0.2 rounded bg-black/40 text-slate-300 font-medium">
                              {bm.category}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pt-1 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{bookmarks.length} saved portals</span>
                  <button
                    type="button"
                    onClick={handleRestoreDefaults}
                    className="hover:text-amber-300 transition-colors"
                  >
                    Reset Defaults
                  </button>
                </div>
              </div>
            )}

            {/* Sidebar Tab 3: Editorial Vocab Pad & Scratch Notes */}
            {sidebarTab === 'notes' && (
              <div className="flex-1 flex flex-col p-3 gap-2 overflow-hidden">
                <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-white/5">
                  <div className="flex items-center gap-1.5 font-bold text-teal-300">
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
                  className="flex-1 w-full bg-slate-900 border border-white/10 rounded-2xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono resize-none leading-relaxed"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 text-xs font-bold transition-all disabled:opacity-30"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate AI Flashcards</span>
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

            {/* Sidebar Tab 4: AI Study Coach Doubt Solver */}
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
          title="Open Live Room Chat, Bookmarks & Notes Sidebar"
        >
          <MessageSquare className="w-4 h-4 text-cyan-300" />
          <span>Chat & Bookmarks ({bookmarks.length})</span>
        </button>
      )}
    </div>
  );
};
