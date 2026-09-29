import { useState, useEffect, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { LiveScreenShareState } from '../types.js';

interface UseScreenShareProps {
  socket: Socket | null;
  roomId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
  onToast?: (title: string, message: string, type?: 'info' | 'success' | 'warning' | 'alert') => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export const useScreenShare = ({
  socket,
  roomId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onToast
}: UseScreenShareProps) => {
  const [isSharing, setIsSharing] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [activeShare, setActiveShare] = useState<LiveScreenShareState | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const presenterPcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerPcRef = useRef<RTCPeerConnection | null>(null);

  const isPresenter = activeShare?.isActive && activeShare?.presenterId === currentUserId;

  // Cleanup presenter peer connections
  const cleanupPresenterPcs = useCallback(() => {
    presenterPcsRef.current.forEach(pc => {
      try {
        pc.onicecandidate = null;
        pc.close();
      } catch (e) {}
    });
    presenterPcsRef.current.clear();
    setViewerCount(0);
  }, []);

  // Cleanup viewer peer connection
  const cleanupViewerPc = useCallback(() => {
    if (viewerPcRef.current) {
      try {
        viewerPcRef.current.onicecandidate = null;
        viewerPcRef.current.ontrack = null;
        viewerPcRef.current.close();
      } catch (e) {}
      viewerPcRef.current = null;
    }
    setRemoteStream(null);
    setIsViewing(false);
  }, []);

  // Stop sharing function
  const stopSharing = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      localStreamRef.current = null;
    }
    cleanupPresenterPcs();
    setLocalStream(null);
    setIsSharing(false);
    setHasAudio(false);

    if (socket && roomId) {
      socket.emit('screen:stop', { roomId });
    }
    if (onToast) {
      onToast('Screen Share Stopped', 'Your screen is now private.', 'info');
    }
  }, [socket, roomId, cleanupPresenterPcs, onToast]);

  // Start sharing function (Presenter)
  const startSharing = useCallback(async (options?: {
    title?: string;
    platformName?: string;
    streamType?: 'mock' | 'screen' | 'notes';
  }) => {
    setError(null);
    if (!socket || !roomId) {
      setError('Not connected to study room');
      return;
    }

    try {
      // Prompt user to pick mock tab, window or screen
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser' as any,
          frameRate: { ideal: 30, max: 60 }
        },
        audio: true
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsSharing(true);
      const audioTracks = stream.getAudioTracks();
      setHasAudio(audioTracks.length > 0);

      // Handle user clicking native browser "Stop sharing" button
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopSharing();
        };
      }

      // Emit start to room
      socket.emit('screen:start', {
        roomId,
        presenterId: currentUserId,
        presenterName: currentUserName,
        presenterAvatar: currentUserAvatar || '',
        streamType: options?.streamType || 'mock',
        title: options?.title || 'Live Mock Test',
        platformName: options?.platformName || 'Mock Arena'
      });

      if (onToast) {
        onToast(
          '🔴 Live Sharing Active',
          `Broadcasting ${options?.platformName || 'Mock Test'} to room friends. Toggle off anytime to make private.`,
          'success'
        );
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        console.error('Error starting screen share:', err);
        setError(err.message || 'Failed to start screen share');
        if (onToast) {
          onToast('Screen Share Error', err.message || 'Could not access screen', 'alert');
        }
      }
    }
  }, [socket, roomId, currentUserId, currentUserName, currentUserAvatar, stopSharing, onToast]);

  // Join stream function (Viewer)
  const joinStream = useCallback(async () => {
    if (!socket || !roomId || !activeShare || !activeShare.isActive) return;
    if (activeShare.presenterId === currentUserId) return; // Don't watch yourself as viewer

    cleanupViewerPc();

    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      viewerPcRef.current = pc;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          setIsViewing(true);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket && activeShare) {
          socket.emit('screen:ice_candidate', {
            to: activeShare.presenterSocketId,
            candidate: event.candidate
          });
        }
      };

      // Notify presenter that we want to view
      socket.emit('screen:join_viewer', {
        roomId,
        viewerName: currentUserName
      });
    } catch (err: any) {
      console.error('Error joining stream:', err);
      setError('Failed to connect to live stream');
    }
  }, [socket, roomId, activeShare, currentUserId, currentUserName, cleanupViewerPc]);

  // Leave stream function (Viewer)
  const leaveStream = useCallback(() => {
    cleanupViewerPc();
  }, [cleanupViewerPc]);

  // Socket signaling listeners
  useEffect(() => {
    if (!socket) return;

    // Room screen share state change
    const handleScreenState = (state: LiveScreenShareState & { isActive: boolean }) => {
      if (state.isActive) {
        setActiveShare(state);
        // If someone else started and we're not currently presenting
        if (state.presenterId !== currentUserId) {
          if (onToast) {
            onToast(
              '🔴 Friend is Live!',
              `${state.presenterName} is now live giving mock test on ${state.platformName || 'Mock Arena'}. Click to watch!`,
              'info'
            );
          }
        }
      } else {
        setActiveShare(null);
        cleanupViewerPc();
        if (localStreamRef.current && isSharing) {
          stopSharing();
        }
      }
    };

    // Presenter: Handle viewer joined -> Create offer
    const handleViewerJoined = async (data: { viewerSocketId: string; viewerName: string }) => {
      if (!localStreamRef.current) return;

      try {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        presenterPcsRef.current.set(data.viewerSocketId, pc);
        setViewerCount(presenterPcsRef.current.size);

        // Add tracks to connection
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('screen:ice_candidate', {
              to: data.viewerSocketId,
              candidate: event.candidate
            });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('screen:offer', {
          to: data.viewerSocketId,
          offer
        });
      } catch (err) {
        console.error('Failed to create offer for viewer:', err);
      }
    };

    // Viewer: Handle offer from presenter -> Create answer
    const handleScreenOffer = async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
      let pc = viewerPcRef.current;
      if (!pc) {
        pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        viewerPcRef.current = pc;

        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            setRemoteStream(event.streams[0]);
            setIsViewing(true);
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('screen:ice_candidate', {
              to: data.from,
              candidate: event.candidate
            });
          }
        };
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('screen:answer', {
          to: data.from,
          answer
        });
      } catch (err) {
        console.error('Error handling screen offer:', err);
      }
    };

    // Presenter: Handle answer from viewer
    const handleScreenAnswer = async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      const pc = presenterPcsRef.current.get(data.from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (err) {
          console.error('Error setting remote description for viewer:', err);
        }
      }
    };

    // Both: Handle ICE candidate
    const handleScreenIceCandidate = async (data: { from: string; candidate: RTCIceCandidateInit }) => {
      // Check if we are presenter with this peer
      const presenterPc = presenterPcsRef.current.get(data.from);
      if (presenterPc) {
        try {
          await presenterPc.addIceCandidate(new RTCIceCandidate(data.candidate));
          return;
        } catch (e) {}
      }

      // Check if we are viewer
      if (viewerPcRef.current) {
        try {
          await viewerPcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {}
      }
    };

    socket.on('screen:state', handleScreenState);
    socket.on('screen:viewer_joined', handleViewerJoined);
    socket.on('screen:offer', handleScreenOffer);
    socket.on('screen:answer', handleScreenAnswer);
    socket.on('screen:ice_candidate', handleScreenIceCandidate);

    return () => {
      socket.off('screen:state', handleScreenState);
      socket.off('screen:viewer_joined', handleViewerJoined);
      socket.off('screen:offer', handleScreenOffer);
      socket.off('screen:answer', handleScreenAnswer);
      socket.off('screen:ice_candidate', handleScreenIceCandidate);
    };
  }, [socket, currentUserId, isSharing, stopSharing, onToast, cleanupViewerPc]);

  // Teardown on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      cleanupPresenterPcs();
      cleanupViewerPc();
    };
  }, [cleanupPresenterPcs, cleanupViewerPc]);

  return {
    isSharing,
    isViewing,
    isPresenter,
    localStream,
    remoteStream,
    activeShare,
    viewerCount,
    hasAudio,
    error,
    startSharing,
    stopSharing,
    joinStream,
    leaveStream
  };
};
