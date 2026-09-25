import { Server, Socket } from 'socket.io';
import { storage } from '../services/storageService.js';
import { WhiteboardElement } from '../types.js';

interface RoomPeer {
  socketId: string;
  userId: string;
  name: string;
  avatar: string;
  targetExam: string;
  college: string;
  status: string;
  isMuted: boolean;
  isSpeaking: boolean;
  currentActivity?: string;
  activityCategory?: 'study' | 'break' | 'personal';
  activityStartTime?: number | null;
  joinedAt: number;
  currentDocument?: { id: string; title: string; fileUrl: string; currentPage: number };
  currentVideo?: { videoId: string; title?: string; currentTime: number };
  todayStudySeconds?: number;
  todayHours?: number;
  subjectBreakdown?: Record<string, number>;
}

export interface PdfPresentation {
  roomId: string;
  presenterId: string;
  presenterName: string;
  documentId: string;
  title: string;
  fileUrl: string;
  currentPage: number;
  isActive: boolean;
}

const activeRoomPeers: Map<string, RoomPeer[]> = new Map();
const activePdfPresentations: Map<string, PdfPresentation> = new Map();
const ROOM_VOICE_PASSWORDS: Map<string, string> = new Map([
  ['STUDY-ROOM-ALPHA', 'study123']
]);

const DEFAULT_ROOM = 'STUDY-ROOM-ALPHA';

function cleanRoomId(roomId?: string): string {
  return (roomId || DEFAULT_ROOM).trim().toUpperCase();
}

// Single source of truth for a room's voice passkey: the stored study group first,
// then the built-in rooms. Never fall back to a shared default password.
export async function getExpectedVoicePassword(roomId: string): Promise<string | undefined> {
  const cleanRoomId = (roomId || '').trim().toUpperCase();
  const group = await storage.getStudyGroup(cleanRoomId);
  return group?.voicePassword || ROOM_VOICE_PASSWORDS.get(cleanRoomId);
}

// Voice state lives on the room roster so the presence bar shows live mic status.
export function updateRoomPeerVoiceState(
  io: Server,
  roomId: string,
  socketId: string,
  patch: { isMuted?: boolean; isSpeaking?: boolean }
): void {
  const peers = activeRoomPeers.get(roomId);
  if (!peers) return;
  const peer = peers.find(p => p.socketId === socketId);
  if (!peer) return;
  if (patch.isMuted !== undefined) peer.isMuted = patch.isMuted;
  if (patch.isSpeaking !== undefined) peer.isSpeaking = patch.isSpeaking;
  io.to(roomId).emit('room:peers', peers);
}

