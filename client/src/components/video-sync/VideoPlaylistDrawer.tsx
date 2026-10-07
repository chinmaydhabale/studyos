import React, { useState, useEffect } from 'react';
import {
  Play,
  Plus,
  Trash2,
  ListVideo,
  FolderPlus,
  Shuffle,
  Repeat,
  Repeat1,
  Sparkles,
  Check,
  Film,
  ArrowUp,
  ArrowDown,
  X,
  ExternalLink,
  BookmarkPlus,
  Clock
} from 'lucide-react';

export interface PlaylistItem {
  id: string;
  videoId: string;
  url: string;
  title: string;
  channel?: string;
  addedAt: number;
}

export interface VideoPlaylist {
  id: string;
  name: string;
  description?: string;
  items: PlaylistItem[];
  createdAt: number;
}

const STORAGE_PLAYLISTS_KEY = 'studyos_video_playlists';
const STORAGE_QUEUE_KEY = 'studyos_video_queue';
const STORAGE_AUTOPLAY_KEY = 'studyos_video_autoplay_next';
const STORAGE_LOOP_KEY = 'studyos_video_loop_current';

const DEFAULT_PLAYLISTS: VideoPlaylist[] = [
  {
    id: 'pl-maths-masterclass',
    name: 'Quantitative Aptitude & Maths',
    description: 'Speed maths, arithmetic shortcuts, and problem derivations',
    createdAt: Date.now() - 86400000,
    items: [
      {
        id: 'item-1',
        videoId: 'k7YS_P_t3uA',
        url: 'https://www.youtube.com/watch?v=k7YS_P_t3uA',
        title: 'Thermodynamics & Fundamental Physical Principles',
        channel: 'Physics & Engineering',
        addedAt: Date.now() - 86400000
      },
      {
        id: 'item-2',
        videoId: '2I-_SV8cwsw',
        url: 'https://www.youtube.com/watch?v=2I-_SV8cwsw',
        title: 'Calculus: Integration by Parts & Rapid Shortcuts',
        channel: 'Math Master',
        addedAt: Date.now() - 80000000
      }
    ]
  },
  {
    id: 'pl-current-affairs',
    name: 'Current Affairs & Editorial Analysis',
    description: 'Daily news analysis, editorials, and general awareness',
    createdAt: Date.now() - 40000000,
    items: [
      {
        id: 'item-3',
        videoId: '7X8II6J-6mU',
        url: 'https://www.youtube.com/watch?v=7X8II6J-6mU',
        title: 'Current Affairs & In-Depth Editorial Breakdown',
        channel: 'StudyOS Classroom',
        addedAt: Date.now() - 40000000
      }
    ]
  }
];

interface VideoPlaylistDrawerProps {
  currentVideoId?: string;
  currentVideoUrl?: string;
  onPlayVideo: (url: string, videoId: string, title?: string) => void;
  queue: PlaylistItem[];
  onUpdateQueue: (newQueue: PlaylistItem[]) => void;
  autoPlayNext: boolean;
  onToggleAutoPlayNext: () => void;
  loopCurrent: boolean;
  onToggleLoopCurrent: () => void;
  onClose?: () => void;
  addToast: (title: string, message: string, type?: 'success' | 'info' | 'alert') => void;
}

