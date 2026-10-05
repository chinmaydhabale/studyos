import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Film,
  Link as LinkIcon,
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardDrive,
  RefreshCw,
  Loader2,
  FileVideo
} from 'lucide-react';
import { MovieRecord, UserProfile } from '../../types.js';
import { API_BASE_URL } from '../../config.js';

interface MovieUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMovie: (movie: { videoUrl: string; videoId: string; title: string; mediaType: 'movie' }) => void;
  roomId: string;
  currentUser: UserProfile;
}

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunk size (bypasses Cloudflare 100MB body limit)

export const MovieUploadModal: React.FC<MovieUploadModalProps> = ({
  isOpen,
  onClose,
  onSelectMovie,
  roomId,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'weblink' | 'library'>('upload');
  
  // Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [movieTitle, setMovieTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState('');
  const [uploadEta, setUploadEta] = useState('');
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<string>('');
  const [completedMovie, setCompletedMovie] = useState<MovieRecord | null>(null);

  // Web Link State
  const [webLinkUrl, setWebLinkUrl] = useState('');
  const [webLinkTitle, setWebLinkTitle] = useState('');

  // Library State
  const [moviesList, setMoviesList] = useState<MovieRecord[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch movies when opening modal or switching to library tab
  useEffect(() => {
    if (isOpen) {
      fetchMoviesLibrary();
    }
  }, [isOpen, activeTab, roomId]);

  const fetchMoviesLibrary = async () => {
    setIsLoadingLibrary(true);
    setLibraryError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/movies?roomId=${encodeURIComponent(roomId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.movies)) {
        setMoviesList(data.movies);
      } else {
        setMoviesList([]);
      }
    } catch (err: any) {
      setLibraryError('Could not load movie library.');
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Auto-populate movie title from filename without extension
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setMovieTitle(nameWithoutExt);
      setUploadError('');
      setCompletedMovie(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const handleStartUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadedBytes(0);
    setUploadStatus('Initializing upload session...');
    setUploadError('');
    setCompletedMovie(null);

    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const totalBytes = selectedFile.size;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
    abortControllerRef.current = new AbortController();

    const startTime = Date.now();
    let uploadedSoFar = 0;

    try {
      // 1. Initialize session
      const initRes = await fetch(`${API_BASE_URL}/api/movies/upload/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          roomId,
          title: movieTitle.trim() || selectedFile.name,
          originalName: selectedFile.name,
          fileSize: totalBytes,
          totalChunks,
          mimeType: selectedFile.type || 'video/mp4',
          uploaderId: currentUser.id,
          uploaderName: currentUser.name
        }),
        signal: abortControllerRef.current.signal
      });

      if (!initRes.ok) {
        const errData = await initRes.json();
        throw new Error(errData.error || 'Failed to initialize upload session');
      }

      // 2. Upload chunks sequentially
      for (let i = 0; i < totalChunks; i++) {
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('Upload cancelled by user');
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalBytes);
        const chunkBlob = selectedFile.slice(start, end);

        setUploadStatus(`Uploading chunk ${i + 1} of ${totalChunks}...`);

        const formData = new FormData();
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', String(i));
        formData.append('chunk', chunkBlob, `chunk_${i}`);

        const chunkRes = await fetch(`${API_BASE_URL}/api/movies/upload/chunk`, {
          method: 'POST',
          body: formData,
          signal: abortControllerRef.current.signal
        });

        if (!chunkRes.ok) {
          const errData = await chunkRes.json();
          throw new Error(errData.error || `Failed to upload chunk ${i + 1}`);
        }

        uploadedSoFar += (end - start);
        setUploadedBytes(uploadedSoFar);
        const progressPct = Math.round((uploadedSoFar / totalBytes) * 100);
        setUploadProgress(progressPct);

        // Speed & ETA calculations
        const elapsedSec = (Date.now() - startTime) / 1000;
        if (elapsedSec > 0.5) {
          const bytesPerSec = uploadedSoFar / elapsedSec;
          setUploadSpeed(`${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`);
          const remainingBytes = totalBytes - uploadedSoFar;
          const remainingSec = Math.round(remainingBytes / bytesPerSec);
          setUploadEta(`${remainingSec}s left`);
        }
      }

      // 3. Complete and merge upload
      setUploadStatus('Assembling movie on server disk...');
      const completeRes = await fetch(`${API_BASE_URL}/api/movies/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId }),
        signal: abortControllerRef.current.signal
      });

      const completeData = await completeRes.json();
      if (!completeRes.ok || !completeData.success) {
        throw new Error(completeData.error || 'Failed to finalize movie file');
      }

      setCompletedMovie(completeData.movie);
      setUploadStatus('Movie uploaded successfully! Ready to watch.');
      fetchMoviesLibrary();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setUploadError(err.message || 'An error occurred during upload.');
      }
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsUploading(false);
      setUploadStatus('Upload cancelled.');
    }
  };

  const handlePlayCompletedMovie = () => {
    if (completedMovie) {
      const streamUrl = `${API_BASE_URL}${completedMovie.streamUrl}`;
      onSelectMovie({
        videoUrl: streamUrl,
        videoId: completedMovie.id,
        title: completedMovie.title,
        mediaType: 'movie'
      });
      onClose();
    }
  };

  const handlePlayLibraryMovie = (movie: MovieRecord) => {
    const streamUrl = `${API_BASE_URL}${movie.streamUrl}`;
    onSelectMovie({
      videoUrl: streamUrl,
      videoId: movie.id,
      title: movie.title,
      mediaType: 'movie'
    });
    onClose();
  };

  const handleDeleteMovie = async (movieId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Delete this uploaded movie?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/movies/${movieId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setMoviesList(prev => prev.filter(m => m.id !== movieId));
      }
    } catch (err) {
      alert('Could not delete movie.');
    }
  };

  const handlePlayWebLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!webLinkUrl.trim()) return;
    onSelectMovie({
      videoUrl: webLinkUrl.trim(),
      videoId: `link-${Date.now()}`,
      title: webLinkTitle.trim() || 'Online Web Video',
      mediaType: 'movie'
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col gap-5 relative text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold flex items-center gap-2">
                Watch Party — Movie & Video Upload
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Realtime Sync
                </span>
              </h2>
              <p className="text-xs text-slate-400">Upload movie files or stream direct videos with synchronized group playback</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 p-1.5 bg-slate-950 rounded-2xl border border-white/10">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'upload'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload Movie File</span>
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'library'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Movie Library ({moviesList.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('weblink')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'weblink'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            <span>Direct Web Link</span>
          </button>
        </div>

        {/* Tab 1: Upload Movie */}
        {activeTab === 'upload' && (
          <div className="space-y-4">
            {!completedMovie ? (
              <form onSubmit={handleStartUpload} className="space-y-4">
                {/* Drag & Drop File Zone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/20 hover:border-purple-400/60 bg-slate-950/60 rounded-2xl p-6 text-center cursor-pointer transition-all hover:bg-slate-950 flex flex-col items-center justify-center gap-2 group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/x-matroska,video/quicktime,.mp4,.webm,.mkv,.mov"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/15 group-hover:bg-purple-500/25 text-purple-400 flex items-center justify-center transition-colors">
                    <FileVideo className="w-6 h-6" />
                  </div>
                  {selectedFile ? (
                    <div>
                      <p className="text-sm font-bold text-white">{selectedFile.name}</p>
                      <p className="text-xs text-purple-300 font-medium mt-0.5">
                        {formatFileSize(selectedFile.size)} • Click to choose different file
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        Drop movie or video file here, or <span className="text-purple-400 underline">browse</span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        MP4 (recommended for all browsers) & WebM up to 2GB • Chunked streaming upload
                      </p>
                    </div>
                  )}
                </div>

                {selectedFile && selectedFile.name.toLowerCase().endsWith('.mkv') && (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      <strong>Format Notice:</strong> Browsers (Chrome, Edge, Safari) prefer <strong>MP4 (H.264)</strong> or <strong>WebM</strong>. MKV files might have limited browser audio/video playback support.
                    </span>
                  </div>
                )}

                {/* Movie Title Input */}
                {selectedFile && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Movie Title (Displayed to Room Members):
                    </label>
                    <input
                      type="text"
                      value={movieTitle}
                      onChange={(e) => setMovieTitle(e.target.value)}
                      placeholder="e.g. Inception (2010)"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs"
                      disabled={isUploading}
                    />
                  </div>
                )}

                {/* Upload Progress Bar */}
                {isUploading && (
                  <div className="p-4 bg-slate-950 rounded-2xl border border-purple-500/30 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-purple-300 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {uploadStatus}
                      </span>
                      <span className="font-mono font-bold text-white">{uploadProgress}%</span>
                    </div>
                    {/* Progress track */}
                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300 rounded-full"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>{formatFileSize(uploadedBytes)} / {selectedFile ? formatFileSize(selectedFile.size) : '0 B'}</span>
                      <div className="flex items-center gap-3">
                        {uploadSpeed && <span>Speed: {uploadSpeed}</span>}
                        {uploadEta && <span>ETA: {uploadEta}</span>}
                      </div>
                    </div>
                  </div>
                )}

                {uploadError && (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  {isUploading ? (
                    <button
                      type="button"
                      onClick={handleCancelUpload}
                      className="w-full py-2.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs transition-colors"
                    >
                      Cancel Upload
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!selectedFile}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Start Chunked Upload ({selectedFile ? formatFileSize(selectedFile.size) : '0 B'})</span>
                    </button>
                  )}
                </div>
              </form>
            ) : (
              /* Success Screen */
              <div className="p-6 bg-slate-950 rounded-2xl border border-emerald-500/30 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Movie Upload Complete!</h3>
                  <p className="text-xs text-slate-300 mt-1">"{completedMovie.title}" is ready for watch party</p>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">{completedMovie.fileSizeFormatted}</p>
                </div>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={handlePlayCompletedMovie}
                    className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 flex items-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Play in Theater Now</span>
                  </button>
                  <button
                    onClick={() => {
                      setCompletedMovie(null);
                      setSelectedFile(null);
                      setMovieTitle('');
                    }}
                    className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold"
                  >
                    Upload Another
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Movie Library */}
        {activeTab === 'library' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Movies uploaded to room "{roomId}":</span>
              <button
                onClick={fetchMoviesLibrary}
                className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-medium"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLibrary ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {isLoadingLibrary ? (
              <div className="p-10 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                <span>Loading movies...</span>
              </div>
            ) : libraryError ? (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                {libraryError}
              </div>
            ) : moviesList.length === 0 ? (
              <div className="p-10 text-center bg-slate-950/60 rounded-2xl border border-white/5 space-y-2">
                <Film className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">No movies uploaded yet in this room</p>
                <p className="text-[11px] text-slate-500">Switch to the "Upload Movie File" tab to upload your first movie.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                {moviesList.map((movie) => (
                  <div
                    key={movie.id}
                    className="p-3.5 bg-slate-950 rounded-2xl border border-white/10 hover:border-purple-500/40 transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-300 flex items-center justify-center shrink-0">
                        <Film className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{movie.title}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span className="flex items-center gap-1 font-mono">
                            <HardDrive className="w-3 h-3 text-slate-500" />
                            {movie.fileSizeFormatted}
                          </span>
                          <span>•</span>
                          <span>By {movie.uploadedBy}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {new Date(movie.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handlePlayLibraryMovie(movie)}
                        className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-purple-500/20"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Play</span>
                      </button>
                      <button
                        onClick={(e) => handleDeleteMovie(movie.id, e)}
                        className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete Movie"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Direct Web Link */}
        {activeTab === 'weblink' && (
          <form onSubmit={handlePlayWebLink} className="space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed bg-slate-950 p-3 rounded-xl border border-white/5">
              💡 Paste a direct video link (MP4 or WebM stream) from cloud storage, CDN, or video hosting server to watch together in real time.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Direct Video URL (.mp4 / .webm):
              </label>
              <input
                type="url"
                required
                value={webLinkUrl}
                onChange={(e) => setWebLinkUrl(e.target.value)}
                placeholder="https://example.com/videos/movie.mp4"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Video Title (Optional):
              </label>
              <input
                type="text"
                value={webLinkTitle}
                onChange={(e) => setWebLinkTitle(e.target.value)}
                placeholder="e.g. Interstellar (Stream)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-400 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={!webLinkUrl.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Load Video in Theater</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