export function setupStudyRoomSocket(io: Server, socket: Socket) {
  // Join Room
  socket.on('room:join', (data: {
    roomId: string;
    user: {
      id: string;
      name: string;
      avatar: string;
      targetExam?: string;
      college?: string;
      status?: string;
      currentActivity?: string;
      activityCategory?: 'study' | 'break' | 'personal';
      activityStartTime?: number | null;
    }
  }) => {
    const cleanRoomId = (data.roomId || 'study-room-alpha').trim().toUpperCase();
    const oldRoomId = (socket as any).currentStudyRoom;

    // Cleanly leave previous room to prevent cross-room leaks
    if (oldRoomId && oldRoomId !== cleanRoomId) {
      socket.leave(oldRoomId);
      socket.leave(`video_${oldRoomId}`);
      socket.leave(`chat_${oldRoomId}`);
      socket.leave(`voice_${oldRoomId}`);

      const oldPeers = activeRoomPeers.get(oldRoomId) || [];
      const updatedOldPeers = oldPeers.filter(p => p.socketId !== socket.id && p.userId !== data.user.id);
      activeRoomPeers.set(oldRoomId, updatedOldPeers);
      io.to(oldRoomId).emit('room:peers', updatedOldPeers);
    }

    (socket as any).currentStudyRoom = cleanRoomId;
    socket.join(cleanRoomId);

    // Save or update user profile in storage and MongoDB
    storage.createOrUpdateUser({
      id: data.user.id,
      name: data.user.name,
      avatar: data.user.avatar,
      targetExam: data.user.targetExam || 'RRB PO & IBPS PO',
      college: data.user.college || 'Aspirant'
    });

    let peers = activeRoomPeers.get(cleanRoomId) || [];
    peers = peers.filter(p => p.socketId !== socket.id && p.userId !== data.user.id);
    
    const dailySummary = storage.getUserDailyActivitySummary(data.user.id);

    const newPeer: RoomPeer = {
      socketId: socket.id,
      userId: data.user.id,
      name: data.user.name,
      avatar: data.user.avatar,
      targetExam: data.user.targetExam || 'RRB PO & IBPS PO',
      college: data.user.college || 'Aspirant',
      status: data.user.status || 'Ready to Study',
      currentActivity: data.user.currentActivity || 'Ready to Study',
      activityCategory: data.user.activityCategory || 'study',
      activityStartTime: data.user.activityStartTime || null,
      isMuted: true, // Voice paused by default!
      isSpeaking: false,
      joinedAt: Date.now(),
      todayStudySeconds: dailySummary.todayStudySeconds,
      todayHours: dailySummary.todayHours,
      subjectBreakdown: dailySummary.subjectBreakdown
    };

    peers.push(newPeer);
    activeRoomPeers.set(cleanRoomId, peers);

    // Broadcast updated real peers to room
    io.to(cleanRoomId).emit('room:peers', peers);
    socket.emit('wb:history', storage.getWhiteboard(cleanRoomId));
    socket.emit('notes:load', storage.getNote(cleanRoomId));

    // Send active PDF presentation state if one is running in this room
    const currentPres = activePdfPresentations.get(cleanRoomId);
    if (currentPres && currentPres.isActive) {
      socket.emit('pdf:presentation_state', currentPres);
    }
  });

  // Explicit Leave Room
  socket.on('room:leave', (data: { roomId: string; userId?: string }) => {
    const rId = (data.roomId || (socket as any).currentStudyRoom || '').trim().toUpperCase();
    if (rId) {
      socket.leave(rId);
      socket.leave(`video_${rId}`);
      socket.leave(`chat_${rId}`);
      socket.leave(`voice_${rId}`);

      const peers = activeRoomPeers.get(rId) || [];
      const remaining = peers.filter(p => p.socketId !== socket.id && (!data.userId || p.userId !== data.userId));
      activeRoomPeers.set(rId, remaining);
      io.to(rId).emit('room:peers', remaining);
      (socket as any).currentStudyRoom = null;
    }
  });

  // Start a new Live Situation / Activity (Timer begins)
  socket.on('activity:start', (data: {
    roomId: string;
    userId: string;
    userName: string;
    activityName: string;
    category: 'study' | 'break' | 'personal';
  }) => {
    const roomId = cleanRoomId(data.roomId);
    const peers = activeRoomPeers.get(roomId) || [];
    const peer = peers.find(p => p.userId === data.userId || p.socketId === socket.id);

    const now = Date.now();
    if (peer) {
      peer.currentActivity = data.activityName;
      peer.activityCategory = data.category;
      peer.activityStartTime = now;
      peer.status = data.activityName;
      io.to(roomId).emit('room:peers', peers);
    }

    // Broadcast social notification
    io.to(roomId).emit('notification:toast', {
      title: `${data.userName} Started Activity`,
      message: `${data.activityName} timer is now running.`,
      type: data.category === 'break' ? 'warning' : 'success'
    });
  });

  // Stop current Live Situation / Activity (Timer ends and records duration)
  socket.on('activity:stop', (data: {
    roomId: string;
    userId: string;
    userName: string;
    activityName: string;
    category: 'study' | 'break' | 'personal';
    durationSeconds: number;
    localDate?: string;
  }) => {
    const roomId = cleanRoomId(data.roomId);
    const peers = activeRoomPeers.get(roomId) || [];
    const peer = peers.find(p => p.userId === data.userId || p.socketId === socket.id);

    // Record session into persistent storage & update user study hours + XP
    storage.recordActivitySession(
      data.userId,
      data.userName,
      data.activityName,
      data.category,
      data.durationSeconds,
      typeof data.localDate === 'string' && data.localDate.trim() ? data.localDate.trim() : undefined
    );

    if (peer) {
      peer.activityStartTime = null;
      peer.currentActivity = 'Idle 💤';
      peer.status = 'Idle 💤';
      const updatedSummary = storage.getUserDailyActivitySummary(data.userId);
      peer.todayStudySeconds = updatedSummary.todayStudySeconds;
      peer.todayHours = updatedSummary.todayHours;
      peer.subjectBreakdown = updatedSummary.subjectBreakdown;
      io.to(roomId).emit('room:peers', peers);
    }

    const mins = Math.floor(data.durationSeconds / 60);
    const secs = data.durationSeconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    io.to(roomId).emit('notification:toast', {
      title: `${data.userName} Finished Session`,
      message: `Completed ${timeStr} of ${data.activityName}! Saved to analytics.`,
      type: 'info'
    });
  });

  // User updates what they are reading (PDF) or watching (YouTube)
  socket.on('peer:update_media_state', (data: {
    roomId: string;
    userId: string;
    currentDocument?: { id: string; title: string; fileUrl: string; currentPage: number } | null;
    currentVideo?: { videoId: string; title?: string; currentTime: number } | null;
  }) => {
    const roomId = (data.roomId || (socket as any).currentStudyRoom || 'study-room-alpha').trim().toUpperCase();
    const peers = activeRoomPeers.get(roomId) || [];
    const peer = peers.find(p => p.userId === data.userId || p.socketId === socket.id);
    if (peer) {
      if (data.currentDocument !== undefined) peer.currentDocument = data.currentDocument || undefined;
      if (data.currentVideo !== undefined) peer.currentVideo = data.currentVideo || undefined;
      io.to(roomId).emit('room:peers', peers);
    }
  });

  // Start Group PDF Presentation (Co-Study Mode)
  socket.on('pdf:present', (data: {
    roomId: string;
    presenterId: string;
    presenterName: string;
    documentId: string;
    title: string;
    fileUrl: string;
    currentPage: number;
  }) => {
    const roomId = (data.roomId || 'study-room-alpha').trim().toUpperCase();
    const pres: PdfPresentation = {
      ...data,
      roomId,
      isActive: true
    };
    activePdfPresentations.set(roomId, pres);
    io.to(roomId).emit('pdf:presentation_state', pres);
    io.to(roomId).emit('notification:toast', {
      title: 'PDF Co-Study Started',
      message: `${data.presenterName} started presenting "${data.title}" (Page ${data.currentPage})`,
      type: 'info'
    });
  });

  // Presenter flips page or switches PDF
  socket.on('pdf:page_change', (data: {
    roomId: string;
    currentPage: number;
    documentId?: string;
  }) => {
    const roomId = (data.roomId || 'study-room-alpha').trim().toUpperCase();
    const pres = activePdfPresentations.get(roomId);
    if (pres && pres.isActive) {
      pres.currentPage = data.currentPage;
      if (data.documentId) pres.documentId = data.documentId;
      socket.to(roomId).emit('pdf:page_sync', {
        currentPage: data.currentPage,
        documentId: data.documentId
      });
    }
  });

  // Stop Group PDF Presentation
  socket.on('pdf:stop_present', (data: { roomId: string }) => {
    const roomId = (data.roomId || 'study-room-alpha').trim().toUpperCase();
    activePdfPresentations.delete(roomId);
    io.to(roomId).emit('pdf:presentation_state', { isActive: false, roomId });
  });

  // Voice Password Verification
  socket.on('voice:verify_password', async (data: { roomId: string; password: string }, callback: (res: { success: boolean; message: string }) => void) => {
    const cleanRoomId = (data.roomId || 'study-room-alpha').trim().toUpperCase();
    const expected = await getExpectedVoicePassword(cleanRoomId);

    if (!expected) {
      callback({ success: false, message: 'No voice password is configured for this study group.' });
      return;
    }

    if (data.password === expected) {
      callback({ success: true, message: 'Voice room unlocked! Microphone enabled.' });
    } else {
      callback({ success: false, message: 'Incorrect Voice Room Password. Please try again.' });
    }
  });

  // Whiteboard
  socket.on('wb:element', (data: { roomId: string; element: WhiteboardElement }) => {
    const roomId = cleanRoomId(data.roomId);
    storage.saveWhiteboardElement(roomId, data.element);
    socket.to(roomId).emit('wb:element', data.element);
  });

  socket.on('wb:clear', (data: { roomId: string }) => {
    const roomId = cleanRoomId(data.roomId);
    storage.clearWhiteboard(roomId);
    socket.to(roomId).emit('wb:clear');
  });

  socket.on('wb:cursor', (data: { roomId: string; x: number; y: number; userName: string; color: string }) => {
    const roomId = cleanRoomId(data.roomId);
    socket.to(roomId).emit('wb:cursor', {
      socketId: socket.id,
      ...data
    });
  });

  // Notes
  socket.on('notes:update', (data: { roomId: string; content: string; userName: string }) => {
    const roomId = cleanRoomId(data.roomId);
    const updated = storage.updateNote(roomId, data.content, data.userName);
    socket.to(roomId).emit('notes:update', updated);
  });

  // Disconnect
  socket.on('disconnect', () => {
    activeRoomPeers.forEach((peers, roomId) => {
      const remaining = peers.filter(p => p.socketId !== socket.id);
      activeRoomPeers.set(roomId, remaining);
      io.to(roomId).emit('room:peers', remaining);
    });
  });
}
