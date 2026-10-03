import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Swords,
  Users,
  Clock,
  Flame,
  Zap,
  ArrowLeft,
  Volume2,
  VolumeX,
  Play,
  Check,
  X,
  Trophy,
  Crown,
  UserCheck,
  RotateCcw
} from 'lucide-react';
import { useSocket } from '../../../context/SocketContext.js';
import { useStudy } from '../../../context/StudyContext.js';
import { ArithmeticQuestion, DuelInvite, DuelPeerProgress } from '../types.js';
import { generateArithmeticQuestion } from '../engines/mathEngine.js';
import { mathSounds } from '../engines/mathSoundEffects.js';
import { MathNumpad } from '../shared/MathNumpad.js';
import { ComboStreakBadge } from '../shared/ComboStreakBadge.js';

interface MultiplayerDuelArenaProps {
  onBackToHub: () => void;
}

export const MultiplayerDuelArena: React.FC<MultiplayerDuelArenaProps> = ({ onBackToHub }) => {
  const { socket, roomId, currentUser, peers } = useSocket();
  const { addXp, triggerCelebration } = useStudy();

  // Match state
  const [matchState, setMatchState] = useState<'lobby' | 'countdown' | 'playing' | 'gameover'>('lobby');
  const [countdown, setCountdown] = useState(3);
  const [activeDuelId, setActiveDuelId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<{ id: string; name: string; socketId: string; avatar?: string } | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<DuelInvite & { challengerSocketId: string } | null>(null);
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);

  // Gameplay state
  const [currentQ, setCurrentQ] = useState<ArithmeticQuestion | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [myScore, setMyScore] = useState(0);
  const [myStreak, setMyStreak] = useState(0);
  const [myMaxStreak, setMyMaxStreak] = useState(0);
  const [mySolvedCount, setMySolvedCount] = useState(0);
  const [myTimeLeft, setMyTimeLeft] = useState(60);

  // Opponent Live Progress
  const [opponentProgress, setOpponentProgress] = useState<DuelPeerProgress>({
    userId: '',
    name: 'Opponent',
    score: 0,
    streak: 0,
    questionIndex: 0,
    isFinished: false
  });

  const [opponentFinal, setOpponentFinal] = useState<{ finalScore: number; accuracy: number; highestStreak: number } | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [isMuted, setIsMuted] = useState(mathSounds.getMuted());

  const activeDuelIdRef = useRef(activeDuelId);
  activeDuelIdRef.current = activeDuelId;
  const opponentRef = useRef(opponent);
  opponentRef.current = opponent;

  // Sound toggle
  const toggleMute = () => {
    const next = !isMuted;
    mathSounds.setMuted(next);
    setIsMuted(next);
  };

  // Socket listeners for duel invites, accepts, starts, progress, and finish
  useEffect(() => {
    if (!socket) return;

    // Incoming challenge
    const handleDuelReceived = (data: any) => {
      // Don't show invite if from self
      if (data.senderId === currentUser?.id) return;
      mathSounds.playCorrect(2);
      setIncomingInvite({
        duelId: data.duelId,
        senderId: data.senderId,
        senderName: data.senderName,
        senderAvatar: data.senderAvatar,
        gameMode: data.gameMode,
        timeLimit: data.timeLimit,
        challengerSocketId: data.senderSocketId || data.socketId
      });
    };

    // Duel match confirmed to start
    const handleDuelStart = (data: any) => {
      const isSender = data.challengerSocketId === socket.id;
      const opp = isSender
        ? { id: data.acceptorId, name: data.acceptorName, socketId: data.acceptorSocketId, avatar: data.acceptorAvatar }
        : { id: data.senderId, name: data.senderName, socketId: data.challengerSocketId, avatar: data.senderAvatar };

      setOpponent(opp);
      setActiveDuelId(data.duelId);
      setIncomingInvite(null);
      setInviteSentTo(null);

      // Start 3s countdown
      setMatchState('countdown');
      setCountdown(3);
    };

    const handleDuelDeclined = () => {
      alert('The duel invitation was declined or expired.');
      setInviteSentTo(null);
    };

    // Live progress from opponent
    const handleOpponentProgress = (data: any) => {
      if (data.duelId === activeDuelIdRef.current) {
        setOpponentProgress({
          userId: data.userId,
          name: opponentRef.current?.name || 'Opponent',
          score: data.score,
          streak: data.streak,
          questionIndex: data.questionIndex,
          isFinished: false
        });
      }
    };

    // Opponent finished
    const handleOpponentFinished = (data: any) => {
      if (data.duelId === activeDuelIdRef.current) {
        setOpponentFinal({
          finalScore: data.finalScore,
          accuracy: data.accuracy,
          highestStreak: data.highestStreak
        });
      }
    };

    socket.on('math:duel_received', handleDuelReceived);
    socket.on('math:duel_start', handleDuelStart);
    socket.on('math:duel_declined', handleDuelDeclined);
    socket.on('math:duel_opponent_progress', handleOpponentProgress);
    socket.on('math:duel_opponent_finished', handleOpponentFinished);

    return () => {
      socket.off('math:duel_received', handleDuelReceived);
      socket.off('math:duel_start', handleDuelStart);
      socket.off('math:duel_declined', handleDuelDeclined);
      socket.off('math:duel_opponent_progress', handleOpponentProgress);
      socket.off('math:duel_opponent_finished', handleOpponentFinished);
    };
  }, [socket, currentUser?.id]);

  // Handle countdown 3 -> 2 -> 1 -> GO
  useEffect(() => {
    if (matchState !== 'countdown') return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        mathSounds.playTick();
        setCountdown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Launch match!
      setMyScore(0);
      setMyStreak(0);
      setMyMaxStreak(0);
      setMySolvedCount(0);
      setMyTimeLeft(60);
      setInputVal('');
      setOpponentProgress({
        userId: opponent?.id || '',
        name: opponent?.name || 'Opponent',
        score: 0,
        streak: 0,
        questionIndex: 0,
        isFinished: false
      });
      setOpponentFinal(null);
      setCurrentQ(generateArithmeticQuestion('mixed', 'medium'));
      setMatchState('playing');
    }
  }, [matchState, countdown, opponent]);

  // Send Invite to Peer
  const sendDuelInvite = (targetPeer: any) => {
    if (!socket || !currentUser) return;
    const duelId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setInviteSentTo(targetPeer.name || 'Peer');

    socket.emit('math:duel_invite', {
      targetSocketId: targetPeer.socketId,
      targetUserId: targetPeer.userId,
      roomId: roomId || 'STUDY-ROOM-ALPHA',
      duelId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      senderSocketId: socket.id,
      gameMode: 'blitz',
      timeLimit: 60
    });
  };

  // Broadcast open challenge to whole room
  const broadcastOpenDuel = () => {
    if (!socket || !currentUser) return;
    const duelId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setInviteSentTo('Room Buddies');

    socket.emit('math:duel_invite', {
      roomId: roomId || 'STUDY-ROOM-ALPHA',
      duelId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      senderSocketId: socket.id,
      gameMode: 'blitz',
      timeLimit: 60
    });
  };

  // Accept incoming challenge
  const acceptDuel = () => {
    if (!socket || !incomingInvite || !currentUser) return;

    socket.emit('math:duel_accept', {
      duelId: incomingInvite.duelId,
      challengerSocketId: incomingInvite.challengerSocketId,
      senderId: incomingInvite.senderId,
      senderName: incomingInvite.senderName,
      senderAvatar: incomingInvite.senderAvatar,
      acceptorId: currentUser.id,
      acceptorName: currentUser.name,
      acceptorAvatar: currentUser.avatar,
      acceptorSocketId: socket.id,
      roomId: roomId || 'STUDY-ROOM-ALPHA',
      seed: Date.now(),
      gameMode: incomingInvite.gameMode,
      timeLimit: incomingInvite.timeLimit
    });
  };

  // Decline incoming challenge
  const declineDuel = () => {
    if (!socket || !incomingInvite) return;
    socket.emit('math:duel_decline', {
      challengerSocketId: incomingInvite.challengerSocketId,
      duelId: incomingInvite.duelId
    });
    setIncomingInvite(null);
  };

  // Finish match logic
  const handleFinishMatch = useCallback(() => {
    setMatchState('gameover');
    if (!socket || !opponent) return;

    socket.emit('math:duel_finish', {
      opponentSocketId: opponent.socketId,
      duelId: activeDuelId,
      userId: currentUser?.id,
      finalScore: myScore,
      accuracy: 90,
      highestStreak: myMaxStreak
    });

    // Check winner
    const opponentScore = opponentFinal?.finalScore ?? opponentProgress.score;
    if (myScore > opponentScore) {
      mathSounds.playVictory();
      triggerCelebration();
      addXp(100, 'Won Speed Math 1v1 Room Duel');
    } else {
      addXp(40, 'Participated in Math Duel');
    }
  }, [socket, opponent, activeDuelId, currentUser?.id, myScore, myMaxStreak, opponentFinal, opponentProgress.score, triggerCelebration, addXp]);

  // Match 60s timer
  useEffect(() => {
    if (matchState !== 'playing') return;

    const interval = setInterval(() => {
      setMyTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleFinishMatch();
          return 0;
        }
        if (prev <= 10) mathSounds.playTick();
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [matchState, handleFinishMatch]);

  // Submit Answer in Duel
  const submitAnswer = useCallback(() => {
    if (!currentQ || inputVal.trim() === '') return;

    const userNum = parseInt(inputVal.trim(), 10);
    const isCorrect = userNum === currentQ.answer;

    let nextScore = myScore;
    let nextStreak = myStreak;
    let nextMax = myMaxStreak;
    const nextSolved = mySolvedCount + 1;
    setMySolvedCount(nextSolved);

    if (isCorrect) {
      nextStreak = myStreak + 1;
      setMyStreak(nextStreak);
      if (nextStreak > myMaxStreak) {
        nextMax = nextStreak;
        setMyMaxStreak(nextMax);
      }
      const points = 10 + (nextStreak >= 5 ? 15 : nextStreak >= 3 ? 8 : 0);
      nextScore = myScore + points;
      setMyScore(nextScore);
      setFeedback('correct');
      mathSounds.playCorrect(nextStreak);
    } else {
      setMyStreak(0);
      setFeedback('wrong');
      mathSounds.playWrong();
    }

    // Broadcast progress to opponent
    if (socket && opponent) {
      socket.emit('math:duel_progress', {
        opponentSocketId: opponent.socketId,
        duelId: activeDuelId,
        userId: currentUser?.id,
        score: nextScore,
        streak: nextStreak,
        questionIndex: nextSolved
      });
    }

    setTimeout(() => {
      setFeedback(null);
      setInputVal('');
      setCurrentQ(generateArithmeticQuestion('mixed', 'medium'));
    }, 180);
  }, [currentQ, inputVal, myScore, myStreak, myMaxStreak, mySolvedCount, socket, opponent, activeDuelId, currentUser?.id]);

  // Keyboard listener during duel
  useEffect(() => {
    if (matchState !== 'playing') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        mathSounds.playClick();
        setInputVal((prev) => (prev.length < 8 ? prev + e.key : prev));
      } else if (e.key === '-' || e.key === '_') {
        mathSounds.playClick();
        setInputVal((prev) => (prev === '' ? '-' : prev));
      } else if (e.key === 'Backspace') {
        mathSounds.playClick();
        setInputVal((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submitAnswer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [matchState, submitAnswer]);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 text-slate-100 animate-in fade-in duration-200">
      
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-xl">
        <button
          type="button"
          onClick={() => {
            if (matchState === 'playing' && window.confirm('Forfeit active duel?')) {
              setMatchState('lobby');
              onBackToHub();
            } else if (matchState !== 'playing') {
              onBackToHub();
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold border border-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Hub</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center text-white shadow-md">
            <Swords className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-sm sm:text-base text-white tracking-tight">
            Multiplayer Room 1v1 Math Duel
          </span>
        </div>

        <button
          type="button"
          onClick={toggleMute}
          className={`p-2 rounded-xl border transition-colors ${
            isMuted
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
          }`}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* INCOMING CHALLENGE POPUP BANNER */}
      {incomingInvite && matchState === 'lobby' && (
        <div className="p-4 bg-gradient-to-r from-rose-950/80 via-slate-900 to-indigo-950/80 border-2 border-rose-500 rounded-3xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-lg animate-bounce">
              <Swords className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">Live Duel Challenge!</span>
              <h4 className="text-base font-extrabold text-white">
                {incomingInvite.senderName} challenged you to a 60s Math Duel!
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={acceptDuel}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>Accept Duel</span>
            </button>
            <button
              type="button"
              onClick={declineDuel}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold text-xs border border-white/10 flex items-center justify-center gap-1.5 transition-colors"
            >
              <X className="w-4 h-4" />
              <span>Decline</span>
            </button>
          </div>
        </div>
      )}

      {/* LOBBY / PEER MATCHER */}
      {matchState === 'lobby' && (
        <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6">
          <div className="text-center space-y-1">
            <h3 className="text-xl font-black text-white">Challenge Co-Study Buddies</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Real-time 60-second synchronized calculation battle. Challenge any peer in your study room or broadcast an open lobby!
            </p>
          </div>

          {inviteSentTo && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-center text-xs text-amber-300 animate-pulse font-medium">
              ⚔️ Duel challenge sent to {inviteSentTo}! Waiting for them to accept...
            </div>
          )}

          {/* Peers in Room List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
              <span>Peers in Room ({peers.filter((p) => p.userId !== currentUser?.id).length})</span>
              <span>Room: {roomId || 'STUDY-ROOM-ALPHA'}</span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
              {peers.filter((p) => p.userId !== currentUser?.id).length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-950/60 border border-white/5 text-center text-xs text-slate-500">
                  <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  No other buddies are currently in this room.
                  <br />
                  Invite a friend to room <span className="font-mono text-cyan-400">{roomId || 'STUDY-ROOM-ALPHA'}</span> or test with another tab!
                </div>
              ) : (
                peers
                  .filter((p) => p.userId !== currentUser?.id)
                  .map((peer) => (
                    <div
                      key={peer.socketId}
                      className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 flex items-center justify-between gap-3 hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white text-sm">
                          {peer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span>{peer.name}</span>
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          </div>
                          <span className="text-[10px] text-slate-400">{peer.targetExam || 'Competitive Exam'}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => sendDuelInvite(peer)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-bold text-xs shadow-md shadow-rose-950/50 flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        <span>Challenge 1v1</span>
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Broadcast Challenge Button */}
          <button
            type="button"
            onClick={broadcastOpenDuel}
            className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 hover:text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Users className="w-4 h-4 text-cyan-400" />
            <span>Broadcast Open 1v1 Challenge to Entire Room</span>
          </button>
        </div>
      )}

      {/* COUNTDOWN 3-2-1 SCREEN */}
      {matchState === 'countdown' && (
        <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-12 shadow-2xl flex flex-col items-center justify-center gap-6 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-400">Match Starting</span>
          <h3 className="text-lg font-bold text-white">
            {currentUser?.name} <span className="text-slate-500">VS</span> {opponent?.name}
          </h3>
          <div className="text-7xl sm:text-9xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-b from-amber-400 to-rose-600 animate-ping">
            {countdown === 0 ? 'GO!' : countdown}
          </div>
          <span className="text-xs text-slate-400">Get your fingers ready!</span>
        </div>
      )}

      {/* ACTIVE PLAYING DUEL */}
      {matchState === 'playing' && currentQ && (
        <div className="flex flex-col gap-4">
          
          {/* Head-to-Head Scoreboard Bar */}
          <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-4 shadow-2xl flex flex-col gap-3">
            
            <div className="flex items-center justify-between text-xs">
              
              {/* Left Player (You) */}
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-600 flex items-center justify-center font-bold text-white text-xs">
                  YOU
                </div>
                <div>
                  <div className="font-extrabold text-sm text-cyan-400">{myScore} pts</div>
                  <span className="text-[10px] text-slate-400">{myStreak} streak</span>
                </div>
              </div>

              {/* Timer in Center */}
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase font-bold text-slate-500">Duel Clock</span>
                <span className={`text-xl font-black font-mono ${myTimeLeft <= 10 ? 'text-rose-400 animate-pulse' : 'text-white'}`}>
                  {myTimeLeft}s
                </span>
              </div>

              {/* Right Player (Opponent) */}
              <div className="flex items-center gap-2.5 text-right">
                <div>
                  <div className="font-extrabold text-sm text-rose-400">{opponentProgress.score} pts</div>
                  <span className="text-[10px] text-slate-400">{opponent?.name || 'Opponent'}</span>
                </div>
                <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center font-bold text-white text-xs">
                  OPP
                </div>
              </div>

            </div>

            {/* Split Progress Bar */}
            <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden flex">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-600 transition-all duration-300"
                style={{
                  width: `${
                    myScore + opponentProgress.score === 0
                      ? 50
                      : Math.max(5, Math.min(95, (myScore / (myScore + opponentProgress.score)) * 100))
                  }%`
                }}
              />
              <div
                className="h-full bg-gradient-to-r from-rose-600 to-amber-500 transition-all duration-300 flex-1"
              />
            </div>

          </div>

          {/* Question Stage Card */}
          <div
            className={`bg-slate-900/90 border rounded-3xl p-6 sm:p-10 shadow-2xl flex flex-col items-center justify-center gap-5 transition-all duration-150 ${
              feedback === 'correct'
                ? 'border-emerald-500 bg-emerald-950/20'
                : feedback === 'wrong'
                ? 'border-rose-500 bg-rose-950/20 animate-shake'
                : 'border-white/10'
            }`}
          >
            <div className="flex items-center gap-3 sm:gap-6 text-4xl sm:text-6xl font-black font-mono tracking-tight text-white select-none">
              <span>{currentQ.num1}</span>
              <span className="text-cyan-400">{currentQ.operation}</span>
              <span>{currentQ.num2}</span>
              <span className="text-slate-500">=</span>
            </div>

            <div className="w-full max-w-xs h-16 sm:h-20 rounded-2xl bg-slate-950/80 border-2 border-indigo-500/40 flex items-center justify-center text-3xl sm:text-4xl font-mono font-black text-white shadow-inner relative">
              <span>{inputVal || ''}</span>
              {!inputVal && <span className="text-slate-600 text-lg font-normal">Type answer...</span>}
              <div className="w-1 h-8 bg-cyan-400 ml-1 animate-pulse" />
            </div>
          </div>

          {/* Touch Numpad */}
          <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-4 shadow-2xl">
            <MathNumpad
              onDigit={(d) => setInputVal((prev) => (prev.length < 8 ? prev + d : prev))}
              onBackspace={() => setInputVal((prev) => prev.slice(0, -1))}
              onClear={() => setInputVal('')}
              onSubmit={submitAnswer}
              allowNegative
            />
          </div>

        </div>
      )}

      {/* GAMEOVER / SHOWDOWN WINNER MODAL */}
      {matchState === 'gameover' && (
        <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-6 animate-in zoom-in-95">
          {(() => {
            const oppScore = opponentFinal?.finalScore ?? opponentProgress.score;
            const isWinner = myScore > oppScore;
            const isTie = myScore === oppScore;

            return (
              <>
                <div
                  className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl ${
                    isWinner
                      ? 'bg-gradient-to-tr from-amber-400 to-yellow-600 text-white ring-4 ring-yellow-400/40 animate-bounce'
                      : isTie
                      ? 'bg-gradient-to-tr from-indigo-500 to-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isWinner ? <Crown className="w-10 h-10" /> : <Trophy className="w-10 h-10" />}
                </div>

                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-white">
                    {isWinner ? '🎉 VICTORY!' : isTie ? '🤝 DRAW MATCH!' : 'DEFEAT'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isWinner
                      ? `You defeated ${opponent?.name} by ${myScore - oppScore} points!`
                      : isTie
                      ? `Incredible game! Both players scored exactly ${myScore} points!`
                      : `${opponent?.name} won by ${oppScore - myScore} points. Keep training!`}
                  </p>
                </div>

                {/* Score Comparison Cards */}
                <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                  <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30">
                    <span className="text-[10px] uppercase font-bold text-cyan-300">Your Score</span>
                    <div className="text-3xl font-black text-white mt-1">{myScore}</div>
                    <span className="text-[10px] text-slate-400">{mySolvedCount} questions</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30">
                    <span className="text-[10px] uppercase font-bold text-rose-300">{opponent?.name || 'Opponent'}</span>
                    <div className="text-3xl font-black text-white mt-1">{oppScore}</div>
                    <span className="text-[10px] text-slate-400">{opponentProgress.questionIndex} questions</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full max-w-sm">
                  <button
                    type="button"
                    onClick={() => setMatchState('lobby')}
                    className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-bold text-xs shadow-lg transition-all"
                  >
                    Play Another Duel
                  </button>

                  <button
                    type="button"
                    onClick={onBackToHub}
                    className="px-5 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs border border-white/10 transition-colors"
                  >
                    Arena Hub
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
};
