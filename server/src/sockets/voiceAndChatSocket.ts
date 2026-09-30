import { Server, Socket } from 'socket.io';
import { storage } from '../services/storageService.js';
import { aiCoach } from '../services/aiCoachService.js';
import { updateRoomPeerVoiceState, getExpectedVoicePassword } from './studyRoomSocket.js';
import { ChatMessage } from '../types.js';

const DEFAULT_ROOM = 'STUDY-ROOM-ALPHA';

// roomId -> (socketId -> userName) for everyone currently in the voice channel
const voiceRoomMembers: Map<string, Map<string, string>> = new Map();

function cleanRoomId(roomId?: string): string {
  return (roomId || DEFAULT_ROOM).trim().toUpperCase();
}

function addVoiceMember(roomId: string, socketId: string, userName: string): Array<{ peerId: string; name: string }> {
  const members = voiceRoomMembers.get(roomId) || new Map<string, string>();
  const existing = Array.from(members.entries())
    .filter(([peerId]) => peerId !== socketId)
    .map(([peerId, name]) => ({ peerId, name }));
  members.set(socketId, userName);
  voiceRoomMembers.set(roomId, members);
  return existing;
}

export function removeVoiceMember(roomId: string, socketId: string): void {
  const members = voiceRoomMembers.get(roomId);
  if (!members) return;
  members.delete(socketId);
  if (members.size === 0) voiceRoomMembers.delete(roomId);
}

