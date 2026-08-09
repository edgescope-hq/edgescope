export const LANDING_SEGMENTS = {
  phase1: [0, 0.13],
  transition1: [0.13, 0.25],
  phase2: [0.25, 0.37],
  transition2: [0.37, 0.48],
  phase3: [0.48, 0.74],
  transition3: [0.74, 0.87],
  phase4: [0.87, 1],
} as const;

export type LandingStage = keyof typeof LANDING_SEGMENTS;

export type StageProgress = Record<LandingStage, number>;

export type SpatialState = {
  opacity: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
};

export type ObjectPieceState = {
  x: number;
  y: number;
  z: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
};

export type ObjectTimelineState = SpatialState & {
  faceOpacity: number;
  reliefOpacity: number;
  rimOpacity: number;
  channel: number;
  violet: number;
  cyan: number;
  warmth: number;
  shadow: number;
  influence: number;
  landscapeOffset: number;
  left: ObjectPieceState;
  right: ObjectPieceState;
};

export type CopyTimelineState = SpatialState & {
  clip: number;
};

export type WorldTimelineState = {
  whiteOpacity: number;
  whiteDepth: number;
  darkAtmosphere: number;
  farY: number;
  farX: number;
  middleY: number;
  middleX: number;
  nearY: number;
  violet: number;
  cyan: number;
  warmth: number;
  structureDensity: number;
  vignette: number;
};

export type ParticleTimelineState = {
  opacity: number;
  density: number;
  rise: number;
  current: number;
  attraction: number;
  color: number;
  warmth: number;
  streak: number;
};

export type StructureTimelineState = SpatialState & {
  separation: number;
  rearOpacity: number;
  frontOpacity: number;
  peripheralOpacity: number;
  glow: number;
  cyan: number;
  violet: number;
  warmth: number;
  nodeTravel: number;
};

export type EvidenceCardState = SpatialState & {
  progress: number;
  blur: number;
  brightness: number;
  saturation: number;
  clarity: number;
  focal: boolean;
  occlusion: "behind" | "front";
};

export type ReleaseTimelineState = {
  opacity: number;
  foregroundX: number;
  foregroundY: number;
  foregroundZ: number;
  foregroundRotation: number;
  beam: number;
  flare: number;
  clear: number;
};

export type LandingTimelineState = {
  progress: number;
  activeStage: LandingStage;
  stages: StageProgress;
  hero: CopyTimelineState;
  thesis: CopyTimelineState;
  finalCopy: CopyTimelineState;
  object: ObjectTimelineState;
  world: WorldTimelineState;
  particles: ParticleTimelineState;
  structure: StructureTimelineState;
  release: ReleaseTimelineState;
  cards: readonly EvidenceCardState[];
  headerOpacity: number;
  scrollCueOpacity: number;
};

type Point3 = { x: number; y: number; z: number };

export function clamp01(value: number) {
  if (!Number.isFinite(value)) return value === Number.POSITIVE_INFINITY ? 1 : 0;
  return Math.min(1, Math.max(0, value));
}

export type LandingMotionPolicy = {
  staticExperience: boolean;
  idleParticles: boolean;
  foregroundRush: boolean;
};

export function getLandingMotionPolicy(
  reducedMotion: boolean,
  saveData: boolean,
): LandingMotionPolicy {
  const constrained = reducedMotion || saveData;
  return {
    staticExperience: constrained,
    idleParticles: !constrained,
    foregroundRush: !constrained,
  };
}

