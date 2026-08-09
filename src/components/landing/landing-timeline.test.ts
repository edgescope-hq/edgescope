import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LANDING_SEGMENTS,
  getActiveLandingStage,
  getEvidenceCardState,
  getLandingMotionPolicy,
  getLandingTimelineState,
} from "./landing-timeline.ts";
import {
  LANDING_PARTICLE_LIMITS,
  createLandingParticleSeeds,
  getLandingParticleRenderCount,
  getParticleDepthTravel,
} from "./landing-particles.ts";

function numericValues(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numericValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(numericValues);
  return [];
}

describe("landing timeline architecture", () => {
  it("owns the complete journey with seven contiguous ordered stages", () => {
    const entries = Object.entries(LANDING_SEGMENTS);
    assert.equal(entries.length, 7);
    assert.equal(entries[0][1][0], 0);
    assert.equal(entries.at(-1)?.[1][1], 1);

    entries.forEach(([, [start, end]], index) => {
      assert.ok(end > start);
      if (index > 0) assert.equal(start, entries[index - 1][1][1]);
    });

    for (let step = 0; step <= 1000; step += 1) {
      const progress = step / 1000;
      const expected = entries.find(([, [start, end]], index) => {
        const last = index === entries.length - 1;
        return progress >= start && (progress < end || (last && progress <= end));
      })?.[0];
      assert.equal(getActiveLandingStage(progress), expected);
    }

    entries.forEach(([stage, [start]]) => assert.equal(getActiveLandingStage(start), stage));
  });

  it("is finite, clamped, deterministic, and reconstructs on reverse", () => {
    for (let step = -20; step <= 120; step += 1) {
      const input = step / 100;
      const first = getLandingTimelineState(input);
      getLandingTimelineState(0.97);
      const reverse = getLandingTimelineState(input);
      assert.deepEqual(reverse, first);
      assert.ok(first.progress >= 0 && first.progress <= 1);
      numericValues(first).forEach((value) => assert.ok(Number.isFinite(value)));
    }

    [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY].forEach((input) => {
      [false, true].forEach((compact) => {
        const state = getLandingTimelineState(input, compact);
        assert.ok(state.progress >= 0 && state.progress <= 1);
        numericValues(state).forEach((value) => assert.ok(Number.isFinite(value)));
      });
    });
  });

  it("keeps stage-local progress monotone", () => {
    const stageNames = Object.keys(LANDING_SEGMENTS) as Array<keyof typeof LANDING_SEGMENTS>;
    const previous = Object.fromEntries(stageNames.map((stage) => [stage, 0])) as Record<
      keyof typeof LANDING_SEGMENTS,
      number
    >;

    for (let step = 0; step <= 1000; step += 1) {
      const state = getLandingTimelineState(step / 1000);
      stageNames.forEach((stage) => {
        assert.ok(state.stages[stage] >= previous[stage]);
        previous[stage] = state.stages[stage];
      });
    }
  });

  it("distills and later resolves the same object system", () => {
    const unresolved = getLandingTimelineState(0);
    const distilled = getLandingTimelineState(0.31);
    const resolved = getLandingTimelineState(0.95);

    assert.ok(unresolved.object.faceOpacity > 0.9);
    assert.ok(Math.abs(unresolved.object.left.z - unresolved.object.right.z) > 50);
    assert.ok(distilled.world.whiteOpacity > 0.9);
    assert.ok(distilled.object.reliefOpacity > 0.9);
    assert.ok(distilled.object.faceOpacity < 0.08);
    assert.ok(resolved.object.faceOpacity > 0.9);
    assert.ok(resolved.object.x < 0);
    assert.ok(Math.abs(resolved.object.left.rotateY) < Math.abs(unresolved.object.left.rotateY));
    assert.ok(resolved.object.violet < unresolved.object.violet);
  });

  it("keeps shared geometry continuous at Phase 2 and Phase 4 handoffs", () => {
    [
      LANDING_SEGMENTS.phase2[0],
      LANDING_SEGMENTS.transition2[0],
      LANDING_SEGMENTS.phase4[0],
    ].forEach((boundary) => {
      const before = numericValues(getLandingTimelineState(boundary - 0.0000001).object);
      const at = numericValues(getLandingTimelineState(boundary).object);
      assert.equal(before.length, at.length);
      before.forEach((value, index) => assert.ok(Math.abs(value - at[index]) < 0.01));
    });
  });

  it("turns the distilled channel into evidence architecture during Transition 2", () => {
    const early = getLandingTimelineState(0.385);
    const middle = getLandingTimelineState(0.425);
    const late = getLandingTimelineState(0.47);

    assert.ok(early.object.opacity > middle.object.opacity);
    assert.ok(middle.structure.opacity > early.structure.opacity);
    assert.ok(late.structure.opacity > 0.8);
    assert.ok(late.world.whiteOpacity < early.world.whiteOpacity);
  });

  it("keeps at most two costly scene groups active", () => {
    for (let step = 0; step <= 2000; step += 1) {
      const state = getLandingTimelineState(step / 2000);
      const evidenceActive =
        state.structure.opacity > 0.01 || state.cards.some((card) => card.opacity > 0.01);
      const releaseActive =
        Math.max(state.release.opacity, state.release.beam, state.release.flare) > 0.01;
      const groups = [state.object.opacity > 0.01, evidenceActive, releaseActive];
      assert.ok(groups.filter(Boolean).length <= 2);
    }
  });

  it("moves the compact-landscape arrival offset continuously into Phase 4", () => {
    let previous = 0;
    for (let step = 0; step <= 100; step += 1) {
      const progress =
        LANDING_SEGMENTS.transition3[0] +
        (LANDING_SEGMENTS.transition3[1] - LANDING_SEGMENTS.transition3[0]) * (step / 100);
      const offset = getLandingTimelineState(progress, true).object.landscapeOffset;
      assert.ok(offset <= previous + 0.000001);
      assert.ok(Math.abs(offset - previous) < 1.2);
      previous = offset;
    }
    assert.ok(Math.abs(previous + 21) < 0.001);
    assert.equal(
      getLandingTimelineState(LANDING_SEGMENTS.phase4[0], true).object.landscapeOffset,
      -21,
    );
  });

  it("uses a static representative policy for reduced-motion and save-data", () => {
    assert.deepEqual(getLandingMotionPolicy(false, false), {
      staticExperience: false,
      idleParticles: true,
      foregroundRush: true,
    });
    [getLandingMotionPolicy(true, false), getLandingMotionPolicy(false, true)].forEach((policy) => {
      assert.equal(policy.staticExperience, true);
      assert.equal(policy.idleParticles, false);
      assert.equal(policy.foregroundRush, false);
    });
  });
});

