import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Users,
  Radio,
  FileText,
  FolderLock,
  Search,
  Sparkles,
  ExternalLink,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  X,
  Maximize
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
    sendPdfPageChange,
    stopPdfPresentation,
    openPdfInReader,
    openPeerDossier,
    addToast
  } = useSocket();

  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(100);
  const [viewMode, setViewMode] = useState<'fit-width' | 'fit-page' | 'custom'>('fit-width');
  const [isSoloMode, setIsSoloMode] = useState<boolean>(true);
  const [isFollowingPresenter, setIsFollowingPresenter] = useState<boolean>(true);
  const [pageInput, setPageInput] = useState<string>(String(activePdfPage || 1));
  const [searchDocQuery, setSearchDocQuery] = useState<string>('');
  
  // Chatbox visibility toggle (Hide / Unhide)
  const [isChatOpen, setIsChatOpen] = useState<boolean>(true);
  
  // Fullscreen reading mode
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fetch all documents from Telegram Vault
  const fetchRoomDocuments = async () => {
    setLoadingDocs(true);
    try {
      const url = roomId
        ? `${API_BASE_URL}/api/telegram/documents?roomId=${encodeURIComponent(roomId)}`
        : `${API_BASE_URL}/api/telegram/documents`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDocuments(data);
        // If no active PDF is currently loaded, load the first available document
        if (!activePdfDoc && data.length > 0) {
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

  // Keep page input in sync with active page
  useEffect(() => {
    setPageInput(String(activePdfPage));
  }, [activePdfPage]);

  // Follow presenter if in presentation mode and following is active
  useEffect(() => {
    if (pdfPresentation?.isActive && pdfPresentation.presenterId !== currentUser.id && isFollowingPresenter) {
      if (activePdfDoc?.id !== pdfPresentation.documentId) {
        const found = documents.find(d => d.id === pdfPresentation.documentId);
        if (found) {
          setActivePdfDoc(found);
        }
      }
      setActivePdfPage(pdfPresentation.currentPage || 1);
    }
  }, [pdfPresentation, isFollowingPresenter, documents]);

  // Broadcast current reading status to peers
  useEffect(() => {
    if (activePdfDoc) {
      updateMyPdfReadingStatus(activePdfDoc, activePdfPage);
    }
  }, [activePdfDoc, activePdfPage, updateMyPdfReadingStatus]);

  // Toggle true browser fullscreen
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

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;
    setActivePdfPage(newPage);
    if (!isSoloMode && pdfPresentation?.presenterId === currentUser.id) {
      sendPdfPageChange(newPage);
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(pageInput, 10);
    if (!isNaN(p) && p >= 1) {
      handlePageChange(p);
    } else {
      setPageInput(String(activePdfPage));
    }
  };

  const handleTogglePresentation = () => {
    if (!activePdfDoc) return;
    if (pdfPresentation?.presenterId === currentUser.id) {
      stopPdfPresentation();
      setIsSoloMode(true);
    } else {
      startPdfPresentation(activePdfDoc, activePdfPage);
      setIsSoloMode(false);
    }
  };

  const handleAskAiAboutCurrentPage = () => {
    if (!activePdfDoc) return;
    const prompt = `Please explain the key concepts and exam formulas from "${activePdfDoc.title}" on Page ${activePdfPage}. Provide short tricks and memory techniques for RRB & IBPS PO.`;
    onAskAiDoubt?.(prompt);
  };

  // Filter peers who are currently reading a PDF
  const peersReadingPdf = peers.filter(p => p.userId !== currentUser.id && p.currentDocument);

  // Build stream URL with Fit Width (FitH) and Page parameters
  const viewParam = viewMode === 'fit-width' ? 'FitH' : viewMode === 'fit-page' ? 'Fit' : '';
  const zoomParam = viewMode === 'custom' ? `&zoom=${zoom}` : '';
  const streamUrl = activePdfDoc?.telegramFileId
    ? `${API_BASE_URL}/api/telegram/stream/${activePdfDoc.telegramFileId}#page=${activePdfPage}&view=${viewParam}${zoomParam}`
    : '';

  const filteredDocs = documents.filter(d =>
    d.title.toLowerCase().includes(searchDocQuery.toLowerCase()) ||
    d.fileName.toLowerCase().includes(searchDocQuery.toLowerCase()) ||
    d.subject.toLowerCase().includes(searchDocQuery.toLowerCase())
  );

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex flex-col bg-[#090d16] text-slate-100 overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen' : 'h-[calc(100vh-4.2rem)]'
      }`}
    >
      
      {/* 1. TOP CONTROL BAR */}
      <div className="bg-slate-900/95 border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xl shrink-0 z-10">
        
        {/* Left: Document Title & Library Switcher */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => setIsLibraryOpen(!isLibraryOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-all shrink-0 shadow-sm"
            title="Open Document Library Drawer"
          >
            <FolderLock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Library ({documents.length})</span>
          </button>

          <div className="min-w-0">
            <h2 className="text-xs font-extrabold text-white truncate max-w-xs md:max-w-md flex items-center gap-1.5">
              <span>{activePdfDoc?.title || 'No Document Selected'}</span>
              {activePdfDoc?.subject && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0">
                  {activePdfDoc.subject}
                </span>
              )}
            </h2>
            <p className="text-[10px] font-mono text-slate-400 truncate">
              {activePdfDoc?.fileName || 'Select a document from library'}
            </p>
          </div>
        </div>

        {/* Center: Page Controls & Fit Width / Zoom Modes */}
        <div className="flex items-center gap-2">
          
          {/* Previous Page */}
          <button
            onClick={() => handlePageChange(activePdfPage - 1)}
            disabled={activePdfPage <= 1}
            className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page Input Form */}
          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
            <span className="text-xs text-slate-400 font-medium">Page</span>
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              className="w-12 px-1.5 py-1 text-center bg-slate-950 border border-white/15 rounded-lg text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-400"
            />
          </form>

          {/* Next Page */}
          <button
            onClick={() => handlePageChange(activePdfPage + 1)}
            className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-300 hover:text-white transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block" />

          {/* Fit Width / Fit Page Quick Switcher */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setViewMode('fit-width')}
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                viewMode === 'fit-width'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Fit to Width: Expands PDF horizontally to fill full reader"
            >
              Fit Width
            </button>
            <button
              onClick={() => setViewMode('fit-page')}
              className={`px-2 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                viewMode === 'fit-page'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Fit to Page: View full page height"
            >
              Fit Page
            </button>
          </div>

          {/* Zoom In / Out Controls */}
          <div className="hidden md:flex items-center gap-1 bg-slate-950 p-0.5 rounded-xl border border-white/10">
            <button
              onClick={() => {
                setViewMode('custom');
                setZoom(Math.max(50, zoom - 15));
              }}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 px-1 font-semibold">
              {viewMode === 'fit-width' ? 'Auto Width' : `${zoom}%`}
            </span>
            <button
              onClick={() => {
                setViewMode('custom');
                setZoom(Math.min(200, zoom + 15));
              }}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setViewMode('fit-width');
                setZoom(100);
              }}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
              title="Reset to Fit Width"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

        </div>

        {/* Right: Fullscreen, Chatbox Toggle & Co-Study presentation */}
        <div className="flex items-center gap-2">
          
          {/* Ask AI Doubt Button */}
          <button
            onClick={handleAskAiAboutCurrentPage}
            disabled={!activePdfDoc}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 transition-all disabled:opacity-40"
            title="Ask AI Teacher doubt about this page"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Ask AI About Page</span>
          </button>

          {/* Toggle Presentation Mode */}
          <button
            onClick={handleTogglePresentation}
            disabled={!activePdfDoc}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              pdfPresentation?.presenterId === currentUser.id
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/30 animate-pulse'
                : 'bg-slate-950 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
            }`}
            title={pdfPresentation?.presenterId === currentUser.id ? 'Stop Group Presentation' : 'Present to Group & Sync Pages'}
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden lg:inline">
              {pdfPresentation?.presenterId === currentUser.id ? 'Stop Presenting' : 'Present to Group'}
            </span>
          </button>

          {/* Chatbox Hide / Unhide Toggle Button */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              isChatOpen
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/25'
                : 'bg-slate-950 border-white/10 text-slate-300 hover:text-white hover:border-white/20'
            }`}
            title={isChatOpen ? 'Hide Chat (Maximize PDF Screen)' : 'Unhide Chat Panel'}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isChatOpen ? 'Hide Chat' : 'Show Chat'}</span>
            {!isChatOpen && chatMessages.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </button>

          {/* Fullscreen Mode Button */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            title={isFullscreen ? 'Exit Full Screen' : 'Full Screen Reading Mode'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-cyan-300" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Direct Tab / Open in Browser button */}
          {streamUrl && (
            <a
              href={streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-colors hidden sm:block"
              title="Open Raw PDF in New Tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

        </div>

      </div>

      {/* 2. PRESENTATION FOLLOWER BANNER (IF SOMEONE IN ROOM IS PRESENTING) */}
      {pdfPresentation?.isActive && pdfPresentation.presenterId !== currentUser.id && (
        <div className="bg-gradient-to-r from-indigo-900/90 via-slate-900 to-cyan-900/90 border-b border-cyan-500/30 px-4 py-2 flex items-center justify-between text-xs shadow-md shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-white font-semibold">
              Live Co-Study: <strong className="text-cyan-300">{pdfPresentation.presenterName}</strong> is presenting "{pdfPresentation.title}" (Page {pdfPresentation.currentPage})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFollowingPresenter(!isFollowingPresenter)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                isFollowingPresenter
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {isFollowingPresenter ? '✓ Following Live' : 'Follow View'}
            </button>

            {!isFollowingPresenter && (
              <span className="text-[11px] text-amber-300 italic hidden md:inline">
                (Reading solo right now)
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. PEER LIVE READING BAR ("WHO IS READING WHAT RIGHT NOW") */}
      {peersReadingPdf.length > 0 && (
        <div className="bg-slate-950/90 border-b border-white/10 px-4 py-1.5 flex items-center gap-3 overflow-x-auto text-xs shrink-0">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 shrink-0 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Peers Reading:</span>
          </span>

          {peersReadingPdf.map((p) => (
            <div
              key={p.userId}
              className="flex items-center gap-2 bg-slate-900/90 border border-white/10 px-2.5 py-1 rounded-xl shrink-0 group hover:border-indigo-500/40 transition-colors"
            >
              <img
                src={p.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.name}`}
                alt={p.name}
                onClick={() => openPeerDossier(p)}
                className="w-5 h-5 rounded-md cursor-pointer hover:scale-110 transition-transform"
                title={`Click to view ${p.name}'s daily study breakdown`}
              />
              <div className="text-[11px] min-w-0 max-w-[160px] truncate">
                <span className="font-bold text-white mr-1">{p.name}:</span>
                <span className="text-slate-400 truncate">{p.currentDocument?.title}</span>
                <span className="text-cyan-300 font-mono ml-1">P.{p.currentDocument?.currentPage}</span>
              </div>

              <button
                onClick={() => {
                  if (p.currentDocument) {
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
                    addToast('Read Along Started!', `Opened "${p.currentDocument.title}" at Page ${p.currentDocument.currentPage} with ${p.name}`, 'success');
                  }
                }}
                className="px-2 py-0.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[10px] font-semibold transition-colors"
                title={`Read along with ${p.name} on Page ${p.currentDocument?.currentPage}`}
              >
                Read Along
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 4. MAIN WORKSPACE: PDF VIEWER (FULL EXPANDED) + INTEGRATED LIVE CHATBOX */}
      <div className="flex-1 relative flex flex-col lg:flex-row overflow-hidden bg-slate-950">
        
        {/* PDF Viewer Frame (Auto expands to 100% full width when chat is hidden) */}
        <div className={`flex-1 relative h-full flex flex-col overflow-hidden transition-all duration-300 ${
          isChatOpen ? '' : 'w-full'
        }`}>
          {activePdfDoc ? (
            <div className="w-full h-full relative flex-1 bg-slate-950">
              <iframe
                ref={iframeRef}
                src={streamUrl}
                title={activePdfDoc.title}
                className="w-full h-full border-0 bg-slate-950"
              />
            </div>
          ) : (
            /* Empty State - No document loaded */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-base font-extrabold text-white mb-1">No Study PDF Selected</h3>
              <p className="text-xs text-slate-400 max-w-sm mb-4">
                Open the document library to choose from Telegram Vault materials or upload your own notes.
              </p>
              <button
                onClick={() => setIsLibraryOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/25 transition-all"
              >
                <FolderLock className="w-4 h-4" />
                <span>Browse Telegram Vault Library</span>
              </button>
            </div>
          )}

          {/* Floating Summon Chat Button (Visible only when chatbox is hidden) */}
          {!isChatOpen && (
            <button
              onClick={() => setIsChatOpen(true)}
              className="absolute bottom-5 right-5 z-20 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-2xl shadow-indigo-600/50 border border-indigo-400/30 hover:scale-105 active:scale-95 transition-all"
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

        {/* 5. SIDE-BY-SIDE LIVE VOICE & DOUBTS CHATBOX (COLLAPSIBLE / UNHIDEABLE) */}
        {isChatOpen && (
          <div className="w-full lg:w-96 shrink-0 h-80 lg:h-full p-2.5 border-t lg:border-t-0 lg:border-l border-white/10 bg-slate-950/80 backdrop-blur-md flex flex-col z-20 animate-in slide-in-from-right duration-200">
            <VoiceChatPanel
              mode="pdf"
              activePdfTitle={activePdfDoc?.title}
              activePdfPage={activePdfPage}
              onJumpPdfPage={(page) => handlePageChange(page)}
              onClose={() => setIsChatOpen(false)}
              title="PDF Doubts & Discussion"
            />
          </div>
        )}

        {/* 6. SLIDE-OUT DOCUMENT LIBRARY DRAWER */}
        {isLibraryOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-80 sm:w-96 bg-slate-900 border-l border-white/10 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
            
            <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <FolderLock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                  Telegram Vault Library
                </h3>
              </div>
              <button
                onClick={() => setIsLibraryOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
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
                      openPdfInReader(doc, 1);
                      setIsLibraryOpen(false);
                      addToast('Loaded Document', `Now reading "${doc.title}"`, 'info');
                    }}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      activePdfDoc?.id === doc.id
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
