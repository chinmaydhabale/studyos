import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  FileText,
  MessageSquare,
  Layers,
  Sparkles,
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
  FileCode,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Plus,
  Languages,
  Bookmark,
  Sliders,
  Settings2,
  FileCheck,
  Loader2,
  FileUp,
  Headphones
} from 'lucide-react';
import { API_BASE_URL } from '../../config.js';
import { useSocket } from '../../context/SocketContext.js';
import { useStudy } from '../../context/StudyContext.js';
import { Flashcard, QuizQuestion } from '../../types.js';
import { pdfjsLib, extractPageText } from '../../lib/pdfjs.js';

interface AudioTurn {
  speaker: 'Alex' | 'Sam';
  text: string;
  emotion?: string;
}

interface NotebookAudioOverview {
  docTitle: string;
  title: string;
  tagline: string;
  durationEstimate: string;
  language?: 'hinglish' | 'hindi' | 'english';
  turns: AudioTurn[];
  source?: 'gemini' | 'fallback';
}

interface NotebookBriefingDoc {
  docTitle: string;
  executiveSummary: string;
  keyConcepts: Array<{ term: string; definition: string; examSignificance: string }>;
  faq: Array<{ question: string; answer: string }>;
  pitfallsAndTraps: string[];
  revisionChecklist: string[];
  source?: 'gemini' | 'fallback';
}

interface NotebookSourceAnswer {
  question: string;
  answer: string;
  citations: string[];
  suggestedFollowUps: string[];
  source?: 'gemini' | 'fallback';
}

const SAMPLE_SOURCES = [
  {
    title: 'Thermodynamics & Heat Engines',
    tag: 'Physics / Engineering',
    content: `Thermodynamics is the branch of physics that deals with heat, work, and temperature, and their relation to energy, radiation, and physical properties of matter.

First Law of Thermodynamics:
The internal energy change of a closed system is equal to the heat supplied minus the work done by the system: ΔU = Q - W. Energy cannot be created or destroyed, only transformed. In cyclic processes where the initial and final states are identical, ΔU = 0, so Q_net = W_net.

Second Law of Thermodynamics (Clausius & Kelvin-Planck Statements):
Kelvin-Planck statement asserts that it is impossible to construct a heat engine operating in a cycle that absorbs heat from a single reservoir and produces an equivalent amount of work. Clausius statement asserts that heat cannot spontaneously transfer from a cooler body to a warmer body without external work.
Entropy (S) of an isolated system always increases in irreversible processes and remains constant in ideal reversible processes (ΔS_universe ≥ 0).

Carnot Engine & Efficiency:
The Carnot cycle is an ideal reversible thermodynamic cycle consisting of four successive stages:
1. Reversible Isothermal Expansion at high temperature T_H (absorbs heat Q_H).
2. Reversible Adiabatic Expansion (temperature drops from T_H to T_C with no heat exchange).
3. Reversible Isothermal Compression at low temperature T_C (rejects heat Q_C).
4. Reversible Adiabatic Compression (temperature rises from T_C back to T_H).
The Carnot efficiency is the theoretical upper ceiling for any heat engine operating between two thermal reservoirs:
η = 1 - (T_C / T_H) = (T_H - T_C) / T_H
Crucial Exam Rule: Temperatures T_H and T_C must strictly be in Kelvin (K = °C + 273.15). Real engines have lower efficiency due to friction, irreversible heat dissipation, and finite thermal gradients.`
  },
  {
    title: 'RBI Monetary Policy & Inflation Framework',
    tag: 'Banking & Economics',
    content: `The Reserve Bank of India (RBI) is the central bank and regulatory body responsible for the regulation of the Indian banking system and monetary stability.

Monetary Policy Committee (MPC):
Formed under Section 45ZB of the amended RBI Act, 1934, the MPC consists of six members: three from the RBI (including the Governor as ex-officio chairperson) and three external members appointed by the Central Government. The primary mandate of the MPC is price stability with growth, maintaining a flexible inflation target of 4% Consumer Price Index (CPI) with a tolerance band of +/- 2% (i.e. 2% to 6%).

Key Policy Rates and Instruments:
1. Policy Repo Rate: The rate at which RBI lends short-term liquidity to commercial banks against government securities. Increasing repo rate cools inflation by raising borrowing costs.
2. Reverse Repo Rate & Standing Deposit Facility (SDF): SDF allows absorption of liquidity without requiring collateral securities, priced slightly below repo.
3. Cash Reserve Ratio (CRR): The percentage of Net Demand and Time Liabilities (NDTL) that scheduled commercial banks must maintain in liquid cash balances with the RBI. No interest is paid on CRR reserves.
4. Statutory Liquidity Ratio (SLR): The mandatory percentage of NDTL banks must invest in unencumbered approved securities (chiefly Central and State Government Bonds), gold, or cash before extending credit.
5. Marginal Standing Facility (MSF): An emergency borrowing window for scheduled banks to borrow overnight funds up to a specified percentage of their NDTL at an interest rate higher than repo.`
  },
  {
    title: 'Indian Constitution: Fundamental Rights',
    tag: 'Indian Polity & Law',
    content: `Part III of the Constitution of India (Articles 12 to 35) embodies the Fundamental Rights, hailed as the Magna Carta of India. Fundamental rights are justiciable, protected and guaranteed by the Constitution against legislative and executive encroachments.

Six Broad Categories of Fundamental Rights:
1. Right to Equality (Articles 14–18):
- Article 14: Equality before law and equal protection of the laws.
- Article 15: Prohibition of discrimination on grounds of religion, race, caste, sex, or place of birth.
- Article 16: Equality of opportunity in matters of public employment.
- Article 17: Abolition of Untouchability.
- Article 18: Abolition of titles (except military and academic distinctions).

2. Right to Freedom (Articles 19–22):
- Article 19: Protection of 6 fundamental freedoms (speech & expression, assembly, association, movement, residence, and profession) subject to reasonable restrictions.
- Article 21: Protection of life and personal liberty. Interpreted broadly by the Supreme Court (e.g., Maneka Gandhi case) to include dignity, privacy (Puttaswamy case), clean environment, and health.
- Article 21A: Right to free and compulsory education for children aged 6 to 14 years.

3. Right against Exploitation (Articles 23–24): Prohibition of human trafficking, forced labor, and child employment in hazardous industries.

4. Right to Freedom of Religion (Articles 25–28).
5. Cultural and Educational Rights (Articles 29–30).

6. Right to Constitutional Remedies (Article 32):
Dr. B.R. Ambedkar called Article 32 the "Heart and Soul of the Constitution". It empowers individuals to approach the Supreme Court directly for the enforcement of fundamental rights through prerogative writs: Habeas Corpus, Mandamus, Prohibition, Certiorari, and Quo-Warranto.`
  }
];

