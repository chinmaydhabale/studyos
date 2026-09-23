import { storage } from './storageService.js';
import { StudyTask, QuizQuestion, Flashcard } from '../types.js';

export interface ScheduleParseResult {
  message: string;
  task: StudyTask;
  suggestedSchedule: Array<{ time: string; activity: string; duration: string }>;
}

export class AICoachService {
  /**
   * Parses natural language prompts like:
   * "Tomorrow should include 30 minutes of Current Affairs."
   * Automatically extracts parameters and creates the task in storage & calendar.
   */
  public parseSchedulePrompt(prompt: string): ScheduleParseResult {
    const lower = prompt.toLowerCase();
    
    // Determine Target Date
    let targetOffset = 0;
    let targetDateName = 'today';
    if (lower.includes('tomorrow') || lower.includes('kal')) {
      targetOffset = 1;
      targetDateName = 'tomorrow';
    } else if (lower.includes('day after tomorrow') || lower.includes('parson')) {
      targetOffset = 2;
      targetDateName = 'day after tomorrow';
    }

    const d = new Date();
    d.setDate(d.getDate() + targetOffset);
    const targetDate = d.toISOString().split('T')[0];

    // Determine Duration
    let durationMinutes = 30; // default
    const durationMatch = prompt.match(/(\d+)\s*(min|minute|minutes|hr|hour|hours|ghanta|ghante)/i);
    if (durationMatch) {
      const value = parseInt(durationMatch[1], 10);
      const unit = durationMatch[2].toLowerCase();
      if (unit.startsWith('hr') || unit.startsWith('hour') || unit.startsWith('ghan')) {
        durationMinutes = value * 60;
      } else {
        durationMinutes = value;
      }
    }

    // Determine Subject / Topic
    let subject = 'Current Affairs';
    let title = prompt.trim();

    if (lower.includes('current affair') || lower.includes('samayiki') || lower.includes('news')) {
      subject = 'Current Affairs';
      title = `${durationMinutes}m Current Affairs & Editorial Analysis`;
    } else if (lower.includes('physic') || lower.includes('thermodynamic') || lower.includes('mechanic')) {
      subject = 'Physics';
      title = `${durationMinutes}m Physics & Problem Solving`;
    } else if (lower.includes('math') || lower.includes('calculus') || lower.includes('algebra')) {
      subject = 'Mathematics';
      title = `${durationMinutes}m Mathematics Deep Practice`;
    } else if (lower.includes('chem') || lower.includes('organic')) {
      subject = 'Chemistry';
      title = `${durationMinutes}m Chemistry Revision & Mechanisms`;
    } else if (lower.includes('code') || lower.includes('computer') || lower.includes('dsa')) {
      subject = 'Computer Science';
      title = `${durationMinutes}m Data Structures & Algorithms`;
    }

    // Determine default scheduled slot
    const scheduledTime = targetOffset === 1 ? '09:00 AM' : '04:00 PM';

    const newTask: StudyTask = {
      id: `task-${Date.now()}`,
      title,
      subject,
      durationMinutes,
      targetDate,
      completed: false,
      isAiGenerated: true,
      scheduledTime
    };

    storage.addTask(newTask);

    const message = `Got it! I have scheduled **${durationMinutes} minutes of ${subject}** for **${targetDateName} (${targetDate})** at **${scheduledTime}**. I've added it to your daily planner and study calendar. Maintaining your 7-day streak is on track! 🔥`;

    const suggestedSchedule = [
      { time: '07:30 AM - 08:30 AM', activity: 'Morning Mindset & Physics Review', duration: '60 min' },
      { time: `${scheduledTime} - ${this.addMinutesToTime(scheduledTime, durationMinutes)}`, activity: `${subject} (AI Coach Assigned)`, duration: `${durationMinutes} min` },
      { time: '11:00 AM - 01:00 PM', activity: 'Deep Focus: Problem Solving & Whiteboard Session', duration: '120 min' },
      { time: '03:30 PM - 05:00 PM', activity: 'Synchronized Lecture Watch Party with Aarav', duration: '90 min' },
      { time: '08:00 PM - 08:45 PM', activity: 'Spaced Repetition Flashcards & Daily Quiz', duration: '45 min' }
    ];

    return {
      message,
      task: newTask,
      suggestedSchedule
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

  /**
   * Explain doubt with step-by-step logic
   */
  public explainDoubt(question: string, context?: { videoTimestamp?: number; subject?: string; pdfPage?: number; pdfTitle?: string }): {
    explanation: string;
    steps: string[];
    keyFormula?: string;
    practiceTip: string;
  } {
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
    } else if (q.includes('current affair') || q.includes('imf') || q.includes('g20') || q.includes('economy')) {
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

  /**
   * Generate interactive Quizzes
   */
  public generateQuiz(topic: string): QuizQuestion[] {
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
        options: [
          'dS = dQ_rev / T',
          'dS = T · dQ_rev',
          'dS = dQ_rev + T',
          'dS = 0 always'
        ],
        correctAnswer: 0,
        explanation: 'Clausius inequality defines dS = dQ_rev / T for any reversible process.',
        subject: topic,
        topic
      }
    ];
  }

  /**
   * Generate Spaced Repetition Flashcards
   */
  public generateFlashcards(topic: string): Flashcard[] {
    return [
      {
        id: `fc-gen-${Date.now()}-1`,
        front: `What is the core definition of ${topic}?`,
        back: `The fundamental framework governing energy conservation, system boundaries, and transformation between heat and work.`,
        subject: topic,
        masteryLevel: 'learning'
      },
      {
        id: `fc-gen-${Date.now()}-2`,
        front: `State the primary governing formula for ${topic}.`,
        back: `ΔU = Q - W (First Law) and η = 1 - (Tc / Th) (Carnot efficiency).`,
        subject: topic,
        masteryLevel: 'reviewing'
      },
      {
        id: `fc-gen-${Date.now()}-3`,
        front: `Common exam pitfalls in ${topic}?`,
        back: `Forgetting to convert Celsius to Kelvin, confusing work done BY system (+W) vs work done ON system (-W).`,
        subject: topic,
        masteryLevel: 'mastered'
      }
    ];
  }

  /**
   * Generate Handwritten Notebook Notes Style
   */
  public generateHandwrittenNotes(topic: string): {
    title: string;
    date: string;
    studentName: string;
    sections: Array<{
      heading: string;
      notes: string[];
      highlight?: string;
      sketch?: string;
    }>;
  } {
    return {
      title: `${topic} — Master Study Sheet`,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      studentName: 'Chinmay',
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

  /**
   * Summarize YouTube Lecture or PDF
   */
  public summarizeLecture(videoUrl: string, lectureTitle?: string) {
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
