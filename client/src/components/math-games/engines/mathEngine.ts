import {
  ArithmeticQuestion,
  VedicQuestion,
  DetectiveQuestion,
  CompareQuestion,
  TableRecallQuestion,
  OperationType,
  DifficultyLevel
} from '../types.js';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateArithmeticQuestion(
  op: OperationType,
  diff: DifficultyLevel
): ArithmeticQuestion {
  let chosenOp: '+' | '-' | '×' | '÷';
  if (op === 'mixed') {
    const ops: Array<'+' | '-' | '×' | '÷'> = ['+', '-', '×', '÷'];
    chosenOp = ops[Math.floor(Math.random() * ops.length)];
  } else {
    chosenOp = op === 'add' ? '+' : op === 'subtract' ? '-' : op === 'multiply' ? '×' : '÷';
  }

  let num1 = 0;
  let num2 = 0;
  let answer = 0;

  if (chosenOp === '+') {
    if (diff === 'easy') {
      num1 = randomInt(5, 30);
      num2 = randomInt(5, 30);
    } else if (diff === 'medium') {
      num1 = randomInt(20, 99);
      num2 = randomInt(15, 99);
    } else {
      num1 = randomInt(110, 899);
      num2 = randomInt(95, 699);
    }
    answer = num1 + num2;
  } else if (chosenOp === '-') {
    if (diff === 'easy') {
      num2 = randomInt(3, 25);
      num1 = num2 + randomInt(5, 30);
    } else if (diff === 'medium') {
      num2 = randomInt(15, 80);
      num1 = num2 + randomInt(15, 99);
    } else {
      num2 = randomInt(120, 600);
      num1 = num2 + randomInt(100, 850);
    }
    answer = num1 - num2;
  } else if (chosenOp === '×') {
    if (diff === 'easy') {
      num1 = randomInt(2, 10);
      num2 = randomInt(2, 10);
    } else if (diff === 'medium') {
      num1 = randomInt(11, 25);
      num2 = randomInt(3, 9);
    } else {
      num1 = randomInt(12, 35);
      num2 = randomInt(11, 29);
    }
    answer = num1 * num2;
  } else {
    // Division: guarantees whole integer answers
    if (diff === 'easy') {
      num2 = randomInt(2, 9);
      answer = randomInt(2, 10);
      num1 = num2 * answer;
    } else if (diff === 'medium') {
      num2 = randomInt(4, 15);
      answer = randomInt(8, 25);
      num1 = num2 * answer;
    } else {
      num2 = randomInt(12, 30);
      answer = randomInt(15, 60);
      num1 = num2 * answer;
    }
  }

  return {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    num1,
    num2,
    operation: chosenOp,
    answer
  };
}

