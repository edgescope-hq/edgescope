import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { MousePointer2, ArrowUpRight, Minus, Square, Circle, Type, Undo2, Eraser, Save, Maximize2, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateScreenshotAnnotations } from "@/lib/trades.functions";

export type AnnotationShape = {
  id: string;
  type: "arrow" | "line" | "rect" | "circle" | "text";
  x1: number; y1: number; x2: number; y2: number;
  color?: string;
  label?: string;
  text?: string;
};

type Tool = "select" | "arrow" | "line" | "rect" | "circle" | "text";

const PRESET_LABELS = ["Liquidity", "MSS", "FVG", "Entry", "SL", "TP", "Mistake", "Lesson"] as const;
const COLORS = ["#ef4444", "#10b981", "#3b82f6", "#f59e0b", "#a855f7", "#ffffff"];

function uid() { return Math.random().toString(36).slice(2, 10); }

export function ScreenshotAnnotator({
  screenshotId,
  url,
  initial,
  kind,
  onSaved,
}: {
  screenshotId: string;
  url: string;
  initial: AnnotationShape[];
  kind: "before" | "after" | string;
  onSaved?: (next: AnnotationShape[]) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.04]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {kind === "after" ? "AFTER TRADE" : "BEFORE TRADE"}
        </div>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          aria-label="Open fullscreen annotator"
          className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-muted-foreground ring-1 ring-white/[0.06] hover:text-foreground"
        >
          <Maximize2 className="h-3 w-3" /> Annotate
        </button>
      </div>
      <AnnotatorCanvas
        screenshotId={screenshotId}
        url={url}
        initial={initial}
        compact
        onSaved={onSaved}
      />
      {fullscreen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4" onClick={() => setFullscreen(false)}>
          <div className="w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold tracking-wider text-muted-foreground">FULLSCREEN ANNOTATOR — {kind.toUpperCase()}</div>
              <button onClick={() => setFullscreen(false)} aria-label="Close fullscreen" className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <AnnotatorCanvas
              screenshotId={screenshotId}
              url={url}
              initial={initial}
              onSaved={onSaved}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AnnotatorCanvas({
  screenshotId,
  url,
  initial,
  compact,
  onSaved,
}: {
  screenshotId: string;
  url: string;
  initial: AnnotationShape[];
  compact?: boolean;
  onSaved?: (next: AnnotationShape[]) => void;
}) {
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [label, setLabel] = useState<string>("");
  const [shapes, setShapes] = useState<AnnotationShape[]>(initial ?? []);
  const [drawing, setDrawing] = useState<AnnotationShape | null>(null);
  const [textBuf, setTextBuf] = useState<string>("");
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => { setShapes(initial ?? []); }, [screenshotId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useServerFn(updateScreenshotAnnotations);
  const saveM = useMutation({
    mutationFn: () => save({ data: { id: screenshotId, annotations: shapes } }),
    onSuccess: () => { toast.success("Annotations saved"); onSaved?.(shapes); },
    onError: (e: Error) => toast.error(e.message),
  });

  function getPoint(e: ReactPointerEvent<SVGSVGElement>): { x: number; y: number } {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 1000,
      y: ((e.clientY - rect.top) / rect.height) * 1000,
    };
  }

  function onDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (tool === "select") return;
    const p = getPoint(e);
    if (tool === "text") {
      const text = textBuf || label || "Label";
      setShapes((s) => [...s, { id: uid(), type: "text", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, text, label: label || undefined }]);
      setTextBuf("");
      return;
    }
    setDrawing({ id: uid(), type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, label: label || undefined });
  }
  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drawing) return;
    const p = getPoint(e);
    setDrawing({ ...drawing, x2: p.x, y2: p.y });
  }
  function onUp() {
    if (!drawing) return;
    setShapes((s) => [...s, drawing]);
    setDrawing(null);
  }

  const undo = () => setShapes((s) => s.slice(0, -1));
  const clear = () => { if (confirm("Clear all annotations?")) setShapes([]); };

  const ToolBtn = ({ t, icon: Icon, lbl }: { t: Tool; icon: typeof MousePointer2; lbl: string }) => (
    <button
      type="button"
      onClick={() => setTool(t)}
      title={lbl}
      aria-label={lbl}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-md ring-1 transition-colors",
        tool === t ? "bg-primary text-primary-foreground ring-primary" : "bg-white/[0.04] text-muted-foreground ring-white/[0.06] hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] p-2 ring-1 ring-white/[0.04]">
        <ToolBtn t="select" icon={MousePointer2} lbl="Select" />
        <ToolBtn t="arrow" icon={ArrowUpRight} lbl="Arrow" />
        <ToolBtn t="line" icon={Minus} lbl="Line" />
        <ToolBtn t="rect" icon={Square} lbl="Rectangle" />
        <ToolBtn t="circle" icon={Circle} lbl="Circle" />
        <ToolBtn t="text" icon={Type} lbl="Text label" />
        <div className="mx-1 h-5 w-px bg-white/10" />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            className={cn("h-5 w-5 rounded-full ring-1 ring-white/20", color === c && "ring-2 ring-primary")}
            style={{ background: c }}
          />
        ))}
        <div className="mx-1 h-5 w-px bg-white/10" />
        <select
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Preset label"
          className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-foreground ring-1 ring-white/[0.06] focus:outline-none"
        >
          <option value="">No label</option>
          {PRESET_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        {tool === "text" && (
          <input
            value={textBuf}
            onChange={(e) => setTextBuf(e.target.value)}
            placeholder="Text (then click chart)"
            aria-label="Text content"
            className="w-40 rounded-md bg-white/[0.04] px-2 py-1 text-[11px] ring-1 ring-white/[0.06] focus:outline-none focus:ring-primary/40"
          />
        )}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={undo} title="Undo" aria-label="Undo" className="grid h-8 w-8 place-items-center rounded-md bg-white/[0.04] text-muted-foreground ring-1 ring-white/[0.06] hover:text-foreground">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={clear} title="Clear annotations" aria-label="Clear annotations" className="grid h-8 w-8 place-items-center rounded-md bg-white/[0.04] text-muted-foreground ring-1 ring-white/[0.06] hover:text-destructive">
            <Eraser className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => saveM.mutate()} disabled={saveM.isPending} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50">
            <Save className="h-3 w-3" /> Save
          </button>
        </div>
      </div>

      <div className={cn("relative overflow-hidden rounded-lg ring-1 ring-white/[0.06]", compact ? "max-h-[420px]" : "max-h-[80vh]")}>
        <img src={url} alt="Trade chart" className="block w-full select-none" draggable={false} />
        <svg
          ref={svgRef}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className={cn("absolute inset-0 h-full w-full", tool === "select" ? "cursor-default" : "cursor-crosshair")}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          <defs>
            {COLORS.map((c) => (
              <marker key={c} id={`arr-${c.replace("#","")}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {[...shapes, ...(drawing ? [drawing] : [])].map((s) => renderShape(s))}
        </svg>
      </div>
    </div>
  );
}

function renderShape(s: AnnotationShape) {
  const c = s.color || "#ef4444";
  const stroke = { stroke: c, strokeWidth: 4, fill: "none" } as const;
  const labelText = s.label ? s.label : "";
  switch (s.type) {
    case "arrow":
      return (
        <g key={s.id}>
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...stroke} markerEnd={`url(#arr-${c.replace("#","")})`} />
          {labelText && <text x={s.x2 + 6} y={s.y2 - 6} fill={c} fontSize="22" fontWeight="700">{labelText}</text>}
        </g>
      );
    case "line":
      return <line key={s.id} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...stroke} />;
    case "rect": {
      const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
      const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
      return (
        <g key={s.id}>
          <rect x={x} y={y} width={w} height={h} {...stroke} />
          {labelText && <text x={x + 4} y={y - 6} fill={c} fontSize="20" fontWeight="700">{labelText}</text>}
        </g>
      );
    }
    case "circle": {
      const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
      const rx = Math.abs(s.x2 - s.x1) / 2, ry = Math.abs(s.y2 - s.y1) / 2;
      return (
        <g key={s.id}>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...stroke} />
          {labelText && <text x={cx + rx + 4} y={cy} fill={c} fontSize="20" fontWeight="700">{labelText}</text>}
        </g>
      );
    }
    case "text":
      return (
        <text key={s.id} x={s.x1} y={s.y1} fill={c} fontSize="26" fontWeight="700" stroke="#000" strokeWidth="0.5">
          {s.text || s.label || "Label"}
        </text>
      );
  }
}