export const VideoPlaylistDrawer: React.FC<VideoPlaylistDrawerProps> = ({
  currentVideoId,
  currentVideoUrl,
  onPlayVideo,
  queue,
  onUpdateQueue,
  autoPlayNext,
  onToggleAutoPlayNext,
  loopCurrent,
  onToggleLoopCurrent,
  onClose,
  addToast
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'playlists'>('queue');
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_PLAYLISTS;
    try {
      const saved = localStorage.getItem(STORAGE_PLAYLISTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_PLAYLISTS;
  });

  const [activePlaylistId, setActivePlaylistId] = useState<string>(() => {
    return playlists[0]?.id || '';
  });

  // Modal / Inline states
  const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);
  const [videoToSave, setVideoToSave] = useState<{ url: string; videoId: string; title: string } | null>(null);

  // Sync playlists to localStorage
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_PLAYLISTS_KEY, JSON.stringify(playlists));
      }
    } catch {}
  }, [playlists]);

  const activePlaylist = playlists.find(p => p.id === activePlaylistId) || playlists[0];

  // Helper to extract YouTube video ID
  const extractVideoId = (url: string): string => {
    if (!url) return '';
    const trimmed = url.trim();
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match) return match[1];
    return /^[\w-]{11}$/.test(trimmed) ? trimmed : '';
  };

  // Queue Operations
  const handleRemoveFromQueue = (index: number) => {
    const nextQueue = queue.filter((_, i) => i !== index);
    onUpdateQueue(nextQueue);
    addToast('Removed from Queue', 'Lecture removed from up next queue.', 'info');
  };

  const handleMoveQueueItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= queue.length) return;
    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);
    onUpdateQueue(newQueue);
  };

  const handleClearQueue = () => {
    if (queue.length === 0) return;
    onUpdateQueue([]);
    addToast('Queue Cleared', 'All upcoming lectures removed from queue.', 'info');
  };

  const handleShuffleQueue = () => {
    if (queue.length <= 1) return;
    const shuffled = [...queue].sort(() => Math.random() - 0.5);
    onUpdateQueue(shuffled);
    addToast('Queue Shuffled', 'Up next order randomized.', 'info');
  };

  const handleSaveQueueAsPlaylist = () => {
    if (queue.length === 0) {
      addToast('Queue Empty', 'Add videos to the queue first before saving as a playlist.', 'alert');
      return;
    }
    const name = `Study Session Queue (${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })})`;
    const newPl: VideoPlaylist = {
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      description: `Saved from playback queue with ${queue.length} lectures`,
      items: [...queue],
      createdAt: Date.now()
    };
    setPlaylists(prev => [newPl, ...prev]);
    setActivePlaylistId(newPl.id);
    setActiveTab('playlists');
    addToast('Playlist Created', `Saved ${queue.length} queued lectures to "${name}"!`, 'success');
  };

  // Playlist Operations
  const handleCreatePlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    const newPl: VideoPlaylist = {
      id: `pl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      description: newPlaylistDesc.trim() || undefined,
      items: [],
      createdAt: Date.now()
    };
    setPlaylists(prev => [newPl, ...prev]);
    setActivePlaylistId(newPl.id);
    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setShowNewPlaylistModal(false);
    addToast('Playlist Created', `"${name}" is ready for lectures!`, 'success');
  };

  const handleDeletePlaylist = (playlistId: string) => {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    const remaining = playlists.filter(p => p.id !== playlistId);
    setPlaylists(remaining);
    if (activePlaylistId === playlistId) {
      setActivePlaylistId(remaining[0]?.id || '');
    }
    addToast('Playlist Deleted', `"${pl.name}" has been removed.`, 'info');
  };

  const handlePlayAllPlaylist = (pl: VideoPlaylist) => {
    if (!pl.items || pl.items.length === 0) {
      addToast('Playlist Empty', 'This playlist has no videos yet. Add videos to play.', 'alert');
      return;
    }
    const [first, ...rest] = pl.items;
    onPlayVideo(first.url, first.videoId, first.title);
    onUpdateQueue(rest);
    addToast('Playing Playlist', `Started "${pl.name}" with ${rest.length} videos queued up!`, 'success');
  };

  const handleAddPlaylistToQueue = (pl: VideoPlaylist) => {
    if (!pl.items || pl.items.length === 0) return;
    onUpdateQueue([...queue, ...pl.items]);
    addToast('Added to Queue', `Added all ${pl.items.length} lectures from "${pl.name}" to queue.`, 'success');
  };

  const handleRemoveFromPlaylist = (playlistId: string, itemId: string) => {
    setPlaylists(prev =>
      prev.map(pl => {
        if (pl.id !== playlistId) return pl;
        return {
          ...pl,
          items: pl.items.filter(item => item.id !== itemId)
        };
      })
    );
    addToast('Removed from Playlist', 'Lecture removed from this playlist.', 'info');
  };

  const handleAddVideoToSpecificPlaylist = (targetPlaylistId: string) => {
    if (!videoToSave) return;
    const pl = playlists.find(p => p.id === targetPlaylistId);
    if (!pl) return;

    // Prevent duplicates
    if (pl.items.some(it => it.videoId === videoToSave.videoId)) {
      addToast('Already in Playlist', `This video is already in "${pl.name}".`, 'info');
      setShowAddToPlaylistModal(false);
      setVideoToSave(null);
      return;
    }

    const newItem: PlaylistItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      videoId: videoToSave.videoId,
      url: videoToSave.url,
      title: videoToSave.title,
      addedAt: Date.now()
    };

    setPlaylists(prev =>
      prev.map(p => (p.id === targetPlaylistId ? { ...p, items: [...p.items, newItem] } : p))
    );

    addToast('Saved to Playlist', `Added to "${pl.name}"!`, 'success');
    setShowAddToPlaylistModal(false);
    setVideoToSave(null);
  };

  const handleOpenSaveCurrentModal = () => {
    if (!currentVideoId) {
      addToast('No Video Playing', 'Play a video first to save it to a playlist.', 'alert');
      return;
    }
    const url = currentVideoUrl || `https://www.youtube.com/watch?v=${currentVideoId}`;
    setVideoToSave({
      url,
      videoId: currentVideoId,
      title: `Lecture (${currentVideoId})`
    });
    setShowAddToPlaylistModal(true);
  };

  return (
    <div className="h-full flex flex-col bg-slate-950/95 backdrop-blur-md rounded-2xl border border-white/10 text-slate-100 overflow-hidden shadow-2xl">
      {/* 1. Header with Tabs & Controls */}
      <div className="p-3 border-b border-white/10 bg-slate-900/80 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('queue')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'queue'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ListVideo className="w-3.5 h-3.5" />
              <span>Up Next Queue</span>
              {queue.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-400/30 text-indigo-200">
                  {queue.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('playlists')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'playlists'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Playlists</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/10 text-slate-300">
                {playlists.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            {currentVideoId && (
              <button
                onClick={handleOpenSaveCurrentModal}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-colors"
                title="Save Current Video to Playlist"
              >
                <BookmarkPlus className="w-4 h-4 text-cyan-300" />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Global Playback Preferences Toolbar */}
        <div className="flex items-center justify-between text-xs pt-1 px-1">
          <div className="flex items-center gap-3">
            {/* Auto-Play Next Toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white transition-colors select-none">
              <input
                type="checkbox"
                checked={autoPlayNext}
                onChange={onToggleAutoPlayNext}
                className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
              />
              <span className="text-[11px] font-medium">Auto-play Next</span>
            </label>

            {/* Loop Toggle */}
            <button
              onClick={onToggleLoopCurrent}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-all ${
                loopCurrent
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-bold'
                  : 'bg-white/5 text-slate-400 border-white/5 hover:text-white'
              }`}
              title="Repeat current lecture continuously"
            >
              <Repeat className={`w-3 h-3 ${loopCurrent ? 'text-indigo-400' : ''}`} />
              <span>{loopCurrent ? 'Loop ON' : 'Loop'}</span>
            </button>
          </div>

          {activeTab === 'queue' && queue.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleShuffleQueue}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
                title="Shuffle Queue"
              >
                <Shuffle className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleSaveQueueAsPlaylist}
                className="p-1 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-white/5"
                title="Save Queue as Named Playlist"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleClearQueue}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/5"
                title="Clear All in Queue"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Main Content Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {/* ================= TAB 1: QUEUE ================= */}
        {activeTab === 'queue' && (
          <div className="space-y-3">
            {/* Now Playing Banner */}
            {currentVideoId && (
              <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-center gap-2.5 shadow-sm">
                <div className="relative w-16 h-10 rounded-lg overflow-hidden bg-black shrink-0 border border-white/10">
                  <img
                    src={`https://img.youtube.com/vi/${currentVideoId}/mqdefault.jpg`}
                    alt="Now playing"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-400 tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Now Playing
                  </div>
                  <h4 className="text-xs font-bold text-white truncate">
                    Lecture ({currentVideoId})
                  </h4>
                </div>
              </div>
            )}

            {/* Queue List */}
            {queue.length === 0 ? (
              <div className="py-12 px-4 text-center rounded-2xl bg-white/[0.02] border border-dashed border-white/10 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
                  <ListVideo className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">The Queue is Empty</h4>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] mx-auto">
                    Paste YouTube links in the top bar or load videos from your Playlists to build a study queue!
                  </p>
                </div>
                {playlists.length > 0 && (
                  <button
                    onClick={() => setActiveTab('playlists')}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/10 text-xs font-medium transition-colors"
                  >
                    Browse Playlists →
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 px-1">
                  <span>Up Next ({queue.length})</span>
                  <span>Drag or Move</span>
                </div>

                {queue.map((item, idx) => (
                  <div
                    key={item.id}
                    className="group p-2 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-white/10 hover:border-indigo-500/30 flex items-center gap-2.5 transition-all shadow-sm"
                  >
                    <span className="font-mono text-[11px] font-semibold text-slate-500 w-4 text-center">
                      {idx + 1}
                    </span>

                    {/* Thumbnail */}
                    <div className="relative w-16 h-10 rounded-lg overflow-hidden bg-black shrink-0 border border-white/10 group-hover:border-indigo-400/50">
                      <img
                        src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                      <button
                        onClick={() => {
                          onPlayVideo(item.url, item.videoId, item.title);
                          handleRemoveFromQueue(idx);
                        }}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        title="Play Now"
                      >
                        <Play className="w-4 h-4 text-white fill-white" />
                      </button>
                    </div>

                    {/* Title & Metadata */}
                    <div className="min-w-0 flex-1">
                      <h5 className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                        {item.title}
                      </h5>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        {item.channel || `ID: ${item.videoId}`}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleMoveQueueItem(idx, idx - 1)}
                        disabled={idx === 0}
                        className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMoveQueueItem(idx, idx + 1)}
                        disabled={idx === queue.length - 1}
                        className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveFromQueue(idx)}
                        className="p-1 rounded text-slate-400 hover:text-rose-400 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: PLAYLISTS ================= */}
        {activeTab === 'playlists' && (
          <div className="space-y-3">
            {/* Playlist Selector & New Playlist Button */}
            <div className="flex items-center gap-2">
              <select
                value={activePlaylistId}
                onChange={(e) => setActivePlaylistId(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
              >
                {playlists.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.items?.length || 0})
                  </option>
                ))}
              </select>

              <button
                onClick={() => setShowNewPlaylistModal(true)}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors whitespace-nowrap"
                title="Create a New Playlist"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>

            {/* Active Playlist Details Card */}
            {activePlaylist && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white truncate">
                      {activePlaylist.name}
                    </h4>
                    {activePlaylist.description && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {activePlaylist.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handlePlayAllPlaylist(activePlaylist)}
                      disabled={!activePlaylist.items?.length}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold transition-colors shadow-sm"
                      title="Play All from First Video"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      <span>Play All</span>
                    </button>
                    <button
                      onClick={() => handleAddPlaylistToQueue(activePlaylist)}
                      disabled={!activePlaylist.items?.length}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-slate-300 hover:text-white border border-white/5 transition-colors"
                      title="Add Entire Playlist to Queue"
                    >
                      <ListVideo className="w-3.5 h-3.5 text-cyan-300" />
                    </button>
                    {playlists.length > 1 && (
                      <button
                        onClick={() => handleDeletePlaylist(activePlaylist.id)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete Playlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Items in active playlist */}
                {(!activePlaylist.items || activePlaylist.items.length === 0) ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    <Film className="w-5 h-5 mx-auto mb-1 text-slate-600" />
                    No videos in this playlist yet. Add videos from YouTube link or queue!
                  </div>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {activePlaylist.items.map((item, idx) => (
                      <div
                        key={item.id}
                        className="group p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-white/5 hover:border-indigo-500/25 flex items-center gap-2.5 transition-all"
                      >
                        <span className="font-mono text-[10px] text-slate-500 w-3 text-center">
                          {idx + 1}
                        </span>

                        <div className="relative w-14 h-9 rounded-md overflow-hidden bg-black shrink-0 border border-white/10">
                          <img
                            src={`https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                          <button
                            onClick={() => onPlayVideo(item.url, item.videoId, item.title)}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                            title="Play Now"
                          >
                            <Play className="w-3 h-3 text-white fill-white" />
                          </button>
                        </div>

                        <div className="min-w-0 flex-1">
                          <h5 className="text-[11px] font-semibold text-slate-200 group-hover:text-white truncate">
                            {item.title}
                          </h5>
                          <p className="text-[9px] text-slate-400 truncate">
                            {item.channel || `ID: ${item.videoId}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              onUpdateQueue([...queue, item]);
                              addToast('Queued', `Added "${item.title}" to Up Next!`, 'success');
                            }}
                            className="p-1 rounded text-slate-400 hover:text-cyan-300"
                            title="Add to Up Next Queue"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemoveFromPlaylist(activePlaylist.id, item.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400"
                            title="Remove from Playlist"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. New Playlist Modal */}
      {showNewPlaylistModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/15 p-4 shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                <FolderPlus className="w-4 h-4 text-indigo-400" />
                <span>Create Study Playlist</span>
              </h3>
              <button
                onClick={() => setShowNewPlaylistModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase">
                  Playlist Name
                </label>
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="e.g. Reasoning Puzzles & Seating"
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  placeholder="e.g. IBPS RRB PO Mains Revision"
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setShowNewPlaylistModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim()}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-colors"
              >
                Create Playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Add to Playlist Selector Modal */}
      {showAddToPlaylistModal && videoToSave && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-white/15 p-4 shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                <BookmarkPlus className="w-4 h-4 text-cyan-400" />
                <span>Save to Playlist</span>
              </h3>
              <button
                onClick={() => {
                  setShowAddToPlaylistModal(false);
                  setVideoToSave(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 font-medium truncate">
              {videoToSave.title}
            </p>

            <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
              {playlists.map(pl => (
                <button
                  key={pl.id}
                  onClick={() => handleAddVideoToSpecificPlaylist(pl.id)}
                  className="w-full p-2.5 rounded-xl bg-slate-950/70 hover:bg-indigo-600/20 border border-white/5 hover:border-indigo-500/30 flex items-center justify-between text-left transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <h5 className="text-xs font-semibold text-white group-hover:text-cyan-300 truncate">
                      {pl.name}
                    </h5>
                    <span className="text-[10px] text-slate-400">
                      {pl.items?.length || 0} lectures
                    </span>
                  </div>
                  <Plus className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0" />
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-white/10 flex justify-between items-center">
              <button
                onClick={() => {
                  setShowAddToPlaylistModal(false);
                  setShowNewPlaylistModal(true);
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Playlist</span>
              </button>
              <button
                onClick={() => {
                  setShowAddToPlaylistModal(false);
                  setVideoToSave(null);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
