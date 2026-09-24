import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PDFDocumentProxy, pdfjsLib } from '../../lib/pdfjs.js';

interface PdfPageViewProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  /** Lets the parent measure pages for scroll-driven page tracking. */
  onRendered?: (pageNumber: number, element: HTMLDivElement) => void;
}

/**
 * One PDF page: a canvas with an invisible, selectable text layer on top.
 * Selecting text inside `.pdf-text-layer` behaves like normal browser text
 * selection, which is what the "Explain with AI" flow reads from.
 */
export const PdfPageView: React.FC<PdfPageViewProps> = ({ pdf, pageNumber, scale, onRendered }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;
    let textLayer: any = null;

    const draw = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const textDiv = textLayerRef.current;
        if (!canvas || !textDiv) return;

        // Render at device resolution for crisp text, but keep CSS size in layout pixels.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({ canvasContext: ctx, canvas, viewport });
        await renderTask.promise;
        if (cancelled) return;

        // Build the selectable text layer over the freshly painted canvas.
        textDiv.replaceChildren();
        textDiv.style.setProperty('--scale-factor', String(scale));
        textDiv.style.width = `${viewport.width}px`;
        textDiv.style.height = `${viewport.height}px`;

        const textContent = await page.getTextContent();
        if (cancelled) return;

        textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textDiv,
          viewport
        });
        await textLayer.render();
        if (cancelled) return;

        setSize({ width: viewport.width, height: viewport.height });
        if (wrapRef.current) onRendered?.(pageNumber, wrapRef.current);
      } catch (err: any) {
        // A cancelled render is an expected part of teardown, not a failure.
        if (!cancelled && err?.name !== 'RenderingCancelledException') {
          console.error(`Failed to render PDF page ${pageNumber}:`, err);
          setFailed(true);
        }
      }
    };

    draw();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel?.();
      } catch {
        /* already finished */
      }
      try {
        textLayer?.cancel?.();
      } catch {
        /* already finished */
      }
    };
  }, [pdf, pageNumber, scale]);

  const width = size?.width ?? 0;
  const height = size?.height ?? 0;

  return (
    <div
      ref={wrapRef}
      data-pdf-page={pageNumber}
      className="relative mx-auto my-3 bg-white shadow-2xl shadow-black/50 rounded-sm overflow-hidden"
      style={size ? { width, height } : { width: 612 * scale, height: 792 * scale }}
    >
      <canvas ref={canvasRef} className="block" />

      {/* Selectable text sits above the canvas; colour comes from CSS. */}
      <div ref={textLayerRef} className="pdf-text-layer" />

      {!size && !failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
          <Loader2 className="w-5 h-5 text-indigo-300 animate-spin" />
        </div>
      )}

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 text-xs text-rose-300 px-4 text-center">
          Could not render page {pageNumber}
        </div>
      )}

      <span className="absolute bottom-1 right-2 text-[10px] font-mono text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded pointer-events-none">
        {pageNumber}
      </span>
    </div>
  );
};
