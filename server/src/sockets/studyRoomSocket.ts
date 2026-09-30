import { Server, Socket } from 'socket.io';
import { storage } from '../services/storageService.js';
import { WhiteboardElement, LiveScreenShareState } from '../types.js';
import { removeVoiceMember } from './voiceAndChatSocket.js';

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
  liveScreenShare?: {
    isActive: boolean;
    title?: string;
    platformName?: string;
    streamType?: 'mock' | 'screen' | 'notes';
  };
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
const activeScreenShares: Map<string, LiveScreenShareState> = new Map();
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

export function performRoomLeaveCleanup(
  io: Server,
  socket: Socket,
  roomId: string,
  userId?: string
): void {
  const cleanId = cleanRoomId(roomId);
  socket.leave(cleanId);
  socket.leave(`video_${cleanId}`);
  socket.leave(`chat_${cleanId}`);
  socket.leave(`voice_${cleanId}`);

  // Voice room member cleanup
  removeVoiceMember(cleanId, socket.id);
  io.to(`voice_${cleanId}`).emit('voice:peer_left', { peerId: socket.id });

  const peers = activeRoomPeers.get(cleanId) || [];
  const departingPeer = peers.find(p => p.socketId === socket.id || (userId && p.userId === userId));

  // Auto-save in-progress study activity on room exit
  if (departingPeer && departingPeer.activityStartTime && departingPeer.currentActivity && departingPeer.currentActivity !== 'Idle 💤') {
    const durationSeconds = Math.max(0, Math.floor((Date.now() - departingPeer.activityStartTime) / 1000));
    if (durationSeconds >= 10) {
      storage.recordActivitySession(
        departingPeer.userId,
        departingPeer.name,
        departingPeer.currentActivity,
        departingPeer.activityCategory || 'study',
        durationSeconds
      );
      const updatedUser = storage.getUser(departingPeer.userId);
      if (updatedUser) {
        socket.emit('user:profile_updated', updatedUser);
      }
    }
    departingPeer.activityStartTime = null;
  }

  const remaining = peers.filter(p => p.socketId !== socket.id && (!userId || p.userId !== userId));
  // Bug 10 fix: delete empty room from Map to prevent unbounded memory growth
  if (remaining.length === 0) {
    activeRoomPeers.delete(cleanId);
  } else {
    activeRoomPeers.set(cleanId, remaining);
  }
  io.to(cleanId).emit('room:peers', remaining);

  // Clean up orphaned PDF presentation if presenter left
  const currentPres = activePdfPresentations.get(cleanId);
  if (currentPres && departingPeer && currentPres.presenterId === departingPeer.userId) {
    activePdfPresentations.delete(cleanId);
    io.to(cleanId).emit('pdf:presentation_state', { isActive: false, roomId: cleanId });
    io.to(cleanId).emit('notification:toast', {
      title: 'PDF Co-Study Ended',
      message: `${departingPeer.name} left the room. PDF presentation ended.`,
      type: 'info'
    });
  }

  // Clean up orphaned screen share if presenter left, or notify presenter if viewer left (Bug 17)
  const currentShare = activeScreenShares.get(cleanId);
  if (currentShare) {
    if (currentShare.presenterSocketId === socket.id || (departingPeer && currentShare.presenterId === departingPeer.userId)) {
      activeScreenShares.delete(cleanId);
      io.to(cleanId).emit('screen:state', { isActive: false, roomId: cleanId });
      io.to(cleanId).emit('notification:toast', {
        title: 'Live Stream Ended',
        message: `${departingPeer ? departingPeer.name : 'Presenter'} left the room. Live stream ended.`,
        type: 'info'
      });
    } else {
      // Notify presenter that this viewer left
      io.to(currentShare.presenterSocketId).emit('screen:viewer_left', {
        viewerSocketId: socket.id
      });
    }
  }
}

