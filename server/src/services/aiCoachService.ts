import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { storage, localDateKey } from './storageService.js';
import { gemini, DEFAULT_GEMINI_MODEL } from './geminiService.js';
import { neuralTts } from './neuralTtsService.js';
import { StudyTask, QuizQuestion, Flashcard } from '../types.js';

/** Where a given payload came from — surfaced so the UI can be honest about it. */
export type AISource = 'gemini' | 'fallback';

export interface ScheduleParseResult {
  message: string;
  task: StudyTask;
  suggestedSchedule: Array<{ time: string; activity: string; duration: string }>;
  source: AISource;
}

export interface DoubtSolution {
  explanation: string;
  steps: string[];
  keyFormula?: string;
  practiceTip: string;
  source: AISource;
}

export interface HandwrittenNotes {
  title: string;
  date: string;
  studentName: string;
  sections: Array<{
    heading: string;
    notes: string[];
    highlight?: string;
    sketch?: string;
  }>;
  source: AISource;
}

export interface LectureSummary {
  videoUrl: string;
  title: string;
  channel: string;
  duration: string;
  summary: string;
  chapters: Array<{ timestamp: string; title: string; takeaway: string }>;
  quickQuiz: string[];
  source: AISource;
}

/** What the PDF reader asked the AI to do. */
export type PdfAssistMode = 'page' | 'selection' | 'question';

export interface AiBlockData {
  type: 'concept' | 'formula' | 'steps' | 'shortcut' | 'trap' | 'quiz' | 'key_points';
  title?: string;
  content?: string;
  latex?: string;
  variables?: Array<{ symbol: string; label: string }>;
  shortcutNote?: string;
  steps?: Array<{ stepNumber: number; title: string; explanation: string; latex?: string }>;
  trick?: string;
  speedGain?: string;
  warning?: string;
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  points?: string[];
}

export interface PdfAssistResult {
  mode: PdfAssistMode;
  heading: string;
  explanation: string;
  keyPoints: string[];
  formula?: string;
  followUp?: string;
  source: AISource;
  modelUsed?: string;
  blocks?: AiBlockData[];
  topic?: string;
  difficulty?: 'Basic' | 'Moderate' | 'Exam Standard';
}

// NotebookLM Types
export interface AudioTurn {
  speaker: 'Aarav' | 'Ananya' | 'Alex' | 'Sam';
  text: string;
  emotion?: string;
}

export interface NotebookAudioOverview {
  id?: string;
  docTitle: string;
  title: string;
  tagline: string;
  durationEstimate: string;
  language?: 'hinglish' | 'hindi' | 'english';
  turns: AudioTurn[];
  source: AISource;
  telegramFileId?: string;
  telegramMessageId?: number;
  createdAt?: string;
}

export interface NotebookBriefingDoc {
  docTitle: string;
  executiveSummary: string;
  keyConcepts: Array<{ term: string; definition: string; examSignificance: string }>;
  faq: Array<{ question: string; answer: string }>;
  pitfallsAndTraps: string[];
  revisionChecklist: string[];
  source: AISource;
}

export interface NotebookSourceAnswer {
  question: string;
  answer: string;
  citations: string[];
  suggestedFollowUps: string[];
  source: AISource;
}

export interface NotebookStudyPack {
  docTitle: string;
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
  source: AISource;
}

// Keeps prompts (and therefore cost/latency) bounded on large or dense pages.
const MAX_PAGE_CHARS = 10000;
const MAX_SELECTION_CHARS = 1500;
const MAX_NOTEBOOK_SOURCE_CHARS = 120000;
const PODCAST_SCRIPT_SEGMENT_CHARS = 36000;
const PODCAST_SCRIPT_CACHE_VERSION = 'v1';

const EXAM_COACH_PERSONA =
  'You are StudyOS AI Coach, a world-class expert mentor and tutor for students preparing for competitive exams ' +
  '(such as Banking, SSC, Railways, State PSC, UPSC, Engineering, and Science) as well as academic study.\n\n' +
  'CORE TEACHING PRINCIPLES:\n' +
  '1. ADAPTIVE LANGUAGE MIRRORING:\n' +
  '   - If the student asks in Hindi (Devanagari script), reply in natural, clear, polite Hindi with technical terms in brackets.\n' +
  '   - If the student asks in Hinglish (Romanized Hindi, e.g. "samjhao na", "kaise aaya", "shortcut trick batao"), reply in friendly, conversational, enthusiastic Hinglish (e.g., "Dekhiye, is problem ko solve karne ke 2 methods hain: 1st Basic Concept aur 2nd Exam Shortcut Trick...").\n' +
  '   - If the student asks in English, reply in articulate, polished English.\n' +
  '   - If the student asks for a specific language (e.g., "Hindi me", "explain in English"), strictly follow their request.\n\n' +
  '2. COMPLETE PEDAGOGICAL DEPTH & STRUCTURE (NEVER GIVE SHORT/CURT ANSWERS):\n' +
  '   - Do NOT give lazy 1-line or 2-sentence answers unless the user explicitly asks for a "1-line summary".\n' +
  '   - For mathematical, reasoning, and conceptual problems, ALWAYS provide:\n' +
  '     a) Core Concept & Given Values.\n' +
  '     b) Step-by-Step Detailed Method (bina kisi calculation step ko skip kiye).\n' +
  '     c) Standard Mathematical Formula in LaTeX notation.\n' +
  '     d) Exam Shortcut / Speed Trick (fast calculation hacks essential for exams).\n' +
  '     e) 💡 Pro Tip & ⚠️ Common Mistake / Exam Trap to avoid.\n\n' +
  '3. MATHEMATICAL & NOTATIONAL FORMATTING:\n' +
  '   - Always write centered display math using double dollar blocks: $$<latex>$$\n' +
  '   - Always write inline math using single dollar signs: $<latex>$\n' +
  '   - Use standard LaTeX commands like \\frac{a}{b}, \\sqrt{x}, x^2, \\times, \\pm, \\text{...}\n' +
  '   - Use Markdown bold (**text**), bullet lists, and tables with pipe (|) borders for tabular comparisons.\n' +
  '   - Never leave formulas unformatted.';

const PODCAST_CHECKPOINT_DIR = path.join(process.cwd(), 'data', 'podcast_checkpoints');
if (!fs.existsSync(PODCAST_CHECKPOINT_DIR)) {
  try {
    fs.mkdirSync(PODCAST_CHECKPOINT_DIR, { recursive: true });
  } catch {}
}

export interface PodcastBackgroundJob {
  jobId: string;
  userId?: string;
  docTitle: string;
  language: 'hinglish' | 'hindi' | 'english';
  voiceStyle?: string;
  ttsModel?: string;
  status: 'generating_script' | 'synthesizing_audio' | 'completed' | 'failed';
  progressText: string;
  segmentsCompleted: number;
  totalSegments: number;
  turnsGenerated: number;
  startedAt: string;
  updatedAt: string;
  podcastId?: string;
  podcast?: NotebookAudioOverview;
  error?: string;
}

export class AICoachService {
  private podcastGenerationInFlight = new Map<string, Promise<NotebookAudioOverview>>();
  private podcastJobs = new Map<string, PodcastBackgroundJob>();

  public getActivePodcastJobs(userId?: string): PodcastBackgroundJob[] {
    const now = Date.now();
    const results: PodcastBackgroundJob[] = [];
    for (const [key, job] of this.podcastJobs.entries()) {
      const updatedMs = new Date(job.updatedAt).getTime() || now;
      const isFinished = job.status === 'completed' || job.status === 'failed';
      // Keep finished jobs visible for 6 hours so laptops closed for hours can observe completion
      if (isFinished && now - updatedMs > 6 * 60 * 60 * 1000) {
        this.podcastJobs.delete(key);
        continue;
      }
      if (!userId || !job.userId || job.userId === userId) {
        results.push(job);
      }
    }
    return results;
  }

  /** Model id currently in use, for the client status badge. */
  public getModel(): string {
    return gemini.getModel();
  }

  public isEnabled(): boolean {
    return gemini.isConfigured();
  }

  public getStatus() {
    return {
      enabled: this.isEnabled(),
      provider: 'gemini' as const,
      model: this.getModel(),
      defaultModel: DEFAULT_GEMINI_MODEL
    };
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /** Compact, factual description of the learner used to ground every prompt. */
  private buildLearnerContext(userId?: string): string {
    const lines: string[] = [];
    const user = userId ? storage.getUser(userId) : undefined;

    if (user) {
      lines.push(`Learner name: ${user.name || user.username || 'Student'}`);
      if (user.targetExam) lines.push(`Target exam: ${user.targetExam}`);
      if (typeof user.streak === 'number') lines.push(`Current study streak: ${user.streak} day(s)`);
    }

    if (userId) {
      const summary = storage.getUserDailyActivitySummary(userId);
      lines.push(`Studied today: ${summary.todayHours} hour(s) over ${summary.sessionCount} session(s)`);
      const subjects = Object.keys(summary.subjectBreakdown);
      if (subjects.length) lines.push(`Today's subjects: ${subjects.slice(0, 5).join(', ')}`);

      const pending = storage.getTasks(userId).filter(t => !t.completed);
      if (pending.length) {
        const listed = pending
          .slice(0, 5)
          .map(t => `${t.title} (${t.subject}, ${t.durationMinutes}m on ${t.targetDate})`)
          .join('; ');
        lines.push(`Pending tasks: ${listed}`);
      }
    }

    return lines.length ? lines.join('\n') : 'No learner profile data available yet.';
  }

  private cleanString(value: unknown, maxLength = 400): string | undefined {
    if (typeof value !== 'string') return undefined;
    let trimmed = value.trim();
    // Normalize literal escaped newlines and tabs from LLM outputs without corrupting LaTeX commands
    trimmed = trimmed
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n(?!(?:eq|abla|atural|earrow|eg|cong|equiv|e\b|ew|exists|geq|geqq|gtr|i\b|Leftarrow|leftarrow|Leftrightarrow|leftrightarrow|leq|leqq|less|mid|obreak|ormalsize|otin|ot\b|parallel|prec|preceq|Rightarrow|rightarrow|shortmid|shortparallel|sim|subseteq|succ|succeq|supseteq|triangleleft|trianglelefteq|triangleright|trianglerighteq|u\b|VDash|Vdash|vDash|vdash)\b)/g, '\n')
      .replace(/\\r(?!(?:angle|brace|ceil|floor|group|ight|ho|m\b|oot|ule)\b)/g, '\n')
      .replace(/\\t(?!(?:au|ext|an|heta|imes|o\b|op|riangle|ilde|ag)\b)/g, '  ');
    return trimmed ? trimmed.slice(0, maxLength) : undefined;
  }

