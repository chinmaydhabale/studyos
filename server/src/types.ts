export interface UserProfile {
  id: string;
  username?: string;
  name: string;
  avatar: string;
  targetExam: string; // e.g. 'RRB PO', 'IBPS PO', 'SBI PO', 'SSC CGL', etc.
  college: string;
  city: string;
  country: string;
  xp: number;
  level: number;
  coins: number;
  streak: number;
  bestStreak: number;
  totalStudyHours: number;
  focusScore: number;
  accuracy: number;
  tasksCompleted: number;
  tasksMissed: number;
  badges: string[];
  status: string;
  isMuted: boolean;
  isSpeaking: boolean;
  currentActivity?: string; // e.g. '📐 Quantitative Aptitude (Quant)'
  activityCategory?: 'study' | 'break' | 'personal';
  activityStartTime?: number | null; // epoch timestamp
}

export interface ActivitySession {
  id: string;
  userId: string;
  userName: string;
  activityName: string;
  category: 'study' | 'break' | 'personal';
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
}

export interface VideoSyncState {
  roomId: string;
  videoUrl: string;
  videoId: string;
  mediaType?: 'youtube' | 'movie';
  title?: string;
  duration?: number;
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  lastUpdated: number;
  updatedBy: string;
  isHostLocked?: boolean;
}

export interface MovieRecord {
  id: string;
  roomId: string;
  title: string;
  filename: string;
  originalName: string;
  fileSize: number;
  fileSizeFormatted: string;
  mimeType: string;
  durationSeconds?: number;
  durationFormatted?: string;
  uploadedBy: string;
  uploaderId: string;
  createdAt: string;
  streamUrl: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  videoTimestamp?: number;
  pdfPage?: number;
  pdfDocTitle?: string;
  isAiDoubt?: boolean;
  aiResponse?: string;
  createdAt: string;
}

export interface WhiteboardElement {
  id: string;
  type: 'pen' | 'rect' | 'circle' | 'line' | 'arrow' | 'triangle' | 'equation' | 'flowchart' | 'mindmap' | 'sticky';
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color: string;
  strokeWidth: number;
  fill?: string;
  text?: string;
  equationLatex?: string;
  flowchartType?: 'process' | 'decision' | 'start-end';
  nodeColor?: string;
  createdBy: string;
  createdAt: number;
}

export interface SharedNote {
  id: string;
  roomId: string;
  title: string;
  content: string;
  lastModifiedBy: string;
  lastModifiedAt: string;
}

export interface StudyTask {
  id: string;
  userId?: string;
  title: string;
  subject: string;
  durationMinutes: number;
  targetDate: string;
  completed: boolean;
  isAiGenerated: boolean;
  scheduledTime?: string;
  // Who actually received the completion reward — the XP is always taken back
  // from this user on undo, so toggling can never mint XP for anyone else.
  rewardedUserId?: string;
}

export interface CalendarDayRecord {
  date: string;
  hoursStudied: number;
  deepFocusHours: number;
  subjects: string[];
  tasksDone: number;
  tasksPlanned: number;
  status: 'strong' | 'moderate' | 'weak' | 'missed';
  userId?: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  subject: string;
  masteryLevel: 'learning' | 'reviewing' | 'mastered';
  lastReviewed?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  subject: string;
  topic: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  avatar: string;
  college: string;
  city: string;
  country: string;
  studyHours: number;
  focusScore: number;
  consistency: number;
  completedTasks: number;
  xp: number;
  accuracy: number;
  compositeScore: number;
  tier: 'Diamond' | 'Platinum' | 'Gold' | 'Silver' | 'Bronze';
}

export interface StudyGroup {
  roomId: string;
  name: string;
  description?: string;
  targetExam: string;
  creatorId: string;
  creatorName: string;
  memberCount: number;
  voicePassword?: string;
  isPrivate: boolean;
  createdAt: string;
}

export interface StudyDocument {
  id: string;
  roomId: string;
  title: string;
  subject: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  telegramFileId: string;
  telegramMessageId: number;
  uploaderId: string;
  uploaderName: string;
  uploadedAt: string;
  downloadCount: number;
  description?: string;
}

export interface TelegramConfig {
  key: string;
  botToken: string;
  channelId: string;
  channelTitle?: string;
  isConfigured: boolean;
  lastSyncAt: string;
}

export interface LiveScreenShareState {
  roomId: string;
  presenterSocketId: string;
  presenterId: string;
  presenterName: string;
  presenterAvatar: string;
  streamType: 'mock' | 'screen' | 'notes';
  title: string;
  platformName?: string;
  isActive: boolean;
  startedAt: number;
}

export interface MockTestRecord {
  id: string;
  userId: string;
  userName: string;
  platform: string; // e.g. 'Guidely', 'Testbook', 'Oliveboard', 'PracticeMock', 'Adda247', 'Smartkeeda', 'Other'
  testTitle: string; // e.g. 'RRB PO Prelims Mock #5'
  score: number;
  totalMarks: number;
  accuracy: number;
  percentile?: number;
  attemptedQuestions?: number;
  totalQuestions?: number;
  timeTakenMinutes?: number;
  createdAt: string;
}

