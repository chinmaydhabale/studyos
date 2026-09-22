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
  Sparkles
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { VoiceChatPanel } from '../voice-chat/VoiceChatPanel.js';

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

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInternalActionRef = useRef<boolean>(false);

  // Helper to extract YouTube ID from full URL
  const extractVideoId = (url: string): string => {
    if (!url) return 'k7YS_P_t3uA';
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : (url.length === 11 ? url : 'k7YS_P_t3uA');
  };

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
        try {
          playerRef.current = new window.YT.Player('yt-player-frame', {
            videoId: videoState.videoId || 'k7YS_P_t3uA',
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
                event.target.setVolume(volume);
                if (videoState.currentTime > 0) {
                  event.target.seekTo(videoState.currentTime, true);
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
  }, []);

  // Update video ID if room videoId changes
  useEffect(() => {
    if (playerReady && playerRef.current && videoState.videoId) {
      const currentVideoUrl = playerRef.current.getVideoUrl?.() || '';
      if (!currentVideoUrl.includes(videoState.videoId)) {
        playerRef.current.loadVideoById(videoState.videoId, videoState.currentTime || 0);
      }
    }
  }, [videoState.videoId, playerReady]);

  // Synchronize remote play / pause / seek from peers
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;

    if (isInternalActionRef.current) {
      isInternalActionRef.current = false;
      return;
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
    const newTime = Math.max(0, Math.min(duration, currentTime + deltaSeconds));
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

  const handleLoadNewVideo = (url: string) => {
    const targetUrl = url || inputUrl;
    if (!targetUrl.trim()) return;
    const vid = extractVideoId(targetUrl);
    sendVideoChange(targetUrl, vid);
    setInputUrl('');
    addToast('Class Loaded', 'New YouTube lecture loaded for both students!', 'success');
  };

  const handleRateChange = (rate: number) => {
    if (!playerReady || !playerRef.current) return;
    playerRef.current.setPlaybackRate(rate);
    setPlaybackRate(rate);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Popular Co-Study Lectures presets
  const presets = [
    { title: 'Thermodynamics Masterclass', url: 'https://www.youtube.com/watch?v=k7YS_P_t3uA', subject: 'Physics' },
    { title: 'Current Affairs & Editorial Analysis', url: 'https://www.youtube.com/watch?v=7X8II6J-6mU', subject: 'Current Affairs' },
    { title: 'Calculus: Integration by Parts', url: 'https://www.youtube.com/watch?v=2I-_SV8cwsw', subject: 'Math' },
    { title: 'Organic Chemistry Mechanisms', url: 'https://www.youtube.com/watch?v=8m6fm78R45k', subject: 'Chemistry' }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-4 h-[calc(100vh-4.5rem)]">
      
      {/* Left: Synchronized Video Player Stage */}
      <div className="flex-1 flex flex-col bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        
        {/* Top Video URL Bar & Peer Status */}
        <div className="p-3 border-b border-white/10 bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
          
          {/* URL Input */}
          <div className="flex-1 min-w-[280px] flex items-center gap-2">
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
          </div>

          {/* Sync Status Badge & Partner Presence */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-medium">Synced:</span>
              <span className="font-semibold">{peers.length} Studying Together</span>
            </div>

            {/* Quick Presets Dropdown */}
            <div className="hidden xl:flex items-center gap-1">
              {presets.slice(0, 2).map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleLoadNewVideo(p.url)}
                  className="px-2 py-1 rounded-lg text-[11px] bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 truncate max-w-[140px]"
                  title={p.title}
                >
                  ⚡ {p.subject}
                </button>
              ))}
            </div>
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
          <div className="flex items-center justify-between">
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

      {/* Right: Real-time Live Voice & In-Lecture Doubt Chat Panel */}
      <div className="w-full lg:w-96 flex flex-col h-full">
        <VoiceChatPanel currentVideoTime={currentTime} onSeekVideo={handleSeekDelta} />
      </div>

    </div>
  );
};
