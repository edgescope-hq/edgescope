import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Camera,
  Check,
  ChevronDown,
  Target,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EdgeScopeLogo } from "@/components/brand/edgescope-logo";
import { EdgeApertureObject } from "./landing-object";
import { drawLandingParticles } from "./landing-particles";
import {
  clamp01,
  getLandingMotionPolicy,
  getLandingTimelineState,
  type CopyTimelineState,
  type ObjectPieceState,
  type SpatialState,
} from "./landing-timeline";
import "./cinematic-landing.css";

const WORKFLOW_STEPS = [
  {
    index: "01",
    eyebrow: "Capture",
    title: "Capture the trade",
    body: "Record what happened while the context is still fresh.",
    icon: Camera,
  },
  {
    index: "02",
    eyebrow: "Review",
    title: "Review the decision",
    body: "Go beyond the outcome. Review how you traded it.",
    icon: BookOpenCheck,
  },
  {
    index: "03",
    eyebrow: "Patterns",
    title: "Connect the patterns",
    body: "See what keeps repeating across your reviewed trades.",
    icon: BarChart3,
  },
  {
    index: "04",
    eyebrow: "Process",
    title: "Refine the process",
    body: "Carry what you learn into what you do next.",
    icon: Target,
  },
] as const;

type ClientPreferences = {
  compact: boolean;
  ready: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  staticExperience: boolean;
};

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean };
};

function useClientPreferences(): ClientPreferences {
  const [preferences, setPreferences] = useState<ClientPreferences>({
    compact: false,
    ready: false,
    reducedMotion: false,
    saveData: false,
    staticExperience: false,
  });

  useEffect(() => {
    document.documentElement.dataset.cinematicClient = "true";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactViewport = window.matchMedia("(max-width: 767px)");
    const update = () => {
      const saveData =
        (navigator as NavigatorWithConnection).connection?.saveData === true ||
        document.documentElement.dataset.saveData === "true";
      const motionPolicy = getLandingMotionPolicy(reducedMotion.matches, saveData);
      setPreferences({
        compact: compactViewport.matches,
        ready: true,
        reducedMotion: reducedMotion.matches,
        saveData,
        staticExperience: motionPolicy.staticExperience,
      });
    };

    update();
    reducedMotion.addEventListener("change", update);
    compactViewport.addEventListener("change", update);
    return () => {
      reducedMotion.removeEventListener("change", update);
      compactViewport.removeEventListener("change", update);
    };
  }, []);

  return preferences;
}

function setInteractiveRegion(element: HTMLElement | null, interactive: boolean) {
  if (!element) return;
  const nextState = interactive ? "true" : "false";
  if (element.dataset.interactive === nextState) return;
  element.dataset.interactive = nextState;
  element.toggleAttribute("inert", !interactive);
  element.setAttribute("aria-hidden", interactive ? "false" : "true");
  element.style.pointerEvents = interactive ? "auto" : "none";
}

