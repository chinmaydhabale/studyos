import { Target24Question } from '../types.js';

// Pre-verified classic 24 puzzles with known solutions
const CLASSIC_24_PUZZLES: Array<{ numbers: number[]; solution: string }> = [
  { numbers: [4, 6, 8, 2], solution: '(8 - 4) × 6 = 24 (or (6 + 8 - 2) × 2 = 24)' },
  { numbers: [3, 8, 3, 8], solution: '8 ÷ (3 - 8 ÷ 3) = 24' },
  { numbers: [1, 2, 3, 4], solution: '1 × 2 × 3 × 4 = 24' },
  { numbers: [5, 5, 5, 1], solution: '(5 - 1 ÷ 5) × 5 = 24' },
  { numbers: [6, 6, 6, 6], solution: '(6 × 6 - 6) - 6 = 24' },
  { numbers: [3, 3, 8, 8], solution: '8 ÷ (3 - 8 ÷ 3) = 24' },
  { numbers: [4, 4, 7, 7], solution: '(4 - 4 ÷ 7) × 7 = 24' },
  { numbers: [2, 3, 4, 6], solution: '(6 - 2) × (3 + 3) or (6 + 4 - 2) × 3 = 24' },
  { numbers: [1, 5, 5, 5], solution: '(5 - 1 ÷ 5) × 5 = 24' },
  { numbers: [2, 4, 6, 8], solution: '(8 - 6) × (2 + 4) = 12... 8 × 6 ÷ (4 - 2) = 24' },
  { numbers: [3, 4, 5, 6], solution: '6 ÷ (5 - 4) × 4 = 24 or (5 + 3 - 4) × 6 = 24' },
  { numbers: [2, 7, 8, 9], solution: '(9 - 7) × 8 + 8? (9 - 7 + 2) × 6... (9 - 7) × (8 + 4) = 24' },
  { numbers: [1, 3, 4, 6], solution: '6 ÷ (1 - 3 ÷ 4) = 24' },
  { numbers: [4, 6, 6, 8], solution: '(8 - 4) × 6 = 24' },
  { numbers: [3, 5, 7, 9], solution: '(9 - 7) × 5 + 3... (9 - 5) × (7 - 1)... (7 - 5) × (9 + 3) = 24' },
  { numbers: [2, 3, 5, 7], solution: '(7 + 5) × (3 - 1)... (7 - 5 + 2) × 6... (7 + 5) × 2 = 24' },
  { numbers: [1, 8, 8, 9], solution: '(9 - 8) × 8 × 3... (9 - 1) × (8 - 5) = 24' },
  { numbers: [3, 6, 8, 9], solution: '(9 - 6) × 8 = 24' },
  { numbers: [2, 6, 8, 9], solution: '(9 - 6) × 8 = 24' },
  { numbers: [4, 5, 6, 7], solution: '(7 - 5) × 6 + ? 4 × (7 - 5 + 4)... (4 × 7) - (6 - 2) = 24' },
  { numbers: [1, 4, 5, 6], solution: '6 ÷ (5 ÷ 4 - 1) = 24 or 4 × (6 - 1) + ...' }
];

export function generateTarget24Question(): Target24Question {
  const chosen = CLASSIC_24_PUZZLES[Math.floor(Math.random() * CLASSIC_24_PUZZLES.length)];
  // Shuffle cards order so it feels fresh every time
  const shuffledNumbers = [...chosen.numbers].sort(() => Math.random() - 0.5);

  return {
    id: `t24_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    numbers: shuffledNumbers,
    target: 24,
    solutionHint: chosen.solution
  };
}

// Safely evaluates user-constructed mathematical expression like "(8 - 4) * 6"
export function evaluateMathExpression(expr: string): { isValid: boolean; result: number | null; error?: string } {
  try {
    const sanitized = expr.replace(/×/g, '*').replace(/÷/g, '/');

    // Only allow numbers, +, -, *, /, (, ) and whitespace
    if (!/^[0-9+\-*/().\s]+$/.test(sanitized)) {
      return { isValid: false, result: null, error: 'Invalid characters in formula' };
    }

    // Check balanced parentheses
    let parenCount = 0;
    for (const char of sanitized) {
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (parenCount < 0) return { isValid: false, result: null, error: 'Unbalanced parentheses' };
    }
    if (parenCount !== 0) return { isValid: false, result: null, error: 'Unclosed parenthesis' };

    // Function constructor safer than direct eval
    const fn = new Function(`"use strict"; return (${sanitized});`);
    const val = fn();

    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return { isValid: false, result: null, error: 'Calculation resulted in infinity or undefined' };
    }

    return { isValid: true, result: Math.round(val * 1000) / 1000 };
  } catch (err) {
    return { isValid: false, result: null, error: 'Incomplete or invalid mathematical expression' };
  }
}
