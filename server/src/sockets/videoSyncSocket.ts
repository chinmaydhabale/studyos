import { Server, Socket } from 'socket.io';
import { storage } from '../services/storageService.js';

export function setupVideoSyncSocket(io: Server, socket: Socket) {
  // Client joins video room
  socket.on('video:join', (data: { roomId: string; userName: string }) => {
    const roomId = (data.roomId || 'study-room-alpha').trim().toUpperCase();
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

  // Client changes video URL (e.g. pastes a YouTube class link)
  socket.on('video:change_url', (data: { roomId: string; videoUrl: string; videoId: string; userName: string }) => {
    const roomId = data.roomId || 'study-room-alpha';
    const updated = storage.updateVideoState(roomId, {
      videoUrl: data.videoUrl,
      videoId: data.videoId,
      currentTime: 0,
      isPlaying: false,
      updatedBy: data.userName
    });

    io.to(`video_${roomId}`).emit('video:state', updated);
    io.to(roomId).emit('notification:toast', {
      title: 'New Class Video Loaded',
      message: `${data.userName} loaded a new YouTube lecture!`,
      type: 'info'
    });
  });

  // Client plays video
  socket.on('video:play', (data: { roomId: string; currentTime: number; userName: string }) => {
    const roomId = data.roomId || 'study-room-alpha';
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
    const roomId = data.roomId || 'study-room-alpha';
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
    const roomId = data.roomId || 'study-room-alpha';
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
    const roomId = data.roomId || 'study-room-alpha';
    storage.updateVideoState(roomId, { playbackRate: data.rate });
    socket.to(`video_${roomId}`).emit('video:rate', { rate: data.rate });
  });

  // Heartbeat / Periodic drift check sync request
  socket.on('video:sync_request', (data: { roomId: string }) => {
    const roomId = data.roomId || 'study-room-alpha';
    const currentState = storage.getVideoState(roomId);
    socket.emit('video:sync_response', currentState);
  });
}