  private cleanStringArray(value: unknown, maxItems = 8, maxLength = 400): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map(v => this.cleanString(v, maxLength))
      .filter((v): v is string => Boolean(v))
      .slice(0, maxItems);
  }

  private synthesizeBlocksFromData(opts: {
    heading?: string;
    explanation: string;
    formula?: string;
    keyPoints?: string[];
    followUp?: string;
    existingBlocks?: any[];
  }): AiBlockData[] {
    // If valid blocks already exist from Gemini, clean, validate and return them
    if (Array.isArray(opts.existingBlocks) && opts.existingBlocks.length > 0) {
      const validBlocks: AiBlockData[] = [];
      for (const b of opts.existingBlocks) {
        if (!b || typeof b !== 'object') continue;
        const type = b.type;
        if (type === 'formula' && typeof b.latex === 'string' && b.latex.trim()) {
          validBlocks.push({
            type: 'formula',
            title: this.cleanString(b.title, 150) || 'Primary Formula',
            latex: b.latex.trim(),
            variables: Array.isArray(b.variables)
              ? b.variables
                  .filter((v: any) => v && typeof v.symbol === 'string' && typeof v.label === 'string')
                  .map((v: any) => ({ symbol: v.symbol.trim(), label: v.label.trim() }))
              : undefined,
            shortcutNote: this.cleanString(b.shortcutNote, 200)
          });
        } else if (type === 'steps' && Array.isArray(b.steps) && b.steps.length > 0) {
          validBlocks.push({
            type: 'steps',
            title: this.cleanString(b.title, 150) || 'Step-by-Step Derivation',
            steps: b.steps.map((st: any, idx: number) => ({
              stepNumber: typeof st.stepNumber === 'number' ? st.stepNumber : idx + 1,
              title: this.cleanString(st.title, 150) || `Step ${idx + 1}`,
              explanation: this.cleanString(st.explanation, 2000) || '',
              latex: typeof st.latex === 'string' ? st.latex.trim() : undefined
            }))
          });
        } else if (
          type === 'quiz' &&
          typeof b.question === 'string' &&
          Array.isArray(b.options) &&
          b.options.length >= 2
        ) {
          validBlocks.push({
            type: 'quiz',
            question: this.cleanString(b.question, 500) || '',
            options: b.options.map((o: any) => this.cleanString(o, 200) || '').filter(Boolean),
            correctIndex:
              typeof b.correctIndex === 'number'
                ? Math.max(0, Math.min(b.options.length - 1, b.correctIndex))
                : 0,
            explanation: this.cleanString(b.explanation, 1000) || ''
          });
        } else if (type === 'shortcut' && (typeof b.trick === 'string' || typeof b.content === 'string')) {
          validBlocks.push({
            type: 'shortcut',
            title: this.cleanString(b.title, 150) || '⚡ 30-Second Exam Shortcut',
            trick: this.cleanString(b.trick || b.content, 1000) || '',
            speedGain: this.cleanString(b.speedGain, 60)
          });
        } else if (type === 'trap' && (typeof b.warning === 'string' || typeof b.content === 'string')) {
          validBlocks.push({
            type: 'trap',
            warning: this.cleanString(b.warning || b.content, 1000) || ''
          });
        } else if (type === 'concept' && typeof b.content === 'string' && b.content.trim()) {
          validBlocks.push({
            type: 'concept',
            title: this.cleanString(b.title, 150),
            content: this.cleanString(b.content, 8000) || ''
          });
        } else if (type === 'key_points' && Array.isArray(b.points) && b.points.length > 0) {
          validBlocks.push({
            type: 'key_points',
            points: b.points.map((p: any) => this.cleanString(p, 300) || '').filter(Boolean)
          });
        }
      }
      if (validBlocks.length > 0) return validBlocks;
    }

    // Synthesize structured blocks from explanation, formula, and keyPoints
    const blocks: AiBlockData[] = [];

    // 1. Primary Formula Card if available
    if (opts.formula && opts.formula.trim()) {
      blocks.push({
        type: 'formula',
        title: 'Key Formula',
        latex: opts.formula.trim()
      });
    }

    // 2. Parse explanation paragraphs, shortcuts, traps, and steps
    const rawLines = (opts.explanation || '').split('\n');
    let conceptBuffer: string[] = [];
    const stepsBuffer: Array<{ stepNumber: number; title: string; explanation: string }> = [];

    const flushConcept = () => {
      const text = conceptBuffer.join('\n').trim();
      conceptBuffer = [];
      if (text) {
        blocks.push({ type: 'concept', content: text });
      }
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // Detect shortcut
      if (
        trimmed.startsWith('💡') ||
        trimmed.toLowerCase().startsWith('shortcut:') ||
        trimmed.toLowerCase().startsWith('**shortcut') ||
        trimmed.toLowerCase().startsWith('pro tip:')
      ) {
        flushConcept();
        blocks.push({
          type: 'shortcut',
          title: '⚡ 30-Second Exam Shortcut',
          trick: trimmed.replace(/^[💡\s]+/, '').replace(/^\*\*Shortcut:?\*\*\s*/i, '')
        });
        continue;
      }

      // Detect trap
      if (
        trimmed.startsWith('⚠️') ||
        trimmed.toLowerCase().startsWith('trap:') ||
        trimmed.toLowerCase().startsWith('**trap:') ||
        trimmed.toLowerCase().startsWith('caution:') ||
        trimmed.toLowerCase().startsWith('common mistake:')
      ) {
        flushConcept();
        blocks.push({
          type: 'trap',
          warning: trimmed.replace(/^[⚠️\s]+/, '').replace(/^\*\*Trap:?\*\*\s*/i, '')
        });
        continue;
      }

      // Detect step
      const stepMatch = trimmed.match(/^(\*\*Step\s+(\d+)[:\.]?\*\*|Step\s+(\d+)[:\.]?)\s*(.*)/i);
      if (stepMatch) {
        const stepNum = parseInt(stepMatch[2] || stepMatch[3] || String(stepsBuffer.length + 1), 10);
        const stepText = stepMatch[4] || trimmed;
        stepsBuffer.push({
          stepNumber: stepNum,
          title: `Step ${stepNum}`,
          explanation: stepText
        });
        continue;
      }

      conceptBuffer.push(line);
    }

    flushConcept();

    if (stepsBuffer.length > 0) {
      blocks.push({
        type: 'steps',
        title: 'Step-by-Step Derivation',
        steps: stepsBuffer
      });
    }

    // 3. Key Points Block
    if (opts.keyPoints && opts.keyPoints.length > 0) {
      blocks.push({
        type: 'key_points',
        points: opts.keyPoints
      });
    }

    return blocks;
  }

  private clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const num = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
  }

  /** Validates an "HH:MM AM/PM" style label, falling back to the given default. */
  private cleanTimeLabel(value: unknown, fallback: string): string {
    const raw = this.cleanString(value, 24);
    if (!raw) return fallback;
    const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return fallback;
    const hours = parseInt(match[1], 10);
    if (hours < 1 || hours > 12) return fallback;
    return `${hours.toString().padStart(2, '0')}:${match[2]} ${match[3].toUpperCase()}`;
  }

  // ---------------------------------------------------------------------------
  // 1. Natural language schedule planner
  // ---------------------------------------------------------------------------

  /**
   * Parses natural language prompts like:
   * "Tomorrow should include 30 minutes of Current Affairs."
   * The model decides *what* to schedule; the server always derives the actual
   * calendar date so a hallucinated date can never reach storage.
   */
  public async parseSchedulePrompt(prompt: string, userId?: string): Promise<ScheduleParseResult> {
    const base = this.heuristicPlan(prompt);

    const plan = await gemini.generateJson<{
      subject?: string;
      title?: string;
      durationMinutes?: number;
      targetDateOffset?: number;
      scheduledTime?: string;
      message?: string;
      suggestedSchedule?: Array<{ time?: string; activity?: string; duration?: string }>;
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nYou convert a learner's request into one concrete study block plus a daily timetable. Respond with JSON only.`,
      prompt:
        `Learner context:\n${this.buildLearnerContext(userId)}\n\n` +
        `Request: "${prompt}"\n\n` +
        `Today is ${localDateKey()} (${new Date().toLocaleDateString('en-IN', { weekday: 'long' })}).\n` +
        'Return a single study block matching the request, plus a realistic 4-6 slot timetable for that day. ' +
        'targetDateOffset must be 0 (today), 1 (tomorrow) or 2 (day after tomorrow). ' +
        'scheduledTime must use the "HH:MM AM/PM" format. durationMinutes must be between 5 and 600.',
      schema: {
        type: 'OBJECT',
        properties: {
          subject: { type: 'STRING', description: 'Short subject name, e.g. Current Affairs' },
          title: { type: 'STRING', description: 'Task title for the planner' },
          durationMinutes: { type: 'INTEGER' },
          targetDateOffset: { type: 'INTEGER', description: '0 = today, 1 = tomorrow, 2 = day after tomorrow' },
          scheduledTime: { type: 'STRING', description: 'e.g. 09:00 AM' },
          message: { type: 'STRING', description: 'One or two sentences confirming the plan' },
          suggestedSchedule: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                time: { type: 'STRING', description: 'e.g. 07:30 AM - 08:30 AM' },
                activity: { type: 'STRING' },
                duration: { type: 'STRING', description: 'e.g. 60 min' }
              },
              required: ['time', 'activity', 'duration']
            }
          }
        },
        required: ['subject', 'title', 'durationMinutes', 'targetDateOffset', 'scheduledTime', 'message', 'suggestedSchedule']
      },
      temperature: 0.5,
      tier: 'lite'
    });

    const durationMinutes = plan
      ? this.clampInt(plan.durationMinutes, 5, 600, base.durationMinutes)
      : base.durationMinutes;
    const targetOffset = plan ? this.clampInt(plan.targetDateOffset, 0, 2, base.targetOffset) : base.targetOffset;
    const subject = (plan && this.cleanString(plan.subject, 60)) || base.subject;
    const scheduledTime = plan ? this.cleanTimeLabel(plan.scheduledTime, base.scheduledTime) : base.scheduledTime;
    const targetDateName = targetOffset === 0 ? 'today' : targetOffset === 1 ? 'tomorrow' : 'day after tomorrow';

    // Date is always computed locally — never taken from the model.
    const target = new Date();
    target.setDate(target.getDate() + targetOffset);
    const targetDate = localDateKey(target);

    const newTask: StudyTask = {
      id: `task-${Date.now()}`,
      userId,
      title: (plan && this.cleanString(plan.title, 120)) || `${durationMinutes}m ${subject} Focus Block`,
      subject,
      durationMinutes,
      targetDate,
      completed: false,
      isAiGenerated: true,
      scheduledTime
    };

    storage.addTask(newTask);

    const message =
      (plan && this.cleanString(plan.message, 500)) ||
      `Got it! I have scheduled **${durationMinutes} minutes of ${subject}** for **${targetDateName} (${targetDate})** at **${scheduledTime}**. I've added it to your daily planner and study calendar.`;

    const aiSchedule = (plan?.suggestedSchedule || [])
      .map(slot => ({
        time: this.cleanString(slot?.time, 40) || '',
        activity: this.cleanString(slot?.activity, 120) || '',
        duration: this.cleanString(slot?.duration, 20) || ''
      }))
      .filter(slot => slot.time && slot.activity)
      .slice(0, 6);

    return {
      message,
      task: newTask,
      suggestedSchedule: aiSchedule.length ? aiSchedule : base.suggestedSchedule(subject, durationMinutes, scheduledTime),
      source: plan ? 'gemini' : 'fallback'
    };
  }

  /** Deterministic parser used both as the prompt hint and as the offline fallback. */
  private heuristicPlan(prompt: string) {
    const lower = prompt.toLowerCase();

    let targetOffset = 0;
    // "day after tomorrow" contains "tomorrow", so the longer phrase must be
    // tested first or its branch would be unreachable.
    if (lower.includes('day after tomorrow') || lower.includes('parson')) {
      targetOffset = 2;
    } else if (lower.includes('tomorrow') || lower.includes('kal')) {
      targetOffset = 1;
    }

    let durationMinutes = 30;
    const durationMatch = prompt.match(/(\d+)\s*(min|minute|minutes|hr|hour|hours|ghanta|ghante)/i);
    if (durationMatch) {
      const value = parseInt(durationMatch[1], 10);
      const unit = durationMatch[2].toLowerCase();
      durationMinutes = unit.startsWith('hr') || unit.startsWith('hour') || unit.startsWith('ghan') ? value * 60 : value;
    }
    durationMinutes = this.clampInt(durationMinutes, 5, 600, 30);

    let subject = 'Current Affairs';
    if (lower.includes('physic') || lower.includes('thermodynamic') || lower.includes('mechanic')) {
      subject = 'Physics';
    } else if (lower.includes('math') || lower.includes('calculus') || lower.includes('algebra')) {
      subject = 'Mathematics';
    } else if (lower.includes('chem') || lower.includes('organic')) {
      subject = 'Chemistry';
    } else if (lower.includes('code') || lower.includes('computer') || lower.includes('dsa')) {
      subject = 'Computer Science';
    } else if (lower.includes('reasoning') || lower.includes('puzzle')) {
      subject = 'Reasoning';
    }

    return {
      subject,
      durationMinutes,
      targetOffset,
      scheduledTime: targetOffset === 1 ? '09:00 AM' : '04:00 PM',
      suggestedSchedule: (s: string, duration: number, time: string) => [
        { time: '07:30 AM - 08:30 AM', activity: `${s} warm-up revision`, duration: '60 min' },
        { time: `${time} - ${this.addMinutesToTime(time, duration)}`, activity: `${s} (AI Coach Assigned)`, duration: `${duration} min` },
        { time: '11:00 AM - 01:00 PM', activity: 'Deep focus: problem solving & whiteboard session', duration: '120 min' },
        { time: '03:30 PM - 05:00 PM', activity: 'Synchronized lecture watch party with room peers', duration: '90 min' },
        { time: '08:00 PM - 08:45 PM', activity: 'Spaced repetition flashcards & daily quiz', duration: '45 min' }
      ]
    };
  }

  private addMinutesToTime(timeStr: string, minutes: number): string {
    // Robust 12-hour clock helper e.g. "12:00 PM" + 30m -> "12:30 PM", "11:45 PM" + 30m -> "12:15 AM"
    if (!timeStr || typeof timeStr !== 'string') return '09:00 AM';
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
    if (!match) return timeStr;

    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const modifier = (match[3] || 'AM').toUpperCase();

    // Convert 12-hour format to 24-hour hours:
    // 12 AM -> 0, 1 AM -> 1, ..., 11 AM -> 11, 12 PM -> 12, 1 PM -> 13, ..., 11 PM -> 23
    const hours24 = (h % 12) + (modifier === 'PM' ? 12 : 0);
    let totalM = hours24 * 60 + m + minutes;

    // Handle wrapping across day boundary
    totalM = ((totalM % 1440) + 1440) % 1440;

    const newH24 = Math.floor(totalM / 60);
    const newM = totalM % 60;
    const newMod = newH24 >= 12 ? 'PM' : 'AM';
    const finalH = newH24 % 12 || 12;
    return `${finalH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')} ${newMod}`;
  }

  // ---------------------------------------------------------------------------
  // 2. Doubt solver
  // ---------------------------------------------------------------------------

  public async explainDoubt(
    question: string,
    context?: { videoTimestamp?: number; subject?: string; pdfPage?: number; pdfTitle?: string; userId?: string }
  ): Promise<DoubtSolution> {
    const contextLines: string[] = [];
    if (context?.subject) contextLines.push(`Subject: ${context.subject}`);
    if (context?.pdfTitle) contextLines.push(`Reading: ${context.pdfTitle}${context.pdfPage ? ` (page ${context.pdfPage})` : ''}`);
    if (typeof context?.videoTimestamp === 'number') {
      const mins = Math.floor(context.videoTimestamp / 60);
      const secs = Math.floor(context.videoTimestamp % 60);
      contextLines.push(`Lecture position: ${mins}:${secs.toString().padStart(2, '0')}`);
    }

    const solution = await gemini.generateJson<{
      explanation?: string;
      steps?: string[];
      keyFormula?: string;
      practiceTip?: string;
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nBreak the doubt down step-by-step with deep pedagogical clarity for a student revising for an exam. Follow the ADAPTIVE LANGUAGE MIRRORING rule (reply in Hindi/Hinglish if asked in Hindi/Hinglish). Respond with JSON only.`,
      prompt:
        `Learner context:\n${this.buildLearnerContext(context?.userId)}\n` +
        (contextLines.length ? `${contextLines.join('\n')}\n` : '') +
        `\nDoubt: "${question}"\n\n` +
        'Give an in-depth conceptual explanation, 3-7 ordered step-by-step reasoning/working steps with LaTeX formulas ($$...$$ for display math, $...$ for inline math), the core formula in LaTeX, and an actionable exam practice tip / speed trick. Mirror the student\'s language naturally.',
      schema: {
        type: 'OBJECT',
        properties: {
          explanation: { type: 'STRING' },
          steps: { type: 'ARRAY', items: { type: 'STRING' } },
          keyFormula: { type: 'STRING', description: 'LaTeX, or empty string when not applicable' },
          practiceTip: { type: 'STRING' }
        },
        required: ['explanation', 'steps', 'practiceTip']
      },
      temperature: 0.6,
      maxOutputTokens: 4096,
      tier: 'heavy'
    });

    if (solution) {
      const explanation = this.cleanString(solution.explanation, 8000);
      const steps = this.cleanStringArray(solution.steps, 10, 2000);
      if (explanation && steps.length) {
        return {
          explanation,
          steps,
          keyFormula: this.cleanString(solution.keyFormula, 2000),
          practiceTip: this.cleanString(solution.practiceTip, 2000) || 'Attempt two similar problems without looking at the solution.',
          source: 'gemini'
        };
      }
    }

    return { ...this.fallbackDoubt(question), source: 'fallback' };
  }

  /** Deterministic doubt breakdown used when Gemini is unavailable. */
  private fallbackDoubt(question: string): Omit<DoubtSolution, 'source'> {
    const q = question.toLowerCase();

    if (q.includes('carnot') || q.includes('entropy') || q.includes('thermodynamic')) {
      return {
        explanation: 'In thermodynamics, the Carnot engine represents the theoretical maximum efficiency that any heat engine operating between two temperatures (T_H and T_C) can achieve.',
        steps: [
          'Step 1: Understand the cycle consists of 2 reversible isothermal processes and 2 reversible adiabatic processes.',
          'Step 2: Isothermal expansion absorbs heat Q_in at high temperature T_H.',
          'Step 3: Adiabatic expansion does work while temperature drops to T_C with no heat exchange (dQ = 0).',
          'Step 4: Efficiency is derived as η = 1 - (Q_out / Q_in) = 1 - (T_C / T_H).'
        ],
        keyFormula: '\\eta = 1 - \\frac{T_C}{T_H} = \\frac{W_{net}}{Q_H}',
        practiceTip: 'Always convert temperatures into Kelvin before calculating Carnot efficiency, otherwise calculations will be invalid.'
      };
    }

    if (q.includes('current affair') || q.includes('imf') || q.includes('g20') || q.includes('economy')) {
      return {
        explanation: 'Current economic trends highlight digital public infrastructure (DPI), green transition financing, and multilateral debt restructuring.',
        steps: [
          'Step 1: Global economic growth is projected at ~3.2% with persistent inflation pressures.',
          'Step 2: India continues to lead among major economies with ~6.5-7.0% GDP growth projection.',
          'Step 3: Key drivers include domestic infrastructure capex, manufacturing incentives, and digital financial inclusion.'
        ],
        practiceTip: 'Focus on connecting government policy announcements with underlying economic indicators for exam answers.'
      };
    }

    return {
      explanation: `Here is a systematic breakdown for: "${question}"`,
      steps: [
        'Step 1: Identify the given variables, constraints, and core concepts.',
        'Step 2: Apply the governing physical law or mathematical principle.',
        'Step 3: Simplify intermediate equations step by step to prevent algebraic errors.',
        'Step 4: Check dimensional consistency and boundary conditions.'
      ],
      keyFormula: 'f(x) = \\lim_{\\Delta x \\to 0} \\frac{f(x+\\Delta x) - f(x)}{\\Delta x}',
      practiceTip: 'Solve 2-3 similar variants without looking at solutions to cement active recall.'
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Quiz generation
  // ---------------------------------------------------------------------------

  public async generateQuiz(topic: string, count = 3): Promise<QuizQuestion[]> {
    const wanted = this.clampInt(count, 1, 10, 3);

    const result = await gemini.generateJson<{
      questions?: Array<{
        question?: string;
        options?: string[];
        correctAnswerIndex?: number;
        explanation?: string;
        subject?: string;
      }>;
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nWrite multiple-choice questions at Indian competitive-exam difficulty. Respond with JSON only.`,
      prompt:
        `Topic: "${topic}"\n\n` +
        `Create exactly ${wanted} single-correct MCQs. Each must have exactly 4 distinct options, ` +
        'correctAnswerIndex between 0 and 3, and a one-sentence explanation of why the answer is right.',
      schema: {
        type: 'OBJECT',
        properties: {
          questions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                question: { type: 'STRING' },
                options: { type: 'ARRAY', items: { type: 'STRING' } },
                correctAnswerIndex: { type: 'INTEGER' },
                explanation: { type: 'STRING' },
                subject: { type: 'STRING' }
              },
              required: ['question', 'options', 'correctAnswerIndex', 'explanation', 'subject']
            }
          }
        },
        required: ['questions']
      },
      temperature: 0.8,
      maxOutputTokens: 3072,
      tier: 'lite'
    });

    const questions: QuizQuestion[] = [];
    (result?.questions || []).forEach((q, idx) => {
      const question = this.cleanString(q?.question, 500);
      const options = this.cleanStringArray(q?.options, 4, 300);
      const explanation = this.cleanString(q?.explanation, 600);
      if (!question || options.length !== 4 || !explanation) return;

      questions.push({
        id: `gen-q-${Date.now()}-${idx + 1}`,
        question,
        options,
        correctAnswer: this.clampInt(q?.correctAnswerIndex, 0, 3, 0),
        explanation,
        subject: this.cleanString(q?.subject, 60) || topic,
        topic
      });
    });

    return questions.length ? questions.slice(0, wanted) : this.fallbackQuiz(topic);
  }

  private fallbackQuiz(topic: string): QuizQuestion[] {
    return [
      {
        id: `gen-q-${Date.now()}-1`,
        question: `In ${topic}, which of the following statements is fundamentally correct?`,
        options: [
          'Total entropy of an isolated system always increases in irreversible processes.',
          'Efficiency of an irreversible engine can exceed the Carnot limit.',
          'Isothermal expansion occurs at variable temperature.',
          'Work done is independent of the thermodynamic path taken.'
        ],
        correctAnswer: 0,
        explanation: 'According to the Second Law of Thermodynamics, entropy of an isolated system increases for irreversible processes and remains constant only for reversible ones.',
        subject: topic,
        topic
      },
      {
        id: `gen-q-${Date.now()}-2`,
        question: `What is the relationship between heat absorbed and temperature for a reversible process in ${topic}?`,
        options: ['dS = dQ_rev / T', 'dS = T · dQ_rev', 'dS = dQ_rev + T', 'dS = 0 always'],
        correctAnswer: 0,
        explanation: 'Clausius inequality defines dS = dQ_rev / T for any reversible process.',
        subject: topic,
        topic
      }
    ];
  }

  // ---------------------------------------------------------------------------
  // 4. Flashcard generation
  // ---------------------------------------------------------------------------

  public async generateFlashcards(topic: string, count = 12): Promise<Flashcard[]> {
    const wanted = this.clampInt(count, 1, 25, 12);

    const result = await gemini.generateJson<{
      cards?: Array<{ front?: string; back?: string; masteryLevel?: string }>;
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nWrite spaced-repetition flashcards covering core concepts, formulas, definitions, exceptions, and exam tips. Respond with JSON only.`,
      prompt:
        `Topic: "${topic}"\n\n` +
        `Create exactly ${wanted} high-yield, comprehensive flashcards. "front" is a single focused question, scenario, or prompt, ` +
        '"back" is an accurate, thorough yet concise answer (2-3 sentences) that is easy to self-check. ' +
        'masteryLevel must be one of learning, reviewing, mastered — use "learning" for brand-new cards.',
      schema: {
        type: 'OBJECT',
        properties: {
          cards: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                front: { type: 'STRING' },
                back: { type: 'STRING' },
                masteryLevel: { type: 'STRING' }
              },
              required: ['front', 'back']
            }
          }
        },
        required: ['cards']
      },
      temperature: 0.7,
      maxOutputTokens: 8192,
      tier: 'flashcards'
    });

    const cards: Flashcard[] = [];
    (result?.cards || []).forEach((c, idx) => {
      const front = this.cleanString(c?.front, 400);
      const back = this.cleanString(c?.back, 700);
      if (!front || !back) return;

      const level = c?.masteryLevel;
      cards.push({
        id: `fc-gen-${Date.now()}-${idx + 1}`,
        front,
        back,
        subject: topic,
        masteryLevel: level === 'reviewing' || level === 'mastered' ? level : 'learning'
      });
    });

    return cards.length ? cards.slice(0, wanted) : this.fallbackFlashcards(topic);
  }

  private fallbackFlashcards(topic: string): Flashcard[] {
    return [
      {
        id: `fc-gen-${Date.now()}-1`,
        front: `What is the core definition of ${topic}?`,
        back: 'The fundamental framework governing energy conservation, system boundaries, and transformation between heat and work.',
        subject: topic,
        masteryLevel: 'learning'
      },
      {
        id: `fc-gen-${Date.now()}-2`,
        front: `State the primary governing formula for ${topic}.`,
        back: 'ΔU = Q - W (First Law) and η = 1 - (Tc / Th) (Carnot efficiency).',
        subject: topic,
        masteryLevel: 'reviewing'
      },
      {
        id: `fc-gen-${Date.now()}-3`,
        front: `Common exam pitfalls in ${topic}?`,
        back: 'Forgetting to convert Celsius to Kelvin, confusing work done BY system (+W) vs work done ON system (-W).',
        subject: topic,
        masteryLevel: 'mastered'
      }
    ];
  }

  // ---------------------------------------------------------------------------
  // 5. Handwritten notebook notes
  // ---------------------------------------------------------------------------

  public async generateHandwrittenNotes(topic: string, userId?: string): Promise<HandwrittenNotes> {
    const user = userId ? storage.getUser(userId) : undefined;
    const studentName = user?.name || user?.username || 'Student';

    const result = await gemini.generateJson<{
      title?: string;
      sections?: Array<{ heading?: string; notes?: string[]; highlight?: string; sketch?: string }>;
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nYou write condensed revision sheets that a student would copy into a notebook. Respond with JSON only.`,
      prompt:
        `Learner context:\n${this.buildLearnerContext(userId)}\n\n` +
        `Topic: "${topic}"\n\n` +
        'Produce 3-4 revision sections. Each section has a heading, 2-4 short bullet notes, and optionally a ' +
        'highlight (an exam-critical warning) or a sketch (a one-line description of a diagram to draw). ' +
        'Keep every note under 200 characters so it fits a ruled notebook page.',
      schema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          sections: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                heading: { type: 'STRING' },
                notes: { type: 'ARRAY', items: { type: 'STRING' } },
                highlight: { type: 'STRING' },
                sketch: { type: 'STRING' }
              },
              required: ['heading', 'notes']
            }
          }
        },
        required: ['title', 'sections']
      },
      temperature: 0.6,
      maxOutputTokens: 3072
    });

    const sections = (result?.sections || [])
      .map(section => ({
        heading: this.cleanString(section?.heading, 160) || '',
        notes: this.cleanStringArray(section?.notes, 6, 300),
        highlight: this.cleanString(section?.highlight, 300),
        sketch: this.cleanString(section?.sketch, 300)
      }))
      .filter(section => section.heading && section.notes.length)
      .slice(0, 6);

    if (sections.length) {
      return {
        title: this.cleanString(result?.title, 160) || `${topic} — Master Study Sheet`,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        studentName,
        sections,
        source: 'gemini'
      };
    }

    return { ...this.fallbackHandwrittenNotes(topic, studentName), source: 'fallback' };
  }

  private fallbackHandwrittenNotes(topic: string, studentName: string): Omit<HandwrittenNotes, 'source'> {
    return {
      title: `${topic} — Master Study Sheet`,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      studentName,
      sections: [
        {
          heading: '1. Big Picture Concept',
          notes: [
            'Energy is conserved in all interactions (1st Law).',
            'Heat flows spontaneously from Hot ➔ Cold reservoirs (2nd Law).',
            'No heat engine can achieve 100% efficiency unless T_cold = 0 Kelvin.'
          ],
          highlight: '★ Crucial Exam Note: Always use absolute temperature (K = °C + 273.15)!'
        },
        {
          heading: '2. Golden Formulas to Memorize',
          notes: [
            'Work in Isothermal: W = n R T ln(V2 / V1)',
            'Work in Adiabatic: W = (P1 V1 - P2 V2) / (γ - 1)',
            'Carnot Efficiency: η = (T_H - T_C) / T_H'
          ],
          sketch: 'P-V Diagram: Closed cycle enclosed area = Net Work Done!'
        },
        {
          heading: '3. Quick Revision Checklist',
          notes: [
            '✓ Verify sign convention (+Q into system, +W by system)',
            '✓ Check monoatomic (γ = 5/3) vs diatomic (γ = 7/5) gas',
            '✓ Do 2 numericals on heat pump coefficient of performance (COP)'
          ]
        }
      ]
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Lecture / PDF summarisation
  // ---------------------------------------------------------------------------

  public async summarizeLecture(videoUrl: string, lectureTitle?: string, userId?: string): Promise<LectureSummary> {
    const result = await gemini.generateJson<{
      title?: string;
      channel?: string;
      duration?: string;
      summary?: string;
      chapters?: Array<{ timestamp?: string; title?: string; takeaway?: string }>;
      quickQuiz?: string[];
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nYou summarise study material into a revision-ready outline. Respond with JSON only.`,
      prompt:
        `Learner context:\n${this.buildLearnerContext(userId)}\n\n` +
        `Study material: ${lectureTitle ? `"${lectureTitle}"` : 'an unnamed lecture'}\n` +
        `Source link: ${videoUrl}\n\n` +
        'Produce a revision summary with a 2-3 sentence overview, 3-5 timestamped chapters each with a single ' +
        'key takeaway, and 2-3 quick self-check questions. Use timestamps in "MM:SS - MM:SS" format. ' +
        'If the exact content is unknown, base the outline on the topic implied by the title.',
      schema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          channel: { type: 'STRING' },
          duration: { type: 'STRING', description: 'e.g. 42:15' },
          summary: { type: 'STRING' },
          chapters: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                timestamp: { type: 'STRING' },
                title: { type: 'STRING' },
                takeaway: { type: 'STRING' }
              },
              required: ['timestamp', 'title', 'takeaway']
            }
          },
          quickQuiz: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['title', 'summary', 'chapters', 'quickQuiz']
      },
      temperature: 0.6
    });

    const chapters = (result?.chapters || [])
      .map(chapter => ({
        timestamp: this.cleanString(chapter?.timestamp, 40) || '',
        title: this.cleanString(chapter?.title, 160) || '',
        takeaway: this.cleanString(chapter?.takeaway, 400) || ''
      }))
      .filter(chapter => chapter.title && chapter.takeaway)
      .slice(0, 8);

    const summary = this.cleanString(result?.summary, 1200);

    if (summary && chapters.length) {
      return {
        videoUrl,
        title: this.cleanString(result?.title, 200) || lectureTitle || 'Lecture summary',
        channel: this.cleanString(result?.channel, 100) || 'StudyOS Classroom',
        duration: this.cleanString(result?.duration, 20) || '—',
        summary,
        chapters,
        quickQuiz: this.cleanStringArray(result?.quickQuiz, 5, 300),
        source: 'gemini'
      };
    }

    return { ...this.fallbackLectureSummary(videoUrl, lectureTitle), source: 'fallback' };
  }

  private fallbackLectureSummary(videoUrl: string, lectureTitle?: string): Omit<LectureSummary, 'source'> {
    return {
      videoUrl,
      title: lectureTitle || 'Comprehensive Class: Thermodynamics, Work & Heat Transfer',
      channel: 'StudyOS Classroom',
      duration: '42:15',
      summary: 'This masterclass breaks down the principles of energy transfer, state variables, P-V diagrams, and the derivation of thermal efficiency with real-world engineering examples.',
      chapters: [
        { timestamp: '00:00 - 05:20', title: 'Foundations & State Variables (P, V, T)', takeaway: 'State variables depend solely on current equilibrium state, not on path history.' },
        { timestamp: '05:21 - 18:40', title: 'Work Done in Thermodynamic Expansions', takeaway: 'Area under P-V curve represents total work: W = ∫ P dV.' },
        { timestamp: '18:41 - 32:10', title: 'The Carnot Cycle & Reversibility', takeaway: 'Four distinct reversible stages maximize theoretical work efficiency.' },
        { timestamp: '32:11 - 42:15', title: 'Practice Problems & Common Traps', takeaway: 'Common sign mistakes in Q and W, and converting units properly.' }
      ],
      quickQuiz: [
        'Why does a reversible adiabatic process have constant entropy?',
        'How is work represented visually on a P-V indicator diagram?'
      ]
    };
  }
  // ---------------------------------------------------------------------------
  // 7. PDF reader assistant — explain a page, explain a selection, answer a question
  // ---------------------------------------------------------------------------

  /**
   * Answers questions about a PDF page using only the text the reader extracted
   * from that page. The page text is supplied by the client, which means local
   * (never-uploaded) PDFs work exactly the same as cloud ones.
   */
  public async assistWithPdf(input: {
    mode?: PdfAssistMode;
    docTitle?: string;
    page?: number;
    pageText?: string;
    selectedText?: string;
    question?: string;
    userId?: string;
    model?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant' | 'model'; text: string }>;
  }): Promise<PdfAssistResult> {
    const page = this.clampInt(input.page, 1, 100000, 1);
    const docTitle = this.cleanString(input.docTitle, 200) || 'Study PDF';
    const selectedText = this.cleanString(input.selectedText, MAX_SELECTION_CHARS);
    const question = this.cleanString(input.question, 2000);
    const pageText = (input.pageText || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_CHARS);
    const selectedModel = (input.model || 'gemini-3.5-flash-lite').trim();

    // Scanned / image-only pages cannot be summarized or selected, but a
    // standalone question can still be answered from the model's knowledge.
    if (!pageText && !question && !selectedText) {
      return {
        mode: input.mode || 'page',
        heading: `Page ${page} has no selectable text`,
        explanation:
          'This page looks like a scanned image without an embedded digital text layer. ' +
          'You can still type a general question below, or select text on a page with digital text.',
        keyPoints: [],
        source: 'fallback',
        modelUsed: 'offline-extracted'
      };
    }

    // A typed question chooses the task, but any selected passage still gives it context.
    // Explicit 'page' mode must always take precedence over stale selected text.
    const mode: PdfAssistMode =
      input.mode === 'page'
        ? 'page'
        : input.mode === 'question' && question
        ? 'question'
        : selectedText
        ? 'selection'
        : 'page';

    const focus =
      mode === 'question'
        ? `Student's Question:\n"${question}"${selectedText ? `\n\nSpecific passage referenced on Page ${page}:\n"${selectedText}"` : ''}`
        : mode === 'selection'
        ? `Selected passage to thoroughly master:\n"${selectedText}"`
        : `The student requests a master-class, end-to-end breakdown of Page ${page}.`;

    const task =
      mode === 'question'
        ? `Answer the student's question with utmost pedagogical clarity and step-by-step depth.
- If it's a quantitative/maths/physics question: Provide full algebraic steps, state initial values, formulas, every intermediate calculation, and a quick verification or exam shortcut.
- If it's conceptual or theoretical: Explain the core premise, real-world analogies, nuances, and exam relevance.
- ${pageText
  ? 'Use the page text as primary truth; if the question asks beyond the page, answer completely using your deep expertise and explicitly state the broader context.'
  : selectedText
  ? 'No other page text is available; ground the answer in the selected passage and do not infer unseen page content.'
  : 'No selectable PDF text is available. Answer general questions from your expertise, but do not guess what the scanned page contains; explain this limitation if the question depends on that page.'}`
        : mode === 'selection'
        ? `Explain the selected passage in deep, structured detail:
- Plain-English / Hinglish explanation of what it actually means.
- Definition of every mathematical symbol, variable, or technical term.
- Step-by-step derivation or conceptual significance.
- Why this concept is critical for competitive exams (Bank PO, SSC CGL, JEE, UPSC, etc.).`
        : `Provide a master summary of Page ${page}:
- Main topic and central thesis.
- Comprehensive step-by-step breakdown of every key idea, theorem, formula, and example on this page.
- Clear notes for quick revision.`;

    const pdfSystemInstruction = `${EXAM_COACH_PERSONA}
You are an elite AI Study Professor and Master Tutor (powered by Google Gemini), embedded directly inside the StudyOS PDF reader.
Your goal is to provide the highest quality, most comprehensive, step-by-step explanations — exactly like the Google Gemini mobile app.

CRITICAL INSTRUCTIONS FOR QUALITY & STRUCTURE:
1. NO SHORTCUTS OR HALF-BAKED ANSWERS:
   - Never answer in just 2-4 lines. Give a full, well-developed, clear pedagogical explanation that leaves zero doubt in the student's mind.
   - For mathematical, reasoning, or numerical questions, provide every intermediate step clearly written out.

2. MATHEMATICS & FORMULA RIGOR (KaTeX / LaTeX):
   - Always use standard LaTeX for all mathematical expressions:
     * Inline math must be enclosed in single dollar signs: $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$
     * Block/display math must be enclosed in double dollar signs:
       $$
       \text{Compound Interest} = P \left(1 + \frac{R}{100}\right)^T - P
       $$
   - CRITICAL: Never write standalone formulas, equations, or LaTeX commands naked on a line without wrapping them in $$...$$ or $...$. ALWAYS wrap them in $$...$$ so they render cleanly.
   - Reserve the $ sign for math delimiters only. For money/currency, write the word (e.g. "5 dollars", "Rs 500", "₹500") or escape it as \$ so it is not mistaken for a math expression.
   - Separate every section, heading, and step card with normal markdown line breaks.

3. STRUCTURED PEDAGOGICAL BREAKDOWN:
   Use clear Markdown formatting with sections:
   - ## [Problem Understanding & Given Parameters]
   - ## [Core Concept & Formula]
   - **Step 1:** ...
   - **Step 2:** ...
   - **Step 3:** ...
   - 💡 **Shortcut / Exam Vedic Trick:** (When applicable for competitive exams)
   - ⚠️ **Common Trap / Caution:** (Mistakes students often make in this step)
   - **Final Answer:** [Highlighted final result]

4. LANGUAGE ADAPTABILITY (Hindi / Hinglish / English):
   - If the student asks or prompts in Hindi or Hinglish (e.g., "kaise solve karein", "step by step samjhao", "iska formula batao"), respond in crystal-clear, friendly, and natural Hinglish/Hindi.
   - If in English, respond in articulate, structured English.

5. RESPOND WITH VALID JSON ONLY adhering strictly to the schema provided.`;

    const pageContext = pageText
      ? `--- CURRENT PAGE TEXT START ---\n${pageText}\n--- CURRENT PAGE TEXT END ---`
      : 'No selectable text could be extracted from this PDF page. The page may be scanned or image-only.';

    const jsonRes = await gemini.generateJsonWithMeta<{
      heading?: string;
      topic?: string;
      difficulty?: 'Basic' | 'Moderate' | 'Exam Standard';
      explanation?: string;
      keyPoints?: string[];
      formula?: string;
      followUp?: string;
      blocks?: any[];
    }>({
      systemInstruction: pdfSystemInstruction,
      prompt:
        `Learner profile:\n${this.buildLearnerContext(input.userId)}\n\n` +
        `Document Title: "${docTitle}" — Page ${page}\n\n` +
        `${focus}\n\n` +
        `${pageContext}\n\n` +
        `${task}\n\n` +
        `FORMATTING REQUIREMENT:
- "heading": A clear, engaging title for this solution/topic.
- "topic": Core topic/subject (e.g. "Compound Interest", "Transitive Verb", "Calculus").
- "difficulty": "Basic" | "Moderate" | "Exam Standard".
- "formula": The primary formula or equation in pure LaTeX (or empty string if not applicable).
- "blocks": An array of modular pedagogical component blocks:
  * { "type": "concept", "title": "...", "content": "Core markdown explanation with inline $...$" }
  * { "type": "formula", "title": "Primary Formula", "latex": "...", "variables": [{ "symbol": "P", "label": "Principal" }], "shortcutNote": "..." }
  * { "type": "steps", "title": "Step-by-Step Derivation", "steps": [{ "stepNumber": 1, "title": "...", "explanation": "...", "latex": "..." }] }
  * { "type": "shortcut", "title": "⚡ 30-Second Exam Shortcut", "trick": "Speed math shortcut", "speedGain": "Saves ~45s" }
  * { "type": "trap", "warning": "Common trap or negative marking mistake to avoid" }
  * { "type": "quiz", "question": "Quick 1-question concept check", "options": ["Option A", "Option B", "Option C", "Option D"], "correctIndex": 0, "explanation": "Why Option A is correct" }
- "explanation": Comprehensive continuous markdown solution (used for clipboard copy).
- "keyPoints": 3 to 6 high-yield exam takeaways or formulas to remember.
- "followUp": One thought-provoking follow-up question or practice challenge for the student.`,
      schema: {
        type: 'OBJECT',
        properties: {
          heading: { type: 'STRING' },
          topic: { type: 'STRING' },
          difficulty: { type: 'STRING' },
          formula: { type: 'STRING' },
          blocks: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                type: { type: 'STRING' },
                title: { type: 'STRING' },
                content: { type: 'STRING' },
                latex: { type: 'STRING' },
                variables: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      symbol: { type: 'STRING' },
                      label: { type: 'STRING' }
                    }
                  }
                },
                shortcutNote: { type: 'STRING' },
                steps: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      stepNumber: { type: 'INTEGER' },
                      title: { type: 'STRING' },
                      explanation: { type: 'STRING' },
                      latex: { type: 'STRING' }
                    }
                  }
                },
                trick: { type: 'STRING' },
                speedGain: { type: 'STRING' },
                warning: { type: 'STRING' },
                question: { type: 'STRING' },
                options: { type: 'ARRAY', items: { type: 'STRING' } },
                correctIndex: { type: 'INTEGER' },
                explanation: { type: 'STRING' },
                points: { type: 'ARRAY', items: { type: 'STRING' } }
              },
              required: ['type']
            }
          },
          explanation: { type: 'STRING' },
          keyPoints: { type: 'ARRAY', items: { type: 'STRING' } },
          followUp: { type: 'STRING' }
        },
        required: ['heading']
      },
      temperature: 0.5,
      model: selectedModel,
      conversationHistory: input.conversationHistory
    });

    if (jsonRes?.data) {
      const result = jsonRes.data;
      const rawExp =
        result.explanation ||
        (result as any).response ||
        (result as any).content ||
        (result as any).solution_breakdown ||
        (result as any).answer ||
        (result as any).solution ||
        (result as any).markdown ||
        (result as any).text ||
        (result as any).message ||
        (result as any).output ||
        (result as any).result;
      const explanation = this.cleanString(rawExp, 16000) || '';
      const keyPoints = this.cleanStringArray(
        result.keyPoints || (result as any).key_points || (result as any).points,
        8,
        800
      );
      const formula = this.cleanString(result.formula, 500);
      const followUp = this.cleanString(result.followUp || (result as any).follow_up, 500);

      const blocks = this.synthesizeBlocksFromData({
        heading: result.heading,
        explanation,
        formula,
        keyPoints,
        followUp,
        existingBlocks: result.blocks
      });

      if (explanation || blocks.length > 0) {
        return {
          mode,
          heading: this.cleanString(result.heading, 250) || `${docTitle} — Page ${page}`,
          explanation: explanation || (blocks[0] && 'content' in blocks[0] ? (blocks[0] as any).content : `${docTitle} — Page ${page}`),
          keyPoints,
          formula,
          followUp,
          blocks,
          topic: this.cleanString(result.topic, 100),
          difficulty: result.difficulty || 'Exam Standard',
          source: 'gemini',
          modelUsed: jsonRes.modelUsed || selectedModel
        };
      }
    }

    // Safety Net: If generateJson fails, try unconstrained generateText
    if (gemini.isConfigured()) {
      try {
        console.warn('[ai] pdf-assist generateJson yielded null, trying generateText fallback...');
        const textRes = await gemini.generateTextWithMeta({
          systemInstruction: pdfSystemInstruction,
          prompt:
            `Learner profile:\n${this.buildLearnerContext(input.userId)}\n\n` +
            `Document Title: "${docTitle}" — Page ${page}\n\n` +
            `${focus}\n\n` +
            `${pageContext}\n\n` +
            `${task}\n\n` +
            `FORMATTING INSTRUCTION: Provide an exhaustive, complete step-by-step pedagogical solution in rich Markdown with KaTeX math ($...$ and $$...$$), Step headings, 💡 Shortcuts, and ⚠️ Common Traps. Do not truncate.`,
          temperature: 0.5,
          model: selectedModel,
          conversationHistory: input.conversationHistory
        });

        if (textRes?.text && textRes.text.trim()) {
          const textResult = textRes.text.trim();

          // Check if fallback model output is a JSON envelope/object using cleanAndParseJson
          let parsedJson: any = gemini.cleanAndParseJson(textResult);
          if (!parsedJson) {
            const candidate = textResult.replace(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i, '$1').trim();
            if (candidate.startsWith('{') && candidate.endsWith('}')) {
              parsedJson = gemini.cleanAndParseJson(candidate);
            }
          }

          if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
            const rawExp =
              parsedJson.explanation ||
              parsedJson.response ||
              parsedJson.content ||
              parsedJson.solution_breakdown ||
              parsedJson.answer ||
              parsedJson.solution ||
              parsedJson.markdown ||
              parsedJson.text ||
              parsedJson.message ||
              parsedJson.output ||
              parsedJson.result;
            if (rawExp || Array.isArray(parsedJson.blocks)) {
              const heading =
                this.cleanString(parsedJson.heading, 250) ||
                (question ? `Solution: ${question.slice(0, 60)}` : `${docTitle} — Page ${page}`);
              const exp = this.cleanString(rawExp, 16000) || textResult;
              const formula = this.cleanString(parsedJson.formula, 500);
              const keyPoints = this.cleanStringArray(parsedJson.keyPoints || parsedJson.key_points, 8, 800);
              const followUp = this.cleanString(parsedJson.followUp || parsedJson.follow_up, 500);
              const blocks = this.synthesizeBlocksFromData({
                heading,
                explanation: exp,
                formula,
                keyPoints,
                followUp,
                existingBlocks: parsedJson.blocks
              });

              return {
                mode,
                heading,
                explanation: exp,
                keyPoints,
                formula,
                followUp,
                blocks,
                topic: this.cleanString(parsedJson.topic, 100),
                difficulty: parsedJson.difficulty || 'Exam Standard',
                source: 'gemini',
                modelUsed: textRes.modelUsed || selectedModel
              };
            }
          }

          // If textResult is still a raw JSON string like {"response": "..."} that failed full JSON.parse:
          let fallbackExp = textResult;
          const jsonStringMatch = textResult.match(/"(?:response|explanation|content|answer|solution|text)"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"[a-zA-Z0-9_]+"|"\s*})/);
          if (jsonStringMatch && jsonStringMatch[1]) {
            fallbackExp = jsonStringMatch[1]
              .replace(/\\"/g, '"')
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '')
              .replace(/\\t/g, '  ');
          }

          const headingMatch = fallbackExp.match(/^#+\s*(.+)$/m);
          const heading = headingMatch ? headingMatch[1].trim() : (question ? `Solution: ${question.slice(0, 60)}` : `${docTitle} — Page ${page}`);
          const exp = this.cleanString(fallbackExp, 16000) || fallbackExp;
          const keyPoints = [
            'Follow systematic step-by-step problem breakdown',
            'Verify intermediate equations before substitution',
            'Cross-check units and edge-case boundary conditions'
          ];
          const blocks = this.synthesizeBlocksFromData({
            heading,
            explanation: exp,
            keyPoints
          });

          return {
            mode,
            heading,
            explanation: exp,
            keyPoints,
            blocks,
            source: 'gemini',
            modelUsed: textRes.modelUsed || selectedModel
          };
        }
      } catch (textErr) {
        console.warn('[ai] pdf-assist generateText fallback failed:', textErr);
      }
    }

    return {
      ...this.fallbackPdfAssist(mode, page, docTitle, pageText, selectedText, question),
      source: 'fallback',
      modelUsed: 'offline-extracted'
    };
  }

  /** Offline path: hand back the page text itself, clearly labelled as not AI-written. */
  private fallbackPdfAssist(
    mode: PdfAssistMode,
    page: number,
    docTitle: string,
    pageText: string,
    selectedText: string | undefined,
    question: string | undefined
  ): Omit<PdfAssistResult, 'source'> {
    const focus = selectedText || pageText;
    const sentences = focus
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 40)
      .slice(0, 4);

    let explanation: string;
    if (gemini.isConfigured()) {
      const referenceText = focus
        ? `Here is the reference text extracted directly from Page ${page} of "${docTitle}":\n\n> ${focus.slice(0, 600)}\n\n`
        : `No selectable text could be extracted from Page ${page} of "${docTitle}", so page-specific content is unavailable.\n\n`;
      explanation =
        `### ⚠️ Model Temporarily Busy\n\n` +
        `The selected AI model is currently experiencing temporary high traffic. ${referenceText}` +
        `**Recommended Action:**\n` +
        `- Select **Gemini 3.5 Flash Lite** or **Gemini 2.5 Flash** in the model selector above for instant response.\n` +
        `- Click **"Clear & Ask Again"**.\n` +
        (question ? `- Your question: *"${question}"*` : '');
    } else {
      explanation =
        'The AI service is not configured on this server, so this is the text extracted from the page ' +
        (focus
          ? 'rather than a generated explanation. Set GEMINI_API_KEY to get full AI explanations.'
          : 'rather than a generated explanation. This page has no selectable text, so PDF-specific questions cannot be answered offline. Set GEMINI_API_KEY to answer general questions.') +
        (question ? `\n\nYour question: "${question}"` : '');
    }

    const heading = question ? `Page ${page} — your question` : `Page ${page} of ${docTitle}`;
    const keyPoints = sentences.length ? sentences : focus ? [focus.slice(0, 300)] : [];
    const blocks = this.synthesizeBlocksFromData({
      heading,
      explanation,
      keyPoints
    });

    return {
      mode,
      heading,
      explanation,
      keyPoints,
      followUp: 'Select Gemini 3.5 Flash or try asking again in a few moments.',
      blocks
    };
  }

  // ---------------------------------------------------------------------------
  // 8. NotebookLM Studio Features: PDF Multimodal OCR, Briefing Doc, Audio Overview, Source Chat & Study Pack
  // ---------------------------------------------------------------------------

  /**
   * Multimodal PDF / Scanned Page OCR powered by Gemini 3.8 Flash.
   * Accepts either a raw PDF base64 payload (`application/pdf`) or rendered page
   * images (`image/jpeg` / `image/png`) when client-side pdf.js text extraction
   * returns empty or incomplete text (e.g. scanned notes, CamScanner PDFs, Hindi fonts).
   */
  public async extractPdfTextWithGemini(input: {
    docTitle?: string;
    pdfBase64?: string;
    pageImages?: Array<{ page?: number; mimeType?: string; data: string }>;
  }): Promise<{ text: string; pagesExtracted: number; modelUsed: string }> {
    const docTitle = this.cleanString(input.docTitle, 200) || 'Uploaded PDF';
    const inlineParts: Array<{ mimeType: string; data: string }> = [];
    let pageLabels: number[] = [];

    if (typeof input.pdfBase64 === 'string' && input.pdfBase64.trim()) {
      const cleanBase64 = input.pdfBase64.replace(/^data:application\/pdf;base64,/, '').trim();
      inlineParts.push({
        mimeType: 'application/pdf',
        data: cleanBase64
      });
    } else if (Array.isArray(input.pageImages) && input.pageImages.length > 0) {
      for (const img of input.pageImages.slice(0, 12)) {
        if (!img || typeof img.data !== 'string' || !img.data.trim()) continue;
        const cleanData = img.data.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
        inlineParts.push({
          mimeType: img.mimeType || 'image/jpeg',
          data: cleanData
        });
        if (typeof img.page === 'number') pageLabels.push(img.page);
      }
    }

    if (inlineParts.length === 0) {
      return { text: '', pagesExtracted: 0, modelUsed: 'none' };
    }

    const pageContext =
      pageLabels.length > 0
        ? `These are rendered images of page(s) ${pageLabels.join(', ')} from "${docTitle}". Label each page clearly as "--- Page X ---".`
        : `This is the PDF document "${docTitle}". Label each page clearly as "--- Page X ---".`;

    const res = await gemini.generateTextWithMeta({
      model: 'gemini-3.8-flash',
      tier: 'heavy',
      inlineData: inlineParts,
      temperature: 0.1,
      maxOutputTokens: 8192,
      systemInstruction:
        'You are a high-precision multimodal OCR and document transcription engine powered by Gemini 3.8 Flash. ' +
        'Extract ALL visible text, headings, bullet points, numbered questions, options, tables, mathematical formulas, and diagrams/labels from the provided PDF or page images accurately and completely. ' +
        'Preserve both English and Hindi (Devanagari) text exactly as written. Write mathematical equations cleanly so they are 100% readable. Do not summarize or skip paragraphs—transcribe the complete content.',
      prompt: `${pageContext}\n\nTranscribe the full text of every page completely and accurately:`
    });

    if (res && res.text && res.text.trim()) {
      return {
        text: res.text.trim(),
        pagesExtracted: pageLabels.length || inlineParts.length,
        modelUsed: res.modelUsed || 'gemini-3.8-flash'
      };
    }

    return { text: '', pagesExtracted: 0, modelUsed: 'fallback' };
  }

  public async generateBriefingDoc(input: {
    docTitle?: string;
    sourceText: string;
    userId?: string;
  }): Promise<NotebookBriefingDoc> {
    const docTitle = this.cleanString(input.docTitle, 200) || 'Study Document';
    const sourceText = (input.sourceText || '').trim().slice(0, MAX_NOTEBOOK_SOURCE_CHARS);

    if (!sourceText) {
      return this.fallbackBriefingDoc(docTitle, 'No source text provided.');
    }

    const result = await gemini.generateJson<{
      executiveSummary?: string;
      keyConcepts?: Array<{ term?: string; definition?: string; examSignificance?: string }>;
      faq?: Array<{ question?: string; answer?: string }>;
      pitfallsAndTraps?: string[];
      revisionChecklist?: string[];
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nYou are an expert NotebookLM executive synthesis engine. Create a high-yield study briefing doc based strictly on the provided source text. Respond with JSON only.`,
      prompt:
        `Learner Context:\n${this.buildLearnerContext(input.userId)}\n\n` +
        `Document Title: "${docTitle}"\n\n` +
        `--- SOURCE TEXT START ---\n${sourceText}\n--- SOURCE TEXT END ---\n\n` +
        'Generate an executive briefing document containing:\n' +
        '1. An insightful 2-3 paragraph executive summary explaining the core message and architecture of the topic.\n' +
        '2. 4-7 key concepts (term, concise definition, and exam significance).\n' +
        '3. 3-5 frequent exam questions with crystal-clear answers.\n' +
        '4. 3-4 common student traps/pitfalls and misconceptions.\n' +
        '5. 4-6 bullet point revision checklist items for active recall.',
      schema: {
        type: 'OBJECT',
        properties: {
          executiveSummary: { type: 'STRING' },
          keyConcepts: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                term: { type: 'STRING' },
                definition: { type: 'STRING' },
                examSignificance: { type: 'STRING' }
              },
              required: ['term', 'definition', 'examSignificance']
            }
          },
          faq: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                question: { type: 'STRING' },
                answer: { type: 'STRING' }
              },
              required: ['question', 'answer']
            }
          },
          pitfallsAndTraps: { type: 'ARRAY', items: { type: 'STRING' } },
          revisionChecklist: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['executiveSummary', 'keyConcepts', 'faq', 'pitfallsAndTraps', 'revisionChecklist']
      },
      temperature: 0.5,
      maxOutputTokens: 4096,
      tier: 'heavy',
      model: 'gemini-3.8-flash'
    });

    if (result && result.executiveSummary) {
      const concepts = (result.keyConcepts || [])
        .map(c => ({
          term: this.cleanString(c?.term, 100) || '',
          definition: this.cleanString(c?.definition, 400) || '',
          examSignificance: this.cleanString(c?.examSignificance, 300) || ''
        }))
        .filter(c => c.term && c.definition);

      const faqs = (result.faq || [])
        .map(f => ({
          question: this.cleanString(f?.question, 250) || '',
          answer: this.cleanString(f?.answer, 600) || ''
        }))
        .filter(f => f.question && f.answer);

      return {
        docTitle,
        executiveSummary: this.cleanString(result.executiveSummary, 2500) || '',
        keyConcepts: concepts.length ? concepts : this.fallbackBriefingDoc(docTitle, sourceText).keyConcepts,
        faq: faqs.length ? faqs : this.fallbackBriefingDoc(docTitle, sourceText).faq,
        pitfallsAndTraps: this.cleanStringArray(result.pitfallsAndTraps, 6, 300),
        revisionChecklist: this.cleanStringArray(result.revisionChecklist, 8, 300),
        source: 'gemini'
      };
    }

    return this.fallbackBriefingDoc(docTitle, sourceText);
  }

  private splitSourceIntoPodcastSegments(sourceText: string, maxSegmentChars = 18000): string[] {
    const trimmed = sourceText.trim();
    if (trimmed.length <= maxSegmentChars) {
      return [trimmed];
    }

    // Split along page or paragraph boundaries, then hard-split oversized blocks
    // so a single long paragraph cannot exceed the model's source budget.
    const blocks = trimmed
      .split(/(?=---\s*Page\s*\d+\s*---|\n\n)/g)
      .flatMap(block => {
        const parts: string[] = [];
        let remaining = block.trim();
        while (remaining.length > maxSegmentChars) {
          let splitAt = remaining.lastIndexOf(' ', maxSegmentChars);
          if (splitAt < maxSegmentChars * 0.6) splitAt = maxSegmentChars;
          parts.push(remaining.slice(0, splitAt).trim());
          remaining = remaining.slice(splitAt).trim();
        }
        if (remaining) parts.push(remaining);
        return parts;
      });
    const segments: string[] = [];
    let current = '';

    for (const block of blocks) {
      const separator = current ? '\n\n' : '';
      if (current && (current + separator + block).length > maxSegmentChars) {
        segments.push(current.trim());
        current = block;
      } else {
        current += separator + block;
      }
    }
    if (current.trim()) {
      segments.push(current.trim());
    }

    return segments;
  }

  public async generateAudioOverview(input: {
    docTitle?: string;
    sourceText: string;
    language?: 'hinglish' | 'hindi' | 'english';
    userId?: string;
    voiceStyle?: string;
    ttsModel?: string;
    forceRegenerate?: boolean;
  }): Promise<NotebookAudioOverview> {
    const docTitle = this.cleanString(input.docTitle, 200) || 'Study Deep Dive';
    const sourceText = (input.sourceText || '').trim().slice(0, MAX_NOTEBOOK_SOURCE_CHARS);
    const language = input.language === 'hindi' || input.language === 'english' || input.language === 'hinglish'
      ? input.language
      : 'hinglish';

    if (!sourceText) {
      return this.fallbackAudioOverview(docTitle, language, sourceText);
    }

    const normalizedTitle = docTitle.trim().toLowerCase();
    // Do NOT include userId in sourceHash or inFlightKey so page reloads before/after auth hydration
    // never start a duplicate generation from Phase 0 or waste Gemini API quota!
    const sourceHash = createHash('sha256')
      .update(`${PODCAST_SCRIPT_CACHE_VERSION}\0${PODCAST_SCRIPT_SEGMENT_CHARS}\0${normalizedTitle}\0${language}\0${sourceText}`)
      .digest('hex');

    const inFlightKey = sourceHash;
    // 1. Check in-flight generation FIRST! If a job for this document/language is already running
    // (e.g. user reloaded page or closed/reopened laptop), attach to the running promise (0 extra API calls).
    const inFlight = this.podcastGenerationInFlight.get(inFlightKey);
    if (inFlight) {
      console.log(`[podcast-bg] Reusing in-flight podcast generation for "${docTitle}" (${language}) — 0 extra API calls`);
      return inFlight;
    }

    // 2. Check saved podcasts on disk (unless forceRegenerate was explicitly requested AND all segments are checked)
    const segments = this.splitSourceIntoPodcastSegments(sourceText, PODCAST_SCRIPT_SEGMENT_CHARS);
    const allSegmentCheckpointsExist = segments.every((_, idx) =>
      fs.existsSync(path.join(PODCAST_CHECKPOINT_DIR, `seg_${sourceHash}_${idx}_of_${segments.length}.json`))
    );

    if (!input.forceRegenerate) {
      const allSaved = storage.getSavedPodcasts(input.userId);
      const cachedPodcast = allSaved.find(
        podcast =>
          podcast.source === 'gemini' &&
          Array.isArray(podcast.turns) &&
          podcast.turns.length >= 4 &&
          (podcast.sourceHash === sourceHash ||
            (podcast.docTitle?.trim().toLowerCase() === normalizedTitle &&
              (podcast.language || 'hinglish') === language &&
              (segments.length === 1 || allSegmentCheckpointsExist)))
      );
      if (cachedPodcast && (segments.length === 1 || allSegmentCheckpointsExist)) {
        console.log(`[podcast-bg] Returning cached completed podcast for "${docTitle}" (${language}) — 0 API calls`);
        return { ...cachedPodcast, source: 'gemini' };
      }
    }

    const generation = this.generateAudioOverviewUncached({
      docTitle,
      sourceText,
      language,
      userId: input.userId,
      voiceStyle: input.voiceStyle,
      ttsModel: input.ttsModel,
      forceRegenerate: input.forceRegenerate,
      sourceHash,
      inFlightKey
    });
    this.podcastGenerationInFlight.set(inFlightKey, generation);
    try {
      return await generation;
    } finally {
      if (this.podcastGenerationInFlight.get(inFlightKey) === generation) {
        this.podcastGenerationInFlight.delete(inFlightKey);
      }
    }
  }

  private async generateAudioOverviewUncached(input: {
    docTitle: string;
    sourceText: string;
    language: 'hinglish' | 'hindi' | 'english';
    userId?: string;
    voiceStyle?: string;
    ttsModel?: string;
    forceRegenerate?: boolean;
    sourceHash: string;
    inFlightKey: string;
  }): Promise<NotebookAudioOverview> {
    const { docTitle, sourceText, language } = input;

    let languageDirective =
      'Language: HINGLISH (100% Authentic, Natural Indian Hinglish — Hindi + English). ' +
      'Write the dialogue exactly how two smart, warm, enthusiastic Indian friends/educators actually talk in real life! ' +
      'HOST GENDERS & GRAMMAR: Aarav is MALE (always uses male Hindi grammar: "मैं सोच रहा था", "मुझे लगता है", "अगर मैं देखूँ") and Ananya is FEMALE (always uses female Hindi grammar: "मैं बताती हूँ", "मैंने नोटिस किया है", "चलो मैं समझाती हूँ"). ' +
      'SCRIPT & TTS PRONUNCIATION RULE: Write Hindi conversational words in DEVANAGARI script and keep technical/English words in English script so Gemini 3.8 TTS pronounces both with 100% native perfection! ' +
      'USE NATURAL HUMAN CONVERSATIONAL FILLERS & REACTIONS: Include spontaneous human expressions like "अरे अनन्या, एक सेकंड रुको...", "हाहा, बिल्कुल सही पकड़ा तुमने आरव!", "हम्म, सोचने वाली बात है यार...", "ओह अच्छा! अब समझ आया कि...", "Wait, सच में? मुझे तो हमेशा लगता था कि...", "सुनो-सुनो, यहीं पर तो असली ट्विस्ट है!". ' +
      'Never sound like a textbook translation—use natural Indian analogies (chai, cricket, UPI, train ticket, pocket money, exam hall pressure) to make complex concepts click effortlessly!';
    if (language === 'hindi') {
      languageDirective =
        'Language: PURE SPOKEN HINDI (स्वाभाविक बोलचाल की हिंदी). Write the podcast dialogue in warm, natural, everyday spoken Hindi using Devanagari script throughout. ' +
        'HOST GENDERS: Aarav (आरव) is MALE and Ananya (अनन्या) is FEMALE — strictly use gender-accurate Hindi verb endings for each speaker. ' +
        'Use organic human expressions like "अरे वाह अनन्या, यह तो कमाल की बात है!", "हम्म, बिल्कुल सही कहा आरव, लेकिन ज़रा सोचो...", "ओह अच्छा! अब पूरी बात साफ़ हुई!", "रुको-रुको, परीक्षा में विद्यार्थी ठीक यहीं फँसते हैं!". ' +
        'Avoid stiff, robotic literary words when a simpler spoken Hindi explanation feels more human, and put English technical terms in natural phonetic flow.';
    } else if (language === 'english') {
      languageDirective =
        'Language: NATURAL CONVERSATIONAL ENGLISH (Google NotebookLM & Indian Topper Podcast Style). ' +
        'Write the dialogue so it sounds 100% like two real, witty, hyper-intelligent humans riffing off each other in a podcast studio. ' +
        'Include natural human speech patterns: contractions ("it\'s", "you\'re", "that\'s"), spontaneous reactions ("Wait, hold on Ananya—are you saying...", "Right?! And here\'s the wild part, Aarav...", "Hmm, let me think about how to picture that...", "Oh, that analogy is gold!"), mid-thought realizations, and genuine warmth.';
    }

    const segments = this.splitSourceIntoPodcastSegments(sourceText, PODCAST_SCRIPT_SEGMENT_CHARS);
    const nowIso = new Date().toISOString();

    // Check if there is already a saved partial/previous podcast ID for this sourceHash so progressive updates overwrite in place
    const existingSaved = storage
      .getSavedPodcasts(input.userId)
      .find(p => p.sourceHash === input.sourceHash && p.docTitle === docTitle && p.language === language);
    let progressivePodcastId: string | undefined = existingSaved?.id;

    const job: PodcastBackgroundJob = {
      jobId: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: input.userId,
      docTitle,
      language,
      voiceStyle: input.voiceStyle,
      ttsModel: input.ttsModel,
      status: 'generating_script',
      progressText:
        segments.length > 1
          ? `Generating Podcast Script in Background (Part 1/${segments.length})...`
          : 'Generating Podcast Script in Background...',
      segmentsCompleted: 0,
      totalSegments: segments.length,
      turnsGenerated: 0,
      startedAt: nowIso,
      updatedAt: nowIso
    };
    this.podcastJobs.set(input.inFlightKey, job);

    const allTurns: AudioTurn[] = [];
    let episodeTitle = existingSaved?.title || '';
    let episodeTagline = existingSaved?.tagline || '';

    try {
      for (let segIdx = 0; segIdx < segments.length; segIdx++) {
        const segText = segments[segIdx];
        const isFirst = segIdx === 0;
        const isLast = segIdx === segments.length - 1;
        const segCheckpointPath = path.join(
          PODCAST_CHECKPOINT_DIR,
          `seg_${input.sourceHash}_${segIdx}_of_${segments.length}.json`
        );

        // PER-SEGMENT DISK CHECKPOINT RECOVERY:
        // If this segment was already generated earlier (e.g. before server restart or quota pause),
        // load it directly from disk with 0 API calls instead of starting from the initial phase!
        if (!input.forceRegenerate && fs.existsSync(segCheckpointPath)) {
          try {
            const rawCheckpoint = await fs.promises.readFile(segCheckpointPath, 'utf8');
            const parsedCheckpoint = JSON.parse(rawCheckpoint);
            if (Array.isArray(parsedCheckpoint?.turns) && parsedCheckpoint.turns.length > 0) {
              if (!episodeTitle && parsedCheckpoint.title) episodeTitle = parsedCheckpoint.title;
              if (!episodeTagline && parsedCheckpoint.tagline) episodeTagline = parsedCheckpoint.tagline;
              allTurns.push(...parsedCheckpoint.turns);
              job.segmentsCompleted = segIdx + 1;
              job.turnsGenerated = allTurns.length;
              job.progressText =
                segments.length > 1
                  ? `Resumed Part ${segIdx + 1}/${segments.length} from checkpoint (${allTurns.length} turns ready)...`
                  : 'Loaded script from checkpoint...';
              job.updatedAt = new Date().toISOString();
              console.log(
                `[podcast-checkpoint] Resumed segment ${segIdx + 1}/${segments.length} for "${docTitle}" from disk (0 API calls)`
              );
              continue;
            }
          } catch {}
        }

        job.progressText =
          segments.length > 1
            ? `Generating Podcast Script (Part ${segIdx + 1}/${segments.length}${allTurns.length ? ` • ${allTurns.length} turns saved` : ''})...`
            : 'Generating Podcast Script in Background...';
        job.updatedAt = new Date().toISOString();

        // Dynamically scale target turns based on how much content is in this segment
        let minTurns = 16;
        let maxTurns = 22;
        if (segText.length > 10000) {
          minTurns = 34;
          maxTurns = 48;
        } else if (segText.length > 5000) {
          minTurns = 26;
          maxTurns = 36;
        } else if (segText.length > 2500) {
          minTurns = 20;
          maxTurns = 28;
        }
        const turnScale = Math.max(1, segText.length / 18000);
        minTurns = Math.ceil(minTurns * turnScale);
        maxTurns = Math.ceil(maxTurns * turnScale);

        let flowInstruction = '';
        if (segments.length === 1) {
          flowInstruction =
            `- Turns 1-2: Warm, spontaneous studio intro & a relatable hook about why "${docTitle}" matters.\n` +
            `- Middle Turns (Turns 3 to ${maxTurns - 3}): Exhaustive, sequential page-by-page / section-by-section walkthrough of EVERY SINGLE concept, definition, law, formula, numerical example, table, and exam trap in the source text. Do NOT skip or compress any subtopic!\n` +
            `- Final 2-3 Turns: Rapid-fire revision checklist & energetic sign-off.`;
        } else if (isFirst) {
          flowInstruction =
            `This is PART 1 of ${segments.length} of a comprehensive Masterclass Podcast on "${docTitle}".\n` +
            `- Turns 1-2: Warm, spontaneous studio intro & hook.\n` +
            `- Remaining Turns: Walk sequentially through EVERY SINGLE topic, definition, formula, example, and exam trick in this Part 1 text without skipping anything.\n` +
            `- Final Turn of Part 1: Do NOT end or sign off the podcast! End with a natural transition like "अच्छा आरव, यह तो था पहला हिस्सा—अब चलो अगले सेक्शन पर चलते हैं!" so Part 2 continues seamlessly.`;
        } else if (!isLast) {
          flowInstruction =
            `This is PART ${segIdx + 1} of ${segments.length} (Seamless Continuation) of the podcast on "${docTitle}".\n` +
            `- Do NOT re-introduce the podcast or say "Welcome back". Continue the conversation directly from the previous turn!\n` +
            `- Walk sequentially through EVERY SINGLE topic, definition, formula, example, and exam trap in this Part ${segIdx + 1} text without skipping any detail.\n` +
            `- Final Turn of Part ${segIdx + 1}: Do NOT sign off! End with a smooth transition to the next section.`;
        } else {
          flowInstruction =
            `This is the FINAL PART (Part ${segIdx + 1} of ${segments.length}) of the podcast on "${docTitle}".\n` +
            `- Do NOT re-introduce the podcast. Continue the conversation directly!\n` +
            `- Walk sequentially through EVERY SINGLE remaining topic, definition, formula, example, and exam trap in this section without skipping anything.\n` +
            `- Final 2-3 Turns: Wrap up the entire episode with a high-yield rapid-fire revision recap and energetic sign-off.`;
        }

        const result = await gemini.generateJson<{
          title?: string;
          tagline?: string;
          durationEstimate?: string;
          turns?: Array<{ speaker?: string; text?: string; emotion?: string }>;
        }>({
          model: 'gemini-3.8-flash',
          tier: 'heavy',
          systemInstruction:
            'You are the master podcast showrunner for StudyOS Audio Deep Dives, powered by Gemini 3.8 Flash and Gemini 3.8 TTS. ' +
            'You write scripts for two unforgettable Indian hosts:\n' +
            '- Aarav (Male Host): Curious, energetic, relatable, thinks out loud like a sharp student, asks the exact "Wait, why does that happen?" questions listeners have in their heads, and occasionally shares how he used to get confused by a concept.\n' +
            '- Ananya (Female Co-Host): Warm, razor-sharp exam topper and storyteller who breaks down dense PDF material using vivid real-life analogies, reveals hidden exam traps, and gives 10-second mental shortcuts.\n\n' +
            'CRITICAL MANDATE — 100% COMPLETE COVERAGE (ZERO OMISSION):\n' +
            '- JITNA BADA CONTENT, UTNA BADA PODCAST: Never summarize a rich PDF into a brief overview! You MUST go through the provided source material sequentially from start to finish.\n' +
            '- Every single heading, subtopic, definition, rule, mathematical formula, numerical example, comparison table, and exam trick present in the source text MUST be explained clearly and thoroughly by Aarav and Ananya.\n' +
            '- If the document has 15 concepts, explain all 15 concepts one by one with examples. Never skip middle paragraphs or rush to the end.\n\n' +
            'RULES FOR 100% HUMAN-LIKE, UNSCRIPTED-FEELING CONVERSATION:\n' +
            '1. NO ROBOTIC PING-PONG OR LECTURING: Never write stiff Q&A where Aarav asks a textbook question and Ananya recites a paragraph. Instead, make them finish each other\'s thoughts, react with surprise ("अरे बाप रे!", "ओह अच्छा!", "Wait, seriously?"), chuckle ("हाहा, बिल्कुल!"), and build momentum together.\n' +
            '2. VARIED RHYTHM & PACING: Mix short, punchy 1-sentence reactions/interjections with rich, detailed 3-to-5 sentence explanations so every concept is deeply understood.\n' +
            '3. PURE SPOKEN AUDIO FORMAT FOR GEMINI 3.8 TTS: Write ONLY what is spoken aloud. NEVER include markdown (*, #, _, `, bullets) or raw math symbols (write "Delta U barabar Q minus W" or "Delta U equals Q minus W" instead of "\\Delta U = Q - W"). Use natural punctuation (commas, ellipses "...", em-dashes "—", exclamation marks "!", question marks "?") to guide voice intonation and breathing pauses. Respond with JSON only.\n' +
            languageDirective,
          prompt:
            `Document Title: "${docTitle}" (Section ${segIdx + 1} of ${segments.length})\n\n` +
            `--- SOURCE TEXT START ---\n${segText}\n--- SOURCE TEXT END ---\n\n` +
            `Generate a comprehensive, ${minTurns} to ${maxTurns} turn human-like podcast conversation between Aarav (Male) and Ananya (Female) that explains 100% of the information in the source text above without missing a single concept, formula, or example.\n` +
            `${flowInstruction}\n` +
            'Ensure Aarav and Ananya alternate turns naturally. Return JSON with title, tagline, durationEstimate, and turns[{speaker, text, emotion}].',
          schema: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              tagline: { type: 'STRING' },
              durationEstimate: { type: 'STRING' },
              turns: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    speaker: { type: 'STRING' },
                    text: { type: 'STRING' },
                    emotion: { type: 'STRING' }
                  },
                  required: ['speaker', 'text']
                }
              }
            },
            required: ['title', 'tagline', 'durationEstimate', 'turns']
          },
          temperature: 0.8,
          maxOutputTokens: 65536
        });

        if (result && Array.isArray(result.turns) && result.turns.length > 0) {
          if (!episodeTitle && result.title) {
            episodeTitle = this.cleanString(result.title, 200) || '';
          }
          if (!episodeTagline && result.tagline) {
            episodeTagline = this.cleanString(result.tagline, 250) || '';
          }

          const segTurns: AudioTurn[] = result.turns
            .map(t => {
              const speakerRaw = (t?.speaker || '').toLowerCase();
              const speaker: 'Aarav' | 'Ananya' =
                speakerRaw.includes('ananya') || speakerRaw.includes('sam') || speakerRaw.includes('female')
                  ? 'Ananya'
                  : 'Aarav';
              return {
                speaker,
                text: this.cleanString(t?.text, 3500) || '',
                emotion: this.cleanString(t?.emotion, 50) || 'conversational'
              };
            })
            .filter(t => t.text.length > 0);

          if (segTurns.length > 0) {
            allTurns.push(...segTurns);
            job.segmentsCompleted = segIdx + 1;
            job.turnsGenerated = allTurns.length;
            job.updatedAt = new Date().toISOString();

            // 1. Write segment checkpoint to disk immediately so this segment is NEVER regenerated again
            await fs.promises
              .writeFile(
                segCheckpointPath,
                JSON.stringify({
                  title: episodeTitle,
                  tagline: episodeTagline,
                  turns: segTurns,
                  completedAt: job.updatedAt
                }),
                'utf8'
              )
              .catch(() => {});

            // 2. Progressively save the podcast after every segment so work is never lost
            if (allTurns.length >= 4) {
              const wordCount = allTurns.reduce(
                (total, turn) => total + turn.text.split(/\s+/).filter(Boolean).length,
                0
              );
              const durationMinutes = Math.max(1, Math.round(wordCount / 135));
              const savedProgressive = storage.savePodcast({
                id: progressivePodcastId,
                userId: input.userId,
                docTitle,
                title: episodeTitle || `${docTitle}: Complete Deep Dive`,
                tagline:
                  episodeTagline ||
                  `Aarav & Ananya explain every concept, formula, and exam trick from ${docTitle} in complete detail.`,
                durationEstimate: `~${durationMinutes} min listen (${allTurns.length} turns)`,
                language,
                turns: [...allTurns],
                source: 'gemini',
                sourceHash: input.sourceHash
              });
              progressivePodcastId = savedProgressive.id;
              job.podcastId = savedProgressive.id;
              job.podcast = { ...savedProgressive, source: 'gemini' };
            }
          }
        }
      }

      if (allTurns.length >= 4) {
        const wordCount = allTurns.reduce((total, turn) => total + turn.text.split(/\s+/).filter(Boolean).length, 0);
        const durationMinutes = Math.max(1, Math.round(wordCount / 135));
        const saved = storage.savePodcast({
          id: progressivePodcastId,
          userId: input.userId,
          docTitle,
          title: episodeTitle || `${docTitle}: Complete Deep Dive`,
          tagline:
            episodeTagline ||
            `Aarav & Ananya explain every concept, formula, and exam trick from ${docTitle} in complete detail.`,
          durationEstimate: `~${durationMinutes} min listen (${allTurns.length} turns)`,
          language,
          turns: allTurns,
          source: 'gemini',
          sourceHash: input.sourceHash
        });

        const enrichedPodcast: NotebookAudioOverview = {
          ...saved,
          source: 'gemini'
        };

        job.podcastId = saved.id;
        job.podcast = enrichedPodcast;
        job.status = 'synthesizing_audio';
        job.progressText = 'Pre-synthesizing Gemini Flash TTS Studio Audio...';
        job.updatedAt = new Date().toISOString();

        // Pre-warm the first 4-turn batch in the background on the server so audio plays in 0ms when ready.
        // Deduplicated via neuralTts.batchInFlight so even if client plays immediately, only 1 TTS call is made!
        void neuralTts
          .synthesizeFullEpisode(
            allTurns.slice(0, 4),
            language,
            input.voiceStyle || 'gemini38',
            input.ttsModel || 'gemini-3.8-flash-tts'
          )
          .catch(err => {
            console.warn('[podcast-bg] first batch pre-warm notice:', err?.message || err);
          })
          .finally(() => {
            const currentJob = this.podcastJobs.get(input.inFlightKey);
            if (currentJob) {
              currentJob.status = 'completed';
              currentJob.progressText = 'Podcast & Studio Audio Ready!';
              currentJob.updatedAt = new Date().toISOString();
            }
          });

        return enrichedPodcast;
      }

      const fallbackRes = this.fallbackAudioOverview(docTitle, language, sourceText, input.userId);
      job.podcastId = fallbackRes.id;
      job.podcast = fallbackRes;
      job.status = 'completed';
      job.progressText = 'Podcast Ready!';
      job.updatedAt = new Date().toISOString();
      return fallbackRes;
    } catch (err: any) {
      job.status = 'failed';
      job.error = err?.message || 'Generation failed';
      job.progressText = 'Generation encountered an error';
      job.updatedAt = new Date().toISOString();
      throw err;
    }
  }

  public async askSourceQuestion(input: {
    docTitle?: string;
    sourceText: string;
    question: string;
    history?: Array<{ role: 'user' | 'assistant'; text: string }>;
    userId?: string;
  }): Promise<NotebookSourceAnswer> {
    const docTitle = this.cleanString(input.docTitle, 200) || 'Document';
    const sourceText = (input.sourceText || '').trim().slice(0, MAX_NOTEBOOK_SOURCE_CHARS);
    const question = this.cleanString(input.question, 2000) || '';

    if (!question) {
      return {
        question: '',
        answer: 'Please provide a question about the document.',
        citations: [],
        suggestedFollowUps: [],
        source: 'fallback'
      };
    }

    // Convert up to 20 past turns for Gemini's multi-turn conversational memory
    const conversationHistory = (input.history || [])
      .slice(-20)
      .map(h => ({
        role: (h.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        text: h.text
      }));

    const result = await gemini.generateJson<{
      answer?: string;
      citations?: string[];
      suggestedFollowUps?: string[];
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nYou are StudyOS AI Master Tutor & Intelligent Coach. You help students understand study notes, concepts, and solve tricky exam questions. Ground your answer in the source text when relevant. Always provide complete step-by-step mathematical working with standard LaTeX ($$...$$ for display math, $...$ for inline), speed tricks, and match the student's language (Hindi, Hinglish, or English). Respond with JSON only.`,
      prompt:
        (sourceText ? `Document Title: "${docTitle}"\n--- SOURCE TEXT START ---\n${sourceText}\n--- SOURCE TEXT END ---\n\n` : '') +
        `Student Question: "${question}"\n\n` +
        'Instructions:\n' +
        '1. Provide a comprehensive, in-depth pedagogical answer following the CORE TEACHING PRINCIPLES.\n' +
        '2. If the question is in Hindi (Devanagari) or Hinglish (Roman Hindi), reply in natural, friendly Hindi/Hinglish.\n' +
        '3. If mathematical, write all formulas and steps in LaTeX ($$...$$ or $...$), showing given values, step-by-step derivation, and exam shortcut hack.\n' +
        '4. Include 💡 Pro Tip and ⚠️ Common Mistake / Exam Trap.\n' +
        '5. List 1-3 direct citations/references from the source if applicable, and suggest 3 smart follow-up questions.',
      schema: {
        type: 'OBJECT',
        properties: {
          answer: { type: 'STRING' },
          citations: { type: 'ARRAY', items: { type: 'STRING' } },
          suggestedFollowUps: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['answer', 'citations', 'suggestedFollowUps']
      },
      temperature: 0.6,
      maxOutputTokens: 8192,
      tier: 'heavy',
      conversationHistory
    });

    if (result && result.answer) {
      return {
        question,
        answer: this.cleanString(result.answer, 16000) || '',
        citations: this.cleanStringArray(result.citations, 4, 500),
        suggestedFollowUps: this.cleanStringArray(result.suggestedFollowUps, 3, 300),
        source: 'gemini'
      };
    }

    return {
      question,
      answer: `Based on "${docTitle}", key elements related to your query focus on the core foundational rules and context outlined in the document. Ensure you connect these definitions to practical exam applications.`,
      citations: [`Excerpt from ${docTitle}`],
      suggestedFollowUps: [
        'How does this relate to previous exam questions?',
        'Can you summarize the top 3 takeaways from this section?',
        'What is the mathematical or logical proof behind this?'
      ],
      source: 'fallback'
    };
  }

  public async generateSourceStudyPack(input: {
    docTitle?: string;
    sourceText: string;
    userId?: string;
  }): Promise<NotebookStudyPack> {
    const docTitle = this.cleanString(input.docTitle, 200) || 'Study Document';
    const sourceText = (input.sourceText || '').trim().slice(0, MAX_NOTEBOOK_SOURCE_CHARS);

    const result = await gemini.generateJson<{
      flashcards?: Array<{ front?: string; back?: string }>;
      quiz?: Array<{
        question?: string;
        options?: string[];
        correctAnswerIndex?: number;
        explanation?: string;
      }>;
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nGenerate high-yield active recall flashcards (12-20 items) and multiple-choice questions (4-6 items) strictly grounded in the source document. Flashcards should thoroughly test key definitions, formulas, exceptions, steps, and facts. Respond with JSON only.`,
      prompt:
        `Document Title: "${docTitle}"\n\n` +
        `--- SOURCE TEXT START ---\n${sourceText}\n--- SOURCE TEXT END ---\n\n` +
        'Generate an extensive set of 12-20 flashcards (front: focused question or prompt, back: crisp, self-contained answer) and 4-6 MCQs (correctAnswerIndex 0-3, plus explanation).',
      schema: {
        type: 'OBJECT',
        properties: {
          flashcards: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                front: { type: 'STRING' },
                back: { type: 'STRING' }
              },
              required: ['front', 'back']
            }
          },
          quiz: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                question: { type: 'STRING' },
                options: { type: 'ARRAY', items: { type: 'STRING' } },
                correctAnswerIndex: { type: 'INTEGER' },
                explanation: { type: 'STRING' }
              },
              required: ['question', 'options', 'correctAnswerIndex', 'explanation']
            }
          }
        },
        required: ['flashcards', 'quiz']
      },
      temperature: 0.6,
      maxOutputTokens: 6144,
      tier: 'flashcards'
    });

    const flashcards: Flashcard[] = [];
    (result?.flashcards || []).forEach((c, idx) => {
      const front = this.cleanString(c?.front, 300);
      const back = this.cleanString(c?.back, 600);
      if (front && back) {
        flashcards.push({
          id: `fc-src-${Date.now()}-${idx}`,
          front,
          back,
          subject: docTitle,
          masteryLevel: 'learning'
        });
      }
    });

    const quiz: QuizQuestion[] = [];
    (result?.quiz || []).forEach((q, idx) => {
      const question = this.cleanString(q?.question, 400);
      const options = this.cleanStringArray(q?.options, 4, 250);
      const explanation = this.cleanString(q?.explanation, 500);
      if (question && options.length === 4 && explanation) {
        quiz.push({
          id: `q-src-${Date.now()}-${idx}`,
          question,
          options,
          correctAnswer: this.clampInt(q?.correctAnswerIndex, 0, 3, 0),
          explanation,
          subject: docTitle,
          topic: docTitle
        });
      }
    });

    if (flashcards.length || quiz.length) {
      return {
        docTitle,
        flashcards: flashcards.length ? flashcards : this.fallbackFlashcards(docTitle),
        quiz: quiz.length ? quiz : this.fallbackQuiz(docTitle),
        source: 'gemini'
      };
    }

    return {
      docTitle,
      flashcards: this.fallbackFlashcards(docTitle),
      quiz: this.fallbackQuiz(docTitle),
      source: 'fallback'
    };
  }

  // Fallbacks for NotebookLM
  private fallbackBriefingDoc(docTitle: string, sourceText: string): NotebookBriefingDoc {
    return {
      docTitle,
      executiveSummary:
        `This briefing document synthesizes the core principles of "${docTitle}". ` +
        'The material establishes fundamental framework relationships, high-yield definitions, and practical problem-solving methodologies for competitive exams.',
      keyConcepts: [
        {
          term: 'Core Foundational Principle',
          definition: 'The fundamental law or theorem upon which subsequent derivations and applications are constructed.',
          examSignificance: 'Direct conceptual questions in preliminary and main stages.'
        },
        {
          term: 'Operational Boundary Conditions',
          definition: 'The specific constraints and state variables required for standard equations to remain valid.',
          examSignificance: 'Critical for avoiding typical elimination traps in multiple-choice questions.'
        }
      ],
      faq: [
        {
          question: `What is the most frequently tested aspect of ${docTitle}?`,
          answer: 'Understanding the underlying assumptions and applying direct formula shortcuts without arithmetic slips.'
        }
      ],
      pitfallsAndTraps: [
        'Confusing definitions across similar terms in high-pressure exam environments.',
        'Neglecting unit conversions before substituting values into governing formulas.'
      ],
      revisionChecklist: [
        'Memorize core formula derivations.',
        'Review standard exceptions and edge cases.',
        'Solve 5 timed practice questions on this topic.'
      ],
      source: 'fallback'
    };
  }

  private fallbackAudioOverview(
    docTitle: string,
    language: 'hinglish' | 'hindi' | 'english' = 'hinglish',
    sourceText = '',
    userId?: string
  ): NotebookAudioOverview {
    const snippets = sourceText
      .replace(/---\s*Page\s+\d+\s*---/gi, ' ')
      .split(/(?<=[.!?।])\s+|\n+/)
      .map(part => part.trim().slice(0, 1000))
      .filter(part => part.length > 20)
      .slice(0, 6);
    const selectedSnippets = snippets.length ? snippets : [sourceText.trim().slice(0, 500)].filter(Boolean);
    const intro = language === 'english'
      ? `Welcome to ${docTitle}. Aarav and Ananya are using your provided notes for this source-based audio recap.`
      : language === 'hindi'
        ? `${docTitle} के इस ऑडियो पुनरावलोकन में आरव और अनन्या दिए गए notes के मुख्य अंश पढ़ेंगे।`
        : `${docTitle} ke is audio recap mein Aarav aur Ananya aapke notes ke key points sunayenge.`;
    const turns: AudioTurn[] = [{ speaker: 'Aarav', text: intro, emotion: 'conversational' }];

    selectedSnippets.forEach((snippet, index) => {
      const speaker: 'Aarav' | 'Ananya' = index % 2 === 0 ? 'Ananya' : 'Aarav';
      const leadIn = language === 'english'
        ? `Key point ${index + 1} from the source:`
        : language === 'hindi'
          ? `स्रोत से मुख्य अंश ${index + 1}:`
          : `Notes ka key point ${index + 1}:`;
      turns.push({ speaker, text: `${leadIn} ${snippet}`, emotion: 'explaining' });
    });

    const wordCount = turns.reduce((total, turn) => total + turn.text.split(/\s+/).filter(Boolean).length, 0);
    const durationMinutes = Math.max(1, Math.round(wordCount / 135));
    const saved = storage.savePodcast({
      userId,
      docTitle,
      title: `${docTitle}: ${language === 'hindi' ? 'स्रोत आधारित पुनरावलोकन' : language === 'english' ? 'Source-based recap' : 'Notes se Hinglish recap'}`,
      tagline: 'AI script generation was unavailable, so this recap reads key excerpts from your source notes.',
      durationEstimate: `~${durationMinutes} min listen`,
      language,
      turns,
      source: 'fallback'
    });
    return {
      ...saved,
      source: 'fallback'
    };
  }
}

export const aiCoach = new AICoachService();