export function generateVedicQuestion(): VedicQuestion {
  const categories: Array<'square5' | 'multiply11' | 'base100' | 'multiply25_50' | 'fractionPercent'> = [
    'square5',
    'multiply11',
    'base100',
    'multiply25_50',
    'fractionPercent'
  ];
  const cat = categories[Math.floor(Math.random() * categories.length)];

  if (cat === 'square5') {
    const tens = randomInt(2, 12);
    const num = tens * 10 + 5;
    const ans = num * num;
    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'square5',
      title: 'Squares of Numbers Ending in 5',
      questionText: `${num}² = ?`,
      answer: ans,
      trickExplanation: `Multiply tens digit ${tens} by next number (${tens + 1}) = ${tens * (tens + 1)}, then append 25. Answer = ${ans}.`
    };
  }

  if (cat === 'multiply11') {
    const num = randomInt(12, 89);
    const ans = num * 11;
    const d1 = Math.floor(num / 10);
    const d2 = num % 10;
    const mid = d1 + d2;
    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'multiply11',
      title: 'Multiply by 11 Shortcut',
      questionText: `${num} × 11 = ?`,
      answer: ans,
      trickExplanation: `Split digits ${d1} and ${d2}, insert their sum (${d1} + ${d2} = ${mid}) in between (carrying over if sum ≥ 10). Answer = ${ans}.`
    };
  }

  if (cat === 'base100') {
    const isBelow = Math.random() > 0.4;
    if (isBelow) {
      const dev1 = randomInt(1, 9);
      const dev2 = randomInt(1, 9);
      const n1 = 100 - dev1;
      const n2 = 100 - dev2;
      const ans = n1 * n2;
      return {
        id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'base100',
        title: 'Base 100 Multiplication',
        questionText: `${n1} × ${n2} = ?`,
        answer: ans,
        trickExplanation: `Deviations from 100 are -${dev1} and -${dev2}. Left part: ${n1} - ${dev2} = ${n1 - dev2}. Right part: (-${dev1}) × (-${dev2}) = ${String(dev1 * dev2).padStart(2, '0')}. Combine to get ${ans}.`
      };
    } else {
      const dev1 = randomInt(2, 8);
      const dev2 = randomInt(2, 8);
      const n1 = 100 + dev1;
      const n2 = 100 + dev2;
      const ans = n1 * n2;
      return {
        id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'base100',
        title: 'Base 100 Multiplication (Above 100)',
        questionText: `${n1} × ${n2} = ?`,
        answer: ans,
        trickExplanation: `Left part: ${n1} + ${dev2} = ${n1 + dev2}. Right part: ${dev1} × ${dev2} = ${String(dev1 * dev2).padStart(2, '0')}. Combine to get ${ans}.`
      };
    }
  }

  if (cat === 'multiply25_50') {
    const is25 = Math.random() > 0.5;
    if (is25) {
      const base = randomInt(4, 28) * 4; // Multiple of 4
      const ans = base * 25;
      return {
        id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'multiply25_50',
        title: 'Multiply by 25 Shortcut',
        questionText: `${base} × 25 = ?`,
        answer: ans,
        trickExplanation: `25 is 100 / 4! Divide ${base} by 4 = ${base / 4}, then append two zeroes = ${ans}.`
      };
    } else {
      const base = randomInt(6, 45) * 2;
      const ans = base * 50;
      return {
        id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'multiply25_50',
        title: 'Multiply by 50 Shortcut',
        questionText: `${base} × 50 = ?`,
        answer: ans,
        trickExplanation: `50 is 100 / 2! Halve ${base} = ${base / 2}, then append two zeroes = ${ans}.`
      };
    }
  }

  // Fraction to Percentage
  const fractions = [
    { frac: '1/2', pct: '50%' },
    { frac: '1/3', pct: '33.33%' },
    { frac: '1/4', pct: '25%' },
    { frac: '1/5', pct: '20%' },
    { frac: '1/6', pct: '16.66%' },
    { frac: '1/7', pct: '14.28%' },
    { frac: '1/8', pct: '12.5%' },
    { frac: '1/9', pct: '11.11%' },
    { frac: '1/12', pct: '8.33%' },
    { frac: '3/8', pct: '37.5%' },
    { frac: '5/8', pct: '62.5%' },
    { frac: '2/3', pct: '66.66%' }
  ];
  const item = fractions[Math.floor(Math.random() * fractions.length)];
  const options = [item.pct];
  while (options.length < 4) {
    const rnd = fractions[Math.floor(Math.random() * fractions.length)].pct;
    if (!options.includes(rnd)) options.push(rnd);
  }
  options.sort(() => Math.random() - 0.5);

  return {
    id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    category: 'fractionPercent',
    title: 'Fraction to Percentage Shortcut',
    questionText: `Convert fraction ${item.frac} to Percentage:`,
    answer: item.pct,
    options,
    trickExplanation: `Fraction ${item.frac} equals exactly ${item.pct}. Memorize standard fraction tables to speed up Data Interpretation.`
  };
}

