import { Server, Socket } from 'socket.io';
import { storage } from '../services/storageService.js';

const DEFAULT_ROOM = 'study-room-alpha';

function cleanRoomId(roomId?: string): string {
  return (roomId || DEFAULT_ROOM).trim().toUpperCase();
}

export function setupVideoSyncSocket(io: Server, socket: Socket) {
  // Client joins video room
  socket.on('video:join', (data: { roomId: string; userName: string }) => {
    const roomId = cleanRoomId(data.roomId);
    const oldVideoRoom = (socket as any).currentVideoRoom;
    if (oldVideoRoom && oldVideoRoom !== `video_${roomId}`) {
      socket.leave(oldVideoRoom);
    }
    (socket as any).currentVideoRoom = `video_${roomId}`;
    socket.join(`video_${roomId}`);
    
    // Send current video state to the new client
    const currentState = storage.getVideoState(roomId);
    socket.emit('video:state', currentState);
  });

  // Client changes video URL (e.g. pastes a YouTube class link or loads an uploaded movie)
  socket.on('video:change_url', (data: {
    roomId: string;
    videoUrl: string;
    videoId: string;
    userName: string;
    mediaType?: 'youtube' | 'movie';
    title?: string;
    duration?: number;
  }) => {
    const roomId = cleanRoomId(data.roomId);
    if (!socket.rooms.has(`video_${roomId}`)) return;
    const mediaType = data.mediaType || (data.videoUrl.includes('youtube.com') || data.videoUrl.includes('youtu.be') ? 'youtube' : 'movie');
    const updated = storage.updateVideoState(roomId, {
      videoUrl: data.videoUrl,
      videoId: data.videoId,
      mediaType,
      title: data.title || (mediaType === 'movie' ? 'Watch Party Movie' : 'YouTube Video'),
      duration: data.duration || 0,
      currentTime: 0,
      isPlaying: false,
      updatedBy: data.userName
    });

    io.to(`video_${roomId}`).emit('video:state', updated);
    io.to(roomId).emit('notification:toast', {
      title: mediaType === 'movie' ? '🎬 Watch Party Movie Loaded' : 'New Class Video Loaded',
      message: `${data.userName} loaded ${data.title ? `"${data.title}"` : (mediaType === 'movie' ? 'a movie for watch party' : 'a YouTube video')}!`,
      type: 'info'
    });
  });

  // Client plays video
  socket.on('video:play', (data: { roomId: string; currentTime: number; userName: string }) => {
    const roomId = cleanRoomId(data.roomId);
    if (!socket.rooms.has(`video_${roomId}`)) return;
    const updated = storage.updateVideoState(roomId, {
      isPlaying: true,
      currentTime: data.currentTime,
      updatedBy: data.userName
    });

    socket.to(`video_${roomId}`).emit('video:play', {
      currentTime: data.currentTime,
      updatedBy: data.userName,
      serverTimestamp: Date.now()
    });
  });

  // Client pauses video
  socket.on('video:pause', (data: { roomId: string; currentTime: number; userName: string }) => {
    const roomId = cleanRoomId(data.roomId);
    if (!socket.rooms.has(`video_${roomId}`)) return;
    const updated = storage.updateVideoState(roomId, {
      isPlaying: false,
      currentTime: data.currentTime,
      updatedBy: data.userName
    });

    socket.to(`video_${roomId}`).emit('video:pause', {
      currentTime: data.currentTime,
      updatedBy: data.userName
    });
  });

  // Client seeks forward or backward
  socket.on('video:seek', (data: { roomId: string; seekToTime: number; userName: string }) => {
    const roomId = cleanRoomId(data.roomId);
    if (!socket.rooms.has(`video_${roomId}`)) return;
    const updated = storage.updateVideoState(roomId, {
      currentTime: data.seekToTime,
      updatedBy: data.userName
    });

    socket.to(`video_${roomId}`).emit('video:seek', {
      currentTime: data.seekToTime,
      updatedBy: data.userName
    });
  });

  // Client changes playback rate
  socket.on('video:rate', (data: { roomId: string; rate: number }) => {
    const roomId = cleanRoomId(data.roomId);
    if (!socket.rooms.has(`video_${roomId}`)) return;
    storage.updateVideoState(roomId, { playbackRate: data.rate });
    socket.to(`video_${roomId}`).emit('video:rate', { rate: data.rate });
  });

  // Heartbeat / Periodic drift check sync request
  socket.on('video:sync_request', (data: { roomId: string }) => {
    const roomId = cleanRoomId(data.roomId);
    const currentState = storage.getVideoState(roomId);
    socket.emit('video:sync_response', currentState);
  });

  // Floating Reaction Broadcast (🍿, ❤️, 😂, 🔥, 😱)
  socket.on('movie:reaction', (data: { roomId: string; emoji: string; userName?: string }) => {
    const roomId = cleanRoomId(data.roomId);
    if (!socket.rooms.has(`video_${roomId}`)) return;
    io.to(`video_${roomId}`).emit('movie:reaction', {
      emoji: data.emoji || '🍿',
      userName: data.userName || 'Friend',
      id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now()
    });
  });

  // Host lock toggle
  socket.on('movie:lock_toggle', (data: { roomId: string; isHostLocked: boolean }) => {
    const roomId = cleanRoomId(data.roomId);
    if (!socket.rooms.has(`video_${roomId}`)) return;
    const updated = storage.updateVideoState(roomId, { isHostLocked: data.isHostLocked });
    io.to(`video_${roomId}`).emit('video:state', updated);
  });
}

