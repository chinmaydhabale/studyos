import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  FastForward,
  Link,
  Users,
  MessageSquare,
  Volume2,
  VolumeX,
  Maximize2,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  ListVideo,
  SkipForward,
  Repeat,
  Plus,
  X
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { VoiceChatPanel } from '../voice-chat/VoiceChatPanel.js';
import { VideoPlaylistDrawer, PlaylistItem } from './VideoPlaylistDrawer.js';

// YouTube IFrame Player Window global declaration
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface SyncTheaterProps {
  onAskAiDoubtAtTimestamp?: (timestamp: number) => void;
}

export const SyncTheater: React.FC<SyncTheaterProps> = ({ onAskAiDoubtAtTimestamp }) => {
  const {
    videoState,
    sendVideoChange,
    sendVideoPlay,
    sendVideoPause,
    sendVideoSeek,
    sendVideoRate,
    peers,
    currentUser,
    addToast
  } = useSocket();

  const [inputUrl, setInputUrl] = useState('');
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [localIsPlaying, setLocalIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing'>('synced');
  const [isChatOpen, setIsChatOpen] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'playlist'>('chat');

  // Video Queue & Playback preferences with localStorage persistence
  const [queue, setQueue] = useState<PlaylistItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('studyos_video_queue');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [autoPlayNext, setAutoPlayNext] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('studyos_video_autoplay_next');
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return true;
  });

  const [loopCurrent, setLoopCurrent] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = localStorage.getItem('studyos_video_loop_current');
      if (saved !== null) return JSON.parse(saved);
    } catch {}
    return false;
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('studyos_video_queue', JSON.stringify(queue));
      }
    } catch {}
  }, [queue]);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInternalActionRef = useRef<boolean>(false);
  // Always-current mirrors so the mount-time player init effect never reads stale state
  const videoStateRef = useRef(videoState);
  const volumeRef = useRef(volume);
  const queueRef = useRef(queue);
  const autoPlayNextRef = useRef(autoPlayNext);
  const loopCurrentRef = useRef(loopCurrent);
  videoStateRef.current = videoState;
  volumeRef.current = volume;
  queueRef.current = queue;
  autoPlayNextRef.current = autoPlayNext;
  loopCurrentRef.current = loopCurrent;
  // Tracks the last rate we applied locally so remote echoes don't re-apply / loop
  const lastAppliedRateRef = useRef<number>(1);

  // Helper to extract YouTube ID from full URL. Returns '' for anything unparseable
  // so callers can warn the user instead of silently loading an unrelated lecture.
  const extractVideoId = (url: string): string => {
    if (!url) return '';
    const trimmed = url.trim();
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match) return match[1];
    return /^[\w-]{11}$/.test(trimmed) ? trimmed : '';
  };

  // Load YouTube lecture helper
  const handleLoadNewVideo = (url: string, title?: string) => {
    const targetUrl = url || inputUrl;
    if (!targetUrl.trim()) return;
    const vid = extractVideoId(targetUrl);
    if (!vid) {
      addToast('Invalid YouTube Link', 'That link could not be parsed. Please paste a valid YouTube video URL.', 'warning');
      return;
    }
    sendVideoChange(targetUrl, vid);
    setInputUrl('');
    addToast('Class Loaded', title ? `Playing: ${title}` : 'New YouTube lecture loaded for both students!', 'success');
  };

  const handleLoadNewVideoRef = useRef(handleLoadNewVideo);
  handleLoadNewVideoRef.current = handleLoadNewVideo;

  // Load YouTube IFrame API script
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      const el = document.getElementById('yt-player-frame');
      if (!el) return;
      if (window.YT && window.YT.Player && !playerRef.current) {
        // Read the freshest state at init time instead of the mount-time closure
        const latest = videoStateRef.current;
        try {
          playerRef.current = new window.YT.Player('yt-player-frame', {
            // The API replaces our div with an iframe and drops its className,
            // so size the iframe explicitly to fill the stage.
            width: '100%',
            height: '100%',
            videoId: latest.videoId || 'k7YS_P_t3uA',
            playerVars: {
              autoplay: 0,
              controls: 0, // Custom synchronized controls
              rel: 0,
              modestbranding: 1,
              disablekb: 1,
              fs: 0
            },
            events: {
              onReady: (event: any) => {
                setPlayerReady(true);
                setDuration(event.target.getDuration());
                event.target.setVolume(volumeRef.current);
                // Re-read the latest state here too — the room may have moved on
                // between mount and the player actually becoming ready.
                const ready = videoStateRef.current;
                if (ready.currentTime > 0) {
                  event.target.seekTo(ready.currentTime, true);
                }
                if (ready.playbackRate && ready.playbackRate !== 1) {
                  event.target.setPlaybackRate(ready.playbackRate);
                  lastAppliedRateRef.current = ready.playbackRate;
                }
                if (ready.isPlaying) {
                  event.target.playVideo();
                }
              },
              onStateChange: (event: any) => {
                if (event.data === window.YT.PlayerState.PLAYING) {
                  setLocalIsPlaying(true);
                  if (playerRef.current?.getDuration) {
                    setDuration(playerRef.current.getDuration());
                  }
                } else if (event.data === window.YT.PlayerState.PAUSED) {
                  setLocalIsPlaying(false);
                } else if (event.data === window.YT.PlayerState.ENDED) {
                  setLocalIsPlaying(false);
                  if (loopCurrentRef.current) {
                    try {
                      playerRef.current?.seekTo(0, true);
                      playerRef.current?.playVideo();
                      sendVideoSeek(0);
                      sendVideoPlay(0);
                      addToast('Looping Lecture', 'Replaying current lecture from start.', 'info');
                    } catch (e) {}
                  } else if (autoPlayNextRef.current && queueRef.current.length > 0) {
                    const [nextItem, ...remainingQueue] = queueRef.current;
                    setQueue(remainingQueue);
                    handleLoadNewVideoRef.current(nextItem.url, nextItem.title);
                  }
                }
              }
            }
          });
        } catch (e) {
          console.warn('Error mounting YouTube player:', e);
        }
      }
    };

    if (window.YT && window.YT.Player) {
      setTimeout(initPlayer, 50);
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      try {
        if (playerRef.current && typeof playerRef.current.destroy === 'function') {
          playerRef.current.destroy();
        }
      } catch (e) {}
      playerRef.current = null;
      setPlayerReady(false);
    };
  }, []);

  // Update video ID if room videoId changes
  useEffect(() => {
    if (playerReady && playerRef.current && videoState.videoId) {
      const currentVideoUrl = playerRef.current.getVideoUrl?.() || '';
      if (!currentVideoUrl.includes(videoState.videoId)) {
        if (videoState.isPlaying) {
          playerRef.current.loadVideoById(videoState.videoId, videoState.currentTime || 0);
        } else {
          playerRef.current.cueVideoById(videoState.videoId, videoState.currentTime || 0);
        }
      }
    }
  }, [videoState.videoId, playerReady, videoState.isPlaying]);

  // Synchronize remote play / pause / seek from peers
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;

    // Only swallow the echo of our own action. A remote update that arrives right
    // after a local one must still be applied, so we clear the flag and continue
    // instead of returning early.
    if (isInternalActionRef.current) {
      isInternalActionRef.current = false;
    }

    try {
      const currentLocalTime = playerRef.current.getCurrentTime?.() || 0;
      const drift = Math.abs(currentLocalTime - videoState.currentTime);

      // If drift is significant (>1.5s), seek to match partner
      if (drift > 1.5) {
        setSyncStatus('syncing');
        playerRef.current.seekTo(videoState.currentTime, true);
        setTimeout(() => setSyncStatus('synced'), 800);
      }

      if (videoState.isPlaying && playerRef.current.getPlayerState?.() !== window.YT.PlayerState.PLAYING) {
        playerRef.current.playVideo();
      } else if (!videoState.isPlaying && playerRef.current.getPlayerState?.() === window.YT.PlayerState.PLAYING) {
        playerRef.current.pauseVideo();
      }
    } catch (e) {
      console.warn('Sync error:', e);
    }
  }, [videoState.isPlaying, videoState.currentTime, videoState.lastUpdated, playerReady]);

  // Apply remote playback-rate changes to the local player
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    const rate = videoState.playbackRate;
    if (!rate || rate === lastAppliedRateRef.current) return;
    try {
      playerRef.current.setPlaybackRate(rate);
      lastAppliedRateRef.current = rate;
      setPlaybackRate(rate);
    } catch (e) {
      console.warn('Rate sync error:', e);
    }
  }, [videoState.playbackRate, playerReady]);

  // Periodic time tracker for slider & time display
  useEffect(() => {
    const interval = setInterval(() => {
      if (playerReady && playerRef.current && playerRef.current.getCurrentTime) {
        try {
          const time = playerRef.current.getCurrentTime();
          setCurrentTime(time);
        } catch (e) {}
      }
    }, 500);
    return () => clearInterval(interval);
  }, [playerReady]);

  // Controls Handlers
  const handleTogglePlay = () => {
    if (!playerReady || !playerRef.current) return;
    isInternalActionRef.current = true;

    if (localIsPlaying) {
      playerRef.current.pauseVideo();
      sendVideoPause(currentTime);
      addToast('Video Paused', `You paused the video for everyone at ${formatTime(currentTime)}.`, 'info');
    } else {
      playerRef.current.playVideo();
      sendVideoPlay(currentTime);
      addToast('Video Playing', `You started synchronized playback for everyone.`, 'info');
    }
  };

  const handleSeekDelta = (deltaSeconds: number) => {
    if (!playerReady || !playerRef.current) return;
    isInternalActionRef.current = true;
    // Only clamp to the end when the duration is actually known; otherwise a
    // forward seek while duration is still 0 would snap back to the start.
    const upperBound = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    const newTime = Math.max(0, Math.min(upperBound, currentTime + deltaSeconds));
    playerRef.current.seekTo(newTime, true);
    setCurrentTime(newTime);
    sendVideoSeek(newTime);
    addToast('Jumped Video', `${deltaSeconds > 0 ? '+10s' : '-10s'} jumped for all students.`, 'info');
  };

  const handleSliderSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (!playerReady || !playerRef.current) return;
    isInternalActionRef.current = true;
    playerRef.current.seekTo(newTime, true);
    setCurrentTime(newTime);
    sendVideoSeek(newTime);
  };

  const handleAddToQueue = (url: string) => {
    const targetUrl = url || inputUrl;
    if (!targetUrl.trim()) return;
    const vid = extractVideoId(targetUrl);
    if (!vid) {
      addToast('Invalid YouTube Link', 'Please paste a valid YouTube video URL to add to queue.', 'warning');
      return;
    }
    const newItem: PlaylistItem = {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      videoId: vid,
      url: targetUrl.trim(),
      title: `YouTube Lecture (${vid})`,
      addedAt: Date.now()
    };
    setQueue(prev => [...prev, newItem]);
    setInputUrl('');
    addToast('Added to Queue', 'Lecture added to Up Next queue!', 'success');
  };

  const handleSkipToNextInQueue = () => {
    if (queue.length === 0) {
      addToast('Queue Empty', 'No more lectures in the queue.', 'info');
      return;
    }
    const [nextItem, ...remainingQueue] = queue;
    setQueue(remainingQueue);
    handleLoadNewVideo(nextItem.url, nextItem.title);
  };

  const handleRateChange = (rate: number) => {
    if (!playerReady || !playerRef.current) return;
    playerRef.current.setPlaybackRate(rate);
    setPlaybackRate(rate);
    lastAppliedRateRef.current = rate;
    sendVideoRate(rate);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-2 sm:p-4 flex flex-col lg:flex-row gap-3 sm:gap-4 h-auto lg:h-[calc(100vh-4.5rem)]">
      
      {/* Left: Synchronized Video Player Stage */}
      <div className="flex-1 flex flex-col bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        
        {/* Top Video URL Bar & Peer Status */}
        <div className="p-3 border-b border-white/10 bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
          
          {/* URL Input & Actions */}
          <div className="flex-1 min-w-0 sm:min-w-[280px] flex items-center gap-2">
            <div className="relative flex-1">
              <Link className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLoadNewVideo(inputUrl)}
                placeholder="Paste any YouTube class/lecture link..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <button
              onClick={() => handleLoadNewVideo(inputUrl)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors whitespace-nowrap shadow-sm shadow-indigo-500/20"
            >
              Load Class
            </button>
            <button
              onClick={() => handleAddToQueue(inputUrl)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 hover:text-white text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1"
              title="Add to Up Next Queue"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Queue</span>
            </button>
          </div>

          {/* Sync Status Badge & Partner Presence */}
          <div className="flex items-center gap-2">
            {syncStatus === 'syncing' ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span className="font-semibold">Resyncing…</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-semibold">Synced</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs">
              <Users className="w-3.5 h-3.5" />
              <span className="font-semibold">{Math.max(1, peers.length)} Studying Together</span>
            </div>

            {/* Quick Playlist & Queue Toggle */}
            <button
              onClick={() => {
                setIsChatOpen(true);
                setSidebarTab('playlist');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all ${
                isChatOpen && sidebarTab === 'playlist'
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:text-white hover:bg-white/10'
              }`}
              title="Open Video Playlist & Queue"
            >
              <ListVideo className="w-3.5 h-3.5 text-indigo-400" />
              <span>Playlist {queue.length > 0 ? `(${queue.length})` : ''}</span>
            </button>

            {/* Toggle Chatbox Hide / Show */}
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                isChatOpen
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/25'
                  : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
              }`}
              title={isChatOpen ? 'Hide Chat (Full Screen Video)' : 'Show Chat'}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isChatOpen ? 'Hide Chat' : 'Show Chat'}</span>
            </button>
          </div>

        </div>

        {/* Video Frame Canvas Area */}
        <div ref={containerRef} className="relative flex-1 bg-black flex items-center justify-center min-h-[300px]">
          <div id="yt-player-frame" className="w-full h-full aspect-video pointer-events-auto" />

          {/* Sync Drift Overlay notification */}
          {syncStatus === 'syncing' && (
            <div className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-xl bg-indigo-600/90 text-white text-xs font-semibold backdrop-blur-md animate-pulse flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-300" />
              <span>Resyncing playback with partner...</span>
            </div>
          )}

          {/* "Ask AI Doubt at Current Timestamp" Quick Overlay button */}
          <button
            onClick={() => onAskAiDoubtAtTimestamp?.(currentTime)}
            className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-indigo-600 text-white text-xs font-medium border border-white/20 backdrop-blur-md shadow-lg transition-all"
            title="Ask AI Teacher about the concept right now"
          >
            <HelpCircle className="w-3.5 h-3.5 text-cyan-300" />
            <span>Ask AI at {formatTime(currentTime)}</span>
          </button>
        </div>

        {/* Synchronized Custom Control Bar */}
        <div className="p-3 bg-slate-950 border-t border-white/10 flex flex-col gap-2">
          
          {/* Progress Slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-medium text-indigo-300 min-w-[42px]">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSliderSeek}
              className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
            />
            <span className="text-xs font-mono text-slate-400 min-w-[42px]">
              {formatTime(duration)}
            </span>
          </div>

          {/* Play/Pause, Seek buttons, Speed, Volume */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              
              {/* Backward 10s */}
              <button
                onClick={() => handleSeekDelta(-10)}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Backward 10 Seconds (Syncs for both)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Master Play / Pause */}
              <button
                onClick={handleTogglePlay}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-indigo-500/25 transition-all"
                title={localIsPlaying ? 'Pause for both' : 'Play for both'}
              >
                {localIsPlaying ? (
                  <>
                    <Pause className="w-4 h-4 fill-white" />
                    <span>Pause Class</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Play Class</span>
                  </>
                )}
              </button>

              {/* Forward 10s */}
              <button
                onClick={() => handleSeekDelta(10)}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Forward 10 Seconds (Syncs for both)"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Skip to Next in Queue */}
              <button
                onClick={handleSkipToNextInQueue}
                disabled={queue.length === 0}
                className={`p-2 rounded-xl transition-colors ${
                  queue.length > 0
                    ? 'text-slate-300 hover:text-white hover:bg-white/10'
                    : 'text-slate-600 cursor-not-allowed'
                }`}
                title={queue.length > 0 ? `Play Next in Queue (${queue.length} lectures waiting)` : 'Queue is empty'}
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Repeat / Loop Current Video Toggle */}
              <button
                onClick={() => {
                  const next = !loopCurrent;
                  setLoopCurrent(next);
                  try {
                    localStorage.setItem('studyos_video_loop_current', JSON.stringify(next));
                  } catch {}
                  addToast(
                    next ? 'Repeat Mode Enabled' : 'Repeat Mode Disabled',
                    next ? 'Current lecture will loop continuously.' : 'Queue auto-advance restored.',
                    'info'
                  );
                }}
                className={`p-2 rounded-xl transition-colors ${
                  loopCurrent
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
                title={loopCurrent ? 'Disable Repeat' : 'Repeat Current Video'}
              >
                <Repeat className="w-4 h-4" />
              </button>

              <span className="text-[11px] text-slate-400 hidden sm:inline ml-2">
                Last updated by: <span className="text-cyan-300 font-medium">{videoState.updatedBy || 'You'}</span>
              </span>
            </div>

            {/* Playback speed & Volume */}
            <div className="flex items-center gap-3">
              
              {/* Speed Switcher */}
              <div className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded-xl p-0.5 text-xs">
                {[1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handleRateChange(rate)}
                    className={`px-2 py-0.5 rounded-lg font-medium transition-colors ${
                      playbackRate === rate
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              {/* Volume */}
              <button
                onClick={() => {
                  if (playerRef.current) {
                    if (isMuted) {
                      playerRef.current.unMute();
                      setIsMuted(false);
                    } else {
                      playerRef.current.mute();
                      setIsMuted(true);
                    }
                  }
                }}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                title={isMuted ? 'Unmute Player' : 'Mute Player'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

            </div>

          </div>

        </div>

      </div>

      {/* Right: Real-time Live Voice & In-Lecture Doubt Chat Panel OR Playlists/Queue Drawer */}
      {isChatOpen && (
        <div className="w-full lg:w-96 flex flex-col h-[480px] lg:h-full animate-in slide-in-from-right duration-200">
          {/* Top Panel Tab Switcher */}
          <div className="flex items-center gap-1.5 p-1.5 bg-slate-950/80 rounded-2xl border border-white/10 mb-2 shadow-lg shrink-0">
            <button
              onClick={() => setSidebarTab('chat')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-semibold transition-all ${
                sidebarTab === 'chat'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Discussion</span>
            </button>
            <button
              onClick={() => setSidebarTab('playlist')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-semibold transition-all ${
                sidebarTab === 'playlist'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <ListVideo className="w-3.5 h-3.5" />
              <span>Playlist {queue.length > 0 ? `(${queue.length})` : ''}</span>
            </button>
            <button
              onClick={() => setIsChatOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              title="Close panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            {sidebarTab === 'chat' ? (
              <VoiceChatPanel
                currentVideoTime={currentTime}
                onSeekVideo={handleSeekDelta}
                onClose={() => setIsChatOpen(false)}
              />
            ) : (
              <VideoPlaylistDrawer
                currentVideoId={videoState.videoId}
                currentVideoUrl={`https://www.youtube.com/watch?v=${videoState.videoId}`}
                onPlayVideo={(url, vid, title) => {
                  sendVideoChange(url, vid);
                  addToast('Now Playing', title || 'Lecture loaded for everyone!', 'success');
                }}
                queue={queue}
                onUpdateQueue={(newQueue) => setQueue(newQueue)}
                autoPlayNext={autoPlayNext}
                onToggleAutoPlayNext={() => {
                  setAutoPlayNext(prev => {
                    const next = !prev;
                    try { localStorage.setItem('studyos_video_autoplay_next', JSON.stringify(next)); } catch {}
                    return next;
                  });
                }}
                loopCurrent={loopCurrent}
                onToggleLoopCurrent={() => {
                  setLoopCurrent(prev => {
                    const next = !prev;
                    try { localStorage.setItem('studyos_video_loop_current', JSON.stringify(next)); } catch {}
                    return next;
                  });
                }}
                onClose={() => setIsChatOpen(false)}
                addToast={addToast}
              />
            )}
          </div>
        </div>
      )}

      {/* Floating Summon Chat / Playlist Button when collapsed */}
      {!isChatOpen && (
        <div className="fixed bottom-6 right-6 z-30 flex items-center gap-2">
          <button
            onClick={() => {
              setIsChatOpen(true);
              setSidebarTab('playlist');
            }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xl border border-white/20 hover:scale-105 active:scale-95 transition-all"
            title="Open Playlist & Queue"
          >
            <ListVideo className="w-4 h-4 text-indigo-400" />
            <span>Queue {queue.length > 0 ? `(${queue.length})` : ''}</span>
          </button>
          <button
            onClick={() => {
              setIsChatOpen(true);
              setSidebarTab('chat');
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-2xl shadow-indigo-600/50 border border-indigo-400/30 hover:scale-105 active:scale-95 transition-all"
            title="Open Live Chat & Doubts"
          >
            <MessageSquare className="w-4 h-4 text-cyan-300" />
            <span>Live Discussion</span>
          </button>
        </div>
      )}

    </div>
  );
};
