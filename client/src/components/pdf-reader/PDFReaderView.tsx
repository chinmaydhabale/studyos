import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  FileText,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Loader2,
  ZoomIn,
  ZoomOut,
  AlertCircle
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { StudyDocument } from '../../types.js';
import { API_BASE_URL } from '../../config.js';
import { VoiceChatPanel } from '../voice-chat/VoiceChatPanel.js';
import { PdfPageView } from './PdfPageView.js';
import { PDFAiPanel } from './PDFAiPanel.js';
import { extractPageText, pdfjsLib, PDFDocumentProxy } from '../../lib/pdfjs.js';

interface PDFReaderViewProps {
  onAskAiDoubt?: (prompt: string) => void;
}

// Pages rendered around the current one. Keeps huge PDFs fast while the
// placeholders preserve scroll position.
const PAGE_RENDER_RADIUS = 2;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

export const PDFReaderView: React.FC<PDFReaderViewProps> = ({ onAskAiDoubt }) => {
  const {
    socket,
    roomId,
    currentUser,
    peers,
    activePdfDoc,
    activePdfPage,
    pdfPresentation,
    chatMessages,
    setActivePdfDoc,
    setActivePdfPage,
    sendPdfPageChange,
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

  // Cloud sync & peer Read Along states
  const [syncStatus, setSyncStatus] = useState<'idle' | 'uploading' | 'synced' | 'error'>('idle');
  const [localPdfDocId, setLocalPdfDocId] = useState<string | null>(null);
  const [readAlongPeerId, setReadAlongPeerId] = useState<string | null>(null);

  // Layout & UI states
  const [isChatOpen, setIsChatOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [isFollowingPresenter, setIsFollowingPresenter] = useState<boolean>(true);
  const [displayPage, setDisplayPage] = useState<number>(1);
  const previousDisplayPageRef = useRef(displayPage);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // pdf.js viewer state
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pdfScale, setPdfScale] = useState<number>(1.3);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pageSizes, setPageSizes] = useState<Record<number, { width: number; height: number }>>({});

  // AI assistant state
  const [isAiOpen, setIsAiOpen] = useState<boolean>(false);
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionAnchor, setSelectionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [autoRunSelection, setAutoRunSelection] = useState<number>(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingScrollPageRef = useRef<number | null>(null);
  const loadedPdfSourceRef = useRef<string | null>(null);
  const lastScrolledDocumentIdRef = useRef<string | null>(null);
  const previousPdfScaleRef = useRef(pdfScale);

  const requestPageScroll = useCallback((page: number) => {
    if (!Number.isFinite(page) || page < 1) return;
    pendingScrollPageRef.current = page;
    setDisplayPage(page);
  }, []);

  const clearPdfSelection = useCallback(() => {
    setSelectedText('');
    setSelectionAnchor(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handlePageRendered = useCallback(
    (pageNumber: number, _element: HTMLDivElement, size: { width: number; height: number }) => {
      setPageSizes(prev => {
        const current = prev[pageNumber];
        if (current?.width === size.width && current?.height === size.height) return prev;
        return { ...prev, [pageNumber]: size };
      });
    },
    []
  );

  // Refs that always mirror the latest values so effects can read them without
  // re-running (and without capturing stale renders).
  const localPdfUrlRef = useRef<string | null>(null);
  const localPdfDocIdRef = useRef<string | null>(null);
  const documentsRef = useRef<StudyDocument[]>([]);
  const activePdfDocRef = useRef<StudyDocument | null>(null);
  const displayPageRef = useRef<number>(1);
  const lastReadingStatusRef = useRef<{ docId: string | null; page: number; roomId: string } | null>(null);

  localPdfUrlRef.current = localPdfUrl;
  localPdfDocIdRef.current = localPdfDocId;
  documentsRef.current = documents;
  activePdfDocRef.current = activePdfDoc;
  displayPageRef.current = displayPage;

  // Revoke the final blob URL exactly once, on unmount only.
  useEffect(() => {
    return () => {
      if (localPdfUrlRef.current) {
        URL.revokeObjectURL(localPdfUrlRef.current);
        localPdfUrlRef.current = null;
      }
    };
  }, []);

  // Fetch documents from Telegram Vault / Sample seeded notes
  const fetchRoomDocuments = async () => {
    setLoadingDocs(true);
    try {
      const url = roomId
        ? `${API_BASE_URL}/api/telegram/documents?roomId=${encodeURIComponent(roomId)}`
        : `${API_BASE_URL}/api/telegram/documents`;
      const res = await fetch(url);
      const data = await res.json();
      const list: StudyDocument[] = Array.isArray(data) ? data : [];
      setDocuments(list);
      // Auto-open the first document only when the user has not already opened
      // one (read through refs so a stale render can't override their choice).
      if (list.length > 0 && !activePdfDocRef.current && !localPdfUrlRef.current) {
        openPdfInReader(list[0], 1);
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

  // Real-time listener for documents added to the vault by room peers or auto-upload
  useEffect(() => {
    if (!socket) return;
    const handleDocumentAdded = (newDoc: StudyDocument) => {
      setDocuments(prev => {
        if (prev.some(d => d.id === newDoc.id || (d.telegramFileId && d.telegramFileId === newDoc.telegramFileId))) {
          return prev;
        }
        // This broadcast can beat the upload response for our own local upload.
        // Swap the pending local entry in place instead of prepending, so the
        // same PDF never shows up twice in the library.
        const pendingIndex = prev.findIndex(
          d => !d.telegramFileId && (d.fileName === newDoc.fileName || d.title === newDoc.title)
        );
        if (pendingIndex !== -1) {
          const next = [...prev];
          next[pendingIndex] = newDoc;
          return next;
        }
        return [newDoc, ...prev];
      });
    };
    socket.on('vault:document-added', handleDocumentAdded);
    return () => {
      socket.off('vault:document-added', handleDocumentAdded);
    };
  }, [socket]);

  // Presenter follower sync — only re-runs when the presentation, the follow
  // flag or the viewer identity changes. The document list is read through a
  // ref so unrelated list changes (e.g. a local upload) never force a jump.
  useEffect(() => {
    if (pdfPresentation?.isActive && pdfPresentation.presenterId !== currentUser.id && isFollowingPresenter) {
      if (activePdfDocRef.current?.id !== pdfPresentation.documentId) {
        const found = documentsRef.current.find(d => d.id === pdfPresentation.documentId);
        if (found) {
          setActivePdfDoc(found);
          setLocalPdfUrl(null);
          setLocalPdfDocId(null);
          setReadAlongPeerId(null);
        }
      }
      setActivePdfPage(pdfPresentation.currentPage || 1);
    }
  }, [pdfPresentation, isFollowingPresenter, currentUser.id, setActivePdfDoc, setActivePdfPage]);

  // Follow presenter page flips in the pdf.js scroller.
  useEffect(() => {
    if (
      pdfPresentation?.isActive &&
      pdfPresentation.presenterId !== currentUser.id &&
      isFollowingPresenter &&
      activePdfPage
    ) {
      requestPageScroll(activePdfPage);
    }
  }, [activePdfPage, pdfPresentation, isFollowingPresenter, currentUser.id, requestPageScroll]);

  // Follow peer's page when Read Along is active
  const readAlongPeer = useMemo(() => {
    if (!readAlongPeerId) return null;
    return peers.find(p => p.userId === readAlongPeerId) || null;
  }, [peers, readAlongPeerId]);

  useEffect(() => {
    if (!readAlongPeer || !readAlongPeer.currentDocument) return;

    // Follow page turns of the peer
    const peerPage = readAlongPeer.currentDocument.currentPage || 1;
    if (peerPage !== displayPage) {
      requestPageScroll(peerPage);
    }
  }, [readAlongPeer?.currentDocument?.currentPage, displayPage, requestPageScroll]);

  // Start a newly opened document on its active page. Don't scroll on every
  // activePdfPage update: manual scrolling also updates that value.
  useEffect(() => {
    const documentId = activePdfDoc?.id ?? null;
    if (lastScrolledDocumentIdRef.current === documentId) return;
    lastScrolledDocumentIdRef.current = documentId;
    clearPdfSelection();
    if (documentId) requestPageScroll(activePdfPage || 1);
  }, [activePdfDoc?.id, activePdfPage, clearPdfSelection, requestPageScroll]);

  useEffect(() => {
    if (previousDisplayPageRef.current === displayPage) return;
    previousDisplayPageRef.current = displayPage;
    clearPdfSelection();
  }, [displayPage, clearPdfSelection]);

  // Broadcast reading status to peer students — guarded so it only emits when
  // the document id, page or room actually changed (no redundant emits/loops).
  useEffect(() => {
    if (!activePdfDoc) return;
    const docId = activePdfDoc.id;
    const page = activePdfPage || 1;
    const last = lastReadingStatusRef.current;
    if (last && last.docId === docId && last.page === page && last.roomId === roomId) {
      return;
    }
    lastReadingStatusRef.current = { docId, page, roomId };
    updateMyPdfReadingStatus(activePdfDoc, page);
  }, [activePdfDoc, activePdfPage, roomId, updateMyPdfReadingStatus]);

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
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Local File Upload / Drag-and-Drop Handler with automatic Telegram Cloud Sync
  const handleLocalPdfUpload = async (file: File) => {
    if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
      addToast('Invalid File', 'Please select a valid .pdf document.', 'alert');
      return;
    }

    if (localPdfUrlRef.current) {
      URL.revokeObjectURL(localPdfUrlRef.current);
    }

    const objectUrl = URL.createObjectURL(file);
    localPdfUrlRef.current = objectUrl;
    setLocalPdfUrl(objectUrl);

    const tempId = `local-pdf-${Date.now()}`;
    const cleanTitle = file.name.replace(/\.pdf$/i, '').replace(/_/g, ' ');
    const targetRoomId = (roomId || 'RRB-7949').toUpperCase();

    const localDoc: StudyDocument = {
      id: tempId,
      title: cleanTitle,
      fileName: file.name,
      subject: 'Quantitative Aptitude',
      fileSize: file.size,
      mimeType: 'application/pdf',
      telegramFileId: '',
      telegramMessageId: 0,
      uploaderId: currentUser.id,
      uploaderName: currentUser.name || currentUser.username || 'You',
      uploadedAt: new Date().toISOString(),
      downloadCount: 1,
      description: 'Auto-syncing to Telegram channel...',
      roomId: targetRoomId
    };

    setLocalPdfDocId(tempId);
    setDocuments(prev => [localDoc, ...prev]);
    openPdfInReader(localDoc, 1);
    setDisplayPage(1);
    setSyncStatus('uploading');

    addToast('PDF Opened', `Opened "${file.name}". Syncing to Telegram channel in background so study partners can Read Along...`, 'info');

    // Asynchronous background upload to Telegram channel
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', cleanTitle);
      formData.append('subject', 'Quantitative Aptitude');
      formData.append('roomId', targetRoomId);
      formData.append('uploaderId', currentUser.id);
      formData.append('uploaderName', currentUser.name || currentUser.username || 'Student');
      formData.append('description', 'Uploaded via PDF Reader for peer Read Along');

      const res = await fetch(`${API_BASE_URL}/api/telegram/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.document) {
        throw new Error(data.error || 'Failed to upload to Telegram');
      }

      const uploadedDoc: StudyDocument = data.document;

      // Replace temporary local document in the list with the permanent cloud document
      setDocuments(prev => prev.map(d => (d.id === tempId ? uploadedDoc : d)));

      // If user is still reading this document, link local blob to cloud doc ID
      if (activePdfDocRef.current?.id === tempId) {
        setLocalPdfDocId(uploadedDoc.id);
        setActivePdfDoc(uploadedDoc);
        // Immediately broadcast new telegramFileId to room so peers can Read Along!
        updateMyPdfReadingStatus(uploadedDoc, displayPageRef.current || 1);
      }

      setSyncStatus('synced');
      addToast('Cloud Synced!', `"${file.name}" uploaded to Telegram channel. Room peers can now Read Along!`, 'success');
    } catch (err: any) {
      console.error('Failed to auto-upload PDF to Telegram:', err);
      setSyncStatus('error');
      addToast('Cloud Sync Failed', `Could not upload to Telegram: ${err.message || 'Network error'}. PDF remains readable locally.`, 'alert');
    }
  };

  // Co-Study Presentation toggle
  const handleTogglePresentation = () => {
    if (!activePdfDoc) return;
    if (pdfPresentation?.presenterId === currentUser.id) {
      stopPdfPresentation();
    } else {
      if (!activePdfDoc.telegramFileId) {
        if (syncStatus === 'uploading') {
          addToast('Uploading...', 'Please wait a moment for the PDF to sync to Telegram cloud before presenting.', 'info');
        } else {
          addToast('Cannot Present', 'Only cloud-synced documents can be presented. Local files stay on your device.', 'alert');
        }
        return;
      }
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
  // 1. For local uploads, uses the fast local blob URL for the uploader without reloading iframe.
  // 2. For remote / peer reading, uses the Telegram inline stream URL with FitH and page number.
  const streamUrl = useMemo(() => {
    if (localPdfUrl && localPdfDocId && activePdfDoc?.id === localPdfDocId) {
      return localPdfUrl;
    }
    if (!activePdfDoc?.telegramFileId) return '';
    return `${API_BASE_URL}/api/telegram/stream/${activePdfDoc.telegramFileId}#toolbar=1&navpanes=0&view=FitH&page=${displayPage}`;
  }, [localPdfUrl, localPdfDocId, activePdfDoc?.id, activePdfDoc?.telegramFileId, displayPage]);

  // Explicit page navigation — broadcasts to the room when this user is presenting
  const goToPage = (page: number) => {
    if (!Number.isFinite(page) || page < 1) return;
    const targetPage = numPages > 0 ? Math.min(page, numPages) : page;
    requestPageScroll(targetPage);
    sendPdfPageChange(targetPage);
    if (readAlongPeerId) {
      setReadAlongPeerId(null);
      addToast('Independent Reading', 'Navigated manually — exited follow mode.', 'info');
    }
  };

  // pdf.js cannot use the viewer fragment (#page=...), so strip it.
  const pdfSourceUrl = useMemo(() => streamUrl.split('#')[0], [streamUrl]);

  // Load the PDF with pdf.js — this is what gives each page a selectable text layer.
  useEffect(() => {
    loadedPdfSourceRef.current = null;
    setPageSizes({});
    if (!pdfSourceUrl) {
      setPdfDoc(null);
      setNumPages(0);
      return;
    }

    let cancelled = false;
    setPdfError(null);
    setPdfDoc(null);
    setNumPages(0);

    const loadingTask = pdfjsLib.getDocument({ url: pdfSourceUrl });

    loadingTask.promise
      .then(doc => {
        if (cancelled) {
          doc.destroy();
          return;
        }
        loadedPdfSourceRef.current = pdfSourceUrl;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error('Failed to load PDF with pdf.js:', err);
        setPdfError('This PDF could not be rendered for reading.');
      });

    return () => {
      cancelled = true;
      try {
        loadingTask.destroy();
      } catch {
        /* already destroyed */
      }
    };
  }, [pdfSourceUrl]);

  // Page 1's size drives the placeholders so scroll position stays stable while
  // only a window of pages is actually rendered.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    pdfDoc
      .getPage(1)
      .then(page => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: pdfScale });
        setPageSizes(prev => ({ ...prev, 1: { width: viewport.width, height: viewport.height } }));
      })
      .catch(() => {
        /* keep the default size */
      });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pdfScale]);

  // Every PDF page scales linearly, so update cached measurements immediately
  // while the currently visible pages rerender at the new zoom level.
  useEffect(() => {
    const previousScale = previousPdfScaleRef.current;
    previousPdfScaleRef.current = pdfScale;
    if (previousScale === pdfScale) return;

    const ratio = pdfScale / previousScale;
    setPageSizes(prev => {
      const next: Record<number, { width: number; height: number }> = {};
      Object.entries(prev).forEach(([pageNumber, size]) => {
        next[Number(pageNumber)] = { width: size.width * ratio, height: size.height * ratio };
      });
      return next;
    });
  }, [pdfScale]);

  // Navigation can happen before loading finishes or arrive from a peer.
  // Clamp it once the page count is known so the reader and room stay in range.
  useEffect(() => {
    if (numPages === 0 || displayPage <= numPages) return;
    requestPageScroll(numPages);
    sendPdfPageChange(numPages);
  }, [numPages, displayPage, requestPageScroll, sendPdfPageChange]);

  // Scroll after the requested PDF has loaded; an old document may still be
  // mounted briefly while a document switch is in flight.
  useEffect(() => {
    if (!pdfDoc || loadedPdfSourceRef.current !== pdfSourceUrl) return;
    const target = pendingScrollPageRef.current;
    if (target === null) return;
    if (numPages > 0 && target > numPages) {
      pendingScrollPageRef.current = null;
      return;
    }
    const el = pageElsRef.current.get(target);
    if (!el) return;
    pendingScrollPageRef.current = null;
    el.scrollIntoView({ block: 'start' });
  });

  // Track which page the reader is looking at as they scroll.
  const handlePagesScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    // Never fight the presenter or Read Along sync while following.
    const followingPresenter =
      pdfPresentation?.isActive && pdfPresentation.presenterId !== currentUser.id && isFollowingPresenter;
    if (followingPresenter || readAlongPeerId) return;

    const mid = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
    let current = 1;
    pageElsRef.current.forEach((el, page) => {
      if (el.getBoundingClientRect().top <= mid) current = Math.max(current, page);
    });

    if (current !== displayPageRef.current) {
      setDisplayPage(current);
      setActivePdfPage(current);
    }
  };

  // Capture a text selection made inside a page's text layer.
  const handleTextSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (eventTarget?.closest('[data-pdf-ai-panel], [data-preserve-pdf-selection]')) return;
    if (!eventTarget?.closest('.pdf-text-layer')) {
      clearPdfSelection();
      return;
    }

    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/g, ' ').trim() || '';

    if (!text || text.length < 3) {
      clearPdfSelection();
      return;
    }

    const node = selection?.anchorNode;
    const anchorEl = node instanceof Element ? node : node?.parentElement || null;
    if (!anchorEl?.closest('.pdf-text-layer')) {
      clearPdfSelection();
      return;
    }

    const rect = selection!.getRangeAt(0).getBoundingClientRect();
    setSelectedText(text.slice(0, 1500));
    setSelectionAnchor({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleExplainSelection = () => {
    if (!selectedText) return;
    setIsAiOpen(true);
    setIsChatOpen(false);
    setAutoRunSelection(Date.now());
  };

  const handleZoom = (delta: number) => {
    setPdfScale(prev => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((prev + delta).toFixed(2)))));
  };

  const getPageText = async (page: number): Promise<string> => {
    if (!pdfDoc) return '';
    try {
      return await extractPageText(pdfDoc, page);
    } catch (err) {
      console.error(`Could not extract text for page ${page}:`, err);
      return '';
    }
  };

  const filteredDocs = documents.filter(d =>
    d.title.toLowerCase().includes(searchDocQuery.toLowerCase()) ||
    d.fileName.toLowerCase().includes(searchDocQuery.toLowerCase()) ||
    d.subject.toLowerCase().includes(searchDocQuery.toLowerCase())
  );

  return (
    <div
      ref={containerRef}
      onMouseUp={handleTextSelection}
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
          e.target.value = '';
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
            {/* Cloud Sync Status Indicator */}
            {syncStatus === 'uploading' && activePdfDoc?.id === localPdfDocId && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 animate-pulse" title="Uploading to Telegram channel so peers can Read Along with you...">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span className="hidden sm:inline">Syncing to Cloud...</span>
              </span>
            )}
            {activePdfDoc?.telegramFileId && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0" title="Saved in Telegram channel. Peers can Read Along!">
                <Cloud className="w-2.5 h-2.5" />
                <span className="hidden md:inline">Cloud Synced</span>
              </span>
            )}
            {syncStatus === 'error' && activePdfDoc?.id === localPdfDocId && !activePdfDoc?.telegramFileId && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0" title="Cloud upload failed. Only visible locally on your device.">
                <CloudOff className="w-2.5 h-2.5" />
                <span className="hidden sm:inline">Local Only</span>
              </span>
            )}
          </div>

          {/* Page Navigation (syncs to the room while presenting) */}
          {streamUrl && (
            <div
              className="hidden sm:flex items-center gap-0.5 ml-2 bg-slate-950 border border-white/10 rounded-xl px-1 py-0.5 shrink-0"
              title={pdfPresentation?.presenterId === currentUser.id ? 'Page — synced to all viewers' : 'Page number'}
            >
              <button
                onClick={() => goToPage(displayPage - 1)}
                disabled={numPages === 0 || displayPage <= 1}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                min={1}
                max={numPages || undefined}
                disabled={numPages === 0}
                value={displayPage}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v)) goToPage(v);
                }}
                className="w-10 bg-transparent text-center text-xs font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                title="Page Number"
              />
              <button
                onClick={() => goToPage(displayPage + 1)}
                disabled={numPages === 0 || displayPage >= numPages}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              {numPages > 0 && (
                <span className="px-1 text-[10px] font-mono text-slate-500">/ {numPages}</span>
              )}
            </div>
          )}

          {/* Zoom Controls */}
          {streamUrl && !pdfError && (
            <div className="hidden sm:flex items-center gap-0.5 bg-slate-950 border border-white/10 rounded-xl px-1 py-0.5 shrink-0">
              <button
                onClick={() => handleZoom(-0.2)}
                disabled={pdfScale <= MIN_SCALE}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="w-9 text-center text-[10px] font-mono text-slate-400">
                {Math.round(pdfScale * 100)}%
              </span>
              <button
                onClick={() => handleZoom(0.2)}
                disabled={pdfScale >= MAX_SCALE}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

        </div>

        {/* Right: Ask AI, Co-Study Broadcast, Chatbox Toggle, Fullscreen */}
        <div className="flex items-center gap-1.5 shrink-0">
          
          {/* Ask AI Doubt Button — opens the in-reader assistant */}
          <button
            data-preserve-pdf-selection
            onClick={() => {
              setIsAiOpen(!isAiOpen);
              if (!isAiOpen) setIsChatOpen(false);
            }}
            disabled={!activePdfDoc}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40 ${
              isAiOpen
                ? 'bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20'
                : 'bg-slate-950 border border-white/10 text-slate-300 hover:text-white hover:border-white/20'
            }`}
            title="Ask the AI about this page, or explain selected text"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{isAiOpen ? 'Hide AI' : 'Ask AI'}</span>
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

      {/* 2b. READ ALONG ACTIVE FOLLOWER BANNER */}
      {readAlongPeer && (
        <div className="bg-sky-950/90 border-b border-sky-500/30 px-3 py-1 flex items-center justify-between text-xs shadow-md shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
            <span className="text-white font-medium text-[11px] truncate">
              Reading along with <strong className="text-sky-300">{readAlongPeer.name}</strong> • Synchronized to Page <strong className="text-sky-300">{displayPage}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setReadAlongPeerId(null);
                addToast('Read Along Ended', 'You are now reading independently.', 'info');
              }}
              className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 transition-all"
            >
              Stop Following
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
                    const fileId = p.currentDocument.fileUrl?.split('/stream/')[1]?.split(/[?#]/)[0] || '';
                    if (!fileId) {
                      addToast('Syncing to Cloud', `"${p.currentDocument.title}" is currently syncing to Telegram. Please wait a few seconds!`, 'alert');
                      return;
                    }
                    if (readAlongPeerId === p.userId) {
                      setReadAlongPeerId(null);
                      addToast('Stopped Following', `No longer reading along with ${p.name}`, 'info');
                      return;
                    }
                    setLocalPdfUrl(null);
                    setLocalPdfDocId(null);
                    setReadAlongPeerId(p.userId);
                    const existingDoc = documents.find(d => d.id === p.currentDocument?.id || (fileId && d.telegramFileId === fileId));
                    const docToOpen: StudyDocument = existingDoc || {
                      id: p.currentDocument.id,
                      title: p.currentDocument.title,
                      fileName: `${p.currentDocument.title}.pdf`,
                      subject: 'Study Notes',
                      fileSize: 0,
                      mimeType: 'application/pdf',
                      telegramFileId: fileId,
                      telegramMessageId: 0,
                      uploaderId: p.userId,
                      uploaderName: p.name,
                      uploadedAt: new Date().toISOString(),
                      downloadCount: 0,
                      roomId: (roomId || 'RRB-7949').toUpperCase()
                    };
                    openPdfInReader(docToOpen, p.currentDocument.currentPage || 1);
                    addToast('Read Along Started!', `Reading "${p.currentDocument.title}" with ${p.name} on Page ${p.currentDocument.currentPage || 1}`, 'success');
                  }
                }}
                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors ${
                  readAlongPeerId === p.userId
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300'
                }`}
                title={`Read along with ${p.name}`}
              >
                {readAlongPeerId === p.userId ? '✓ Following' : 'Read Along'}
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
            pdfError ? (
              /* pdf.js could not parse the file — fall back to the native viewer */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
                <AlertCircle className="w-8 h-8 text-amber-400" />
                <p className="text-xs text-slate-300 max-w-sm leading-relaxed">
                  {pdfError} You can still read it in the browser's own PDF viewer, but text selection and the
                  AI assistant will not be available.
                </p>
                <a
                  href={streamUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in native viewer
                </a>
              </div>
            ) : (
              <div
                ref={scrollRef}
                onScroll={handlePagesScroll}
                className="flex-1 min-h-0 overflow-y-auto relative bg-slate-900/50 px-2 py-2"
              >
                {pdfDoc ? (
                  Array.from({ length: numPages }, (_, i) => i + 1).map(pageNumber => {
                    const inWindow =
                      Math.abs(pageNumber - displayPage) <= PAGE_RENDER_RADIUS ||
                      // Always keep the first page rendered so it can seed page sizing.
                      pageNumber === 1;
                    const pageSize = pageSizes[pageNumber] || pageSizes[1];

                    return (
                      <div
                        key={pageNumber}
                        ref={el => {
                          if (el) pageElsRef.current.set(pageNumber, el);
                          else pageElsRef.current.delete(pageNumber);
                        }}
                        style={pageSize ? { width: pageSize.width, height: pageSize.height } : undefined}
                        className="mx-auto my-3"
                      >
                        {inWindow ? (
                          <PdfPageView
                            pdf={pdfDoc}
                            pageNumber={pageNumber}
                            scale={pdfScale}
                            onRendered={handlePageRendered}
                          />
                        ) : (
                          <div className="w-full h-full bg-white/5 border border-white/10 rounded-sm flex items-center justify-center">
                            <span className="text-[10px] font-mono text-slate-600">page {pageNumber}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                    <p className="text-xs text-slate-400">Preparing selectable PDF…</p>
                  </div>
                )}
              </div>
            )
          ) : loadingDocs ? (
            /* Loading State: brief spinner while the vault list is fetched */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
              <div className="w-10 h-10 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin mb-4" />
              <p className="text-xs text-slate-400">Loading study materials…</p>
            </div>
          ) : (
            /* Empty State: Prompt to Open Local PDF or Vault Library */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
              <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-base font-extrabold text-white mb-2">No Study PDF Loaded</h3>
              <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
                {documents.length === 0
                  ? 'This room has no shared PDFs yet. Upload a PDF from your device or drag & drop one here to start reading together.'
                  : 'Open any textbook or coaching notes from your device, drag & drop a PDF here, or pick one from the vault library.'}
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

          {/* Floating "Explain with AI" button, anchored to the text selection */}
          {selectionAnchor && selectedText && (
            <button
              data-preserve-pdf-selection
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleExplainSelection}
              style={{ left: selectionAnchor.x, top: selectionAnchor.y }}
              className="fixed -translate-x-1/2 -translate-y-[calc(100%+8px)] z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white text-[11px] font-bold shadow-xl shadow-indigo-900/50 border border-white/20 transition-all"
              title="Ask the AI to explain the selected text"
            >
              <Sparkles className="w-3 h-3" />
              <span>Explain with AI</span>
            </button>
          )}

          {/* Floating Summon Chat Button (Visible only when chat is hidden) */}
          {!isChatOpen && !isAiOpen && (
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

        {/* Right: AI Reader Assistant (takes the same column as the chat) */}
        {isAiOpen && (
          <div
            data-pdf-ai-panel
            className="w-80 lg:w-96 shrink-0 h-full border-l border-white/10 bg-slate-950/90 backdrop-blur-md flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
          >
            <PDFAiPanel
              docTitle={activePdfDoc?.title || 'Study PDF'}
              currentPage={displayPage}
              userId={currentUser.id}
              selectedText={selectedText}
              autoRunSelection={autoRunSelection}
              onClearSelection={clearPdfSelection}
              onClose={() => setIsAiOpen(false)}
              getPageText={getPageText}
              addToast={addToast}
            />
          </div>
        )}

        {/* Right: Side-by-Side Live Voice & Doubts Chatbox (Collapsible) */}
        {isChatOpen && !isAiOpen && (
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
                      setLocalPdfDocId(null);
                      setReadAlongPeerId(null);
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
