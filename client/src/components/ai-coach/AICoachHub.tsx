import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Mic,
  FileText,
  MessageSquare,
  Layers,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  SkipBack,
  Copy,
  Check,
  Upload,
  BookOpen,
  HelpCircle,
  AlertTriangle,
  CheckSquare,
  Square,
  Volume2,
  VolumeX,
  Radio,
  FileUp,
  Headphones,
  ChevronRight,
  ChevronLeft,
  Send,
  ArrowRight,
  Clock,
  Calendar,
  Zap,
  Award,
  Flame,
  Languages,
  Download,
  RefreshCw,
  Edit3,
  X,
  ExternalLink,
  Brain,
  FileCheck,
  Sliders,
  CheckCircle2,
  ListChecks,
  Target,
  Compass
} from 'lucide-react';
import { API_BASE_URL } from '../../config.js';
import { useSocket } from '../../context/SocketContext.js';
import { useStudy } from '../../context/StudyContext.js';
import { Flashcard, QuizQuestion } from '../../types.js';
import { extractFullDocumentText } from '../../lib/pdfjs.js';
import { FormattedAiMessage } from '../common/FormattedAiMessage.js';

// Types for AI Coach Features
type PodcastSpeaker = 'Aarav' | 'Ananya' | 'Alex' | 'Sam';

interface AudioTurn {
  speaker: PodcastSpeaker;
  text: string;
  emotion?: string;
}

interface AudioDiscussion {
  id?: string;
  docTitle: string;
  title: string;
  tagline: string;
  durationEstimate: string;
  language?: 'hinglish' | 'hindi' | 'english';
  turns: AudioTurn[];
  source?: 'gemini' | 'fallback';
  telegramFileId?: string;
  telegramMessageId?: number;
  createdAt?: string;
}

type AudioLanguage = 'hinglish' | 'hindi' | 'english';
type HostVoiceStyle = 'gemini38' | 'notebooklm' | 'indian';
type TtsModelId =
  | 'gemini-3.8-flash-tts'
  | 'gemini-3.8-flash-lite-tts'
  | 'gemini-3.1-flash-tts-preview'
  | 'gemini-2.5-flash-preview-tts'
  | 'gemini-2.5-pro-preview-tts'
  | 'edge-indian';

const TTS_MODEL_OPTIONS: Array<{ id: TtsModelId; label: string; shortLabel: string }> = [
  {
    id: 'gemini-3.8-flash-tts',
    label: 'Gemini 3.8 Flash TTS (Default • Auto Fallback)',
    shortLabel: 'Gemini 3.8 Flash TTS'
  },
  {
    id: 'gemini-3.8-flash-lite-tts',
    label: 'Gemini 3.8 Flash-Lite TTS (+ Auto Fallback)',
    shortLabel: 'Gemini 3.8 Lite TTS'
  },
  {
    id: 'gemini-3.1-flash-tts-preview',
    label: 'Gemini 3.1 Flash TTS (+ Auto Fallback)',
    shortLabel: 'Gemini 3.1 Flash TTS'
  },
  {
    id: 'gemini-2.5-flash-preview-tts',
    label: 'Gemini 2.5 Flash TTS (+ Auto Fallback)',
    shortLabel: 'Gemini 2.5 Flash TTS'
  },
  {
    id: 'gemini-2.5-pro-preview-tts',
    label: 'Gemini 2.5 Pro TTS (+ Auto Fallback)',
    shortLabel: 'Gemini 2.5 Pro TTS'
  },
  {
    id: 'edge-indian',
    label: 'Indian Neural TTS (Unlimited Free • No Quota)',
    shortLabel: 'Indian Neural'
  }
];

const isMaleHost = (speaker?: string): boolean => {
  const s = (speaker || '').toLowerCase();
  return s !== 'ananya' && s !== 'sam' && s !== 'female';
};

const displaySpeakerName = (speaker?: string): 'Aarav' | 'Ananya' =>
  isMaleHost(speaker) ? 'Aarav' : 'Ananya';

const getHostVoice = (style: HostVoiceStyle, language: AudioLanguage, speaker: PodcastSpeaker): string => {
  const male = isMaleHost(speaker);
  if (style === 'gemini38') {
    return male ? 'Puck' : 'Aoede';
  }
  if (style === 'notebooklm') {
    return male ? 'Charon' : 'Kore';
  }
  if (language !== 'english') {
    return male ? 'hi-IN-MadhurNeural' : 'hi-IN-SwaraNeural';
  }
  return male ? 'en-IN-PrabhatNeural' : 'en-IN-NeerjaNeural';
};

const getHostVoiceLabel = (style: HostVoiceStyle, _language: AudioLanguage, speaker: PodcastSpeaker): string => {
  const male = isMaleHost(speaker);
  if (style === 'gemini38') {
    return male ? 'Gemini Studio • Puck' : 'Gemini Studio • Aoede';
  }
  if (style === 'notebooklm') {
    return male ? 'Gemini Studio • Charon' : 'Gemini Studio • Kore';
  }
  return male ? 'Madhur Neural' : 'Swara Neural';
};

const FIRST_BATCH_TURN_SIZE = 4;
const NEXT_BATCH_TURN_SIZE = 5;

const getBatchRangeForTurn = (turnIndex: number, totalTurns: number): { batchStart: number; batchEnd: number } => {
  if (turnIndex < FIRST_BATCH_TURN_SIZE) {
    return {
      batchStart: 0,
      batchEnd: Math.min(totalTurns - 1, FIRST_BATCH_TURN_SIZE - 1)
    };
  }
  const offset = turnIndex - FIRST_BATCH_TURN_SIZE;
  const batchIdx = Math.floor(offset / NEXT_BATCH_TURN_SIZE);
  const batchStart = FIRST_BATCH_TURN_SIZE + batchIdx * NEXT_BATCH_TURN_SIZE;
  const batchEnd = Math.min(totalTurns - 1, batchStart + NEXT_BATCH_TURN_SIZE - 1);
  return { batchStart, batchEnd };
};

const PODCAST_ACTIVE_STORAGE_KEY = 'studyos_active_podcast_v1';
const PODCAST_LIBRARY_STORAGE_KEY = 'studyos_saved_podcasts_v1';
const STUDYOS_ACTIVE_CONTEXT_STORAGE_KEY = 'studyos_active_context_v1';
const PODCAST_PENDING_JOB_STORAGE_KEY = 'studyos_pending_podcast_job_v1';
const PODCAST_TURN_PROGRESS_STORAGE_KEY = 'studyos_podcast_turn_progress_v1';

interface PendingPodcastJob {
  docTitle: string;
  language: AudioLanguage;
  voiceStyle: HostVoiceStyle;
  ttsModel: TtsModelId;
  sourceText: string;
  userId?: string;
  autoPlay?: boolean;
  forceRegenerate?: boolean;
  startedAt: number;
}

interface ServerPodcastJob {
  jobId: string;
  userId?: string;
  docTitle: string;
  language: AudioLanguage;
  status: 'generating_script' | 'synthesizing_audio' | 'completed' | 'failed';
  progressText: string;
  segmentsCompleted: number;
  totalSegments: number;
  turnsGenerated: number;
  startedAt: string;
  updatedAt: string;
  podcastId?: string;
  podcast?: AudioDiscussion;
}

interface ConceptCheatSheet {
  docTitle: string;
  executiveSummary: string;
  keyConcepts: Array<{ term: string; definition: string; examSignificance: string }>;
  faq: Array<{ question: string; answer: string }>;
  pitfallsAndTraps: string[];
  revisionChecklist: string[];
  source?: 'gemini' | 'fallback';
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  suggestedFollowUps?: string[];
  timestamp: string;
}

interface StudyPlanResult {
  message: string;
  task: any;
  suggestedSchedule: Array<{ time: string; activity: string; duration: string }>;
}

// Curated High-Yield Exam Topics
const PRESET_TOPICS = [
  {
    title: 'RBI Monetary Policy & Inflation Framework',
    domain: 'Banking & Economics',
    content: `The Reserve Bank of India (RBI) is the central bank responsible for monetary stability in India.
Monetary Policy Committee (MPC):
Formed under Section 45ZB of the amended RBI Act, 1934, the MPC consists of 6 members: 3 from RBI (including Governor as ex-officio chairperson) and 3 external government appointees.
Mandate: Flexible inflation target of 4% Consumer Price Index (CPI) with a tolerance band of +/- 2% (2% to 6%).
Key Policy Instruments:
1. Policy Repo Rate: Rate at which RBI lends short-term liquidity to commercial banks against government securities. Increasing repo cools inflation.
2. Standing Deposit Facility (SDF): Absorbs liquidity without requiring collateral securities, priced slightly below repo.
3. Cash Reserve Ratio (CRR): Percentage of Net Demand and Time Liabilities (NDTL) banks must park with RBI as liquid cash (no interest paid).
4. Statutory Liquidity Ratio (SLR): Mandatory percentage of NDTL banks must invest in approved securities (chiefly central/state govt bonds), gold, or cash before extending credit.
5. Marginal Standing Facility (MSF): Emergency borrowing window for scheduled banks to borrow overnight funds up to a specified percentage of NDTL at higher rate.`
  },
  {
    title: 'Thermodynamics & Heat Engines',
    domain: 'Physics / General Science',
    content: `Thermodynamics deals with heat, work, temperature, and energy transformations.
First Law of Thermodynamics:
ΔU = Q - W (Internal energy change equals heat supplied minus work done by system). Energy cannot be created or destroyed. In cyclic processes, ΔU = 0, so Q_net = W_net.
Second Law of Thermodynamics:
- Kelvin-Planck statement: Impossible to construct an engine operating in a cycle that absorbs heat from a single reservoir and produces 100% equivalent work.
- Clausius statement: Heat cannot spontaneously transfer from cooler to warmer body without external work.
- Entropy (S) of an isolated system always increases in irreversible processes (ΔS ≥ 0).
Carnot Cycle & Efficiency:
Theoretical upper ceiling for any heat engine operating between two thermal reservoirs:
η = 1 - (T_C / T_H) = (T_H - T_C) / T_H.
Critical Exam Rule: Both reservoir temperatures T_C and T_H must strictly be in Kelvin (K = °C + 273.15). Real engines have lower efficiency due to friction and heat loss.`
  },
  {
    title: 'Indian Constitution: Fundamental Rights',
    domain: 'Indian Polity & Law',
    content: `Part III of the Constitution of India (Articles 12 to 35) guarantees Fundamental Rights (Magna Carta of India).
Key Categories:
1. Right to Equality (Articles 14–18): Article 14 (Equality before law), Article 15 (No discrimination), Article 16 (Equal opportunity in public employment), Article 17 (Abolition of Untouchability), Article 18 (Abolition of titles).
2. Right to Freedom (Articles 19–22): Article 19 (6 fundamental freedoms), Article 21 (Protection of life & personal liberty, includes privacy & dignity), Article 21A (Right to free education for 6-14 years).
3. Right against Exploitation (Articles 23–24): Prohibition of trafficking, forced labor, and child labor in hazardous factories.
4. Right to Freedom of Religion (Articles 25–28).
5. Cultural & Educational Rights (Articles 29–30).
6. Right to Constitutional Remedies (Article 32): Dr. Ambedkar called Article 32 the "Heart and Soul of the Constitution". Empowers approaching Supreme Court directly via writs: Habeas Corpus, Mandamus, Prohibition, Certiorari, and Quo-Warranto.`
  },
  {
    title: 'Quant Speed Math & Data Interpretation',
    domain: 'Banking Aptitude',
    content: `Speed Math principles for RRB PO, IBPS, and SBI:
1. Fractional Equivalents: 1/6 = 16.66%, 1/7 = 14.28%, 1/8 = 12.5%, 1/9 = 11.11%, 1/11 = 9.09%, 1/12 = 8.33%, 1/14 = 7.14%. Use these for fast percentage calculations.
2. Vedic Multiplication Shortcuts: Base method for numbers close to 100, and cross-multiplication for 2-digit numbers (ab × cd).
3. Approximation Rules: Round off decimals only at final stage when options are distant. If options differ by < 2%, calculate accurately.
4. Quadratic Equations Sign Rule:
- ax² + bx + c = 0 → Roots are (- , -)
- ax² - bx + c = 0 → Roots are (+ , +)
- ax² + bx - c = 0 → Roots are (- , +)
- ax² - bx - c = 0 → Roots are (+ , -)
If constant terms in both equations are negative (-c), relationship is always "Cannot be Determined (CND)".`
  },
  {
    title: 'Reasoning: Syllogism & Critical Logic',
    domain: 'Banking Reasoning',
    content: `Mastering Syllogisms for Competitive Exams:
1. Standard Venn Diagram Representations:
- All A are B: A is completely inside B.
- Some A are B: Overlapping circle.
- No A is B: Separate circles with cross-line.
- Some A are not B: Specific portion of A outside B.
2. "Only a few" vs "Only":
- "Only a few A are B" means BOTH "Some A are B" AND "Some A are NOT B" are 100% definitely true.
- "Only A are B" translates to "All B are A", and B can NEVER intersect with any other entity.
3. Possibility Rules:
- If a direct negative relation exists, no positive possibility can follow.
- If no direct relation is mentioned, ANY possibility without violating given premises is TRUE.
- Complimentary Pairs (Either / Or): (Some + No) or (All + Some Not) with same subject and predicate.`
  }
];