function PrimaryCta({ children = "Get Started" }: { children?: React.ReactNode }) {
  return (
    <Link
      to="/auth"
      search={{ mode: "signup" }}
      className="cinematic-button cinematic-button--primary"
    >
      <span>{children}</span>
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

function SecondaryCta({ children = "Sign in" }: { children?: React.ReactNode }) {
  return (
    <Link
      to="/auth"
      search={{ mode: "signin" }}
      className="cinematic-button cinematic-button--secondary"
    >
      {children}
    </Link>
  );
}

function LandingHeader({
  anchorPrefix = "",
  cinematic = false,
}: {
  anchorPrefix?: string;
  cinematic?: boolean;
}) {
  return (
    <header
      className={cinematic ? "cinematic-header cinematic-header--overlay" : "cinematic-header"}
    >
      <div className="cinematic-header__inner">
        <Link to="/" aria-label="EdgeScope home" className="cinematic-brand">
          <EdgeScopeLogo tone="light" />
        </Link>

        <nav aria-label="Landing chapters" className="cinematic-chapter-nav">
          <a href={`#${anchorPrefix}journey-promise`}>Promise</a>
          <a href={`#${anchorPrefix}journey-thesis`}>Journal thesis</a>
          <a href={`#${anchorPrefix}journey-workflow`}>Workflow</a>
          <a href={`#${anchorPrefix}journey-arrival`}>Destination</a>
        </nav>

        <div className="cinematic-header__actions">
          <SecondaryCta />
          <PrimaryCta />
        </div>
      </div>
    </header>
  );
}

function WorkflowEvidence({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="workflow-evidence workflow-evidence--capture">
        <div className="evidence-grid">
          <span>
            <small>Instrument</small>
            <strong>NQ</strong>
          </span>
          <span>
            <small>Direction</small>
            <strong>Long</strong>
          </span>
          <span>
            <small>Session</small>
            <strong>New York</strong>
          </span>
          <span className="evidence-positive">
            <small>Achieved R</small>
            <strong>+1.8R</strong>
          </span>
        </div>
        <div className="evidence-screenshot" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <b />
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="workflow-evidence workflow-evidence--review">
        <div className="review-grade">
          <span>B</span>
          <small>Execution grade</small>
        </div>
        <div className="review-fields">
          <span>
            <small>Setup</small>
            <strong>Opening range</strong>
          </span>
          <span>
            <small>Review note</small>
            <strong>Entered before confirmation</strong>
          </span>
          <span>
            <small>Rule break</small>
            <strong>Early entry</strong>
          </span>
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="workflow-evidence workflow-evidence--patterns">
        <div className="pattern-chart" aria-hidden="true">
          {[42, 68, 51, 82, 62, 88, 74].map((height, barIndex) => (
            <i key={barIndex} style={{ height: `${height}%` }} />
          ))}
        </div>
        <div className="pattern-rows">
          <span>
            <strong>New York open</strong>
            <small>8 of 12 reviewed trades</small>
          </span>
          <span>
            <strong>Early entries</strong>
            <small>Repeated in 5 reviews</small>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-evidence workflow-evidence--process">
      <span className="focus-label">Next review focus</span>
      <strong>Wait for confirmation before entry.</strong>
      <p>Carry this cue into the next session, then review what changed.</p>
      <div className="focus-progress">
        <i />
      </div>
    </div>
  );
}

function WorkflowCard({
  stepIndex,
  staticCard = false,
}: {
  stepIndex: number;
  staticCard?: boolean;
}) {
  const step = WORKFLOW_STEPS[stepIndex];
  if (!step) return null;
  const Icon = step.icon;
  const Tag = staticCard ? "article" : "div";
  return (
    <Tag
      className={staticCard ? "static-workflow-card" : `workflow-card workflow-card--${stepIndex}`}
      data-card-index={staticCard ? undefined : stepIndex}
      aria-hidden={staticCard ? undefined : "true"}
    >
      <div className="workflow-card__topline">
        <span>{step.index}</span>
        <Icon aria-hidden="true" />
      </div>
      <p>{step.eyebrow}</p>
      {staticCard ? <h3>{step.title}</h3> : <h2>{step.title}</h2>}
      <div className="workflow-card__body">{step.body}</div>
      <WorkflowEvidence index={stepIndex} />
    </Tag>
  );
}

function WorldAtmosphere() {
  return (
    <div className="cinematic-world" aria-hidden="true">
      <div className="world-layer world-layer--far">
        <div className="world-light world-light--neutral" />
        <div className="world-light world-light--cyan" />
        <div className="world-light world-light--violet" />
        <div className="world-light world-light--warm" />
        <div className="world-grid" />
        <span className="far-trace far-trace--one" />
        <span className="far-trace far-trace--two" />
        <span className="far-trace far-trace--three" />
      </div>
      <div className="world-layer world-layer--middle">
        <span className="depth-form depth-form--left" />
        <span className="depth-form depth-form--right" />
        <span className="depth-form depth-form--high" />
        <span className="depth-arc depth-arc--one" />
        <span className="depth-arc depth-arc--two" />
      </div>
      <div className="world-layer world-layer--near">
        <span className="near-surface near-surface--left" />
        <span className="near-surface near-surface--right" />
      </div>
    </div>
  );
}

function DistilledWorld() {
  return (
    <div className="distilled-world" aria-hidden="true">
      <div className="distilled-world__field" />
      <div className="distilled-world__shadow distilled-world__shadow--one" />
      <div className="distilled-world__shadow distilled-world__shadow--two" />
      <div className="distilled-world__horizon" />
      <span className="distilled-mote distilled-mote--one" />
      <span className="distilled-mote distilled-mote--two" />
      <span className="distilled-mote distilled-mote--three" />
    </div>
  );
}

function RearEvidenceStructure() {
  return (
    <div className="evidence-structure evidence-structure--rear" aria-hidden="true">
      <svg viewBox="0 0 420 760" role="presentation">
        <path
          className="structure-trace structure-trace--outer"
          d="M80 742 C55 590 98 472 75 342 C56 232 94 128 136 18"
        />
        <path
          className="structure-trace structure-trace--outer"
          d="M340 742 C365 590 322 472 345 342 C364 232 326 128 284 18"
        />
        <path
          className="structure-trace structure-trace--inner"
          d="M168 752 C151 618 184 496 159 372 C138 270 171 137 192 12"
        />
        <path
          className="structure-trace structure-trace--inner"
          d="M252 752 C269 618 236 496 261 372 C282 270 249 137 228 12"
        />
        <ellipse
          className="structure-orbit structure-orbit--one"
          cx="210"
          cy="178"
          rx="110"
          ry="27"
        />
        <ellipse
          className="structure-orbit structure-orbit--two"
          cx="210"
          cy="388"
          rx="145"
          ry="38"
        />
        <ellipse
          className="structure-orbit structure-orbit--three"
          cx="210"
          cy="606"
          rx="116"
          ry="31"
        />
      </svg>
      <span className="structure-node structure-node--one" />
      <span className="structure-node structure-node--two" />
      <span className="structure-node structure-node--three" />
      <span className="structure-node structure-node--four" />
    </div>
  );
}

function FrontEvidenceStructure() {
  return (
    <div className="evidence-structure evidence-structure--front" aria-hidden="true">
      <div className="structure-core-glow" />
      <svg viewBox="0 0 420 760" role="presentation">
        <path
          className="structure-rail structure-rail--left"
          d="M184 748 C170 630 195 520 175 410 C158 315 184 218 194 12"
        />
        <path
          className="structure-rail structure-rail--right"
          d="M236 748 C250 630 225 520 245 410 C262 315 236 218 226 12"
        />
        <path
          className="structure-seam"
          d="M210 748 C205 628 216 516 205 408 C197 312 210 212 210 12"
        />
      </svg>
      <span className="structure-front-node structure-front-node--one" />
      <span className="structure-front-node structure-front-node--two" />
      <span className="structure-front-node structure-front-node--three" />
    </div>
  );
}

function ForegroundEvents() {
  return (
    <div className="foreground-events" aria-hidden="true">
      <div className="hero-crossing">
        <i />
      </div>
      <div className="release-crossing">
        <i />
      </div>
      <div className="release-beam" />
      <div className="release-flare" />
      <span className="foreground-mote foreground-mote--one" />
      <span className="foreground-mote foreground-mote--two" />
      <span className="foreground-mote foreground-mote--three" />
      <span className="foreground-mote foreground-mote--four" />
    </div>
  );
}

function AccessibleWorkflowStory() {
  return (
    <section className="cinematic-accessible-story">
      <h2>How EdgeScope supports deliberate improvement</h2>
      <ol>
        {WORKFLOW_STEPS.map((step) => (
          <li key={step.title}>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MotionStory({
  anchorPrefix = "",
  compact,
  enabled,
}: {
  anchorPrefix?: string;
  compact: boolean;
  enabled: boolean;
}) {
  const storyRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const thesisRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const story = storyRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!story || !stage || !canvas || !enabled) return;

    const cards = Array.from(stage.querySelectorAll<HTMLElement>(".workflow-card"));
    const propertyCache = new WeakMap<HTMLElement, Map<string, string>>();
    let renderFrame: number | null = null;
    let ambientFrame: number | null = null;
    let storyTop = 0;
    let scrollableDistance = 1;
    let stageWidth = window.innerWidth;
    let stageHeight = window.innerHeight;
    let lastProgress = 0;
    let lastParticleState = getLandingTimelineState(0, compact).particles;
    let lastAmbientDraw = 0;
    let storyVisible = true;

    const setProperty = (
      element: HTMLElement,
      name: string,
      value: number | string,
      suffix = "",
    ) => {
      const next = typeof value === "number" ? `${value.toFixed(4)}${suffix}` : `${value}${suffix}`;
      let cache = propertyCache.get(element);
      if (!cache) {
        cache = new Map();
        propertyCache.set(element, cache);
      }
      if (cache.get(name) === next) return;
      cache.set(name, next);
      element.style.setProperty(name, next);
    };

    const setStage = (name: string, value: number, suffix = "") =>
      setProperty(stage, name, value, suffix);
    const setSpatial = (prefix: string, state: SpatialState) => {
      setStage(`--${prefix}-opacity`, state.opacity);
      setStage(`--${prefix}-x`, state.x, "vw");
      setStage(`--${prefix}-y`, state.y, "vh");
      setStage(`--${prefix}-z`, state.z, "px");
      setStage(`--${prefix}-scale`, state.scale);
      setStage(`--${prefix}-rx`, state.rotateX, "deg");
      setStage(`--${prefix}-ry`, state.rotateY, "deg");
      setStage(`--${prefix}-rz`, state.rotateZ, "deg");
    };
    const setCopy = (prefix: string, state: CopyTimelineState) => {
      setSpatial(prefix, state);
      setStage(`--${prefix}-clip`, state.clip);
    };
    const setPiece = (prefix: string, state: ObjectPieceState) => {
      setStage(`--${prefix}-x`, state.x, "px");
      setStage(`--${prefix}-y`, state.y, "px");
      setStage(`--${prefix}-z`, state.z, "px");
      setStage(`--${prefix}-rx`, state.rotateX, "deg");
      setStage(`--${prefix}-ry`, state.rotateY, "deg");
      setStage(`--${prefix}-rz`, state.rotateZ, "deg");
    };

    const measure = () => {
      const bounds = story.getBoundingClientRect();
      storyTop = bounds.top + window.scrollY;
      scrollableDistance = Math.max(1, bounds.height - window.innerHeight);
      stageWidth = stage.clientWidth;
      stageHeight = stage.clientHeight;
    };

    const drawParticles = (time: number) => {
      drawLandingParticles(canvas, {
        compact,
        height: stageHeight,
        idleTime: time,
        reduced: false,
        state: lastParticleState,
        width: stageWidth,
      });
    };

    const render = (time = performance.now()) => {
      renderFrame = null;
      lastProgress = clamp01((window.scrollY - storyTop) / scrollableDistance);
      const state = getLandingTimelineState(lastProgress, compact);
      lastParticleState = state.particles;
      stage.dataset.stage = state.activeStage;

      setStage("--story-progress", state.progress);
      Object.entries(state.stages).forEach(([stageName, value]) =>
        setStage(`--${stageName}`, value),
      );
      setCopy("hero", state.hero);
      setCopy("thesis", state.thesis);
      setCopy("final-copy", state.finalCopy);
      setSpatial("object", state.object);
      setPiece("object-left", state.object.left);
      setPiece("object-right", state.object.right);
      setStage("--object-face-opacity", state.object.faceOpacity);
      setStage("--object-relief-opacity", state.object.reliefOpacity);
      setStage("--object-rim-opacity", state.object.rimOpacity);
      setStage("--object-channel", state.object.channel);
      setStage("--object-violet", state.object.violet);
      setStage("--object-cyan", state.object.cyan);
      setStage("--object-warmth", state.object.warmth);
      setStage("--object-shadow", state.object.shadow);
      setStage("--object-influence", state.object.influence);
      setStage("--object-landscape-shift", state.object.landscapeOffset, "vw");

      setStage("--white-opacity", state.world.whiteOpacity);
      setStage("--white-depth", state.world.whiteDepth);
      setStage("--white-radius", 12 + state.world.whiteDepth * 108, "%");
      setStage("--dark-atmosphere", state.world.darkAtmosphere);
      setStage("--world-far-y", state.world.farY, "vh");
      setStage("--world-far-x", state.world.farX, "vw");
      setStage("--world-middle-y", state.world.middleY, "vh");
      setStage("--world-middle-x", state.world.middleX, "vw");
      setStage("--world-near-y", state.world.nearY, "vh");
      setStage("--world-violet", state.world.violet);
      setStage("--world-cyan", state.world.cyan);
      setStage("--world-warmth", state.world.warmth);
      setStage("--world-density", state.world.structureDensity);
      setStage("--world-vignette", state.world.vignette);

      setSpatial("structure", state.structure);
      setStage("--structure-separation", state.structure.separation, "px");
      setStage("--structure-rear-opacity", state.structure.rearOpacity);
      setStage("--structure-front-opacity", state.structure.frontOpacity);
      setStage("--structure-peripheral-opacity", state.structure.peripheralOpacity);
      setStage("--structure-glow", state.structure.glow);
      setStage("--structure-cyan", state.structure.cyan);
      setStage("--structure-violet", state.structure.violet);
      setStage("--structure-warmth", state.structure.warmth);
      setStage("--structure-node-travel", state.structure.nodeTravel);

      setStage("--release-opacity", state.release.opacity);
      setStage("--release-x", state.release.foregroundX, "vw");
      setStage("--release-y", state.release.foregroundY, "vh");
      setStage("--release-z", state.release.foregroundZ, "px");
      setStage("--release-rotation", state.release.foregroundRotation, "deg");
      setStage("--release-beam", state.release.beam);
      setStage("--release-flare", state.release.flare);
      setStage("--release-clear", state.release.clear);
      setStage("--header-opacity", state.headerOpacity);
      setStage("--scroll-cue-opacity", state.scrollCueOpacity);

      state.cards.forEach((card, index) => {
        const element = cards[index];
        if (!element) return;
        setProperty(element, "--card-opacity", card.opacity);
        setProperty(element, "--card-x", card.x, "vw");
        setProperty(element, "--card-y", card.y, "vh");
        setProperty(element, "--card-z", card.z, "px");
        setProperty(element, "--card-scale", card.scale);
        setProperty(element, "--card-rx", card.rotateX, "deg");
        setProperty(element, "--card-ry", card.rotateY, "deg");
        setProperty(element, "--card-rz", card.rotateZ, "deg");
        setProperty(element, "--card-blur", card.blur, "px");
        setProperty(element, "--card-brightness", card.brightness);
        setProperty(element, "--card-saturation", card.saturation);
        setProperty(element, "--card-clarity", card.clarity);
        element.style.visibility = card.opacity > 0.006 ? "visible" : "hidden";
        element.dataset.focal = card.focal ? "true" : "false";
        element.dataset.occlusion = card.occlusion;
      });

      setInteractiveRegion(heroRef.current, state.hero.opacity > 0.72 && state.hero.clip < 0.12);
      setInteractiveRegion(
        thesisRef.current,
        state.thesis.opacity > 0.5 && state.thesis.clip < 0.16,
      );
      setInteractiveRegion(
        finalRef.current,
        state.finalCopy.opacity > 0.78 && state.finalCopy.clip < 0.12,
      );
      drawParticles(time);
    };

    const requestRender = () => {
      if (renderFrame === null) renderFrame = window.requestAnimationFrame(render);
    };

    const ambient = (time: number) => {
      ambientFrame = null;
      if (!storyVisible || document.hidden) return;
      if (time - lastAmbientDraw >= 33) {
        drawParticles(time);
        lastAmbientDraw = time;
      }
      ambientFrame = window.requestAnimationFrame(ambient);
    };

    const startAmbient = () => {
      if (ambientFrame === null && storyVisible && !document.hidden) {
        ambientFrame = window.requestAnimationFrame(ambient);
      }
    };

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      storyVisible = entry?.isIntersecting ?? true;
      if (!storyVisible && ambientFrame !== null) {
        window.cancelAnimationFrame(ambientFrame);
        ambientFrame = null;
      }
      startAmbient();
    });
    const handleVisibility = () => startAmbient();

    const handleResize = () => {
      measure();
      requestRender();
    };

    measure();
    render();
    visibilityObserver.observe(story);
    startAmbient();
    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      visibilityObserver.disconnect();
      window.removeEventListener("scroll", requestRender);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (renderFrame !== null) window.cancelAnimationFrame(renderFrame);
      if (ambientFrame !== null) window.cancelAnimationFrame(ambientFrame);
    };
  }, [compact, enabled]);

  return (
    <main ref={storyRef} className="cinematic-story" aria-label="The EdgeScope product story">
      <span
        id={`${anchorPrefix}journey-promise`}
        className="cinematic-anchor cinematic-anchor--promise"
      />
      <span
        id={`${anchorPrefix}journey-thesis`}
        className="cinematic-anchor cinematic-anchor--thesis"
      />
      <span
        id={`${anchorPrefix}journey-workflow`}
        className="cinematic-anchor cinematic-anchor--workflow"
      />
      <span
        id={`${anchorPrefix}journey-arrival`}
        className="cinematic-anchor cinematic-anchor--arrival"
      />

      <div ref={stageRef} className="cinematic-stage" data-stage="phase1">
        <WorldAtmosphere />
        <DistilledWorld />
        <canvas ref={canvasRef} className="particle-canvas" aria-hidden="true" />
        <EdgeApertureObject className="edge-object--journey" />
        <RearEvidenceStructure />

        <div className="workflow-card-field" aria-hidden="true">
          {WORKFLOW_STEPS.map((step, index) => (
            <WorkflowCard key={step.title} stepIndex={index} />
          ))}
        </div>

        <FrontEvidenceStructure />
        <ForegroundEvents />
        <div className="cinematic-vignette" aria-hidden="true" />
        <LandingHeader anchorPrefix={anchorPrefix} cinematic />

        <div ref={heroRef} className="cinematic-copy cinematic-hero" aria-hidden="false">
          <p className="cinematic-proof">
            <Check aria-hidden="true" />
            <span>No signals. No predictions. Only your own trading data.</span>
          </p>
          <h1>
            See your trading clearly.
            <br />
            Improve it <span>with intent.</span>
          </h1>
          <div className="cinematic-hero__support">
            <p className="cinematic-lede">
              Bring your trades, reviews, and patterns together to understand how you trade — and
              what to work on next.
            </p>
            <div className="cinematic-actions">
              <PrimaryCta />
              <SecondaryCta />
            </div>
          </div>
        </div>

        <div ref={thesisRef} className="cinematic-copy cinematic-thesis" aria-hidden="true" inert>
          <h2>
            Your journal should show where <span>your edge</span> is hiding.
          </h2>
        </div>

        <div className="workflow-chapter" aria-hidden="true">
          <span>Capture</span>
          <i />
          <span>Review</span>
          <i />
          <span>Patterns</span>
          <i />
          <span>Process</span>
        </div>

        <div ref={finalRef} className="cinematic-copy cinematic-final" aria-hidden="true" inert>
          <h2>
            Know what to <span>keep</span>.<br />
            Know what to <span>change</span>.
          </h2>
          <div className="cinematic-actions cinematic-actions--final">
            <PrimaryCta>Start journaling</PrimaryCta>
            <SecondaryCta>Sign in</SecondaryCta>
          </div>
        </div>

        <AccessibleWorkflowStory />
        <div className="cinematic-scroll-cue" aria-hidden="true">
          <span>Scroll to explore</span>
          <ChevronDown />
        </div>
      </div>
    </main>
  );
}

function StaticJourney({ anchorPrefix = "" }: { anchorPrefix?: string }) {
  return (
    <main className="static-journey">
      <LandingHeader anchorPrefix={anchorPrefix} />
      <section id={`${anchorPrefix}journey-promise`} className="static-scene static-hero">
        <div className="static-object-wrap">
          <EdgeApertureObject className="edge-object--static-unresolved" />
        </div>
        <div className="static-hero__content">
          <p className="cinematic-proof">
            <Check aria-hidden="true" />
            <span>No signals. No predictions. Only your own trading data.</span>
          </p>
          <h1>
            See your trading clearly.
            <br />
            Improve it <span>with intent.</span>
          </h1>
          <p>
            Bring your trades, reviews, and patterns together to understand how you trade — and what
            to work on next.
          </p>
          <div className="cinematic-actions">
            <PrimaryCta />
            <SecondaryCta />
          </div>
        </div>
      </section>

      <section id={`${anchorPrefix}journey-thesis`} className="static-scene static-thesis">
        <div className="static-object-wrap">
          <EdgeApertureObject className="edge-object--static-distilled" />
        </div>
        <div className="static-thesis__content">
          <h2>
            Your journal should show where <span>your edge</span> is hiding.
          </h2>
        </div>
      </section>

      <section
        id={`${anchorPrefix}journey-workflow`}
        className="static-scene static-workflow"
        aria-labelledby="static-workflow-title"
      >
        <h2 id="static-workflow-title" className="cinematic-visually-hidden">
          How EdgeScope supports deliberate improvement
        </h2>
        <div className="static-workflow__rail" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="static-workflow__grid">
          {WORKFLOW_STEPS.map((step, index) => (
            <WorkflowCard key={step.title} stepIndex={index} staticCard />
          ))}
        </div>
      </section>

      <section id={`${anchorPrefix}journey-arrival`} className="static-scene static-arrival">
        <div className="static-object-wrap">
          <EdgeApertureObject className="edge-object--static-resolved" />
        </div>
        <div className="static-arrival__content">
          <h2>
            Know what to <span>keep</span>.<br />
            Know what to <span>change</span>.
          </h2>
          <div className="cinematic-actions cinematic-actions--final">
            <PrimaryCta>Start journaling</PrimaryCta>
            <SecondaryCta>Sign in</SecondaryCta>
          </div>
        </div>
      </section>
    </main>
  );
}

function LandingFooter() {
  return (
    <footer className="cinematic-footer">
      <div className="cinematic-footer__inner">
        <Link to="/" className="cinematic-footer__brand" aria-label="EdgeScope home">
          <EdgeScopeLogo tone="light" />
        </Link>
        <p>Journal clearly. Review honestly. Improve with intent.</p>
        <nav aria-label="Legal">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/disclaimer">Disclaimer</Link>
        </nav>
      </div>
    </footer>
  );
}

export function CinematicLanding() {
  const preferences = useClientPreferences();
  const useStaticExperience = preferences.ready && preferences.staticExperience;

  useEffect(() => {
    if (!preferences.ready || !window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (!target) return;
    const frame = window.requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [preferences.ready, preferences.staticExperience]);

  return (
    <div
      className={`cinematic-landing${useStaticExperience ? " cinematic-landing--static" : ""}`}
      data-reduced-motion={preferences.reducedMotion ? "true" : "false"}
      data-save-data={preferences.saveData ? "true" : "false"}
    >
      {!preferences.ready ? (
        <>
          <div className="cinematic-motion-experience">
            <MotionStory anchorPrefix="motion-" compact={false} enabled={false} />
          </div>
          <div className="cinematic-static-experience">
            <StaticJourney />
          </div>
        </>
      ) : useStaticExperience ? (
        <div className="cinematic-static-experience">
          <StaticJourney />
        </div>
      ) : (
        <div className="cinematic-motion-experience">
          <MotionStory compact={preferences.compact} enabled={preferences.ready} />
        </div>
      )}
      <LandingFooter />
    </div>
  );
}
