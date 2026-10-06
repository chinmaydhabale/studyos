import {
  ArithmeticQuestion,
  VedicQuestion,
  VedicCategory,
  DetectiveQuestion,
  CompareQuestion,
  TableRecallQuestion,
  OperationType,
  MultiOperationType,
  DifficultyLevel
} from '../types.js';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// 1. SPEED ARITHMETIC BLITZ ENGINE (Single Operation & Multi-Operation BODMAS)
// ---------------------------------------------------------------------------

export function generateArithmeticQuestion(
  op: OperationType,
  diff: DifficultyLevel = 'medium',
  isMultiOp: boolean = false,
  multiType: MultiOperationType = 'mixed'
): ArithmeticQuestion {
  // If Multi-Operation is requested:
  if (isMultiOp) {
    return generateMultiOpArithmetic(diff, multiType);
  }

  // Single Operation mode:
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
    } else if (diff === 'hard') {
      num1 = randomInt(110, 899);
      num2 = randomInt(95, 699);
    } else {
      // Extreme: 4-digit additions
      num1 = randomInt(1100, 8999);
      num2 = randomInt(950, 7899);
    }
    answer = num1 + num2;
  } else if (chosenOp === '-') {
    if (diff === 'easy') {
      num2 = randomInt(3, 25);
      num1 = num2 + randomInt(5, 30);
    } else if (diff === 'medium') {
      num2 = randomInt(15, 80);
      num1 = num2 + randomInt(15, 99);
    } else if (diff === 'hard') {
      num2 = randomInt(120, 600);
      num1 = num2 + randomInt(100, 850);
    } else {
      // Extreme: 4-digit subtractions
      num2 = randomInt(1200, 7500);
      num1 = num2 + randomInt(1100, 8900);
    }
    answer = num1 - num2;
  } else if (chosenOp === '×') {
    if (diff === 'easy') {
      num1 = randomInt(2, 10);
      num2 = randomInt(2, 10);
    } else if (diff === 'medium') {
      num1 = randomInt(11, 25);
      num2 = randomInt(3, 9);
    } else if (diff === 'hard') {
      num1 = randomInt(12, 35);
      num2 = randomInt(11, 29);
    } else {
      // Extreme: 2-digit × 2-digit high multiplications
      num1 = randomInt(25, 99);
      num2 = randomInt(14, 89);
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
    } else if (diff === 'hard') {
      num2 = randomInt(12, 30);
      answer = randomInt(15, 60);
      num1 = num2 * answer;
    } else {
      // Extreme: large 2-3 digit integer divisions
      num2 = randomInt(15, 65);
      answer = randomInt(35, 150);
      num1 = num2 * answer;
    }
  }

  return {
    id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    num1,
    num2,
    operation: chosenOp,
    expression: `${num1} ${chosenOp} ${num2}`,
    answer,
    isMultiOp: false,
    difficulty: diff
  };
}

