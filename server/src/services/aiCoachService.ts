import { storage, localDateKey } from './storageService.js';
import { gemini, DEFAULT_GEMINI_MODEL } from './geminiService.js';
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

export interface PdfAssistResult {
  mode: PdfAssistMode;
  heading: string;
  explanation: string;
  keyPoints: string[];
  formula?: string;
  followUp?: string;
  source: AISource;
}

// NotebookLM Types
export interface AudioTurn {
  speaker: 'Alex' | 'Sam';
  text: string;
  emotion?: string;
}

export interface NotebookAudioOverview {
  docTitle: string;
  title: string;
  tagline: string;
  durationEstimate: string;
  language?: 'hinglish' | 'hindi' | 'english';
  turns: AudioTurn[];
  source: AISource;
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
const MAX_PAGE_CHARS = 6000;
const MAX_SELECTION_CHARS = 1500;
const MAX_NOTEBOOK_SOURCE_CHARS = 24000;

const EXAM_COACH_PERSONA =
  'You are StudyOS AI Coach, a patient expert tutor for Indian competitive exams ' +
  '(RRB PO, IBPS PO, SBI PO, SSC CGL). Explain with exam-oriented precision, use SI units, ' +
  'and keep language crisp. Ground your answer in the learner context when it is provided.';

export class AICoachService {
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
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : undefined;
  }

