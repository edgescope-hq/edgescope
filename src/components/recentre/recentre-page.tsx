import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ListRestart,
  Pause,
  Play,
  Settings2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader, PageShell } from "@/components/ui/premium";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useRecentreAudio } from "@/components/recentre/use-recentre-audio";
import {
  ALL_SCENES,
  getDefaultSceneId,
  getRecentreScene,
  getRecentreState,
  RECENTRE_STATES,
  type RecentreSceneId,
  type RecentreState,
  type RecentreStateId,
} from "@/lib/recentre";
import { cn } from "@/lib/utils";

type Session = { minutes: number; state?: RecentreStateId; key: number };
type TimerStatus = "running" | "paused";
type SessionStage = "pre-session" | "countdown" | "active" | "complete";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(0.07_0.012_270)]";
const EASE = [0.16, 1, 0.3, 1] as const;
const COUNTDOWN_DURATION_MS = 3_000;

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function clampMinutes(value: number) {
  return Math.max(1, Math.min(60, Math.round(value)));
}

function durationError(value: string) {
  if (value.trim() === "") return "Enter a duration.";
  const minutes = Number(value);
  if (!Number.isInteger(minutes)) return "Use whole minutes only.";
  if (minutes < 1) return "Minimum is 1 minute.";
  if (minutes > 60) return "Maximum is 60 minutes.";
  return null;
}