function generateMultiOpArithmetic(
  diff: DifficultyLevel,
  multiType: MultiOperationType
): ArithmeticQuestion {
  let expression = '';
  let answer = 0;

  if (diff === 'easy') {
    // 2-operation beginner chain
    const pattern = randomInt(1, 4);
    if (pattern === 1 || multiType === 'chain_add_sub') {
      // a + b - c
      const a = randomInt(10, 35);
      const b = randomInt(10, 35);
      const c = randomInt(5, 20);
      expression = `${a} + ${b} - ${c}`;
      answer = a + b - c;
    } else if (pattern === 2 || multiType === 'chain_mult_add') {
      // a × b + c
      const a = randomInt(3, 9);
      const b = randomInt(3, 8);
      const c = randomInt(5, 25);
      expression = `${a} × ${b} + ${c}`;
      answer = a * b + c;
    } else if (pattern === 3 || multiType === 'chain_mult_sub') {
      // a × b - c
      const a = randomInt(4, 9);
      const b = randomInt(4, 9);
      const c = randomInt(2, Math.max(3, a * b - 5));
      expression = `${a} × ${b} - ${c}`;
      answer = a * b - c;
    } else {
      // (a + b) ÷ c
      const c = randomInt(2, 6);
      const target = randomInt(3, 10);
      const sum = c * target;
      const a = randomInt(2, sum - 2);
      const b = sum - a;
      expression = `(${a} + ${b}) ÷ ${c}`;
      answer = target;
    }
  } else if (diff === 'medium') {
    // 2 to 3 operations, tests BODMAS precedence
    const pattern = randomInt(1, 5);
    if (pattern === 1 || multiType === 'chain_mult_add') {
      // a + b × c (multiplication must be done first!)
      const b = randomInt(4, 12);
      const c = randomInt(4, 9);
      const a = randomInt(15, 60);
      expression = `${a} + ${b} × ${c}`;
      answer = a + b * c;
    } else if (pattern === 2 || multiType === 'chain_mult_sub') {
      // a × b - c
      const a = randomInt(8, 20);
      const b = randomInt(4, 12);
      const c = randomInt(15, 70);
      expression = `${a} × ${b} - ${c}`;
      answer = a * b - c;
    } else if (pattern === 3) {
      // (a - b) × c + d
      const c = randomInt(3, 8);
      const diffVal = randomInt(6, 18);
      const b = randomInt(10, 30);
      const a = b + diffVal;
      const d = randomInt(10, 45);
      expression = `(${a} - ${b}) × ${c} + ${d}`;
      answer = diffVal * c + d;
    } else if (pattern === 4) {
      // a ÷ b × c + d
      const b = randomInt(3, 9);
      const k = randomInt(4, 12);
      const a = b * k;
      const c = randomInt(3, 8);
      const d = randomInt(12, 50);
      expression = `${a} ÷ ${b} × ${c} + ${d}`;
      answer = k * c + d;
    } else {
      // a × b + c × d
      const a = randomInt(5, 12);
      const b = randomInt(3, 9);
      const c = randomInt(4, 11);
      const d = randomInt(2, 8);
      expression = `${a} × ${b} + ${c} × ${d}`;
      answer = a * b + c * d;
    }
  } else if (diff === 'hard') {
    // 3 operations with 2-digit and 3-digit terms & squares
    const pattern = randomInt(1, 5);
    if (pattern === 1) {
      // a × b - c × d
      const a = randomInt(14, 25);
      const b = randomInt(6, 12);
      const c = randomInt(5, 15);
      const d = randomInt(3, 8);
      expression = `${a} × ${b} - ${c} × ${d}`;
      answer = a * b - c * d;
    } else if (pattern === 2) {
      // a + b × c - d
      const a = randomInt(60, 220);
      const b = randomInt(12, 25);
      const c = randomInt(6, 15);
      const d = randomInt(25, 110);
      expression = `${a} + ${b} × ${c} - ${d}`;
      answer = a + b * c - d;
    } else if (pattern === 3) {
      // (a + b) × c - d
      const a = randomInt(25, 65);
      const b = randomInt(15, 55);
      const c = randomInt(5, 12);
      const d = randomInt(40, 180);
      expression = `(${a} + ${b}) × ${c} - ${d}`;
      answer = (a + b) * c - d;
    } else if (pattern === 4) {
      // a² + b × c
      const a = randomInt(11, 24);
      const b = randomInt(8, 20);
      const c = randomInt(4, 12);
      expression = `${a}² + ${b} × ${c}`;
      answer = a * a + b * c;
    } else {
      // a × (b + c) ÷ d
      const d = randomInt(4, 9);
      const k = randomInt(6, 16);
      const sum = d * k;
      const b = randomInt(8, sum - 8);
      const c = sum - b;
      const a = randomInt(5, 16);
      expression = `${a} × (${b} + ${c}) ÷ ${d}`;
      answer = a * k;
    }
  } else {
    // Extreme: Full Olympiad / High-speed Quantitative Aptitude BODMAS
    const pattern = randomInt(1, 5);
    if (pattern === 1) {
      // a × b + c² - d
      const a = randomInt(20, 48);
      const b = randomInt(7, 18);
      const c = randomInt(14, 28);
      const d = randomInt(60, 240);
      expression = `${a} × ${b} + ${c}² - ${d}`;
      answer = a * b + c * c - d;
    } else if (pattern === 2) {
      // (a + b) × (c - d) + e
      const a = randomInt(35, 85);
      const b = randomInt(25, 75);
      const diffVal = randomInt(4, 15);
      const d = randomInt(12, 35);
      const c = d + diffVal;
      const e = randomInt(45, 180);
      expression = `(${a} + ${b}) × (${c} - ${d}) + ${e}`;
      answer = (a + b) * diffVal + e;
    } else if (pattern === 3) {
      // a³ - b × c + d
      const a = randomInt(6, 12);
      const b = randomInt(18, 42);
      const c = randomInt(6, 18);
      const d = randomInt(35, 180);
      expression = `${a}³ - ${b} × ${c} + ${d}`;
      answer = a * a * a - b * c + d;
    } else if (pattern === 4) {
      // a × b ÷ c + d × e
      const c = randomInt(4, 9);
      const k = randomInt(6, 18);
      const a = c * k;
      const b = randomInt(8, 24);
      const d = randomInt(14, 38);
      const e = randomInt(7, 19);
      expression = `${a} × ${b} ÷ ${c} + ${d} × ${e}`;
      answer = (a * b) / c + d * e;
    } else {
      // a² - b² + c × d
      const a = randomInt(22, 45);
      const b = randomInt(12, a - 2);
      const c = randomInt(15, 35);
      const d = randomInt(5, 16);
      expression = `${a}² - ${b}² + ${c} × ${d}`;
      answer = a * a - b * b + c * d;
    }
  }

  return {
    id: `q_multi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    expression,
    answer,
    isMultiOp: true,
    difficulty: diff
  };
}

// ---------------------------------------------------------------------------
// 2. VEDIC & MENTAL MATH HACKS ENGINE (4 Tiers)
// ---------------------------------------------------------------------------

export function generateVedicQuestion(
  diff: DifficultyLevel = 'medium',
  category?: string
): VedicQuestion {
  const allCategories: VedicCategory[] = [
    'square5',
    'multiply11',
    'base100',
    'multiply25_50',
    'fractionPercent',
    'crossMultiply',
    'sumTenSameTens',
    'squareNear50',
    'base50',
    'seriesOf9',
    'cubeRoot',
    'squareRoot',
    'divisionHacks'
  ];
  const cat = (category && allCategories.includes(category as any))
    ? (category as VedicCategory)
    : allCategories[Math.floor(Math.random() * allCategories.length)];

  // 1. Squares of Numbers Ending in 5
  if (cat === 'square5') {
    let tens = 2;
    if (diff === 'easy') tens = randomInt(2, 4);        // 25, 35, 45
    else if (diff === 'medium') tens = randomInt(5, 9);   // 55 to 95
    else if (diff === 'hard') tens = randomInt(10, 15);   // 105 to 155
    else tens = randomInt(16, 25);                        // 165 to 255 (Extreme)

    const num = tens * 10 + 5;
    const ans = num * num;
    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'square5',
      title: 'Squares of Numbers Ending in 5',
      questionText: `${num}² = ?`,
      answer: ans,
      trickExplanation: `Multiply tens digit ${tens} by next number (${tens + 1}) = ${tens * (tens + 1)}, then append 25. Answer = ${ans}.`,
      difficulty: diff
    };
  }

  // 2. Multiply by 11
  if (cat === 'multiply11') {
    let num = 23;
    if (diff === 'easy') {
      const d1 = randomInt(2, 6);
      const d2 = randomInt(1, 9 - d1);
      num = d1 * 10 + d2;
    } else if (diff === 'medium') {
      num = randomInt(56, 98);
    } else if (diff === 'hard') {
      num = randomInt(125, 485);
    } else {
      num = randomInt(1124, 6875);
    }

    const ans = num * 11;
    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'multiply11',
      title: 'Multiply by 11 Shortcut',
      questionText: `${num} × 11 = ?`,
      answer: ans,
      trickExplanation: `For ${num} × 11: Add adjacent digits from right to left with carry. ${num} × 11 = ${ans}.`,
      difficulty: diff
    };
  }

  // 3. Base 100 Multiplication
  if (cat === 'base100') {
    let maxDev = 5;
    if (diff === 'easy') maxDev = 4;
    else if (diff === 'medium') maxDev = 8;
    else if (diff === 'hard') maxDev = 15;
    else maxDev = 25; // Extreme

    const isBelow = Math.random() > 0.4;
    if (isBelow) {
      const dev1 = randomInt(2, maxDev);
      const dev2 = randomInt(2, maxDev);
      const n1 = 100 - dev1;
      const n2 = 100 - dev2;
      const ans = n1 * n2;
      return {
        id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'base100',
        title: 'Base 100 Multiplication (Below 100)',
        questionText: `${n1} × ${n2} = ?`,
        answer: ans,
        trickExplanation: `Deviations from 100 are -${dev1} and -${dev2}. Left part: ${n1} - ${dev2} = ${n1 - dev2}. Right part: (-${dev1}) × (-${dev2}) = ${String(dev1 * dev2).padStart(2, '0')}. Combine to get ${ans}.`,
        difficulty: diff
      };
    } else {
      const dev1 = randomInt(2, maxDev);
      const dev2 = randomInt(2, maxDev);
      const n1 = 100 + dev1;
      const n2 = 100 + dev2;
      const ans = n1 * n2;
      return {
        id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'base100',
        title: 'Base 100 Multiplication (Above 100)',
        questionText: `${n1} × ${n2} = ?`,
        answer: ans,
        trickExplanation: `Deviations are +${dev1} and +${dev2}. Left part: ${n1} + ${dev2} = ${n1 + dev2}. Right part: ${dev1} × ${dev2} = ${String(dev1 * dev2).padStart(2, '0')}. Combine to get ${ans}.`,
        difficulty: diff
      };
    }
  }

  // 4. Multiply by 25 & 50
  if (cat === 'multiply25_50') {
    const is25 = Math.random() > 0.5;
    let factor = 12;
    if (diff === 'easy') factor = randomInt(3, 10);
    else if (diff === 'medium') factor = randomInt(11, 25);
    else if (diff === 'hard') factor = randomInt(26, 60);
    else factor = randomInt(65, 140); // Extreme

    if (is25) {
      const base = factor * 4;
      const ans = base * 25;
      return {
        id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'multiply25_50',
        title: 'Multiply by 25 Shortcut',
        questionText: `${base} × 25 = ?`,
        answer: ans,
        trickExplanation: `25 is 100 ÷ 4! Divide ${base} by 4 = ${base / 4}, then append two zeroes = ${ans}.`,
        difficulty: diff
      };
    } else {
      const base = factor * 2;
      const ans = base * 50;
      return {
        id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        category: 'multiply25_50',
        title: 'Multiply by 50 Shortcut',
        questionText: `${base} × 50 = ?`,
        answer: ans,
        trickExplanation: `50 is 100 ÷ 2! Halve ${base} = ${base / 2}, then append two zeroes = ${ans}.`,
        difficulty: diff
      };
    }
  }

  // 5. Fraction to Percentage
  if (cat === 'fractionPercent') {
    const easyFractions = [
      { frac: '1/2', pct: '50%' },
      { frac: '1/4', pct: '25%' },
      { frac: '1/5', pct: '20%' },
      { frac: '1/10', pct: '10%' }
    ];
    const medFractions = [
      { frac: '1/3', pct: '33.33%' },
      { frac: '1/6', pct: '16.66%' },
      { frac: '1/7', pct: '14.28%' },
      { frac: '1/8', pct: '12.5%' },
      { frac: '3/8', pct: '37.5%' },
      { frac: '5/8', pct: '62.5%' },
      { frac: '2/3', pct: '66.66%' }
    ];
    const hardFractions = [
      { frac: '1/9', pct: '11.11%' },
      { frac: '1/11', pct: '9.09%' },
      { frac: '1/12', pct: '8.33%' },
      { frac: '2/7', pct: '28.57%' },
      { frac: '3/7', pct: '42.85%' },
      { frac: '5/6', pct: '83.33%' },
      { frac: '7/8', pct: '87.5%' }
    ];
    const extremeFractions = [
      { frac: '1/13', pct: '7.69%' },
      { frac: '1/14', pct: '7.14%' },
      { frac: '1/15', pct: '6.66%' },
      { frac: '1/16', pct: '6.25%' },
      { frac: '7/16', pct: '43.75%' },
      { frac: '9/16', pct: '56.25%' },
      { frac: '11/14', pct: '78.57%' }
    ];

    let fracPool = medFractions;
    if (diff === 'easy') fracPool = easyFractions;
    else if (diff === 'hard') fracPool = hardFractions;
    else if (diff === 'extreme') fracPool = extremeFractions;

    const item = fracPool[Math.floor(Math.random() * fracPool.length)];
    const options = [item.pct];
    const allPcts = [...easyFractions, ...medFractions, ...hardFractions, ...extremeFractions].map(f => f.pct);
    while (options.length < 4) {
      const rnd = allPcts[Math.floor(Math.random() * allPcts.length)];
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
      trickExplanation: `Fraction ${item.frac} equals exactly ${item.pct}. Memorize standard fraction tables to supercharge your DI speed.`,
      difficulty: diff
    };
  }

  // 6. Urdhva Tiryagbhyam (Cross-Multiplication)
  if (cat === 'crossMultiply') {
    let n1 = 23;
    let n2 = 14;

    if (diff === 'easy') {
      // Small digits, no carries
      const t1 = randomInt(1, 2);
      const u1 = randomInt(1, 3);
      const t2 = randomInt(1, 3);
      const u2 = randomInt(1, 3);
      n1 = t1 * 10 + u1;
      n2 = t2 * 10 + u2;
    } else if (diff === 'medium') {
      n1 = randomInt(24, 58);
      n2 = randomInt(13, 42);
    } else if (diff === 'hard') {
      n1 = randomInt(52, 98);
      n2 = randomInt(34, 86);
    } else {
      // Extreme: 3-digit x 2-digit
      n1 = randomInt(112, 245);
      n2 = randomInt(23, 45);
    }

    const ans = n1 * n2;
    const u1 = n1 % 10;
    const t1 = Math.floor(n1 / 10);
    const u2 = n2 % 10;
    const t2 = Math.floor(n2 / 10);

    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'crossMultiply',
      title: 'Urdhva Tiryagbhyam (Cross-Multiplication)',
      questionText: `${n1} × ${n2} = ?`,
      answer: ans,
      trickExplanation: `Urdhva Tiryagbhyam (Vertically & Crosswise): 1) Units: ${u1} × ${u2} = ${u1 * u2}. 2) Cross: (${t1} × ${u2}) + (${u1} × ${t2}) = ${t1 * u2 + u1 * t2}. 3) Tens: ${t1} × ${t2} = ${t1 * t2}. With carries ➔ ${ans}.`,
      difficulty: diff
    };
  }

  // 7. Antyayor Dashakepi (Units sum to 10, Tens digits same)
  if (cat === 'sumTenSameTens') {
    let tens = 4;
    if (diff === 'easy') tens = randomInt(2, 4);
    else if (diff === 'medium') tens = randomInt(5, 9);
    else if (diff === 'hard') tens = randomInt(10, 15);
    else tens = randomInt(16, 25);

    const u1 = randomInt(1, 9);
    const u2 = 10 - u1;
    const n1 = tens * 10 + u1;
    const n2 = tens * 10 + u2;
    const ans = n1 * n2;

    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'sumTenSameTens',
      title: 'Antyayor Dashakepi (Units Sum to 10)',
      questionText: `${n1} × ${n2} = ?`,
      answer: ans,
      trickExplanation: `Antyayor Dashakepi: Since units add to 10 (${u1} + ${u2} = 10) and tens are both ${tens}: Left = ${tens} × (${tens} + 1) = ${tens * (tens + 1)}, Right = ${u1} × ${u2} = ${String(u1 * u2).padStart(2, '0')}. Result ➔ ${ans}.`,
      difficulty: diff
    };
  }

  // 8. Squares of Numbers Near 50 (26 to 75)
  if (cat === 'squareNear50') {
    let dev = 4;
    if (diff === 'easy') {
      dev = randomInt(1, 6) * (Math.random() > 0.5 ? 1 : -1);
    } else if (diff === 'medium') {
      dev = randomInt(7, 14) * (Math.random() > 0.5 ? 1 : -1);
    } else if (diff === 'hard') {
      dev = randomInt(15, 20) * (Math.random() > 0.5 ? 1 : -1);
    } else {
      dev = randomInt(21, 24) * (Math.random() > 0.5 ? 1 : -1);
    }

    const num = 50 + dev;
    const ans = num * num;

    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'squareNear50',
      title: 'Squares of Numbers Near 50',
      questionText: `${num}² = ?`,
      answer: ans,
      trickExplanation: `Base 50 Shortcut: Deviation from 50 is ${dev > 0 ? '+' : ''}${dev}. First part = 25 + (${dev}) = ${25 + dev}. Second part = (${dev})² = ${dev * dev}. With carry if any ➔ ${ans}.`,
      difficulty: diff
    };
  }

  // 9. Base 50 Multiplication
  if (cat === 'base50') {
    let d1 = 2;
    let d2 = 4;

    if (diff === 'easy') {
      const isBelow = Math.random() > 0.5;
      d1 = randomInt(1, 4) * (isBelow ? -1 : 1);
      d2 = randomInt(1, 4) * (isBelow ? -1 : 1);
    } else if (diff === 'medium') {
      const isBelow = Math.random() > 0.5;
      d1 = randomInt(3, 8) * (isBelow ? -1 : 1);
      d2 = randomInt(3, 8) * (isBelow ? -1 : 1);
    } else if (diff === 'hard') {
      d1 = randomInt(5, 12) * (Math.random() > 0.5 ? 1 : -1);
      d2 = randomInt(5, 12) * (Math.random() > 0.5 ? 1 : -1);
    } else {
      // Extreme: mixed signs (one above, one below)
      d1 = randomInt(4, 15);
      d2 = -randomInt(4, 15);
    }

    const n1 = 50 + d1;
    const n2 = 50 + d2;
    const ans = n1 * n2;

    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'base50',
      title: 'Base 50 Multiplication',
      questionText: `${n1} × ${n2} = ?`,
      answer: ans,
      trickExplanation: `Working Base 50 (100 ÷ 2): Cross-add deviations: (${n1} + (${d2})) = ${n1 + d2}. Halve it = ${(n1 + d2) / 2}. Product of deviations = ${d1 * d2}. Combine ➔ ${ans}.`,
      difficulty: diff
    };
  }

  // 10. Series of 9s (Ekanyunena Purvena)
  if (cat === 'seriesOf9') {
    let num = 43;
    let multiplier = 99;

    if (diff === 'easy') {
      num = randomInt(12, 98);
      multiplier = 99;
    } else if (diff === 'medium') {
      num = randomInt(112, 895);
      multiplier = 999;
    } else if (diff === 'hard') {
      num = randomInt(1234, 7895);
      multiplier = 9999;
    } else {
      // Extreme: 2-digit x 999 or 3-digit x 9999
      num = randomInt(34, 98);
      multiplier = 999;
    }

    const ans = num * multiplier;
    const left = num - 1;

    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'seriesOf9',
      title: 'Multiply by Series of 9s (99, 999)',
      questionText: `${num} × ${multiplier} = ?`,
      answer: ans,
      trickExplanation: `Ekanyunena Purvena: 1) Subtract 1 from ${num} = ${left}. 2) Subtract ${left} from ${multiplier} = ${multiplier - left}. Combine left & right ➔ ${ans}.`,
      difficulty: diff
    };
  }

  // 11. Vilokanam Cube Roots
  if (cat === 'cubeRoot') {
    let root = 15;
    if (diff === 'easy') root = randomInt(11, 25);
    else if (diff === 'medium') root = randomInt(26, 50);
    else if (diff === 'hard') root = randomInt(51, 75);
    else root = randomInt(76, 99);

    const cube = root * root * root;
    const tens = Math.floor(root / 10);
    const units = root % 10;

    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'cubeRoot',
      title: 'Instant Cube Root (Vilokanam)',
      questionText: `∛${cube} = ?`,
      answer: root,
      trickExplanation: `Vilokanam Sutra: Last digit ${cube % 10} yields unit digit ${units}. Strike last 3 digits (${cube % 1000}), remaining is ${Math.floor(cube / 1000)}. Nearest cube ≤ ${Math.floor(cube / 1000)} is ${tens}³ = ${tens * tens * tens} ➔ tens digit is ${tens}. Cube root = ${root}.`,
      difficulty: diff
    };
  }

  // 12. Vilokanam Square Roots
  if (cat === 'squareRoot') {
    let root = 24;
    if (diff === 'easy') root = randomInt(21, 40);
    else if (diff === 'medium') root = randomInt(41, 65);
    else if (diff === 'hard') root = randomInt(66, 95);
    else root = randomInt(96, 130);

    const square = root * root;
    const tens = Math.floor(root / 10);
    const units = root % 10;
    const remaining = Math.floor(square / 100);
    const comp = tens * (tens + 1);

    return {
      id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category: 'squareRoot',
      title: 'Instant Square Root (Vilokanam)',
      questionText: `√${square} = ?`,
      answer: root,
      trickExplanation: `Vilokanam Square Root: Strike last 2 digits, remaining ${remaining} has nearest square ${tens}² = ${tens * tens} ➔ tens digit is ${tens}. Compare ${remaining} with ${tens} × (${tens} + 1) = ${comp}: since ${remaining} ${remaining >= comp ? '≥' : '<'} ${comp}, choose ${units}. Square root = ${root}.`,
      difficulty: diff
    };
  }

  // 13. Fast Division Hacks (÷5, ÷25, ÷50)
  const isDiv25 = diff === 'hard' || (diff === 'medium' && Math.random() > 0.5);
  const divisor = isDiv25 ? 25 : 5;
  let num = 145;

  if (diff === 'easy') num = randomInt(25, 120);
  else if (diff === 'medium') num = randomInt(125, 395);
  else if (diff === 'hard') num = randomInt(415, 875);
  else num = randomInt(1125, 4850);

  const rawAns = num / divisor;
  const ansStr = Number.isInteger(rawAns) ? String(rawAns) : rawAns.toFixed(rawAns * 100 % 10 === 0 ? 1 : 2);

  // Generate 4 clean options for division
  const options = [ansStr];
  const delta = divisor === 5 ? 0.2 : 0.04;
  const offsets = [-2 * delta, -delta, delta, 2 * delta, 4 * delta];
  for (const off of offsets) {
    if (options.length >= 4) break;
    const distractorVal = rawAns + off;
    if (distractorVal > 0) {
      const dStr = Number.isInteger(distractorVal) ? String(distractorVal) : distractorVal.toFixed(rawAns * 100 % 10 === 0 ? 1 : 2);
      if (!options.includes(dStr)) options.push(dStr);
    }
  }
  while (options.length < 4) {
    options.push(String((rawAns + options.length).toFixed(1)));
  }
  options.sort(() => Math.random() - 0.5);

  return {
    id: `vedic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    category: 'divisionHacks',
    title: `Mental Division Shortcut (÷${divisor})`,
    questionText: `${num} ÷ ${divisor} = ?`,
    answer: ansStr,
    options,
    trickExplanation: `Mental Division Hack: To divide by ${divisor}, ${divisor === 5 ? 'double the number and move decimal 1 place left' : 'multiply by 4 and move decimal 2 places left'}. (${num} × ${divisor === 5 ? 2 : 4}) ÷ ${divisor === 5 ? 10 : 100} = ${ansStr}.`,
    difficulty: diff
  };
}

