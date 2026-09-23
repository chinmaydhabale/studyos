import { Server, Socket } from 'socket.io';
import { storage } from '../services/storageService.js';
import { aiCoach } from '../services/aiCoachService.js';
import { ChatMessage } from '../types.js';

export function setupVoiceAndChatSocket(io: Server, socket: Socket) {
  // Join Room Chat & Voice Channel
  socket.on('chat:join', (data: { roomId: string }) => {
    const roomId = (data.roomId || 'study-room-alpha').trim().toUpperCase();
    const oldChatRoom = (socket as any).currentChatRoom;
    if (oldChatRoom && oldChatRoom !== `chat_${roomId}`) {
      socket.leave(oldChatRoom);
    }
    (socket as any).currentChatRoom = `chat_${roomId}`;
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
    const roomId = data.roomId || 'study-room-alpha';
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      roomId,
      userId: data.userId,
      userName: data.userName,
      userAvatar: data.userAvatar,
      text: data.text,
      videoTimestamp: data.videoTimestamp,
      pdfPage: data.pdfPage,
      pdfDocTitle: data.pdfDocTitle,
      isAiDoubt: data.isAiDoubt || data.text.startsWith('/ai'),
      createdAt: new Date().toISOString()
    };

    // Store and broadcast user message
    storage.addChatMessage(roomId, newMsg);
    io.to(`chat_${roomId}`).emit('chat:message', newMsg);

    // If it's a doubt for AI
    if (newMsg.isAiDoubt) {
      const query = data.text.replace(/^\/ai\s*/i, '');
      const doubtResult = aiCoach.explainDoubt(query, {
        videoTimestamp: data.videoTimestamp,
        pdfPage: data.pdfPage,
        pdfTitle: data.pdfDocTitle
      });

      const contextHeader = data.pdfPage
        ? `📖 *Context: ${data.pdfDocTitle || 'Study PDF'} (Page ${data.pdfPage})*\n\n`
        : data.videoTimestamp !== undefined
        ? `⏱️ *Context: Lecture Timestamp ${Math.floor(data.videoTimestamp / 60)}:${(data.videoTimestamp % 60).toString().padStart(2, '0')}*\n\n`
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

      setTimeout(() => {
        storage.addChatMessage(roomId, aiReply);
        io.to(`chat_${roomId}`).emit('chat:message', aiReply);
      }, 600);
    }
  });

  // WebRTC Audio Signaling for real-time voice chat between students
  socket.on('webrtc:offer', (data: { roomId: string; offer: any; to?: string }) => {
    const roomId = data.roomId || 'study-room-alpha';
    socket.to(`voice_${roomId}`).emit('webrtc:offer', {
      from: socket.id,
      offer: data.offer
    });
  });

  socket.on('webrtc:answer', (data: { roomId: string; answer: any; to?: string }) => {
    const roomId = data.roomId || 'study-room-alpha';
    socket.to(`voice_${roomId}`).emit('webrtc:answer', {
      from: socket.id,
      answer: data.answer
    });
  });

  socket.on('webrtc:ice_candidate', (data: { roomId: string; candidate: any }) => {
    const roomId = data.roomId || 'study-room-alpha';
    socket.to(`voice_${roomId}`).emit('webrtc:ice_candidate', {
      from: socket.id,
      candidate: data.candidate
    });
  });

  // Join voice room
  socket.on('voice:join', (data: { roomId: string }) => {
    const roomId = (data.roomId || 'study-room-alpha').trim().toUpperCase();
    const oldVoiceRoom = (socket as any).currentVoiceRoom;
    if (oldVoiceRoom && oldVoiceRoom !== `voice_${roomId}`) {
      socket.leave(oldVoiceRoom);
    }
    (socket as any).currentVoiceRoom = `voice_${roomId}`;
    socket.join(`voice_${roomId}`);
    socket.to(`voice_${roomId}`).emit('voice:peer_joined', { peerId: socket.id });
  });

  // Mic state & Voice Activity Detection (Speaking indicator)
  socket.on('voice:state', (data: { roomId: string; isMuted: boolean; isSpeaking: boolean; userName: string }) => {
    const roomId = data.roomId || 'study-room-alpha';
    socket.to(roomId).emit('voice:peer_state', {
      socketId: socket.id,
      userName: data.userName,
      isMuted: data.isMuted,
      isSpeaking: data.isSpeaking
    });
  });
}
