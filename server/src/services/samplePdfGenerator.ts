/**
 * Pure Node.js Multi-Page PDF Generator for Sample Banking & Exam Notes
 * Generates valid standard PDF 1.4 with multiple pages of formatted study content.
 */

export function generateSamplePdf(title: string, subject: string): Buffer {
  const pagesData = [
    {
      page: 1,
      header: `${title} - Part 1: Core Fundamentals & Formulas`,
      items: [
        '1. SPEED CALCULATION SHORTCUTS (Vedic Math):',
        '   - Multiplication with 11: Add adjacent digits (e.g. 52 * 11 = 5[5+2]2 = 572)',
        '   - Squaring numbers ending in 5: Multiply n*(n+1) and append 25 (e.g. 75^2 = 7*8 | 25 = 5625)',
        '   - Base Method (Near 100): 96 * 94 = (100 - 4 - 6) | (4 * 6) = 9024',
        '',
        '2. FRACTION TO PERCENTAGE TABLE (Crucial for RRB & IBPS PO):',
        '   - 1/2 = 50.0%    | 1/3 = 33.33%   | 1/4 = 25.0%    | 1/5 = 20.0%',
        '   - 1/6 = 16.66%   | 1/7 = 14.28%   | 1/8 = 12.5%    | 1/9 = 11.11%',
        '   - 1/11 = 9.09%   | 1/12 = 8.33%   | 1/14 = 7.14%   | 1/16 = 6.25%',
        '',
        '3. HIGH-PROBABILITY EXAM RULE:',
        '   Convert complex decimals like 42.85% directly to 3 * (1/7) = 3/7 to solve in under 15 seconds!'
      ]
    },
    {
      page: 2,
      header: `${title} - Part 2: Quadratic Equations & Sign Method`,
      items: [
        '1. STANDARD FORM: ax^2 + bx + c = 0',
        '   - If equation is (+, +) -> Roots are always (-, -)',
        '   - If equation is (-, +) -> Roots are always (+, +)',
        '   - If equation is (+, -) -> Roots are always (-, +) with larger root negative',
        '   - If equation is (-, -) -> Roots are always (+, -) with larger root positive',
        '',
        '2. GOLDEN CONSTANT RULE:',
        '   - If constant term (c) is negative in BOTH equations, relation is ALWAYS Cannot Be Determined (CND)!',
        '   - Example: x^2 + 5x - 14 = 0 and y^2 - 3y - 18 = 0 -> Directly tick CND (Zero calculation needed).',
        '',
        '3. PRACTICE PROBLEM FOR RRB PO:',
        '   x^2 - 13x + 40 = 0  ->  Roots: +8, +5',
        '   y^2 - 17y + 72 = 0  ->  Roots: +9, +8',
        '   Comparison: x <= y'
      ]
    },
    {
      page: 3,
      header: `${title} - Part 3: Data Interpretation & Approximation`,
      items: [
        '1. PIE CHART QUICK SPLIT:',
        '   - 360 degrees = 100% -> 1% = 3.6 degrees',
        '   - 18 degrees = 5%    | 54 degrees = 15%   | 72 degrees = 20%',
        '',
        '2. APPROXIMATION RULES FOR BANKING EXAMS:',
        '   - sqrt(255) approx 15.96 approx 16',
        '   - (49.98% of 799.9) / 20.02 = (50% * 800) / 20 = 400 / 20 = 20',
        '   - Never compute exact decimals when options differ by > 5 units.',
        '',
        '3. ARITHMETIC SPEED TIPS:',
        '   - Profit & Loss: Net change for x% profit and y% loss = x - y - (xy/100)%',
        '   - Simple Interest: SI = (P * R * T) / 100',
        '   - CI vs SI Difference for 2 years: Diff = P * (R/100)^2'
      ]
    },
    {
      page: 4,
      header: `${title} - Part 4: Reasoning Syllogism & Puzzles`,
      items: [
        '1. ONLY A FEW RULES (Definite & Negative):',
        '   - "Only a few A are B" means: "Some A are B" AND "Some A are NOT B" simultaneously!',
        '   - "All A can never be B" is ALWAYS TRUE.',
        '   - "All B being A is a possibility" is TRUE.',
        '',
        '2. CIRCULAR SEATING ARRANGEMENT TIPS:',
        '   - Facing Inside: Left is Clockwise, Right is Counter-Clockwise.',
        '   - Facing Outside: Left is Counter-Clockwise, Right is Clockwise.',
        '   - Always start with the definite clue (e.g. "A sits 3rd to right of B who faces center").',
        '',
        '3. FLOORS & BOX PUZZLE STRATEGY:',
        '   - Draw 2 parallel possibility columns immediately (Case 1 and Case 2).',
        '   - Eliminate impossible cases within 60 seconds.'
      ]
    },
    {
      page: 5,
      header: `${title} - Part 5: Exam Day Time Allocation & Strategy`,
      items: [
        '1. TIME MANAGEMENT MATRIX (45 Minutes / 80 Marks):',
        '   - Section 1: Quantitative Aptitude (22-25 Minutes) -> Target 32+ Attempts',
        '     * Simplification/Approximation: 5 Questions in 2.5 Mins',
        '     * Quadratic Equations: 5 Questions in 2.5 Mins',
        '     * Missing/Wrong Number Series: 5 Questions in 3.5 Mins',
        '     * Data Interpretation (2 Sets): 10 Questions in 7 Mins',
        '     * Arithmetic Word Problems: 8-10 Questions in 8 Mins',
        '',
        '   - Section 2: Reasoning Ability (20-22 Minutes) -> Target 35+ Attempts',
        '     * Syllogisms & Inequalities: 10 Questions in 4 Mins',
        '     * Coding-Decoding & Direction: 6 Questions in 3 Mins',
        '     * 3-4 Puzzles & Seating Sets: 18-20 Questions in 13 Mins',
        '',
        '2. GOLDEN RULE:',
        '   Never spend > 90 seconds on a single question. Flag and skip immediately!'
      ]
    }
  ];

  // Helper to escape text for PDF text stream
  const escapePdfText = (str: string) => {
    return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  };

  const objects: string[] = [];
  const addObject = (content: string): number => {
    objects.push(content);
    return objects.length;
  };

  // Object 1: Catalog (will point to Object 2)
  addObject('<< /Type /Catalog /Pages 2 0 R >>');

  // Object 2: Pages container (placeholder, will be updated)
  const pagesContainerIndex = 1;
  objects.push(''); // placeholder for Pages

  // Object 3: Font
  const fontObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBoldObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const pageObjIds: number[] = [];

  for (let i = 0; i < pagesData.length; i++) {
    const pData = pagesData[i];

    // Build content stream
    let streamText = 'BT\n';
    
    // Header title
    streamText += `/F2 16 Tf\n`;
    streamText += `50 740 Td\n`;
    streamText += `(${escapePdfText(pData.header)}) Tj\n`;
    streamText += `ET\n`;

    // Subtitle / metadata
    streamText += `BT\n`;
    streamText += `/F1 10 Tf\n`;
    streamText += `50 720 Td\n`;
    streamText += `(StudyOS Virtual Classroom | ${subject} Revision Notes | Page ${pData.page} of ${pagesData.length}) Tj\n`;
    streamText += `ET\n`;

    // Horizontal line
    streamText += `0.7 0.7 0.7 RG\n2 w\n50 710 m 562 710 l S\n`;

    // Body items
    streamText += `BT\n`;
    streamText += `/F1 11 Tf\n`;
    streamText += `14 TL\n`; // leading
    streamText += `50 690 Td\n`;

    for (const item of pData.items) {
      if (item === '') {
        streamText += `T*\n`;
      } else {
        streamText += `(${escapePdfText(item)}) '\n`;
      }
    }
    streamText += `ET\n`;

    // Content stream object
    const contentObj = addObject(`<< /Length ${Buffer.byteLength(streamText, 'utf-8')} >>\nstream\n${streamText}\nendstream`);

    // Page object
    const pageObj = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontObj} 0 R /F2 ${fontBoldObj} 0 R >> >> >>`);
    pageObjIds.push(pageObj);
  }

  // Update Object 2: Pages
  objects[pagesContainerIndex] = `<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>`;

  // Assemble PDF document with xref
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'utf-8'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf-8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf-8');
}