// ---------------------------------------------------------------------------
// 3. EQUATION DETECTIVE ENGINE (Single Op & Multi-Op BODMAS Detective)
// ---------------------------------------------------------------------------

export function generateDetectiveQuestion(
  diff: DifficultyLevel = 'medium',
  isMultiOp: boolean = false
): DetectiveQuestion {
  // If multi-op detective is requested:
  if (isMultiOp || diff === 'hard' || diff === 'extreme') {
    const isMissingOperator = Math.random() > 0.5;

    if (isMissingOperator) {
      // Multi-op missing operator: e.g. a × b [ ? ] c = d or (a [ ? ] b) × c = d
      const a = randomInt(diff === 'extreme' ? 12 : 5, diff === 'extreme' ? 25 : 15);
      const b = randomInt(diff === 'extreme' ? 6 : 3, diff === 'extreme' ? 14 : 9);
      const c = randomInt(10, diff === 'extreme' ? 80 : 40);

      const opType = randomInt(1, 2) === 1 ? '+' : '-';
      let result = 0;
      if (opType === '+') {
        result = a * b + c;
      } else {
        result = a * b - c;
      }

      return {
        id: `det_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'missing_op',
        prompt: `${a} × ${b}  [ ? ]  ${c}  =  ${result}`,
        correctAnswer: opType,
        options: ['+', '-', '×', '÷'],
        explanation: `${a} × ${b} = ${a * b}. Then ${a * b} ${opType} ${c} = ${result}. Missing operator is "${opType}".`,
        difficulty: diff,
        isMultiOp: true
      };
    } else {
      // Multi-op missing number: e.g. mult × [ ? ] - sub = result
      const mult = randomInt(diff === 'extreme' ? 8 : 4, diff === 'extreme' ? 18 : 12);
      const missing = randomInt(diff === 'extreme' ? 5 : 2, diff === 'extreme' ? 16 : 10);
      const addSub = randomInt(10, diff === 'extreme' ? 60 : 30);
      const isSub = Math.random() > 0.4;
      const result = isSub ? mult * missing - addSub : mult * missing + addSub;

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
        prompt: `${mult} × [ ? ] ${isSub ? '-' : '+'} ${addSub} = ${result}`,
        correctAnswer: correct,
        options,
        explanation: `${mult} × ${missing} = ${mult * missing}, ${isSub ? '-' : '+'} ${addSub} = ${result}. Missing number is ${missing}.`,
        difficulty: diff,
        isMultiOp: true
      };
    }
  }

  // Single Operation Detective:
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

    if (diff === 'easy') {
      if (op.symbol === '+') { a = randomInt(8, 25); b = randomInt(5, 20); }
      else if (op.symbol === '-') { b = randomInt(5, 18); a = b + randomInt(6, 25); }
      else if (op.symbol === '×') { a = randomInt(2, 8); b = randomInt(2, 7); }
      else { b = randomInt(2, 6); a = b * randomInt(2, 8); }
    } else {
      if (op.symbol === '+') { a = randomInt(18, 65); b = randomInt(12, 55); }
      else if (op.symbol === '-') { b = randomInt(15, 50); a = b + randomInt(15, 60); }
      else if (op.symbol === '×') { a = randomInt(4, 16); b = randomInt(3, 14); }
      else { b = randomInt(3, 15); a = b * randomInt(3, 15); }
    }

    const c = op.compute(a, b);
    return {
      id: `det_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'missing_op',
      prompt: `${a}  [ ? ]  ${b}  =  ${c}`,
      correctAnswer: op.symbol,
      options: ['+', '-', '×', '÷'],
      explanation: `${a} ${op.symbol} ${b} = ${c}`,
      difficulty: diff,
      isMultiOp: false
    };
  } else {
    // Missing number in single operation
    const a = randomInt(diff === 'easy' ? 4 : 8, diff === 'easy' ? 10 : 20);
    const missing = randomInt(diff === 'easy' ? 3 : 5, diff === 'easy' ? 10 : 18);
    const result = a * missing;

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
      prompt: `${a} × [ ? ] = ${result}`,
      correctAnswer: correct,
      options,
      explanation: `${a} × ${missing} = ${result}. Missing number is ${missing}.`,
      difficulty: diff,
      isMultiOp: false
    };
  }
}

