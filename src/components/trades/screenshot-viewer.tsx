import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Point = { x: number; y: number };
type Size = { width: number; height: number };

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

export function ScreenshotViewer({
  open,
  src,
  alt,
  onClose,
}: {
  open: boolean;
  src: string | null | undefined;
  alt: string;
  onClose: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [baseSize, setBaseSize] = useState<Size>({ width: 0, height: 0 });
  const pointers = useRef(new Map<number, Point>());
  const lastPinchDistance = useRef<number | null>(null);
  const dragStart = useRef<{ pointer: Point; offset: Point } | null>(null);

  const clampOffset = useCallback(
    (next: Point, nextScale = scale): Point => {
      const viewport = viewportRef.current;
      if (!viewport || !baseSize.width || !baseSize.height) return { x: 0, y: 0 };
      const maxX = Math.max(0, (baseSize.width * nextScale - viewport.clientWidth) / 2);
      const maxY = Math.max(0, (baseSize.height * nextScale - viewport.clientHeight) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, next.x)),
        y: Math.min(maxY, Math.max(-maxY, next.y)),
      };
    },
    [baseSize, scale],
  );

  const measureImage = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;
    setBaseSize({ width: image.clientWidth, height: image.clientHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    pointers.current.clear();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, src, onClose]);

  useEffect(() => {
    if (!open) return;
    const observer = new ResizeObserver(() => {
      measureImage();
      setOffset((current) => clampOffset(current));
    });
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (imageRef.current) observer.observe(imageRef.current);
    return () => observer.disconnect();
  }, [open, measureImage, clampOffset]);

  if (!open || !src) return null;

  const pointerDistance = () => {
    const [first, second] = [...pointers.current.values()];
    return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : null;
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot viewer"
      className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-md"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="Close screenshot viewer"
        className="fixed right-4 top-4 z-[72] inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/70 px-4 py-2 text-xs font-semibold text-white/90 ring-1 ring-white/20 backdrop-blur-md transition hover:bg-black/85 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" /> Close
      </button>
      <div
        ref={viewportRef}
        className="absolute inset-4 flex touch-none select-none items-center justify-center overflow-hidden sm:inset-6"
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => {
          event.preventDefault();
          const viewport = viewportRef.current;
          if (!viewport) return;
          const rect = viewport.getBoundingClientRect();
          const point = {
            x: event.clientX - (rect.left + rect.width / 2),
            y: event.clientY - (rect.top + rect.height / 2),
          };
          const nextScale = clampScale(scale * (event.deltaY < 0 ? 1.16 : 0.86));
          const ratio = nextScale / scale;
          const nextOffset = {
            x: point.x - (point.x - offset.x) * ratio,
            y: point.y - (point.y - offset.y) * ratio,
          };
          setScale(nextScale);
          setOffset(clampOffset(nextOffset, nextScale));
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const pinchDistance = pointerDistance();
          if (pinchDistance) {
            lastPinchDistance.current = pinchDistance;
            dragStart.current = null;
          } else if (scale > 1) {
            dragStart.current = {
              pointer: { x: event.clientX, y: event.clientY },
              offset,
            };
          }
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const pinchDistance = pointerDistance();
          if (pinchDistance && lastPinchDistance.current) {
            const nextScale = clampScale(scale * (pinchDistance / lastPinchDistance.current));
            setScale(nextScale);
            setOffset((current) => clampOffset(current, nextScale));
            lastPinchDistance.current = pinchDistance;
          } else if (dragStart.current && scale > 1) {
            setOffset(
              clampOffset({
                x: dragStart.current.offset.x + event.clientX - dragStart.current.pointer.x,
                y: dragStart.current.offset.y + event.clientY - dragStart.current.pointer.y,
              }),
            );
          }
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          lastPinchDistance.current = pointerDistance();
          dragStart.current = null;
          setOffset((current) => clampOffset(current));
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          lastPinchDistance.current = pointerDistance();
          dragStart.current = null;
          setOffset((current) => clampOffset(current));
        }}
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={measureImage}
          className="max-h-full max-w-full rounded-xl object-contain will-change-transform"
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transformOrigin: "center",
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
