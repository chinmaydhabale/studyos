/**
 * pdf.js setup & intelligent text extraction (with Gemini 3.8 Flash Vision OCR fallback).
 *
 * 1. Configures CMap and Standard Font URLs so PDFs with custom encodings,
 *    Devanagari/Hindi fonts, and mathematical symbols decode cleanly.
 * 2. Preserves line breaks and paragraph structure when extracting selectable text.
 * 3. Automatically detects scanned / image-based PDFs (or pages with missing text
 *    layers) and falls back to rendering pages to an offscreen canvas + Gemini 3.8
 *    Flash multimodal Vision OCR (`/api/ai/pdf-ocr`).
 */
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;

const PDFJS_CDN_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${(pdfjsLib as any).version || '5.4.149'}`;

/** In-memory cache for OCR-extracted pages so revisiting a scanned page is instant. */
const ocrPageCache = new Map<string, string>();

/**
 * Loads a PDF document with CMap and Standard Font support enabled so custom
 * font encodings and non-Latin glyphs extract properly.
 */
export function loadPdfDocument(source: { data?: ArrayBuffer | Uint8Array; url?: string }) {
  return pdfjsLib.getDocument({
    ...source,
    cMapUrl: `${PDFJS_CDN_BASE}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_CDN_BASE}/standard_fonts/`
  });
}

/**
 * Extracts selectable text from one page while preserving line breaks and
 * vertical layout structure (headings, options, formulas, bullet lists).
 */
export async function extractPageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();

  const lines: string[] = [];
  let currentLine = '';
  let lastY: number | null = null;

  for (const rawItem of content.items as any[]) {
    if (!rawItem || typeof rawItem.str !== 'string') continue;
    const text = rawItem.str;
    const y = Array.isArray(rawItem.transform) ? Number(rawItem.transform[5]) : null;

    if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
      if (currentLine.trim()) {
        lines.push(currentLine.replace(/[ \t]+/g, ' ').trim());
      }
      currentLine = text;
    } else {
      if (currentLine && !currentLine.endsWith(' ') && !text.startsWith(' ')) {
        currentLine += ' ';
      }
      currentLine += text;
    }

    if (y !== null) {
      lastY = y;
    }

    if (rawItem.hasEOL) {
      if (currentLine.trim()) {
        lines.push(currentLine.replace(/[ \t]+/g, ' ').trim());
      }
      currentLine = '';
      lastY = null;
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.replace(/[ \t]+/g, ' ').trim());
  }

  return lines.join('\n').trim();
}

/**
 * Renders a single PDF page onto an offscreen canvas and returns a high-contrast
 * PNG data URL suitable for local WebAssembly OCR (Tesseract.js).
 */
export async function renderPageToDataUrl(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale = 1.6
): Promise<string | null> {
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // White background for clean OCR contrast on transparent PDFs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    const dataUrl = canvas.toDataURL('image/png');
    canvas.width = 0;
    canvas.height = 0;
    return dataUrl || null;
  } catch (err) {
    console.warn(`Failed to render page ${pageNumber} for local OCR:`, err);
    return null;
  }
}

let tesseractWorkerPromise: Promise<any> | null = null;

/**
 * Dynamically loads Tesseract.js v5 WebAssembly OCR engine (English + Hindi) in the
 * browser only when a scanned/image PDF is encountered. Uses 0 Gemini API quota!
 */
async function getLocalTesseractWorker(onProgress?: (status: string) => void): Promise<any> {
  if (tesseractWorkerPromise) return tesseractWorkerPromise;

  tesseractWorkerPromise = (async () => {
    onProgress?.('Loading Free Local OCR Engine (0 AI Quota)...');
    const win = window as any;
    if (!win.Tesseract) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[data-tesseract-cdn]');
        if (existing && win.Tesseract) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.async = true;
        script.setAttribute('data-tesseract-cdn', 'true');
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Tesseract.js from CDN'));
        document.head.appendChild(script);
      });
    }
    const worker = await win.Tesseract.createWorker('eng+hin');
    return worker;
  })().catch(err => {
    tesseractWorkerPromise = null;
    throw err;
  });

  return tesseractWorkerPromise;
}

/**
 * Runs 100% free, local browser-based OCR (Tesseract WebAssembly) on a single
 * rendered PDF page. Consumes ZERO Gemini API quota.
 */
async function recognizePageLocally(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  onProgress?: (status: string) => void
): Promise<string> {
  const dataUrl = await renderPageToDataUrl(pdf, pageNumber, 1.6);
  if (!dataUrl) return '';

  try {
    const worker = await getLocalTesseractWorker(onProgress);
    const result = await worker.recognize(dataUrl);
    const text = (result?.data?.text || '').trim();
    return text;
  } catch (err) {
    console.warn(`Local Tesseract OCR failed on page ${pageNumber}:`, err);
    return '';
  }
}

/**
 * Extracts text from a single page, automatically falling back to 100% Free Local
 * Browser OCR (Tesseract.js WebAssembly) if the page is scanned (< 40 selectable chars).
 * Uses ZERO Gemini API quota.
 */
export async function extractPageTextWithOcrFallback(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  _apiBaseUrl?: string,
  docTitle?: string
): Promise<string> {
  const selectable = await extractPageText(pdf, pageNumber).catch(() => '');
  if (selectable.length >= 40) {
    return selectable;
  }

  const fingerprint = (pdf as any).fingerprints?.[0] || docTitle || 'pdf';
  const cacheKey = `${fingerprint}:p${pageNumber}`;
  const cached = ocrPageCache.get(cacheKey);
  if (cached) return cached;

  const ocrText = await recognizePageLocally(pdf, pageNumber);
  if (ocrText.trim()) {
    ocrPageCache.set(cacheKey, ocrText.trim());
    return ocrText.trim();
  }

  return selectable;
}

/**
 * Extracts comprehensive text across a full PDF document (up to `maxPages`),
 * and automatically runs 100% Free Local Browser OCR (Tesseract.js WebAssembly,
 * English + Hindi) for scanned/image pages so ZERO Gemini API quota is consumed.
 */
export async function extractFullDocumentText(options: {
  file?: File;
  pdf?: PDFDocumentProxy;
  docTitle?: string;
  apiBaseUrl?: string;
  maxPages?: number;
  maxChars?: number;
  onProgress?: (status: string) => void;
}): Promise<{ text: string; pagesRead: number; totalPages: number; usedOcr: boolean }> {
  const maxPages = options.maxPages ?? 60;
  const maxChars = options.maxChars ?? 120000;
  const docTitle = options.docTitle || options.file?.name?.replace(/\.pdf$/i, '') || 'Uploaded PDF';

  let pdfDoc: PDFDocumentProxy | null = options.pdf || null;
  let ownedPdf = false;

  if (!pdfDoc && options.file) {
    const arrayBuffer = await options.file.arrayBuffer();
    const loadingTask = loadPdfDocument({ data: arrayBuffer });
    pdfDoc = await loadingTask.promise;
    ownedPdf = true;
  }

  if (!pdfDoc) {
    return { text: '', pagesRead: 0, totalPages: 0, usedOcr: false };
  }

  try {
    const totalPages = pdfDoc.numPages;
    const pagesToRead = Math.min(totalPages, maxPages);
    const pageTexts = new Map<number, string>();
    const sparsePages: number[] = [];
    let totalMeaningfulChars = 0;

    for (let p = 1; p <= pagesToRead; p++) {
      if (p === 1 || p % 5 === 0) {
        options.onProgress?.(`Extracting text from page ${p} of ${pagesToRead}...`);
      }
      const text = await extractPageText(pdfDoc, p).catch(() => '');
      pageTexts.set(p, text);
      totalMeaningfulChars += text.length;

      // Track sparse/scanned pages within the first 15 pages for Free Local OCR
      if (p <= 15 && text.length < 45) {
        sparsePages.push(p);
      }

      if (totalMeaningfulChars >= maxChars) {
        break;
      }
    }

    let usedOcr = false;
    const needsOcr =
      totalMeaningfulChars < 160 ||
      (sparsePages.length > 0 && sparsePages.length >= Math.min(pagesToRead, 15) * 0.5);

    if (needsOcr && sparsePages.length > 0) {
      const pagesForOcr = sparsePages.slice(0, 15);
      const fingerprint = (pdfDoc as any).fingerprints?.[0] || docTitle;

      for (let i = 0; i < pagesForOcr.length; i++) {
        const pageNum = pagesForOcr[i];
        const cacheKey = `${fingerprint}:p${pageNum}`;
        const cached = ocrPageCache.get(cacheKey);
        if (cached) {
          pageTexts.set(pageNum, cached);
          usedOcr = true;
          continue;
        }

        options.onProgress?.(
          `Free Local OCR (0 AI Quota): Reading scanned page ${pageNum} (${i + 1}/${pagesForOcr.length})...`
        );
        const ocrText = await recognizePageLocally(pdfDoc, pageNum, options.onProgress);
        if (ocrText.trim()) {
          usedOcr = true;
          pageTexts.set(pageNum, ocrText.trim());
          ocrPageCache.set(cacheKey, ocrText.trim());
        }
      }
    }

    const sections: string[] = [];
    let accumulatedChars = 0;
    let pagesIncluded = 0;

    for (let p = 1; p <= pagesToRead; p++) {
      const content = (pageTexts.get(p) || '').trim();
      if (!content) continue;
      pagesIncluded++;
      const block = `--- Page ${p} ---\n${content}`;
      if (accumulatedChars + block.length > maxChars) {
        const remaining = Math.max(0, maxChars - accumulatedChars);
        if (remaining > 100) {
          sections.push(block.slice(0, remaining));
        }
        break;
      }
      sections.push(block);
      accumulatedChars += block.length + 2;
    }

    return {
      text: sections.join('\n\n').trim(),
      pagesRead: pagesIncluded || pagesToRead,
      totalPages,
      usedOcr
    };
  } finally {
    if (ownedPdf && pdfDoc) {
      try {
        pdfDoc.destroy();
      } catch {}
    }
  }
}