export function setupVoiceAndChatSocket(io: Server, socket: Socket) {
  // Join Room Chat & Voice Channel
  socket.on('chat:join', (data: { roomId: string }) => {
    const roomId = cleanRoomId(data.roomId);
    socket.join(roomId);
    socket.join(`chat_${roomId}`);
    
    // Return existing chat history
    const history = storage.getRoomChat(roomId);
    socket.emit('chat:history', history);
  });

  // User sends a chat message (can include video timestamp or PDF page reference)
  socket.on('chat:send', async (data: {
    roomId: string;
    userId: string;
    userName: string;
    userAvatar: string;
    text: string;
    videoTimestamp?: number;
    pdfPage?: number;
    pdfDocTitle?: string;
    isAiDoubt?: boolean;
  }) => {
    const roomId = cleanRoomId(data.roomId);
    const safeText = typeof data.text === 'string' ? data.text : '';
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      roomId,
      userId: data.userId || 'anonymous',
      userName: data.userName || 'Student',
      userAvatar: data.userAvatar || '',
      text: safeText,
      videoTimestamp: data.videoTimestamp,
      pdfPage: data.pdfPage,
      pdfDocTitle: data.pdfDocTitle,
      isAiDoubt: Boolean(data.isAiDoubt || safeText.startsWith('/ai')),
      createdAt: new Date().toISOString()
    };

    // Store and broadcast user message
    storage.addChatMessage(roomId, newMsg);
    io.to(roomId).to(`chat_${roomId}`).emit('chat:message', newMsg);

    // If it's a doubt for AI
    if (newMsg.isAiDoubt) {
      const query = safeText.replace(/^\/ai\s*/i, '');
      const doubtResult = await aiCoach.explainDoubt(query, {
        videoTimestamp: data.videoTimestamp,
        pdfPage: data.pdfPage,
        pdfTitle: data.pdfDocTitle,
        userId: data.userId
      });

      const contextHeader = data.pdfPage
        ? `📖 *Context: ${data.pdfDocTitle || 'Study PDF'} (Page ${data.pdfPage})*\n\n`
        : data.videoTimestamp !== undefined
        ? `⏱️ *Context: Lecture Timestamp ${Math.floor(data.videoTimestamp / 60)}:${Math.floor(data.videoTimestamp % 60).toString().padStart(2, '0')}*\n\n`
        : '';

      const aiReply: ChatMessage = {
        id: `ai-msg-${Date.now()}`,
        roomId,
        userId: 'ai_coach',
        userName: 'StudyOS AI Teacher 🤖',
        userAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=StudyCoach&backgroundColor=4f46e5',
        text: `${contextHeader}**Doubt Solution:**\n${doubtResult.explanation}\n\n${doubtResult.steps.join('\n')}\n\n💡 *Tip: ${doubtResult.practiceTip}*`,
        videoTimestamp: data.videoTimestamp,
        pdfPage: data.pdfPage,
        pdfDocTitle: data.pdfDocTitle,
        isAiDoubt: true,
        createdAt: new Date().toISOString()
      };

      storage.addChatMessage(roomId, aiReply);
      io.to(roomId).to(`chat_${roomId}`).emit('chat:message', aiReply);
    }
  });

  // WebRTC Audio Signaling for real-time voice chat between students.
  // Every signal must reach exactly one peer; drop if no target specified to prevent glare.
  socket.on('webrtc:offer', (data: { roomId: string; offer: any; to?: string }) => {
    if (!data.to) {
      console.warn('[webrtc] Drop offer: missing recipient "to"');
      return;
    }
    io.to(data.to).emit('webrtc:offer', { from: socket.id, offer: data.offer });
  });

  socket.on('webrtc:answer', (data: { roomId: string; answer: any; to?: string }) => {
    if (!data.to) {
      console.warn('[webrtc] Drop answer: missing recipient "to"');
      return;
    }
    io.to(data.to).emit('webrtc:answer', { from: socket.id, answer: data.answer });
  });

  socket.on('webrtc:ice_candidate', (data: { roomId: string; candidate: any; to?: string }) => {
    if (!data.to) {
      console.warn('[webrtc] Drop candidate: missing recipient "to"');
      return;
    }
    io.to(data.to).emit('webrtc:ice_candidate', { from: socket.id, candidate: data.candidate });
  });

  // Join voice room (Password gate strictly enforced on server)
  socket.on('voice:join', async (data: { roomId: string; userName?: string; password?: string }) => {
    const roomId = cleanRoomId(data.roomId);
    const expected = await getExpectedVoicePassword(roomId);
    if (expected) {
      const isUnlocked = (socket as any).unlockedVoiceRooms?.has(roomId);
      const matchesPassword = data.password && typeof data.password === 'string' && data.password.trim() === expected.trim();
      if (!isUnlocked && !matchesPassword) {
        socket.emit('notification:toast', {
          title: 'Voice Room Locked',
          message: 'Voice channel is password-protected. Please unlock with room password.',
          type: 'warning'
        });
        return;
      }
      if (matchesPassword) {
        (socket as any).unlockedVoiceRooms = (socket as any).unlockedVoiceRooms || new Set<string>();
        (socket as any).unlockedVoiceRooms.add(roomId);
      }
    }

    const oldVoiceRoom = (socket as any).currentVoiceRoom;
    if (oldVoiceRoom && oldVoiceRoom !== `voice_${roomId}`) {
      socket.leave(oldVoiceRoom);
      const oldRoomId = oldVoiceRoom.replace(/^voice_/, '');
      removeVoiceMember(oldRoomId, socket.id);
      io.to(oldVoiceRoom).emit('voice:peer_left', { peerId: socket.id });
    }
    (socket as any).currentVoiceRoom = `voice_${roomId}`;
    socket.join(`voice_${roomId}`);

    // Tell the newcomer who is already in the call so it can offer to each of them,
    // and let the existing peers know a newcomer joined.
    const existingPeers = addVoiceMember(roomId, socket.id, data.userName || 'Student');
    socket.emit('voice:peers', { roomId, peers: existingPeers });
    socket.to(`voice_${roomId}`).emit('voice:peer_joined', {
      peerId: socket.id,
      userName: data.userName || 'Student'
    });
  });

  // Leave voice room explicitly (e.g. user re-locks the voice channel)
  socket.on('voice:leave', (data: { roomId: string }) => {
    const roomId = cleanRoomId(data.roomId);
    socket.leave(`voice_${roomId}`);
    removeVoiceMember(roomId, socket.id);
    socket.to(`voice_${roomId}`).emit('voice:peer_left', { peerId: socket.id });
    (socket as any).currentVoiceRoom = null;
  });

  // Mic state & Voice Activity Detection (Speaking indicator)
  socket.on('voice:state', (data: { roomId: string; isMuted: boolean; isSpeaking: boolean; userName: string }) => {
    const roomId = cleanRoomId(data.roomId);
    const payload = {
      socketId: socket.id,
      userName: data.userName,
      isMuted: data.isMuted,
      isSpeaking: data.isSpeaking
    };
    // Keep the room roster in sync so the presence bar shows live mic state,
    // and reach members who have not unlocked voice yet as well.
    updateRoomPeerVoiceState(io, roomId, socket.id, {
      isMuted: data.isMuted,
      isSpeaking: data.isSpeaking
    });
    io.to(`voice_${roomId}`).to(roomId).emit('voice:peer_state', payload);
  });

  socket.on('disconnect', () => {
    voiceRoomMembers.forEach((members, roomId) => {
      if (!members.has(socket.id)) return;
      removeVoiceMember(roomId, socket.id);
      io.to(`voice_${roomId}`).emit('voice:peer_left', { peerId: socket.id });
    });
  });
}
