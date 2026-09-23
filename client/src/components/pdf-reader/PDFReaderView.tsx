import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
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
  Upload,
  Sun,
  Moon,
  Coffee,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  AlertCircle,
  Loader2
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

  // Document states
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(true);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [searchDocQuery, setSearchDocQuery] = useState<string>('');

  // Reader viewing & zoom states
  const [totalPages, setTotalPages] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(100);
  const [viewMode, setViewMode] = useState<'fit-width' | 'fit-page' | 'custom'>('fit-width');
  const [rotation, setRotation] = useState<number>(0);
  const [readingTheme, setReadingTheme] = useState<'normal' | 'dark' | 'sepia'>('normal');
  const [pageInput, setPageInput] = useState<string>(String(activePdfPage || 1));
  const [isThumbnailsOpen, setIsThumbnailsOpen] = useState<boolean>(false);

  // Co-study & UI layout states
  const [isSoloMode, setIsSoloMode] = useState<boolean>(true);
  const [isFollowingPresenter, setIsFollowingPresenter] = useState<boolean>(true);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // PDF.js rendering states
  const [pdfJsDoc, setPdfJsDoc] = useState<any>(null);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Fetch documents from Telegram Vault
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
        if (!activePdfDoc) {
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

  // Sync page input with activePdfPage
  useEffect(() => {
    setPageInput(String(activePdfPage || 1));
  }, [activePdfPage]);

  // Presenter follower sync
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

  // Update peer status
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

  // Load PDF.js Document when activePdfDoc changes or local buffer is supplied
  const loadPdfDocument = useCallback(async (source: string | ArrayBuffer) => {
    setRenderError(null);
    setIsRenderingPage(true);

    try {
      const pdfjs = (window as any).pdfjsLib;
      if (!pdfjs) {
        throw new Error('PDF.js engine is still loading. Falling back to stream viewer.');
      }

      const loadingTask = typeof source === 'string'
        ? pdfjs.getDocument({ url: source, withCredentials: false })
        : pdfjs.getDocument({ data: source });

      const pdf = await loadingTask.promise;
      setPdfJsDoc(pdf);
      setTotalPages(pdf.numPages);
      setIsRenderingPage(false);
    } catch (err: any) {
      console.warn('PDF.js load warning (will fallback if needed):', err.message);
      setRenderError(err.message || 'Could not parse PDF using canvas engine');
      setIsRenderingPage(false);
    }
  }, []);

  // When activePdfDoc changes, load via PDF.js
  useEffect(() => {
    if (activePdfDoc) {
      const url = activePdfDoc.telegramFileId
        ? `${API_BASE_URL}/api/telegram/stream/${activePdfDoc.telegramFileId}`
        : '';
      if (url) {
        loadPdfDocument(url);
      }
    }
  }, [activePdfDoc, loadPdfDocument]);

  // Render current page onto Canvas using PDF.js
  const renderCurrentPage = useCallback(async () => {
    if (!pdfJsDoc || !canvasRef.current || !canvasContainerRef.current) return;

    try {
      // Cancel any ongoing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      setIsRenderingPage(true);
      const pageNumber = Math.min(Math.max(1, activePdfPage || 1), totalPages);
      const page = await pdfJsDoc.getPage(pageNumber);

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const containerWidth = canvasContainerRef.current.clientWidth - 48; // comfortable padding
      const containerHeight = canvasContainerRef.current.clientHeight - 48;
      const unscaledViewport = page.getViewport({ scale: 1, rotation });

      let calculatedScale = 1;
      if (viewMode === 'fit-width') {
        calculatedScale = containerWidth > 200 ? containerWidth / unscaledViewport.width : 1.2;
      } else if (viewMode === 'fit-page') {
        const scaleW = containerWidth / unscaledViewport.width;
        const scaleH = containerHeight / unscaledViewport.height;
        calculatedScale = Math.min(scaleW, scaleH);
      } else {
        calculatedScale = (zoom / 100);
      }

      // Support high-DPI displays for ultra-crisp text rendering
      const outputScale = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: calculatedScale, rotation });

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.save();
      ctx.scale(outputScale, outputScale);

      const renderContext = {
        canvasContext: ctx,
        viewport
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
      setIsRenderingPage(false);
    } catch (err: any) {
      if (err.name !== 'RenderingCancelledException') {
        console.warn('Canvas render error:', err);
      }
      setIsRenderingPage(false);
    }
  }, [pdfJsDoc, activePdfPage, totalPages, viewMode, zoom, rotation]);

  // Re-render canvas when parameters change or resize occurs
  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // Re-calculate scale on window resize or when chat opens/closes
  useEffect(() => {
    const handleResize = () => {
      renderCurrentPage();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderCurrentPage, isChatOpen]);

  // Page navigation
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (totalPages && newPage > totalPages)) return;
    setActivePdfPage(newPage);
    if (!isSoloMode && pdfPresentation?.presenterId === currentUser.id) {
      sendPdfPageChange(newPage);
    }
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(pageInput, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      handlePageChange(p);
    } else {
      setPageInput(String(activePdfPage || 1));
    }
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        handlePageChange((activePdfPage || 1) + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePageChange((activePdfPage || 1) - 1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setViewMode('custom');
        setZoom(prev => Math.min(250, prev + 15));
      } else if (e.key === '-') {
        e.preventDefault();
        setViewMode('custom');
        setZoom(prev => Math.max(50, prev - 15));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePdfPage, totalPages, isSoloMode, pdfPresentation]);

  // Local File Upload / Drag-and-Drop Handler
  const handleLocalPdfUpload = (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      addToast('Invalid File', 'Please select a valid .pdf document.', 'alert');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer) {
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
        loadPdfDocument(buffer);
        addToast('PDF Loaded Successfully', `Opened "${file.name}" in high-definition canvas mode!`, 'success');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Co-Study Presentation toggle
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
    const prompt = `Please explain the key formulas, definitions, and exam tricks from "${activePdfDoc.title}" on Page ${activePdfPage}. Provide 3 high-yield memory techniques.`;
    onAskAiDoubt?.(prompt);
  };

  // Filter peers reading
  const peersReadingPdf = peers.filter(p => p.userId !== currentUser.id && p.currentDocument);

  // Fallback stream URL
  const streamUrl = activePdfDoc?.telegramFileId
    ? `${API_BASE_URL}/api/telegram/stream/${activePdfDoc.telegramFileId}#page=${activePdfPage}&view=${viewMode === 'fit-width' ? 'FitH' : 'Fit'}&zoom=${zoom}`
    : '';

  const filteredDocs = documents.filter(d =>
    d.title.toLowerCase().includes(searchDocQuery.toLowerCase()) ||
    d.fileName.toLowerCase().includes(searchDocQuery.toLowerCase()) ||
    d.subject.toLowerCase().includes(searchDocQuery.toLowerCase())
  );

  // CSS theme filters for canvas reading
  const themeFilter =
    readingTheme === 'dark'
      ? 'invert(0.92) hue-rotate(180deg) contrast(1.1) brightness(0.95)'
      : readingTheme === 'sepia'
      ? 'sepia(0.35) contrast(0.95) brightness(0.98)'
      : 'none';

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex flex-col bg-[#070b14] text-slate-100 overflow-hidden select-none ${
        isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen' : 'h-[calc(100vh-4.2rem)]'
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

      {/* 1. TOP CONTROL BAR */}
      <div className="bg-slate-900/95 border-b border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-xl shrink-0 z-10">
        
        {/* Left: Library Drawer, Open Local PDF & Title */}
        <div className="flex items-center gap-2 min-w-0">
          
          {/* Thumbnails Sidebar Toggle */}
          <button
            onClick={() => setIsThumbnailsOpen(!isThumbnailsOpen)}
            className={`p-1.5 rounded-xl border text-xs font-semibold transition-all ${
              isThumbnailsOpen
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                : 'bg-slate-950 border-white/10 text-slate-300 hover:text-white'
            }`}
            title="Toggle Page Thumbnails Sidebar"
          >
            {isThumbnailsOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>

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
          <div className="min-w-0 ml-1">
            <h2 className="text-xs font-extrabold text-white truncate max-w-[160px] md:max-w-xs flex items-center gap-1.5">
              <span>{activePdfDoc?.title || 'No Document Selected'}</span>
              {activePdfDoc?.subject && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0">
                  {activePdfDoc.subject}
                </span>
              )}
            </h2>
            <p className="text-[10px] font-mono text-slate-400 truncate hidden sm:block">
              {activePdfDoc?.fileName || 'Upload or select a PDF to begin'}
            </p>
          </div>
        </div>

        {/* Center: Page Flipping, Page Counter, Fit Width & Zoom */}
        <div className="flex items-center gap-1.5">
          
          {/* Previous Page */}
          <button
            onClick={() => handlePageChange((activePdfPage || 1) - 1)}
            disabled={(activePdfPage || 1) <= 1}
            className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
            title="Previous Page (Left Arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page Counter & Direct Jump */}
          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-xl border border-white/10 text-xs font-mono font-bold">
            <input
              type="text"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              className="w-9 px-1 py-0.5 text-center bg-transparent text-white focus:outline-none text-xs font-bold"
            />
            <span className="text-slate-500">/</span>
            <span className="text-slate-400 min-w-[20px] text-center">{totalPages || 1}</span>
          </form>

          {/* Next Page */}
          <button
            onClick={() => handlePageChange((activePdfPage || 1) + 1)}
            disabled={totalPages > 0 && (activePdfPage || 1) >= totalPages}
            className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
            title="Next Page (Right Arrow)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1 hidden sm:block" />

          {/* Fit Width / Fit Page Buttons */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-950 p-0.5 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => {
                setViewMode('fit-width');
                renderCurrentPage();
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                viewMode === 'fit-width'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Fit to Width: Fills full horizontal screen width for large, clear reading"
            >
              Fit Width
            </button>
            <button
              onClick={() => {
                setViewMode('fit-page');
                renderCurrentPage();
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                viewMode === 'fit-page'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Fit to Page: Fits full page height on screen"
            >
              Fit Page
            </button>
          </div>

          {/* Zoom Buttons */}
          <div className="hidden md:flex items-center gap-1 bg-slate-950 p-0.5 rounded-xl border border-white/10">
            <button
              onClick={() => {
                setViewMode('custom');
                setZoom(Math.max(50, zoom - 15));
              }}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 px-1 font-semibold">
              {viewMode === 'fit-width' ? 'Auto Width' : `${zoom}%`}
            </span>
            <button
              onClick={() => {
                setViewMode('custom');
                setZoom(Math.min(250, zoom + 15));
              }}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 90-degree Rotation */}
          <button
            onClick={() => setRotation((prev) => (prev + 90) % 360)}
            className="p-1.5 rounded-xl bg-slate-950 border border-white/10 text-slate-400 hover:text-white transition-colors hidden lg:block"
            title="Rotate Page 90° Clockwise"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          {/* Reading Eye Care Themes (Normal / Dark Mode / Sepia) */}
          <div className="hidden lg:flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-xl border border-white/10">
            <button
              onClick={() => setReadingTheme('normal')}
              className={`p-1.5 rounded-lg transition-colors ${
                readingTheme === 'normal' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Standard Paper Theme"
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setReadingTheme('dark')}
              className={`p-1.5 rounded-lg transition-colors ${
                readingTheme === 'dark' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Night Dark Mode (Inverted text for zero eye strain)"
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setReadingTheme('sepia')}
              className={`p-1.5 rounded-lg transition-colors ${
                readingTheme === 'sepia' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Warm Sepia Book Tone"
            >
              <Coffee className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Right: Ask AI, Co-Study Broadcast, Chat Toggle, Fullscreen */}
        <div className="flex items-center gap-1.5">
          
          {/* Ask AI Doubt Button */}
          <button
            onClick={handleAskAiAboutCurrentPage}
            disabled={!activePdfDoc}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 transition-all disabled:opacity-40"
            title="Ask AI Teacher doubt about current page"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Ask AI About Page</span>
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
            <span className="hidden lg:inline">
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
            <span className="hidden sm:inline">{isChatOpen ? 'Hide Chat' : 'Show Chat'}</span>
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
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-cyan-300" /> : <Maximize2 className="w-4 h-4" />}
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
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

        </div>

      </div>

      {/* 2. PRESENTATION FOLLOWER BANNER (IF PEER IS PRESENTING) */}
      {pdfPresentation?.isActive && pdfPresentation.presenterId !== currentUser.id && (
        <div className="bg-gradient-to-r from-indigo-900/90 via-slate-900 to-cyan-900/90 border-b border-cyan-500/30 px-4 py-1.5 flex items-center justify-between text-xs shadow-md shrink-0">
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

      {/* 3. PEER LIVE READING BAR */}
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

      {/* 4. MAIN WORKSPACE AREA */}
      <div className="flex-1 relative flex flex-col lg:flex-row overflow-hidden bg-[#060a12]">
        
        {/* Visual Page Thumbnails Left Drawer (Collapsible) */}
        {isThumbnailsOpen && (
          <div className="w-48 bg-slate-900 border-r border-white/10 flex flex-col shrink-0 z-20 animate-in slide-in-from-left duration-200">
            <div className="p-2.5 border-b border-white/10 flex items-center justify-between text-xs font-bold text-slate-300">
              <span>Pages ({totalPages})</span>
              <button
                onClick={() => setIsThumbnailsOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                <div
                  key={pNum}
                  onClick={() => handlePageChange(pNum)}
                  className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all ${
                    pNum === (activePdfPage || 1)
                      ? 'bg-indigo-600/30 border-indigo-500 text-white font-bold shadow-md'
                      : 'bg-slate-950/60 border-white/5 text-slate-400 hover:text-white hover:bg-slate-950'
                  }`}
                >
                  <div className="w-full aspect-[3/4] bg-slate-800 rounded-lg flex items-center justify-center mb-1 text-[10px] border border-white/5 font-mono">
                    Page {pNum}
                  </div>
                  <span className="text-[11px]">P. {pNum}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Center: Canvas PDF Reader Canvas Area */}
        <div
          ref={canvasContainerRef}
          className={`flex-1 relative h-full flex flex-col items-center overflow-auto p-4 transition-all duration-300 ${
            isChatOpen ? '' : 'w-full'
          }`}
        >
          
          {/* Drag & Drop Overlay */}
          {isDraggingOver && (
            <div className="absolute inset-0 bg-indigo-600/30 backdrop-blur-sm border-2 border-dashed border-indigo-400 z-30 flex flex-col items-center justify-center text-white">
              <Upload className="w-12 h-12 text-cyan-300 animate-bounce mb-2" />
              <h3 className="text-lg font-bold">Drop PDF File Here to Open</h3>
              <p className="text-xs text-indigo-200">Will load instantly in canvas reader</p>
            </div>
          )}

          {/* Active PDF Viewer Container */}
          {activePdfDoc ? (
            <div className="flex flex-col items-center w-full min-h-full justify-start relative">
              
              {/* Rendering Loading Spinner */}
              {isRenderingPage && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-xl bg-slate-900/90 text-white text-xs font-semibold backdrop-blur-md border border-white/10 flex items-center gap-2 shadow-xl animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Rendering Page {activePdfPage || 1}...</span>
                </div>
              )}

              {/* HTML5 Canvas for PDF.js Rendering */}
              <div
                className="relative shadow-2xl rounded-lg overflow-hidden transition-all duration-200 my-auto"
                style={{
                  filter: themeFilter,
                  maxWidth: '100%'
                }}
              >
                <canvas
                  ref={canvasRef}
                  className="block mx-auto rounded-lg shadow-2xl bg-white"
                />
              </div>

              {/* Graceful Fallback if PDF.js is unavailable */}
              {renderError && (
                <div className="w-full flex-1 flex flex-col items-center justify-center p-4">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-200 text-xs mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Using direct browser streaming reader mode:</span>
                  </div>
                  <iframe
                    src={streamUrl}
                    title={activePdfDoc.title}
                    className="w-full h-[80vh] border-0 rounded-2xl bg-slate-950"
                  />
                </div>
              )}

            </div>
          ) : (
            /* Empty State: Prompt to Open Local PDF or Vault Library */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
              <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
                <BookOpen className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-extrabold text-white mb-2">No Study PDF Loaded</h3>
              <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
                Open any textbook or coaching notes from your device, drag & drop a PDF here, or select from the pre-seeded library materials.
              </p>
              
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs shadow-xl shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95"
                >
                  <Upload className="w-4 h-4" />
                  <span>Open PDF from Computer / Phone</span>
                </button>

                <button
                  onClick={() => setIsLibraryOpen(true)}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/10 font-bold text-xs transition-all"
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

        {/* 5. SIDE-BY-SIDE LIVE VOICE & DOUBTS CHATBOX */}
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

        {/* 6. SLIDE-OUT VAULT DOCUMENT LIBRARY DRAWER */}
        {isLibraryOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-80 sm:w-96 bg-slate-900 border-l border-white/10 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
            
            <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-slate-950/60">
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
