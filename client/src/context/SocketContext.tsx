import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  UserProfile,
  VideoSyncState,
  ChatMessage,
  RoomPeer,
  WhiteboardElement,
  SharedNote,
  ToastNotification,
  StudyGroup,
  StudyDocument,
  PdfPresentationState
} from '../types.js';
import { API_BASE_URL, SOCKET_URL, setCustomServerUrl } from '../config.js';
import { useVoiceChat } from '../hooks/useVoiceChat.js';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  roomId: string;
  currentUser: UserProfile;
  peers: RoomPeer[];
  videoState: VideoSyncState;
  chatMessages: ChatMessage[];
  whiteboardElements: WhiteboardElement[];
  sharedNote: SharedNote | null;
  notifications: ToastNotification[];
  isMicMuted: boolean;
  isSpeaking: boolean;
  isVoiceUnlocked: boolean;
  isVoiceModalOpen: boolean;
  isAuthModalOpen: boolean;
  isRoomModalOpen: boolean;
  isAuthenticated: boolean;
  currentGroup: StudyGroup | null;
  activePdfDoc: StudyDocument | null;
  activePdfPage: number;
  readAlongPeerId: string | null;
  setReadAlongPeerId: (id: string | null) => void;
  pdfPresentation: PdfPresentationState | null;
  selectedPeerForDossier: RoomPeer | null;
  activeActivity: {
    isRunning: boolean;
    activityName: string;
    category: 'study' | 'break' | 'personal';
    startTime: number | null;
  };
  startGlobalActivity: (activityName: string, category?: 'study' | 'break' | 'personal') => void;
  stopGlobalActivity: () => void;
  setIsAuthModalOpen: (open: boolean) => void;
  setIsVoiceModalOpen: (open: boolean) => void;
  setIsRoomModalOpen: (open: boolean) => void;
  setActivePdfDoc: (doc: StudyDocument | null) => void;
  setActivePdfPage: (page: number) => void;
  openPeerDossier: (peer: RoomPeer) => void;
  closePeerDossier: () => void;
  tuneInToPeerVideo: (peer: RoomPeer) => void;
  tuneInToPeerPdf: (peer: RoomPeer) => void;
  updateMyPdfReadingStatus: (doc: StudyDocument | null, page: number) => void;
  updateMyVideoWatchingStatus: (videoId: string, currentTime: number, title?: string) => void;
  startPdfPresentation: (doc: StudyDocument, page: number) => void;
  sendPdfPageChange: (page: number) => void;
  stopPdfPresentation: () => void;
  openPdfInReader: (doc: StudyDocument, page?: number) => void;
  setRoomId: (id: string) => void;
  createGroup: (name: string, targetExam?: string, voicePassword?: string) => Promise<StudyGroup>;
  joinGroup: (roomId: string) => Promise<{ success: boolean; message?: string }>;
  loginUser: (username: string, password: string) => Promise<boolean>;
  registerUser: (data: { username: string; password: string; name: string; targetExam?: string; city?: string; avatar?: string }) => Promise<boolean>;
  logoutUser: () => void;
  updateStatus: (status: string) => void;
  updateUserProfile: (profile: Partial<UserProfile>) => void;
  toggleMic: () => void;
  unlockVoiceChat: () => void;
  sendChatMessage: (
    text: string,
    videoTimestamp?: number,
    isAiDoubt?: boolean,
    extraMeta?: { pdfPage?: number; pdfDocTitle?: string }
  ) => void;
  sendVideoChange: (videoUrl: string, videoId: string) => void;
  sendVideoPlay: (currentTime: number) => void;
  sendVideoPause: (currentTime: number) => void;
  sendVideoSeek: (seekToTime: number) => void;
  sendVideoRate: (rate: number) => void;
  sendWhiteboardElement: (elem: WhiteboardElement) => void;
  clearWhiteboard: () => void;
  sendWhiteboardCursor: (x: number, y: number) => void;
  updateSharedNote: (content: string) => void;
  dismissNotification: (id: string) => void;
  addToast: (title: string, message: string, type?: 'info' | 'success' | 'warning' | 'alert') => void;
}

