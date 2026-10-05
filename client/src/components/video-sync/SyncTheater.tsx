import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Link,
  Users,
  MessageSquare,
  Volume2,
  VolumeX,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Film,
  Lock,
  Unlock,
  Tv,
  Maximize,
  Minimize,
  AlertCircle
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { VoiceChatPanel } from '../voice-chat/VoiceChatPanel.js';
import { MovieUploadModal } from './MovieUploadModal.js';
import { MovieReactions } from './MovieReactions.js';

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
    toggleHostLock,
    peers,
    currentUser,
    roomId,
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
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const playerRef = useRef<any>(null); // YouTube player ref
  const movieVideoRef = useRef<HTMLVideoElement | null>(null); // HTML5 Video player ref
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const isInternalActionRef = useRef<boolean>(false);
  const lastAppliedRateRef = useRef<number>(1);

  // Check if current video source is an uploaded movie or direct stream
  const isMovie = Boolean(
    videoState.mediaType === 'movie' ||
    (videoState.videoUrl && (
      videoState.videoUrl.includes('/api/movies/stream') ||
      videoState.videoUrl.endsWith('.mp4') ||
      videoState.videoUrl.endsWith('.webm') ||
      videoState.videoUrl.endsWith('.mkv')
    ))
  );

  // Extract YouTube ID from full URL
  const extractVideoId = (url: string): string => {
    if (!url) return '';
    const trimmed = url.trim();
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match) return match[1];
    return /^[\w-]{11}$/.test(trimmed) ? trimmed : '';
  };

  // ==========================================
  // 1. YouTube Player Engine Initialization
  // ==========================================
  useEffect(() => {
    if (isMovie) return; // Do not initialize YouTube if playing a movie

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
        try {
          playerRef.current = new window.YT.Player('yt-player-frame', {
            width: '100%',
            height: '100%',
            videoId: videoState.videoId || 'k7YS_P_t3uA',
            playerVars: {
              autoplay: 0,
              controls: 0,
              rel: 0,
              modestbranding: 1,
              disablekb: 1,
              fs: 0
            },
            events: {
              onReady: (event: any) => {
                setPlayerReady(true);
                setDuration(event.target.getDuration());
                event.target.setVolume(volume);
                if (videoState.currentTime > 0) {
                  event.target.seekTo(videoState.currentTime, true);
                }
                if (videoState.playbackRate && videoState.playbackRate !== 1) {
                  event.target.setPlaybackRate(videoState.playbackRate);
                  lastAppliedRateRef.current = videoState.playbackRate;
                }
                if (videoState.isPlaying) {
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
  }, [isMovie]);

  // Update YouTube video ID if room videoId changes while in YouTube mode
  useEffect(() => {
    if (!isMovie && playerReady && playerRef.current && videoState.videoId) {
      const currentVideoUrl = playerRef.current.getVideoUrl?.() || '';
      if (!currentVideoUrl.includes(videoState.videoId)) {
        if (videoState.isPlaying) {
          playerRef.current.loadVideoById(videoState.videoId, videoState.currentTime || 0);
        } else {
          playerRef.current.cueVideoById(videoState.videoId, videoState.currentTime || 0);
        }
      }
    }
  }, [videoState.videoId, playerReady, isMovie, videoState.isPlaying]);

  // ==========================================
  // 2. HTML5 Video Player (Movie Engine) Handlers
  // ==========================================
  useEffect(() => {
    if (!isMovie || !movieVideoRef.current) return;
    const vid = movieVideoRef.current;

    const onLoadedMetadata = () => {
      setDuration(vid.duration || 0);
      setPlayerReady(true);
      if (videoState.currentTime > 0) {
        vid.currentTime = videoState.currentTime;
      }
      if (videoState.playbackRate) {
        vid.playbackRate = videoState.playbackRate;
      }
      if (videoState.isPlaying) {
        vid.play().catch(() => {});
      }
    };

    const onPlay = () => setLocalIsPlaying(true);
    const onPause = () => setLocalIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(vid.currentTime);

    vid.addEventListener('loadedmetadata', onLoadedMetadata);
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    vid.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      vid.removeEventListener('loadedmetadata', onLoadedMetadata);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
      vid.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [isMovie, videoState.videoUrl]);

  // ==========================================
  // 3. Remote Room Play / Pause / Seek Synchronization
  // ==========================================
  useEffect(() => {
    if (isInternalActionRef.current) {
      isInternalActionRef.current = false;
    }

    try {
      if (isMovie) {
        // HTML5 Video synchronization
        if (!movieVideoRef.current) return;
        const vid = movieVideoRef.current;
        const drift = Math.abs(vid.currentTime - videoState.currentTime);

        // Anti-Drift: seek if drift > 1.2 seconds
        if (drift > 1.2) {
          setSyncStatus('syncing');
          vid.currentTime = videoState.currentTime;
          setTimeout(() => setSyncStatus('synced'), 800);
        }

        if (videoState.isPlaying && vid.paused) {
          vid.play().catch(() => {});
        } else if (!videoState.isPlaying && !vid.paused) {
          vid.pause();
        }
      } else {
        // YouTube synchronization
        if (!playerReady || !playerRef.current) return;
        const currentLocalTime = playerRef.current.getCurrentTime?.() || 0;
        const drift = Math.abs(currentLocalTime - videoState.currentTime);

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
      }
    } catch (e) {
      console.warn('Sync error:', e);
    }
  }, [videoState.isPlaying, videoState.currentTime, videoState.lastUpdated, playerReady, isMovie]);

  // Apply remote playback rate
  useEffect(() => {
    const rate = videoState.playbackRate;
    if (!rate || rate === lastAppliedRateRef.current) return;

    if (isMovie && movieVideoRef.current) {
      movieVideoRef.current.playbackRate = rate;
      lastAppliedRateRef.current = rate;
      setPlaybackRate(rate);
    } else if (!isMovie && playerReady && playerRef.current) {
      try {
        playerRef.current.setPlaybackRate(rate);
        lastAppliedRateRef.current = rate;
        setPlaybackRate(rate);
      } catch (e) {}
    }
  }, [videoState.playbackRate, playerReady, isMovie]);

  // Periodic YouTube time tracker
  useEffect(() => {
    if (isMovie) return;
    const interval = setInterval(() => {
      if (playerReady && playerRef.current && playerRef.current.getCurrentTime) {
        try {
          const time = playerRef.current.getCurrentTime();
          setCurrentTime(time);
        } catch (e) {}
      }
    }, 500);
    return () => clearInterval(interval);
  }, [playerReady, isMovie]);

  // ==========================================
  // 4. Unified Controls Handlers
  // ==========================================
  const handleTogglePlay = () => {
    if (videoState.isHostLocked && currentUser.id !== 'admin' && videoState.updatedBy && videoState.updatedBy !== currentUser.name) {
      addToast('Host Locked', 'Controls are currently locked by the host.', 'warning');
      return;
    }

    isInternalActionRef.current = true;

    if (isMovie && movieVideoRef.current) {
      const vid = movieVideoRef.current;
      if (!vid.paused) {
        vid.pause();
        sendVideoPause(vid.currentTime);
        addToast('Movie Paused', `You paused playback at ${formatTime(vid.currentTime)} for everyone.`, 'info');
      } else {
        vid.play().catch(() => {});
        sendVideoPlay(vid.currentTime);
        addToast('Movie Playing', `You started synchronized playback for everyone.`, 'info');
      }
    } else if (!isMovie && playerReady && playerRef.current) {
      if (localIsPlaying) {
        playerRef.current.pauseVideo();
        sendVideoPause(currentTime);
        addToast('Video Paused', `You paused the video for everyone at ${formatTime(currentTime)}.`, 'info');
      } else {
        playerRef.current.playVideo();
        sendVideoPlay(currentTime);
        addToast('Video Playing', `You started synchronized playback for everyone.`, 'info');
      }
    }
  };

  const handleSeekDelta = (deltaSeconds: number) => {
    isInternalActionRef.current = true;
    const upperBound = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    const newTime = Math.max(0, Math.min(upperBound, currentTime + deltaSeconds));

    if (isMovie && movieVideoRef.current) {
      movieVideoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      sendVideoSeek(newTime);
    } else if (!isMovie && playerReady && playerRef.current) {
      playerRef.current.seekTo(newTime, true);
      setCurrentTime(newTime);
      sendVideoSeek(newTime);
    }
    addToast('Jumped Timeline', `${deltaSeconds > 0 ? '+10s' : '-10s'} jumped for all members.`, 'info');
  };

  const handleSliderSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    isInternalActionRef.current = true;
    setCurrentTime(newTime);

    if (isMovie && movieVideoRef.current) {
      movieVideoRef.current.currentTime = newTime;
      sendVideoSeek(newTime);
    } else if (!isMovie && playerReady && playerRef.current) {
      playerRef.current.seekTo(newTime, true);
      sendVideoSeek(newTime);
    }
  };

  const handleRateChange = (rate: number) => {
    if (isMovie && movieVideoRef.current) {
      movieVideoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
      lastAppliedRateRef.current = rate;
      sendVideoRate(rate);
    } else if (!isMovie && playerReady && playerRef.current) {
      playerRef.current.setPlaybackRate(rate);
      setPlaybackRate(rate);
      lastAppliedRateRef.current = rate;
      sendVideoRate(rate);
    }
  };

  const handleToggleMute = () => {
    if (isMovie && movieVideoRef.current) {
      const vid = movieVideoRef.current;
      vid.muted = !isMuted;
      setIsMuted(!isMuted);
    } else if (!isMovie && playerRef.current) {
      if (isMuted) {
        playerRef.current.unMute();
        setIsMuted(false);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    }
  };

  const handleToggleFullscreen = () => {
    if (!stageContainerRef.current) return;
    if (!document.fullscreenElement) {
      stageContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleLoadYouTubeUrl = (url: string) => {
    const targetUrl = url || inputUrl;
    if (!targetUrl.trim()) return;
    const vid = extractVideoId(targetUrl);
    if (!vid) {
      addToast('Invalid YouTube Link', 'Please paste a valid YouTube video URL.', 'warning');
      return;
    }
    sendVideoChange(targetUrl, vid, { mediaType: 'youtube', title: 'YouTube Lecture' });
    setInputUrl('');
    addToast('Video Loaded', 'YouTube video loaded for the room!', 'success');
  };

  const handleSelectMovieFromModal = (selected: { videoUrl: string; videoId: string; title: string; mediaType: 'movie' }) => {
    sendVideoChange(selected.videoUrl, selected.videoId, {
      mediaType: 'movie',
      title: selected.title
    });
    addToast('🎬 Movie Loaded', `"${selected.title}" is now playing in the watch party!`, 'success');
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-2 sm:p-4 flex flex-col lg:flex-row gap-3 sm:gap-4 h-auto lg:h-[calc(100vh-4.5rem)]">
      
      {/* Left: Synchronized Video & Movie Theater Stage */}
      <div className="flex-1 flex flex-col bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        
        {/* Top Header & Watch Party Toolbar */}
        <div className="p-3 border-b border-white/10 bg-slate-950/80 flex flex-wrap items-center justify-between gap-2">
          
          {/* Movie / YouTube Action Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Watch Party Movie Upload / Library Button */}
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-purple-500/25 flex items-center gap-2 transition-all"
            >
              <Film className="w-4 h-4 text-purple-200" />
              <span>Movie Library / Upload</span>
            </button>

            {/* Current Media Badge */}
            <div className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 border ${
              isMovie
                ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                : 'bg-red-500/10 border-red-500/20 text-red-300'
            }`}>
              {isMovie ? <Film className="w-3.5 h-3.5 text-purple-400" /> : <Tv className="w-3.5 h-3.5 text-red-400" />}
              <span className="truncate max-w-[180px] sm:max-w-[240px]">
                {videoState.title || (isMovie ? 'Watch Party Movie' : 'YouTube Video')}
              </span>
            </div>
          </div>

          {/* Quick YouTube URL Loader */}
          <div className="flex-1 min-w-[220px] max-w-md flex items-center gap-1.5">
            <div className="relative flex-1">
              <Link className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLoadYouTubeUrl(inputUrl)}
                placeholder="Or paste YouTube lecture URL..."
                className="w-full pl-8 pr-2.5 py-1 rounded-xl bg-slate-900 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={() => handleLoadYouTubeUrl(inputUrl)}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors whitespace-nowrap border border-white/10"
            >
              Load YT
            </button>
          </div>

          {/* Presence, Sync Status & Chat Toggle */}
          <div className="flex items-center gap-2">
            {syncStatus === 'syncing' ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span className="font-semibold hidden sm:inline">Syncing…</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="font-semibold hidden sm:inline">Synced</span>
              </div>
            )}

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs">
              <Users className="w-3.5 h-3.5" />
              <span className="font-semibold">{peers.length + 1} Watching</span>
            </div>

            {/* Host Lock Control */}
            <button
              onClick={() => toggleHostLock(!videoState.isHostLocked)}
              className={`p-1.5 rounded-xl border text-xs transition-colors ${
                videoState.isHostLocked
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
              }`}
              title={videoState.isHostLocked ? 'Host Lock: Enabled (Only host can pause/seek)' : 'Host Lock: Disabled (Anyone can control)'}
            >
              {videoState.isHostLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>

            {/* Toggle Chat Box */}
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                isChatOpen
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isChatOpen ? 'Chat' : 'Chat'}</span>
            </button>
          </div>

        </div>

        {/* Video Stage Canvas (Unified Engine Container) */}
        <div ref={stageContainerRef} className="relative flex-1 bg-black flex items-center justify-center min-h-[340px] overflow-hidden group">
          
          {/* Dual-Engine Display */}
          {isMovie ? (
            (videoState.videoUrl?.toLowerCase().includes('.mkv') || videoState.title?.toLowerCase().endsWith('.mkv')) ? (
              <div className="flex flex-col items-center justify-center p-8 text-center max-w-md bg-slate-900/90 border border-amber-500/30 rounded-2xl m-4">
                <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
                <h3 className="text-base font-bold text-white mb-1">MKV Video Format Not Supported</h3>
                <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                  Web browsers (Chrome, Edge, Safari, Mobile) cannot decode MKV video files directly. Watch party ke liye movie ko <strong className="text-amber-300">MP4 (H.264)</strong> ya <strong className="text-amber-300">WebM</strong> format me convert karke upload karein.
                </p>
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-all shadow-lg"
                >
                  Upload MP4 File
                </button>
              </div>
            ) : (
              <video
                ref={movieVideoRef}
                src={videoState.videoUrl}
                className="w-full h-full object-contain aspect-video pointer-events-auto"
                playsInline
                preload="metadata"
                onClick={handleTogglePlay}
                onError={(e) => {
                  console.warn('[SyncTheater] Video load error:', e);
                  addToast(
                    'Format Notice',
                    'Browsers require MP4 (H.264/AAC) or WebM format.',
                    'warning'
                  );
                }}
              />
            )
          ) : (
            <div id="yt-player-frame" className="w-full h-full aspect-video pointer-events-auto" />
          )}

          {/* Floating Live Emoji Reactions Component */}
          <MovieReactions />

          {/* Sync Drift Notification Banner */}
          {syncStatus === 'syncing' && (
            <div className="absolute top-4 left-4 z-30 px-3 py-1.5 rounded-xl bg-purple-600/90 text-white text-xs font-semibold backdrop-blur-md animate-pulse flex items-center gap-2 shadow-lg">
              <Sparkles className="w-4 h-4 text-cyan-300" />
              <span>Resyncing playback with study partner...</span>
            </div>
          )}

          {/* Ask AI Doubt Button at Current Timestamp */}
          <button
            onClick={() => onAskAiDoubtAtTimestamp?.(currentTime)}
            className="absolute top-4 right-4 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-indigo-600 text-white text-xs font-medium border border-white/20 backdrop-blur-md shadow-lg transition-all"
            title="Ask AI Teacher about this timestamp"
          >
            <HelpCircle className="w-3.5 h-3.5 text-cyan-300" />
            <span>Ask AI at {formatTime(currentTime)}</span>
          </button>
        </div>

        {/* Synchronized Custom Control Bar */}
        <div className="p-3 bg-slate-950 border-t border-white/10 flex flex-col gap-2">
          
          {/* Progress Timeline Slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-medium text-purple-300 min-w-[45px]">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.5"
              value={currentTime}
              onChange={handleSliderSeek}
              className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400"
            />
            <span className="text-xs font-mono text-slate-400 min-w-[45px]">
              {formatTime(duration)}
            </span>
          </div>

          {/* Play/Pause, Seek Buttons, Speed, Volume, Fullscreen */}
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
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-500/25 transition-all"
                title={localIsPlaying ? 'Pause for everyone' : 'Play for everyone'}
              >
                {localIsPlaying ? (
                  <>
                    <Pause className="w-4 h-4 fill-white" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Play Together</span>
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

              <span className="text-[11px] text-slate-400 hidden sm:inline ml-2">
                Last updated by: <span className="text-purple-300 font-medium">{videoState.updatedBy || 'You'}</span>
              </span>
            </div>

            {/* Playback speed, Volume, Fullscreen */}
            <div className="flex items-center gap-3">
              
              {/* Speed Switcher */}
              <div className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded-xl p-0.5 text-xs">
                {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handleRateChange(rate)}
                    className={`px-2 py-0.5 rounded-lg font-medium transition-colors ${
                      playbackRate === rate
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              {/* Volume & Mute */}
              <button
                onClick={handleToggleMute}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                title={isMuted ? 'Unmute Player' : 'Mute Player'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={handleToggleFullscreen}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Theater'}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>

            </div>

          </div>

        </div>

      </div>

      {/* Right: Real-time Live Voice & Watch Party Chat Panel */}
      {isChatOpen && (
        <div className="w-full lg:w-96 flex flex-col h-[480px] lg:h-full animate-in slide-in-from-right duration-200">
          <VoiceChatPanel
            currentVideoTime={currentTime}
            onSeekVideo={handleSeekDelta}
            onClose={() => setIsChatOpen(false)}
          />
        </div>
      )}

      {/* Floating Chat Re-open Button */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-2xl shadow-purple-600/50 border border-purple-400/30 hover:scale-105 active:scale-95 transition-all"
        >
          <MessageSquare className="w-4 h-4 text-purple-200" />
          <span>Live Watch Chat</span>
        </button>
      )}

      {/* Movie Upload & Watchlist Modal */}
      <MovieUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSelectMovie={handleSelectMovieFromModal}
        roomId={roomId}
        currentUser={currentUser}
      />

    </div>
  );
};