function DurationPicker({
  minutes,
  presets,
  compactLabels = false,
  onChange,
  onValidityChange,
}: {
  minutes: number;
  presets: readonly number[];
  compactLabels?: boolean;
  onChange: (minutes: number) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState(String(minutes));
  const error = custom ? durationError(draft) : null;
  const isValid = error === null;

  useEffect(() => {
    onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  useEffect(() => {
    if (!custom) setDraft(String(minutes));
  }, [custom, minutes]);

  const selectPreset = (value: number) => {
    setCustom(false);
    setDraft(String(value));
    onChange(value);
  };

  const step = (amount: number) => {
    const next = clampMinutes(minutes + amount);
    setCustom(true);
    setDraft(String(next));
    onChange(next);
  };

  const label = (value: number) =>
    compactLabels ? `${value} min` : `${value} minute${value === 1 ? "" : "s"}`;

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-foreground">Duration</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {presets.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={!custom && minutes === value}
            onClick={() => selectPreset(value)}
            className={cn(
              "min-h-11 rounded-lg px-4 text-sm font-semibold ring-1 transition-colors",
              !custom && minutes === value
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-white/[0.045] text-foreground/80 ring-white/[0.08] hover:bg-white/[0.08]",
              FOCUS,
            )}
          >
            {label(value)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          onClick={() => {
            setCustom(true);
            setDraft(String(minutes));
          }}
          className={cn(
            "min-h-11 rounded-lg px-4 text-sm font-semibold ring-1 transition-colors",
            custom
              ? "bg-primary text-primary-foreground ring-primary"
              : "bg-white/[0.045] text-foreground/80 ring-white/[0.08] hover:bg-white/[0.08]",
            FOCUS,
          )}
        >
          Custom
        </button>
      </div>
      {custom && (
        <>
          <div
            className={cn(
              "mt-3 flex w-full max-w-[240px] items-center rounded-lg bg-white/[0.045] ring-1",
              error ? "ring-destructive" : "ring-white/[0.1]",
            )}
          >
            <button
              type="button"
              aria-label="Reduce duration"
              onClick={() => step(-1)}
              className={cn(
                "grid h-11 w-11 place-items-center text-lg text-foreground/80 hover:text-foreground",
                FOCUS,
              )}
            >
              −
            </button>
            <label className="flex flex-1 items-center gap-1 text-sm text-muted-foreground">
              <span className="sr-only">Custom duration in whole minutes</span>
              <input
                aria-label="Custom duration in whole minutes"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "custom-duration-error" : undefined}
                autoComplete="off"
                inputMode="numeric"
                name="recentre-custom-minutes"
                pattern="[0-9]*"
                value={draft}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!/^\d*$/.test(value)) return;
                  setDraft(value);
                  if (durationError(value) === null) onChange(Number(value));
                }}
                className="min-w-0 w-full bg-transparent text-center font-semibold tabular-nums text-foreground outline-none"
              />
              <span aria-hidden="true">min</span>
            </label>
            <button
              type="button"
              aria-label="Increase duration"
              onClick={() => step(1)}
              className={cn(
                "grid h-11 w-11 place-items-center text-lg text-foreground/80 hover:text-foreground",
                FOCUS,
              )}
            >
              +
            </button>
          </div>
          {error && (
            <p id="custom-duration-error" role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}

export function RecentrePage({ stateId }: { stateId?: RecentreStateId }) {
  const navigate = useNavigate();
  const [meditationMinutes, setMeditationMinutes] = useState(3);
  const [stateMinutes, setStateMinutes] = useState(1);
  const [durationValid, setDurationValid] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const state = stateId ? getRecentreState(stateId) : undefined;
  const minutes = state ? stateMinutes : meditationMinutes;

  useEffect(() => {
    if (!stateId) return;
    setStateMinutes(1);
    setDurationValid(true);
  }, [stateId]);

  const enterSession = () => {
    if (!durationValid) return;
    setSession({ minutes, state: stateId, key: Date.now() });
  };

  const completeSession = useCallback(() => {
    setSession(null);
    void navigate({ to: "/recentre", resetScroll: true });
  }, [navigate]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: session ? 0 : 1 }}
        transition={{ duration: 0.2, ease: EASE }}
      >
        <PageShell>
          {state ? (
            <GuideContent
              state={state}
              minutes={stateMinutes}
              durationValid={durationValid}
              onMinutesChange={setStateMinutes}
              onValidityChange={setDurationValid}
              onEnterSession={enterSession}
            />
          ) : (
            <LandingContent
              minutes={meditationMinutes}
              durationValid={durationValid}
              onMinutesChange={setMeditationMinutes}
              onValidityChange={setDurationValid}
              onEnterSession={enterSession}
            />
          )}
        </PageShell>
      </motion.div>
      <AnimatePresence>
        {session && (
          <SessionOverlay
            key={session.key}
            session={session}
            onLeave={() => setSession(null)}
            onComplete={completeSession}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function LandingContent({
  minutes,
  durationValid,
  onMinutesChange,
  onValidityChange,
  onEnterSession,
}: {
  minutes: number;
  durationValid: boolean;
  onMinutesChange: (minutes: number) => void;
  onValidityChange: (valid: boolean) => void;
  onEnterSession: () => void;
}) {
  return (
    <>
      <PageHeader
        title="Recentre"
        description="Step away from the reaction and return to your trading standard."
      />
      <section aria-labelledby="meditation-heading" className="mt-11">
        <h2
          id="meditation-heading"
          className="text-lg font-bold tracking-[-0.01em] text-foreground"
        >
          Meditation
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Take a quiet pause before your next decision.
        </p>
        <div className="glow-card mt-6 rounded-2xl p-5 sm:p-7">
          <DurationPicker
            minutes={minutes}
            presets={[3, 5, 10]}
            onChange={onMinutesChange}
            onValidityChange={onValidityChange}
          />
          <button
            type="button"
            disabled={!durationValid}
            onClick={onEnterSession}
            className={cn(
              "mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50",
              FOCUS,
            )}
          >
            <Play className="h-4 w-4" /> Enter meditation
          </button>
        </div>
      </section>
      <section aria-labelledby="trading-states-heading" className="mt-11">
        <h2
          id="trading-states-heading"
          className="text-lg font-bold tracking-[-0.01em] text-foreground"
        >
          Trading states
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Recognize what is affecting your execution and return to your standard.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RECENTRE_STATES.map((state) => (
            <Link
              key={state.id}
              to="/recentre/$state"
              params={{ state: state.id }}
              resetScroll
              className={cn(
                "group min-h-[150px] rounded-xl bg-white/[0.035] p-5 ring-1 ring-white/[0.07] transition-colors hover:bg-white/[0.07] focus-visible:ring-primary",
                FOCUS,
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-bold text-foreground">{state.label}</h3>
                <ArrowRight className="mt-0.5 h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {state.cardDescription}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function GuideContent({
  state,
  minutes,
  durationValid,
  onMinutesChange,
  onValidityChange,
  onEnterSession,
}: {
  state: RecentreState;
  minutes: number;
  durationValid: boolean;
  onMinutesChange: (minutes: number) => void;
  onValidityChange: (valid: boolean) => void;
  onEnterSession: () => void;
}) {
  return (
    <>
      <Link
        to="/recentre"
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
          FOCUS,
        )}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Recentre
      </Link>
      <header className="mt-5 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-[-0.01em] text-foreground md:text-4xl">
          {state.label}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.cardDescription}</p>
      </header>
      <div className="mt-8 grid max-w-5xl gap-4 lg:grid-cols-2">
        <GuideBlock title="What’s happening">
          <p>{state.whatMayBeHappening}</p>
        </GuideBlock>
        <GuideBlock title="What you’re avoiding">
          <BulletList items={state.pain} />
        </GuideBlock>
        <GuideBlock title="How it affects trading">
          <BulletList items={state.behaviours} />
        </GuideBlock>
        <GuideBlock title="Return to your standard">
          <ol className="space-y-2">
            {state.returnToProcess.map((item, index) => (
              <li key={item} className="flex gap-3">
                <span className="font-semibold text-primary">{index + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </GuideBlock>
      </div>
      <section
        aria-labelledby="pause-heading"
        className="glow-card mt-7 rounded-2xl p-5 sm:py-5 sm:px-6"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <h2 id="pause-heading" className="text-xl font-bold text-foreground sm:shrink-0">
            Pause
          </h2>
          <div className="sm:flex-1">
            <DurationPicker
              minutes={minutes}
              presets={[1, 3, 5]}
              compactLabels
              onChange={onMinutesChange}
              onValidityChange={onValidityChange}
            />
          </div>
          <button
            type="button"
            disabled={!durationValid}
            onClick={onEnterSession}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50",
              FOCUS,
            )}
          >
            <Play className="h-4 w-4" /> Enter session
          </button>
        </div>
      </section>
    </>
  );
}

function GuideBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-white/[0.035] p-5 ring-1 ring-white/[0.07]">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <div className="mt-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function SessionOverlay({
  session,
  onLeave,
  onComplete,
}: {
  session: Session;
  onLeave: () => void;
  onComplete: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const defaultScene = getRecentreScene("default", session.state);
  const [remaining, setRemaining] = useState(session.minutes * 60_000);
  const [countdownRemaining, setCountdownRemaining] = useState(COUNTDOWN_DURATION_MS);
  const [countdownRunning, setCountdownRunning] = useState(false);
  const [status, setStatus] = useState<TimerStatus>("paused");
  const [stage, setStage] = useState<SessionStage>("pre-session");
  const [endOpen, setEndOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [sceneId, setSceneId] = useState<RecentreSceneId>("default");
  const [backgroundImage, setBackgroundImage] = useState(defaultScene.image);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("Session ready to start.");
  const deadline = useRef<number | null>(null);
  const countdownDeadline = useRef<number | null>(null);
  const completionFadeStarted = useRef(false);
  const completionStarted = useRef(false);
  const completionTimeout = useRef<number | null>(null);
  const controlsResumeRef = useRef(false);
  const dialogResumeRef = useRef<"timer" | "countdown" | null>(null);
  const dialogFromControlsRef = useRef(false);
  const dialogHandledRef = useRef(false);
  const sceneLoadRequest = useRef(0);
  const sceneImageRef = useRef<HTMLImageElement | null>(null);
  const statusRef = useRef(status);
  const remainingRef = useRef(remaining);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const controlsButtonRef = useRef<HTMLButtonElement>(null);
  const audio = useRecentreAudio(defaultScene.audio);
  const { fadeForCompletion, finish: finishAudio, pause: pauseAudio, resume: resumeAudio } = audio;
  const selectedScene = getRecentreScene(sceneId, session.state);

  useEffect(() => {
    statusRef.current = status;
    remainingRef.current = remaining;
  }, [remaining, status]);

  const pauseTimer = useCallback(() => {
    if (status !== "running") return;
    const next = Math.max(0, (deadline.current ?? Date.now()) - Date.now());
    setRemaining(next);
    deadline.current = null;
    setStatus("paused");
    pauseAudio();
  }, [pauseAudio, status]);

  const resumeTimer = useCallback(() => {
    if (stage !== "active" || status === "running") return;
    deadline.current = Date.now() + remaining;
    setStatus("running");
    resumeAudio(remaining);
  }, [remaining, resumeAudio, stage, status]);

  useEffect(() => {
    const app = document.querySelector<HTMLElement>(".edgescope-app");
    const oldBodyOverflow = document.body.style.overflow;
    const oldDocumentOverflow = document.documentElement.style.overflow;
    app?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      app?.removeAttribute("inert");
      document.body.style.overflow = oldBodyOverflow;
      document.documentElement.style.overflow = oldDocumentOverflow;
      if (completionTimeout.current !== null) window.clearTimeout(completionTimeout.current);
      const image = sceneImageRef.current;
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute("src");
      }
    };
  }, []);

  useEffect(() => {
    if (stage !== "countdown" || !countdownRunning) return;
    const update = () => {
      const next = Math.max(0, (countdownDeadline.current ?? Date.now()) - Date.now());
      setCountdownRemaining(next);
      if (next > 0) return;
      countdownDeadline.current = null;
      setCountdownRunning(false);
      deadline.current = Date.now() + remaining;
      setStatus("running");
      setStage("active");
      setAnnouncement("Session started.");
    };
    update();
    const interval = window.setInterval(update, 100);
    return () => window.clearInterval(interval);
  }, [countdownRunning, remaining, stage]);

  const finishSession = useCallback(() => {
    if (completionStarted.current) return;
    completionStarted.current = true;
    deadline.current = null;
    setStatus("paused");
    setControlsOpen(false);
    setStage("complete");
    finishAudio();
    setAnnouncement("Session complete.");
    completionTimeout.current = window.setTimeout(onComplete, reducedMotion ? 700 : 850);
  }, [finishAudio, onComplete, reducedMotion]);

  useEffect(() => {
    if (stage !== "active" || status !== "running") return;
    const update = () => {
      const next = Math.max(0, (deadline.current ?? Date.now()) - Date.now());
      setRemaining(next);
      if (next === 0) {
        finishSession();
        return;
      }
      if (next <= 2_000 && !completionFadeStarted.current) {
        completionFadeStarted.current = true;
        fadeForCompletion(next);
      }
    };
    update();
    const interval = window.setInterval(update, 250);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fadeForCompletion, finishSession, stage, status]);

  const startSession = () => {
    if (stage !== "pre-session" || countdownRunning) return;
    setCountdownRemaining(COUNTDOWN_DURATION_MS);
    countdownDeadline.current = Date.now() + COUNTDOWN_DURATION_MS;
    setCountdownRunning(true);
    setStage("countdown");
    setAnnouncement("Three.");
  };

  const pause = () => {
    pauseTimer();
    setAnnouncement("Session paused.");
  };

  const resume = () => {
    resumeTimer();
    setAnnouncement("Session resumed.");
  };

  const openControls = () => {
    controlsResumeRef.current = status === "running";
    if (status === "running") {
      const next = Math.max(0, (deadline.current ?? Date.now()) - Date.now());
      setRemaining(next);
      deadline.current = null;
      setStatus("paused");
    }
    setControlsOpen(true);
  };

  const closeControls = useCallback(() => {
    setControlsOpen(false);
    if (controlsResumeRef.current) {
      if (stage === "active" && status === "paused") {
        deadline.current = Date.now() + remaining;
        setStatus("running");
      }
    } else {
      pauseAudio();
    }
    window.requestAnimationFrame(() => controlsButtonRef.current?.focus());
  }, [pauseAudio, stage, status, remaining]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !controlsOpen) return;
      event.preventDefault();
      closeControls();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeControls, controlsOpen]);

  const restart = () => {
    deadline.current = null;
    countdownDeadline.current = null;
    setRemaining(session.minutes * 60_000);
    setCountdownRemaining(COUNTDOWN_DURATION_MS);
    setCountdownRunning(false);
    setStatus("paused");
    setStage("pre-session");
    setControlsOpen(false);
    completionFadeStarted.current = false;
    setSceneId("default");
    setBackgroundImage(defaultScene.image);
    audio.setSource(defaultScene.audio, false);
    audio.stop();
    setAnnouncement("Session ready to start.");
  };

  const openEndDialog = (fromControls = false) => {
    dialogHandledRef.current = false;
    dialogFromControlsRef.current = fromControls;
    if (stage === "countdown") {
      dialogResumeRef.current = countdownRunning ? "countdown" : null;
      if (countdownRunning) {
        setCountdownRemaining(Math.max(0, (countdownDeadline.current ?? Date.now()) - Date.now()));
        countdownDeadline.current = null;
        setCountdownRunning(false);
      }
    } else {
      dialogResumeRef.current = status === "running" ? "timer" : null;
      if (status === "running") pauseTimer();
    }
    if (fromControls) setControlsOpen(false);
    setEndOpen(true);
  };

  const continueSession = () => {
    if (dialogHandledRef.current) return;
    dialogHandledRef.current = true;
    setEndOpen(false);
    if (dialogFromControlsRef.current) {
      setControlsOpen(true);
      return;
    }
    if (dialogResumeRef.current === "countdown") {
      countdownDeadline.current = Date.now() + countdownRemaining;
      setCountdownRunning(true);
      return;
    }
    if (dialogResumeRef.current === "timer") resumeTimer();
  };

  const endSession = () => {
    dialogHandledRef.current = true;
    deadline.current = null;
    countdownDeadline.current = null;
    setEndOpen(false);
    audio.stop(onLeave);
  };

  const changeScene = (nextId: RecentreSceneId) => {
    if (nextId === sceneId) return;
    const nextScene = getRecentreScene(nextId, session.state);
    const request = ++sceneLoadRequest.current;
    setSceneId(nextId);
    setSceneLoading(true);
    setSceneError(null);
    const image = new Image();
    sceneImageRef.current = image;
    image.decoding = "async";
    image.onload = () => {
      if (request !== sceneLoadRequest.current) return;
      setBackgroundImage(nextScene.image);
      setSceneLoading(false);
      audio.setSource(nextScene.audio, audio.enabled, remainingRef.current);
    };
    image.onerror = () => {
      if (request !== sceneLoadRequest.current) return;
      setSceneLoading(false);
      setSceneError("The selected scene could not be loaded. The current scene is still in use.");
      setSceneId(sceneId);
    };
    image.src = nextScene.image;
  };

  const countdownValue = Math.max(1, Math.ceil(countdownRemaining / 1_000));
  const topAction =
    stage === "pre-session"
      ? { label: "Back", icon: ArrowLeft, action: onLeave }
      : stage === "countdown" || stage === "active"
        ? { label: "End session", icon: X, action: () => openEndDialog() }
        : null;
  const sceneOptions = (Object.keys(ALL_SCENES) as Exclude<RecentreSceneId, "default">[]).map(
    (id) => getRecentreScene(id, session.state),
  );
  const defaultSceneId = getDefaultSceneId(session.state);

  return createPortal(
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0.01 : 0.4, ease: EASE }}
      role="dialog"
      aria-modal="true"
      aria-label="Recentre session"
      className="fixed inset-0 z-[100] overflow-y-auto bg-[oklch(0.035_0.01_270)] text-white"
    >
      <img
        src={backgroundImage}
        alt=""
        aria-hidden="true"
        width={1672}
        height={941}
        className="fixed inset-0 h-full w-full object-cover object-[52%_center]"
      />
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-[linear-gradient(90deg,oklch(0.03_0.008_270/0.52),oklch(0.03_0.008_270/0.22),oklch(0.02_0.006_270/0.42))]"
      />
      <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8">
        <div
          className={cn("flex min-h-11 items-center", endOpen && "pointer-events-none opacity-0")}
        >
          {topAction && (
            <button
              ref={actionButtonRef}
              type="button"
              onClick={topAction.action}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-lg bg-black/30 px-3.5 text-sm font-semibold text-white ring-1 ring-white/15 transition-colors hover:bg-black/45",
                FOCUS,
              )}
            >
              <topAction.icon className="h-4 w-4" /> {topAction.label}
            </button>
          )}
        </div>
        <main
          className={cn(
            "relative my-auto flex flex-1 items-center justify-center py-12 transition-opacity sm:py-16",
            endOpen && "pointer-events-none opacity-0",
          )}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[min(34rem,82vw)] w-[min(44rem,110vw)] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,oklch(0.12_0.028_275/0.58),transparent_68%)]"
          />
          <AnimatePresence mode="wait">
            {stage === "pre-session" && (
              <motion.div
                key="pre-session"
                initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0.01 : 0.22, ease: EASE }}
                className="relative w-full max-w-md text-center"
              >
                <h1 className="text-3xl font-bold tracking-[-0.02em] [text-shadow:0_3px_24px_oklch(0_0_0/0.65)] sm:text-4xl">
                  {session.state ? getRecentreState(session.state).label : "Meditation"}
                </h1>
                <button
                  type="button"
                  onClick={startSession}
                  className={cn(
                    "mt-8 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110",
                    FOCUS,
                  )}
                >
                  <Play className="h-4 w-4" /> Start
                </button>
              </motion.div>
            )}
            {stage === "countdown" && (
              <motion.div
                key="countdown"
                initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0.01 : 0.2, ease: EASE }}
                aria-live="polite"
                className="relative text-center"
              >
                <span className="text-7xl font-bold tabular-nums [text-shadow:0_3px_24px_oklch(0_0_0/0.65)] sm:text-8xl">
                  {countdownValue}
                </span>
              </motion.div>
            )}
            {stage === "active" && !controlsOpen && (
              <motion.div
                key="timer"
                initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0.01 : 0.22, ease: EASE }}
                className="relative w-full text-center"
              >
                <div
                  role="timer"
                  aria-label={`${formatTime(remaining)} remaining`}
                  className="text-6xl font-bold tracking-[-0.04em] text-white [text-shadow:0_3px_24px_oklch(0_0_0/0.65)] tabular-nums sm:text-8xl"
                >
                  {formatTime(remaining)}
                </div>
                <div className="mt-8 flex flex-wrap justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={status === "running" ? pause : resume}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110",
                      FOCUS,
                    )}
                  >
                    {status === "running" ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {status === "running" ? "Pause" : "Resume"}
                  </button>
                  <button
                    ref={controlsButtonRef}
                    type="button"
                    onClick={openControls}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-lg bg-black/30 px-4 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-black/45",
                      FOCUS,
                    )}
                  >
                    <Settings2 className="h-4 w-4" /> Session controls
                  </button>
                </div>
                {audio.loading && (
                  <p role="status" className="mt-3 text-xs font-medium text-white/75">
                    Loading ambience…
                  </p>
                )}
              </motion.div>
            )}
            {stage === "active" && controlsOpen && (
              <SessionControls
                key="controls"
                audio={audio}
                selectedScene={sceneId}
                scenes={sceneOptions}
                defaultSceneId={defaultSceneId}
                sceneLoading={sceneLoading}
                sceneError={sceneError}
                onSceneChange={changeScene}
                onClose={closeControls}
                onRestart={restart}
                onEnd={() => openEndDialog(true)}
              />
            )}
            {stage === "complete" && (
              <motion.div
                key="complete"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reducedMotion ? 0.01 : 0.2, ease: EASE }}
                className="relative text-center"
              >
                <h1 className="text-3xl font-bold tracking-[-0.02em] [text-shadow:0_3px_24px_oklch(0_0_0/0.65)] sm:text-4xl">
                  Session complete
                </h1>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
      </div>
      {endOpen && <div aria-hidden="true" className="fixed inset-0 z-[110] bg-black/70" />}
      {(stage === "countdown" || stage === "active") && (
        <AlertDialog
          open={endOpen}
          onOpenChange={(open) => {
            if (!open) continueSession();
          }}
        >
          <AlertDialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              actionButtonRef.current?.focus();
            }}
            className="z-[120] max-w-md bg-[oklch(0.09_0.014_270)] text-white ring-white/15"
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">End this session?</AlertDialogTitle>
              <AlertDialogDescription className="leading-6 text-white/70">
                Your current session will end.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={continueSession}
                className={cn(
                  "border-white/15 bg-white/[0.08] text-white hover:bg-white/[0.14] hover:text-white",
                  FOCUS,
                )}
              >
                Continue session
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={endSession}
                className={cn("bg-primary text-primary-foreground hover:brightness-110", FOCUS)}
              >
                End session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </motion.section>,
    document.body,
  );
}