function range(value: number, start: number, end: number) {
  if (start === end) return value >= end ? 1 : 0;
  return clamp01((value - start) / (end - start));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function smootherstep(value: number) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function smooth(value: number, start: number, end: number) {
  return smoothstep(range(value, start, end));
}

function smoother(value: number, start: number, end: number) {
  return smootherstep(range(value, start, end));
}

function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function mapPoints(value: number, points: ReadonlyArray<readonly [number, number]>) {
  if (value <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (value <= next[0]) {
      return mix(previous[1], next[1], smoother(value, previous[0], next[0]));
    }
  }
  return points[points.length - 1][1];
}

function windowOpacity(
  value: number,
  enterStart: number,
  enterEnd: number,
  exitStart: number,
  exitEnd: number,
) {
  return smooth(value, enterStart, enterEnd) * (1 - smooth(value, exitStart, exitEnd));
}

function cubic(from: number, controlA: number, controlB: number, to: number, amount: number) {
  const inverse = 1 - amount;
  return (
    inverse * inverse * inverse * from +
    3 * inverse * inverse * amount * controlA +
    3 * inverse * amount * amount * controlB +
    amount * amount * amount * to
  );
}

function cubicPoint(from: Point3, controlA: Point3, controlB: Point3, to: Point3, amount: number) {
  return {
    x: cubic(from.x, controlA.x, controlB.x, to.x, amount),
    y: cubic(from.y, controlA.y, controlB.y, to.y, amount),
    z: cubic(from.z, controlA.z, controlB.z, to.z, amount),
  };
}

function getStageProgress(progress: number): StageProgress {
  return Object.fromEntries(
    Object.entries(LANDING_SEGMENTS).map(([stage, [start, end]]) => [
      stage,
      range(progress, start, end),
    ]),
  ) as StageProgress;
}

export function getActiveLandingStage(progress: number): LandingStage {
  const clamped = clamp01(progress);
  const entries = Object.entries(LANDING_SEGMENTS) as Array<
    [LandingStage, readonly [number, number]]
  >;
  return (
    entries.find(([, [start, end]], index) => {
      const isLast = index === entries.length - 1;
      return clamped >= start && (clamped < end || (isLast && clamped <= end));
    })?.[0] ?? "phase4"
  );
}

function objectPiece(
  x: number,
  y: number,
  z: number,
  rotateX: number,
  rotateY: number,
  rotateZ: number,
): ObjectPieceState {
  return { x, y, z, rotateX, rotateY, rotateZ };
}

function resolveObject(
  progress: number,
  stages: StageProgress,
  compact: boolean,
): ObjectTimelineState {
  const t1 = stages.transition1;
  const t2 = stages.transition2;
  const t3 = stages.transition3;
  const p1 = stages.phase1;
  const p2 = stages.phase2;
  const p4 = stages.phase4;
  const phase4Arrival = smooth(t3, 0.52, 0.9);

  let x = mix(compact ? 13 : 22, compact ? 10 : 18, smootherstep(p1));
  let y = mix(compact ? 18 : 3, compact ? 14 : -1, smootherstep(p1));
  let z = mix(-30, 70, smootherstep(p1));
  let scale = mix(compact ? 0.66 : 0.82, compact ? 0.64 : 0.78, smootherstep(p1));
  let rotateX = mix(2.5, -1.5, smootherstep(p1));
  let rotateY = mix(-3, 2, smootherstep(p1));
  let rotateZ = mix(-1.3, 0.5, smootherstep(p1));
  let opacity = 1;
  let faceOpacity = 1;
  let reliefOpacity = 0.04;
  let rimOpacity = 0.88;
  let channel = 0.82;
  let violet = 0.82;
  let cyan = 0.58;
  let warmth = 0;
  let shadow = 0.72;
  let influence = 0.9;
  let landscapeOffset = 0;
  let left = objectPiece(-17, 17, 42, 2.2, -9, -2.1);
  let right = objectPiece(15, -11, -34, -1.4, 8, 1.4);

  if (progress >= LANDING_SEGMENTS.transition1[0]) {
    x = mapPoints(t1, [
      [0, compact ? 10 : 18],
      [0.4, compact ? 4 : 7],
      [1, compact ? -2 : -11],
    ]);
    y = mapPoints(t1, [
      [0, compact ? 14 : -1],
      [0.42, compact ? 2 : -4],
      [1, compact ? -8 : -3],
    ]);
    z = mapPoints(t1, [
      [0, 70],
      [0.42, 150],
      [1, -35],
    ]);
    scale = mapPoints(t1, [
      [0, compact ? 0.64 : 0.78],
      [0.45, compact ? 0.61 : 0.72],
      [1, compact ? 0.54 : 0.57],
    ]);
    rotateX = mix(-1.5, 0, smoother(t1, 0.35, 0.92));
    rotateY = mix(2, 0, smoother(t1, 0.28, 0.9));
    rotateZ = mix(0.5, 0, smoother(t1, 0.35, 0.9));
    faceOpacity = 1 - smooth(t1, 0.5, 0.94) * 0.96;
    reliefOpacity = smooth(t1, 0.42, 0.92);
    rimOpacity = mix(0.88, 0.48, smootherstep(t1));
    channel = mix(0.82, 0.3, smootherstep(t1));
    violet = mix(0.82, 0.08, smoother(t1, 0.2, 0.96));
    cyan = mix(0.58, 0.12, smoother(t1, 0.25, 1));
    shadow = mix(0.72, 0.24, smootherstep(t1));
    influence = mix(0.9, 0.28, smootherstep(t1));
    left = objectPiece(
      mapPoints(t1, [
        [0, -17],
        [0.36, -36],
        [0.82, -6],
        [1, -4],
      ]),
      mapPoints(t1, [
        [0, 17],
        [0.36, 26],
        [1, 0],
      ]),
      mapPoints(t1, [
        [0, 42],
        [0.36, 126],
        [1, 0],
      ]),
      mix(2.2, 0, smoother(t1, 0.52, 1)),
      mapPoints(t1, [
        [0, -9],
        [0.36, -17],
        [1, 0],
      ]),
      mix(-2.1, 0, smoother(t1, 0.5, 1)),
    );
    right = objectPiece(
      mapPoints(t1, [
        [0, 15],
        [0.36, 38],
        [0.82, 6],
        [1, 4],
      ]),
      mapPoints(t1, [
        [0, -11],
        [0.36, -24],
        [1, 0],
      ]),
      mapPoints(t1, [
        [0, -34],
        [0.36, -112],
        [1, 0],
      ]),
      mix(-1.4, 0, smoother(t1, 0.52, 1)),
      mapPoints(t1, [
        [0, 8],
        [0.36, 15],
        [1, 0],
      ]),
      mix(1.4, 0, smoother(t1, 0.5, 1)),
    );
  }

  if (progress >= LANDING_SEGMENTS.phase2[0]) {
    x = compact ? -2 : -11;
    y = compact ? -8 : -3;
    z = -35 + p2 * 22;
    scale = compact ? 0.54 : 0.57;
    rotateX = mix(0, -1.2, smootherstep(p2));
    rotateY = mix(0, 2, smootherstep(p2));
    faceOpacity = mix(0.04, 0.035, smootherstep(p2));
    reliefOpacity = 1;
    rimOpacity = mix(0.48, 0.36, smootherstep(p2));
    channel = mix(0.3, 0.16, smootherstep(p2));
    violet = mix(0.08, 0.035, smootherstep(p2));
    cyan = mix(0.12, 0.055, smootherstep(p2));
    shadow = 0.24;
    influence = mix(0.28, 0.16, smootherstep(p2));
    left = objectPiece(-4, 0, mix(0, 3, smootherstep(p2)), 0, mix(0, -1, smootherstep(p2)), 0);
    right = objectPiece(4, 0, mix(0, -3, smootherstep(p2)), 0, mix(0, 1, smootherstep(p2)), 0);
  }

  if (progress >= LANDING_SEGMENTS.transition2[0]) {
    x = mix(compact ? -2 : -11, 0, smootherstep(t2));
    y = mix(compact ? -8 : -3, -14, smootherstep(t2));
    z = mix(-13, -220, smootherstep(t2));
    scale = mix(compact ? 0.54 : 0.57, 0.68, smootherstep(t2));
    opacity = 1 - smooth(t2, 0.14, 0.9);
    reliefOpacity = 1 - smooth(t2, 0.08, 0.84);
    rimOpacity = 0.36 * (1 - smooth(t2, 0.52, 1));
    channel = mix(0.16, 0.72, smooth(t2, 0.05, 0.58)) * (1 - smooth(t2, 0.7, 1));
    violet = mix(0.035, 0.58, smooth(t2, 0.16, 0.72));
    cyan = mix(0.055, 0.42, smooth(t2, 0.2, 0.78));
    shadow = 0.24 * (1 - smooth(t2, 0.44, 0.95));
    influence = mix(0.16, 1, smooth(t2, 0.08, 0.58)) * (1 - smooth(t2, 0.72, 1));
    left = objectPiece(mix(-4, -12, t2), mix(0, -44, t2), mix(3, -90, t2), 0, mix(-1, -6, t2), 0);
    right = objectPiece(mix(4, 12, t2), mix(0, 44, t2), mix(-3, 70, t2), 0, mix(1, 6, t2), 0);
  }

  if (progress >= LANDING_SEGMENTS.phase3[0]) {
    opacity = 0;
    influence = 0;
  }

  if (progress >= LANDING_SEGMENTS.transition3[0]) {
    x = compact ? 0 : -21;
    y = mix(compact ? -40 : -48, compact ? -7 : 2, phase4Arrival);
    z = mix(-720, 55, phase4Arrival);
    scale = mix(compact ? 0.47 : 0.54, compact ? 0.66 : 0.76, phase4Arrival);
    rotateX = mix(10, 0.5, phase4Arrival);
    rotateY = mix(-18, -1.5, phase4Arrival);
    rotateZ = mix(4, 0, phase4Arrival);
    opacity = smooth(t3, 0.72, 0.9);
    faceOpacity = smooth(t3, 0.72, 0.92) * 0.94;
    reliefOpacity =
      smooth(t3, 0.7, 0.86) * (1 - smooth(t3, 0.88, 1)) * 0.42 + smooth(t3, 0.9, 1) * 0.05;
    rimOpacity = smooth(t3, 0.72, 0.94) * 0.84;
    channel = smooth(t3, 0.7, 0.9) * 0.42;
    violet = smooth(t3, 0.72, 0.9) * 0.3;
    cyan = smooth(t3, 0.72, 0.94) * 0.68;
    warmth = windowOpacity(t3, 0.48, 0.68, 0.84, 0.94) * 0.28 + smooth(t3, 0.9, 1) * 0.18;
    shadow = smooth(t3, 0.74, 0.96) * 0.62;
    influence = smooth(t3, 0.7, 0.94) * 0.62;
    landscapeOffset = mix(0, -21, phase4Arrival);
    left = objectPiece(
      mix(-42, -8, phase4Arrival),
      mix(24, 3, phase4Arrival),
      mix(120, 18, phase4Arrival),
      mix(5, 0.5, phase4Arrival),
      mix(-18, -2.5, phase4Arrival),
      mix(-4, -0.5, phase4Arrival),
    );
    right = objectPiece(
      mix(45, 8, phase4Arrival),
      mix(-27, -3, phase4Arrival),
      mix(-130, -18, phase4Arrival),
      mix(-4, -0.5, phase4Arrival),
      mix(17, 2.5, phase4Arrival),
      mix(3.5, 0.5, phase4Arrival),
    );
  }

  if (progress >= LANDING_SEGMENTS.phase4[0]) {
    x = compact ? 0 : -21;
    y = mix(compact ? -7 : 2, compact ? -9 : 0, smootherstep(p4));
    z = mix(55, 72, smootherstep(p4));
    scale = compact ? 0.66 : 0.76;
    rotateX = mix(0.5, 0, smootherstep(p4));
    rotateY = mix(-1.5, 0.5, smootherstep(p4));
    rotateZ = 0;
    opacity = 1;
    faceOpacity = 0.94;
    reliefOpacity = 0.05;
    rimOpacity = 0.84;
    channel = mix(0.42, 0.32, smootherstep(p4));
    violet = mix(0.3, 0.2, smootherstep(p4));
    cyan = mix(0.68, 0.55, smootherstep(p4));
    warmth = mix(0.18, 0.1, smootherstep(p4));
    shadow = 0.62;
    influence = 0.62;
    landscapeOffset = -21;
    left = objectPiece(-8, 3, 18, 0.5, -2.5, -0.5);
    right = objectPiece(8, -3, -18, -0.5, 2.5, 0.5);
  }

  return {
    opacity,
    x,
    y,
    z,
    scale,
    rotateX,
    rotateY,
    rotateZ,
    faceOpacity,
    reliefOpacity,
    rimOpacity,
    channel,
    violet,
    cyan,
    warmth,
    shadow,
    influence,
    landscapeOffset,
    left,
    right,
  };
}

function resolveHero(stages: StageProgress): CopyTimelineState {
  const exit = stages.transition1;
  return {
    opacity: 1 - smooth(exit, 0.58, 0.94),
    x: mix(0, -8, smootherstep(exit)),
    y: mix(0, -9, smootherstep(exit)),
    z: mix(0, -340, smootherstep(exit)),
    scale: mix(1, 0.92, smootherstep(exit)),
    rotateX: mix(0, 4, smootherstep(exit)),
    rotateY: mix(0, -8, smootherstep(exit)),
    rotateZ: 0,
    clip: smooth(exit, 0.44, 0.9),
  };
}

function resolveThesis(stages: StageProgress): CopyTimelineState {
  const enter = stages.transition1;
  const phase2 = stages.phase2;
  const exit = stages.transition2;
  const entrance = smooth(enter, 0.68, 0.96);
  const departure = smooth(exit, 0.12, 0.84);
  return {
    opacity: entrance * (1 - smooth(exit, 0.62, 0.98)),
    x: mix(4, 0, entrance) + mix(0, -10, departure),
    y: mix(7, 0, entrance) + mix(0, -8, departure),
    z: mix(-170, 0, entrance) + mix(0, -360, departure),
    scale: mix(0.94, 1, entrance) * mix(1, 0.92, departure),
    rotateX: mix(-4, 0, entrance) + mix(0, 5, departure),
    rotateY: mix(5, 0, entrance) + mix(0, -7, departure),
    rotateZ: 0,
    clip: departure * (0.84 + phase2 * 0.16),
  };
}

function resolveFinalCopy(stages: StageProgress): CopyTimelineState {
  const enter = smooth(stages.phase4, 0.16, 0.58);
  return {
    opacity: enter,
    x: mix(8, 0, enter),
    y: mix(7, 0, enter),
    z: mix(-190, 0, enter),
    scale: mix(0.96, 1, enter),
    rotateX: mix(3, 0, enter),
    rotateY: mix(-5, 0, enter),
    rotateZ: 0,
    clip: 1 - enter,
  };
}

function resolveWorld(progress: number, stages: StageProgress): WorldTimelineState {
  const t1 = stages.transition1;
  const t2 = stages.transition2;
  const p3 = stages.phase3;
  const t3 = stages.transition3;
  const whiteIn = smooth(t1, 0.25, 0.9);
  const whiteOut = smooth(t2, 0.16, 0.93);
  const evidenceDensity = smooth(t2, 0.08, 0.8) * (1 - smooth(t3, 0.22, 0.88));
  const releaseWarm = windowOpacity(t3, 0.2, 0.5, 0.72, 0.98);
  return {
    whiteOpacity: whiteIn * (1 - whiteOut),
    whiteDepth: whiteIn * (1 - smooth(t2, 0.28, 0.9)),
    darkAtmosphere: 1 - whiteIn * (1 - whiteOut) * 0.96,
    farY: -progress * 13,
    farX: mix(0, -3.5, p3) + mix(0, 2.5, t3),
    middleY: -progress * 26 + evidenceDensity * -3,
    middleX: mix(0, 4.5, p3) + mix(0, -8, t3),
    nearY: -progress * 44 + t3 * -8,
    violet: mix(0.22, 0.04, whiteIn) + evidenceDensity * 0.32,
    cyan: mix(0.36, 0.04, whiteIn) + evidenceDensity * 0.42,
    warmth: releaseWarm * 0.82 + stages.phase4 * 0.1,
    structureDensity: evidenceDensity,
    vignette: mix(0.72, 0.12, whiteIn * (1 - whiteOut)) + t3 * 0.08,
  };
}

function resolveParticles(
  progress: number,
  stages: StageProgress,
  compact: boolean,
): ParticleTimelineState {
  const t1 = stages.transition1;
  const t2 = stages.transition2;
  const p3 = stages.phase3;
  const t3 = stages.transition3;
  const p4 = stages.phase4;
  const whiteSparse = smooth(t1, 0.4, 1) * (1 - smooth(t2, 0, 0.56));
  const evidence = smooth(t2, 0.08, 0.76) * (1 - smooth(t3, 0.52, 1));
  const release = windowOpacity(t3, 0.08, 0.38, 0.72, 1);
  const phase4Calm = smootherstep(p4);
  const baseOpacity = clamp01(mix(0.82, 0.46, whiteSparse) + release * 0.2);
  const baseDensity = Math.min(1, mix(0.72, 0.34, whiteSparse) + evidence * 0.38 + release * 0.26);
  const baseCurrent = 0.22 + t1 * 0.34 + evidence * 0.42 + release * 0.42;
  const baseAttraction = t1 * 0.56 + t2 * 0.46 + p3 * (1 - t3) * 0.35 + release * 0.66;
  const baseStreak = t1 * (1 - whiteSparse) * 0.46 + evidence * 0.24 + release * 0.84;
  return {
    opacity: mix(baseOpacity, 0.42, phase4Calm),
    density: mix(baseDensity, 0.3, phase4Calm),
    rise: progress * (compact ? 2.45 : 3.25),
    current: mix(baseCurrent, 0.12, phase4Calm),
    attraction: mix(baseAttraction, 0.08, phase4Calm),
    color: (1 - whiteSparse) * (0.42 + evidence * 0.42) + p4 * 0.18,
    warmth: release * 0.78 + p4 * 0.12,
    streak: mix(baseStreak, 0.04, phase4Calm),
  };
}

function resolveStructure(stages: StageProgress): StructureTimelineState {
  const t2 = stages.transition2;
  const p3 = stages.phase3;
  const t3 = stages.transition3;
  const entrance = smooth(t2, 0.14, 0.78);
  const departure = smooth(t3, 0.18, 0.9);
  const opacity = entrance * (1 - smooth(t3, 0.42, 0.7));
  return {
    opacity,
    x: mix(0, Math.sin(p3 * Math.PI * 1.2) * 2.3, p3) + mix(0, -5, t3),
    y: mix(18, 0, entrance) + mix(0, -18, t3),
    z: mix(-520, -45, entrance) + mix(0, -210, departure),
    scale: mix(0.82, 1, entrance) * mix(1, 0.9, departure),
    rotateX: mix(8, 0, entrance) + mix(0, -5, departure),
    rotateY: mix(-9, 0, entrance) + Math.sin(p3 * Math.PI) * 2.4,
    rotateZ: mix(-2, 0, entrance) + mix(0, 1.4, departure),
    separation: mix(94, 14, entrance) + p3 * 8 + mix(0, 74, departure),
    rearOpacity: opacity * (0.62 + p3 * 0.22),
    frontOpacity: opacity * (0.74 + p3 * 0.2),
    peripheralOpacity: entrance * (1 - smooth(t3, 0.12, 0.62)),
    glow: entrance * (0.48 + p3 * 0.4) + windowOpacity(t3, 0.08, 0.44, 0.74, 1) * 0.62,
    cyan: entrance * (0.45 + p3 * 0.2) * (1 - t3 * 0.6),
    violet: entrance * (0.48 + p3 * 0.28) * (1 - t3 * 0.45),
    warmth: windowOpacity(t3, 0.18, 0.5, 0.76, 1) * 0.72,
    nodeTravel: p3 * 1.8 + t3 * 0.9,
  };
}

const DESKTOP_CARD_WINDOWS = [
  [0.42, 0.6],
  [0.49, 0.67],
  [0.56, 0.74],
  [0.63, 0.81],
] as const;

const COMPACT_CARD_WINDOWS = [
  [0.45, 0.57],
  [0.51, 0.63],
  [0.57, 0.69],
  [0.63, 0.75],
] as const;

export function getEvidenceCardState(
  inputProgress: number,
  index: number,
  compact = false,
): EvidenceCardState {
  const progress = clamp01(inputProgress);
  const cardWindow = (compact ? COMPACT_CARD_WINDOWS : DESKTOP_CARD_WINDOWS)[index];
  if (!cardWindow) {
    return {
      progress: 0,
      opacity: 0,
      x: 0,
      y: 42,
      z: -720,
      scale: 0.9,
      rotateX: 7,
      rotateY: 72,
      rotateZ: 0,
      blur: 3,
      brightness: 0.68,
      saturation: 0.7,
      clarity: 0,
      focal: false,
      occlusion: "behind",
    };
  }

  const local = range(progress, cardWindow[0], cardWindow[1]);
  const side = index % 2 === 0 ? 1 : -1;
  const xScale = compact ? 0.48 : 1;
  const yScale = compact ? 0.83 : 1;
  const zScale = compact ? 0.72 : 1;
  const focalPoint = { x: -side * 8 * xScale, y: -2 * yScale, z: 180 * zScale };
  let point: Point3;

  if (local <= 0.58) {
    point = cubicPoint(
      { x: side * 48 * xScale, y: 42 * yScale, z: -720 * zScale },
      { x: side * 39 * xScale, y: 34 * yScale, z: -620 * zScale },
      { x: side * 16 * xScale, y: 8 * yScale, z: -70 * zScale },
      focalPoint,
      smootherstep(local / 0.58),
    );
  } else {
    point = cubicPoint(
      focalPoint,
      { x: -side * 17 * xScale, y: -13 * yScale, z: 130 * zScale },
      { x: -side * 34 * xScale, y: -36 * yScale, z: -250 * zScale },
      { x: -side * 44 * xScale, y: -58 * yScale, z: -640 * zScale },
      smootherstep((local - 0.58) / 0.42),
    );
  }

  const clarity = windowOpacity(local, 0.25, 0.48, 0.7, 0.88);
  const visibility = windowOpacity(local, 0, 0.11, 0.88, 1);
  const yaw = mapPoints(local, [
    [0, side * -76],
    [0.3, side * -34],
    [0.52, side * -7],
    [0.61, side * 4],
    [0.8, side * 34],
    [1, side * 72],
  ]);

  return {
    progress: local,
    opacity: visibility * (0.2 + clarity * 0.8),
    x: point.x,
    y: point.y,
    z: point.z,
    scale: 0.9 + clarity * 0.08,
    rotateX: mix(7, -5, smootherstep(local)),
    rotateY: yaw,
    rotateZ:
      side *
      mapPoints(local, [
        [0, 3.8],
        [0.55, -1.2],
        [1, -4.5],
      ]),
    blur: (1 - clarity) * (compact ? 2.1 : 2.8),
    brightness: 0.68 + clarity * 0.42,
    saturation: 0.72 + clarity * 0.32,
    clarity,
    focal: clarity > 0.82,
    occlusion: point.z >= 0 ? "front" : "behind",
  };
}

function resolveRelease(stages: StageProgress): ReleaseTimelineState {
  const t3 = stages.transition3;
  return {
    opacity: windowOpacity(t3, 0.08, 0.26, 0.52, 0.7),
    foregroundX: mapPoints(t3, [
      [0, 78],
      [0.28, 34],
      [0.56, -18],
      [1, -86],
    ]),
    foregroundY: mapPoints(t3, [
      [0, 18],
      [0.4, 6],
      [0.72, -11],
      [1, -18],
    ]),
    foregroundZ: mapPoints(t3, [
      [0, -160],
      [0.33, 380],
      [0.62, 520],
      [1, -220],
    ]),
    foregroundRotation: mapPoints(t3, [
      [0, -18],
      [0.42, -5],
      [0.72, 10],
      [1, 18],
    ]),
    beam: windowOpacity(t3, 0.08, 0.38, 0.7, 1),
    flare: windowOpacity(t3, 0.25, 0.52, 0.68, 0.94),
    clear: smooth(t3, 0.18, 0.88),
  };
}

export function getLandingTimelineState(
  inputProgress: number,
  compact = false,
): LandingTimelineState {
  const progress = clamp01(inputProgress);
  const stages = getStageProgress(progress);
  const evidenceVisibility =
    smooth(stages.transition2, 0.12, 0.76) * (1 - smooth(stages.transition3, 0.66, 1));

  return {
    progress,
    activeStage: getActiveLandingStage(progress),
    stages,
    hero: resolveHero(stages),
    thesis: resolveThesis(stages),
    finalCopy: resolveFinalCopy(stages),
    object: resolveObject(progress, stages, compact),
    world: resolveWorld(progress, stages),
    particles: resolveParticles(progress, stages, compact),
    structure: resolveStructure(stages),
    release: resolveRelease(stages),
    cards: [0, 1, 2, 3].map((index) => getEvidenceCardState(progress, index, compact)),
    headerOpacity: 1 - evidenceVisibility * 0.36,
    scrollCueOpacity: 1 - smooth(progress, 0.012, 0.045),
  };
}
