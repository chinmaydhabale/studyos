import React, { useState, useEffect, useRef } from 'react';
import {
  FolderLock,
  Upload,
  Download,
  FileText,
  File,
  Image,
  FileCode,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Share2,
  Filter,
  Eye,
  Sparkles,
  Cloud,
  Send,
  X,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { StudyDocument, TelegramConfig } from '../../types.js';
import { API_BASE_URL } from '../../config.js';

interface TelegramVaultViewProps {
  onNavigateToPdfReader?: () => void;
}

export const TelegramVaultView: React.FC<TelegramVaultViewProps> = ({ onNavigateToPdfReader }) => {
  const { roomId, currentUser, socket, addToast, sendChatMessage, openPdfInReader } = useSocket();

  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  
  // Telegram config state
  const [teleStatus, setTeleStatus] = useState<TelegramConfig | null>(null);
  const [detectingChannel, setDetectingChannel] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [manualChannelId, setManualChannelId] = useState<string>('');
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);

  // Upload modal state
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploadSubject, setUploadSubject] = useState<string>('Quantitative Aptitude');
  const [uploadDescription, setUploadDescription] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const subjects = [
    'All',
    'Quantitative Aptitude',
    'Reasoning Ability',
    'English Language',
    'General Awareness & Current Affairs',
    'Computer Aptitude',
    'Banking & Financial Awareness'
  ];

  // Fetch Telegram status
  const fetchTelegramStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/telegram/status`);
      const data = await res.json();
      setTeleStatus(data);
    } catch (e) {}
  };

  // Fetch documents for this study room
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const url = roomId 
        ? `${API_BASE_URL}/api/telegram/documents?roomId=${encodeURIComponent(roomId)}`
        : `${API_BASE_URL}/api/telegram/documents`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDocuments(data);
      }
    } catch (e) {
      console.error('Failed to fetch documents:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelegramStatus();
    fetchDocuments();
  }, [roomId]);

  // Real-time socket listener for newly uploaded documents
  useEffect(() => {
    if (!socket) return;
    const handleNewDoc = (newDoc: StudyDocument) => {
      setDocuments(prev => [newDoc, ...prev.filter(d => d.id !== newDoc.id)]);
      addToast('New Study Material!', `${newDoc.uploaderName} uploaded "${newDoc.title}" to Telegram Storage.`, 'info');
    };
    socket.on('vault:document-added', handleNewDoc);
    return () => {
      socket.off('vault:document-added', handleNewDoc);
    };
  }, [socket, addToast]);

  // Auto-detect channel from Telegram updates
  const handleDetectChannel = async () => {
    setDetectingChannel(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/telegram/detect`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addToast('Channel Detected!', data.message, 'success');
        fetchTelegramStatus();
        fetchDocuments();
        setShowConfigModal(false);
      } else {
        addToast('Detection Result', data.message || 'No update found.', 'warning');
      }
    } catch (err: any) {
      addToast('Detection Error', err.message || 'Failed to detect channel', 'alert');
    } finally {
      setDetectingChannel(false);
    }
  };

  // Sync documents from channel
  const handleSyncChannel = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/telegram/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Channel Synced!', data.message, 'success');
        fetchDocuments();
        fetchTelegramStatus();
      } else {
        addToast('Sync Result', data.message || 'No new documents found in channel.', 'info');
      }
    } catch (e: any) {
      addToast('Sync Failed', e.message || 'Could not sync from channel', 'alert');
    } finally {
      setIsSyncing(false);
    }
  };

  // Set channel manually
  const handleSaveManualChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualChannelId.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/telegram/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: manualChannelId.trim(), channelTitle: 'Private Study Storage' })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Storage Configured!', `Channel ${manualChannelId} saved permanently.`, 'success');
        fetchTelegramStatus();
        setShowConfigModal(false);
      } else {
        throw new Error(data.message || 'Failed to configure channel');
      }
    } catch (err: any) {
      addToast('Configuration Error', err.message || 'Failed to save channel', 'alert');
    }
  };

  // Upload study material directly to Telegram
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadTitle.trim()) {
      addToast('Missing Info', 'Please select a file and enter a title.', 'warning');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadTitle.trim());
      formData.append('subject', uploadSubject);
      formData.append('roomId', roomId || 'GENERAL-VAULT');
      formData.append('uploaderId', currentUser.id);
      formData.append('uploaderName', currentUser.name || currentUser.username || 'Student');
      formData.append('description', uploadDescription.trim());

      const res = await fetch(`${API_BASE_URL}/api/telegram/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload document');
      }

      addToast('Uploaded to Telegram!', `"${uploadTitle}" is now stored in Telegram Cloud.`, 'success');
      setDocuments(prev => [data.document, ...prev]);
      setIsUploadOpen(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadDescription('');
    } catch (err: any) {
      addToast('Upload Failed', err.message || 'Could not upload to Telegram', 'alert');
    } finally {
      setIsUploading(false);
    }
  };

  const handleShareToChat = (doc: StudyDocument) => {
    const downloadUrl = `${API_BASE_URL}/api/telegram/download/${doc.telegramFileId}?docId=${doc.id}`;
    sendChatMessage(`📑 Shared Study Material: "${doc.title}" (${doc.subject}) - Download here: ${downloadUrl}`);
    addToast('Shared to Group Chat!', `"${doc.title}" link posted in room chat.`, 'info');
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (mime: string, fileName: string) => {
    if (mime.includes('pdf') || fileName.endsWith('.pdf')) {
      return <FileText className="w-6 h-6 text-rose-400" />;
    }
    if (mime.includes('image') || fileName.match(/\.(jpg|jpeg|png|webp)$/i)) {
      return <Image className="w-6 h-6 text-emerald-400" />;
    }
    return <File className="w-6 h-6 text-indigo-400" />;
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesQuery = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.uploaderName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject = selectedSubject === 'All' || doc.subject === selectedSubject;
    return matchesQuery && matchesSubject;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#090d16] text-slate-100 p-4 max-w-7xl mx-auto w-full">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-white/10 rounded-3xl p-5 shadow-2xl mb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Cloud className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-white">Telegram Study Vault</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Cloud Storage
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Permanent document & notes repository powered by Telegram Bot <span className="font-mono text-cyan-300">@{teleStatus?.botUsername || 'studyosprobot'}</span>
            </p>
          </div>
        </div>

        {/* Telegram Connection & Upload Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowConfigModal(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold border transition-all ${
              teleStatus?.isConfigured
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
            }`}
          >
            {teleStatus?.isConfigured ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Channel Connected</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Connect Channel</span>
              </>
            )}
          </button>

          {teleStatus?.isConfigured && (
            <button
              onClick={handleSyncChannel}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/30 hover:bg-sky-500/20 transition-all disabled:opacity-50"
              title="Sync any new documents posted in the Telegram channel into Study Vault"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Channel'}</span>
            </button>
          )}

          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition-all"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Notes / PDF</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 mb-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search notes, formulas, or author..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/80 border border-white/10 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Subject Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 text-xs">
          {subjects.map((sub) => (
            <button
              key={sub}
              onClick={() => setSelectedSubject(sub)}
              className={`px-3 py-1.5 rounded-xl font-medium shrink-0 transition-colors ${
                selectedSubject === sub
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 bg-slate-900/40 border border-white/5 rounded-3xl text-center px-4">
          <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
            <FolderLock className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">No Study Materials Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mb-4">
            Be the first to upload Quantitative Aptitude formulas, Reasoning PDFs, or Daily Current Affairs to this study room.
          </p>
          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload First Study Note</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="bg-slate-900/90 border border-white/10 hover:border-indigo-500/40 rounded-3xl p-4 flex flex-col justify-between gap-3 shadow-xl hover:shadow-indigo-500/5 transition-all group"
            >
              <div>
                {/* Subject & Size Tag */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 truncate">
                    {doc.subject}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {formatBytes(doc.fileSize)}
                  </span>
                </div>

                {/* Title & Icon */}
                <div className="flex items-start gap-3 mb-2">
                  <div className="p-2.5 rounded-2xl bg-slate-950/80 border border-white/10 shrink-0 group-hover:scale-105 transition-transform">
                    {getFileIcon(doc.mimeType, doc.fileName)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                      {doc.title}
                    </h4>
                    <p className="text-[11px] font-mono text-slate-500 truncate">
                      {doc.fileName}
                    </p>
                  </div>
                </div>

                {doc.description && (
                  <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                    {doc.description}
                  </p>
                )}
              </div>

              {/* Footer info & action buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2 text-[11px]">
                <div className="text-slate-500 truncate">
                  By <span className="text-slate-300 font-medium">{doc.uploaderName}</span> • {new Date(doc.uploadedAt).toLocaleDateString()}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Share to Chat */}
                  <button
                    onClick={() => handleShareToChat(doc)}
                    title="Share link in study room chat"
                    className="p-2 rounded-xl bg-slate-950/60 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Read in App */}
                  <button
                    onClick={() => {
                      openPdfInReader(doc, 1);
                      onNavigateToPdfReader?.();
                      addToast('Opening in PDF Reader', `Reading "${doc.title}"`, 'info');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-semibold border border-sky-500/30 transition-all text-xs"
                    title="Read PDF directly inside the app"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Read</span>
                  </button>

                  {/* Direct Download */}
                  <a
                    href={`${API_BASE_URL}/api/telegram/download/${doc.telegramFileId}?docId=${doc.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/20 transition-all text-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* UPLOAD DOCUMENT MODAL */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div 
            className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col gap-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsUploadOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Upload className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Upload Study Material</h3>
                <p className="text-xs text-slate-400">Stores permanently in your private Telegram channel storage.</p>
              </div>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-3.5 text-xs">
              
              {/* File Dropzone */}
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Select Document / PDF:
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-white/15 hover:border-indigo-500/60 rounded-2xl p-5 text-center cursor-pointer bg-slate-950/60 hover:bg-slate-950/90 transition-all flex flex-col items-center justify-center gap-2"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const f = e.target.files[0];
                        setUploadFile(f);
                        if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^/.]+$/, ''));
                      }
                    }}
                  />
                  <Cloud className="w-8 h-8 text-indigo-400" />
                  {uploadFile ? (
                    <div>
                      <p className="font-bold text-white">{uploadFile.name}</p>
                      <p className="text-[11px] text-slate-500">{formatBytes(uploadFile.size)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-semibold text-slate-300">Click to choose notes, PDF, or formula sheet</p>
                      <p className="text-[11px] text-slate-500">PDF, Word, Images, Text (up to 50MB)</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Document Title:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Quantitative Aptitude - Profit & Loss 100 Formulas"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-3.5 py-2.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Subject Category:
                </label>
                <select
                  value={uploadSubject}
                  onChange={(e) => setUploadSubject(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  {subjects.filter(s => s !== 'All').map((sub) => (
                    <option key={sub} value={sub} className="bg-slate-900 text-white">
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Short Description / Notes (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Important formulas for upcoming RRB PO Prelims 2026"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-3.5 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isUploading || !uploadFile}
                className="w-full mt-2 py-3 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold rounded-2xl shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Uploading to Telegram Cloud...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Upload & Share with Room</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TELEGRAM CONFIGURATION MODAL */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div 
            className="w-full max-w-lg bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col gap-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowConfigModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/25">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Telegram Storage Setup</h3>
                <p className="text-xs text-slate-400">Connect your private channel to enable unlimited file storage.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950/70 border border-white/10 rounded-2xl text-xs space-y-2">
              <p className="font-semibold text-slate-300">How to connect your private channel:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 leading-relaxed">
                <li>Make sure your bot <span className="font-mono text-cyan-300">@studyosprobot</span> is added as an **Admin** in your private channel.</li>
                <li>Post any message inside your channel (e.g. type <span className="font-mono text-emerald-400">test</span>) or forward a message from the channel to the bot.</li>
                <li>Click the **Auto-Detect** button below!</li>
              </ol>
            </div>

            {/* Auto Detect Button */}
            <button
              onClick={handleDetectChannel}
              disabled={detectingChannel}
              className="w-full py-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold rounded-2xl shadow-xl shadow-sky-500/25 flex items-center justify-center gap-2 text-xs transition-all disabled:opacity-50"
            >
              {detectingChannel ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Scanning Telegram Updates...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Auto-Detect Channel from Telegram</span>
                </>
              )}
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink mx-3 text-[11px] text-slate-500 font-medium">OR Enter Manually</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            {/* Manual Channel ID Form */}
            <form onSubmit={handleSaveManualChannel} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Channel ID:
                </label>
                <input
                  type="text"
                  placeholder="e.g. -1002345678901 or @channelusername"
                  value={manualChannelId}
                  onChange={(e) => setManualChannelId(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-3.5 py-2.5 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-2xl transition-colors"
              >
                Save Channel ID to MongoDB
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