  private cleanStringArray(value: unknown, maxItems = 8, maxLength = 400): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map(v => this.cleanString(v, maxLength))
      .filter((v): v is string => Boolean(v))
      .slice(0, maxItems);
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
      systemInstruction: `${EXAM_COACH_PERSONA}\nBreak the doubt down step by step for a student revising for an exam. Respond with JSON only.`,
      prompt:
        `Learner context:\n${this.buildLearnerContext(context?.userId)}\n` +
        (contextLines.length ? `${contextLines.join('\n')}\n` : '') +
        `\nDoubt: "${question}"\n\n` +
        'Give a conceptual explanation (2-4 sentences), 3-5 ordered reasoning steps, the single most relevant ' +
        'formula in LaTeX if the topic has one (omit keyFormula for non-mathematical topics), and one exam practice tip.',
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
      tier: 'heavy'
    });

    if (solution) {
      const explanation = this.cleanString(solution.explanation, 1200);
      const steps = this.cleanStringArray(solution.steps, 6, 500);
      if (explanation && steps.length) {
        return {
          explanation,
          steps,
          keyFormula: this.cleanString(solution.keyFormula, 300),
          practiceTip: this.cleanString(solution.practiceTip, 400) || 'Attempt two similar problems without looking at the solution.',
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
  }): Promise<PdfAssistResult> {
    const page = this.clampInt(input.page, 1, 100000, 1);
    const docTitle = this.cleanString(input.docTitle, 200) || 'Study PDF';
    const selectedText = this.cleanString(input.selectedText, MAX_SELECTION_CHARS);
    const question = this.cleanString(input.question, 500);
    const pageText = (input.pageText || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_CHARS);

    // Scanned / image-only pages have no text layer, so say so plainly rather
    // than inventing an explanation.
    if (!pageText) {
      return {
        mode: input.mode || 'page',
        heading: `Page ${page} has no selectable text`,
        explanation:
          'This page looks like a scanned image, so there is no text layer for the AI to read. ' +
          'Try selecting text on a page that contains real text.',
        keyPoints: [],
        source: 'fallback'
      };
    }

    // A typed question chooses the task, but any selected passage still gives it context.
    const mode: PdfAssistMode =
      input.mode === 'question' && question ? 'question' : selectedText ? 'selection' : input.mode === 'question' ? 'page' : input.mode || 'page';

    const focus =
      mode === 'question'
        ? `Question: "${question}"${selectedText ? `\nSelected passage the question refers to:\n"${selectedText}"` : ''}`
        : mode === 'selection'
        ? `Selected passage the student did not understand:\n"${selectedText}"`
        : `The student wants page ${page} explained end to end.`;

    const task =
      mode === 'question'
        ? 'Answer the question using the page text as the source of truth. If the page text does not contain the answer, say so explicitly in the explanation, then give the standard exam answer and mark it as outside the page.'
        : mode === 'selection'
        ? 'Explain the selected passage in plain language: what it means, any term or symbol that needs defining, and why it matters for the exam.'
        : 'Explain what this page is about, then list the points a student must remember from it.';

    const result = await gemini.generateJson<{
      heading?: string;
      explanation?: string;
      keyPoints?: string[];
      formula?: string;
      followUp?: string;
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nYou are embedded inside a PDF reader. The page text below is the only source of truth about the document. Never claim the document says something it does not. Respond with JSON only.`,
      prompt:
        `Learner context:\n${this.buildLearnerContext(input.userId)}\n\n` +
        `Document: "${docTitle}" — page ${page}\n` +
        `${focus}\n\n` +
        `--- PAGE TEXT START ---\n${pageText}\n--- PAGE TEXT END ---\n\n` +
        `${task}\n\n` +
        'Return a short heading, a 2-4 sentence explanation, 2-5 key points, the single most relevant ' +
        'formula in LaTeX if the page has one (otherwise an empty string), and one follow-up question ' +
        'the student should ask themselves.',
      schema: {
        type: 'OBJECT',
        properties: {
          heading: { type: 'STRING' },
          explanation: { type: 'STRING' },
          keyPoints: { type: 'ARRAY', items: { type: 'STRING' } },
          formula: { type: 'STRING', description: 'LaTeX, or empty string when not applicable' },
          followUp: { type: 'STRING' }
        },
        required: ['heading', 'explanation', 'keyPoints']
      },
      temperature: 0.5
    });

    if (result) {
      const explanation = this.cleanString(result.explanation, 1600);
      const keyPoints = this.cleanStringArray(result.keyPoints, 6, 500);
      if (explanation) {
        return {
          mode,
          heading: this.cleanString(result.heading, 200) || `${docTitle} — page ${page}`,
          explanation,
          keyPoints,
          formula: this.cleanString(result.formula, 300),
          followUp: this.cleanString(result.followUp, 300),
          source: 'gemini'
        };
      }
    }

    return { ...this.fallbackPdfAssist(mode, page, docTitle, pageText, selectedText, question), source: 'fallback' };
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

    const explanation =
      'The AI service is not configured on this server, so this is the text extracted from the page ' +
      'rather than a generated explanation. Set GEMINI_API_KEY to get full AI explanations.' +
      (question ? `\n\nYour question: "${question}"` : '');

    return {
      mode,
      heading: question ? `Page ${page} — your question` : `Page ${page} of ${docTitle}`,
      explanation,
      keyPoints: sentences.length ? sentences : [focus.slice(0, 300)],
      followUp: 'Try the AI Coach hub for a full conceptual breakdown.'
    };
  }

  // ---------------------------------------------------------------------------
  // 8. NotebookLM Studio Features: Briefing Doc, Audio Overview, Source Chat & Study Pack
  // ---------------------------------------------------------------------------

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
      tier: 'heavy'
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

  public async generateAudioOverview(input: {
    docTitle?: string;
    sourceText: string;
    language?: 'hinglish' | 'hindi' | 'english';
    userId?: string;
  }): Promise<NotebookAudioOverview> {
    const docTitle = this.cleanString(input.docTitle, 200) || 'Study Deep Dive';
    const sourceText = (input.sourceText || '').trim().slice(0, MAX_NOTEBOOK_SOURCE_CHARS);
    const language = input.language || 'hinglish';

    if (!sourceText) {
      return this.fallbackAudioOverview(docTitle, language);
    }

    let languageDirective =
      'Language: HINGLISH. Write the podcast dialogue in authentic, natural conversational Hinglish (the way intelligent Indian educators and students speak). ' +
      'CRUCIAL FOR NATURAL INDIAN PRONUNCIATION: Write all spoken conversational Hindi sentences in DEVANAGARI script (e.g. "अरे सैम!", "बिल्कुल सही बात!", "लेकिन यहाँ एक बहुत बड़ा ट्विस्ट है...", "चलो इसे एक आसान उदाहरण से समझते हैं..."). ' +
      'Write technical terms, formulas, key concepts, and common English phrases in English or standard terminology (e.g. Thermodynamics, First Law, Heat Engine, Internal Energy, Work Done, Isolated System, Efficiency, Common Pitfalls). ' +
      'Alex and Sam must sound like two enthusiastic, brilliant friends having an insightful conversation over chai, making every complex concept intuitive and fun. ' +
      'Do NOT write Hindi in Roman script; using Devanagari for the Hindi parts ensures the neural voice pronounces every word with authentic native Indian warmth and cadence without any foreign accent!';
    if (language === 'hindi') {
      languageDirective =
        'Language: PURE HINDI (हिंदी). Write the podcast dialogue in warm, fluent, engaging conversational Hindi using Devanagari script throughout. ' +
        'Alex and Sam talk like two passionate, brilliant study partners sitting across the table with cups of chai. ' +
        'Use natural spoken phrases like "अरे वाह सैम!", "बिल्कुल सही बात!", "अब यहाँ एक बहुत बड़ा ट्विस्ट है...", "परीक्षा में विद्यार्थी अक्सर यहीं गलती करते हैं...". ' +
        'Explain every technical term with clarity, using standard Hindi terminology while keeping the tone lively, respectful, and motivating.';
    } else if (language === 'english') {
      languageDirective =
        'Language: ENGLISH (Indian Educator & NotebookLM Style). Write the podcast dialogue in charismatic, witty, deeply insightful English in the signature Google NotebookLM style. ' +
        'Alex is curious and energetic; Sam is structured, perceptive, and clear. They banter naturally, use vivid analogies, and tie ideas to competitive exam mastery.';
    }

    const result = await gemini.generateJson<{
      title?: string;
      tagline?: string;
      durationEstimate?: string;
      turns?: Array<{ speaker?: string; text?: string; emotion?: string }>;
    }>({
      tier: 'heavy',
      systemInstruction:
        'You are the lead showrunner and audio director for Google NotebookLM Deep Dive Podcasts. ' +
        'You write scripts for two world-class co-hosts: Alex (curious, relatable, asks the tough questions, catches student confusion points) ' +
        'and Sam (analytical, calm, deep-thinker, gives unforgettable real-world analogies and topper exam secrets). ' +
        'THEIR BANTER IS FAMOUS FOR FEELING 100% ALIVE, WITTY, AND HUMAN: ' +
        'They react dynamically ("Wait, wait, Sam, back up a second!", "Haha, exactly Alex!", "Spot on!"), build on each other’s thoughts, ' +
        'and never lecture monotonously. Each turn must have 3 to 6 rich, comprehensive sentences that thoroughly unpack every concept, ' +
        'formula, exception, and trap from the source material. ' +
        'CRITICAL FOR AUDIO: Write pure spoken words only. Never include markdown symbols (*, #, _, `, bullet points, brackets) or raw math notation (write "Delta U equals Q minus W" instead of "\\Delta U = Q - W"). Respond with JSON only.\n' +
        languageDirective,
      prompt:
        `Document Title: "${docTitle}"\n\n` +
        `--- SOURCE TEXT START ---\n${sourceText}\n--- SOURCE TEXT END ---\n\n` +
        'Generate a complete 16-24 turn Google NotebookLM style Audio Deep Dive between Alex and Sam unpacking this document in the specified language. ' +
        'Cover all principles, definitions, derivations, real-world examples, and exam pitfalls in thorough detail. ' +
        'Alex and Sam must alternate naturally. Give each turn speaker ("Alex" or "Sam"), dialogue text, and emotion tone.',
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
      temperature: 0.7,
      maxOutputTokens: 8192
    });

    if (result && Array.isArray(result.turns) && result.turns.length >= 4) {
      const turns: AudioTurn[] = result.turns
        .map(t => {
          const speakerRaw = (t?.speaker || '').toLowerCase();
          const speaker: 'Alex' | 'Sam' = speakerRaw.includes('sam') ? 'Sam' : 'Alex';
          return {
            speaker,
            text: this.cleanString(t?.text, 2000) || '',
            emotion: this.cleanString(t?.emotion, 50) || 'conversational'
          };
        })
        .filter(t => t.text.length > 0);

      if (turns.length >= 4) {
        return {
          docTitle,
          title: this.cleanString(result.title, 200) || `${docTitle}: The Deep Dive`,
          tagline: this.cleanString(result.tagline, 250) || 'An engaging conversation breaking down the core concepts.',
          durationEstimate: this.cleanString(result.durationEstimate, 50) || `${Math.ceil(turns.length * 0.4)} min listen`,
          language,
          turns,
          source: 'gemini'
        };
      }
    }

    return this.fallbackAudioOverview(docTitle, language);
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
    const question = this.cleanString(input.question, 1000) || '';

    if (!question) {
      return {
        question: '',
        answer: 'Please provide a question about the document.',
        citations: [],
        suggestedFollowUps: [],
        source: 'fallback'
      };
    }

    const historyText = (input.history || [])
      .slice(-6)
      .map(h => `${h.role === 'user' ? 'Student' : 'NotebookLM Coach'}: ${h.text}`)
      .join('\n');

    const result = await gemini.generateJson<{
      answer?: string;
      citations?: string[];
      suggestedFollowUps?: string[];
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nYou are NotebookLM's source-grounded intelligent tutor. Answer the student strictly based on the source text. Quote or cite source evidence directly. Suggest 3 follow-up study questions. Respond with JSON only.`,
      prompt:
        `Document Title: "${docTitle}"\n\n` +
        `--- SOURCE TEXT START ---\n${sourceText}\n--- SOURCE TEXT END ---\n\n` +
        (historyText ? `Recent conversation:\n${historyText}\n\n` : '') +
        `Student Question: "${question}"\n\n` +
        'Provide a clear, pedagogical answer grounded in the source text, list 1-3 direct citations or references from the source, and suggest 3 follow-up questions.',
      schema: {
        type: 'OBJECT',
        properties: {
          answer: { type: 'STRING' },
          citations: { type: 'ARRAY', items: { type: 'STRING' } },
          suggestedFollowUps: { type: 'ARRAY', items: { type: 'STRING' } }
        },
        required: ['answer', 'citations', 'suggestedFollowUps']
      },
      temperature: 0.5,
      maxOutputTokens: 2048,
      tier: 'lite'
    });

    if (result && result.answer) {
      return {
        question,
        answer: this.cleanString(result.answer, 2000) || '',
        citations: this.cleanStringArray(result.citations, 4, 300),
        suggestedFollowUps: this.cleanStringArray(result.suggestedFollowUps, 3, 200),
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
    language: 'hinglish' | 'hindi' | 'english' = 'hinglish'
  ): NotebookAudioOverview {
    if (language === 'hindi') {
      return {
        docTitle,
        title: `${docTitle}: संपूर्ण ऑडियो विश्लेषण (Hindi Deep Dive)`,
        tagline: 'एलेक्स और सैम के साथ इस विषय का सरल और रोचक अध्ययन।',
        durationEstimate: '4 मिनट',
        language: 'hindi',
        turns: [
          {
            speaker: 'Alex',
            text: `नमस्ते दोस्तों! आज हम ${docTitle} पर गहराई से चर्चा करेंगे। सैम, यह एक ऐसा अध्याय है जिसमें छात्र अक्सर उलझ जाते हैं।`,
            emotion: 'curious'
          },
          {
            speaker: 'Sam',
            text: `बिल्कुल सही कहा एलेक्स! लेकिन अगर हम इसके बुनियादी सिद्धांतों को समझ लें, तो यह पूरी तरह आसान और स्पष्ट हो जाता है।`,
            emotion: 'insightful'
          },
          {
            speaker: 'Alex',
            text: `तो शुरुआत कहाँ से करें? परीक्षा के लिए सबसे महत्वपूर्ण बात क्या है?`,
            emotion: 'enthusiastic'
          },
          {
            speaker: 'Sam',
            text: `सबसे पहले मुख्य परिभाषाओं और मान्यताओं को समझें। जब नींव मजबूत होती है, तो कठिन से कठिन सवाल भी आसानी से हल हो जाते हैं।`,
            emotion: 'explaining'
          },
          {
            speaker: 'Alex',
            text: `अक्सर छात्र परीक्षा में कहाँ अंक खो देते हैं? सामान्य गलतियाँ क्या होती हैं?`,
            emotion: 'curious'
          },
          {
            speaker: 'Sam',
            text: `इकाइयों और सीमाओं में! छात्र बिना यूनिट्स बदले सीधे फॉर्मूला लगा देते हैं, जिससे उत्तर गलत हो जाता है।`,
            emotion: 'warning'
          },
          {
            speaker: 'Alex',
            text: `शानदार सुझाव सैम! सही इकाइयाँ और लगातार दोहराव ही परीक्षा में सफलता दिलाता है।`,
            emotion: 'inspired'
          }
        ],
        source: 'fallback'
      };
    }

    if (language === 'hinglish') {
      return {
        docTitle,
        title: `${docTitle}: The Ultimate Hinglish Deep Dive`,
        tagline: 'एलेक्स और सैम के साथ कांसेप्ट का कम्पलीट पोस्टमार्टम!',
        durationEstimate: '4 min listen',
        language: 'hinglish',
        turns: [
          {
            speaker: 'Alex',
            text: `अरे सैम! आज हम deep dive करने वाले हैं ${docTitle} पर। यह टॉपिक competitive exams में बहुत ज्यादा पूछा जाता है न?`,
            emotion: 'curious'
          },
          {
            speaker: 'Sam',
            text: `बिल्कुल एलेक्स! और विद्यार्थी अक्सर इसमें silly mistakes कर देते हैं। लेकिन अगर basic fundamentals और concepts अच्छे से clear हों, तो स्कोरिंग बहुत आसान हो जाती है।`,
            emotion: 'insightful'
          },
          {
            speaker: 'Alex',
            text: `सही बोला सैम! तो सबसे पहले विद्यार्थियों को किस चीज़ पर focus करना चाहिए?`,
            emotion: 'enthusiastic'
          },
          {
            speaker: 'Sam',
            text: `सबसे पहले core definitions, formulas और assumptions को समझो। अगर foundation strong है, तो complex questions भी बिना किसी tension के solve हो जाते हैं।`,
            emotion: 'explaining'
          },
          {
            speaker: 'Alex',
            text: `और exam hall में common traps क्या होते हैं जहाँ negative marking लगती है?`,
            emotion: 'curious'
          },
          {
            speaker: 'Sam',
            text: `Units conversion और boundary conditions! जैसे विद्यार्थी Celsius को Kelvin में बदलना भूल जाते हैं और गलत option tick कर आते हैं।`,
            emotion: 'warning'
          },
          {
            speaker: 'Alex',
            text: `बिल्कुल सटीक point! Formula लगाने से पहले units check करो और active recall से बार-बार revise करो!`,
            emotion: 'inspired'
          }
        ],
        source: 'fallback'
      };
    }

    return {
      docTitle,
      title: `${docTitle}: The Deep Dive`,
      tagline: 'Two hosts unpack everything you need to master this topic.',
      durationEstimate: '4 min listen',
      language: 'english',
      turns: [
        {
          speaker: 'Alex',
          text: `Welcome in everyone! Today we're diving deep into ${docTitle}. Sam, this is one of those topics that trips students up all the time.`,
          emotion: 'curious'
        },
        {
          speaker: 'Sam',
          text: `It really is, Alex. But once you break it down into its fundamental mechanics, the whole picture becomes intuitive and crystal clear.`,
          emotion: 'insightful'
        },
        {
          speaker: 'Alex',
          text: `So where does someone even start? What's the big picture mental model we should have in mind?`,
          emotion: 'enthusiastic'
        },
        {
          speaker: 'Sam',
          text: `Think of it like building a pyramid. The base is the definitions and conservation principles. If the base is solid, the complex numericals solve themselves.`,
          emotion: 'explaining'
        },
        {
          speaker: 'Alex',
          text: `That makes so much sense! And what about common traps on the exam? Where do students lose marks?`,
          emotion: 'curious'
        },
        {
          speaker: 'Sam',
          text: `Almost always in boundary conditions and units! Students rush into the formula without checking if the assumptions hold true.`,
          emotion: 'warning'
        },
        {
          speaker: 'Alex',
          text: `Golden advice right there. Check your assumptions, master the core laws, and practice active recall!`,
          emotion: 'inspired'
        }
      ],
      source: 'fallback'
    };
  }
}

export const aiCoach = new AICoachService();
