import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BriefcaseBusiness,
  CalendarDays,
  ChartCandlestick,
  ChartLine,
  ChartNoAxesCombined,
  ChartNoAxesColumn,
  Check,
  CircleGauge,
  ClipboardCheck,
  Crosshair,
  Focus,
  History,
  NotebookPen,
  Plus,
  Repeat2,
  Route,
  ScanSearch,
  UserPen,
  ArrowRight,
  PanelsTopLeft,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TradeFormModal } from "@/components/trades/trade-form-modal";
import { TradeReviewModal } from "@/components/trades/trade-review-modal";
import { AccountFilterSelect } from "@/components/account-filter-select";
import { useActiveAccount } from "@/components/active-account-provider";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrades } from "@/lib/trades.functions";
import {
  getProfile,
  markActivationGuideComplete,
  markIntroSeen,
  updateProfile,
} from "@/lib/account.functions";
import { listTradingAccounts, type TradingAccount } from "@/lib/trading-accounts.functions";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { PageHeader, PageShell } from "@/components/ui/premium";
import { cn } from "@/lib/utils";
import { overview } from "@/lib/analytics";
import {
  isPaperTrade,
  localDateKey,
  numberTradesById,
  streaks,
  toAnalytics,
  type DbTrade,
} from "@/lib/trade-mappers";
import { actualJournalTrades } from "@/lib/evidence-population";
import { getReviewStatus } from "@/lib/review-status";
import { getTradingPreferences } from "@/lib/trading-preferences.functions";
import {
  journalTrackingFromPreferences,
  tradeCompletenessRequirementsFromPreferences,
} from "@/lib/journal-tracking";
import { toast } from "sonner";
import {
  dashboardChartEligibility,
  dashboardChartDateDomain,
  dashboardChartDateTicks,
  dashboardChartTime,
  dashboardCumulativeRPoints,
  dashboardDailyRPoints,
  formatRAxisTick,
  qualifyingRValue,
  type DashboardChartDomain,
  type DashboardChartPoint,
} from "@/lib/dashboard-charts";
import {
  dashboardExecutionFocusShowsRecentre,
  dashboardExecutionFocusState,
  dashboardTradesForAccount,
} from "@/lib/dashboard-data";
import { getActiveImprovementFocus } from "@/lib/improvement.functions";

type Tone = "primary" | "info" | "success" | "warning" | "destructive";
type StatIconIdentity = "trades" | "winRate" | "streak" | "netR" | "averageR" | "reviews";

const toneStyles: Record<Tone, { icon: string; badge: string }> = {
  primary: {
    icon: "from-primary/25 to-primary/5 text-primary",
    badge: "bg-primary/15 text-primary",
  },
  info: { icon: "from-info/25 to-info/5 text-info", badge: "bg-info/15 text-info" },
  success: {
    icon: "from-success/25 to-success/5 text-success",
    badge: "bg-success/15 text-success",
  },
  warning: {
    icon: "from-warning/25 to-warning/5 text-warning",
    badge: "bg-warning/15 text-warning",
  },
  destructive: {
    icon: "from-destructive/25 to-destructive/5 text-destructive",
    badge: "bg-destructive/15 text-destructive",
  },
};

const GRAPHITE_ICON_IDENTITY = "bg-white/[0.055] text-foreground/75 ring-white/[0.1]";
const GUIDE_ICON_IDENTITY =
  "bg-[oklch(0.17_0.026_225)] text-[oklch(0.75_0.055_225)] ring-[oklch(0.62_0.045_225/0.16)]";

const statIconStyles: Record<StatIconIdentity, string> = {
  trades: "bg-[oklch(0.18_0.04_240)] text-[oklch(0.77_0.105_240)] ring-[oklch(0.68_0.08_240/0.18)]",
  winRate:
    "bg-[oklch(0.18_0.036_190)] text-[oklch(0.79_0.095_190)] ring-[oklch(0.69_0.07_190/0.18)]",
  streak: GRAPHITE_ICON_IDENTITY,
  netR: "bg-[oklch(0.17_0.026_255)] text-[oklch(0.74_0.055_250)] ring-[oklch(0.63_0.045_250/0.16)]",
  averageR: "bg-[oklch(0.18_0.03_80)] text-[oklch(0.78_0.075_80)] ring-[oklch(0.66_0.055_80/0.17)]",
  reviews: "bg-warning/[0.07] text-warning/85 ring-warning/[0.13]",
};

const INTRO_WORKFLOW = [
  {
    icon: BriefcaseBusiness,
    title: "Create your trading account",
    body: "Keep actual, practice, and backtest evidence in distinct accounts.",
  },
  {
    icon: Crosshair,
    title: "Log your first trade",
    body: "Quick Capture records the essentials without slowing you down.",
  },
  {
    icon: ClipboardCheck,
    title: "Complete your first review",
    body: "Capture the chart context, reasoning, and review details for this trade.",
  },
];

const SCOPE_UNLOCK_THRESHOLD = 10;
const INTRO_CARD_HOVER =
  "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/22 hover:shadow-[0_16px_44px_-34px_oklch(0.68_0.23_295/0.38)]";
const SOFT_ACCENT = "text-primary/80";

type DashboardProfile = {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  auth_display_name?: string | null;
  has_seen_intro: boolean;
  profile_completed: boolean;
  activation_guide_completed_at?: string | null;
} | null;

function emailPrefix(email?: string | null) {
  return email?.split("@")[0]?.trim().toLowerCase() ?? "";
}