describe("evidence card depth", () => {
  it("moves every card through real Z: deep, focal, then deep again", () => {
    Object.values([0, 1, 2, 3]).forEach((index) => {
      const windows = [
        [0.42, 0.6],
        [0.49, 0.67],
        [0.56, 0.74],
        [0.63, 0.81],
      ] as const;
      const [start, end] = windows[index];
      const entering = getEvidenceCardState(start, index);
      const focal = getEvidenceCardState(start + (end - start) * 0.58, index);
      const departing = getEvidenceCardState(end, index);

      assert.ok(focal.z > entering.z + 600);
      assert.ok(focal.z > departing.z + 600);
      assert.ok(Math.abs(entering.rotateY) > 65);
      assert.ok(Math.abs(focal.rotateY) < 12);
      assert.ok(focal.blur < entering.blur);
      assert.ok(focal.brightness > entering.brightness);
      assert.equal(entering.occlusion, "behind");
      assert.equal(focal.occlusion, "front");
      assert.equal(departing.occlusion, "behind");
    });
  });

  it("keeps one focal card and bounded supporting cards", () => {
    for (let step = 0; step <= 1000; step += 1) {
      const progress = step / 1000;
      const desktop = getLandingTimelineState(progress).cards;
      const mobile = getLandingTimelineState(progress, true).cards;
      assert.ok(desktop.filter((card) => card.opacity > 0.01).length <= 3);
      assert.ok(mobile.filter((card) => card.opacity > 0.01).length <= 2);
      assert.ok(desktop.filter((card) => card.focal).length <= 1);
      assert.ok(mobile.filter((card) => card.focal).length <= 1);
    }
  });
});

describe("world response", () => {
  it("moves particle currents progressively upward and gives transitions density events", () => {
    let previousRise = 0;
    for (let step = 0; step <= 1000; step += 1) {
      const state = getLandingTimelineState(step / 1000);
      assert.ok(state.particles.rise >= previousRise);
      previousRise = state.particles.rise;
    }

    const sparse = getLandingTimelineState(0.31);
    const evidence = getLandingTimelineState(0.6);
    const release = getLandingTimelineState(0.81);
    assert.ok(evidence.particles.density > sparse.particles.density);
    assert.ok(release.particles.streak > sparse.particles.streak);
    assert.ok(release.particles.warmth > sparse.particles.warmth);
  });

  it("uses deterministic bounded particles with stronger near-depth travel", () => {
    const first = createLandingParticleSeeds();
    const second = createLandingParticleSeeds();
    assert.deepEqual(first, second);
    assert.equal(first.length, LANDING_PARTICLE_LIMITS.seeded);
    assert.ok(LANDING_PARTICLE_LIMITS.desktop <= 50);
    assert.ok(LANDING_PARTICLE_LIMITS.compact <= 28);
    assert.ok(getParticleDepthTravel(0.9) > getParticleDepthTravel(0.2));

    [-1, 0, 0.5, 1, 2, Number.NaN].forEach((density) => {
      assert.ok(getLandingParticleRenderCount(density, false) <= LANDING_PARTICLE_LIMITS.desktop);
      assert.ok(getLandingParticleRenderCount(density, true) <= LANDING_PARTICLE_LIMITS.compact);
    });
  });

  it("settles the particle field below opening activity in Phase 4", () => {
    const opening = getLandingTimelineState(0).particles;
    const settled = getLandingTimelineState(1).particles;
    assert.ok(settled.density < opening.density);
    assert.ok(settled.current < opening.current);
    assert.ok(settled.attraction < opening.attraction + 0.1);
    assert.ok(settled.streak < opening.streak + 0.1);
  });

  it("uses spatial travel and masking rather than opacity-only transitions", () => {
    const heroExit = getLandingTimelineState(0.21);
    const thesisExit = getLandingTimelineState(0.44);
    const release = getLandingTimelineState(0.81);

    assert.ok(heroExit.hero.clip > 0.2);
    assert.ok(Math.abs(heroExit.hero.z) > 100);
    assert.ok(thesisExit.thesis.clip > 0.2);
    assert.ok(Math.abs(thesisExit.thesis.z) > 100);
    assert.ok(release.release.opacity > 0.2);
    assert.ok(release.release.foregroundZ > 100);
  });

  it("reveals final CTA only after the returning object is established", () => {
    const arrival = getLandingTimelineState(0.88);
    const settled = getLandingTimelineState(0.96);

    assert.ok(arrival.object.opacity > 0.9);
    assert.ok(arrival.finalCopy.opacity < 0.1);
    assert.ok(settled.finalCopy.opacity > 0.9);
  });
});
