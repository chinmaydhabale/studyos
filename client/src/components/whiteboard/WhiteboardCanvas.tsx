import React, { useRef, useState, useEffect } from 'react';
import {
  Pen,
  Square,
  Circle,
  ArrowRight,
  Minus,
  Triangle,
  Type,
  Trash2,
  Download,
  StickyNote,
  GitBranch,
  Workflow,
  Sparkles,
  Undo
} from 'lucide-react';
import { useSocket } from '../../context/SocketContext.js';
import { WhiteboardElement } from '../../types.js';

type ToolType = 'pen' | 'rect' | 'circle' | 'line' | 'arrow' | 'triangle' | 'equation' | 'flowchart' | 'mindmap' | 'sticky';

export const WhiteboardCanvas: React.FC = () => {
  const {
    whiteboardElements,
    sendWhiteboardElement,
    clearWhiteboard,
    sendWhiteboardCursor,
    currentUser,
    addToast
  } = useSocket();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [color, setColor] = useState('#818cf8');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);

  // Latest values for the rAF-throttled cursor emit (avoids stale closures)
  const cursorRafRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const sendCursorRef = useRef(sendWhiteboardCursor);
  sendCursorRef.current = sendWhiteboardCursor;

  // Feature-detect roundRect once; fall back to a manual rounded-rect path
  const supportsRoundRect = typeof CanvasRenderingContext2D !== 'undefined' &&
    typeof (CanvasRenderingContext2D.prototype as any).roundRect === 'function';

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    if (supportsRoundRect) {
      (ctx as any).roundRect(x, y, w, h, radius);
      return;
    }
    // Manual rounded-rect fallback for browsers without ctx.roundRect
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  // Redraw the committed layer (grid + all elements) only when the element list,
  // tool or style changes — never on every pointer move.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set high-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Draw dark grid background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 24;
    for (let x = 0; x < rect.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = 0; y < rect.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }

    // Render all committed elements
    whiteboardElements.forEach((el) => {
      renderElement(ctx, el);
    });
  }, [whiteboardElements, currentTool, color, strokeWidth]);

  // Render the in-progress stroke on the stacked overlay canvas, cleared per move
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = overlay.getBoundingClientRect();
    if (overlay.width !== rect.width * dpr || overlay.height !== rect.height * dpr) {
      overlay.width = rect.width * dpr;
      overlay.height = rect.height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (!isDrawing || currentPoints.length < 1) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (currentTool === 'pen') {
      if (currentPoints.length > 1) {
        ctx.beginPath();
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) {
          ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        }
        ctx.stroke();
      }
    } else if (startPos && currentPoints.length > 1) {
      // Live preview for shapes / lines / arrows
      const end = currentPoints[currentPoints.length - 1];
      if (currentTool === 'rect') {
        ctx.strokeRect(
          Math.min(startPos.x, end.x),
          Math.min(startPos.y, end.y),
          Math.abs(end.x - startPos.x),
          Math.abs(end.y - startPos.y)
        );
      } else if (currentTool === 'circle') {
        const size = Math.max(Math.abs(end.x - startPos.x), Math.abs(end.y - startPos.y));
        ctx.beginPath();
        ctx.arc(Math.min(startPos.x, end.x), Math.min(startPos.y, end.y), size / 2, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (currentTool === 'line' || currentTool === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        if (currentTool === 'arrow') {
          const angle = Math.atan2(end.y - startPos.y, end.x - startPos.x);
          const headLen = 12;
          ctx.beginPath();
          ctx.moveTo(end.x, end.y);
          ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(end.x, end.y);
          ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
      }
    }
  }, [currentPoints, isDrawing, startPos, currentTool, color, strokeWidth]);

  // Throttle cursor broadcasts to one per animation frame
  const queueCursorEmit = (x: number, y: number) => {
    pendingCursorRef.current = { x, y };
    if (cursorRafRef.current !== null) return;
    cursorRafRef.current = requestAnimationFrame(() => {
      cursorRafRef.current = null;
      const pending = pendingCursorRef.current;
      if (pending) sendCursorRef.current(pending.x, pending.y);
    });
  };

  useEffect(() => {
    return () => {
      if (cursorRafRef.current !== null) cancelAnimationFrame(cursorRafRef.current);
    };
  }, []);

  const renderElement = (ctx: CanvasRenderingContext2D, el: WhiteboardElement) => {
    ctx.save();
    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (el.type) {
      case 'pen':
        if (el.points && el.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(el.points[0].x, el.points[0].y);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i].x, el.points[i].y);
          }
          ctx.stroke();
        }
        break;

      case 'rect':
        if (el.x !== undefined && el.y !== undefined && el.width && el.height) {
          if (el.fill) {
            ctx.fillStyle = el.fill;
            ctx.fillRect(el.x, el.y, el.width, el.height);
          }
          ctx.strokeRect(el.x, el.y, el.width, el.height);
        }
        break;

      case 'circle':
        if (el.x !== undefined && el.y !== undefined && el.width) {
          ctx.beginPath();
          const radius = Math.abs(el.width) / 2;
          ctx.arc(el.x + radius, el.y + radius, radius, 0, 2 * Math.PI);
          if (el.fill) {
            ctx.fillStyle = el.fill;
            ctx.fill();
          }
          ctx.stroke();
        }
        break;

      case 'line':
      case 'arrow':
        if (el.points && el.points.length >= 2) {
          const p1 = el.points[0];
          const p2 = el.points[1];
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          if (el.type === 'arrow') {
            // Draw arrow head
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const headLen = 12;
            ctx.beginPath();
            ctx.moveTo(p2.x, p2.y);
            ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(p2.x, p2.y);
            ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
          }
        }
        break;

      case 'flowchart':
        if (el.x !== undefined && el.y !== undefined && el.width && el.height) {
          ctx.fillStyle = el.fill || 'rgba(99, 102, 241, 0.15)';
          ctx.fillRect(el.x, el.y, el.width, el.height);
          ctx.strokeRect(el.x, el.y, el.width, el.height);

          if (el.text) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(el.text, el.x + el.width / 2, el.y + el.height / 2);
          }
        }
        break;

      case 'sticky':
        if (el.x !== undefined && el.y !== undefined && el.width && el.height) {
          ctx.fillStyle = el.fill || '#fef3c7';
          ctx.fillRect(el.x, el.y, el.width, el.height);
          ctx.strokeStyle = '#f59e0b';
          ctx.strokeRect(el.x, el.y, el.width, el.height);

          if (el.text) {
            ctx.fillStyle = '#1e293b';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            thisWrapText(ctx, el.text, el.x + 8, el.y + 8, el.width - 16, 16);
          }
        }
        break;

      case 'equation':
        if (el.x !== undefined && el.y !== undefined && el.text) {
          ctx.fillStyle = el.color;
          ctx.font = 'bold 15px "Fira Code", monospace';
          ctx.fillText(`∑ ${el.text}`, el.x, el.y);
        }
        break;

      case 'mindmap':
        if (el.x !== undefined && el.y !== undefined && el.width && el.height) {
          // Pill rounded node (feature-detected with a manual fallback)
          const r = el.height / 2;
          drawRoundedRect(ctx, el.x, el.y, el.width, el.height, r);
          ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
          ctx.fill();
          ctx.strokeStyle = '#06b6d4';
          ctx.stroke();

          if (el.text) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(el.text, el.x + el.width / 2, el.y + el.height / 2);
          }
        }
        break;
    }
    ctx.restore();
  };

  const thisWrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = text.split(' ');
    let line = '';
    let curY = y;
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, curY);
        line = words[n] + ' ';
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, curY);
  };

  // Mouse / Pointer Event Handlers
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentPoints([pos]);

    // Handle instant-drop elements like Sticky, Equation, Flowchart, Mindmap
    if (currentTool === 'sticky') {
      const text = prompt('Enter note text:', '💡 Key insight or formula');
      if (text) {
        sendWhiteboardElement({
          id: `sticky-${Date.now()}`,
          type: 'sticky',
          x: pos.x,
          y: pos.y,
          width: 170,
          height: 100,
          color: '#f59e0b',
          strokeWidth: 1,
          fill: '#fef3c7',
          text,
          createdBy: currentUser.name,
          createdAt: Date.now()
        });
      }
      setIsDrawing(false);
    } else if (currentTool === 'equation') {
      const eq = prompt('Enter Quantitative formula / trick:', 'CI - SI = P(R/100)^2 (2-Year Diff)');
      if (eq) {
        sendWhiteboardElement({
          id: `eq-${Date.now()}`,
          type: 'equation',
          x: pos.x,
          y: pos.y,
          color,
          strokeWidth: 2,
          text: eq,
          createdBy: currentUser.name,
          createdAt: Date.now()
        });
      }
      setIsDrawing(false);
    } else if (currentTool === 'flowchart') {
      const step = prompt('Enter flowchart / puzzle step:', 'Step: Analyze DI Bar Graph & Compute Ratios');
      if (step) {
        sendWhiteboardElement({
          id: `flow-${Date.now()}`,
          type: 'flowchart',
          x: pos.x,
          y: pos.y,
          width: 180,
          height: 60,
          color,
          strokeWidth: 2,
          text: step,
          createdBy: currentUser.name,
          createdAt: Date.now()
        });
      }
      setIsDrawing(false);
    } else if (currentTool === 'mindmap') {
      const topic = prompt('Enter mind-map topic / concept:', 'Quant Arithmetic Shortcuts');
      if (topic) {
        sendWhiteboardElement({
          id: `mind-${Date.now()}`,
          type: 'mindmap',
          x: pos.x,
          y: pos.y,
          width: 160,
          height: 48,
          color: '#06b6d4',
          strokeWidth: 2,
          text: topic,
          createdBy: currentUser.name,
          createdAt: Date.now()
        });
      }
      setIsDrawing(false);
    }
  };

  const commitDrawnShape = (endPos: { x: number; y: number }) => {
    if (!startPos) return;

    if (currentTool === 'pen') {
      if (currentPoints.length > 1) {
        sendWhiteboardElement({
          id: `pen-${Date.now()}`,
          type: 'pen',
          points: currentPoints,
          color,
          strokeWidth,
          createdBy: currentUser.name,
          createdAt: Date.now()
        });
      }
    } else if (currentTool === 'rect') {
      const w = endPos.x - startPos.x;
      const h = endPos.y - startPos.y;
      if (Math.abs(w) > 5 && Math.abs(h) > 5) {
        sendWhiteboardElement({
          id: `rect-${Date.now()}`,
          type: 'rect',
          x: Math.min(startPos.x, endPos.x),
          y: Math.min(startPos.y, endPos.y),
          width: Math.abs(w),
          height: Math.abs(h),
          color,
          strokeWidth,
          createdBy: currentUser.name,
          createdAt: Date.now()
        });
      }
    } else if (currentTool === 'circle') {
      const w = endPos.x - startPos.x;
      const h = endPos.y - startPos.y;
      const size = Math.max(Math.abs(w), Math.abs(h));
      if (size > 5) {
        sendWhiteboardElement({
          id: `circle-${Date.now()}`,
          type: 'circle',
          x: Math.min(startPos.x, endPos.x),
          y: Math.min(startPos.y, endPos.y),
          width: size,
          height: size,
          color,
          strokeWidth,
          createdBy: currentUser.name,
          createdAt: Date.now()
        });
      }
    } else if (currentTool === 'arrow' || currentTool === 'line') {
      sendWhiteboardElement({
        id: `${currentTool}-${Date.now()}`,
        type: currentTool,
        points: [startPos, endPos],
        color,
        strokeWidth,
        createdBy: currentUser.name,
        createdAt: Date.now()
      });
    }

    setCurrentPoints([]);
    setStartPos(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);
    queueCursorEmit(pos.x, pos.y);

    if (!isDrawing) return;
    setCurrentPoints((prev) => [...prev, pos]);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) {
      setIsDrawing(false);
      return;
    }
    const endPos = getCanvasCoords(e);
    setIsDrawing(false);
    commitDrawnShape(endPos);
  };

  // Leaving the canvas cancels the in-progress stroke instead of committing a
  // half-drawn shape.
  const handleMouseLeave = () => {
    setIsDrawing(false);
    setCurrentPoints([]);
    setStartPos(null);
  };

  // Touch Event Handlers for Tablets / Mobile
  const getTouchCoords = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !e.touches[0]) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const pos = getTouchCoords(e);
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentPoints([pos]);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const pos = getTouchCoords(e);
    queueCursorEmit(pos.x, pos.y);

    if (!isDrawing) return;
    setCurrentPoints((prev) => [...prev, pos]);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) {
      setIsDrawing(false);
      return;
    }
    // Use the touch event's own final coordinates — state can be one move behind.
    const touch = e.changedTouches[0] || e.touches[0];
    const canvas = canvasRef.current;
    let endPos = currentPoints[currentPoints.length - 1] || startPos;
    if (touch && canvas) {
      const rect = canvas.getBoundingClientRect();
      endPos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    setIsDrawing(false);
    commitDrawnShape(endPos);
  };

  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `StudyOS-Whiteboard-${new Date().toISOString().split('T')[0]}.png`;
    a.click();
    addToast('Whiteboard Exported', 'Downloaded high-res PNG snapshot of the whiteboard.', 'success');
  };

  const tools = [
    { id: 'pen', label: 'Pen', icon: Pen },
    { id: 'rect', label: 'Rectangle', icon: Square },
    { id: 'circle', label: 'Circle', icon: Circle },
    { id: 'arrow', label: 'Arrow', icon: ArrowRight },
    { id: 'line', label: 'Line', icon: Minus },
    { id: 'flowchart', label: 'Flowchart Box', icon: Workflow },
    { id: 'mindmap', label: 'Mind Map', icon: GitBranch },
    { id: 'equation', label: 'Equation Stamp', icon: Type },
    { id: 'sticky', label: 'Sticky Note', icon: StickyNote }
  ];

  const colors = [
    '#818cf8', // Indigo
    '#06b6d4', // Cyan
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#f43f5e', // Rose
    '#ffffff'  // White
  ];

  return (
    <div className="w-full max-w-7xl mx-auto p-4 flex flex-col h-[calc(100vh-4.5rem)]">
      
      {/* Top Floating Toolbar */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 mb-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        
        {/* Tools */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setCurrentTool(t.id as ToolType)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  currentTool === t.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                title={t.label}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Colors & Width */}
        <div className="flex items-center gap-3">
          
          {/* Color palette */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-white/5">
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-5 h-5 rounded-full transition-transform ${
                  color === c ? 'scale-125 ring-2 ring-white/50' : 'hover:scale-110 opacity-80'
                }`}
              />
            ))}
          </div>

          {/* Stroke Width */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-white/5 text-xs text-slate-300">
            <span className="text-[10px] text-slate-500 font-mono">WIDTH:</span>
            {[2, 4, 6].map((w) => (
              <button
                key={w}
                onClick={() => setStrokeWidth(w)}
                className={`w-5 h-5 rounded flex items-center justify-center font-bold ${
                  strokeWidth === w ? 'bg-indigo-600 text-white' : 'hover:bg-white/10'
                }`}
              >
                {w}
              </button>
            ))}
          </div>

          {/* Action Buttons: Export & Clear */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportPNG}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-slate-200 transition-colors"
              title="Export Whiteboard to PNG"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Clear the collaborative whiteboard for all students in this room?')) {
                  clearWhiteboard();
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-medium text-rose-300 transition-colors"
              title="Clear Whiteboard"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>

        </div>

      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative bg-slate-950">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full h-full cursor-crosshair block touch-none"
        />

        {/* Stacked overlay canvas for the in-progress stroke (cleared per move) */}
        <canvas
          ref={overlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none block touch-none"
        />

        {/* Live Multi-User Overlay Legend */}
        <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2 text-xs text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Simultaneous Multi-User Drawing Active</span>
          <span className="text-slate-500">•</span>
          <span className="text-indigo-400 font-mono">{whiteboardElements.length} Elements Saved</span>
        </div>
      </div>

    </div>
  );
};