function normalizeHandle(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function suggestedUsername(profile: DashboardProfile) {
  const raw = normalizeHandle(profile?.username);
  const prefix = emailPrefix(profile?.email);
  if (raw && raw !== prefix) return raw.replace(/[^a-z0-9_]/g, "_").slice(0, 32);
  return `trader_${(profile?.id ?? "edgescope").replace(/-/g, "").slice(0, 8)}`;
}

function isProfileIncomplete(profile: DashboardProfile) {
  if (!profile) return false;
  return profile.profile_completed !== true;
}

const card = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

const MOTION_EASE = [0.16, 1, 0.3, 1] as const;
const motionTransition = { duration: 0.22, ease: MOTION_EASE };
const modalTransition = { duration: 0.22, ease: MOTION_EASE };

function StatCard({
  icon: Icon,
  label,
  value,
  decimals = 0,
  suffix = "",
  iconIdentity,
  sub,
  compact = false,
  valueInset = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  decimals?: number;
  suffix?: string;
  iconIdentity: StatIconIdentity;
  sub?: string;
  compact?: boolean;
  valueInset?: boolean;
}) {
  return (
    <motion.div
      {...card}
      transition={motionTransition}
      className={cn(
        "glow-card group relative overflow-hidden rounded-2xl",
        compact ? "px-5 pt-5 pb-4" : "p-5",
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1",
            statIconStyles[iconIdentity],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
          <div
            className={cn(
              "mt-1.5 text-3xl font-bold tracking-tight text-foreground",
              valueInset && "pl-1",
            )}
          >
            {typeof value === "number" ? (
              <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
            ) : (
              <span className="text-2xl leading-8 inline-block pt-0.5">{value}</span>
            )}
          </div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
      </div>
    </motion.div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  tone: Tone;
}) {
  const s = toneStyles[tone as Tone];
  return (
    <div className="glow-card group flex items-center gap-4 rounded-2xl p-5">
      <div
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/[0.06]",
          s.icon,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
        {sub && (
          <div
            className={cn(
              "text-xs font-medium",
              tone === "success"
                ? "text-success"
                : tone === "destructive"
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileSetupModal({
  profile,
  isSaving,
  onSave,
}: {
  profile: NonNullable<DashboardProfile>;
  isSaving: boolean;
  onSave: (data: { username: string; display_name: string }) => void;
}) {
  const prefix = emailPrefix(profile.email);
  const initialDisplay =
    normalizeHandle(profile.display_name) === prefix
      ? (profile.auth_display_name ?? "")
      : (profile.display_name ?? profile.auth_display_name ?? "");
  const [displayName, setDisplayName] = useState(initialDisplay);
  const [username, setUsername] = useState(suggestedUsername(profile));
  const usernameValid = /^[a-zA-Z0-9_]{3,32}$/.test(username.trim());
  const canSave = displayName.trim().length > 0 && usernameValid && !isSaving;

  useEffect(() => {
    setDisplayName(initialDisplay);
    setUsername(suggestedUsername(profile));
  }, [initialDisplay, profile]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/78 p-4 backdrop-blur-md"
    >
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-setup-title"
        initial={{ scale: 0.98, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 6 }}
        transition={modalTransition}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          onSave({ username: username.trim(), display_name: displayName.trim() });
        }}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.1] bg-[linear-gradient(145deg,oklch(0.12_0.02_270/0.98),oklch(0.075_0.012_270/0.99))] p-7 shadow-[0_24px_72px_-36px_oklch(0_0_0/0.9)]"
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "grid h-12 w-12 shrink-0 place-items-center rounded-xl ring-1",
              GRAPHITE_ICON_IDENTITY,
            )}
          >
            <UserPen className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Profile setup
            </div>
            <h2 id="profile-setup-title" className="mt-1 text-2xl font-bold tracking-tight">
              Set up your profile
            </h2>
            <p className="mt-2 text-sm leading-6 text-foreground/68">
              Choose how you&apos;ll appear in your journal and Network.
            </p>
          </div>
        </div>

        <div className="mt-7 grid gap-4">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/60">
              Display Name
            </span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Pavan"
              autoComplete="name"
              className="mt-1.5 w-full rounded-xl bg-white/[0.045] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.08] transition-all duration-200 placeholder:text-muted-foreground/45 focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
            <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
              Used in your journal and personal workspace.
            </span>
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/60">
              Network Username
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="trader_pavan"
              autoComplete="username"
              className="mt-1.5 w-full rounded-xl bg-white/[0.045] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.08] transition-all duration-200 placeholder:text-muted-foreground/45 focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
            <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
              Your unique name when you participate in Network.
            </span>
            {!usernameValid && (
              <p className="mt-1.5 text-xs leading-5 text-warning">
                Use 3-32 letters, numbers, or underscores.
              </p>
            )}
          </label>
        </div>

        <div className="mt-7 flex justify-end">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:-translate-y-px hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSaving ? "Saving..." : "Continue"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

function getBrowserLocalGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Welcome back";
}

function formatTradeDateOnly(date: string): string {
  try {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

function formatCurrentStreak(s: { currentWin: number; currentLoss: number }): {
  value: string;
} {
  if (s.currentWin > 0) {
    return { value: `${s.currentWin} ${s.currentWin === 1 ? "Win" : "Wins"}` };
  }
  if (s.currentLoss > 0) {
    return { value: `${s.currentLoss} ${s.currentLoss === 1 ? "Loss" : "Losses"}` };
  }
  return { value: "No streak yet" };
}

export function DashboardView() {
  const [displayGreeting, setDisplayGreeting] = useState("Welcome back");
  const [newOpen, setNewOpen] = useState(false);
  const [reviewTrade, setReviewTrade] = useState<{ id: string; number: number } | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [introMarkedLocal, setIntroMarkedLocal] = useState(false);
  const tradesFn = useServerFn(listTrades);
  const profileFn = useServerFn(getProfile);
  const preferencesFn = useServerFn(getTradingPreferences);
  const updateProfileFn = useServerFn(updateProfile);
  const markIntroSeenFn = useServerFn(markIntroSeen);
  const markActivationGuideCompleteFn = useServerFn(markActivationGuideComplete);
  const accountsFn = useServerFn(listTradingAccounts);
  const activeImprovementFocusFn = useServerFn(getActiveImprovementFocus);
  const qc = useQueryClient();
  const { data: trades } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => tradesFn() });
  const { data: profile } = useSuspenseQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const { data: preferences } = useQuery({
    queryKey: ["trading-preferences"],
    queryFn: () => preferencesFn(),
  });
  const { data: accounts = [] } = useSuspenseQuery({
    queryKey: ["trading-accounts"],
    queryFn: () => accountsFn(),
  });
  const { data: activeImprovementFocusData } = useQuery({
    queryKey: ["active-improvement-focus"],
    queryFn: () => activeImprovementFocusFn(),
  });
  const activeImprovementFocus = activeImprovementFocusData?.focus ?? null;
  const db = useMemo(() => (trades ?? []) as DbTrade[], [trades]);
  const journalDb = useMemo(() => db.filter((trade) => !isPaperTrade(trade)), [db]);
  const actualDb = useMemo(() => actualJournalTrades(db, accounts), [accounts, db]);

  const { activeAccountId: selectedAccountId, setActiveAccountId: setSelectedAccountId } =
    useActiveAccount();

  const dashboardDb = useMemo(
    () => dashboardTradesForAccount(db, accounts, selectedAccountId),
    [accounts, db, selectedAccountId],
  );
  const reviewStatusOf = useMemo(() => {
    const rPerformanceEnabled =
      journalTrackingFromPreferences(preferences?.journal_tracking).r_performance !== "hidden";
    const tradeCompletenessRequirements = tradeCompletenessRequirementsFromPreferences(
      preferences?.journal_tracking,
    );
    return (trade: DbTrade) =>
      getReviewStatus({
        ...trade,
        r_performance_enabled: rPerformanceEnabled,
        trade_completeness_requirements: tradeCompletenessRequirements,
      });
  }, [preferences?.journal_tracking]);

  useEffect(() => {
    const updateGreeting = () => setDisplayGreeting(getBrowserLocalGreeting());
    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const dashboardRows = useMemo(() => dashboardDb.map(toAnalytics), [dashboardDb]);
  const o = useMemo(() => overview(dashboardRows), [dashboardRows]);
  const streak = useMemo(() => streaks(dashboardDb), [dashboardDb]);

  const recent = useMemo(() => [...dashboardDb].slice(0, 4), [dashboardDb]);
  const tradeNumbersById = useMemo(() => numberTradesById(journalDb), [journalDb]);

  // ------ Today snapshot (Phase 3: lighter daily-focused dashboard) ------
  const todayStr = localDateKey();
  const todayTrades = useMemo(
    () => dashboardDb.filter((t) => t.trade_date === todayStr),
    [dashboardDb, todayStr],
  );
  const todayQualifyingR = useMemo(
    () => todayTrades.map(qualifyingRValue).filter((value): value is number => value !== null),
    [todayTrades],
  );
  const todayNetR = useMemo(
    () => todayQualifyingR.reduce((sum, value) => sum + value, 0),
    [todayQualifyingR],
  );
  const todayClosedCount = useMemo(
    () =>
      todayTrades.filter(
        (trade) =>
          trade.result === "win" || trade.result === "loss" || trade.result === "breakeven",
      ).length,
    [todayTrades],
  );
  const todayNetRContext =
    todayTrades.length === 0
      ? "No trades logged today"
      : todayClosedCount === 0
        ? "No closed trades today"
        : todayQualifyingR.length === 0
          ? "Add risk + P/L to calculate"
          : todayQualifyingR.length < todayClosedCount
            ? `Based on ${todayQualifyingR.length} of ${todayClosedCount} closed trades`
            : "Net result today";

  // ------ Journal completeness reminder ------
  const journalGaps = useMemo(() => {
    const incomplete = dashboardDb.filter((t) => reviewStatusOf(t) === "incomplete").length;
    const needsReview = dashboardDb.filter((t) => reviewStatusOf(t) === "needs_review").length;
    const reviewed = dashboardDb.filter((t) => reviewStatusOf(t) === "reviewed").length;
    return { incomplete, needsReview, reviewed };
  }, [dashboardDb, reviewStatusOf]);
  const hasJournalGaps =
    dashboardDb.length > 0 && journalGaps.incomplete + journalGaps.needsReview > 0;

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const currentMonthTrades = useMemo(
    () => dashboardDb.filter((t) => t.trade_date.startsWith(ym)),
    [dashboardDb, ym],
  );
  const monthChart = useMemo(() => {
    return dashboardDailyRPoints(currentMonthTrades);
  }, [currentMonthTrades]);
  const monthEligibility = useMemo(
    () => dashboardChartEligibility(currentMonthTrades),
    [currentMonthTrades],
  );

  const equityAll = useMemo(() => {
    return dashboardCumulativeRPoints(dashboardDb);
  }, [dashboardDb]);
  const equityEligibility = useMemo(() => dashboardChartEligibility(dashboardDb), [dashboardDb]);

  const closedCount = useMemo(
    () =>
      dashboardDb.filter(
        (t) => t.result === "win" || t.result === "loss" || t.result === "breakeven",
      ).length,
    [dashboardDb],
  );
  const qualifyingR = useMemo(
    () => dashboardDb.map(qualifyingRValue).filter((value): value is number => value !== null),
    [dashboardDb],
  );
  const sumR = useMemo(() => qualifyingR.reduce((sum, value) => sum + value, 0), [qualifyingR]);
  const avgRR = useMemo(
    () => (qualifyingR.length ? sumR / qualifyingR.length : null),
    [qualifyingR, sumR],
  );
  const resultCompleteCount = qualifyingR.length;
  const showResultNote = resultCompleteCount > 0 && resultCompleteCount < closedCount;
  const resultNote = showResultNote
    ? `Based on ${resultCompleteCount} of ${closedCount} closed trades`
    : undefined;

  const accountCount = accounts.length;
  const profileIncomplete = isProfileIncomplete(profile);
  const hasSeenIntro = profile?.has_seen_intro ?? true;
  const shouldShowIntroGuide = accountCount === 0 && journalDb.length === 0;
  const displayName = profile?.display_name?.trim() || "Trader";
  const reviewedTradesCount = useMemo(
    () => dashboardDb.filter((trade) => reviewStatusOf(trade) === "reviewed").length,
    [dashboardDb, reviewStatusOf],
  );
  const globalReviewedTradesCount = useMemo(
    () => actualDb.filter((trade) => reviewStatusOf(trade) === "reviewed").length,
    [actualDb, reviewStatusOf],
  );
  const [scopeUnlockDismissed, setScopeUnlockDismissed] = useState(() => {
    try {
      return localStorage.getItem("edgescope.scopeUnlockDismissed") === "true";
    } catch {
      return false;
    }
  });
  const hasFirstReview =
    Boolean(profile?.activation_guide_completed_at) || globalReviewedTradesCount > 0;
  const scopeReady = globalReviewedTradesCount >= SCOPE_UNLOCK_THRESHOLD;
  const executionFocus = useMemo(() => {
    const s = streaks(actualDb);
    const latestValidTrade = actualDb.find((trade) => qualifyingRValue(trade) !== null);
    const latestValidR = latestValidTrade ? qualifyingRValue(latestValidTrade) : null;
    const state = dashboardExecutionFocusState({
      latestValidR,
      currentLoss: s.currentLoss,
      currentWin: s.currentWin,
    });
    const showRecentre = dashboardExecutionFocusShowsRecentre(state, s.currentLoss);
    const icon = Focus;
    if (state === "large_loss") {
      return {
        icon,
        headline: "Large loss logged",
        message:
          "A loss this large can carry into the next decision. Reset before looking for another trade.",
        showRecentre,
      };
    }
    if (state === "losing_streak") {
      return {
        icon,
        headline: "Losing streak detected",
        message:
          "Losses are stacking up. Slow the pace, protect risk, and only take trades that fully meet your plan.",
        showRecentre,
      };
    }
    if (state === "strong_run") {
      return {
        icon,
        headline: "Strong run detected",
        message:
          "A strong run can loosen standards. Keep your size, entry criteria, and risk unchanged.",
        showRecentre,
      };
    }
    return {
      icon,
      headline: "Stay process-first",
      message: "Wait for your setup, keep risk defined, and review the trade after execution.",
      showRecentre,
    };
  }, [actualDb]);
  const currentStreakStat = useMemo(() => formatCurrentStreak(streak), [streak]);
  const ExecutionFocusIcon = executionFocus.icon;

  // Guide stage — only show before first review is complete
  const activationGuide = useMemo(() => {
    if (hasFirstReview) return null;
    if (accountCount === 0) {
      return {
        stage: "account" as const,
        eyebrow: "SETUP",
        title: "Create a trading account",
        body: "Keep actual, practice, and backtest evidence separate.",
        cta: "Create Trading Account",
        to: "/accounts" as const,
      };
    }
    if (actualDb.length === 0) {
      return {
        stage: "capture" as const,
        eyebrow: "CAPTURE",
        title: "Log your first trade",
        body: "Save the result first. Review details later.",
        cta: "New trade",
        to: null,
      };
    }
    return {
      stage: "review" as const,
      eyebrow: "REVIEW",
      title: "Complete your first review",
      body: "Capture the chart context, reasoning, and review details for this trade.",
      cta: "Complete review",
      to: "/trades" as const,
    };
  }, [accountCount, actualDb.length, hasFirstReview]);

  const saveProfileSetup = useMutation({
    mutationFn: (data: { username: string; display_name: string }) =>
      updateProfileFn({ data: { username: data.username, display_name: data.display_name } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markIntroSeenMutation = useMutation({
    mutationFn: () => markIntroSeenFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });

  const markActivationGuideCompleteMutation = useMutation({
    mutationFn: () => markActivationGuideCompleteFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });

  useEffect(() => {
    if (!shouldShowIntroGuide) setIntroOpen(false);
  }, [shouldShowIntroGuide]);

  useEffect(() => {
    if (!profile || profileIncomplete || hasSeenIntro || introMarkedLocal) return;
    setIntroOpen(true);
    setIntroMarkedLocal(true);
    markIntroSeenMutation.mutate();
  }, [hasSeenIntro, introMarkedLocal, profile, profileIncomplete, markIntroSeenMutation]);

  useEffect(() => {
    if (
      !profile ||
      profile.activation_guide_completed_at ||
      globalReviewedTradesCount === 0 ||
      markActivationGuideCompleteMutation.isPending
    ) {
      return;
    }
    markActivationGuideCompleteMutation.mutate();
  }, [globalReviewedTradesCount, markActivationGuideCompleteMutation, profile]);

  const closeIntro = () => {
    setIntroOpen(false);
    if (!profile || hasSeenIntro || introMarkedLocal) return;
    setIntroMarkedLocal(true);
    markIntroSeenMutation.mutate();
  };

  return (
    <MotionConfig reducedMotion="user">
      <PageShell>
        <PageHeader
          icon={PanelsTopLeft}
          eyebrow="Dashboard"
          title={`${displayGreeting}, ${displayName}`}
          description="Your trading overview, journal gaps, account health, and review momentum."
          className="sm:items-center"
          actions={
            <div className="flex items-center gap-2">
              <AccountFilterSelect
                accounts={accounts}
                value={selectedAccountId}
                onValueChange={setSelectedAccountId}
                allLabel="Live evidence"
              />
              <button
                onClick={() => setNewOpen(true)}
                className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary/85 px-5 py-2.5 text-sm font-semibold text-primary-foreground whitespace-nowrap ring-1 ring-primary/40 shadow-[0_8px_24px_-12px_oklch(0.68_0.23_295/0.5)] transition-all duration-200 hover:-translate-y-px hover:brightness-110 hover:shadow-[0_10px_28px_-12px_oklch(0.68_0.23_295/0.62)]"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-br from-white/15 to-transparent opacity-60 mix-blend-overlay"
                />
                <Plus className="relative h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
                <span className="relative">New trade</span>
              </button>
            </div>
          }
        />

        {/* Activation guide — use only before first review */}
        {accounts !== undefined &&
          !profileIncomplete &&
          selectedAccountId === "ALL" &&
          activationGuide && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={motionTransition}
              className="mt-6 w-full overflow-hidden rounded-2xl border border-white/[0.1] bg-[linear-gradient(145deg,oklch(0.14_0.022_270/0.94),oklch(0.09_0.014_270/0.9))] p-5 shadow-[0_18px_52px_-42px_oklch(0_0_0/0.78)] ring-1 ring-white/[0.04] backdrop-blur-xl sm:max-w-xl"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1",
                    GUIDE_ICON_IDENTITY,
                  )}
                >
                  <Route className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    GETTING STARTED
                  </div>
                  <h2 className="mt-1 text-lg font-bold tracking-tight">
                    Build your trading workflow
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-foreground/68">
                    Set up an account, capture trades, and turn each review into useful evidence.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    {activationGuide.to ? (
                      <Link
                        to={activationGuide.to}
                        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                      >
                        {activationGuide.cta}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNewOpen(true)}
                        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                      >
                        {activationGuide.cta}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIntroOpen(true)}
                      className="rounded-xl bg-white/[0.045] px-4 py-2.5 text-sm font-medium text-foreground/70 ring-1 ring-white/[0.08] transition-all duration-200 hover:-translate-y-px hover:bg-white/[0.07] hover:text-foreground"
                    >
                      Open Guide
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        {/* Scope unlock prompt — after 10 reviewed trades */}
        {scopeReady && !scopeUnlockDismissed && !activationGuide && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionTransition}
            className={`mt-6 w-full overflow-hidden rounded-2xl border border-primary/18 bg-[radial-gradient(circle_at_top_left,oklch(0.68_0.23_295/0.08),transparent_32%),linear-gradient(145deg,oklch(0.14_0.022_270/0.9),oklch(0.09_0.014_270/0.86))] p-5 shadow-[0_18px_52px_-42px_oklch(0.68_0.23_295/0.36)] ring-1 ring-white/[0.05] backdrop-blur-xl sm:max-w-xl ${INTRO_CARD_HOVER}`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <ScanSearch className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/85">
                  INSIGHTS UNLOCKED
                </div>
                <h2 className="mt-1 text-lg font-bold tracking-tight">Scope is ready</h2>
                <p className="mt-1.5 text-sm leading-6 text-foreground/68">
                  You have enough reviewed trades to inspect early patterns.
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Link
                    to="/edge-discovery"
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                  >
                    Open Scope
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setScopeUnlockDismissed(true);
                      try {
                        localStorage.setItem("edgescope.scopeUnlockDismissed", "true");
                      } catch {
                        // ignore
                      }
                    }}
                    className="rounded-xl bg-white/[0.045] px-4 py-2.5 text-sm font-medium text-foreground/70 ring-1 ring-white/[0.08] transition-all duration-200 hover:-translate-y-px hover:bg-white/[0.07] hover:text-foreground"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {profileIncomplete && profile && (
            <ProfileSetupModal
              profile={profile}
              isSaving={saveProfileSetup.isPending}
              onSave={(data) => saveProfileSetup.mutate(data)}
            />
          )}
          {introOpen && !profileIncomplete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md"
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="intro-guide-title"
                initial={{ scale: 0.98, y: 8 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.98, y: 6 }}
                transition={modalTransition}
                className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[linear-gradient(145deg,oklch(0.12_0.02_270/0.98),oklch(0.075_0.012_270/0.99))] p-7 shadow-[0_24px_72px_-36px_oklch(0_0_0/0.9)]"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "grid h-12 w-12 shrink-0 place-items-center rounded-xl ring-1",
                      GUIDE_ICON_IDENTITY,
                    )}
                  >
                    <Route className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      GETTING STARTED
                    </div>
                    <h2 id="intro-guide-title" className="mt-1 text-2xl font-bold tracking-tight">
                      Build your trading workflow
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-foreground/70">
                      Set up an account, capture trades, and turn each review into useful evidence.
                    </p>
                  </div>
                </div>

                <div className="mt-7 grid gap-3">
                  {INTRO_WORKFLOW.map(({ icon: Icon, title, body }, index) => {
                    const completed = (() => {
                      if (index === 0) return accountCount > 0;
                      if (index === 1) return actualDb.length > 0;
                      if (index === 2) return hasFirstReview;
                      return false;
                    })();
                    const current = !completed && activationGuide?.title === title;
                    const stepClassName = cn(
                      "flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left ring-1",
                      completed
                        ? "border-success/18 bg-success/[0.045] ring-success/[0.08]"
                        : current
                          ? "border-primary/28 bg-white/[0.075] ring-primary/[0.18]"
                          : "border-white/[0.08] bg-white/[0.045] ring-white/[0.04]",
                      current &&
                        "transition-colors hover:border-primary/40 hover:bg-white/[0.095] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                    );
                    const stepContent = (
                      <>
                        <div
                          className={cn(
                            "grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1",
                            completed
                              ? "bg-success/15 text-success ring-success/25"
                              : current
                                ? "bg-primary/18 text-primary ring-primary/30"
                                : "bg-primary/12 text-primary ring-primary/20",
                          )}
                        >
                          {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3
                              className={cn(
                                "text-sm font-semibold",
                                current ? "text-white" : "text-foreground",
                              )}
                            >
                              {title}
                            </h3>
                          </div>
                          <p
                            className={cn(
                              "mt-1 text-sm leading-6",
                              current ? "text-foreground/86" : "text-foreground/68",
                            )}
                          >
                            {body}
                          </p>
                        </div>
                      </>
                    );
                    if (current && activationGuide) {
                      return activationGuide.to ? (
                        <Link
                          key={title}
                          to={activationGuide.to}
                          onClick={closeIntro}
                          aria-current="step"
                          className={stepClassName}
                        >
                          {stepContent}
                        </Link>
                      ) : (
                        <button
                          key={title}
                          type="button"
                          aria-current="step"
                          onClick={() => {
                            closeIntro();
                            setNewOpen(true);
                          }}
                          className={stepClassName}
                        >
                          {stepContent}
                        </button>
                      );
                    }
                    return (
                      <div key={title} className={stepClassName}>
                        {stepContent}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-7 flex flex-wrap justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={closeIntro}
                    className="rounded-xl bg-white/[0.045] px-5 py-2.5 text-sm font-medium text-foreground/70 ring-1 ring-white/[0.08] transition-all duration-200 hover:-translate-y-px hover:bg-white/[0.07] hover:text-foreground hover:ring-white/[0.14]"
                  >
                    Close
                  </button>
                  {activationGuide?.to ? (
                    <Link
                      onClick={closeIntro}
                      to={activationGuide.to}
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                    >
                      {activationGuide.cta}
                    </Link>
                  ) : (
                    <button
                      onClick={() => {
                        closeIntro();
                        setNewOpen(true);
                      }}
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                    >
                      New trade
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
          {newOpen && (
            <TradeFormModal
              nextNum={journalDb.length + 1}
              onClose={() => setNewOpen(false)}
              onSaved={() => {}}
            />
          )}
        </AnimatePresence>

        {/* Today snapshot — daily-focused command center */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="glow-card rounded-2xl p-5">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
              TRADES TODAY
            </div>
            <div className="mt-1.5 text-3xl font-bold tabular-nums">{todayTrades.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">Logged today</div>
          </div>
          <div className="glow-card flex flex-col items-start rounded-2xl p-5 text-left">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
              TODAY NET R
            </div>
            <div
              className={cn(
                "mt-1.5 whitespace-nowrap pl-1 text-left text-3xl font-bold tabular-nums",
                todayNetR > 0 && "text-success",
                todayNetR < 0 && "text-destructive",
              )}
            >
              {todayQualifyingR.length === 0 ? (
                "\u2014"
              ) : (
                <span className="inline-block">
                  {todayNetR > 0 ? "+" : todayNetR < 0 ? "\u2212" : ""}
                  {Math.abs(todayNetR).toFixed(2)}R
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{todayNetRContext}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-[linear-gradient(135deg,oklch(0.17_0.05_292/0.72),oklch(0.09_0.018_275/0.94))] px-5 py-4 shadow-[inset_0_1px_0_oklch(1_0_0/0.035)] ring-1 ring-primary/[0.2] sm:min-h-[88px] sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[oklch(0.14_0.045_292/0.92)] text-primary/90 ring-1 ring-primary/[0.24]">
                <ExecutionFocusIcon className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/85">
                  Execution Focus
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {executionFocus.headline}
                </div>
                <p className="mt-0.5 max-w-3xl text-sm leading-5 text-muted-foreground">
                  {executionFocus.message}
                </p>
              </div>
            </div>
            {executionFocus.showRecentre && (
              <Link
                to="/recentre"
                className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-primary/14 px-3.5 text-xs font-semibold text-primary ring-1 ring-primary/24 transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:ml-auto sm:self-center"
              >
                Open Recentre <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {activeImprovementFocus && (
            <Link
              to="/edge-discovery"
              className="flex min-h-[76px] flex-col justify-between gap-3 rounded-2xl border border-info/[0.14] bg-info/[0.045] px-5 py-3 ring-1 ring-info/[0.05] transition-colors hover:bg-info/[0.065] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/25 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-info/[0.07] text-info/80 ring-1 ring-info/15">
                  <Route className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/85">
                    Developmental focus
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-foreground/90">
                    {activeImprovementFocus.behavior}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    When {activeImprovementFocus.trigger_situation} · Aim for{" "}
                    {activeImprovementFocus.intended_behavior}
                  </div>
                </div>
              </div>
              <span className="inline-flex min-h-9 shrink-0 items-center gap-1.5 self-end text-xs font-semibold text-info/85 sm:self-auto">
                Open Scope <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          )}

          {hasJournalGaps && (
            <Link
              to="/trades"
              search={{
                account: selectedAccountId === "ALL" ? undefined : selectedAccountId,
                review: "incomplete,needs_review",
              }}
              className="flex min-h-[76px] flex-col items-stretch justify-between gap-2 rounded-2xl border border-warning/[0.14] bg-warning/[0.055] px-5 py-2.5 ring-1 ring-warning/[0.05] transition-colors hover:bg-warning/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/28 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/[0.06] text-warning/80 ring-1 ring-warning/12">
                  <NotebookPen className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/85">
                    Journal reminder
                  </div>
                  <div className="mt-0.5 text-sm font-semibold leading-5 text-foreground/90">
                    {(() => {
                      const inc = journalGaps.incomplete;
                      const rev = journalGaps.needsReview;
                      if (inc > 0 && rev > 0) {
                        const reviewWord = rev === 1 ? "1 needs review" : `${rev} need review`;
                        const capWord =
                          inc === 1 ? "1 incomplete capture" : `${inc} incomplete captures`;
                        return `${capWord} · ${reviewWord}`;
                      }
                      if (inc > 0) {
                        return inc === 1 ? "1 incomplete capture" : `${inc} incomplete captures`;
                      }
                      if (rev > 0) {
                        return rev === 1 ? "1 needs review" : `${rev} need review`;
                      }
                      return "";
                    })()}
                  </div>
                </div>
              </div>
              <span className="inline-flex min-h-9 shrink-0 items-center gap-1.5 self-end text-xs font-semibold text-warning/85 sm:self-auto">
                Complete journal <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          )}
        </div>

        {/* KPI Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard
            icon={ChartCandlestick}
            label="TOTAL TRADES"
            value={o.total}
            iconIdentity="trades"
            compact
          />
          <StatCard
            icon={CircleGauge}
            label="WIN RATE"
            value={o.winRate == null ? "\u2014" : o.winRate}
            decimals={1}
            suffix="%"
            iconIdentity="winRate"
            sub={o.winRate == null ? "No closed trades" : undefined}
            compact
          />
          <StatCard
            icon={Repeat2}
            label="CURRENT STREAK"
            value={currentStreakStat.value === "No streak yet" ? "\u2014" : currentStreakStat.value}
            iconIdentity="streak"
            sub={
              currentStreakStat.value === "No streak yet"
                ? closedCount === 0
                  ? "No closed trades"
                  : "No active win/loss streak"
                : undefined
            }
            compact
          />
          <StatCard
            icon={ChartNoAxesCombined}
            label="NET R"
            value={qualifyingR.length > 0 ? sumR : "\u2014"}
            decimals={2}
            suffix="R"
            iconIdentity="netR"
            valueInset
            sub={
              qualifyingR.length === 0
                ? closedCount > 0
                  ? "Add risk + P/L to calculate"
                  : "No closed trades"
                : resultNote
            }
          />
          <StatCard
            icon={ChartNoAxesColumn}
            label="AVERAGE R"
            value={avgRR ?? "\u2014"}
            decimals={2}
            suffix="R"
            iconIdentity="averageR"
            valueInset
            sub={
              avgRR == null
                ? closedCount > 0
                  ? "Add risk + P/L to see avg R"
                  : "No closed trades"
                : resultNote
            }
          />
          <StatCard
            icon={ClipboardCheck}
            label="COMPLETED REVIEWS"
            value={reviewedTradesCount}
            iconIdentity="reviews"
            sub={o.total ? `${reviewedTradesCount} of ${o.total}` : "No trades yet"}
          />
        </div>

        {/* Recent trades + Monthly performance */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <motion.div
            {...card}
            transition={{ ...motionTransition, delay: 0.04 }}
            className="section-card relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.14] bg-[radial-gradient(ellipse_at_top,oklch(0.68_0.23_295/0.1),transparent_48%),linear-gradient(145deg,oklch(0.15_0.02_270/0.96),oklch(0.105_0.014_270/0.98))] p-5 shadow-[0_18px_44px_-34px_oklch(0_0_0/0.82)] ring-1 ring-white/[0.025] lg:col-span-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4 text-primary" /> Recent trades
              </h3>
              <Link
                to="/trades"
                search={{ account: selectedAccountId === "ALL" ? undefined : selectedAccountId }}
                className="text-xs font-medium text-primary transition-colors duration-200 hover:text-primary-glow"
              >
                View all →
              </Link>
            </div>
            <div
              className={cn(
                "mt-5",
                recent.length === 0
                  ? "flex h-[230px]"
                  : "grid flex-1 grid-rows-4 divide-y divide-white/[0.06] border-y border-white/[0.06]",
              )}
            >
              {recent.length === 0 && (
                <div className="flex h-full w-full items-center justify-center rounded-xl bg-white/[0.02] text-center ring-1 ring-white/[0.04]">
                  <div>
                    <History
                      className="mx-auto h-5 w-5 text-muted-foreground/60"
                      aria-hidden="true"
                    />
                    <p className="mt-2 text-sm font-semibold">No trades logged yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Log your first trade to begin.
                    </p>
                  </div>
                </div>
              )}
              {recent.map((t, index) => {
                const displayR = qualifyingRValue(t);
                const rr = displayR ?? 0;
                const tradeNumber = tradeNumbersById.get(t.id) ?? journalDb.length - index;
                const tone: Tone =
                  t.result === "win" ? "success" : t.result === "loss" ? "destructive" : "info";
                const label =
                  t.result === "win"
                    ? "WIN"
                    : t.result === "loss"
                      ? "LOSS"
                      : t.result === "breakeven"
                        ? "BE"
                        : "\u2014";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setReviewTrade({ id: t.id, number: tradeNumber })}
                    className="grid min-h-[60px] w-full grid-cols-[minmax(0,1fr)_64px_84px] items-center gap-4 px-1 py-3 text-left transition-colors duration-150 hover:bg-white/[0.025] focus:outline-none focus-visible:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/30"
                  >
                    <div className="min-w-0 pr-5">
                      <div
                        className="truncate text-sm font-semibold"
                        title={t.instrument?.trim() || undefined}
                      >
                        {t.instrument?.trim() || "\u2014"}
                      </div>
                      <div className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                        {formatRecentTradeDate(t.trade_date)}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 justify-self-start rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider",
                        toneStyles[tone].badge,
                      )}
                    >
                      {label}
                    </span>
                    <div className="flex w-full shrink-0 justify-end text-sm font-semibold tabular-nums">
                      <div className="grid w-[3.25rem] place-items-center">
                        {displayR == null ? (
                          <>
                            <span className="sr-only">R unavailable</span>
                            <span
                              aria-hidden="true"
                              className="h-px w-3.5 rounded-full bg-muted-foreground/80"
                            />
                          </>
                        ) : (
                          <span
                            className={cn(
                              "w-full text-right",
                              rr > 0 && "text-success",
                              rr < 0 && "text-destructive",
                              rr === 0 && "text-muted-foreground",
                            )}
                          >
                            {(rr > 0 ? "+" : "") + rr.toFixed(2) + "R"}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>

          <div className="lg:col-span-7">
            <MonthlyPerformanceTabbed
              monthChart={monthChart}
              monthLabel={monthLabel}
              eligibility={monthEligibility}
              tradeCount={currentMonthTrades.length}
            />
          </div>
        </div>

        {/* Overall Equity Curve */}
        <OverallEquitySection
          data={equityAll}
          eligibility={equityEligibility}
          tradeCount={dashboardDb.length}
        />

        <AnimatePresence>
          {reviewTrade && (
            <TradeReviewModal
              tradeId={reviewTrade.id}
              number={reviewTrade.number}
              onClose={() => setReviewTrade(null)}
            />
          )}
        </AnimatePresence>
      </PageShell>
    </MotionConfig>
  );
}

function formatRecentTradeDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_CHART_MARGIN = { top: 18, right: 20, left: 0, bottom: 14 };
const DASHBOARD_CHART_X_PADDING = { left: 8, right: 8 };
const DASHBOARD_CHART_Y_WIDTH = 48;

type DashboardPlotPoint = DashboardChartPoint & {
  time: number;
};

function chartTimeTick(time: number): string {
  return new Date(time).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function chartTimeTickForDomain(time: number, domain: DashboardChartDomain): string {
  if (domain.end - domain.start < 330 * DAY_MS) return chartTimeTick(time);
  return new Date(time).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function niceCeiling(value: number): number {
  if (!(value > 0)) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function chartYScale(data: DashboardChartPoint[]): {
  domain: [number, number];
  ticks: number[];
} {
  const values = data.map((point) => point.value);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);

  if (minimum === 0 && maximum === 0) {
    return { domain: [-0.6, 0.6], ticks: [-0.5, 0, 0.5] };
  }

  const lowerTick = minimum < 0 ? -niceCeiling(Math.abs(minimum)) : 0;
  const upperTick = maximum > 0 ? niceCeiling(maximum) : 0;
  const tickSpan = upperTick - lowerTick;
  const padding = Math.max(0.08, tickSpan * 0.08);
  const ticks = [lowerTick, lowerTick + tickSpan / 2, upperTick];

  return {
    domain: [lowerTick - padding, upperTick + padding],
    ticks,
  };
}

function dashboardPlotPoints(data: DashboardChartPoint[]): DashboardPlotPoint[] {
  return data.map((point) => ({ ...point, time: dashboardChartTime(point.date) }));
}

function MonthlyPerformanceTabbed({
  monthChart,
  monthLabel,
  eligibility,
  tradeCount,
}: {
  monthChart: DashboardChartPoint[];
  monthLabel: string;
  eligibility: ReturnType<typeof dashboardChartEligibility>;
  tradeCount: number;
}) {
  const domain = dashboardChartDateDomain(monthChart) ?? { start: 0, end: 0 };
  const plotData = dashboardPlotPoints(monthChart);
  const xTicks = dashboardChartDateTicks(monthChart, 4);
  const yScale = chartYScale(monthChart);
  const monthNetR = monthChart.reduce((sum, point) => sum + point.value, 0);
  const monthTone = monthNetR > 0 ? "positive" : monthNetR < 0 ? "negative" : "neutral";
  const monthColor =
    monthTone === "positive"
      ? "oklch(0.72 0.14 152)"
      : monthTone === "negative"
        ? "oklch(0.76 0.11 78)"
        : "oklch(0.72 0.035 270)";

  return (
    <motion.div
      {...card}
      transition={{ ...motionTransition, delay: 0.08 }}
      className="section-card relative overflow-hidden rounded-2xl border border-white/[0.14] bg-[radial-gradient(ellipse_at_top,oklch(0.68_0.23_295/0.1),transparent_48%),linear-gradient(145deg,oklch(0.15_0.02_270/0.96),oklch(0.105_0.014_270/0.98))] p-5 shadow-[0_18px_44px_-34px_oklch(0_0_0/0.82)] ring-1 ring-white/[0.025]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" /> Monthly performance
        </h3>
        <span className="rounded-md bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {monthLabel}
        </span>
      </div>

      <div className="mt-4 h-[250px]">
        {!eligibility.eligible ? (
          <DashboardLowDataState tradeCount={tradeCount} chart="monthly" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={plotData} margin={DASHBOARD_CHART_MARGIN}>
              <defs>
                <linearGradient id="dash-month-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={monthColor} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={monthColor} stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.04)" vertical={false} />
              <XAxis
                type="number"
                dataKey="time"
                scale="time"
                domain={[domain.start, domain.end]}
                allowDataOverflow
                tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                ticks={xTicks}
                interval="preserveStartEnd"
                minTickGap={28}
                padding={DASHBOARD_CHART_X_PADDING}
                tickFormatter={chartTimeTick}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }}
                axisLine={false}
                tickLine={false}
                width={DASHBOARD_CHART_Y_WIDTH}
                ticks={yScale.ticks}
                allowDecimals
                tickFormatter={formatRAxisTick}
                domain={yScale.domain}
              />
              <Tooltip content={<DashboardChartTooltip valueLabel="Daily net R" />} />
              <ReferenceLine y={0} stroke="oklch(1 0 0 / 0.18)" strokeDasharray="3 3" />
              <Area
                type="linear"
                dataKey="value"
                stroke="transparent"
                fill="url(#dash-month-fill)"
                baseValue={0}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="value"
                stroke={monthColor}
                strokeWidth={2.25}
                dot={plotData.length <= 8 ? { r: 2, fill: monthColor, strokeWidth: 0 } : false}
                activeDot={{
                  r: 4,
                  fill: monthColor,
                  stroke: "oklch(0.12 0.02 270)",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}

function DashboardChartTooltip({
  active,
  payload,
  valueLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload?: DashboardPlotPoint }>;
  valueLabel: string;
}) {
  const point = payload?.find((entry) => entry.payload?.date)?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[oklch(0.13_0.018_270)] px-3 py-2 text-xs shadow-[0_8px_32px_-8px_oklch(0_0_0/0.5)]">
      <div className="text-muted-foreground">{formatTradeDateOnly(point.date)}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/75">
        {valueLabel}
      </div>
      <div className="mt-1 font-semibold text-foreground">
        {point.value > 0 ? "+" : ""}
        {point.value.toFixed(2)}R
      </div>
    </div>
  );
}

function OverallEquitySection({
  data,
  eligibility,
  tradeCount,
}: {
  data: DashboardChartPoint[];
  eligibility: ReturnType<typeof dashboardChartEligibility>;
  tradeCount: number;
}) {
  const domain = dashboardChartDateDomain(data) ?? { start: 0, end: 0 };
  const plotData = dashboardPlotPoints(data);
  const xTicks = dashboardChartDateTicks(data, 5);
  const yScale = chartYScale(data);

  return (
    <motion.div
      {...card}
      transition={{ ...motionTransition, delay: 0.1 }}
      className="relative mt-4 overflow-hidden rounded-2xl border border-white/[0.14] bg-[radial-gradient(ellipse_at_top,oklch(0.68_0.23_295/0.11),transparent_48%),linear-gradient(145deg,oklch(0.15_0.02_270/0.96),oklch(0.105_0.014_270/0.98))] p-5 shadow-[0_18px_44px_-34px_oklch(0_0_0/0.82)] ring-1 ring-white/[0.025]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ChartLine className="h-4 w-4 text-primary" /> Overall equity curve
        </h3>
        <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          All-time
        </span>
      </div>
      <div className={cn("mt-4", eligibility.eligible ? "h-[300px]" : "h-[176px]")}>
        {!eligibility.eligible ? (
          <DashboardLowDataState tradeCount={tradeCount} chart="equity" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={plotData} margin={DASHBOARD_CHART_MARGIN}>
              <defs>
                <linearGradient id="dash-equity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.68 0.23 295)" stopOpacity={0.38} />
                  <stop offset="100%" stopColor="oklch(0.68 0.23 295)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.04)" vertical={false} />
              <XAxis
                type="number"
                dataKey="time"
                scale="time"
                domain={[domain.start, domain.end]}
                allowDataOverflow
                tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                ticks={xTicks}
                interval="preserveStartEnd"
                minTickGap={28}
                padding={DASHBOARD_CHART_X_PADDING}
                tickFormatter={(time) => chartTimeTickForDomain(time, domain)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }}
                axisLine={false}
                tickLine={false}
                width={DASHBOARD_CHART_Y_WIDTH}
                ticks={yScale.ticks}
                allowDecimals
                tickFormatter={formatRAxisTick}
                domain={yScale.domain}
              />
              <Tooltip content={<DashboardChartTooltip valueLabel="Cumulative R" />} />
              <ReferenceLine y={0} stroke="oklch(1 0 0 / 0.14)" strokeDasharray="3 3" />
              <Area
                type="linear"
                dataKey="value"
                stroke="transparent"
                fill="url(#dash-equity)"
                baseValue={0}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="value"
                stroke="oklch(0.78 0.19 295)"
                strokeWidth={2.25}
                dot={
                  plotData.length <= 8
                    ? { r: 2, fill: "oklch(0.78 0.19 295)", strokeWidth: 0 }
                    : false
                }
                activeDot={{
                  r: 4,
                  fill: "oklch(0.78 0.19 295)",
                  stroke: "oklch(0.12 0.02 270)",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}

function DashboardLowDataState({
  tradeCount,
  chart,
}: {
  tradeCount: number;
  chart: "monthly" | "equity";
}) {
  const hasTrades = tradeCount > 0;
  const EmptyIcon = chart === "monthly" ? CalendarDays : ChartLine;
  const heading = hasTrades
    ? "Add R data to continue"
    : chart === "monthly"
      ? "No trades this month"
      : "No trading history yet";
  const message = hasTrades
    ? "Enter Risk and P/L on a closed trade."
    : chart === "monthly"
      ? "Log a trade to begin tracking this month."
      : "Log your first trade to begin your curve.";

  return (
    <div className="flex h-full min-h-[150px] items-center justify-center px-5 text-center">
      <div className="flex flex-col items-center">
        <EmptyIcon className="mb-2 h-5 w-5 text-muted-foreground/55" aria-hidden="true" />
        <div className="text-sm font-semibold text-foreground">{heading}</div>
        <p className="mt-1 max-w-sm text-sm leading-5 text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
