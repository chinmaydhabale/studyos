export type GameModeId =
  | 'blitz'
  | 'vedic'
  | 'target24'
  | 'detective'
  | 'compare'
  | 'tables'
  | 'duel';

export type OperationType = 'add' | 'subtract' | 'multiply' | 'divide' | 'mixed';

export type OperationCategory = 'single' | 'multi';

export type MultiOperationType = 'mixed' | 'chain_add_sub' | 'chain_mult_add' | 'chain_mult_sub' | 'chain_bodmas';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'extreme';

export type TimeMode = '60s' | '120s' | 'suddendeath';

export interface ArithmeticQuestion {
  id: string;
  num1?: number;
  num2?: number;
  operation?: '+' | '-' | '×' | '÷';
  expression: string;
  answer: number;
  isMultiOp?: boolean;
  difficulty?: DifficultyLevel;
  userAnswer?: number;
  isCorrect?: boolean;
  timeSpentMs?: number;
}

export interface VedicQuestion {
  id: string;
  category: 'square5' | 'multiply11' | 'base100' | 'multiply25_50' | 'fractionPercent';
  title: string;
  questionText: string;
  answer: number | string;
  trickExplanation: string;
  options?: string[];
  difficulty?: DifficultyLevel;
}

export interface Target24Question {
  id: string;
  numbers: number[];
  target: number;
  solutionHint: string;
  difficulty?: DifficultyLevel;
}

export interface DetectiveQuestion {
  id: string;
  type: 'missing_op' | 'missing_num' | 'multi_op';
  prompt: string;
  correctAnswer: string;
  options: string[];
  explanation: string;
  difficulty?: DifficultyLevel;
  isMultiOp?: boolean;
}

export interface CompareQuestion {
  id: string;
  leftExpr: string;
  rightExpr: string;
  leftValue: number;
  rightValue: number;
  correctAnswer: '<' | '=' | '>';
  difficulty?: DifficultyLevel;
  isMultiOp?: boolean;
}

export interface TableRecallQuestion {
  id: string;
  type: 'table' | 'square' | 'cube';
  prompt: string;
  answer: number;
  difficulty?: DifficultyLevel;
}

export interface GameSummary {
  mode: GameModeId;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  score: number;
  accuracy: number;
  highestStreak: number;
  avgTimePerQuestionMs: number;
  xpEarned: number;
  coinsEarned: number;
  questionsReview: Array<{
    prompt: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
}

export interface DuelInvite {
  duelId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  gameMode: 'blitz' | 'compare' | 'detective';
  difficulty?: DifficultyLevel;
  isMultiOp?: boolean;
  timeLimit: number;
}

export interface DuelPeerProgress {
  userId: string;
  name: string;
  score: number;
  streak: number;
  questionIndex: number;
  isFinished: boolean;
}

export interface MathUserStats {
  totalGamesPlayed: number;
  totalCalculations: number;
  highScoreBlitz: number;
  highStreak: number;
  accuracyPercent: number;
  vedicSolved: number;
  target24Solved: number;
  duelsWon: number;
}