function SceneChooser({
  open,
  scenes,
  selectedScene,
  defaultSceneId,
  onSelect,
  onClose,
}: {
  open: boolean;
  scenes: ReturnType<typeof getRecentreScene>[];
  selectedScene: RecentreSceneId;
  defaultSceneId: Exclude<RecentreSceneId, "default">;
  onSelect: (scene: RecentreSceneId) => void;
  onClose: () => void;
}) {
  const chooserRef = useRef<HTMLDivElement>(null);
  const changeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.requestAnimationFrame(() => changeButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={chooserRef}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a scene"
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-[360px] rounded-2xl bg-[oklch(0.12_0.02_275/0.94)] p-4 ring-1 ring-white/[0.08] shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Choose a scene</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scene chooser"
            className={cn(
              "grid h-8 w-8 place-items-center rounded-lg text-white/70 transition hover:bg-white/[0.1] hover:text-white",
              FOCUS,
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {scenes.map((scene, index) => {
            const isDefault = scene.id === defaultSceneId;
            const selected = selectedScene === "default" ? isDefault : scene.id === selectedScene;
            return (
              <button
                key={scene.id}
                ref={index === 0 ? changeButtonRef : undefined}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onSelect(isDefault ? "default" : scene.id)}
                className={cn(
                  "group relative flex flex-col items-start rounded-lg p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(0.07_0.012_270)]",
                  selected
                    ? "bg-primary/20 ring-1 ring-primary"
                    : "bg-white/[0.045] ring-1 ring-white/[0.08] hover:bg-white/[0.08]",
                )}
              >
                <img
                  src={scene.thumbnail}
                  alt=""
                  width={240}
                  height={135}
                  loading="lazy"
                  className="h-10 w-full rounded object-cover sm:h-12"
                />
                <span className="mt-1 text-[11px] font-semibold leading-4 text-white/85">
                  {scene.label}
                </span>
                {isDefault && (
                  <span className="mt-0.5 rounded bg-white/[0.1] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white/60">
                    Default
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SessionControls({
  audio,
  selectedScene,
  scenes,
  defaultSceneId,
  sceneLoading,
  sceneError,
  onSceneChange,
  onClose,
  onRestart,
  onEnd,
}: {
  audio: ReturnType<typeof useRecentreAudio>;
  selectedScene: RecentreSceneId;
  scenes: ReturnType<typeof getRecentreScene>[];
  defaultSceneId: Exclude<RecentreSceneId, "default">;
  sceneLoading: boolean;
  sceneError: string | null;
  onSceneChange: (scene: RecentreSceneId) => void;
  onClose: () => void;
  onRestart: () => void;
  onEnd: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const changeSceneButtonRef = useRef<HTMLButtonElement>(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const currentScene =
    selectedScene === "default"
      ? getRecentreScene(defaultSceneId)
      : getRecentreScene(selectedScene);

  const closeSceneChooser = () => {
    setChooserOpen(false);
    window.requestAnimationFrame(() => changeSceneButtonRef.current?.focus());
  };

  return (
    <>
      <motion.section
        key="session-controls"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        aria-label="Session controls"
        className="relative w-full max-w-md rounded-xl bg-[oklch(0.12_0.02_275/0.85)] p-4 text-left text-white ring-1 ring-white/[0.06] shadow-xl shadow-black/25 backdrop-blur-sm"
      >
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h1 className="text-lg font-bold">Session controls</h1>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close session controls"
            className={cn(
              "grid h-11 w-11 place-items-center rounded-lg text-white/80 transition hover:bg-white/[0.1] hover:text-white",
              FOCUS,
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-lg bg-white/[0.045] p-3 ring-1 ring-white/[0.06]">
          <img
            src={currentScene.thumbnail}
            alt=""
            width={80}
            height={45}
            className="h-10 w-16 shrink-0 rounded object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white/70">Current scene</div>
            <div className="truncate text-sm font-bold text-white">{currentScene.label}</div>
          </div>
          <button
            ref={changeSceneButtonRef}
            type="button"
            onClick={() => setChooserOpen(true)}
            className={cn(
              "shrink-0 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/[0.14]",
              FOCUS,
            )}
          >
            Change scene
          </button>
        </div>

        {sceneLoading && (
          <p role="status" className="mt-2 text-xs text-white/70">
            Loading scene…
          </p>
        )}

        <div className="mt-3 rounded-lg bg-white/[0.045] p-3 ring-1 ring-white/[0.06]">
          <div className="flex min-h-11 items-center justify-between gap-4">
            <span
              id="ambient-sound-label"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              {audio.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              Ambient sound
            </span>
            <Switch
              aria-labelledby="ambient-sound-label"
              checked={audio.enabled}
              onCheckedChange={(enabled) => {
                if (enabled) audio.enable(true);
                else audio.stop();
              }}
              className="bg-black/40 ring-1 ring-white/20 data-[state=checked]:bg-primary"
            />
          </div>
          <div className={cn("mt-3", !audio.enabled && "opacity-50")}>
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Ambient volume</span>
              <span className="tabular-nums">{audio.volume}%</span>
            </div>
            <Slider
              aria-label="Ambient volume"
              className="mt-3 w-full"
              min={0}
              max={100}
              step={1}
              value={[audio.volume]}
              onValueChange={([value]) => audio.setVolume(value ?? 0)}
              disabled={!audio.enabled}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={onRestart}
            className={cn(
              "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white/[0.08] text-sm font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/[0.14]",
              FOCUS,
            )}
          >
            <ListRestart className="h-4 w-4" /> Restart session
          </button>
          <button
            type="button"
            onClick={onEnd}
            className={cn(
              "inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-white/[0.08] text-sm font-semibold text-white/88 ring-1 ring-white/10 transition hover:bg-white/[0.14] hover:text-white",
              FOCUS,
            )}
          >
            End session
          </button>
        </div>

        {(sceneError || audio.error) && (
          <p role="status" className="mt-3 text-xs leading-5 text-white/70">
            {sceneError ?? audio.error}
          </p>
        )}
      </motion.section>
      <SceneChooser
        open={chooserOpen}
        scenes={scenes}
        selectedScene={selectedScene}
        defaultSceneId={defaultSceneId}
        onSelect={(id) => {
          onSceneChange(id);
          closeSceneChooser();
        }}
        onClose={closeSceneChooser}
      />
    </>
  );
}