// ---------------------------------------------------------------------------
// 4. FLASH COMPARE ENGINE (< = > with 4 Tiers & Multi-Op option)
// ---------------------------------------------------------------------------

export function generateCompareQuestion(
  diff: DifficultyLevel = 'medium',
  isMultiOp: boolean = false
): CompareQuestion {
  let leftExpr = '';
  let rightExpr = '';
  let leftValue = 0;
  let rightValue = 0;

  if (isMultiOp || diff === 'hard' || diff === 'extreme') {
    // Multi-Operation Comparison
    if (diff === 'extreme') {
      // High-precision estimation test
      const a = randomInt(25, 60);
      const b = randomInt(15, 45);
      const c = randomInt(20, 80);
      leftExpr = `${a} × ${b} + ${c}`;
      leftValue = a * b + c;

      // Make right expression very close (±0, ±2, ±5) to test split-second mental math
      const delta = [0, 0, -2, 2, -5, 5, -8, 8][Math.floor(Math.random() * 8)];
      const targetRight = leftValue + delta;
      const d = randomInt(20, 50);
      const e = Math.floor(targetRight / d);
      const rem = targetRight - d * e;
      rightExpr = `${d} × ${e} + ${rem}`;
      rightValue = targetRight;
    } else {
      // Multi-operation e.g. a × b - c vs d × e - f
      const a = randomInt(8, 20);
      const b = randomInt(4, 12);
      const c = randomInt(10, 40);
      leftExpr = `${a} × ${b} - ${c}`;
      leftValue = a * b - c;

      const d = randomInt(8, 20);
      const e = randomInt(4, 12);
      const f = randomInt(10, 40);
      rightExpr = `${d} × ${e} - ${f}`;
      rightValue = d * e - f;
    }
  } else {
    // Single Operation Comparison
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
      // Addition vs Subtraction
      const a = randomInt(diff === 'easy' ? 15 : 30, diff === 'easy' ? 45 : 99);
      const b = randomInt(diff === 'easy' ? 10 : 25, diff === 'easy' ? 40 : 85);
      leftExpr = `${a} + ${b}`;
      leftValue = a + b;

      const delta = [0, 0, -3, 3, -7, 7][Math.floor(Math.random() * 6)];
      const targetRight = leftValue + delta;
      const c = targetRight + randomInt(10, 40);
      const d = c - targetRight;
      rightExpr = `${c} - ${d}`;
      rightValue = targetRight;
    }
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
    correctAnswer,
    difficulty: diff,
    isMultiOp
  };
}

