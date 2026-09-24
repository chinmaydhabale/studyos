/**
 * pdf.js setup for the reader.
 *
 * The PDF used to be shown in an <iframe>, which meant the browser's own PDF
 * viewer owned the text and nothing in the page could read a selection. pdf.js
 * renders the pages itself and lays a real text layer over each canvas, which is
 * what makes "select text -> ask AI" possible.
 */
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;

/** Extracts the selectable text of one page, normalised for use in a prompt. */
export async function extractPageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();

  // textContent items carry their own trailing spaces; joining with '' keeps
  // words intact, then we collapse runs of whitespace.
  const raw = content.items
    .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
    .join(' ');

  return raw.replace(/\s+/g, ' ').trim();
}
