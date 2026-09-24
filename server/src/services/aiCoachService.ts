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
      temperature: 0.5
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
    // Basic helper for display e.g. "09:00 AM" + 30m -> "09:30 AM"
    const [time, modifier] = timeStr.split(' ');
    const [h, m] = time.split(':').map(Number);
    let totalM = (h % 12) * 60 + m + minutes;
    if (modifier === 'PM' && h !== 12) totalM += 12 * 60;
    const newH24 = Math.floor(totalM / 60) % 24;
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
      temperature: 0.6
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
      maxOutputTokens: 3072
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

  public async generateFlashcards(topic: string, count = 6): Promise<Flashcard[]> {
    const wanted = this.clampInt(count, 1, 15, 6);

    const result = await gemini.generateJson<{
      cards?: Array<{ front?: string; back?: string; masteryLevel?: string }>;
    }>({
      systemInstruction: `${EXAM_COACH_PERSONA}\nWrite spaced-repetition flashcards. Respond with JSON only.`,
      prompt:
        `Topic: "${topic}"\n\n` +
        `Create exactly ${wanted} flashcards. "front" is a single focused question or prompt, ` +
        '"back" is a compact answer (max 2 sentences) that is easy to self-check. ' +
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
      temperature: 0.8,
      maxOutputTokens: 3072
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
}

export const aiCoach = new AICoachService();
