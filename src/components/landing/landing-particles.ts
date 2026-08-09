import type { ParticleTimelineState } from "./landing-timeline";

export type ParticleSeed = {
  x: number;
  y: number;
  depth: number;
  phase: number;
  curve: number;
  current: number;
  family: number;
};

export const LANDING_PARTICLE_LIMITS = {
  seeded: 50,
  desktop: 48,
  compact: 27,
} as const;

function fract(value: number) {
  return value - Math.floor(value);
}

function seeded(index: number, salt: number) {
  return fract(Math.sin(index * 91.731 + salt * 17.113) * 43758.5453);
}

export function createLandingParticleSeeds(count = LANDING_PARTICLE_LIMITS.seeded): ParticleSeed[] {
  const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return Array.from({ length: normalizedCount }, (_, index) => ({
    x: seeded(index, 1),
    y: seeded(index, 2),
    depth: 0.12 + seeded(index, 3) * 0.88,
    phase: seeded(index, 4) * Math.PI * 2,
    curve: seeded(index, 5) * 2 - 1,
    current: seeded(index, 6) * 2 - 1,
    family: Math.floor(seeded(index, 7) * 4),
  }));
}

export function getParticleDepthTravel(depth: number) {
  const normalizedDepth = Number.isFinite(depth) ? Math.min(1, Math.max(0, depth)) : 0;
  return 0.18 + normalizedDepth * 0.92;
}

export function getLandingParticleRenderCount(density: number, compact: boolean) {
  const maximum = compact ? LANDING_PARTICLE_LIMITS.compact : LANDING_PARTICLE_LIMITS.desktop;
  const normalizedDensity = Number.isFinite(density) ? Math.min(1, Math.max(0, density)) : 0;
  return Math.min(maximum, Math.max(8, Math.round(maximum * normalizedDensity)));
}

const PARTICLES = createLandingParticleSeeds();

const COLORS = {
  neutral: [232, 236, 242],
  violet: [158, 120, 235],
  cyan: [96, 196, 220],
  warm: [232, 170, 104],
} as const;

function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function particleColor(seed: ParticleSeed, state: ParticleTimelineState) {
  const neutral = COLORS.neutral;
  const coolTarget = seed.family % 2 === 0 ? COLORS.cyan : COLORS.violet;
  const coolAmount = Math.min(1, state.color * (0.42 + seed.depth * 0.58));
  const warmAmount = state.warmth * (seed.family === 3 ? 1 : 0.24);

  return [
    mix(mix(neutral[0], coolTarget[0], coolAmount), COLORS.warm[0], warmAmount),
    mix(mix(neutral[1], coolTarget[1], coolAmount), COLORS.warm[1], warmAmount),
    mix(mix(neutral[2], coolTarget[2], coolAmount), COLORS.warm[2], warmAmount),
  ];
}

export type ParticleRenderOptions = {
  compact: boolean;
  height: number;
  reduced: boolean;
  idleTime: number;
  state: ParticleTimelineState;
  width: number;
};

export function drawLandingParticles(canvas: HTMLCanvasElement, options: ParticleRenderOptions) {
  const width = options.width;
  const height = options.height;
  if (width <= 0 || height <= 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, options.compact ? 1.25 : 1.5);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const visibleCount = getLandingParticleRenderCount(options.state.density, options.compact);
  const idle = options.reduced ? 0 : options.idleTime * 0.00016;

  for (let index = 0; index < visibleCount; index += 1) {
    const seed = PARTICLES[index];
    const depthTravel = getParticleDepthTravel(seed.depth);
    const rise = options.state.rise * depthTravel;
    const normalizedY = fract(seed.y - rise + 1.5);
    const bend =
      Math.sin(options.state.rise * 2.1 + seed.phase) *
      seed.curve *
      options.state.current *
      (0.018 + seed.depth * 0.038);
    const structurePull =
      Math.sin(normalizedY * Math.PI) * seed.current * options.state.attraction * 0.075;
    const idleDrift = Math.sin(idle * (0.7 + seed.depth) + seed.phase) * 0.006 * seed.depth;
    const normalizedX = seed.x + bend + structurePull + idleDrift;
    const x = normalizedX * width;
    const y = normalizedY * height;
    const radius = 0.45 + seed.depth * (options.compact ? 1.45 : 2.15);
    const alpha = (0.12 + seed.depth * 0.66) * options.state.opacity;
    const [red, green, blue] = particleColor(seed, options.state);

    context.beginPath();
    context.fillStyle = `rgba(${red.toFixed(0)}, ${green.toFixed(0)}, ${blue.toFixed(0)}, ${alpha.toFixed(3)})`;
    if (seed.depth > 0.7) {
      context.shadowBlur = 5 + seed.depth * 7;
      context.shadowColor = `rgba(${red.toFixed(0)}, ${green.toFixed(0)}, ${blue.toFixed(0)}, ${(alpha * 0.72).toFixed(3)})`;
    } else {
      context.shadowBlur = 0;
    }
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    if (seed.depth > 0.86 && options.state.streak > 0.05) {
      context.beginPath();
      context.lineWidth = Math.max(0.45, radius * 0.38);
      context.strokeStyle = `rgba(${red.toFixed(0)}, ${green.toFixed(0)}, ${blue.toFixed(0)}, ${(alpha * options.state.streak * 0.48).toFixed(3)})`;
      context.moveTo(x, y + radius * 2);
      context.lineTo(x + bend * width * 0.12, y + radius * (8 + options.state.streak * 9));
      context.stroke();
    }
  }

  context.shadowBlur = 0;
}