// ---------------------------------------------------------------------------
// 5. TABLES, SQUARES & CUBES RECALL ENGINE (4 Tiers & Category filter)
// ---------------------------------------------------------------------------

export function generateTableRecallQuestion(
  diff: DifficultyLevel = 'medium',
  category: 'all' | 'table' | 'square' | 'cube' = 'all'
): TableRecallQuestion {
  let chosenCategory = category;
  if (chosenCategory === 'all') {
    const types: Array<'table' | 'square' | 'cube'> = ['table', 'square', 'cube'];
    chosenCategory = types[Math.floor(Math.random() * types.length)];
  }

  if (chosenCategory === 'table') {
    let t = 12;
    let mult = 7;
    if (diff === 'easy') {
      t = randomInt(2, 12);
      mult = randomInt(3, 9);
    } else if (diff === 'medium') {
      t = randomInt(12, 25);
      mult = randomInt(3, 9);
    } else if (diff === 'hard') {
      t = randomInt(19, 35);
      mult = randomInt(4, 9);
    } else {
      // Extreme: Tables 25 to 50
      t = randomInt(26, 50);
      mult = randomInt(4, 9);
    }
    return {
      id: `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'table',
      prompt: `${t} × ${mult} = ?`,
      answer: t * mult,
      difficulty: diff
    };
  } else if (chosenCategory === 'square') {
    let sq = 15;
    if (diff === 'easy') sq = randomInt(2, 15);
    else if (diff === 'medium') sq = randomInt(14, 35);
    else if (diff === 'hard') sq = randomInt(26, 50);
    else sq = randomInt(36, 100); // Extreme

    return {
      id: `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'square',
      prompt: `${sq}² = ?`,
      answer: sq * sq,
      difficulty: diff
    };
  } else {
    // Cubes
    let cb = 6;
    if (diff === 'easy') cb = randomInt(2, 8);
    else if (diff === 'medium') cb = randomInt(5, 15);
    else if (diff === 'hard') cb = randomInt(11, 25);
    else cb = randomInt(16, 32); // Extreme

    return {
      id: `tbl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'cube',
      prompt: `${cb}³ = ?`,
      answer: cb * cb * cb,
      difficulty: diff
    };
  }
}