export const NotebookStudio: React.FC = () => {
  const { addToast, currentUser } = useSocket();
  const { addXp } = useStudy();

  // Document Source States
  const [docTitle, setDocTitle] = useState('Thermodynamics & Heat Engines');
  const [sourceText, setSourceText] = useState(SAMPLE_SOURCES[0].content);
  const [isSourceCollapsed, setIsSourceCollapsed] = useState(false);

  // Active Studio Subtab
  const [studioTab, setStudioTab] = useState<'audio' | 'briefing' | 'chat' | 'studypack'>('audio');
  const [isLoading, setIsLoading] = useState(false);

  // Audio Overview States
  const [audioOverview, setAudioOverview] = useState<NotebookAudioOverview | null>(null);
  const [audioLanguage, setAudioLanguage] = useState<'hinglish' | 'hindi' | 'english'>('hinglish');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [hasCopiedTranscript, setHasCopiedTranscript] = useState(false);

  // Flashcards Saved States
  const [savedCardIds, setSavedCardIds] = useState<{ [id: string]: boolean }>({});
  const [isSavingAllCards, setIsSavingAllCards] = useState(false);
  const [savedConceptCards, setSavedConceptCards] = useState<{ [conceptIdx: number]: boolean }>({});

  // Briefing Doc States
  const [briefingDoc, setBriefingDoc] = useState<NotebookBriefingDoc | null>(null);
  const [checkedChecklist, setCheckedChecklist] = useState<{ [key: number]: boolean }>({});
  const [hasCopiedBriefing, setHasCopiedBriefing] = useState(false);

  // Grounded Source Chat States
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; text: string; citations?: string[]; followUps?: string[] }>
  >([
    {
      role: 'assistant',
      text: 'Hello! I am your NotebookLM Source Coach. Ask me anything directly about the document you have loaded above, and I will answer with citations grounded in the source text.'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Study Pack States (Flashcards & Quiz)
  const [studyCards, setStudyCards] = useState<Flashcard[]>([]);
  const [studyQuiz, setStudyQuiz] = useState<QuizQuestion[]>([]);
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [selectedQuizAnswers, setSelectedQuizAnswers] = useState<{ [key: string]: number }>({});
  const [showQuizResult, setShowQuizResult] = useState(false);

  // Voices list for Web Speech API & Customization
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // PDF Extraction States
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string>('');
  const [pdfInfo, setPdfInfo] = useState<{ fileName: string; pageCount: number } | null>(null);

  // Speaker Voice Selection & Settings
  const [alexVoiceName, setAlexVoiceName] = useState<string>(() => {
    return localStorage.getItem('studyos_voice_alex') || '';
  });
  const [samVoiceName, setSamVoiceName] = useState<string>(() => {
    return localStorage.getItem('studyos_voice_sam') || '';
  });
  const [hinglishEngine, setHinglishEngine] = useState<'hi-IN' | 'en-IN'>(() => {
    return (localStorage.getItem('studyos_hinglish_engine') as 'hi-IN' | 'en-IN') || 'hi-IN';
  });
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [testingSpeaker, setTestingSpeaker] = useState<'Alex' | 'Sam' | null>(null);

  // Categorize voices for Indian / Hindi friendliness
  const isHindiVoice = (v: SpeechSynthesisVoice) => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    return (
      lang.startsWith('hi') ||
      lang.includes('hindi') ||
      name.includes('hindi') ||
      name.includes('swara') ||
      name.includes('madhur') ||
      name.includes('hemant') ||
      name.includes('kalpana') ||
      name.includes('हिन्दी')
    );
  };

  const isIndianEnglishVoice = (v: SpeechSynthesisVoice) => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    return (
      (lang.includes('in') || name.includes('india') || name.includes('neerja') || name.includes('prabhat') || name.includes('ravi') || name.includes('heera')) &&
      !isHindiVoice(v)
    );
  };

  const hindiVoices = voices.filter(isHindiVoice);
  const indianVoices = voices.filter(isIndianEnglishVoice);
  const otherVoices = voices.filter(v => !isHindiVoice(v) && !isIndianEnglishVoice(v));

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
      const updateVoices = () => {
        const v = window.speechSynthesis.getVoices();
        setVoices(v);
      };
      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Auto-select best voices once voices are loaded if not manually set
  useEffect(() => {
    if (!voices.length) return;

    if (!alexVoiceName || !voices.some(v => v.name === alexVoiceName)) {
      const bestAlex = hindiVoices[0] || indianVoices[0] || voices[0];
      if (bestAlex) {
        setAlexVoiceName(bestAlex.name);
        localStorage.setItem('studyos_voice_alex', bestAlex.name);
      }
    }

    if (!samVoiceName || !voices.some(v => v.name === samVoiceName)) {
      const bestSam =
        (hindiVoices.length > 1 ? hindiVoices[1] : null) ||
        indianVoices.find(v => v.name !== alexVoiceName) ||
        indianVoices[0] ||
        (voices.length > 1 ? voices[1] : voices[0]);
      if (bestSam) {
        setSamVoiceName(bestSam.name);
        localStorage.setItem('studyos_voice_sam', bestSam.name);
      }
    }
  }, [voices, hindiVoices.length, indianVoices.length]);

  const handleSelectAlexVoice = (name: string) => {
    setAlexVoiceName(name);
    localStorage.setItem('studyos_voice_alex', name);
  };

  const handleSelectSamVoice = (name: string) => {
    setSamVoiceName(name);
    localStorage.setItem('studyos_voice_sam', name);
  };

  const handleSelectHinglishEngine = (engine: 'hi-IN' | 'en-IN') => {
    setHinglishEngine(engine);
    localStorage.setItem('studyos_hinglish_engine', engine);
  };

  // Test voice sample
  const handleTestVoice = (speaker: 'Alex' | 'Sam') => {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    const voiceName = speaker === 'Alex' ? alexVoiceName : samVoiceName;
    const voice = voices.find(v => v.name === voiceName);
    const isHindi = voice ? isHindiVoice(voice) : audioLanguage === 'hindi';

    let testText = '';
    if (speaker === 'Alex') {
      testText = isHindi || audioLanguage !== 'english'
        ? 'नमस्ते! मैं एलेक्स हूँ। हम दोनों मिलकर हर कठिन विषय को बहुत आसान और रोचक बनाएंगे!'
        : 'Hey there! I am Alex. Ready to break down this topic into simple, memorable concepts!';
    } else {
      testText = isHindi || audioLanguage !== 'english'
        ? 'नमस्ते! मैं सैम हूँ। परीक्षा में सफलता के लिए सटीक सूत्र और नियमों को समझना बहुत आवश्यक है।'
        : 'Hello! I am Sam. Let us analyze every formula, mechanism, and exam pitfall thoroughly.';
    }

    const utterance = new SpeechSynthesisUtterance(testText);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = isHindi ? 'hi-IN' : (voice.lang || (audioLanguage === 'hindi' ? 'hi-IN' : 'en-IN'));
    } else {
      utterance.lang = audioLanguage === 'hindi' ? 'hi-IN' : 'en-IN';
    }

    utterance.rate = playbackRate;
    utterance.pitch = speaker === 'Alex' ? 1.15 : 0.88;

    setTestingSpeaker(speaker);
    utterance.onend = () => setTestingSpeaker(null);
    utterance.onerror = () => setTestingSpeaker(null);

    synthRef.current.speak(utterance);
  };

  // Clean Markdown & formulas for spoken speech synthesis
  const cleanTurnTextForSpeech = (text: string): string => {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/#{1,6}\s+/g, '')
      .replace(/[-*+]\s+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\\(?:frac|delta|eta|alpha|beta|theta|pi)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Word & Character count
  const wordCount = sourceText.trim() ? sourceText.trim().split(/\s+/).length : 0;
  const charCount = sourceText.length;

  // Handle Loading Preset Samples
  const handleLoadSample = (sample: (typeof SAMPLE_SOURCES)[0]) => {
    setDocTitle(sample.title);
    setSourceText(sample.content);
    setPdfInfo(null);
    addToast('Source Loaded', `Loaded "${sample.title}"`, 'info');
  };

  // Handle PDF File Upload & Text Extraction
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      addToast('Invalid File', 'Please select a valid PDF file.', 'alert');
      return;
    }

    setIsExtractingPdf(true);
    setPdfProgress('Reading PDF file structure...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      let extractedFullText = '';
      const pagesToProcess = Math.min(totalPages, 50);

      for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
        setPdfProgress(`Extracting page ${pageNum} of ${pagesToProcess}...`);
        const pageText = await extractPageText(pdf, pageNum);
        if (pageText.trim()) {
          extractedFullText += `--- Page ${pageNum} ---\n${pageText.trim()}\n\n`;
        }
      }

      if (!extractedFullText.trim()) {
        throw new Error('No selectable text found in this PDF. It might contain scanned images or protected text.');
      }

      const cleanDocTitle = file.name.replace(/\.pdf$/i, '').trim();
      setDocTitle(cleanDocTitle);
      setSourceText(extractedFullText.trim());
      setPdfInfo({ fileName: file.name, pageCount: totalPages });
      setIsSourceCollapsed(false);

      const words = extractedFullText.trim().split(/\s+/).length;
      addToast(
        'PDF Successfully Loaded!',
        `Extracted ${pagesToProcess} page(s), ${words.toLocaleString()} words from "${file.name}"`,
        'success'
      );
      addXp(35, 'Imported PDF Document into NotebookLM');
    } catch (err: any) {
      console.error('PDF extraction error:', err);
      addToast('PDF Error', err?.message || 'Failed to read PDF document', 'alert');
    } finally {
      setIsExtractingPdf(false);
      setPdfProgress('');
      e.target.value = '';
    }
  };

  // Handle Text File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setSourceText(text);
        setDocTitle(file.name.replace(/\.[^/.]+$/, ''));
        setPdfInfo(null);
        addToast('File Imported', `Loaded ${file.name}`, 'success');
      }
    };
    reader.readAsText(file);
  };

  // Flashcard save helpers
  const handleSaveFlashcard = async (card: Flashcard) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: card.id,
          front: card.front,
          back: card.back,
          subject: card.subject || docTitle,
          masteryLevel: 'learning'
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedCardIds(prev => ({ ...prev, [card.id]: true }));
      addToast('Flashcard Saved', `Added to your revision vault: "${card.front.slice(0, 35)}..."`, 'success');
      addXp(15, 'Saved Flashcard for Revision');
    } catch (e: any) {
      addToast('Error', e?.message || 'Could not save flashcard', 'alert');
    }
  };

  const handleSaveAllFlashcards = async () => {
    if (!studyCards.length) return;
    setIsSavingAllCards(true);
    try {
      const cardsToSave = studyCards.map(c => ({
        ...c,
        subject: c.subject || docTitle,
        masteryLevel: 'learning'
      }));
      const res = await fetch(`${API_BASE_URL}/api/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardsToSave)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updatedMap: { [id: string]: boolean } = {};
      studyCards.forEach(c => { updatedMap[c.id] = true; });
      setSavedCardIds(prev => ({ ...prev, ...updatedMap }));
      addToast('All Flashcards Saved!', `Added ${studyCards.length} cards to your revision library!`, 'success');
      addXp(50, 'Saved Study Pack to Revision');
    } catch (e: any) {
      addToast('Error', e?.message || 'Could not save cards', 'alert');
    } finally {
      setIsSavingAllCards(false);
    }
  };

  const handleSaveConceptAsFlashcard = async (
    concept: { term: string; definition: string; examSignificance: string },
    idx: number
  ) => {
    try {
      const card: Flashcard = {
        id: `fc-concept-${Date.now()}-${idx}`,
        front: `What is ${concept.term}?`,
        back: `${concept.definition}\n\nExam Note: ${concept.examSignificance}`,
        subject: docTitle,
        masteryLevel: 'learning'
      };
      await handleSaveFlashcard(card);
      setSavedConceptCards(prev => ({ ...prev, [idx]: true }));
    } catch (e) {
      console.error(e);
    }
  };

  // ==========================================
  // 1. AUDIO OVERVIEW LOGIC & SPEECH SYNTHESIS
  // ==========================================
  const handleGenerateAudioOverview = async () => {
    if (!sourceText.trim()) {
      addToast('Missing Source', 'Please enter or load source text first.', 'alert');
      return;
    }
    setIsLoading(true);
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsPlaying(false);
    setCurrentTurnIndex(0);

    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/notebook/audio-overview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docTitle: docTitle.trim() || 'Study Document',
          sourceText: sourceText.trim(),
          language: audioLanguage,
          userId: currentUser?.id
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: NotebookAudioOverview = await res.json();
      setAudioOverview(data);
      addToast('Audio Overview Created', `Generated ${data.turns.length}-turn podcast dialogue!`, 'success');
      addXp(60, 'Generated NotebookLM Audio Overview');
    } catch (err: any) {
      addToast('Audio Generation Failed', err?.message || 'Check server connection', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  const playTurn = (turnIndex: number, currentTurns: AudioTurn[]) => {
    if (!synthRef.current || !currentTurns || turnIndex >= currentTurns.length) {
      setIsPlaying(false);
      setCurrentTurnIndex(0);
      return;
    }

    synthRef.current.cancel();
    const turn = currentTurns[turnIndex];
    const cleanedText = cleanTurnTextForSpeech(turn.text);
    const utterance = new SpeechSynthesisUtterance(cleanedText);
    utterance.rate = playbackRate;

    const isAlex = turn.speaker === 'Alex';
    const activeLang = audioOverview?.language || audioLanguage;

    // Determine voice to use
    const targetVoiceName = isAlex ? alexVoiceName : samVoiceName;
    let chosenVoice = voices.find(v => v.name === targetVoiceName);

    if (!chosenVoice) {
      if (activeLang === 'hindi') {
        chosenVoice = isAlex
          ? (hindiVoices[0] || indianVoices[0] || voices[0])
          : (hindiVoices[1] || hindiVoices[0] || indianVoices[0] || voices[0]);
      } else if (activeLang === 'hinglish') {
        if (hinglishEngine === 'hi-IN' && hindiVoices.length > 0) {
          chosenVoice = isAlex
            ? hindiVoices[0]
            : (hindiVoices[1] || hindiVoices[0]);
        } else {
          chosenVoice = isAlex
            ? (indianVoices[0] || hindiVoices[0] || voices[0])
            : (indianVoices[1] || indianVoices[0] || hindiVoices[0] || voices[0]);
        }
      } else {
        chosenVoice = isAlex
          ? (otherVoices[0] || voices[0])
          : (otherVoices[1] || otherVoices[0] || voices[0]);
      }
    }

    if (chosenVoice) {
      utterance.voice = chosenVoice;
    }

    // Set utterance language
    if (activeLang === 'hindi') {
      utterance.lang = 'hi-IN';
    } else if (activeLang === 'hinglish') {
      if (chosenVoice && isHindiVoice(chosenVoice)) {
        utterance.lang = 'hi-IN';
      } else {
        utterance.lang = hinglishEngine;
      }
    } else {
      utterance.lang = chosenVoice?.lang || 'en-US';
    }

    if (isAlex) {
      utterance.pitch = 1.15; // Higher, curious & energetic
    } else {
      utterance.pitch = 0.88; // Deeper, calm & authoritative
    }

    utterance.onend = () => {
      if (turnIndex + 1 < currentTurns.length) {
        setCurrentTurnIndex(turnIndex + 1);
        playTurn(turnIndex + 1, currentTurns);
      } else {
        setIsPlaying(false);
        setCurrentTurnIndex(0);
        addToast('Podcast Finished', 'Audio Overview complete!', 'success');
      }
    };

    utterance.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('Speech synthesis error:', e);
      }
      setIsPlaying(false);
    };

    setCurrentTurnIndex(turnIndex);
    synthRef.current.speak(utterance);
    setIsPlaying(true);
  };

  const togglePlayAudio = () => {
    if (!audioOverview || !audioOverview.turns.length) return;
    if (isPlaying) {
      if (synthRef.current) synthRef.current.cancel();
      setIsPlaying(false);
    } else {
      playTurn(currentTurnIndex, audioOverview.turns);
    }
  };

  const restartAudio = () => {
    if (!audioOverview) return;
    if (synthRef.current) synthRef.current.cancel();
    setCurrentTurnIndex(0);
    playTurn(0, audioOverview.turns);
  };

  const skipTurn = (delta: number) => {
    if (!audioOverview) return;
    const nextIdx = Math.max(0, Math.min(audioOverview.turns.length - 1, currentTurnIndex + delta));
    if (synthRef.current) synthRef.current.cancel();
    setCurrentTurnIndex(nextIdx);
    if (isPlaying) {
      playTurn(nextIdx, audioOverview.turns);
    }
  };

  const copyTranscript = () => {
    if (!audioOverview) return;
    const fullText = audioOverview.turns
      .map(t => `${t.speaker} (${t.emotion || 'talk'}): ${t.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(fullText);
    setHasCopiedTranscript(true);
    setTimeout(() => setHasCopiedTranscript(false), 2000);
    addToast('Copied', 'Transcript copied to clipboard', 'info');
  };

  // ==========================================
  // 2. BRIEFING DOC LOGIC
  // ==========================================
  const handleGenerateBriefing = async () => {
    if (!sourceText.trim()) {
      addToast('Missing Source', 'Please enter or load source text first.', 'alert');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/notebook/briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docTitle: docTitle.trim() || 'Study Document',
          sourceText: sourceText.trim(),
          userId: currentUser?.id
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: NotebookBriefingDoc = await res.json();
      setBriefingDoc(data);
      setCheckedChecklist({});
      addToast('Briefing Ready', 'Comprehensive study guide synthesized!', 'success');
      addXp(50, 'Generated NotebookLM Study Guide');
    } catch (err: any) {
      addToast('Synthesis Failed', err?.message || 'Could not generate briefing doc', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  const copyBriefingMarkdown = () => {
    if (!briefingDoc) return;
    let md = `# Briefing Document: ${briefingDoc.docTitle}\n\n`;
    md += `## Executive Summary\n${briefingDoc.executiveSummary}\n\n`;
    md += `## Key Concepts\n`;
    briefingDoc.keyConcepts.forEach((c) => {
      md += `### ${c.term}\n- **Definition**: ${c.definition}\n- **Exam Significance**: ${c.examSignificance}\n\n`;
    });
    md += `## Frequently Asked Questions\n`;
    briefingDoc.faq.forEach((f) => {
      md += `**Q: ${f.question}**\nA: ${f.answer}\n\n`;
    });
    md += `## Critical Pitfalls & Traps\n`;
    briefingDoc.pitfallsAndTraps.forEach((p) => {
      md += `- ⚠️ ${p}\n`;
    });
    md += `\n## Revision Checklist\n`;
    briefingDoc.revisionChecklist.forEach((item) => {
      md += `- [ ] ${item}\n`;
    });

    navigator.clipboard.writeText(md);
    setHasCopiedBriefing(true);
    setTimeout(() => setHasCopiedBriefing(false), 2000);
    addToast('Copied', 'Briefing Document copied in Markdown format', 'info');
  };

  // ==========================================
  // 3. GROUNDED SOURCE CHAT LOGIC
  // ==========================================
  const handleSendChatMessage = async (presetQuestion?: string) => {
    const query = (presetQuestion || chatInput).trim();
    if (!query) return;
    if (!sourceText.trim()) {
      addToast('Missing Source', 'Please load a source document first.', 'alert');
      return;
    }

    const updated = [...chatMessages, { role: 'user' as const, text: query }];
    setChatMessages(updated);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const history = chatMessages.slice(-5).map(m => ({ role: m.role, text: m.text }));
      const res = await fetch(`${API_BASE_URL}/api/ai/notebook/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docTitle: docTitle.trim() || 'Study Document',
          sourceText: sourceText.trim(),
          question: query,
          history,
          userId: currentUser?.id
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: NotebookSourceAnswer = await res.json();
      setChatMessages([
        ...updated,
        {
          role: 'assistant',
          text: data.answer,
          citations: data.citations,
          followUps: data.suggestedFollowUps
        }
      ]);
      addXp(15, 'NotebookLM Source Q&A');
    } catch (err: any) {
      setChatMessages([
        ...updated,
        {
          role: 'assistant',
          text: 'I could not process that request against the source document. Please verify your connection.'
        }
      ]);
    } finally {
      setIsChatLoading(false);
      setTimeout(() => {
        chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  // ==========================================
  // 4. STUDY PACK (FLASHCARDS & QUIZ) LOGIC
  // ==========================================
  const handleGenerateStudyPack = async () => {
    if (!sourceText.trim()) {
      addToast('Missing Source', 'Please enter or load source text first.', 'alert');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/notebook/study-pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docTitle: docTitle.trim() || 'Study Document',
          sourceText: sourceText.trim(),
          userId: currentUser?.id
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStudyCards(data.flashcards || []);
      setStudyQuiz(data.quiz || []);
      setActiveCardIdx(0);
      setIsCardFlipped(false);
      setSelectedQuizAnswers({});
      setShowQuizResult(false);
      addToast('Study Pack Ready', `Created ${data.flashcards?.length || 0} cards and ${data.quiz?.length || 0} quiz items!`, 'success');
      addXp(40, 'Generated Source Study Pack');
    } catch (err: any) {
      addToast('Generation Failed', err?.message || 'Could not generate study pack', 'alert');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-violet-950/60 via-indigo-950/50 to-slate-900 border border-violet-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-violet-500/20 text-violet-300 border border-violet-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-violet-400" />
                NotebookLM Studio
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Gemini 3.8 Flash Grounded
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Interactive Source Studio & Audio Deep Dive</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mt-1 leading-relaxed">
              Upload notes or paste study material to generate 2-host audio podcast discussions, executive study guides,
              grounded Q&A with direct source citations, and active recall study packs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
            {/* PDF Upload Button */}
            <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-2 border border-violet-400/30 transition-all shadow-md shadow-violet-900/30">
              {isExtractingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" /> : <FileText className="w-3.5 h-3.5 text-violet-200" />}
              <span>{isExtractingPdf ? 'Extracting PDF...' : '📄 Upload PDF Notes / Book'}</span>
              <input type="file" accept=".pdf,application/pdf" onChange={handlePdfUpload} disabled={isExtractingPdf} className="hidden" />
            </label>

            {/* Text / Markdown Upload */}
            <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-2 border border-white/15 transition-all shadow-sm">
              <Upload className="w-3.5 h-3.5 text-violet-300" />
              <span>Import .txt/.md</span>
              <input type="file" accept=".txt,.md,.text" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* SOURCE DOCUMENT ACCORDION / INPUT */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Active Source Document</span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-slate-400 font-mono">
              {wordCount.toLocaleString()} words · {charCount.toLocaleString()} chars
            </span>
            {pdfInfo && (
              <span className="text-[11px] px-2.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold flex items-center gap-1">
                <FileCheck className="w-3.5 h-3.5 text-violet-400" />
                <span>PDF: {pdfInfo.pageCount} Pages</span>
              </span>
            )}
            {isExtractingPdf && (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium flex items-center gap-1.5 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-amber-300" />
                <span>{pdfProgress}</span>
              </span>
            )}
          </div>

          <button
            onClick={() => setIsSourceCollapsed(!isSourceCollapsed)}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <span>{isSourceCollapsed ? 'Edit Source' : 'Collapse'}</span>
            {isSourceCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Sample Presets */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">Load Preset:</span>
          {SAMPLE_SOURCES.map((sample, idx) => (
            <button
              key={idx}
              onClick={() => handleLoadSample(sample)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap border transition-all ${
                docTitle === sample.title
                  ? 'bg-violet-600/30 text-violet-200 border-violet-500/40'
                  : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10'
              }`}
            >
              {sample.title}
            </button>
          ))}
        </div>

        {!isSourceCollapsed && (
          <div className="space-y-2 pt-1 animate-in fade-in duration-200">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">
                Document / Chapter Title
              </label>
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g. Chapter 4: Thermodynamics & Engine Cycles"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">
                Source Text (Pasted Notes, Syllabus, or Book Passage)
              </label>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                rows={6}
                placeholder="Paste the chapter text, lecture transcript, or study notes here..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 text-xs text-slate-200 font-sans leading-relaxed placeholder:text-slate-600 focus:outline-none focus:border-violet-400 transition-colors resize-y"
              />
            </div>
          </div>
        )}
      </div>

      {/* STUDIO MODE TABS */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto">
        {[
          { id: 'audio', label: '🎙️ Audio Overview (Podcast)', icon: Mic, badge: 'Popular' },
          { id: 'briefing', label: '📑 Briefing Doc & Guide', icon: FileText },
          { id: 'chat', label: '💬 Grounded Source Q&A', icon: MessageSquare },
          { id: 'studypack', label: '🎴 Flashcards & Quiz', icon: Layers }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = studioTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setStudioTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/25 ring-1 ring-violet-400'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-violet-400 text-slate-950">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* SUBTAB 1: AUDIO OVERVIEW (2-HOST PODCAST)                */}
      {/* ======================================================== */}
      {studioTab === 'audio' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Action Trigger Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-950/30 via-slate-900 to-slate-900 border border-violet-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Mic className="w-4 h-4 text-violet-400" />
                <span>2-Host Audio Deep Dive (Alex & Sam)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Generates a lively, natural conversation between two co-hosts breaking down the source material with
                intuitive analogies and exam insights.
              </p>

              {/* Language Selector */}
              <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                  <Languages className="w-3.5 h-3.5 text-violet-400" />
                  Podcast Language:
                </span>
                {[
                  { id: 'hinglish', label: '🇮🇳 Hinglish', desc: 'Hindi + English Mix' },
                  { id: 'hindi', label: '🇮🇳 हिंदी (Hindi)', desc: 'Pure Hindi' },
                  { id: 'english', label: '🌐 English', desc: 'Global English' }
                ].map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setAudioLanguage(l.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      audioLanguage === l.id
                        ? 'bg-violet-600 text-white border-violet-400 shadow-sm'
                        : 'bg-white/5 text-slate-400 border-white/5 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}

                <button
                  onClick={() => setShowVoiceSettings(!showVoiceSettings)}
                  className={`ml-auto px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                    showVoiceSettings
                      ? 'bg-violet-500/20 text-violet-200 border-violet-400'
                      : 'bg-white/5 text-slate-300 border-white/10 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Headphones className="w-3.5 h-3.5 text-violet-400" />
                  <span>Speaker Voices</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-slate-300">
                    {hindiVoices.length > 0 ? `${hindiVoices.length} Hindi Voices` : 'Setup'}
                  </span>
                </button>
              </div>

              {/* Collapsible Speaker Voice Settings Panel */}
              {showVoiceSettings && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-violet-500/30 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-violet-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Speaker Voices & Hindi / Hinglish Setup
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {voices.length} system voices detected
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Alex Voice Selector */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-bold text-violet-300 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-violet-400" />
                          <span>Host 1 (Alex - Energetic / Curious):</span>
                        </label>
                        <button
                          onClick={() => handleTestVoice('Alex')}
                          disabled={testingSpeaker !== null}
                          className="px-2 py-0.5 rounded bg-violet-600/30 hover:bg-violet-600/50 text-violet-200 text-[10px] font-semibold flex items-center gap-1 border border-violet-500/30"
                        >
                          {testingSpeaker === 'Alex' ? (
                            <>
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              <span>Speaking...</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-2.5 h-2.5 text-amber-300" />
                              <span>Test Voice</span>
                            </>
                          )}
                        </button>
                      </div>
                      <select
                        value={alexVoiceName}
                        onChange={(e) => handleSelectAlexVoice(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/15 text-xs text-white focus:outline-none focus:border-violet-400"
                      >
                        {hindiVoices.length > 0 && (
                          <optgroup label="🇮🇳 Native Hindi Voices (Best for Hindi / Hinglish)">
                            {hindiVoices.map((v, i) => (
                              <option key={i} value={v.name}>
                                {v.name} ({v.lang})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {indianVoices.length > 0 && (
                          <optgroup label="🇮🇳 Indian English Voices">
                            {indianVoices.map((v, i) => (
                              <option key={i} value={v.name}>
                                {v.name} ({v.lang})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {otherVoices.length > 0 && (
                          <optgroup label="🌐 Other System Voices">
                            {otherVoices.map((v, i) => (
                              <option key={i} value={v.name}>
                                {v.name} ({v.lang})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    {/* Sam Voice Selector */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-bold text-cyan-300 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          <span>Host 2 (Sam - Analytical / Deep):</span>
                        </label>
                        <button
                          onClick={() => handleTestVoice('Sam')}
                          disabled={testingSpeaker !== null}
                          className="px-2 py-0.5 rounded bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 text-[10px] font-semibold flex items-center gap-1 border border-cyan-500/30"
                        >
                          {testingSpeaker === 'Sam' ? (
                            <>
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              <span>Speaking...</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-2.5 h-2.5 text-amber-300" />
                              <span>Test Voice</span>
                            </>
                          )}
                        </button>
                      </div>
                      <select
                        value={samVoiceName}
                        onChange={(e) => handleSelectSamVoice(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
                      >
                        {hindiVoices.length > 0 && (
                          <optgroup label="🇮🇳 Native Hindi Voices (Best for Hindi / Hinglish)">
                            {hindiVoices.map((v, i) => (
                              <option key={i} value={v.name}>
                                {v.name} ({v.lang})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {indianVoices.length > 0 && (
                          <optgroup label="🇮🇳 Indian English Voices">
                            {indianVoices.map((v, i) => (
                              <option key={i} value={v.name}>
                                {v.name} ({v.lang})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {otherVoices.length > 0 && (
                          <optgroup label="🌐 Other System Voices">
                            {otherVoices.map((v, i) => (
                              <option key={i} value={v.name}>
                                {v.name} ({v.lang})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Hinglish Engine Mode Selector */}
                  <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-semibold text-slate-300 block">Hinglish Pronunciation Engine:</span>
                      <span className="text-[11px] text-slate-400">
                        Choose phonetic engine used when speaking Romanized Hindi
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSelectHinglishEngine('hi-IN')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          hinglishEngine === 'hi-IN'
                            ? 'bg-violet-600 text-white border-violet-400 shadow-sm'
                            : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                        }`}
                      >
                        🇮🇳 Native Hindi Engine (hi-IN) - Recommended
                      </button>
                      <button
                        onClick={() => handleSelectHinglishEngine('en-IN')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          hinglishEngine === 'en-IN'
                            ? 'bg-violet-600 text-white border-violet-400 shadow-sm'
                            : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                        }`}
                      >
                        🇮🇳 Indian English Engine (en-IN)
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 text-[11px] text-slate-400 leading-relaxed">
                    💡 <span className="text-violet-300 font-semibold">Pro-tip for Windows:</span> In Microsoft Edge & Windows 10/11, <strong className="text-white">"Microsoft Swara"</strong> and <strong className="text-white">"Microsoft Madhur"</strong> provide natural studio-grade Hindi speech. In Chrome, <strong className="text-white">"Google हिन्दी"</strong> provides authentic Hindi pronunciation.
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleGenerateAudioOverview}
              disabled={isLoading}
              className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-violet-600/30 transition-all shrink-0"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>
                {isLoading
                  ? 'Creating Audio Script...'
                  : `Generate in ${audioLanguage === 'hindi' ? 'हिंदी' : audioLanguage === 'hinglish' ? 'Hinglish' : 'English'}`}
              </span>
            </button>
          </div>

          {/* Player & Dialogue Transcript */}
          {audioOverview && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl space-y-6">
              {/* Podcast Header & Player Controls */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-violet-500/20 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                        NotebookLM Audio Deep Dive
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-violet-500/10 text-violet-300 border border-violet-500/20">
                        {audioOverview.language === 'hindi'
                          ? '🇮🇳 हिंदी'
                          : audioOverview.language === 'hinglish'
                          ? '🇮🇳 Hinglish'
                          : '🌐 English'}
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-white mt-0.5">{audioOverview.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5 italic">{audioOverview.tagline}</p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-white/5 text-slate-300 border border-white/5 font-mono">
                      ⏱️ {audioOverview.durationEstimate}
                    </span>
                    <button
                      onClick={copyTranscript}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs flex items-center gap-1.5 border border-white/10 transition-colors"
                    >
                      {hasCopiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{hasCopiedTranscript ? 'Copied' : 'Copy Transcript'}</span>
                    </button>
                  </div>
                </div>

                {/* Animated Equalizer Waveform */}
                <div className="h-10 bg-slate-900 rounded-xl px-4 flex items-center justify-between border border-white/5">
                  <div className="flex items-center gap-1 w-full justify-center">
                    {[40, 70, 30, 85, 55, 95, 45, 60, 80, 50, 75, 35, 90, 65, 40, 85, 55, 70, 45, 60, 30, 75].map((h, i) => (
                      <div
                        key={i}
                        className={`w-1.5 rounded-full transition-all duration-200 ${
                          isPlaying ? 'bg-violet-400 animate-pulse' : 'bg-slate-700'
                        }`}
                        style={{
                          height: isPlaying ? `${Math.max(12, (h * (currentTurnIndex % 3 + 1)) % 36)}px` : '6px',
                          animationDelay: `${(i * 70) % 600}ms`
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Audio Controls Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => skipTurn(-1)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                      title="Previous Turn"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>

                    <button
                      onClick={togglePlayAudio}
                      className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg ${
                        isPlaying
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                          : 'bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/30'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                      <span>{isPlaying ? 'Pause Audio' : 'Play Audio Overview'}</span>
                    </button>

                    <button
                      onClick={() => skipTurn(1)}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                      title="Next Turn"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>

                    <button
                      onClick={restartAudio}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                      title="Restart from beginning"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Playback speed selector & Voices toggle */}
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <button
                      onClick={() => setShowVoiceSettings(!showVoiceSettings)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                        showVoiceSettings
                          ? 'bg-violet-500/20 text-violet-200 border-violet-400'
                          : 'bg-white/5 text-slate-300 border-white/10 hover:text-white'
                      }`}
                      title="Adjust Host Voices"
                    >
                      <Settings2 className="w-3.5 h-3.5 text-violet-400" />
                      <span className="hidden sm:inline">Voices</span>
                    </button>

                    <span className="text-[11px] font-semibold">Speed:</span>
                    {[0.8, 1.0, 1.25, 1.5].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => {
                          setPlaybackRate(speed);
                          if (isPlaying) {
                            playTurn(currentTurnIndex, audioOverview.turns);
                          }
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-all ${
                          playbackRate === speed
                            ? 'bg-violet-600 text-white'
                            : 'bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Conversational Script Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                  <span className="font-bold uppercase tracking-wider text-[11px]">Interactive Transcript</span>
                  <span>Turn {currentTurnIndex + 1} of {audioOverview.turns.length}</span>
                </div>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {audioOverview.turns.map((turn, idx) => {
                    const isAlex = turn.speaker === 'Alex';
                    const isCurrent = currentTurnIndex === idx;

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setCurrentTurnIndex(idx);
                          playTurn(idx, audioOverview.turns);
                        }}
                        className={`p-4 rounded-xl cursor-pointer transition-all border ${
                          isCurrent
                            ? isAlex
                              ? 'bg-violet-950/60 border-violet-400 shadow-lg shadow-violet-900/30 ring-1 ring-violet-400'
                              : 'bg-cyan-950/60 border-cyan-400 shadow-lg shadow-cyan-900/30 ring-1 ring-cyan-400'
                            : 'bg-slate-950/40 border-white/5 hover:border-white/15 hover:bg-slate-950/60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                isAlex
                                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              }`}
                            >
                              {turn.speaker}
                            </span>
                            {turn.emotion && (
                              <span className="text-[10px] text-slate-500 italic">
                                ({turn.emotion})
                              </span>
                            )}
                          </div>

                          {isCurrent && isPlaying && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                              <Radio className="w-3 h-3 animate-ping" />
                              Speaking now
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
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SUBTAB 2: BRIEFING DOC & STUDY GUIDE                     */}
      {/* ======================================================== */}
      {studioTab === 'briefing' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Action Trigger Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/30 via-slate-900 to-slate-900 border border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Executive Study Guide & Briefing Document</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Synthesizes executive summaries, key concept pillars, high-probability exam FAQs, traps, and revision checklists.
              </p>
            </div>

            <button
              onClick={handleGenerateBriefing}
              disabled={isLoading}
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all shrink-0"
            >
              <Sparkles className="w-4 h-4 text-cyan-300" />
              <span>{isLoading ? 'Synthesizing...' : 'Generate Briefing Doc'}</span>
            </button>
          </div>

          {/* Generated Document */}
          {briefingDoc && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl space-y-6">
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                    Executive Briefing
                  </span>
                  <h3 className="text-lg font-black text-white mt-0.5">{briefingDoc.docTitle}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={copyBriefingMarkdown}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs flex items-center gap-1.5 border border-white/10 transition-colors"
                  >
                    {hasCopiedBriefing ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{hasCopiedBriefing ? 'Copied' : 'Export Markdown'}</span>
                  </button>
                </div>
              </div>

              {/* 1. Executive Summary */}
              <div className="p-5 rounded-xl bg-slate-950/70 border border-indigo-500/20 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Executive Summary</span>
                </h4>
                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                  {briefingDoc.executiveSummary}
                </div>
              </div>

              {/* 2. Key Concepts Pillars */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Key Concepts & Definitions</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {briefingDoc.keyConcepts.map((item, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-950/50 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-indigo-300">{item.term}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleSaveConceptAsFlashcard(item, idx)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all ${
                              savedConceptCards[idx]
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                            }`}
                            title="Save this concept as an active recall flashcard"
                          >
                            {savedConceptCards[idx] ? <Check className="w-3 h-3 text-emerald-400" /> : <Plus className="w-3 h-3" />}
                            <span>{savedConceptCards[idx] ? 'Card Added' : '+ Flashcard'}</span>
                          </button>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Core Concept
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{item.definition}</p>
                      {item.examSignificance && (
                        <div className="text-[11px] text-amber-300/90 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 flex items-start gap-1.5">
                          <span className="font-bold">Exam Impact:</span>
                          <span>{item.examSignificance}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Frequently Asked Exam Questions */}
              {briefingDoc.faq.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                    <span>High-Yield Exam Questions</span>
                  </h4>

                  <div className="space-y-2.5">
                    {briefingDoc.faq.map((f, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-slate-950/50 border border-white/5 space-y-1.5">
                        <div className="text-xs font-bold text-cyan-200 flex items-start gap-2">
                          <span className="text-cyan-400">Q{idx + 1}:</span>
                          <span>{f.question}</span>
                        </div>
                        <div className="text-xs text-slate-300 pl-5 leading-relaxed">
                          {f.answer}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Common Traps & Misconceptions */}
              {briefingDoc.pitfallsAndTraps.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Critical Traps & Misconceptions</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {briefingDoc.pitfallsAndTraps.map((pitfall, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/20 text-xs text-rose-200 flex items-start gap-2.5 leading-relaxed"
                      >
                        <span className="font-bold text-rose-400">⚠️</span>
                        <span>{pitfall}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. Active Recall Checklist */}
              {briefingDoc.revisionChecklist.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Active Recall Revision Checklist</span>
                  </h4>

                  <div className="space-y-2">
                    {briefingDoc.revisionChecklist.map((item, idx) => {
                      const isChecked = Boolean(checkedChecklist[idx]);
                      return (
                        <div
                          key={idx}
                          onClick={() => setCheckedChecklist({ ...checkedChecklist, [idx]: !isChecked })}
                          className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300 line-through'
                              : 'bg-slate-950/40 border-white/5 text-slate-300 hover:border-white/15'
                          }`}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <span className="text-xs select-none">{item}</span>
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

      {/* ======================================================== */}
      {/* SUBTAB 3: GROUNDED SOURCE CHAT                           */}
      {/* ======================================================== */}
      {studioTab === 'chat' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-5 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl flex flex-col h-[580px]">
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Source Grounded Q&A
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-medium">
                  {docTitle}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 italic">Answers cite source quotes</span>
            </div>

            {/* Chat Stream */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {chatMessages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[85%] p-4 rounded-2xl text-xs leading-relaxed space-y-2.5 ${
                        isUser
                          ? 'bg-violet-600 text-white rounded-br-none shadow-md shadow-violet-600/20'
                          : 'bg-slate-950/80 border border-white/10 text-slate-200 rounded-bl-none shadow-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.text}</p>

                      {/* Direct Citations Box */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="pt-2 border-t border-white/10 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
                            Source Citations:
                          </span>
                          {msg.citations.map((cite, cIdx) => (
                            <div key={cIdx} className="text-[11px] text-slate-400 italic bg-white/5 p-2 rounded border border-white/5">
                              "{cite}"
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Follow-up question chips */}
                      {msg.followUps && msg.followUps.length > 0 && (
                        <div className="pt-2 border-t border-white/10 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                            Suggested Follow-Ups:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.followUps.map((fu, fIdx) => (
                              <button
                                key={fIdx}
                                onClick={() => handleSendChatMessage(fu)}
                                className="text-[10px] text-slate-300 bg-white/5 hover:bg-white/15 px-2.5 py-1 rounded-lg border border-white/10 transition-colors text-left"
                              >
                                {fu} →
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isChatLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400 italic p-3">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                  <span>Searching source text & synthesizing grounded response...</span>
                </div>
              )}
              <div ref={chatScrollRef} />
            </div>

            {/* Chat Input Bar */}
            <div className="pt-3 border-t border-white/10 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isChatLoading && handleSendChatMessage()}
                placeholder={`Ask any question about "${docTitle}"...`}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-950 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-400 transition-colors"
              />
              <button
                onClick={() => handleSendChatMessage()}
                disabled={isChatLoading || !chatInput.trim()}
                className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-violet-600/30 transition-all disabled:opacity-50"
              >
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUBTAB 4: SOURCE FLASHCARDS & QUIZ                       */}
      {/* ======================================================== */}
      {studioTab === 'studypack' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Action Trigger Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Grounded Study Pack (Spaced Repetition & Mock Quiz)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Generates active recall flashcards and multiple-choice questions strictly tested against your loaded source material.
              </p>
            </div>

            <button
              onClick={handleGenerateStudyPack}
              disabled={isLoading}
              className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all shrink-0"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>{isLoading ? 'Generating Pack...' : 'Generate Source Study Pack'}</span>
            </button>
          </div>

          {/* Flashcard Section */}
          {studyCards.length > 0 && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Active Recall Flashcards ({activeCardIdx + 1}/{studyCards.length})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveAllFlashcards}
                    disabled={isSavingAllCards}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-200 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{isSavingAllCards ? 'Saving All...' : '📥 Save All to My Flashcards'}</span>
                  </button>
                </div>
              </div>

              {/* 3D Flip Flashcard */}
              <div
                onClick={() => setIsCardFlipped(!isCardFlipped)}
                className="min-h-[180px] p-6 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/30 shadow-xl flex flex-col justify-between cursor-pointer hover:border-emerald-400 transition-all text-center select-none"
              >
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  <span>{isCardFlipped ? 'Answer (Self-Check)' : 'Question / Prompt'}</span>
                  {savedCardIds[studyCards[activeCardIdx]?.id] && (
                    <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      <Check className="w-3 h-3" /> Saved in Vault
                    </span>
                  )}
                </div>

                <div className="text-sm sm:text-base font-semibold text-white my-auto px-4 py-2 leading-relaxed">
                  {isCardFlipped ? studyCards[activeCardIdx].back : studyCards[activeCardIdx].front}
                </div>

                <div className="text-[10px] text-slate-500">
                  {isCardFlipped ? 'Tap to see prompt' : 'Tap to reveal answer'}
                </div>
              </div>

              {/* Navigation & Save Controls */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  onClick={() => {
                    setActiveCardIdx(Math.max(0, activeCardIdx - 1));
                    setIsCardFlipped(false);
                  }}
                  disabled={activeCardIdx === 0}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold disabled:opacity-30 transition-colors"
                >
                  ← Previous Card
                </button>

                <button
                  onClick={() => handleSaveFlashcard(studyCards[activeCardIdx])}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                    savedCardIds[studyCards[activeCardIdx]?.id]
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-600/20'
                  }`}
                >
                  {savedCardIds[studyCards[activeCardIdx]?.id] ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Saved in Flashcards</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Save Card to My Flashcards</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setActiveCardIdx(Math.min(studyCards.length - 1, activeCardIdx + 1));
                    setIsCardFlipped(false);
                  }}
                  disabled={activeCardIdx === studyCards.length - 1}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold disabled:opacity-30 transition-colors"
                >
                  Next Card →
                </button>
              </div>

              {/* Helper sync banner */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-200 flex items-center justify-between">
                <span>💡 Tip: Saved flashcards are synchronized with the <strong>🎴 Flashcards (SM-2)</strong> tab for spaced repetition and mastery tracking.</span>
              </div>
            </div>
          )}

          {/* Quiz Section */}
          {studyQuiz.length > 0 && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Source-Grounded MCQ Assessment
                </span>
                <span className="text-xs text-slate-400">{studyQuiz.length} Questions</span>
              </div>

              <div className="space-y-4">
                {studyQuiz.map((q, qIdx) => {
                  const userChoice = selectedQuizAnswers[q.id];
                  const hasAnswered = typeof userChoice === 'number';

                  return (
                    <div key={q.id} className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-3">
                      <div className="text-xs font-bold text-white flex items-start gap-2">
                        <span className="text-cyan-400 font-mono">Q{qIdx + 1}:</span>
                        <span>{q.question}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = userChoice === optIdx;
                          const isCorrect = q.correctAnswer === optIdx;
                          let btnStyle = 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10';

                          if (showQuizResult) {
                            if (isCorrect) {
                              btnStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 font-semibold';
                            } else if (isSelected && !isCorrect) {
                              btnStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/50 line-through';
                            }
                          } else if (isSelected) {
                            btnStyle = 'bg-cyan-600/30 text-cyan-200 border-cyan-400 font-semibold';
                          }

                          return (
                            <button
                              key={optIdx}
                              onClick={() => setSelectedQuizAnswers({ ...selectedQuizAnswers, [q.id]: optIdx })}
                              disabled={showQuizResult}
                              className={`p-3 rounded-xl border text-left text-xs transition-all flex items-center gap-2 ${btnStyle}`}
                            >
                              <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span className="flex-1 leading-snug">{opt}</span>
                            </button>
                          );
                        })}
                      </div>

                      {showQuizResult && (
                        <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-[11px] text-slate-300 space-y-1">
                          <span className="font-bold text-cyan-300">Explanation:</span>
                          <p>{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowQuizResult(!showQuizResult)}
                  className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/25 transition-all"
                >
                  {showQuizResult ? 'Hide Answers' : 'Check Answers & Explanations'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