type WorkspaceTab = 'audio' | 'chat' | 'flashcards' | 'quiz' | 'cheatsheet' | 'planner';

interface AICoachHubProps {
  initialPrompt?: string;
  initialSource?: { title: string; text: string } | null;
  onClearInitialPrompt?: () => void;
  onNavigateToCalendar?: () => void;
}

export const AICoachHub: React.FC<AICoachHubProps> = ({ initialPrompt = '', initialSource, onClearInitialPrompt, onNavigateToCalendar }) => {
  const { addToast, currentUser } = useSocket();
  const { addXp } = useStudy();

  // Active Study Context State (persisted across reloads & tab closes)
  const storedContext = (() => {
    try {
      const raw = localStorage.getItem(STUDYOS_ACTIVE_CONTEXT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.topic === 'string' && typeof parsed.material === 'string' && parsed.material.trim()) {
          return parsed as { topic: string; domain: string; material: string };
        }
      }
    } catch {}
    return null;
  })();

  const initialTopic = initialSource?.title || storedContext?.topic || PRESET_TOPICS[0].title;
  const initialDomain = initialSource ? 'PDF Document' : (storedContext?.domain || PRESET_TOPICS[0].domain);
  const initialMaterial = initialSource?.text || storedContext?.material || PRESET_TOPICS[0].content;
  const [activeTopic, setActiveTopic] = useState(initialTopic);
  const [activeDomain, setActiveDomain] = useState(initialDomain);
  const [sourceMaterial, setSourceMaterial] = useState(initialMaterial);
  const [sourceMaterialTopic, setSourceMaterialTopic] = useState(initialTopic);

  // Sync active study context to localStorage so reload/tab-close never wipes uploaded PDFs or notes
  useEffect(() => {
    try {
      if (activeTopic && sourceMaterial && sourceMaterialTopic === activeTopic) {
        localStorage.setItem(
          STUDYOS_ACTIVE_CONTEXT_STORAGE_KEY,
          JSON.stringify({
            topic: activeTopic,
            domain: activeDomain,
            material: sourceMaterial.slice(0, 120000)
          })
        );
      }
    } catch {}
  }, [activeTopic, activeDomain, sourceMaterial, sourceMaterialTopic]);

  // Apply external initialSource when passed from PDF Reader
  useEffect(() => {
    if (initialSource?.title && initialSource?.text) {
      setActiveTopic(initialSource.title);
      setActiveDomain('PDF Document');
      setSourceMaterial(initialSource.text);
      setSourceMaterialTopic(initialSource.title);
    }
  }, [initialSource?.title, initialSource?.text]);

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('audio');

  // Modals
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [tempEditorTitle, setTempEditorTitle] = useState(activeTopic);
  const [tempEditorText, setTempEditorText] = useState(initialMaterial);
  const [isUploading, setIsUploading] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);

  // Loading States & Background Job State
  const [hasPendingBackgroundJob, setHasPendingBackgroundJob] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(PODCAST_PENDING_JOB_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [loadingAction, setLoadingAction] = useState<string | null>(() => {
    try {
      if (localStorage.getItem(PODCAST_PENDING_JOB_STORAGE_KEY)) {
        return 'Generating Podcast in Background...';
      }
    } catch {}
    return null;
  });

  // ----------------------------------------------------
  // 1. Audio Deep Dive State & Persistent Podcast Library
  // ----------------------------------------------------
  const [savedPodcasts, setSavedPodcasts] = useState<AudioDiscussion[]>(() => {
    try {
      const raw = localStorage.getItem(PODCAST_LIBRARY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [audioDiscussion, setAudioDiscussion] = useState<AudioDiscussion | null>(() => {
    try {
      const raw = localStorage.getItem(PODCAST_ACTIVE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.turns) && parsed.turns.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  const [audioLang, setAudioLang] = useState<AudioLanguage>(() => {
    try {
      const raw = localStorage.getItem(PODCAST_ACTIVE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.language === 'hindi' || parsed?.language === 'english' || parsed?.language === 'hinglish') {
          return parsed.language;
        }
      }
    } catch {}
    return 'hinglish';
  });

  const [hostVoiceStyle, setHostVoiceStyle] = useState<HostVoiceStyle>('gemini38');
  const [ttsModel, setTtsModel] = useState<TtsModelId>('gemini-3.8-flash-tts');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number>(() => {
    try {
      const rawPod = localStorage.getItem(PODCAST_ACTIVE_STORAGE_KEY);
      const rawProg = localStorage.getItem(PODCAST_TURN_PROGRESS_STORAGE_KEY);
      if (rawPod && rawProg) {
        const pod = JSON.parse(rawPod);
        const progMap = JSON.parse(rawProg);
        const key = pod?.id || `${pod?.docTitle}|${pod?.language || 'hinglish'}`;
        const savedTurn = progMap?.[key];
        if (typeof savedTurn === 'number' && savedTurn >= 0 && Array.isArray(pod?.turns) && savedTurn < pod.turns.length) {
          return savedTurn;
        }
      }
    } catch {}
    return 0;
  });
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [audioBuffering, setAudioBuffering] = useState(false);
  const [isTelegramSaving, setIsTelegramSaving] = useState(false);
  const [isDownloadingAudio, setIsDownloadingAudio] = useState(false);

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const podcastGenerationIdRef = useRef(0);
  const podcastGenerationAbortRef = useRef<AbortController | null>(null);
  const isClientPostInFlightRef = useRef(false);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const playbackTokenRef = useRef(0);
  const MAX_AUDIO_CACHE_ENTRIES = 24;

  const cacheAudioUrl = (key: string, url: string) => {
    const previous = audioCacheRef.current.get(key);
    if (previous) {
      URL.revokeObjectURL(url);
      audioCacheRef.current.delete(key);
      audioCacheRef.current.set(key, previous);
      return;
    }

    audioCacheRef.current.set(key, url);
    while (audioCacheRef.current.size > MAX_AUDIO_CACHE_ENTRIES) {
      const oldestKey = audioCacheRef.current.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldestUrl = audioCacheRef.current.get(oldestKey);
      if (oldestUrl && activeAudioRef.current?.src === oldestUrl) {
        audioCacheRef.current.delete(oldestKey);
        audioCacheRef.current.set(oldestKey, oldestUrl);
        continue;
      }
      audioCacheRef.current.delete(oldestKey);
      if (oldestUrl) URL.revokeObjectURL(oldestUrl);
    }
  };

  // Sync active podcast and current playback turn to localStorage so page reload or closing laptop never resets progress
  useEffect(() => {
    try {
      if (audioDiscussion && Array.isArray(audioDiscussion.turns) && audioDiscussion.turns.length > 0) {
        localStorage.setItem(PODCAST_ACTIVE_STORAGE_KEY, JSON.stringify(audioDiscussion));
      } else {
        localStorage.removeItem(PODCAST_ACTIVE_STORAGE_KEY);
      }
    } catch {}
  }, [audioDiscussion]);

  useEffect(() => {
    try {
      if (audioDiscussion && Array.isArray(audioDiscussion.turns) && audioDiscussion.turns.length > 0) {
        const key = audioDiscussion.id || `${audioDiscussion.docTitle}|${audioDiscussion.language || 'hinglish'}`;
        const rawProg = localStorage.getItem(PODCAST_TURN_PROGRESS_STORAGE_KEY);
        const progMap = rawProg ? JSON.parse(rawProg) : {};
        progMap[key] = currentTurnIndex;
        localStorage.setItem(PODCAST_TURN_PROGRESS_STORAGE_KEY, JSON.stringify(progMap));
      }
    } catch {}
  }, [currentTurnIndex, audioDiscussion?.id, audioDiscussion?.docTitle, audioDiscussion?.language]);

  useEffect(() => {
    if (audioDiscussion?.docTitle && audioDiscussion.docTitle !== activeTopic) {
      setActiveTopic(audioDiscussion.docTitle);
    }
  }, [audioDiscussion?.docTitle, audioDiscussion?.id]);

  // Sync podcast library to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(PODCAST_LIBRARY_STORAGE_KEY, JSON.stringify(savedPodcasts.slice(0, 30)));
    } catch {}
  }, [savedPodcasts]);

  const upsertPodcastToLibrary = useCallback((podcast: AudioDiscussion) => {
    setSavedPodcasts(prev => {
      const key = podcast.id || `${podcast.docTitle}|${podcast.language || 'hinglish'}|${podcast.title}`;
      const filtered = prev.filter(
        p => (p.id || `${p.docTitle}|${p.language || 'hinglish'}|${p.title}`) !== key
      );
      return [podcast, ...filtered].slice(0, 30);
    });
  }, []);

  const cancelPodcastGeneration = () => {
    podcastGenerationIdRef.current += 1;
    podcastGenerationAbortRef.current?.abort();
    podcastGenerationAbortRef.current = null;
    isClientPostInFlightRef.current = false;
    try {
      localStorage.removeItem(PODCAST_PENDING_JOB_STORAGE_KEY);
    } catch {}
    setHasPendingBackgroundJob(false);
    setLoadingAction(previous =>
      previous &&
      (previous.includes('Podcast') ||
        previous.includes('Audio') ||
        previous.includes('Background') ||
        previous.includes('Synthesizing') ||
        previous.includes('Writing'))
        ? null
        : previous
    );
  };

  const clearAudioCache = () => {
    audioCacheRef.current.forEach(url => URL.revokeObjectURL(url));
    audioCacheRef.current.clear();
  };

  useEffect(() => () => {
    if (activeAudioRef.current) activeAudioRef.current.pause();
    audioCacheRef.current.forEach(url => URL.revokeObjectURL(url));
    audioCacheRef.current.clear();
  }, []);

  // ----------------------------------------------------
  // 2. Chat / Doubt Assistant State
  // ----------------------------------------------------
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content: `Namaste! Main aapka personal AI Study Coach hoon. Aapke active study material ("${activeTopic}") par koi bhi doubt ya concept poochhiye — main simple Hinglish aur exam tricks ke sath step-by-step explain karunga!`,
      timestamp: 'Just now',
      suggestedFollowUps: [
        'Explain the core concept in simple terms',
        'What are the most common exam traps?',
        'Give me a mnemonic to remember this',
        'Derive key formula step-by-step'
      ]
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const handledInitialPromptRef = useRef<string | null>(null);

  // ----------------------------------------------------
  // 3. Flashcards State
  // ----------------------------------------------------
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  // ----------------------------------------------------
  // 4. Practice Quiz State
  // ----------------------------------------------------
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [submittedQuiz, setSubmittedQuiz] = useState(false);

  // ----------------------------------------------------
  // 5. Concept Cheat Sheet State
  // ----------------------------------------------------
  const [cheatSheet, setCheatSheet] = useState<ConceptCheatSheet | null>(null);
  const [checkedChecklist, setCheckedChecklist] = useState<Record<number, boolean>>({});

  // ----------------------------------------------------
  // 6. Smart Study Planner State
  // ----------------------------------------------------
  const [studyPlan, setStudyPlan] = useState<StudyPlanResult | null>(null);
  const [planGoal, setPlanGoal] = useState('');

  // Auto-scroll chat scoped to container, never scrolling the outer window
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chatMessages, chatLoading]);

  // Handle external initialPrompt (from Video or PDF Reader)
  useEffect(() => {
    const prompt = initialPrompt.trim();
    if (!prompt || handledInitialPromptRef.current === prompt) return;
    handledInitialPromptRef.current = prompt;
    setActiveTab('chat');
    handleSendChatMessage(prompt);
    onClearInitialPrompt?.();
  }, [initialPrompt]);

  // Switch Preset Topic
  const makeTopicWelcome = (title: string): ChatMessageItem[] => ([
    {
      id: `welcome-${Date.now()}`,
      role: 'assistant',
      content: `Active topic changed to: "${title}". Ab is topic se judha koi bhi doubt poochhiye, podcast suniye, ya flashcards practice kijiye!`,
      timestamp: 'Just now',
      suggestedFollowUps: [
        'Explain the core concept in simple terms',
        'What are the most common exam traps?',
        'Give me a mnemonic to remember this',
        'Derive key formula step-by-step'
      ]
    }
  ]);

  // Clear every piece of generated content so a new source never shows stale
  // artifacts (study plan, flashcards, quiz, cheat sheet, chat), while restoring
  // any previously saved podcast for the newly selected topic without aborting
  // any background podcast generation.
  const resetGeneratedContent = (title: string) => {
    clearAudioCache();
    const matchingSaved =
      savedPodcasts.find(p => p.docTitle === title && (p.language || 'hinglish') === audioLang) ||
      savedPodcasts.find(p => p.docTitle === title) ||
      null;
    setAudioDiscussion(matchingSaved);
    setCurrentTurnIndex(0);
    setFlashcards([]);
    setQuizQuestions([]);
    setCheatSheet(null);
    setStudyPlan(null);
    setChatMessages(makeTopicWelcome(title));
  };

  // Close the Edit Notes modal on Escape.
  useEffect(() => {
    if (!isEditorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsEditorOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEditorOpen]);

  const handleSelectPreset = (preset: typeof PRESET_TOPICS[0]) => {
    stopAudio();
    setActiveTopic(preset.title);
    setActiveDomain(preset.domain);
    setSourceMaterial(preset.content);
    setSourceMaterialTopic(preset.title);
    // Reset generated content for new topic
    resetGeneratedContent(preset.title);
    addToast('Study Topic Updated', `Switched to ${preset.title}`, 'info');
  };

  // Upload PDF Handler (Full Multi-Page Extraction + Gemini 3.8 Flash Vision OCR for Scanned PDFs)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    stopAudio();
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        const cleanTitle = file.name.replace(/\.pdf$/i, '').replace(/_/g, ' ');
        setLoadingAction('Reading PDF pages...');
        const extracted = await extractFullDocumentText({
          file,
          docTitle: cleanTitle,
          apiBaseUrl: API_BASE_URL,
          maxPages: 60,
          maxChars: 120000,
          onProgress: (status) => setLoadingAction(status)
        });

        if (!extracted.text.trim()) {
          addToast(
            'Empty PDF',
            'Could not extract readable text from this PDF. Try pasting notes or using a clearer scan.',
            'alert'
          );
          return;
        }

        setActiveTopic(cleanTitle);
        setActiveDomain(extracted.usedOcr ? 'Scanned PDF (Free Local OCR)' : 'Uploaded PDF Document');
        setSourceMaterial(extracted.text);
        setSourceMaterialTopic(cleanTitle);
        setTempEditorTitle(cleanTitle);
        setTempEditorText(extracted.text);
        resetGeneratedContent(cleanTitle);
        addToast(
          extracted.usedOcr ? 'Scanned PDF Read (Free Local OCR • 0 AI Quota) ✨' : 'PDF Processed Completely!',
          `Extracted ${extracted.text.length.toLocaleString()} chars across ${extracted.pagesRead}/${extracted.totalPages} pages of "${cleanTitle}". Ready for Podcast & Study Tools!`,
          'success'
        );
      } else {
        const text = await file.text();
        const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
        setActiveTopic(cleanTitle);
        setActiveDomain('Custom File');
        setSourceMaterial(text);
        setSourceMaterialTopic(cleanTitle);
        setTempEditorTitle(cleanTitle);
        setTempEditorText(text);
        resetGeneratedContent(cleanTitle);
        addToast('File Loaded!', `Loaded contents of "${cleanTitle}"`, 'success');
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      addToast('Upload Error', 'Failed to read document text. Please try another file.', 'alert');
    } finally {
      setIsUploading(false);
      setLoadingAction(prev => (prev && (prev.includes('PDF') || prev.includes('page') || prev.includes('OCR')) ? null : prev));
      if (e.target) e.target.value = '';
    }
  };

  // Save Custom Note / Paste Material
  const handleSaveCustomNotes = () => {
    if (!tempEditorText.trim()) return;
    stopAudio();
    const noteTitle = tempEditorTitle.trim() || 'Custom Study Notes';
    setActiveTopic(noteTitle);
    setActiveDomain('Student Notes');
    setSourceMaterial(tempEditorText.trim());
    setSourceMaterialTopic(noteTitle);
    resetGeneratedContent(noteTitle);
    setIsEditorOpen(false);
    addToast('Notes Saved!', 'AI Coach is now analyzing your custom study material.', 'success');
  };

  // =========================================================================
  // 1. Audio Deep Dive Engine (Gemini 3.8 TTS + Neural + Background Recovery)
  // =========================================================================

  const autoPlayAfterGenerateRef = useRef(false);

  const generateAudioDiscussion = async (
    requestedLanguage: AudioLanguage = audioLang,
    autoPlay = false,
    resumeJob?: PendingPodcastJob,
    forceRegenerate = false
  ) => {
    if (!resumeJob && sourceMaterialTopic !== activeTopic) {
      addToast('Study Material Needed', 'Load the source notes for this episode before generating another language.', 'warning');
      return;
    }

    // If not explicitly regenerating, check if a valid Gemini podcast already exists locally for this topic & language (0 API requests!)
    if (!resumeJob && !forceRegenerate) {
      const existingLocal = savedPodcasts.find(
        p =>
          p.docTitle?.trim().toLowerCase() === activeTopic.trim().toLowerCase() &&
          (p.language || 'hinglish') === requestedLanguage &&
          p.source !== 'fallback' &&
          Array.isArray(p.turns) &&
          p.turns.length >= 4
      );
      if (existingLocal) {
        setAudioDiscussion(existingLocal);
        if (autoPlay) {
          autoPlayAfterGenerateRef.current = true;
        }
        return;
      }
    }

    podcastGenerationIdRef.current += 1;
    podcastGenerationAbortRef.current?.abort();
    const requestId = podcastGenerationIdRef.current;
    const controller = new AbortController();
    podcastGenerationAbortRef.current = controller;
    isClientPostInFlightRef.current = true;

    const jobPayload: PendingPodcastJob = resumeJob || {
      docTitle: activeTopic,
      language: requestedLanguage,
      voiceStyle: hostVoiceStyle,
      ttsModel,
      sourceText: sourceMaterial.slice(0, 120000),
      userId: currentUser?.id,
      autoPlay,
      forceRegenerate,
      startedAt: Date.now()
    };

    try {
      localStorage.setItem(PODCAST_PENDING_JOB_STORAGE_KEY, JSON.stringify(jobPayload));
    } catch {}
    setHasPendingBackgroundJob(true);
    autoPlayAfterGenerateRef.current = Boolean(jobPayload.autoPlay);
    setLoadingAction('Generating Audio Discussion (Background Safe)...');
    if (!resumeJob) {
      stopAudio();
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/notebook/audio-overview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          docTitle: jobPayload.docTitle,
          sourceText: jobPayload.sourceText,
          language: jobPayload.language,
          userId: jobPayload.userId || currentUser?.id,
          voiceStyle: jobPayload.voiceStyle,
          ttsModel: jobPayload.ttsModel,
          forceRegenerate: Boolean(jobPayload.forceRegenerate)
        })
      });
      if (!res.ok) throw new Error('Audio generation failed');
      const data: AudioDiscussion = await res.json();
      if (requestId !== podcastGenerationIdRef.current) return;
      if (!Array.isArray(data.turns) || data.turns.length === 0) {
        throw new Error('Audio generation returned an empty script');
      }

      isClientPostInFlightRef.current = false;
      podcastGenerationAbortRef.current = null;
      try {
        localStorage.removeItem(PODCAST_PENDING_JOB_STORAGE_KEY);
      } catch {}
      setHasPendingBackgroundJob(false);
      setLoadingAction(null);

      const enriched: AudioDiscussion = {
        ...data,
        docTitle: data.docTitle || jobPayload.docTitle,
        language: data.language || jobPayload.language,
        createdAt: data.createdAt || new Date().toISOString()
      };
      setAudioDiscussion(enriched);
      upsertPodcastToLibrary(enriched);
      setCurrentTurnIndex(0);
      if (enriched.source === 'fallback') {
        addToast('Notes-based fallback ready', 'AI script generation was unavailable; this recap uses excerpts from your source notes.', 'warning');
      } else {
        addToast('Podcast Generated & Saved! 🎧', `Aarav & Ananya created a ${enriched.turns.length}-turn deep dive.`, 'success');
      }
    } catch (err: any) {
      isClientPostInFlightRef.current = false;
      if (controller.signal.aborted || requestId !== podcastGenerationIdRef.current) return;
      console.warn('Podcast generation request interrupted — continuing in background sync mode:', err);
      // Do NOT clear PODCAST_PENDING_JOB_STORAGE_KEY! The server continues generating in the background
      // (or we will auto-resume from the exact saved segment checkpoint as soon as internet reconnects).
      setHasPendingBackgroundJob(true);
      setLoadingAction('Background Mode: Creating Podcast on Server (Auto-syncing)...');
      addToast(
        'Background Mode Active 🔄',
        'Internet disconnected or page switched — your podcast is being created on the server (0 extra API calls) and will appear automatically when ready!',
        'info'
      );
    }
  };

  // Persistent Background Sync & Auto-Recovery (survives laptop sleep/close, internet drops, page reloads & tab switches without restarting from Phase 0)
  useEffect(() => {
    let cancelled = false;

    const syncPodcastsAndBackgroundJobs = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }

      let pendingJob: PendingPodcastJob | null = null;
      try {
        const raw = localStorage.getItem(PODCAST_PENDING_JOB_STORAGE_KEY);
        if (raw) {
          pendingJob = JSON.parse(raw) as PendingPodcastJob;
        }
      } catch {}

      try {
        const query = currentUser?.id ? `?userId=${encodeURIComponent(currentUser.id)}` : '';
        const res = await fetch(`${API_BASE_URL}/api/ai/podcasts${query}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;

        const serverList: AudioDiscussion[] = Array.isArray(data?.podcasts) ? data.podcasts : [];
        const activeJobs: ServerPodcastJob[] = Array.isArray(data?.activeJobs) ? data.activeJobs : [];

        if (serverList.length > 0) {
          setSavedPodcasts(prev => {
            const mergedMap = new Map<string, AudioDiscussion>();
            for (const p of [...serverList, ...prev]) {
              if (!p || !Array.isArray(p.turns) || p.turns.length === 0) continue;
              const k = p.id || `${p.docTitle}|${p.language || 'hinglish'}|${p.title}`;
              if (!mergedMap.has(k)) mergedMap.set(k, p);
            }
            return Array.from(mergedMap.values()).slice(0, 30);
          });

          setAudioDiscussion(prev => {
            if (prev && Array.isArray(prev.turns) && prev.turns.length > 0) {
              // If the server has an updated version of the same podcast (e.g. more segments completed), upgrade it in place!
              const updatedOnServer = serverList.find(
                p =>
                  (p.id && p.id === prev.id) ||
                  (p.docTitle?.trim().toLowerCase() === prev.docTitle?.trim().toLowerCase() &&
                    (p.language || 'hinglish') === (prev.language || 'hinglish') &&
                    Array.isArray(p.turns) &&
                    p.turns.length > prev.turns.length)
              );
              return updatedOnServer || prev;
            }
            const matching = serverList.find(
              p => p.docTitle?.trim().toLowerCase() === activeTopic.trim().toLowerCase()
            );
            return matching || serverList[0];
          });
        }

        // Check if there is an active in-progress job on the server
        const normalizedPendingTitle = pendingJob?.docTitle?.trim().toLowerCase();
        const runningJob = activeJobs.find(
          j =>
            (j.status === 'generating_script' || j.status === 'synthesizing_audio') &&
            (!pendingJob ||
              (j.docTitle?.trim().toLowerCase() === normalizedPendingTitle && j.language === pendingJob.language))
        );

        if (runningJob) {
          setHasPendingBackgroundJob(true);
          setLoadingAction(runningJob.progressText || 'Generating Podcast in Background...');
          // If the running job has already completed Segment 1 (progressive checkpoint), surface it immediately!
          if (runningJob.podcast && Array.isArray(runningJob.podcast.turns) && runningJob.podcast.turns.length >= 4) {
            setAudioDiscussion(runningJob.podcast);
            upsertPodcastToLibrary(runningJob.podcast);
          }
          return;
        }

        // Check if our pending background job has completed on the server
        if (pendingJob) {
          const completedJobMatch = activeJobs.find(
            j =>
              j.status === 'completed' &&
              j.podcast &&
              j.docTitle?.trim().toLowerCase() === normalizedPendingTitle &&
              j.language === pendingJob!.language
          )?.podcast;

          const libraryMatch = serverList.find(p => {
            if (p.docTitle?.trim().toLowerCase() !== normalizedPendingTitle) return false;
            if ((p.language || 'hinglish') !== pendingJob!.language) return false;
            if (!Array.isArray(p.turns) || p.turns.length < 4) return false;
            return p.source !== 'fallback';
          });

          const finishedPodcast = completedJobMatch || libraryMatch;
          if (finishedPodcast && Array.isArray(finishedPodcast.turns) && finishedPodcast.turns.length > 0) {
            try {
              localStorage.removeItem(PODCAST_PENDING_JOB_STORAGE_KEY);
            } catch {}
            podcastGenerationAbortRef.current?.abort();
            podcastGenerationAbortRef.current = null;
            isClientPostInFlightRef.current = false;
            setHasPendingBackgroundJob(false);
            setLoadingAction(prev =>
              prev &&
              (prev.includes('Podcast') ||
                prev.includes('Audio') ||
                prev.includes('Background') ||
                prev.includes('Synthesizing') ||
                prev.includes('Writing') ||
                prev.includes('Resumed'))
                ? null
                : prev
            );

            setAudioDiscussion(finishedPodcast);
            upsertPodcastToLibrary(finishedPodcast);
            if (pendingJob.autoPlay) {
              autoPlayAfterGenerateRef.current = true;
            }
            addToast(
              'Background Podcast Ready! 🎧',
              `"${finishedPodcast.title}" (${finishedPodcast.turns.length} turns) finished in the background and is ready to play!`,
              'success'
            );
            return;
          }

          // If no running job and no finished podcast on the server, and our client POST is not currently in flight:
          // Wait at least 8 seconds after startedAt before re-sending so a quick page reload never races with the server.
          // Even when called, the server reuses any completed segment checkpoints from disk (0 wasted API requests!).
          const ageMs = Date.now() - (pendingJob.startedAt || 0);
          if (ageMs > 6 * 60 * 60 * 1000) {
            try {
              localStorage.removeItem(PODCAST_PENDING_JOB_STORAGE_KEY);
            } catch {}
            setHasPendingBackgroundJob(false);
            setLoadingAction(null);
          } else if (!isClientPostInFlightRef.current && pendingJob.sourceText && ageMs >= 8000) {
            void generateAudioDiscussion(
              pendingJob.language,
              Boolean(pendingJob.autoPlay),
              { ...pendingJob, forceRegenerate: false },
              false
            );
          }
        } else {
          setHasPendingBackgroundJob(false);
          setLoadingAction(prev =>
            prev &&
            (prev.includes('Podcast') ||
              prev.includes('Audio Discussion') ||
              prev.includes('Background') ||
              prev.includes('Synthesizing') ||
              prev.includes('Writing') ||
              prev.includes('Resumed'))
              ? null
              : prev
          );
        }
      } catch {
        // Offline or transient network error — keep polling silently until back online
      }
    };

    void syncPodcastsAndBackgroundJobs();

    const intervalId = hasPendingBackgroundJob
      ? window.setInterval(() => {
          void syncPodcastsAndBackgroundJobs();
        }, 3500)
      : undefined;

    const handleOnlineOrFocus = () => {
      void syncPodcastsAndBackgroundJobs();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncPodcastsAndBackgroundJobs();
      }
    };

    window.addEventListener('online', handleOnlineOrFocus);
    window.addEventListener('focus', handleOnlineOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnlineOrFocus);
      window.removeEventListener('focus', handleOnlineOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser?.id, hasPendingBackgroundJob]);

  const handleAudioLanguageChange = (language: AudioLanguage) => {
    if (language === audioLang) return;
    const shouldRegenerate = Boolean(audioDiscussion) || Boolean(hasPendingBackgroundJob);
    stopAudio();
    clearAudioCache();
    setAudioLang(language);
    const matchingSaved =
      savedPodcasts.find(p => p.docTitle === activeTopic && (p.language || 'hinglish') === language) || null;
    setAudioDiscussion(matchingSaved);
    setCurrentTurnIndex(0);
    if (!matchingSaved && shouldRegenerate) {
      if (sourceMaterialTopic === activeTopic) {
        void generateAudioDiscussion(language);
      } else {
        addToast('Study Material Needed', 'Load the source notes for this episode before generating another language.', 'warning');
      }
    }
  };

  const handleSelectSavedPodcast = (podcast: AudioDiscussion) => {
    stopAudio();
    clearAudioCache();
    setAudioDiscussion(podcast);
    setCurrentTurnIndex(0);
    if (podcast.docTitle) {
      setActiveTopic(podcast.docTitle);
    }
    if (podcast.language === 'hinglish' || podcast.language === 'hindi' || podcast.language === 'english') {
      setAudioLang(podcast.language);
    }
    addToast('Podcast Loaded', `Loaded "${podcast.title}"`, 'info');
  };

  const handleDeleteSavedPodcast = async (podcast: AudioDiscussion, e: React.MouseEvent) => {
    e.stopPropagation();
    const targetKey = podcast.id || `${podcast.docTitle}|${podcast.language || 'hinglish'}|${podcast.title}`;
    setSavedPodcasts(prev => {
      const remaining = prev.filter(
        p => (p.id || `${p.docTitle}|${p.language || 'hinglish'}|${p.title}`) !== targetKey
      );
      if (
        audioDiscussion &&
        (audioDiscussion.id || `${audioDiscussion.docTitle}|${audioDiscussion.language || 'hinglish'}|${audioDiscussion.title}`) === targetKey
      ) {
        stopAudio();
        const nextPodcast = remaining[0] || null;
        setAudioDiscussion(nextPodcast);
        if (!nextPodcast) {
          try {
            localStorage.removeItem(PODCAST_ACTIVE_STORAGE_KEY);
          } catch {}
        }
      }
      return remaining;
    });

    if (podcast.id) {
      try {
        const query = currentUser?.id ? `?userId=${encodeURIComponent(currentUser.id)}` : '';
        await fetch(`${API_BASE_URL}/api/ai/podcasts/${encodeURIComponent(podcast.id)}${query}`, {
          method: 'DELETE'
        });
      } catch {}
    }
    addToast('Podcast Removed', 'Removed episode from saved library.', 'info');
  };

  const handleDownloadFullPodcast = async () => {
    if (!audioDiscussion || isDownloadingAudio) return;
    setIsDownloadingAudio(true);
    addToast('Synthesizing Full Episode...', 'Merging Aarav & Ananya voices with Gemini 3.8 TTS...', 'info');
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/podcasts/episode-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          podcastId: audioDiscussion.id,
          turns: audioDiscussion.turns,
          language: audioLang,
          voiceStyle: hostVoiceStyle,
          ttsModel
        })
      });
      if (!res.ok) throw new Error('Failed to synthesize episode');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const contentType = (res.headers.get('content-type') || blob.type).toLowerCase();
      const extension = contentType.includes('wav') ? 'wav' : contentType.includes('mpeg') ? 'mp3' : 'audio';
      const a = document.createElement('a');
      const safeName = (audioDiscussion.title || activeTopic || 'studyos-podcast')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .slice(0, 60);
      a.href = url;
      a.download = `${safeName}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      addToast('Download Complete! 🎧', `Full studio ${extension.toUpperCase()} podcast downloaded to your device.`, 'success');
    } catch (err: any) {
      console.error('Download podcast error:', err);
      addToast('Download Failed', 'Could not synthesize full episode audio.', 'alert');
    } finally {
      setIsDownloadingAudio(false);
    }
  };

  const handleBackupPodcastToTelegram = async () => {
    if (!audioDiscussion || isTelegramSaving) return;
    if (!currentUser?.id) {
      addToast('Login Required', 'Please sign in and connect your Telegram Study Channel first.', 'warning');
      return;
    }
    setIsTelegramSaving(true);
    addToast('Uploading to Telegram Cloud...', 'Synthesizing full episode & uploading to your Telegram channel...', 'info');
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/podcasts/save-telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          podcastId: audioDiscussion.id,
          docTitle: audioDiscussion.docTitle || activeTopic,
          title: audioDiscussion.title,
          tagline: audioDiscussion.tagline,
          language: audioLang,
          voiceStyle: hostVoiceStyle,
          ttsModel,
          turns: audioDiscussion.turns
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Telegram upload failed');
      }
      const updated: AudioDiscussion = {
        ...audioDiscussion,
        id: data.podcastId || audioDiscussion.id,
        telegramFileId: data.telegramFileId,
        telegramMessageId: data.telegramMessageId
      };
      setAudioDiscussion(updated);
      upsertPodcastToLibrary(updated);
      addToast('Saved to Telegram Cloud! ☁️', 'Full podcast episode uploaded to your Telegram Study Channel.', 'success');
    } catch (err: any) {
      console.error('Telegram podcast backup error:', err);
      addToast('Telegram Backup Failed', err.message || 'Make sure your Telegram Channel is connected in Vault.', 'alert');
    } finally {
      setIsTelegramSaving(false);
    }
  };

  const stopAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    // Invalidate any in-flight playTurn so it won't start audio after we stop.
    playbackTokenRef.current += 1;
    setIsPlaying(false);
    setAudioBuffering(false);
  };

  const scrollToTurnInTranscript = (turnIdx: number) => {
    setTimeout(() => {
      const turnEl = document.getElementById(`turn-${turnIdx}`);
      if (turnEl && transcriptContainerRef.current) {
        const container = transcriptContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const turnRect = turnEl.getBoundingClientRect();
        const offsetTop = turnRect.top - containerRect.top + container.scrollTop;
        container.scrollTo({
          top: Math.max(0, offsetTop - 20),
          behavior: 'smooth'
        });
      }
    }, 50);
  };

  const batchInFlightRef = useRef<Map<string, Promise<string | null>>>(new Map());

  const playTurn = useCallback(async (index: number) => {
    if (!audioDiscussion || !audioDiscussion.turns || index >= audioDiscussion.turns.length) {
      stopAudio();
      return;
    }

    stopAudio();
    // stopAudio() bumped the token; claim this playback attempt.
    const myToken = playbackTokenRef.current;
    setCurrentTurnIndex(index);
    setIsPlaying(true);
    setAudioBuffering(true);
    scrollToTurnInTranscript(index);

    const turn = audioDiscussion.turns[index];

    const fetchBatchBlobUrl = (bStart: number, bEnd: number): Promise<string | null> => {
      const bTurns = audioDiscussion.turns.slice(bStart, bEnd + 1);
      const bSig = bTurns.map(t => `${t.speaker}:${t.text}`).join('|');
      const podcastKey = audioDiscussion.id || `${audioDiscussion.docTitle}|${audioDiscussion.title}`;
      const bKey = `multibatch|${podcastKey}|${ttsModel}|${hostVoiceStyle}|${audioLang}|${bStart}-${bEnd}|${bSig}`;

      const cached = audioCacheRef.current.get(bKey);
      if (cached) return Promise.resolve(cached);

      const existingPromise = batchInFlightRef.current.get(bKey);
      if (existingPromise) return existingPromise;

      const reqPromise = fetch(`${API_BASE_URL}/api/ai/podcasts/episode-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          podcastId: audioDiscussion.id,
          turns: bTurns,
          language: audioLang,
          voiceStyle: hostVoiceStyle,
          ttsModel
        })
      })
        .then(async res => {
          if (!res.ok) return null;
          const engine = (res.headers.get('X-TTS-Engine') || '').toLowerCase();
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          // Only cache permanently under the Gemini batch key if Gemini synthesized it (not a temporary Edge fallback)
          if (!engine.startsWith('edge-')) {
            cacheAudioUrl(bKey, url);
          }
          return url;
        })
        .catch(err => {
          console.warn('Multi-speaker batch TTS failed:', err);
          return null;
        })
        .finally(() => {
          batchInFlightRef.current.delete(bKey);
        });

      batchInFlightRef.current.set(bKey, reqPromise);
      return reqPromise;
    };

    // 1. Primary Studio Multi-Speaker Progressive Batch Player (4-5 turns per batch = ~1.5K tokens, fast 10-18s synthesis)
    const isBatchMode = hostVoiceStyle !== 'indian' && ttsModel !== 'edge-indian' && audioDiscussion.turns.length > 1;
    if (isBatchMode) {
      const { batchStart, batchEnd } = getBatchRangeForTurn(index, audioDiscussion.turns.length);
      const batchTurns = audioDiscussion.turns.slice(batchStart, batchEnd + 1);

      if (batchTurns.length > 1) {
        const batchBlobUrl = await fetchBatchBlobUrl(batchStart, batchEnd);

        if (myToken !== playbackTokenRef.current) return;

        if (batchBlobUrl) {
          setAudioBuffering(false);

          // Compute character-weighted timestamp boundaries for each turn in the batch
          const lengths = batchTurns.map(t => Math.max(12, t.text.trim().length));
          const totalChars = lengths.reduce((sum, n) => sum + n, 0) || 1;
          let cumulative = 0;
          const turnBounds = lengths.map((len, offset) => {
            const startRatio = cumulative / totalChars;
            cumulative += len;
            const endRatio = cumulative / totalChars;
            return { turnIdx: batchStart + offset, startRatio, endRatio };
          });

          const audio = new Audio(batchBlobUrl);
          activeAudioRef.current = audio;
          audio.playbackRate = playbackRate;

          if (index > batchStart) {
            const targetBound = turnBounds.find(b => b.turnIdx === index);
            if (targetBound) {
              const seekToTarget = () => {
                if (Number.isFinite(audio.duration) && audio.duration > 0) {
                  audio.currentTime = Math.min(audio.duration - 0.1, targetBound.startRatio * audio.duration);
                }
              };
              if (audio.readyState >= 1) seekToTarget();
              else audio.addEventListener('loadedmetadata', seekToTarget, { once: true });
            }
          }

          let activeSyncedTurn = index;
          let preloadedNextBatch = false;
          audio.ontimeupdate = () => {
            if (myToken !== playbackTokenRef.current) return;
            if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
            const ratio = audio.currentTime / audio.duration;
            const matched =
              turnBounds.find(b => ratio >= b.startRatio && ratio <= b.endRatio) ||
              turnBounds[turnBounds.length - 1];
            if (matched && matched.turnIdx !== activeSyncedTurn) {
              activeSyncedTurn = matched.turnIdx;
              setCurrentTurnIndex(matched.turnIdx);
              scrollToTurnInTranscript(matched.turnIdx);
            }

            // Lazy preload the next 5-turn batch after 25s of listening (or <=15s remaining)
            if (
              !preloadedNextBatch &&
              (audio.currentTime >= 25 || (audio.duration > 12 && audio.duration - audio.currentTime <= 15))
            ) {
              preloadedNextBatch = true;
              const nextTurnIdx = batchEnd + 1;
              if (nextTurnIdx < audioDiscussion.turns.length) {
                const nextRange = getBatchRangeForTurn(nextTurnIdx, audioDiscussion.turns.length);
                void fetchBatchBlobUrl(nextRange.batchStart, nextRange.batchEnd);
              }
            }
          };

          audio.onended = () => {
            if (myToken === playbackTokenRef.current) {
              playTurn(batchEnd + 1);
            }
          };

          audio.onerror = () => {
            if (myToken === playbackTokenRef.current) fallbackWebSpeech(turn, index, myToken);
          };

          audio.play().catch(() => {
            if (myToken === playbackTokenRef.current) fallbackWebSpeech(turn, index, myToken);
          });

          return;
        }
      }
    }

    // 2. Single-turn Neural TTS endpoint (for 'indian' voice style, or Indian Neural fallback if batch failed)
    const fallbackSingleModel = isBatchMode ? 'edge-indian' : ttsModel;
    const currentVoice = getHostVoice(isBatchMode ? 'indian' : hostVoiceStyle, audioLang, turn.speaker);
    const cacheKey = `${fallbackSingleModel}|${currentVoice}|${audioLang}|${turn.text}`;
    let blobUrl = audioCacheRef.current.get(cacheKey);

    if (!blobUrl) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/ai/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: turn.text,
            speaker: turn.speaker,
            language: audioLang,
            voice: currentVoice,
            ttsModel: fallbackSingleModel
          })
        });

        if (res.ok) {
          const blob = await res.blob();
          if (myToken !== playbackTokenRef.current) return;
          blobUrl = URL.createObjectURL(blob);
          cacheAudioUrl(cacheKey, blobUrl);
        }
      } catch (err) {
        console.warn('Neural TTS failed, falling back to Web Speech:', err);
      }
    }

    // Bail out if the user paused/started another turn while we were buffering.
    if (myToken !== playbackTokenRef.current) return;

    setAudioBuffering(false);

    if (blobUrl) {
      const audio = new Audio(blobUrl);
      activeAudioRef.current = audio;
      audio.playbackRate = playbackRate;
      audio.onended = () => {
        if (myToken === playbackTokenRef.current) playTurn(index + 1);
      };
      audio.onerror = () => {
        if (myToken === playbackTokenRef.current) fallbackWebSpeech(turn, index, myToken);
      };
      audio.play().catch(() => {
        if (myToken === playbackTokenRef.current) fallbackWebSpeech(turn, index, myToken);
      });

      // Preload next turn in background (using Indian Neural voice so it consumes 0 Gemini quota)
      if (index + 1 < audioDiscussion.turns.length) {
        const nextTurn = audioDiscussion.turns[index + 1];
        const nextVoice = getHostVoice(isBatchMode ? 'indian' : hostVoiceStyle, audioLang, nextTurn.speaker);
        const nextKey = `${fallbackSingleModel}|${nextVoice}|${audioLang}|${nextTurn.text}`;
        if (!audioCacheRef.current.has(nextKey)) {
          fetch(`${API_BASE_URL}/api/ai/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: nextTurn.text,
              speaker: nextTurn.speaker,
              language: audioLang,
              voice: nextVoice,
              ttsModel: fallbackSingleModel
            })
          })
            .then(r => (r.ok ? r.blob() : null))
            .then(b => {
              if (b && myToken === playbackTokenRef.current) {
                cacheAudioUrl(nextKey, URL.createObjectURL(b));
              }
            })
            .catch(() => {});
        }
      }
    } else {
      // Fallback to Web Speech API
      fallbackWebSpeech(turn, index, myToken);
    }
  }, [audioDiscussion, audioLang, hostVoiceStyle, ttsModel, playbackRate]);

  useEffect(() => {
    if (autoPlayAfterGenerateRef.current && audioDiscussion && audioDiscussion.turns?.length > 0) {
      autoPlayAfterGenerateRef.current = false;
      void playTurn(0);
    }
  }, [audioDiscussion, playTurn]);

  const fallbackWebSpeech = (turn: AudioTurn, index: number, playbackToken: number) => {
    if (!('speechSynthesis' in window)) {
      if (playbackToken === playbackTokenRef.current) setIsPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(turn.text);
    utterance.rate = playbackRate;
    utterance.pitch = isMaleHost(turn.speaker) ? 1.0 : 1.15;
    utterance.lang = audioLang === 'hindi' ? 'hi-IN' : audioLang === 'hinglish' ? 'hi-IN' : 'en-IN';

    utterance.onend = () => {
      if (playbackToken === playbackTokenRef.current) playTurn(index + 1);
    };
    utterance.onerror = () => {
      if (playbackToken === playbackTokenRef.current) setIsPlaying(false);
    };
    window.speechSynthesis.speak(utterance);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      if (!audioDiscussion) {
        void generateAudioDiscussion(audioLang, true);
      } else {
        void playTurn(currentTurnIndex);
      }
    }
  };

  // =========================================================================
  // 2. Doubt Solver & Chat Assistant
  // =========================================================================

  const handleSendChatMessage = async (overridePrompt?: string) => {
    const textToSend = overridePrompt || chatInput;
    if (!textToSend.trim() || chatLoading) return;

    const userMsg: ChatMessageItem = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMsg]);
    if (!overridePrompt) setChatInput('');
    setChatLoading(true);

    try {
      // Gather last 20 conversation turns for rich multi-turn context referencing
      const conversationHistory = chatMessages
        .filter(m => m.id !== 'welcome-msg' && !m.id.startsWith('err-'))
        .slice(-20)
        .map(m => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          text: m.content
        }));

      const res = await fetch(`${API_BASE_URL}/api/ai/notebook/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docTitle: activeTopic,
          sourceText: sourceMaterial,
          question: textToSend.trim(),
          history: conversationHistory
        })
      });

      if (!res.ok) throw new Error('Failed to solve doubt');
      const data = await res.json();

      const assistantMsg: ChatMessageItem = {
        id: `reply-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'Concept explained.',
        citations: data.citations || [],
        suggestedFollowUps: data.suggestedFollowUps || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Chat error:', err);
      setChatMessages(prev => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Maaf kijiye, doubt process karne me thodi problem aayi. Please dobara try karein.',
          timestamp: 'Just now'
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // =========================================================================
  // 3. Flashcards Engine
  // =========================================================================

  const generateFlashcards = async () => {
    setLoadingAction('Generating Flashcards...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: activeTopic,
          count: 8
        })
      });
      if (!res.ok) throw new Error('Flashcard generation failed');
      const data = await res.json();
      if (Array.isArray(data.flashcards) && data.flashcards.length > 0) {
        setFlashcards(data.flashcards);
        setActiveCardIndex(0);
        setIsCardFlipped(false);
        addToast('Flashcards Ready!', `Created ${data.flashcards.length} revision cards.`, 'success');
      }
    } catch (err) {
      console.error('Flashcard error:', err);
      addToast('Error', 'Failed to generate flashcards.', 'alert');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCardMastery = (level: 'learning' | 'reviewing' | 'mastered') => {
    if (!flashcards.length) return;
    // Immutable update — never mutate the existing card object in place.
    const updated = flashcards.map((card, idx) =>
      idx === activeCardIndex ? { ...card, masteryLevel: level } : card
    );
    setFlashcards(updated);
    addXp(15);

    // Auto next card
    setIsCardFlipped(false);
    if (activeCardIndex < flashcards.length - 1) {
      setActiveCardIndex(activeCardIndex + 1);
    } else {
      addToast('Deck Completed!', 'Great job! You revised all flashcards.', 'success');
    }
  };

  // =========================================================================
  // 4. Practice Quiz Engine
  // =========================================================================

  const generateQuiz = async () => {
    setLoadingAction('Generating Exam Quiz...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: activeTopic,
          numQuestions: 5
        })
      });
      if (!res.ok) throw new Error('Quiz generation failed');
      const data = await res.json();
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setQuizQuestions(data.questions);
        setSelectedAnswers({});
        setSubmittedQuiz(false);
        addToast('Quiz Ready!', `Created 5 MCQs on ${activeTopic}.`, 'success');
      }
    } catch (err) {
      console.error('Quiz error:', err);
      addToast('Error', 'Failed to generate quiz.', 'alert');
    } finally {
      setLoadingAction(null);
    }
  };

  const calculateScore = () => {
    let score = 0;
    quizQuestions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctAnswer) score++;
    });
    return score;
  };

  // =========================================================================
  // 5. Concept Cheat Sheet Engine
  // =========================================================================

  const generateCheatSheet = async () => {
    setLoadingAction('Generating Cheat Sheet & Traps...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/notebook/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docTitle: activeTopic,
          sourceText: sourceMaterial
        })
      });
      if (!res.ok) throw new Error('Cheat sheet generation failed');
      const data = await res.json();
      setCheatSheet(data);
      setCheckedChecklist({});
      addToast('Cheat Sheet Ready!', 'Synthesized summary, definitions, traps & checklist.', 'success');
    } catch (err) {
      console.error('Cheat sheet error:', err);
      addToast('Error', 'Failed to generate cheat sheet.', 'alert');
    } finally {
      setLoadingAction(null);
    }
  };

  // =========================================================================
  // 6. Smart Study Planner Engine
  // =========================================================================

  const generateStudyPlan = async () => {
    setLoadingAction('Creating Revision Roadmap...');
    try {
      const prompt = planGoal.trim() || `Tomorrow should include dedicated focus blocks for ${activeTopic}.`;
      const res = await fetch(`${API_BASE_URL}/api/ai/schedule-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, userId: currentUser.id })
      });
      if (!res.ok) throw new Error('Plan generation failed');
      const data = await res.json();
      setStudyPlan(data);
      addToast('Plan Created!', 'Actionable time-blocked schedule ready.', 'success');
    } catch (err) {
      console.error('Planner error:', err);
      addToast('Error', 'Failed to generate study plan.', 'alert');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#090d16] text-slate-100 overflow-hidden select-none">
      
      {/* =================================================================== */}
      {/* 1. TOP CONTEXT HEADER: Active Study Material & Topic Switcher */}
      {/* =================================================================== */}
      <header className="px-6 py-4 border-b border-white/10 bg-slate-950/70 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-extrabold text-white tracking-tight truncate max-w-md">
                {activeTopic}
              </h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                {activeDomain}
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>{sourceMaterial.split(/\s+/).length} words</span>
              <span>•</span>
              <span>~{Math.max(1, Math.ceil(sourceMaterial.split(/\s+/).length / 180))} min read</span>
              <span>•</span>
              <span className="text-indigo-400">All tools synced to this topic</span>
            </p>
          </div>
        </div>

        {/* Quick Action Buttons for Changing Context */}
        <div className="flex items-center gap-2">
          {/* Preset Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPresetsOpen(!isPresetsOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold border border-white/10 transition-colors"
            >
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>Presets</span>
            </button>
            {isPresetsOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setIsPresetsOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-64 max-w-[calc(100vw-32px)] p-1.5 bg-slate-900 border border-white/15 rounded-2xl shadow-2xl transition-all z-50">
                  <p className="text-[10px] font-bold text-slate-500 uppercase px-2.5 py-1">Exam Topics</p>
                  {PRESET_TOPICS.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        handleSelectPreset(p);
                        setIsPresetsOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex flex-col transition-colors ${
                        activeTopic === p.title ? 'bg-indigo-600/30 text-white font-bold' : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="truncate">{p.title}</span>
                      <span className="text-[10px] text-slate-500">{p.domain}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Upload PDF / Document */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold border border-white/10 cursor-pointer transition-colors">
            <Upload className={`w-3.5 h-3.5 text-purple-400 ${isUploading ? 'animate-bounce' : ''}`} />
            <span>{isUploading ? 'Reading...' : 'Upload PDF'}</span>
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
          </label>

          {/* Edit / Paste Notes */}
          <button
            onClick={() => {
              setTempEditorTitle(activeTopic);
              setTempEditorText(sourceMaterial);
              setIsEditorOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold border border-white/10 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
            <span>Edit Notes</span>
          </button>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. UNIFIED WORKSPACE NAVIGATION BAR (6 Integrated Tools) */}
      {/* =================================================================== */}
      <nav className="px-6 py-2.5 bg-slate-950/40 border-b border-white/5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('audio')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'audio'
                ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-600/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Headphones className="w-3.5 h-3.5 text-cyan-300" />
            <span>Audio Discussion</span>
            {audioDiscussion && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'chat'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-indigo-300" />
            <span>Doubt & Q&A</span>
            {chatMessages.length > 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                {chatMessages.length - 1}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('flashcards');
              if (!flashcards.length) generateFlashcards();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'flashcards'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-600/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Flashcards</span>
            {flashcards.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                {flashcards.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('quiz');
              if (!quizQuestions.length) generateQuiz();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'quiz'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-emerald-300" />
            <span>Exam Quiz</span>
            {quizQuestions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                {quizQuestions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab('cheatsheet');
              if (!cheatSheet) generateCheatSheet();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'cheatsheet'
                ? 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-lg shadow-fuchsia-600/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-fuchsia-300" />
            <span>Cheat Sheet & Traps</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('planner');
              if (!studyPlan) generateStudyPlan();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'planner'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-600/25'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-blue-300" />
            <span>Study Plan</span>
          </button>
        </div>

        {/* Global Loading Indicator */}
        {loadingAction && (
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300 px-3 py-1 bg-cyan-500/10 rounded-xl border border-cyan-500/20 animate-pulse">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>{loadingAction}</span>
          </div>
        )}
      </nav>

      <main className="flex-1 min-h-0 overflow-y-auto p-6 custom-scrollbar">

        {/* ================================================================= */}
        {/* TAB 1: 🎙️ AUDIO DEEP DIVE / PODCAST */}
        {/* ================================================================= */}
        {activeTab === 'audio' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
            
            {/* Player Hero Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                {/* Host Avatars */}
                <div className="flex items-center gap-6">
                  {/* Host Aarav (Male) */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-lg text-white shadow-xl transition-all ${
                        isPlaying && isMaleHost(audioDiscussion?.turns[currentTurnIndex]?.speaker)
                          ? 'bg-gradient-to-tr from-cyan-500 to-blue-600 ring-4 ring-cyan-400/50 scale-105'
                          : 'bg-slate-800 text-slate-400 border border-white/10'
                      }`}
                    >
                      👨‍🏫
                    </div>
                    <span className="text-xs font-bold text-white mt-1.5">
                      Aarav ({getHostVoiceLabel(hostVoiceStyle, audioLang, 'Aarav')})
                    </span>
                    <span className="text-[10px] text-cyan-400 font-medium">Curious Host (Male)</span>
                  </div>

                  {/* VS / Soundwave indicator */}
                  <div className="flex flex-col items-center justify-center px-2">
                    <div className="flex items-center gap-1 h-6">
                      <span className={`w-1 rounded-full bg-cyan-400 transition-all ${isPlaying ? 'h-6 animate-pulse' : 'h-2'}`} />
                      <span className={`w-1 rounded-full bg-indigo-400 transition-all ${isPlaying ? 'h-4 animate-pulse delay-75' : 'h-1.5'}`} />
                      <span className={`w-1 rounded-full bg-purple-400 transition-all ${isPlaying ? 'h-5 animate-pulse delay-150' : 'h-3'}`} />
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 font-mono">Gemini 3.8</span>
                  </div>

                  {/* Host Ananya (Female) */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-lg text-white shadow-xl transition-all ${
                        isPlaying && audioDiscussion?.turns[currentTurnIndex] && !isMaleHost(audioDiscussion.turns[currentTurnIndex].speaker)
                          ? 'bg-gradient-to-tr from-indigo-500 to-purple-600 ring-4 ring-indigo-400/50 scale-105'
                          : 'bg-slate-800 text-slate-400 border border-white/10'
                      }`}
                    >
                      👩‍🎓
                    </div>
                    <span className="text-xs font-bold text-white mt-1.5">
                      Ananya ({getHostVoiceLabel(hostVoiceStyle, audioLang, 'Ananya')})
                    </span>
                    <span className="text-[10px] text-indigo-400 font-medium">Exam Topper (Female)</span>
                  </div>
                </div>

                {/* Episode Meta & Cloud Status */}
                <div className="flex-1 text-center md:text-left min-w-0">
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30">
                      Gemini 3.8 Podcast
                    </span>
                    {audioDiscussion && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30">
                        ✓ Auto-Saved
                      </span>
                    )}
                    {audioDiscussion?.telegramFileId && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
                        ☁️ Backed up on Telegram
                      </span>
                    )}
                    {audioDiscussion?.source === 'fallback' && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30"
                        title="This recap uses excerpts from your source notes because AI script generation was unavailable."
                      >
                        Notes fallback
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {audioDiscussion ? audioDiscussion.durationEstimate || '~8 min' : '~8-10 min discussion'}
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-white truncate">
                    {audioDiscussion?.title || `${activeTopic} - In-Depth Conversation`}
                  </h3>
                  <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                    {audioDiscussion?.tagline || 'Aarav and Ananya break down every concept, derivation, and exam trick in natural Hinglish & English dialogue.'}
                  </p>
                </div>
              </div>

              {/* Player Controls Bar */}
              <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                
                {/* Host Voice Style Switcher */}
                <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-white/10 flex-wrap">
                  <Mic className="w-3.5 h-3.5 text-cyan-400 ml-2" />
                  <button
                    onClick={() => {
                      setHostVoiceStyle('gemini38');
                      if (ttsModel === 'edge-indian') setTtsModel('gemini-3.8-flash-tts');
                      stopAudio();
                      clearAudioCache();
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      hostVoiceStyle === 'gemini38' ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Gemini 3.8 Flash TTS Studio Voices: Puck (Aarav) & Aoede (Ananya)"
                  >
                    ✨ Gemini 3.8 Studio
                  </button>
                  <button
                    onClick={() => {
                      setHostVoiceStyle('notebooklm');
                      if (ttsModel === 'edge-indian') setTtsModel('gemini-3.8-flash-tts');
                      stopAudio();
                      clearAudioCache();
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      hostVoiceStyle === 'notebooklm' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Gemini 3.8 Deep Voices: Charon (Aarav) & Kore (Ananya)"
                  >
                    🎙️ NotebookLM Deep
                  </button>
                  <button
                    onClick={() => {
                      setHostVoiceStyle('indian');
                      setTtsModel('edge-indian');
                      stopAudio();
                      clearAudioCache();
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      hostVoiceStyle === 'indian' ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Indian Neural Voices: Madhur (Aarav) & Swara (Ananya)"
                  >
                    🇮🇳 Indian Educators
                  </button>
                </div>

                {/* Language Picker */}
                <div className="flex items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-white/10">
                  <Languages className="w-3.5 h-3.5 text-slate-400 ml-2" />
                  <button
                    onClick={() => handleAudioLanguageChange('hinglish')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      audioLang === 'hinglish' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Hinglish (Natural)
                  </button>
                  <button
                    onClick={() => handleAudioLanguageChange('english')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      audioLang === 'english' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => handleAudioLanguageChange('hindi')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      audioLang === 'hindi' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Hindi (हिंदी)
                  </button>
                </div>

                {/* Primary Play / Pause / Skip Buttons + TTS Model Selector */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* TTS Model Selector (Default: Gemini 3.8 Flash TTS + Auto Fallback) */}
                  <div
                    className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-cyan-500/30 shadow-inner"
                    title="Select Podcast Audio TTS Model (Auto-Fallback enabled so audio never fails if a model hits quota)"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <select
                      value={ttsModel}
                      onChange={e => {
                        const selected = e.target.value as TtsModelId;
                        setTtsModel(selected);
                        if (selected === 'edge-indian') {
                          setHostVoiceStyle('indian');
                        } else if (hostVoiceStyle === 'indian') {
                          setHostVoiceStyle('gemini38');
                        }
                        stopAudio();
                        clearAudioCache();
                      }}
                      className="bg-transparent text-xs font-bold text-cyan-200 focus:outline-none cursor-pointer pr-1"
                    >
                      {TTS_MODEL_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id} className="bg-slate-900 text-white">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => {
                      if (currentTurnIndex > 0) playTurn(currentTurnIndex - 1);
                    }}
                    disabled={!audioDiscussion || currentTurnIndex === 0}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 transition-colors"
                    title="Previous Turn"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    onClick={togglePlayPause}
                    disabled={Boolean(loadingAction)}
                    className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-extrabold text-sm shadow-xl shadow-cyan-500/25 flex items-center gap-2 transition-all scale-100 hover:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    {audioBuffering ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-4 h-4 fill-white" />
                    ) : (
                      <Play className="w-4 h-4 fill-white" />
                    )}
                    <span>
                      {audioBuffering ? 'Loading Audio...' : isPlaying ? 'Pause Discussion' : audioDiscussion ? 'Play Discussion' : 'Generate & Play'}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      if (audioDiscussion && currentTurnIndex < audioDiscussion.turns.length - 1) {
                        playTurn(currentTurnIndex + 1);
                      }
                    }}
                    disabled={!audioDiscussion || currentTurnIndex >= (audioDiscussion?.turns.length || 0) - 1}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 transition-colors"
                    title="Next Turn"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Speed, Download WAV, Telegram Cloud Backup & Re-generate */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      const rates = [0.75, 1.0, 1.25, 1.5];
                      const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
                      setPlaybackRate(next);
                      if (activeAudioRef.current) activeAudioRef.current.playbackRate = next;
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono font-bold border border-white/10 transition-colors"
                    title="Playback Speed"
                  >
                    {playbackRate}x
                  </button>

                  {audioDiscussion && (
                    <>
                      <button
                        onClick={handleDownloadFullPodcast}
                        disabled={isDownloadingAudio}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                        title="Download full merged episode (.wav)"
                      >
                        {isDownloadingAudio ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>{isDownloadingAudio ? 'Merging WAV...' : 'Download WAV'}</span>
                      </button>

                      <button
                        onClick={handleBackupPodcastToTelegram}
                        disabled={isTelegramSaving}
                        className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                        title="Backup full studio WAV audio permanently to your Telegram Study Channel"
                      >
                        {isTelegramSaving ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isTelegramSaving
                            ? 'Uploading...'
                            : audioDiscussion.telegramFileId
                              ? 'Re-sync Telegram'
                              : 'Save to Telegram'}
                        </span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => void generateAudioDiscussion(audioLang, false, undefined, true)}
                    disabled={Boolean(loadingAction)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                    title="Regenerate Discussion"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingAction ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Active Background Podcast Generation Banner */}
            {hasPendingBackgroundJob && (
              <div className="bg-gradient-to-r from-cyan-950/70 via-indigo-950/70 to-purple-950/70 border border-cyan-500/40 rounded-3xl p-4 shadow-xl flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0">
                    <RefreshCw className="w-4 h-4 text-cyan-300 animate-spin" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-cyan-200">
                        {loadingAction || 'Generating Podcast in Background...'}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Background Safe
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Safe to switch tabs, reload the page, or reconnect internet — your podcast is being created on the server and will appear automatically when ready!
                    </p>
                  </div>
                </div>
                <button
                  onClick={cancelPodcastGeneration}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all"
                  title="Cancel background podcast tracking"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Saved Podcasts Library (Persistent Across Reloads) */}
            {savedPodcasts.length > 0 && (
              <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Saved Podcast Library ({savedPodcasts.length})
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Stored locally & on server • Never lost on reload
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                  {savedPodcasts.map((pod, idx) => {
                    const podKey = pod.id || `${pod.docTitle}|${pod.language || 'hinglish'}|${pod.title}|${idx}`;
                    const isSelected =
                      audioDiscussion &&
                      (audioDiscussion.id
                        ? audioDiscussion.id === pod.id
                        : audioDiscussion.title === pod.title && audioDiscussion.docTitle === pod.docTitle);
                    return (
                      <div
                        key={podKey}
                        onClick={() => handleSelectSavedPodcast(pod)}
                        className={`group flex items-center justify-between gap-3 p-3 rounded-2xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-cyan-950/40 border-cyan-500/50 shadow-md'
                            : 'bg-slate-950/50 border-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {pod.language || 'hinglish'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {pod.turns?.length || 0} turns
                            </span>
                            {pod.telegramFileId && (
                              <span className="text-[10px] text-sky-400 font-semibold" title="Backed up on Telegram">
                                ☁️ TG
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-white truncate">{pod.title}</p>
                          <p className="text-[11px] text-slate-400 truncate">{pod.docTitle}</p>
                        </div>

                        <button
                          onClick={(e) => void handleDeleteSavedPodcast(pod, e)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-70 group-hover:opacity-100 transition-all"
                          title="Delete saved podcast"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Transcript Card */}
            <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-xl flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Interactive Transcript ({audioDiscussion?.turns?.length || 0} Turns)
                  </h4>
                </div>
                <span className="text-[11px] text-slate-400">
                  Click any dialogue line to jump audio immediately
                </span>
              </div>

              {!audioDiscussion ? (
                <div className="py-16 text-center text-slate-500 space-y-3">
                  <Headphones className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="text-xs">No discussion script generated yet for this topic.</p>
                  <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1">
                    <div
                      className="flex items-center gap-1.5 bg-slate-950/90 px-3 py-2 rounded-xl border border-cyan-500/30"
                      title="Select TTS Audio Model (Auto-Fallback enabled)"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <select
                        value={ttsModel}
                        onChange={e => {
                          const selected = e.target.value as TtsModelId;
                          setTtsModel(selected);
                          if (selected === 'edge-indian') {
                            setHostVoiceStyle('indian');
                          } else if (hostVoiceStyle === 'indian') {
                            setHostVoiceStyle('gemini38');
                          }
                        }}
                        className="bg-transparent text-xs font-bold text-cyan-200 focus:outline-none cursor-pointer"
                      >
                        {TTS_MODEL_OPTIONS.map(opt => (
                          <option key={opt.id} value={opt.id} className="bg-slate-900 text-white">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => void generateAudioDiscussion(audioLang, true)}
                      disabled={Boolean(loadingAction)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30"
                    >
                      Generate Audio Script with Aarav & Ananya
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  ref={transcriptContainerRef}
                  className="space-y-3 max-h-[480px] overflow-y-auto pr-2 custom-scrollbar"
                >
                  {audioDiscussion.turns.map((turn, idx) => {
                    const isCurrent = idx === currentTurnIndex;
                    const isMale = isMaleHost(turn.speaker);
                    const speakerLabel = displaySpeakerName(turn.speaker);
                    return (
                      <div
                        id={`turn-${idx}`}
                        key={idx}
                        onClick={() => playTurn(idx)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                          isCurrent
                            ? isMale
                              ? 'bg-cyan-950/40 border-cyan-500/60 shadow-lg shadow-cyan-500/10'
                              : 'bg-indigo-950/40 border-indigo-500/60 shadow-lg shadow-indigo-500/10'
                            : 'bg-slate-950/40 border-white/5 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                                isMale
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                  : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              }`}
                            >
                              {isMale ? '👨‍🏫 ' : '👩‍🎓 '}
                              {speakerLabel}
                            </span>
                            {turn.emotion && (
                              <span className="text-[10px] text-slate-500 italic">
                                ({turn.emotion})
                              </span>
                            )}
                          </div>
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-cyan-400 flex items-center gap-1">
                              <Radio className="w-3 h-3 animate-ping" />
                              Speaking Now
                            </span>
                          )}
                        </div>
                        <p className={`text-xs leading-relaxed ${isCurrent ? 'text-white font-medium' : 'text-slate-300'}`}>
                          {turn.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: 💬 DOUBT SOLVER & INTERACTIVE CHAT */}
        {/* ================================================================= */}
        {activeTab === 'chat' && (
          <div className="max-w-4xl mx-auto h-full flex flex-col gap-4 animate-in fade-in duration-200">
            {/* Messages Scroll Area */}
            <div ref={chatContainerRef} className="flex-1 min-h-[400px] max-h-[560px] overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {chatMessages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-3xl p-4 shadow-lg ${
                        isUser
                          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-none'
                          : 'bg-slate-900 border border-white/10 text-slate-200 rounded-bl-none'
                      }`}
                    >
                      {!isUser && (
                        <div className="flex items-center gap-2 mb-2 text-[11px] font-bold text-cyan-400">
                          <Brain className="w-3.5 h-3.5" />
                          <span>AI Study Coach</span>
                        </div>
                      )}

                      {isUser ? (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <FormattedAiMessage content={msg.content} />
                      )}

                      {/* Citations if any */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-white/10 text-[10px] text-slate-400">
                          <span className="font-semibold text-slate-300">Grounded Source Citations:</span>
                          <ul className="mt-1 space-y-0.5 list-disc list-inside">
                            {msg.citations.map((c, i) => (
                              <li key={i} className="truncate">{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Suggested Follow-Ups */}
                      {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-white/10">
                          <p className="text-[10px] font-semibold text-slate-400 mb-1.5">Suggested Next Steps:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.suggestedFollowUps.map((q, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleSendChatMessage(q)}
                                className="text-[10px] px-2.5 py-1 rounded-xl bg-white/5 hover:bg-cyan-500/20 text-cyan-300 hover:text-white border border-cyan-500/30 transition-colors text-left"
                              >
                                {q} →
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 px-2">{msg.timestamp}</span>
                  </div>
                );
              })}

              {chatLoading && (
                <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-slate-900 border border-white/10 w-fit text-xs text-slate-400 animate-pulse">
                  <Brain className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span>AI Coach analyzing source material & preparing solution...</span>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChatMessage();
              }}
              className="p-2 bg-slate-900 border border-white/15 rounded-2xl shadow-xl flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={`Ask any doubt or question about "${activeTopic}"...`}
                className="flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading}
                aria-label="Send message"
                title="Send message"
                className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white disabled:opacity-40 transition-all shadow-md shadow-indigo-600/25"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: ⚡ FLASHCARDS ARENA */}
        {/* ================================================================= */}
        {activeTab === 'flashcards' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
            {flashcards.length === 0 ? (
              <div className="py-20 text-center bg-slate-900 border border-white/10 rounded-3xl p-8 space-y-3">
                <Zap className="w-10 h-10 mx-auto text-amber-400" />
                <h3 className="text-sm font-bold text-white">No Flashcards Generated Yet</h3>
                <p className="text-xs text-slate-400">Generate high-yield active recall flashcards directly from this topic.</p>
                <button
                  onClick={generateFlashcards}
                  disabled={Boolean(loadingAction)}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-amber-600/30"
                >
                  Generate 8 Flashcards
                </button>
              </div>
            ) : (
              <>
                {/* Progress Bar */}
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span>Card {activeCardIndex + 1} of {flashcards.length}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-semibold">
                      {flashcards.filter(c => c.masteryLevel === 'mastered').length} Mastered
                    </span>
                    <button
                      onClick={generateFlashcards}
                      className="text-amber-400 hover:underline text-[11px]"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>

                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full transition-all duration-300"
                    style={{ width: `${((activeCardIndex + 1) / flashcards.length) * 100}%` }}
                  />
                </div>

                {/* 3D Flip Card */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={isCardFlipped}
                  aria-label={isCardFlipped ? 'Flashcard answer, press to show question' : 'Flashcard question, press to reveal answer'}
                  onClick={() => setIsCardFlipped(!isCardFlipped)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setIsCardFlipped(f => !f);
                    }
                  }}
                  className="min-h-[280px] p-8 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 border border-white/15 shadow-2xl flex flex-col justify-between cursor-pointer transition-all duration-300 hover:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500/50 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                      {isCardFlipped ? 'Answer / Explanation' : 'Question / Concept'}
                    </span>
                    <span className="text-[10px] text-slate-500">Click card or space to flip</span>
                  </div>

                  <div className="my-6 text-center">
                    <p className={`text-base font-semibold leading-relaxed ${isCardFlipped ? 'text-amber-200' : 'text-white'}`}>
                      {isCardFlipped ? flashcards[activeCardIndex].back : flashcards[activeCardIndex].front}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-4 border-t border-white/5">
                    <span>{flashcards[activeCardIndex].subject || activeDomain}</span>
                    <span className="capitalize text-amber-400 font-medium">Status: {flashcards[activeCardIndex].masteryLevel}</span>
                  </div>
                </div>

                {/* Rating & Navigation Buttons */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    onClick={() => {
                      if (activeCardIndex > 0) {
                        setIsCardFlipped(false);
                        setActiveCardIndex(activeCardIndex - 1);
                      }
                    }}
                    disabled={activeCardIndex === 0}
                    aria-label="Previous flashcard"
                    title="Previous flashcard"
                    className="p-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-300 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCardMastery('learning')}
                      className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-bold transition-colors"
                    >
                      Hard (Review Soon)
                    </button>
                    <button
                      onClick={() => handleCardMastery('reviewing')}
                      className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-colors"
                    >
                      Good
                    </button>
                    <button
                      onClick={() => handleCardMastery('mastered')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-colors"
                    >
                      Mastered (+15 XP)
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      if (activeCardIndex < flashcards.length - 1) {
                        setIsCardFlipped(false);
                        setActiveCardIndex(activeCardIndex + 1);
                      }
                    }}
                    disabled={activeCardIndex === flashcards.length - 1}
                    aria-label="Next flashcard"
                    title="Next flashcard"
                    className="p-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-300 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: 📝 EXAM QUIZ ARENA */}
        {/* ================================================================= */}
        {activeTab === 'quiz' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
            {quizQuestions.length === 0 ? (
              <div className="py-20 text-center bg-slate-900 border border-white/10 rounded-3xl p-8 space-y-3">
                <Award className="w-10 h-10 mx-auto text-emerald-400" />
                <h3 className="text-sm font-bold text-white">No Active Quiz</h3>
                <p className="text-xs text-slate-400">Test your mastery with 5 exam-style MCQs generated for this topic.</p>
                <button
                  onClick={generateQuiz}
                  disabled={Boolean(loadingAction)}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/30"
                >
                  Generate 5 Exam MCQs
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div>
                    <h3 className="text-sm font-extrabold text-white">Exam Practice: {activeTopic}</h3>
                    <p className="text-xs text-slate-400">Answer all questions and submit to view explanations.</p>
                  </div>
                  <button
                    onClick={generateQuiz}
                    className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    New Questions
                  </button>
                </div>

                {/* Question List */}
                <div className="space-y-4">
                  {quizQuestions.map((q, qIdx) => {
                    const selected = selectedAnswers[qIdx];
                    const isAnswered = selected !== undefined;
                    return (
                      <div
                        key={q.id || qIdx}
                        className="p-5 rounded-2xl bg-slate-900 border border-white/10 space-y-3 shadow-lg"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="font-bold text-emerald-400">Question {qIdx + 1}</span>
                          <span className="text-[10px] text-slate-500">{q.subject || activeDomain}</span>
                        </div>

                        <p className="text-xs font-semibold text-white leading-relaxed">{q.question}</p>

                        <div className="space-y-2 pt-1">
                          {q.options.map((opt, optIdx) => {
                            const isChosen = selected === optIdx;
                            const isCorrectOpt = optIdx === q.correctAnswer;
                            let style = 'bg-slate-950/60 border-white/10 hover:border-white/20 text-slate-300';
                            if (submittedQuiz) {
                              if (isCorrectOpt) {
                                style = 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-bold';
                              } else if (isChosen && !isCorrectOpt) {
                                style = 'bg-red-500/20 border-red-500/60 text-red-300 font-bold';
                              }
                            } else if (isChosen) {
                              style = 'bg-indigo-600/30 border-indigo-500 text-white font-bold';
                            }

                            return (
                              <button
                                key={optIdx}
                                disabled={submittedQuiz}
                                onClick={() => setSelectedAnswers({ ...selectedAnswers, [qIdx]: optIdx })}
                                className={`w-full p-2.5 rounded-xl border text-xs text-left transition-all flex items-center gap-2.5 ${style}`}
                              >
                                <span className="w-5 h-5 rounded-lg bg-white/10 flex items-center justify-center font-bold text-[10px] shrink-0">
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <span className="flex-1">{opt}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Explanation on Submit */}
                        {submittedQuiz && (
                          <div className="mt-3 p-3 rounded-xl bg-slate-950/80 border border-white/10 text-xs text-slate-300">
                            <span className="font-bold text-emerald-400 block mb-1">Explanation:</span>
                            {q.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Submit / Score Action */}
                {!submittedQuiz ? (
                  <button
                    onClick={() => {
                      setSubmittedQuiz(true);
                      const score = calculateScore();
                      addXp(score * 20);
                      addToast('Quiz Submitted!', `Score: ${score}/${quizQuestions.length}. Earned ${score * 20} XP!`, 'success');
                    }}
                    disabled={Object.keys(selectedAnswers).length < quizQuestions.length}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-xl shadow-emerald-600/25 transition-all disabled:opacity-50"
                  >
                    Submit Quiz & View Explanations
                  </button>
                ) : (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                    <p className="text-sm font-extrabold text-emerald-400">
                      Final Score: {calculateScore()} / {quizQuestions.length} ({Math.round((calculateScore() / quizQuestions.length) * 100)}%)
                    </p>
                    <button
                      onClick={generateQuiz}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all"
                    >
                      Try Another Quiz
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: 📋 CONCEPT CHEAT SHEET & TRAPS */}
        {/* ================================================================= */}
        {activeTab === 'cheatsheet' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
            {!cheatSheet ? (
              <div className="py-20 text-center bg-slate-900 border border-white/10 rounded-3xl p-8 space-y-3">
                <FileText className="w-10 h-10 mx-auto text-fuchsia-400" />
                <h3 className="text-sm font-bold text-white">No Cheat Sheet Generated Yet</h3>
                <p className="text-xs text-slate-400">Generate executive summary, high-yield definitions, exam traps & revision checklist.</p>
                <button
                  onClick={generateCheatSheet}
                  disabled={Boolean(loadingAction)}
                  className="px-5 py-2.5 bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-fuchsia-600/30"
                >
                  Generate Cheat Sheet
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Executive Summary */}
                <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 shadow-xl space-y-2">
                  <h3 className="text-sm font-bold text-fuchsia-400 flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Executive Summary & Core Architecture
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {cheatSheet.executiveSummary}
                  </p>
                </div>

                {/* Key Concepts Grid */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    High-Yield Key Concepts ({cheatSheet.keyConcepts.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {cheatSheet.keyConcepts.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl bg-slate-950/60 border border-white/10 space-y-2 shadow-md"
                      >
                        <h5 className="text-xs font-bold text-cyan-300">{item.term}</h5>
                        <p className="text-xs text-slate-300 leading-relaxed">{item.definition}</p>
                        <div className="pt-2 border-t border-white/5 text-[10px] text-amber-300">
                          <span className="font-semibold text-slate-400">Exam Note: </span>
                          {item.examSignificance}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pitfalls & Traps */}
                {cheatSheet.pitfallsAndTraps && cheatSheet.pitfallsAndTraps.length > 0 && (
                  <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-2">
                    <h4 className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Common Exam Pitfalls & Misconceptions
                    </h4>
                    <ul className="space-y-1.5 text-xs text-red-200">
                      {cheatSheet.pitfallsAndTraps.map((trap, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-red-400 shrink-0 font-bold">•</span>
                          <span>{trap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Revision Checklist */}
                {cheatSheet.revisionChecklist && cheatSheet.revisionChecklist.length > 0 && (
                  <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 space-y-3">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <ListChecks className="w-4 h-4 text-emerald-400" />
                      Active Recall Revision Checklist
                    </h4>
                    <div className="space-y-2">
                      {cheatSheet.revisionChecklist.map((item, idx) => {
                        const checked = checkedChecklist[idx];
                        return (
                          <div
                            key={idx}
                            onClick={() => setCheckedChecklist({ ...checkedChecklist, [idx]: !checked })}
                            className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer p-2 rounded-xl hover:bg-white/5 transition-colors"
                          >
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-500 shrink-0" />
                            )}
                            <span className={checked ? 'line-through text-slate-500' : ''}>{item}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: 📅 SMART STUDY PLANNER */}
        {/* ================================================================= */}
        {activeTab === 'planner' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">
            {/* Prompt input card */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 shadow-xl space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                Plan Revision for "{activeTopic}"
              </h3>
              <p className="text-xs text-slate-400">
                AI Coach will build a customized time-blocked study schedule with targeted review blocks and active recall.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={planGoal}
                  onChange={(e) => setPlanGoal(e.target.value)}
                  placeholder={`e.g. 2 hours of deep revision on ${activeTopic} with mock practice`}
                  className="flex-1 bg-slate-950/80 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={generateStudyPlan}
                  disabled={Boolean(loadingAction)}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/25 transition-all"
                >
                  Generate Plan
                </button>
              </div>
            </div>

            {/* Generated Plan */}
            {studyPlan && (
              <div className="p-6 rounded-3xl bg-slate-900 border border-white/10 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                    Recommended Study Schedule
                  </h4>
                  {onNavigateToCalendar && (
                    <button
                      onClick={onNavigateToCalendar}
                      className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      <span>Open Calendar</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-300">{studyPlan.message}</p>

                <div className="space-y-2.5">
                  {studyPlan.suggestedSchedule.map((block, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-blue-300 px-2.5 py-1 rounded-xl bg-blue-500/10 border border-blue-500/20">
                          {block.time}
                        </span>
                        <span className="text-xs font-semibold text-white">{block.activity}</span>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0 font-medium">
                        ⏱️ {block.duration}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* =================================================================== */}
      {/* 4. MODAL: Edit Notes / Paste Custom Material */}
      {/* =================================================================== */}
      {isEditorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsEditorOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-slate-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Edit Active Study Material</h3>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                aria-label="Close editor"
                title="Close"
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Topic / Chapter Title:
                </label>
                <input
                  type="text"
                  value={tempEditorTitle}
                  onChange={(e) => setTempEditorTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Paste Study Material / Notes:
                </label>
                <textarea
                  rows={10}
                  value={tempEditorText}
                  onChange={(e) => setTempEditorText(e.target.value)}
                  placeholder="Paste any textbook notes, coaching material, or formula sheet here..."
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3.5 text-xs text-white leading-relaxed focus:outline-none focus:border-amber-400 resize-none custom-scrollbar"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-500">
                {tempEditorText.split(/\s+/).filter(Boolean).length} words
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCustomNotes}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-500/25 transition-all"
                >
                  Save & Sync All Tools
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