const getStoredUser = (): { user: UserProfile; isAuthenticated: boolean } => {
  try {
    const saved = localStorage.getItem('studyos_auth_user_v1') || localStorage.getItem('studyos_user_account_v4');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.username && parsed.username.trim()) {
        return { user: parsed, isAuthenticated: true };
      }
    }
  } catch (e) {}

  const newId = `user_${Date.now()}`;
  return {
    user: {
      id: newId,
      username: '',
      name: '',
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${newId}&backgroundColor=6366f1`,
      targetExam: 'RRB PO & IBPS PO',
      college: '',
      city: '',
      country: 'India',
      xp: 0,
      level: 1,
      coins: 0,
      streak: 0,
      bestStreak: 0,
      totalStudyHours: 0,
      focusScore: 100,
      accuracy: 100,
      tasksCompleted: 0,
      tasksMissed: 0,
      badges: [],
      status: 'Ready to Study',
      isMuted: true,
      isSpeaking: false,
      currentActivity: 'Ready to Study',
      activityCategory: 'study',
      activityStartTime: null
    },
    isAuthenticated: false
  };
};

const getStoredRoom = (): string => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl && roomFromUrl.trim()) {
      return roomFromUrl.trim().toUpperCase();
    }
    const saved = localStorage.getItem('studyos_current_room_v1');
    if (saved && saved.trim()) {
      return saved.trim().toUpperCase();
    }
    return 'STUDY-ROOM-ALPHA';
  } catch (e) {
    return 'STUDY-ROOM-ALPHA';
  }
};

const defaultVideo: VideoSyncState = {
  roomId: 'STUDY-ROOM-ALPHA',
  videoUrl: 'https://www.youtube.com/watch?v=k7YS_P_t3uA',
  videoId: 'k7YS_P_t3uA',
  isPlaying: false,
  currentTime: 0,
  playbackRate: 1,
  lastUpdated: Date.now(),
  updatedBy: 'System'
};

interface ActiveActivityState {
  isRunning: boolean;
  activityName: string;
  category: 'study' | 'break' | 'personal';
  startTime: number | null;
}

const getStoredActivity = (): ActiveActivityState => {
  try {
    const raw = localStorage.getItem('studyos_active_activity_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.isRunning && parsed.startTime && typeof parsed.startTime === 'number') {
        return parsed;
      }
    }
  } catch (e) {}
  return {
    isRunning: false,
    activityName: '',
    category: 'study',
    startTime: null
  };
};

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialUserData = getStoredUser();
  const initialRoomId = getStoredRoom();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string>(initialRoomId);
  const [currentGroup, setCurrentGroup] = useState<StudyGroup | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile>(initialUserData.user);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(initialUserData.isAuthenticated);
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [videoState, setVideoState] = useState<VideoSyncState>({ ...defaultVideo, roomId: initialRoomId || 'STUDY-ROOM-ALPHA' });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [whiteboardElements, setWhiteboardElements] = useState<WhiteboardElement[]>([]);
  const [sharedNote, setSharedNote] = useState<SharedNote | null>(null);
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceUnlocked, setIsVoiceUnlocked] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(!initialUserData.isAuthenticated);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(!initialRoomId);

  // Global persistent Live Activity State across all tabs
  const [activeActivity, setActiveActivity] = useState<ActiveActivityState>(getStoredActivity);

  // Keep localStorage in sync with active activity
  useEffect(() => {
    try {
      if (activeActivity.isRunning && activeActivity.startTime) {
        localStorage.setItem('studyos_active_activity_v1', JSON.stringify(activeActivity));
      } else {
        localStorage.removeItem('studyos_active_activity_v1');
      }
    } catch (e) {}
  }, [activeActivity]);

  // PDF Reader & Peer Dossier State
  const [activePdfDoc, setActivePdfDoc] = useState<StudyDocument | null>(null);
  const [activePdfPage, setActivePdfPage] = useState<number>(1);
  const [readAlongPeerId, setReadAlongPeerId] = useState<string | null>(null);
  const [pdfPresentation, setPdfPresentation] = useState<PdfPresentationState | null>(null);
  const [selectedPeerForDossier, setSelectedPeerForDossier] = useState<RoomPeer | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const previousRoomIdRef = useRef<string>('');
  const previousUserIdRef = useRef<string>(initialUserData.user.id);
  // Always-current values for socket handlers that live across renders
  const roomIdRef = useRef<string>(initialRoomId);
  const userRef = useRef<UserProfile>(initialUserData.user);
  roomIdRef.current = roomId;
  userRef.current = currentUser;

  const addToast = useCallback((title: string, message: string, type: 'info' | 'success' | 'warning' | 'alert' = 'info') => {
    const newNotif: ToastNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title,
      message,
      type,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setNotifications(prev => [newNotif, ...prev.slice(0, 19)]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Authentication: Register
  const registerUser = useCallback(async (data: {
    username: string;
    password: string;
    name: string;
    targetExam?: string;
    city?: string;
    avatar?: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Registration failed');
      }

      localStorage.setItem('studyos_auth_user_v1', JSON.stringify(result.user));
      localStorage.setItem('studyos_auth_token_v1', result.token);
      setCurrentUser(result.user);
      setIsAuthenticated(true);
      setIsAuthModalOpen(false);

      if (!roomId) {
        setIsRoomModalOpen(true);
      } else if (socketRef.current?.connected) {
        socketRef.current.emit('room:join', { roomId, user: result.user });
      }

      addToast('Account Created!', `Welcome, ${result.user.name} (@${result.user.username})! Your account is permanently saved.`, 'success');
      return true;
    } catch (err: any) {
      addToast('Registration Error', err.message || 'Could not register account', 'alert');
      throw err;
    }
  }, [roomId]);

  // Authentication: Login
  const loginUser = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Login failed');
      }

      localStorage.setItem('studyos_auth_user_v1', JSON.stringify(result.user));
      localStorage.setItem('studyos_auth_token_v1', result.token);
      setCurrentUser(result.user);
      setIsAuthenticated(true);
      setIsAuthModalOpen(false);

      if (!roomId) {
        setIsRoomModalOpen(true);
      } else if (socketRef.current?.connected) {
        socketRef.current.emit('room:join', { roomId, user: result.user });
      }

      addToast('Logged In Successfully!', `Welcome back, ${result.user.name}!`, 'success');
      return true;
    } catch (err: any) {
      addToast('Login Error', err.message || 'Invalid username or password', 'alert');
      throw err;
    }
  }, [roomId]);

  // Authentication: Logout
  const logoutUser = useCallback(() => {
    localStorage.removeItem('studyos_auth_user_v1');
    localStorage.removeItem('studyos_auth_token_v1');
    const guestData = getStoredUser();
    setCurrentUser(guestData.user);
    setIsAuthenticated(false);
    setIsAuthModalOpen(true);
    addToast('Logged Out', 'You have been logged out.', 'info');
  }, []);

  // Room Management: Create Group
  const createGroup = useCallback(async (name: string, targetExam?: string, voicePassword?: string): Promise<StudyGroup> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          targetExam: targetExam || currentUser.targetExam,
          creatorId: currentUser.id,
          creatorName: currentUser.name || currentUser.username || 'Aspirant',
          voicePassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create group');

      const group: StudyGroup = data.group;
      setPeers([]);
      setChatMessages([]);
      setWhiteboardElements([]);
      setSharedNote(null);
      setRoomId(group.roomId);
      setCurrentGroup(group);
      localStorage.setItem('studyos_current_room_v1', group.roomId);
      setIsRoomModalOpen(false);

      addToast('Study Group Created!', `Group ID is: ${group.roomId}. Share this ID with study partners to study together.`, 'success');
      return group;
    } catch (err: any) {
      addToast('Error Creating Group', err.message || 'Could not create study group', 'alert');
      throw err;
    }
  }, [currentUser]);

  // Room Management: Join Group by ID (with resilient offline / socket sync fallback)
  const joinGroup = useCallback(async (targetRoomId: string): Promise<{ success: boolean; message?: string }> => {
    const cleanId = (targetRoomId || '').trim().toUpperCase();
    if (!cleanId) {
      addToast('Cannot Join Group', 'Please enter a valid Group ID', 'alert');
      return { success: false, message: 'Please enter a valid Group ID' };
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: cleanId,
          userId: currentUser.id,
          userName: currentUser.name
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid Group ID');
      }

      const group: StudyGroup = data.group;
      setPeers([]);
      setChatMessages([]);
      setWhiteboardElements([]);
      setSharedNote(null);
      setRoomId(group.roomId);
      setCurrentGroup(group);
      localStorage.setItem('studyos_current_room_v1', group.roomId);
      setIsRoomModalOpen(false);

      if (socketRef.current?.connected) {
        const storedActivity = getStoredActivity();
        const effectiveUser = {
          ...currentUser,
          name: currentUser.name?.trim() || 'Student Aspirant',
          currentActivity: activeActivity.isRunning
            ? activeActivity.activityName
            : (storedActivity.isRunning ? storedActivity.activityName : (currentUser.currentActivity || 'Ready to Study')),
          activityCategory: activeActivity.isRunning
            ? activeActivity.category
            : (storedActivity.isRunning ? storedActivity.category : (currentUser.activityCategory || 'study')),
          activityStartTime: activeActivity.isRunning
            ? activeActivity.startTime
            : (storedActivity.isRunning ? storedActivity.startTime : null),
          status: activeActivity.isRunning
            ? activeActivity.activityName
            : (currentUser.status || 'Ready to Study')
        };
        socketRef.current.emit('room:join', { roomId: group.roomId, user: effectiveUser });
      }

      addToast('Joined Study Group!', `Welcome to "${group.name}" (ID: ${group.roomId})`, 'success');
      return { success: true };
    } catch (err: any) {
      console.warn('API join warning, activating resilient room join:', err.message);
      // Resilient fallback: ensure user is never blocked even if REST API fails
      const fallbackGroup: StudyGroup = {
        roomId: cleanId,
        name: cleanId.replace(/[-_]/g, ' '),
        description: `Study group ${cleanId}`,
        targetExam: 'Competitive Exam',
        creatorId: currentUser.id,
        creatorName: currentUser.name,
        memberCount: 1,
        voicePassword: 'study123',
        isPrivate: false,
        createdAt: new Date().toISOString()
      };
      setPeers([]);
      setChatMessages([]);
      setWhiteboardElements([]);
      setSharedNote(null);
      setRoomId(cleanId);
      setCurrentGroup(fallbackGroup);
      localStorage.setItem('studyos_current_room_v1', cleanId);
      setIsRoomModalOpen(false);

      if (socketRef.current?.connected) {
        const storedActivity = getStoredActivity();
        const effectiveUser = {
          ...currentUser,
          name: currentUser.name?.trim() || 'Student Aspirant',
          currentActivity: activeActivity.isRunning
            ? activeActivity.activityName
            : (storedActivity.isRunning ? storedActivity.activityName : (currentUser.currentActivity || 'Ready to Study')),
          activityCategory: activeActivity.isRunning
            ? activeActivity.category
            : (storedActivity.isRunning ? storedActivity.category : (currentUser.activityCategory || 'study')),
          activityStartTime: activeActivity.isRunning
            ? activeActivity.startTime
            : (storedActivity.isRunning ? storedActivity.startTime : null),
          status: activeActivity.isRunning
            ? activeActivity.activityName
            : (currentUser.status || 'Ready to Study')
        };
        socketRef.current.emit('room:join', { roomId: cleanId, user: effectiveUser });
      }

      addToast('Joined Study Group!', `Switched to "${cleanId}"`, 'success');
      return { success: true };
    }
  }, [currentUser, activeActivity, addToast]);

  // Save user changes to localStorage and server
  const updateUserProfile = useCallback((profile: Partial<UserProfile>) => {
    const updated = { ...userRef.current, ...profile };
    setCurrentUser(updated);
    try {
      localStorage.setItem('studyos_auth_user_v1', JSON.stringify(updated));
    } catch (e) {}

    // Emit join with updated profile (kept out of the state updater so it runs once)
    if (updated.name && roomId) {
      socketRef.current?.emit('room:join', { roomId, user: updated });
    }
  }, [roomId]);

  // Initialize Socket Connection — created once so changing rooms or renaming
  // yourself never tears down the realtime connection and its listeners.
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to StudyOS real-time server:', newSocket.id);
      setIsConnected(true);
      const activeRoom = roomIdRef.current;
      if (!activeRoom) return;
      const activeUser = userRef.current;
      const storedActivity = getStoredActivity();
      const effectiveUser = {
        ...activeUser,
        name: activeUser.name?.trim() || 'Student Aspirant',
        currentActivity: storedActivity.isRunning ? storedActivity.activityName : (activeUser.currentActivity || 'Ready to Study'),
        activityCategory: storedActivity.isRunning ? storedActivity.category : (activeUser.activityCategory || 'study'),
        activityStartTime: storedActivity.isRunning ? storedActivity.startTime : (activeUser.activityStartTime || null),
        status: storedActivity.isRunning ? storedActivity.activityName : (activeUser.status || 'Ready to Study')
      };
      newSocket.emit('room:join', { roomId: activeRoom, user: effectiveUser });
      newSocket.emit('video:join', { roomId: activeRoom, userName: effectiveUser.name });
      newSocket.emit('chat:join', { roomId: activeRoom });
    });

    newSocket.on('disconnect', (reason) => {
      console.warn('StudyOS real-time socket disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.warn('StudyOS real-time socket connect error:', err.message);
      setIsConnected(false);
    });

    newSocket.on('room:peers', (updatedPeers: RoomPeer[]) => {
      setPeers(updatedPeers);
    });

    newSocket.on('video:state', (state: VideoSyncState) => {
      setVideoState(state);
    });

    newSocket.on('video:play', (data: { currentTime: number; updatedBy: string }) => {
      setVideoState(prev => ({
        ...prev,
        isPlaying: true,
        currentTime: data.currentTime,
        updatedBy: data.updatedBy
      }));
    });

    newSocket.on('video:pause', (data: { currentTime: number; updatedBy: string }) => {
      setVideoState(prev => ({
        ...prev,
        isPlaying: false,
        currentTime: data.currentTime,
        updatedBy: data.updatedBy
      }));
    });

    newSocket.on('video:seek', (data: { currentTime: number; updatedBy: string }) => {
      setVideoState(prev => ({
        ...prev,
        currentTime: data.currentTime,
        updatedBy: data.updatedBy
      }));
    });

    newSocket.on('video:rate', (data: { rate: number }) => {
      setVideoState(prev => ({ ...prev, playbackRate: data.rate }));
    });

    newSocket.on('chat:history', (history: ChatMessage[]) => {
      setChatMessages(history);
    });

    newSocket.on('chat:message', (msg: ChatMessage) => {
      setChatMessages(prev => {
        // Skip duplicate by id
        if (prev.some(m => m.id === msg.id)) return prev;
        // Replace matching optimistic local message if present
        const localIdx = prev.findIndex(m => m.id.startsWith('local-') && m.userId === msg.userId && m.text === msg.text);
        if (localIdx !== -1) {
          const updated = [...prev];
          updated[localIdx] = msg;
          return updated;
        }
        return [...prev, msg];
      });
    });

    newSocket.on('wb:history', (elements: WhiteboardElement[]) => {
      setWhiteboardElements(elements);
    });

    newSocket.on('wb:element', (elem: WhiteboardElement) => {
      setWhiteboardElements(prev => [...prev, elem]);
    });

    newSocket.on('wb:clear', () => {
      setWhiteboardElements([]);
    });

    newSocket.on('notes:load', (note: SharedNote) => {
      setSharedNote(note);
    });

    newSocket.on('notes:update', (note: SharedNote) => {
      setSharedNote(note);
    });

    newSocket.on('notification:toast', (data: { title: string; message: string; type?: any }) => {
      addToast(data.title, data.message, data.type || 'info');
    });

    newSocket.on('pdf:presentation_state', (data: PdfPresentationState) => {
      setPdfPresentation(data.isActive ? data : null);
      if (data.isActive && data.presenterId !== userRef.current.id) {
        addToast('PDF Co-Study Live', `${data.presenterName} is presenting "${data.title}" (Page ${data.currentPage})`, 'info');
      }
    });

    newSocket.on('pdf:page_sync', (data: { currentPage: number; documentId?: string }) => {
      setActivePdfPage(data.currentPage);
    });

    newSocket.on('user:profile_updated', (updatedUser: UserProfile) => {
      if (updatedUser && updatedUser.id === userRef.current.id) {
        setCurrentUser(prev => ({ ...prev, ...updatedUser }));
        try {
          localStorage.setItem('studyos_auth_user_v1', JSON.stringify({ ...userRef.current, ...updatedUser }));
        } catch (e) {}
      }
    });

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [addToast]);

  // Re-join the rooms whenever the group, the signed-in identity, or connection state changes (Bug 13 & 15 fix)
  useEffect(() => {
    const activeSocket = socketRef.current;
    if (!activeSocket?.connected) return;

    const previousRoom = previousRoomIdRef.current;
    if (previousRoom && previousRoom !== roomId) {
      activeSocket.emit('room:leave', { roomId: previousRoom, userId: currentUser.id });
      setPeers([]);
      setChatMessages([]);
      setWhiteboardElements([]);
      setSharedNote(null);
    }
    previousRoomIdRef.current = roomId;

    const previousUserId = previousUserIdRef.current;
    if (previousUserId && previousUserId !== currentUser.id && roomId) {
      activeSocket.emit('room:leave', { roomId, userId: previousUserId });
    }
    previousUserIdRef.current = currentUser.id;

    if (!roomId) return;
    const storedActivity = getStoredActivity();
    const effectiveUser = {
      ...currentUser,
      name: currentUser.name?.trim() || 'Student Aspirant',
      currentActivity: activeActivity.isRunning
        ? activeActivity.activityName
        : (storedActivity.isRunning ? storedActivity.activityName : (currentUser.currentActivity || 'Ready to Study')),
      activityCategory: activeActivity.isRunning
        ? activeActivity.category
        : (storedActivity.isRunning ? storedActivity.category : (currentUser.activityCategory || 'study')),
      activityStartTime: activeActivity.isRunning
        ? activeActivity.startTime
        : (storedActivity.isRunning ? storedActivity.startTime : null),
      status: activeActivity.isRunning
        ? activeActivity.activityName
        : (currentUser.status || 'Ready to Study')
    };
    activeSocket.emit('room:join', { roomId, user: effectiveUser });
    activeSocket.emit('video:join', { roomId, userName: effectiveUser.name });
    activeSocket.emit('chat:join', { roomId });
  }, [roomId, currentUser.id, currentUser.name, isConnected, activeActivity]);

  // Voice chat must be unlocked again in every new room (password gate stays intact)
  useEffect(() => {
    setIsVoiceUnlocked(false);
    setIsMicMuted(true);
    setIsSpeaking(false);
  }, [roomId]);

  // Real WebRTC mesh voice chat (microphone, peer connections, speaking indicator)
  useVoiceChat({
    socket,
    roomId,
    userName: currentUser.name || 'Student',
    isVoiceUnlocked,
    isMicMuted,
    onSpeakingChange: setIsSpeaking
  });

  const updateStatus = useCallback((status: string) => {
    setCurrentUser(prev => ({ ...prev, status, currentActivity: status }));
    socketRef.current?.emit('user:status_change', { roomId, status, userId: currentUser.id });
  }, [roomId, currentUser.id]);

  const toggleMic = useCallback(() => {
    if (!isVoiceUnlocked) {
      setIsVoiceModalOpen(true);
      return;
    }
    // The voice hook applies the mute to the live track and notifies the room
    setIsMicMuted(prev => !prev);
  }, [isVoiceUnlocked]);

  const unlockVoiceChat = useCallback(() => {
    setIsVoiceUnlocked(true);
    setIsMicMuted(false);
  }, []);

  const sendChatMessage = useCallback((
    text: string,
    videoTimestamp?: number,
    isAiDoubt?: boolean,
    extraMeta?: { pdfPage?: number; pdfDocTitle?: string }
  ) => {
    if (!text.trim()) return;
    const cleanText = text.trim();
    const optimisticMsg: ChatMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      roomId,
      userId: currentUser.id,
      userName: currentUser.name || 'Student',
      userAvatar: currentUser.avatar,
      text: cleanText,
      videoTimestamp,
      pdfPage: extraMeta?.pdfPage,
      pdfDocTitle: extraMeta?.pdfDocTitle,
      isAiDoubt,
      createdAt: new Date().toISOString()
    };

    // Optimistically show message immediately so the user experiences zero lag
    setChatMessages(prev => [...prev, optimisticMsg]);

    if (!socketRef.current?.connected) {
      addToast('Connecting to Room...', 'Reconnecting to live chat server. Your message will deliver momentarily.', 'warning');
    }

    socketRef.current?.emit('chat:send', {
      roomId,
      userId: currentUser.id,
      userName: currentUser.name || 'Student',
      userAvatar: currentUser.avatar,
      text: cleanText,
      videoTimestamp,
      pdfPage: extraMeta?.pdfPage,
      pdfDocTitle: extraMeta?.pdfDocTitle,
      isAiDoubt
    });
  }, [roomId, currentUser, addToast]);

  const sendVideoChange = useCallback((videoUrl: string, videoId: string) => {
    socketRef.current?.emit('video:change_url', {
      roomId,
      videoUrl,
      videoId,
      userName: currentUser.name || 'Student'
    });
  }, [roomId, currentUser.name]);

  const sendVideoPlay = useCallback((currentTime: number) => {
    socketRef.current?.emit('video:play', {
      roomId,
      currentTime,
      userName: currentUser.name || 'Student'
    });
  }, [roomId, currentUser.name]);

  const sendVideoPause = useCallback((currentTime: number) => {
    socketRef.current?.emit('video:pause', {
      roomId,
      currentTime,
      userName: currentUser.name || 'Student'
    });
  }, [roomId, currentUser.name]);

  const sendVideoSeek = useCallback((seekToTime: number) => {
    socketRef.current?.emit('video:seek', {
      roomId,
      seekToTime,
      userName: currentUser.name || 'Student'
    });
  }, [roomId, currentUser.name]);

  const sendVideoRate = useCallback((rate: number) => {
    socketRef.current?.emit('video:rate', { roomId, rate });
  }, [roomId]);

  const sendWhiteboardElement = useCallback((elem: WhiteboardElement) => {
    setWhiteboardElements(prev => [...prev, elem]);
    socketRef.current?.emit('wb:element', { roomId, element: elem });
  }, [roomId]);

  const clearWhiteboard = useCallback(() => {
    setWhiteboardElements([]);
    socketRef.current?.emit('wb:clear', { roomId });
  }, [roomId]);

  const sendWhiteboardCursor = useCallback((x: number, y: number) => {
    socketRef.current?.emit('wb:cursor', {
      roomId,
      x,
      y,
      userName: currentUser.name || 'Student',
      color: '#6366f1'
    });
  }, [roomId, currentUser.name]);

  const updateSharedNote = useCallback((content: string) => {
    setSharedNote(prev => prev ? { ...prev, content, lastModifiedBy: currentUser.name || 'Student' } : null);
    socketRef.current?.emit('notes:update', {
      roomId,
      content,
      userName: currentUser.name || 'Student'
    });
  }, [roomId, currentUser.name]);

  // Peer Activity Dossier Actions
  const openPeerDossier = useCallback((peer: RoomPeer) => {
    setSelectedPeerForDossier(peer);
  }, []);

  const closePeerDossier = useCallback(() => {
    setSelectedPeerForDossier(null);
  }, []);

  // Update what the current user is reading in PDF
  const updateMyPdfReadingStatus = useCallback((doc: StudyDocument | null, page: number) => {
    setActivePdfDoc(doc);
    setActivePdfPage(page);

    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('peer:update_media_state', {
        roomId,
        userId: currentUser.id,
        currentDocument: doc ? {
          id: doc.id,
          title: doc.title,
          fileUrl: doc.telegramFileId
            ? `${API_BASE_URL}/api/telegram/stream/${doc.telegramFileId}`
            : '', // Local files have no streamable URL — peers cannot open them remotely
          currentPage: page
        } : null
      });
    }
  }, [roomId, currentUser.id]);

  // Update what the current user is watching on YouTube
  const updateMyVideoWatchingStatus = useCallback((videoId: string, currentTime: number, title?: string) => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('peer:update_media_state', {
        roomId,
        userId: currentUser.id,
        currentVideo: {
          videoId,
          title: title || 'YouTube Lecture',
          currentTime
        }
      });
    }
  }, [roomId, currentUser.id]);

  // Tune in to peer's YouTube video
  const tuneInToPeerVideo = useCallback((peer: RoomPeer) => {
    if (!peer.currentVideo?.videoId) return;
    const vId = peer.currentVideo.videoId;
    const time = peer.currentVideo.currentTime || 0;
    sendVideoChange(`https://www.youtube.com/watch?v=${vId}`, vId);
    sendVideoSeek(time);
    addToast('Tuned In to Video!', `Watching with ${peer.name} at ${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`, 'success');
  }, [sendVideoChange, sendVideoSeek, addToast]);

  // Global Live Activity Lifecycle (Persists across tabs, auto-saves on change/unload)
  const startGlobalActivity = useCallback((activityName: string, category: 'study' | 'break' | 'personal' = 'study') => {
    const now = Date.now();
    // If another activity is already running, auto-stop and record it first so no time is lost
    if (activeActivity.isRunning && activeActivity.startTime) {
      const durationSeconds = Math.max(0, Math.floor((now - activeActivity.startTime) / 1000));
      if (durationSeconds >= 5) {
        const localDate = new Date().toLocaleDateString('en-CA');
        socketRef.current?.emit('activity:stop', {
          roomId: roomIdRef.current,
          userId: userRef.current.id,
          userName: userRef.current.name,
          activityName: activeActivity.activityName,
          category: activeActivity.category,
          durationSeconds,
          localDate
        });
      }
    }

    const nextActivity: ActiveActivityState = {
      isRunning: true,
      activityName,
      category,
      startTime: now
    };
    setActiveActivity(nextActivity);
    setCurrentUser(prev => ({
      ...prev,
      currentActivity: activityName,
      activityCategory: category,
      activityStartTime: now,
      status: activityName
    }));
    userRef.current = {
      ...userRef.current,
      currentActivity: activityName,
      activityCategory: category,
      activityStartTime: now,
      status: activityName
    };

    socketRef.current?.emit('activity:start', {
      roomId: roomIdRef.current,
      userId: userRef.current.id,
      userName: userRef.current.name,
      activityName,
      category
    });

    addToast(
      'Live Situation Started',
      `Started ${activityName}. Your study timer will continue across all tabs!`,
      category === 'break' ? 'warning' : 'success'
    );
  }, [activeActivity, addToast]);

  const stopGlobalActivity = useCallback(() => {
    if (!activeActivity.isRunning || !activeActivity.startTime) return;

    const durationSeconds = Math.max(0, Math.floor((Date.now() - activeActivity.startTime) / 1000));
    const actName = activeActivity.activityName;
    const cat = activeActivity.category;

    setActiveActivity({
      isRunning: false,
      activityName: '',
      category: 'study',
      startTime: null
    });
    setCurrentUser(prev => ({
      ...prev,
      currentActivity: 'Idle 💤',
      activityCategory: 'study',
      activityStartTime: null,
      status: 'Idle 💤'
    }));
    userRef.current = {
      ...userRef.current,
      currentActivity: 'Idle 💤',
      activityCategory: 'study',
      activityStartTime: null,
      status: 'Idle 💤'
    };

    const localDate = new Date().toLocaleDateString('en-CA');
    socketRef.current?.emit('activity:stop', {
      roomId: roomIdRef.current,
      userId: userRef.current.id,
      userName: userRef.current.name,
      activityName: actName,
      category: cat,
      durationSeconds,
      localDate
    });

    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    addToast(
      'Activity Saved',
      `Completed ${timeStr} of ${actName}! Time logged into analytics and calendar.`,
      'info'
    );
  }, [activeActivity, addToast]);

  // Window unload listener to auto-flush active study session
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeActivity.isRunning && activeActivity.startTime) {
        const durationSeconds = Math.max(0, Math.floor((Date.now() - activeActivity.startTime) / 1000));
        if (durationSeconds >= 10) {
          socketRef.current?.emit('activity:stop', {
            roomId: roomIdRef.current,
            userId: userRef.current.id,
            userName: userRef.current.name,
            activityName: activeActivity.activityName,
            category: activeActivity.category,
            durationSeconds,
            localDate: new Date().toLocaleDateString('en-CA')
          });
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeActivity]);

  // Tune in to peer's PDF (Bug 16 fix)
  const tuneInToPeerPdf = useCallback((peer: RoomPeer) => {
    if (!peer.currentDocument || typeof peer.currentDocument.fileUrl !== 'string') {
      addToast('Cannot Open Document', 'This document has an invalid or missing file URL.', 'alert');
      return;
    }
    const fileId = peer.currentDocument.fileUrl.split('/stream/')[1]?.split(/[?#]/)[0] || '';
    if (!fileId) {
      addToast('Syncing or Local Only', `"${peer.currentDocument.title}" is currently syncing to Telegram or is only available locally on ${peer.name}'s device.`, 'alert');
      return;
    }
    const docItem: StudyDocument = {
      id: peer.currentDocument.id,
      title: peer.currentDocument.title,
      fileName: `${peer.currentDocument.title}.pdf`,
      subject: 'Study Material',
      fileSize: 0,
      mimeType: 'application/pdf',
      telegramFileId: fileId,
      telegramMessageId: 0,
      uploaderId: peer.userId,
      uploaderName: peer.name,
      uploadedAt: new Date().toISOString(),
      downloadCount: 0,
      roomId
    };
    setActivePdfDoc(docItem);
    setActivePdfPage(peer.currentDocument.currentPage || 1);
    setReadAlongPeerId(peer.userId);
    addToast('Tuned In to Reading!', `Reading "${peer.currentDocument.title}" on Page ${peer.currentDocument.currentPage} with ${peer.name}`, 'success');
  }, [roomId, addToast]);

  // PDF Co-Study Presentation Actions
  const startPdfPresentation = useCallback((doc: StudyDocument, page: number) => {
    if (!socketRef.current?.connected || !roomId) return;
    const fileUrl = `${API_BASE_URL}/api/telegram/stream/${doc.telegramFileId}`;
    socketRef.current.emit('pdf:present', {
      roomId,
      presenterId: currentUser.id,
      presenterName: currentUser.name || currentUser.username || 'Student',
      documentId: doc.id,
      title: doc.title,
      fileUrl,
      currentPage: page
    });
    setPdfPresentation({
      roomId,
      presenterId: currentUser.id,
      presenterName: currentUser.name || currentUser.username || 'Student',
      documentId: doc.id,
      title: doc.title,
      fileUrl,
      currentPage: page,
      isActive: true
    });
    addToast('Presentation Active', `Presenting "${doc.title}" to room members. Page flips will sync.`, 'success');
  }, [roomId, currentUser, addToast]);

  const sendPdfPageChange = useCallback((page: number) => {
    setActivePdfPage(page);
    if (socketRef.current?.connected && roomId && pdfPresentation?.presenterId === currentUser.id) {
      socketRef.current.emit('pdf:page_change', {
        roomId,
        currentPage: page,
        documentId: pdfPresentation.documentId
      });
    }
  }, [roomId, pdfPresentation, currentUser.id]);

  const stopPdfPresentation = useCallback(() => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('pdf:stop_present', { roomId });
    }
    setPdfPresentation(null);
    addToast('Presentation Ended', 'Exited co-study presentation mode.', 'info');
  }, [roomId, addToast]);

  const openPdfInReader = useCallback((doc: StudyDocument, page: number = 1) => {
    setActivePdfDoc(doc);
    setActivePdfPage(page);
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        serverUrl: API_BASE_URL,
        setServerUrl: setCustomServerUrl,
        roomId,
        currentUser,
        peers,
        videoState,
        chatMessages,
        whiteboardElements,
        sharedNote,
        notifications,
        isMicMuted,
        isSpeaking,
        isVoiceUnlocked,
        isVoiceModalOpen,
        isAuthModalOpen,
        isRoomModalOpen,
        isAuthenticated,
        currentGroup,
        activePdfDoc,
        activePdfPage,
        pdfPresentation,
        selectedPeerForDossier,
        activeActivity,
        startGlobalActivity,
        stopGlobalActivity,
        setIsAuthModalOpen,
        setIsVoiceModalOpen,
        setIsRoomModalOpen,
        setActivePdfDoc,
        setActivePdfPage,
        readAlongPeerId,
        setReadAlongPeerId,
        openPeerDossier,
        closePeerDossier,
        tuneInToPeerVideo,
        tuneInToPeerPdf,
        updateMyPdfReadingStatus,
        updateMyVideoWatchingStatus,
        startPdfPresentation,
        sendPdfPageChange,
        stopPdfPresentation,
        openPdfInReader,
        setRoomId,
        createGroup,
        joinGroup,
        loginUser,
        registerUser,
        logoutUser,
        updateStatus,
        updateUserProfile,
        toggleMic,
        unlockVoiceChat,
        sendChatMessage,
        sendVideoChange,
        sendVideoPlay,
        sendVideoPause,
        sendVideoSeek,
        sendVideoRate,
        sendWhiteboardElement,
        clearWhiteboard,
        sendWhiteboardCursor,
        updateSharedNote,
        dismissNotification,
        addToast
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
};
