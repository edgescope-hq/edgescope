import { useEffect, useRef, useState } from "react";

// Premium animated background: aurora gradients + floating glass particles +
// subtle parallax with mouse tracking. Pure CSS/Canvas, no heavy deps.
// Automatically reduces effects on low-power devices and respects
// prefers-reduced-motion.

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPower =
      (navigator as any).deviceMemory && (navigator as any).deviceMemory <= 2 ||
      (navigator as any).hardwareConcurrency && (navigator as any).hardwareConcurrency <= 4 &&
        window.innerWidth < 768;
    setReduced(prefersReduced || lowPower);
  }, []);

  // Mouse parallax on aurora blobs.
  useEffect(() => {
    if (reduced) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth, h = window.innerHeight;
      tx = (e.clientX / w - 0.5) * 30;
      ty = (e.clientY / h - 0.5) * 30;
    };
    const tick = () => {
      cx += (tx - cx) * 0.035;
      cy += (ty - cy) * 0.035;
      wrap.style.setProperty("--px", `${cx}px`);
      wrap.style.setProperty("--py", `${cy}px`);
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // Floating glass particles on canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = (canvas.width = window.innerWidth * dpr);
    let h = (canvas.height = window.innerHeight * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    const count = reduced ? 15 : Math.min(45, Math.floor((window.innerWidth * window.innerHeight) / 35000));
    type P = { x: number; y: number; r: number; vx: number; vy: number; hue: number; a: number };
    const particles: P[] = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (Math.random() * 1.8 + 0.5) * dpr,
      vx: (Math.random() - 0.5) * 0.08 * dpr,
      vy: (Math.random() - 0.5) * 0.08 * dpr,
      hue: Math.random() < 0.6 ? 295 : 330,
      a: Math.random() * 0.4 + 0.2,
    }));

    const onResize = () => {
      w = canvas.width = window.innerWidth * dpr;
      h = canvas.height = window.innerHeight * dpr;
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    let last = performance.now();
    const targetFps = reduced ? 20 : 40;
    const frameMs = 1000 / targetFps;

    const render = (now: number) => {
      if (now - last < frameMs) {
        raf = requestAnimationFrame(render);
        return;
      }
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 16);
        grad.addColorStop(0, `oklch(0.78 0.22 ${p.hue} / ${p.a})`);
        grad.addColorStop(1, `oklch(0.78 0.22 ${p.hue} / 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `oklch(0.96 0.04 ${p.hue} / ${Math.min(1, p.a + 0.2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#05030a]"
    >
      {/* Deep base gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.16_0.07_295/0.5),transparent_60%),radial-gradient(ellipse_at_bottom,oklch(0.16_0.07_330/0.35),transparent_55%)]" />

      {/* Aurora blobs with parallax */}
      <div
        className="absolute -top-32 left-1/4 h-[55vmax] w-[55vmax] rounded-full opacity-50 blur-[120px] aurora-a"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, oklch(0.68 0.26 295 / 0.5), transparent 60%)",
          transform: "translate3d(var(--px,0px), var(--py,0px), 0)",
        }}
      />
      <div
        className="absolute -bottom-40 -right-20 h-[60vmax] w-[60vmax] rounded-full opacity-40 blur-[140px] aurora-b"
        style={{
          background:
            "radial-gradient(circle at 60% 60%, oklch(0.7 0.24 330 / 0.5), transparent 60%)",
          transform: "translate3d(calc(var(--px,0px) * -1), calc(var(--py,0px) * -1), 0)",
        }}
      />
      <div
        className="absolute top-1/3 -left-20 h-[40vmax] w-[40vmax] rounded-full opacity-30 blur-[110px] aurora-c"
        style={{
          background:
            "radial-gradient(circle, oklch(0.6 0.22 270 / 0.45), transparent 60%)",
          transform: "translate3d(calc(var(--px,0px) * 0.5), calc(var(--py,0px) * 0.5), 0)",
        }}
      />

      {/* Light streaks */}
      <div className="absolute inset-0 streaks" />

      {/* Fine grain noise overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* Particles */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#05030a_100%)]" />

      <style>{`
        @keyframes aurora-float-a { 0%,100% { transform: translate3d(var(--px,0px), var(--py,0px), 0) scale(1); } 50% { transform: translate3d(calc(var(--px,0px) + 15px), calc(var(--py,0px) - 25px), 0) scale(1.06); } }
        @keyframes aurora-float-b { 0%,100% { transform: translate3d(calc(var(--px,0px) * -1), calc(var(--py,0px) * -1), 0) scale(1); } 50% { transform: translate3d(calc(var(--px,0px) * -1 - 20px), calc(var(--py,0px) * -1 + 15px), 0) scale(1.04); } }
        @keyframes aurora-float-c { 0%,100% { transform: translate3d(calc(var(--px,0px) * 0.5), calc(var(--py,0px) * 0.5), 0) scale(1); } 50% { transform: translate3d(calc(var(--px,0px) * 0.5 + 12px), calc(var(--py,0px) * 0.5 + 20px), 0) scale(1.08); } }
        .aurora-a { animation: aurora-float-a 20s ease-in-out infinite; }
        .aurora-b { animation: aurora-float-b 24s ease-in-out infinite; }
        .aurora-c { animation: aurora-float-c 28s ease-in-out infinite; }
        .streaks {
          background:
            linear-gradient(115deg, transparent 40%, oklch(0.85 0.15 295 / 0.04) 50%, transparent 60%),
            linear-gradient(95deg, transparent 45%, oklch(0.85 0.15 330 / 0.03) 55%, transparent 65%);
          background-size: 200% 200%, 220% 220%;
          animation: streak-move 28s linear infinite;
        }
        @keyframes streak-move {
          0% { background-position: 0% 0%, 100% 0%; }
          100% { background-position: 200% 0%, -100% 0%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .aurora-a, .aurora-b, .aurora-c, .streaks { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