export function generateDetectiveQuestion(): DetectiveQuestion {
  const isMissingOp = Math.random() > 0.4;

  if (isMissingOp) {
    const ops: Array<{ symbol: string; compute: (a: number, b: number) => number }> = [
      { symbol: '+', compute: (a, b) => a + b },
      { symbol: '-', compute: (a, b) => a - b },
      { symbol: '×', compute: (a, b) => a * b },
      { symbol: '÷', compute: (a, b) => a / b }
    ];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a = 0;
    let b = 0;
    if (op.symbol === '+') {
      a = randomInt(12, 50);
      b = randomInt(8, 45);
    } else if (op.symbol === '-') {
      b = randomInt(9, 40);
      a = b + randomInt(10, 45);
    } else if (op.symbol === '×') {
      a = randomInt(4, 15);
      b = randomInt(3, 12);
    } else {
      b = randomInt(3, 12);
      a = b * randomInt(3, 12);
    }
    const c = op.compute(a, b);

    return {
      id: `det_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'missing_op',
      prompt: `${a}  [ ? ]  ${b}  =  ${c}`,
      correctAnswer: op.symbol,
      options: ['+', '-', '×', '÷'],
      explanation: `${a} ${op.symbol} ${b} = ${c}`
    };
  } else {
    // Missing number: e.g. a × [ ? ] + c = d
    const mult = randomInt(3, 12);
    const missing = randomInt(2, 10);
    const add = randomInt(2, 20);
    const result = mult * missing + add;

    const correct = String(missing);
    const options = [correct];
    while (options.length < 4) {
      const fake = String(randomInt(Math.max(1, missing - 4), missing + 5));
      if (!options.includes(fake)) options.push(fake);
    }
    options.sort(() => Math.random() - 0.5);

    return {
      id: `det_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'missing_num',
      prompt: `${mult} × [ ? ] + ${add} = ${result}`,
      correctAnswer: correct,
      options,
      explanation: `${mult} × ${missing} = ${mult * missing}, + ${add} = ${result}. Missing number is ${missing}.`
    };
  }
}

export function generateCompareQuestion(diff: DifficultyLevel): CompareQuestion {
  let leftExpr = '';
  let rightExpr = '';
  let leftValue = 0;
  let rightValue = 0;

  const type = randomInt(1, 3);
  if (type === 1) {
    // Multiplication comparison
    const a = randomInt(diff === 'easy' ? 4 : 11, diff === 'easy' ? 12 : 25);
    const b = randomInt(3, diff === 'easy' ? 9 : 15);
    const c = randomInt(diff === 'easy' ? 4 : 11, diff === 'easy' ? 12 : 25);
    const d = randomInt(3, diff === 'easy' ? 9 : 15);
    leftExpr = `${a} × ${b}`;
    leftValue = a * b;
    rightExpr = `${c} × ${d}`;
    rightValue = c * d;
  } else if (type === 2) {
    // Squares vs Multiplications
    const s = randomInt(7, diff === 'easy' ? 15 : 25);
    leftExpr = `${s}²`;
    leftValue = s * s;
    const a = randomInt(s - 3, s + 3);
    const b = randomInt(s - 3, s + 3);
    rightExpr = `${a} × ${b}`;
    rightValue = a * b;
  } else {
    // Addition + subtraction combo
    const a = randomInt(20, 80);
    const b = randomInt(15, 60);
    const c = randomInt(20, 80);
    const d = randomInt(15, 60);
    leftExpr = `${a} + ${b}`;
    leftValue = a + b;
    rightExpr = `${c + d + randomInt(-4, 4)} - ${randomInt(0, 5)}`;
    // compute right
    const parts = rightExpr.split(' - ').map(Number);
    rightValue = parts[0] - parts[1];
  }

  let correctAnswer: '<' | '=' | '>';
  if (leftValue < rightValue) correctAnswer = '<';
  else if (leftValue > rightValue) correctAnswer = '>';
  else correctAnswer = '=';

  return {
    id: `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    leftExpr,
    rightExpr,
    leftValue,
    rightValue,
    correctAnswer
  };
}

export function generateTableRecallQuestion(): TableRecallQuestion {
  const typeRoll = Math.random();

  if (typeRoll < 0.45) {
    // Tables up to 30
    const t = randomInt(11, 29);
    const mult = randomInt(3, 9);
    return {
      id: `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'table',
      prompt: `${t} × ${mult} = ?`,
      answer: t * mult
    };
  } else if (typeRoll < 0.75) {
    // Squares up to 40
    const sq = randomInt(11, 35);
    return {
      id: `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'square',
      prompt: `${sq}² = ?`,
      answer: sq * sq
    };
  } else {
    // Cubes up to 20
    const cb = randomInt(4, 18);
    return {
      id: `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'cube',
      prompt: `${cb}³ = ?`,
      answer: cb * cb * cb
    };
  }
}
