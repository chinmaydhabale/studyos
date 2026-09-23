import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';

interface UseVoiceChatOptions {
  socket: Socket | null;
  roomId: string;
  userName: string;
  isVoiceUnlocked: boolean;
  isMicMuted: boolean;
  onSpeakingChange: (speaking: boolean) => void;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * Real-time mesh voice chat for a study room.
 *
 * Each participant keeps one RTCPeerConnection per peer. The socket that joins
 * last offers to everyone already present, which keeps negotiation one-directional
 * and avoids offer/answer glare in rooms with more than two students.
 */
export const useVoiceChat = ({
  socket,
  roomId,
  userName,
  isVoiceUnlocked,
  isMicMuted,
  onSpeakingChange
}: UseVoiceChatOptions): void => {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const activeRef = useRef(false);
  const speakingRef = useRef(false);

  const micMutedRef = useRef(isMicMuted);
  const userNameRef = useRef(userName);
  const roomIdRef = useRef(roomId);
  const speakingCallbackRef = useRef(onSpeakingChange);

  useEffect(() => { micMutedRef.current = isMicMuted; }, [isMicMuted]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { speakingCallbackRef.current = onSpeakingChange; }, [onSpeakingChange]);

  const emitVoiceState = (overrides?: { isMuted?: boolean; isSpeaking?: boolean }) => {
    if (!socket) return;
    const isMuted = overrides?.isMuted !== undefined ? overrides.isMuted : micMutedRef.current;
    const isSpeaking = overrides?.isSpeaking !== undefined ? overrides.isSpeaking : speakingRef.current;
    socket.emit('voice:state', {
      roomId: roomIdRef.current,
      userName: userNameRef.current,
      isMuted,
      isSpeaking
    });
  };

  const teardownPeer = (peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try { pc.close(); } catch (e) {}
      peersRef.current.delete(peerId);
    }
    const audio = audioElementsRef.current.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audio.pause();
      audioElementsRef.current.delete(peerId);
    }
    pendingCandidatesRef.current.delete(peerId);
  };

  const teardownAll = () => {
    Array.from(peersRef.current.keys()).forEach(teardownPeer);
    peersRef.current.clear();
    audioElementsRef.current.clear();
    pendingCandidatesRef.current.clear();
  };

  // Join / leave the voice channel when the user unlocks or locks it
  useEffect(() => {
    if (!socket || !isVoiceUnlocked || !roomId) return;

    let cancelled = false;
    activeRef.current = true;

    // A peer may offer while our microphone is still being acquired. Waiting
    // briefly guarantees the answer carries our audio track instead of being
    // receive-only for the rest of the call.
    const waitForLocalStream = (timeoutMs = 3000): Promise<MediaStream | null> => {
      if (localStreamRef.current) return Promise.resolve(localStreamRef.current);
      return new Promise(resolve => {
        const startedAt = Date.now();
        const timer = window.setInterval(() => {
          if (localStreamRef.current || cancelled || Date.now() - startedAt > timeoutMs) {
            window.clearInterval(timer);
            resolve(localStreamRef.current);
          }
        }, 100);
      });
    };

    const createPeerConnection = (peerId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      localStreamRef.current?.getTracks().forEach(track => {
        if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc:ice_candidate', {
            roomId: roomIdRef.current,
            to: peerId,
            candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
          });
        }
      };

      pc.ontrack = (event) => {
        let audio = audioElementsRef.current.get(peerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioElementsRef.current.set(peerId, audio);
        }
        audio.srcObject = event.streams[0];
        audio.play().catch(() => {});
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          teardownPeer(peerId);
        }
      };

      peersRef.current.set(peerId, pc);
      return pc;
    };

    const callPeer = async (peerId: string) => {
      if (peersRef.current.has(peerId)) return;
      try {
        await waitForLocalStream();
        if (cancelled) return;
        const pc = createPeerConnection(peerId);
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:offer', {
          roomId: roomIdRef.current,
          to: peerId,
          offer: pc.localDescription
        });
      } catch (err) {
        teardownPeer(peerId);
      }
    };

    const handlePeers = (data: { peers: Array<{ peerId: string; name: string }> }) => {
      (data.peers || []).forEach(peer => {
        if (peer.peerId !== socket.id) callPeer(peer.peerId);
      });
    };

    const handleOffer = async (data: { from: string; offer: RTCSessionDescriptionInit }) => {
      try {
        if (!peersRef.current.has(data.from)) {
          await waitForLocalStream();
          if (cancelled) return;
        }
        const pc = peersRef.current.get(data.from) || createPeerConnection(data.from);
        // Glare guard: if we already sent an offer, roll it back before accepting theirs
        if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-remote-offer') {
          await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        const pending = pendingCandidatesRef.current.get(data.from) || [];
        for (const candidate of pending) {
          try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
        }
        pendingCandidatesRef.current.delete(data.from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', {
          roomId: roomIdRef.current,
          to: data.from,
          answer: pc.localDescription
        });
      } catch (err) {
        teardownPeer(data.from);
      }
    };

    const handleAnswer = async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(data.from);
      if (!pc || pc.signalingState !== 'have-local-offer') return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (err) {
        teardownPeer(data.from);
      }
    };

    const handleIceCandidate = async (data: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(data.from);
      if (!pc || !pc.remoteDescription) {
        const list = pendingCandidatesRef.current.get(data.from) || [];
        list.push(data.candidate);
        pendingCandidatesRef.current.set(data.from, list);
        return;
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {}
    };

    const handlePeerLeft = (data: { peerId: string }) => teardownPeer(data.peerId);

    socket.on('voice:peers', handlePeers);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice_candidate', handleIceCandidate);
    socket.on('voice:peer_left', handlePeerLeft);

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let vadTimer: number | null = null;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        localStreamRef.current = stream;
        stream.getAudioTracks().forEach(track => {
          track.enabled = !micMutedRef.current;
        });

        socket.emit('voice:join', { roomId: roomIdRef.current, userName: userNameRef.current });
        emitVoiceState({ isSpeaking: false });

        // Lightweight voice activity detection drives the "speaking" indicator
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioCtx();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const levels = new Uint8Array(analyser.frequencyBinCount);
        const poll = () => {
          if (cancelled || !analyser) return;
          analyser.getByteFrequencyData(levels);
          let sum = 0;
          for (let i = 0; i < levels.length; i++) sum += levels[i];
          const average = sum / levels.length;
          const speaking = !micMutedRef.current && average > 12;
          if (speaking !== speakingRef.current) {
            speakingRef.current = speaking;
            speakingCallbackRef.current(speaking);
            emitVoiceState({ isSpeaking: speaking });
          }
          vadTimer = window.setTimeout(poll, 400);
        };
        vadTimer = window.setTimeout(poll, 400);
      } catch (err) {
        // Microphone permission denied or unavailable — voice stays silent but chat still works
        activeRef.current = false;
        speakingCallbackRef.current(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      activeRef.current = false;
      if (vadTimer !== null) window.clearTimeout(vadTimer);
      if (analyser) analyser.disconnect();
      if (audioCtx) audioCtx.close().catch(() => {});

      socket.off('voice:peers', handlePeers);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice_candidate', handleIceCandidate);
      socket.off('voice:peer_left', handlePeerLeft);

      socket.emit('voice:leave', { roomId: roomIdRef.current });
      teardownAll();

      localStreamRef.current?.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;

      if (speakingRef.current) {
        speakingRef.current = false;
        speakingCallbackRef.current(false);
      }
    };
  }, [socket, isVoiceUnlocked, roomId]);

  // Mute / unmute the outgoing audio track and tell the room
  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(track => {
      track.enabled = !isMicMuted;
    });
    if (isMicMuted && speakingRef.current) {
      speakingRef.current = false;
      speakingCallbackRef.current(false);
    }
    emitVoiceState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMicMuted]);
};
