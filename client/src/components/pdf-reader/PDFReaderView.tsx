import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BookOpen,
  FolderLock,
  Search,
  Sparkles,
  ExternalLink,
  MessageSquare,
  Upload,
  X,
  Maximize2,
  Minimize2,
  Radio,
  Users,
  FileText
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { StudyDocument } from '../../types.js';
import { API_BASE_URL } from '../../config.js';
import { VoiceChatPanel } from '../voice-chat/VoiceChatPanel.js';

interface PDFReaderViewProps {
  onAskAiDoubt?: (prompt: string) => void;
}

export const PDFReaderView: React.FC<PDFReaderViewProps> = ({ onAskAiDoubt }) => {
  const {
    roomId,
    currentUser,
    peers,
    activePdfDoc,
    activePdfPage,
    pdfPresentation,
    chatMessages,
    setActivePdfDoc,
    setActivePdfPage,
    updateMyPdfReadingStatus,
    startPdfPresentation,
    stopPdfPresentation,
    openPdfInReader,
    openPeerDossier,
    addToast
  } = useSocket();

  // Document states
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [searchDocQuery, setSearchDocQuery] = useState<string>('');
  const [localPdfUrl, setLocalPdfUrl] = useState<string | null>(null);

  // Layout & UI states
  const [isChatOpen, setIsChatOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [isFollowingPresenter, setIsFollowingPresenter] = useState<boolean>(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up any generated blob URLs when component unmounts or changes
  useEffect(() => {
    return () => {
      if (localPdfUrl) {
        URL.revokeObjectURL(localPdfUrl);
      }
    };
  }, [localPdfUrl]);

  // Fetch documents from Telegram Vault / Sample seeded notes
  const fetchRoomDocuments = async () => {
    setLoadingDocs(true);
    try {
      const url = roomId
        ? `${API_BASE_URL}/api/telegram/documents?roomId=${encodeURIComponent(roomId)}`
        : `${API_BASE_URL}/api/telegram/documents`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setDocuments(data);
        if (!activePdfDoc && !localPdfUrl) {
          openPdfInReader(data[0], 1);
        }
      }
    } catch (e) {
      console.error('Failed to load PDF documents:', e);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchRoomDocuments();
  }, [roomId]);

  // Presenter follower sync
  useEffect(() => {
    if (pdfPresentation?.isActive && pdfPresentation.presenterId !== currentUser.id && isFollowingPresenter) {
      if (activePdfDoc?.id !== pdfPresentation.documentId) {
        const found = documents.find(d => d.id === pdfPresentation.documentId);
        if (found) {
          setActivePdfDoc(found);
          setLocalPdfUrl(null);
        }
      }
      setActivePdfPage(pdfPresentation.currentPage || 1);
    }
  }, [pdfPresentation, isFollowingPresenter, documents]);

  // Broadcast reading status to peer students
  useEffect(() => {
    if (activePdfDoc) {
      updateMyPdfReadingStatus(activePdfDoc, activePdfPage);
    }
  }, [activePdfDoc, activePdfPage, updateMyPdfReadingStatus]);

  // Fullscreen event listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {
        setIsFullscreen(!isFullscreen);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Local File Upload / Drag-and-Drop Handler
  const handleLocalPdfUpload = (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      addToast('Invalid File', 'Please select a valid .pdf document.', 'alert');
      return;
    }

    if (localPdfUrl) {
      URL.revokeObjectURL(localPdfUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalPdfUrl(objectUrl);

    const localDoc: StudyDocument = {
      id: `local-pdf-${Date.now()}`,
      title: file.name.replace(/\.pdf$/i, ''),
      fileName: file.name,
      subject: 'Local Notes',
      fileSize: file.size,
      mimeType: 'application/pdf',
      telegramFileId: '',
      telegramMessageId: 0,
      uploaderId: currentUser.id,
      uploaderName: currentUser.name || 'You',
      uploadedAt: new Date().toISOString(),
      downloadCount: 1,
      description: 'Opened directly from local device',
      roomId: roomId || 'STUDY-ALPHA'
    };

    setDocuments(prev => [localDoc, ...prev]);
    openPdfInReader(localDoc, 1);
    addToast('PDF Loaded', `Opened "${file.name}" with native continuous scrolling!`, 'success');
  };

  // Co-Study Presentation toggle
  const handleTogglePresentation = () => {
    if (!activePdfDoc) return;
    if (pdfPresentation?.presenterId === currentUser.id) {
      stopPdfPresentation();
    } else {
      startPdfPresentation(activePdfDoc, activePdfPage);
    }
  };

  const handleAskAiAboutDocument = () => {
    if (!activePdfDoc) return;
    const prompt = `Please explain the key formulas, definitions, and exam tricks from "${activePdfDoc.title}". Provide 3 high-yield memory techniques and practice questions.`;
    onAskAiDoubt?.(prompt);
  };

  // Filter peers reading
  const peersReadingPdf = peers.filter(p => p.userId !== currentUser.id && p.currentDocument);

  // Native streaming URL:
  // Using #toolbar=1&navpanes=0&view=FitH ensures:
  // 1. Native continuous vertical scrolling through all pages with mouse wheel/trackpad.
  // 2. Fits width cleanly so textbook text is large and crisp.
  // 3. Built-in search (Ctrl+F), page navigation, and zoom controls.
  const streamUrl = useMemo(() => {
    if (localPdfUrl) return localPdfUrl;
    if (!activePdfDoc?.telegramFileId) return '';
    return `${API_BASE_URL}/api/telegram/stream/${activePdfDoc.telegramFileId}#toolbar=1&navpanes=0&view=FitH`;
  }, [localPdfUrl, activePdfDoc?.telegramFileId]);

  const filteredDocs = documents.filter(d =>
    d.title.toLowerCase().includes(searchDocQuery.toLowerCase()) ||
    d.fileName.toLowerCase().includes(searchDocQuery.toLowerCase()) ||
    d.subject.toLowerCase().includes(searchDocQuery.toLowerCase())
  );

  return (
    <div
      ref={containerRef}
      className={`flex-1 min-h-0 w-full h-full flex flex-col bg-[#070b14] text-slate-100 overflow-hidden select-none ${
        isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files?.[0]) {
          handleLocalPdfUpload(e.dataTransfer.files[0]);
        }
      }}
    >
      
      {/* Hidden file input for opening local PDFs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleLocalPdfUpload(e.target.files[0]);
          }
        }}
      />

      {/* 1. TOP COMPACT CONTROL BAR (Fixed single row, zero wrap overflow) */}
      <div className="h-11 bg-slate-900/95 border-b border-white/10 px-3 flex items-center justify-between gap-2 shadow-xl shrink-0 z-10">
        
        {/* Left: Library Drawer, Open Local PDF & Document Title */}
        <div className="flex items-center gap-2 min-w-0">
          
          {/* Library Button */}
          <button
            onClick={() => setIsLibraryOpen(!isLibraryOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all shrink-0"
            title="Browse Telegram Vault Library"
          >
            <FolderLock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Library ({documents.length})</span>
          </button>

          {/* Open Local PDF Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-all shrink-0"
            title="Open any PDF from your laptop or phone"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Open PDF</span>
          </button>

          {/* Document Title Header */}
          <div className="min-w-0 ml-1 flex items-center gap-1.5">
            <h2
              className="text-xs font-extrabold text-white truncate max-w-[140px] sm:max-w-xs md:max-w-md"
              title={activePdfDoc?.title || 'No Document Selected'}
            >
              {activePdfDoc?.title || 'No Document Selected'}
            </h2>
            {activePdfDoc?.subject && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0 hidden sm:inline-block">
                {activePdfDoc.subject}
              </span>
            )}
          </div>

        </div>

        {/* Right: Ask AI, Co-Study Broadcast, Chatbox Toggle, Fullscreen */}
        <div className="flex items-center gap-1.5 shrink-0">
          
          {/* Ask AI Doubt Button */}
          <button
            onClick={handleAskAiAboutDocument}
            disabled={!activePdfDoc}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 transition-all disabled:opacity-40"
            title="Ask AI Teacher doubt about this study material"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Ask AI</span>
          </button>

          {/* Group Presentation Toggle */}
          <button
            onClick={handleTogglePresentation}
            disabled={!activePdfDoc}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              pdfPresentation?.presenterId === currentUser.id
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30 animate-pulse'
                : 'bg-slate-950 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
            }`}
            title={pdfPresentation?.presenterId === currentUser.id ? 'Stop Group Presentation' : 'Present to Group & Sync Pages'}
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xl:inline">
              {pdfPresentation?.presenterId === currentUser.id ? 'Stop Presenting' : 'Present to Group'}
            </span>
          </button>

          {/* Chatbox Hide / Show Toggle Button */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              isChatOpen
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/25'
                : 'bg-slate-950 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
            }`}
            title={isChatOpen ? 'Hide Chat (Full Screen Reading Mode)' : 'Show Chat'}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{isChatOpen ? 'Hide Chat' : 'Show Chat'}</span>
            {!isChatOpen && chatMessages.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </button>

          {/* Fullscreen Mode Button */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            title={isFullscreen ? 'Exit Full Screen' : 'Distraction-Free Full Screen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-cyan-300" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* External Tab Link */}
          {streamUrl && (
            <a
              href={streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors hidden sm:block"
              title="Open Raw PDF in New Tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

        </div>

      </div>

      {/* 2. PRESENTATION FOLLOWER BANNER (IF PEER IS PRESENTING) */}
      {pdfPresentation?.isActive && pdfPresentation.presenterId !== currentUser.id && (
        <div className="bg-gradient-to-r from-indigo-900/90 via-slate-900 to-cyan-900/90 border-b border-cyan-500/30 px-3 py-1 flex items-center justify-between text-xs shadow-md shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-white font-medium text-[11px] truncate">
              Live Co-Study: <strong className="text-cyan-300">{pdfPresentation.presenterName}</strong> is presenting "{pdfPresentation.title}"
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsFollowingPresenter(!isFollowingPresenter)}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                isFollowingPresenter
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {isFollowingPresenter ? '✓ Following Live' : 'Follow View'}
            </button>
          </div>
        </div>
      )}

      {/* 3. PEER LIVE READING BAR */}
      {peersReadingPdf.length > 0 && (
        <div className="bg-slate-950/90 border-b border-white/10 px-3 py-1 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 shrink-0 flex items-center gap-1">
            <Users className="w-3 h-3 text-indigo-400" />
            <span>Peers Reading:</span>
          </span>

          {peersReadingPdf.map((p) => (
            <div
              key={p.userId}
              className="flex items-center gap-1.5 bg-slate-900/90 border border-white/10 px-2 py-0.5 rounded-lg shrink-0 group hover:border-indigo-500/40 transition-colors"
            >
              <img
                src={p.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.name}`}
                alt={p.name}
                onClick={() => openPeerDossier(p)}
                className="w-4 h-4 rounded-full cursor-pointer hover:scale-110 transition-transform"
                title={`Click to view ${p.name}'s daily study breakdown`}
              />
              <div className="text-[10px] min-w-0 max-w-[130px] truncate">
                <span className="font-bold text-white mr-1">{p.name}:</span>
                <span className="text-slate-400 truncate">{p.currentDocument?.title}</span>
              </div>

              <button
                onClick={() => {
                  if (p.currentDocument) {
                    setLocalPdfUrl(null);
                    openPdfInReader({
                      id: p.currentDocument.id,
                      title: p.currentDocument.title,
                      fileName: `${p.currentDocument.title}.pdf`,
                      subject: 'Study Notes',
                      fileSize: 0,
                      mimeType: 'application/pdf',
                      telegramFileId: p.currentDocument.fileUrl.split('/stream/')[1] || '',
                      telegramMessageId: 0,
                      uploaderId: p.userId,
                      uploaderName: p.name,
                      uploadedAt: new Date().toISOString(),
                      downloadCount: 0,
                      roomId
                    }, p.currentDocument.currentPage);
                    addToast('Read Along Started!', `Opened "${p.currentDocument.title}" with ${p.name}`, 'success');
                  }
                }}
                className="px-1.5 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[9px] font-semibold transition-colors"
                title={`Read along with ${p.name}`}
              >
                Read Along
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 4. MAIN WORKSPACE AREA (100% Zero-Page-Scroll Flex Layout) */}
      <div className="flex-1 min-h-0 relative flex flex-row overflow-hidden bg-slate-950">
        
        {/* Drag & Drop Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 bg-indigo-600/30 backdrop-blur-sm border-2 border-dashed border-indigo-400 z-30 flex flex-col items-center justify-center text-white pointer-events-none">
            <Upload className="w-12 h-12 text-cyan-300 animate-bounce mb-2" />
            <h3 className="text-lg font-bold">Drop PDF File Here to Open</h3>
            <p className="text-xs text-indigo-200">Will load instantly with smooth native vertical scrolling</p>
          </div>
        )}

        {/* Center/Left: Native Continuous Scrolling PDF Reader Frame */}
        <div className="flex-1 min-h-0 h-full relative flex flex-col overflow-hidden bg-slate-950">
          
          {streamUrl ? (
            <iframe
              key={activePdfDoc?.id || localPdfUrl || 'pdf-stream'}
              src={streamUrl}
              title={activePdfDoc?.title || 'PDF Document'}
              className="w-full h-full border-0 bg-slate-950"
            />
          ) : (
            /* Empty State: Prompt to Open Local PDF or Vault Library */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
              <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-base font-extrabold text-white mb-2">No Study PDF Loaded</h3>
              <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
                Open any textbook or coaching notes from your device, drag & drop a PDF here, or select from the pre-seeded library materials.
              </p>
              
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs shadow-xl shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95"
                >
                  <Upload className="w-4 h-4" />
                  <span>Open PDF from Computer / Phone</span>
                </button>

                <button
                  onClick={() => setIsLibraryOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/10 font-bold text-xs transition-all"
                >
                  <FolderLock className="w-4 h-4 text-indigo-400" />
                  <span>Browse Vault Library ({documents.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* Floating Summon Chat Button (Visible only when chat is hidden) */}
          {!isChatOpen && (
            <button
              onClick={() => setIsChatOpen(true)}
              className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-2xl shadow-indigo-600/50 border border-indigo-400/30 hover:scale-105 active:scale-95 transition-all"
              title="Open Live Chat & Doubts"
            >
              <MessageSquare className="w-4 h-4 text-cyan-300" />
              <span>Live Discussion</span>
              {chatMessages.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-cyan-400 text-slate-950 text-[10px] font-extrabold">
                  {chatMessages.length}
                </span>
              )}
            </button>
          )}

        </div>

        {/* Right: Side-by-Side Live Voice & Doubts Chatbox (Collapsible) */}
        {isChatOpen && (
          <div className="w-80 lg:w-96 shrink-0 h-full p-2 border-l border-white/10 bg-slate-950/90 backdrop-blur-md flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            <VoiceChatPanel
              mode="pdf"
              activePdfTitle={activePdfDoc?.title}
              activePdfPage={activePdfPage}
              onClose={() => setIsChatOpen(false)}
              title="PDF Doubts & Chat"
            />
          </div>
        )}

        {/* 5. SLIDE-OUT VAULT DOCUMENT LIBRARY DRAWER */}
        {isLibraryOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-80 sm:w-96 bg-slate-900 border-l border-white/10 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
            
            <div className="p-3 border-b border-white/10 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <FolderLock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                  Study Vault Materials
                </h3>
              </div>
              <button
                onClick={() => setIsLibraryOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Upload Local PDF within Drawer */}
            <div className="p-3 border-b border-white/5 bg-slate-950/40">
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                  setIsLibraryOpen(false);
                }}
                className="w-full py-2 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <Upload className="w-4 h-4 text-cyan-400" />
                <span>Open PDF from Computer / Phone</span>
              </button>
            </div>

            {/* Search documents */}
            <div className="p-3 border-b border-white/5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search PDFs..."
                  value={searchDocQuery}
                  onChange={(e) => setSearchDocQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            {/* Document List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredDocs.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No documents found matching your search.
                </div>
              ) : (
                filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setLocalPdfUrl(null);
                      openPdfInReader(doc, 1);
                      setIsLibraryOpen(false);
                      addToast('Loaded Document', `Now reading "${doc.title}"`, 'info');
                    }}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      activePdfDoc?.id === doc.id && !localPdfUrl
                        ? 'bg-indigo-600/20 border-indigo-500/50 shadow-md'
                        : 'bg-slate-950/60 border-white/5 hover:border-white/15 hover:bg-slate-950'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="p-2 rounded-xl bg-slate-900 text-rose-400 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-white truncate">
                          {doc.title}
                        </h4>
                        <p className="text-[10px] font-mono text-slate-500 truncate">
                          {doc.fileName}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                          <span className="text-sky-300 font-semibold">{doc.subject}</span>
                          <span>•</span>
                          <span>By {doc.uploaderName}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