export function setupStudyRoomSocket(io: Server, socket: Socket) {
  // Join Room
  socket.on('room:join', (data: {
    roomId: string;
    user: {
      id: string;
      name: string;
      username?: string;
      avatar: string;
      targetExam?: string;
      college?: string;
      status?: string;
      currentActivity?: string;
      activityCategory?: 'study' | 'break' | 'personal';
      activityStartTime?: number | null;
    }
  }) => {
    const cleanRoomId = (data.roomId || 'STUDY-ROOM-ALPHA').trim().toUpperCase();
    const oldRoomId = (socket as any).currentStudyRoom;

    // Cleanly leave previous room to prevent cross-room leaks (Bug 8 fix)
    if (oldRoomId && oldRoomId !== cleanRoomId) {
      performRoomLeaveCleanup(io, socket, oldRoomId, data.user.id);
    }

    (socket as any).currentStudyRoom = cleanRoomId;
    (socket as any).userId = data.user.id;
    socket.join(cleanRoomId);
    socket.join(`chat_${cleanRoomId}`);
    socket.join(`video_${cleanRoomId}`);

    const effectiveName = data.user.name?.trim() || 'Student Aspirant';

    // Save or update user profile in storage and MongoDB
    storage.createOrUpdateUser({
      id: data.user.id,
      name: effectiveName,
      username: data.user.username,
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
      name: effectiveName,
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

    // Send active Screen / Mock share state if one is running in this room
    const currentShare = activeScreenShares.get(cleanRoomId);
    if (currentShare && currentShare.isActive) {
      socket.emit('screen:state', currentShare);
    }
  });

  // Explicit Leave Room
  socket.on('room:leave', (data: { roomId: string; userId?: string }) => {
    const rId = (data.roomId || (socket as any).currentStudyRoom || '').trim().toUpperCase();
    if (rId) {
      performRoomLeaveCleanup(io, socket, rId, data.userId);
      (socket as any).currentStudyRoom = null;
    }
  });

  // User manual status change
  socket.on('user:status_change', (data: { roomId: string; status: string; userId?: string }) => {
    const roomId = cleanRoomId(data.roomId);
    const peers = activeRoomPeers.get(roomId) || [];
    const peer = peers.find(p => (data.userId && p.userId === data.userId) || p.socketId === socket.id);
    if (peer) {
      peer.status = data.status;
      peer.currentActivity = data.status;
      io.to(roomId).emit('room:peers', peers);
    }
    if (data.userId) {
      storage.createOrUpdateUser({ id: data.userId, status: data.status, currentActivity: data.status });
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
      // If previous activity was running, auto-save it first
      if (peer.activityStartTime && peer.currentActivity && peer.currentActivity !== 'Idle 💤') {
        const prevDuration = Math.max(0, Math.floor((now - peer.activityStartTime) / 1000));
        if (prevDuration >= 10) {
          storage.recordActivitySession(
            peer.userId,
            peer.name,
            peer.currentActivity,
            peer.activityCategory || 'study',
            prevDuration
          );
        }
      }

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

    // Sync updated user stats back to the client immediately
    const updatedUser = storage.getUser(data.userId);
    if (updatedUser) {
      socket.emit('user:profile_updated', updatedUser);
    }

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

  // --- Screen / Mock Test Live Sharing ---
  socket.on('screen:start', (data: {
    roomId: string;
    presenterId: string;
    presenterName: string;
    presenterAvatar: string;
    streamType?: 'mock' | 'screen' | 'notes';
    title?: string;
    platformName?: string;
  }) => {
    const roomId = cleanRoomId(data.roomId);
    const shareState: LiveScreenShareState = {
      roomId,
      presenterSocketId: socket.id,
      presenterId: data.presenterId,
      presenterName: data.presenterName,
      presenterAvatar: data.presenterAvatar,
      streamType: data.streamType || 'mock',
      title: data.title || 'Live Mock Test',
      platformName: data.platformName || 'Mock Arena',
      isActive: true,
      startedAt: Date.now()
    };
    activeScreenShares.set(roomId, shareState);
    (socket as any).userId = data.presenterId;

    // Update peer in activeRoomPeers roster
    const peers = activeRoomPeers.get(roomId) || [];
    const peer = peers.find(p => p.socketId === socket.id || p.userId === data.presenterId);
    if (peer) {
      peer.liveScreenShare = {
        isActive: true,
        title: shareState.title,
        platformName: shareState.platformName,
        streamType: shareState.streamType
      };
      io.to(roomId).emit('room:peers', peers);
    }

    io.to(roomId).emit('screen:state', shareState);
    io.to(roomId).emit('notification:toast', {
      title: '🔴 Mock Test Live Stream Started',
      message: `${data.presenterName} is now live giving a mock test on ${shareState.platformName}!`,
      type: 'info'
    });
  });

  socket.on('screen:stop', (data: { roomId: string }) => {
    const roomId = cleanRoomId(data.roomId);
    const current = activeScreenShares.get(roomId);
    if (current && (current.presenterSocketId === socket.id || current.presenterId === (socket as any).userId)) {
      activeScreenShares.delete(roomId);

      const peers = activeRoomPeers.get(roomId) || [];
      const peer = peers.find(p => p.socketId === socket.id);
      if (peer) {
        peer.liveScreenShare = undefined;
        io.to(roomId).emit('room:peers', peers);
      }

      io.to(roomId).emit('screen:state', { isActive: false, roomId });
      io.to(roomId).emit('notification:toast', {
        title: 'Live Stream Ended',
        message: `${current.presenterName} stopped screen sharing.`,
        type: 'info'
      });
    }
  });

  socket.on('screen:join_viewer', (data: { roomId: string; viewerName?: string }) => {
    const roomId = cleanRoomId(data.roomId);
    const current = activeScreenShares.get(roomId);
    if (current && current.isActive) {
      io.to(current.presenterSocketId).emit('screen:viewer_joined', {
        viewerSocketId: socket.id,
        viewerName: data.viewerName || 'Room Peer'
      });
    }
  });

  // Viewer leaves screen share - notify presenter to cleanup PC and decrement viewerCount (Bug 17 fix)
  socket.on('screen:leave_viewer', (data: { roomId: string }) => {
    const roomId = cleanRoomId(data.roomId);
    const current = activeScreenShares.get(roomId);
    if (current && current.isActive) {
      io.to(current.presenterSocketId).emit('screen:viewer_left', {
        viewerSocketId: socket.id
      });
    }
  });

  socket.on('screen:offer', (data: { to: string; offer: any }) => {
    io.to(data.to).emit('screen:offer', { from: socket.id, offer: data.offer });
  });

  socket.on('screen:answer', (data: { to: string; answer: any }) => {
    io.to(data.to).emit('screen:answer', { from: socket.id, answer: data.answer });
  });

  socket.on('screen:ice_candidate', (data: { to: string; candidate: any }) => {
    io.to(data.to).emit('screen:ice_candidate', { from: socket.id, candidate: data.candidate });
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
      (socket as any).unlockedVoiceRooms = (socket as any).unlockedVoiceRooms || new Set<string>();
      (socket as any).unlockedVoiceRooms.add(cleanRoomId);
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
      const isMember = peers.some(p => p.socketId === socket.id);
      if (isMember) {
        performRoomLeaveCleanup(io, socket, roomId);
      }
    });
  });
}
