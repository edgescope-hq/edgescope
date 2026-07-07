import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Target,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Calendar,
  Trophy,
  Crosshair,
  History,
  Flame,
  Plus,
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  Sparkles,
  User,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TradeFormModal } from "@/components/trades/trade-form-modal";
import { TradeReviewModal } from "@/components/trades/trade-review-modal";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrades } from "@/lib/trades.functions";
import { getProfile, markIntroSeen, updateProfile } from "@/lib/account.functions";
import { listTradingAccounts, type TradingAccount } from "@/lib/trading-accounts.functions";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";
import { cn } from "@/lib/utils";
import { overview, equityCurve } from "@/lib/analytics";
import {
  isPaperTrade,
  localDateKey,
  numberTradesById,
  recordedR,
  rrNum,
  streaks,
  toAnalytics,
  type DbTrade,
} from "@/lib/trade-mappers";
import { getReviewStatus } from "@/lib/review-status";
import { toast } from "sonner";

function sumRecordedR<T extends { achieved_rr: number | string | null }>(trades: T[]) {
  return trades.reduce((sum, trade) => sum + (recordedR(trade.achieved_rr) ?? 0), 0);
}

type Tone = "primary" | "info" | "success" | "warning" | "destructive";

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

const INTRO_WORKFLOW = [
  {
    icon: ClipboardList,
    title: "Create your trading account",
    body: "Use it to organize live, demo, funded, or backtest journal work.",
  },
  {
    icon: Crosshair,
    title: "Log your first trade",
    body: "Quick Capture records the essentials without slowing you down.",
  },
  {
    icon: Target,
    title: "Complete the review",
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
  has_seen_intro: boolean;
  profile_completed: boolean;
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

const motionTransition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

function StatCard({
  icon: Icon,
  label,
  value,
  decimals = 0,
  suffix = "",
  tone,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  decimals?: number;
  suffix?: string;
  tone: Tone;
  sub?: string;
}) {
  const s = toneStyles[tone];
  return (
    <motion.div
      {...card}
      transition={motionTransition}
      className="glow-card group relative overflow-hidden rounded-2xl p-5"
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/[0.06]",
            s.icon,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-1.5 text-3xl font-bold tracking-tight text-foreground">
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
    normalizeHandle(profile.display_name) === prefix ? "" : (profile.display_name ?? "");
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
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave) return;
          onSave({ username: username.trim(), display_name: displayName.trim() });
        }}
        className={`relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.1] bg-[radial-gradient(circle_at_top_left,oklch(0.68_0.23_295/0.1),transparent_34%),linear-gradient(145deg,oklch(0.12_0.02_270/0.97),oklch(0.075_0.012_270/0.98))] p-7 shadow-[0_22px_70px_-34px_oklch(0_0_0/0.86),0_0_34px_-28px_oklch(0.68_0.23_295/0.46)] ${INTRO_CARD_HOVER}`}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/65 to-transparent" />
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <User className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/88">
              Profile setup
            </div>
            <h2 id="profile-setup-title" className="mt-1 text-2xl font-bold tracking-tight">
              Set up your EdgeScope profile.
            </h2>
            <p className="mt-2 text-sm leading-6 text-foreground/68">
              Choose how EdgeScope should greet you and how your community handle should appear.
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
              className="mt-1.5 w-full rounded-xl bg-white/[0.045] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.08] transition-all duration-200 placeholder:text-muted-foreground/45 focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/60">
              Username
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="trader_pavan"
              className="mt-1.5 w-full rounded-xl bg-white/[0.045] px-3.5 py-2.5 text-sm text-foreground ring-1 ring-white/[0.08] transition-all duration-200 placeholder:text-muted-foreground/45 focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
            {!usernameValid && (
              <p className="mt-1.5 text-xs leading-5 text-warning">
                Use 3-32 letters, numbers, or underscores.
              </p>
            )}
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/60">
              Email
            </span>
            <input
              value={profile.email ?? ""}
              readOnly
              className="mt-1.5 w-full rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-sm text-foreground/62 ring-1 ring-white/[0.06]"
            />
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
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
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
  tone: Tone;
  icon: LucideIcon;
} {
  if (s.currentWin > 0) {
    return {
      value: `${s.currentWin} ${s.currentWin === 1 ? "Win" : "Wins"}`,
      tone: "success",
      icon: Flame,
    };
  }
  if (s.currentLoss > 0) {
    return {
      value: `${s.currentLoss} ${s.currentLoss === 1 ? "Loss" : "Losses"}`,
      tone: "destructive",
      icon: TrendingDown,
    };
  }
  return { value: "No streak yet", tone: "info", icon: Crosshair };
}

export function DashboardView() {
  const [displayGreeting, setDisplayGreeting] = useState("Welcome back");
  const [newOpen, setNewOpen] = useState(false);
  const [reviewTrade, setReviewTrade] = useState<{ id: string; number: number } | null>(null);
  const [introOpen, setIntroOpen] = useState(false);
  const [introMarkedLocal, setIntroMarkedLocal] = useState(false);
  const tradesFn = useServerFn(listTrades);
  const profileFn = useServerFn(getProfile);
  const updateProfileFn = useServerFn(updateProfile);
  const markIntroSeenFn = useServerFn(markIntroSeen);
  const accountsFn = useServerFn(listTradingAccounts);
  const qc = useQueryClient();
  const { data: trades } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => tradesFn() });
  const { data: profile } = useSuspenseQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const { data: accounts } = useQuery({
    queryKey: ["trading-accounts"],
    queryFn: () => accountsFn(),
  });
  const db = useMemo(() => (trades ?? []) as DbTrade[], [trades]);
  const realDb = useMemo(() => db.filter((trade) => !isPaperTrade(trade)), [db]);

  useEffect(() => {
    const updateGreeting = () => setDisplayGreeting(getBrowserLocalGreeting());
    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeAccount: TradingAccount | null = useMemo(
    () => (accounts ?? []).find((a) => a.is_active) ?? null,
    [accounts],
  );

  // Lifetime = real trades across every account.
  const lifetimeRows = useMemo(() => realDb.map(toAnalytics), [realDb]);

  // Active-account-scoped rows (for current balance / charts).
  const activeDb = useMemo(() => {
    if (!activeAccount) return realDb;
    return realDb.filter((t) => t.account_id === activeAccount.id);
  }, [realDb, activeAccount]);
  const activeRows = useMemo(() => {
    if (!activeAccount) return lifetimeRows;
    return activeDb.map(toAnalytics);
  }, [activeAccount, activeDb, lifetimeRows]);

  const o = useMemo(() => overview(activeRows), [activeRows]);
  const eq = useMemo(() => equityCurve(activeRows), [activeRows]);
  const streak = useMemo(() => streaks(realDb), [realDb]);

  const recent = useMemo(() => [...realDb].slice(0, 5), [realDb]);
  const tradeNumbersById = useMemo(() => numberTradesById(realDb), [realDb]);

  // ------ Today snapshot (Phase 3: lighter daily-focused dashboard) ------
  const todayStr = localDateKey();
  const todayTrades = useMemo(
    () => realDb.filter((t) => t.trade_date === todayStr),
    [realDb, todayStr],
  );
  const todayNetR = useMemo(() => sumRecordedR(todayTrades.map(toAnalytics)), [todayTrades]);

  // ------ Journal completeness reminder ------
  // Status is derived from quick-capture essentials plus screenshot + reasoning.
  const journalGaps = useMemo(() => {
    const incomplete = realDb.filter((t) => getReviewStatus(t) === "incomplete").length;
    const needsReview = realDb.filter((t) => getReviewStatus(t) === "needs_review").length;
    const reviewed = realDb.filter((t) => getReviewStatus(t) === "reviewed").length;
    return { incomplete, needsReview, reviewed };
  }, [realDb]);
  const hasJournalGaps = realDb.length > 0 && journalGaps.incomplete + journalGaps.needsReview > 0;

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const currentMonthRows = useMemo(
    () => activeRows.filter((t) => t.trade_date.startsWith(ym)),
    [activeRows, ym],
  );
  const monthChart = useMemo(() => {
    const eqM = equityCurve(currentMonthRows);
    return eqM.map((p) => ({ d: p.tradeIndex === 0 ? "0" : p.date.slice(8), v: p.cumR }));
  }, [currentMonthRows]);

  const equityAll = useMemo(() => {
    return eq.map((point) => ({ d: point.tradeIndex === 0 ? "0" : point.date, v: point.cumR }));
  }, [eq]);

  // Account overview math uses canonical per-trade dollar P&L.
  const sumR = useMemo(() => sumRecordedR(activeRows), [activeRows]);

  const accountCount = accounts?.length ?? 0;
  const profileIncomplete = isProfileIncomplete(profile);
  const hasSeenIntro = profile?.has_seen_intro ?? true;
  const shouldShowIntroGuide = accounts !== undefined && accountCount === 0 && realDb.length === 0;
  const displayName = profile?.display_name?.trim() || "Trader";
  const reviewedTradesCount = useMemo(
    () => realDb.filter((trade) => getReviewStatus(trade) === "reviewed").length,
    [realDb],
  );
  const [scopeUnlockDismissed, setScopeUnlockDismissed] = useState(() => {
    try {
      return localStorage.getItem("edgescope.scopeUnlockDismissed") === "true";
    } catch {
      return false;
    }
  });
  const hasFirstReview = reviewedTradesCount > 0;
  const scopeReady = reviewedTradesCount >= SCOPE_UNLOCK_THRESHOLD;
  const activeReviewedTradesCount = useMemo(
    () => activeDb.filter((trade) => getReviewStatus(trade) === "reviewed").length,
    [activeDb],
  );
  const executionFocus = useMemo(() => {
    const latestTrade = [...realDb].sort((a, b) =>
      (b.trade_date + (b.trade_time ?? "")).localeCompare(a.trade_date + (a.trade_time ?? "")),
    )[0];
    const latestR = latestTrade ? rrNum(latestTrade.achieved_rr) : 0;

    if (streak.currentLoss >= 3) {
      return {
        tone: "warning" as Tone,
        icon: AlertTriangle,
        headline: "Losing streak detected",
        message: `You're on a ${streak.currentLoss}-trade losing streak. Slow down and make sure the next trade fits your plan.`,
        secondary: "Loss streaks can happen. Keep risk steady.",
      };
    }
    if (streak.currentWin >= 3) {
      return {
        tone: "primary" as Tone,
        icon: Check,
        headline: "Strong run detected",
        message: `You've had ${streak.currentWin} winning trades in a row. Keep the next trade planned and risk steady.`,
        secondary: "Good results should not change your rules.",
      };
    }
    if (latestTrade && latestR <= -2) {
      return {
        tone: "warning" as Tone,
        icon: AlertTriangle,
        headline: "Large loss logged",
        message:
          "Your latest trade was a larger loss. Review what happened before taking the next one.",
        secondary: "Check whether it was normal setup risk or something to adjust.",
      };
    }
    return {
      tone: "primary" as Tone,
      icon: ClipboardCheck,
      headline: "Stay process-first",
      message: "Wait for your plan, keep risk steady, and review the trade after execution.",
      secondary: "Consistent records make your edge easier to see.",
    };
  }, [realDb, streak.currentLoss, streak.currentWin]);
  const currentStreakStat = useMemo(() => formatCurrentStreak(streak), [streak]);

  // Guide stage — only show before first review is complete
  const activationGuide = useMemo(() => {
    if (hasFirstReview) return null;
    if (accountCount === 0) {
      return {
        stage: "account" as const,
        eyebrow: "SETUP",
        title: "Create a trading account",
        body: "Separate live, demo, funded, or backtest work.",
        cta: "Create Trading Account",
        to: "/accounts" as const,
      };
    }
    if (realDb.length === 0) {
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
      title: "Complete the review",
      body: "Capture the chart context, reasoning, and review details for this trade.",
      cta: "Complete review",
      to: "/trades" as const,
    };
  }, [accountCount, realDb.length, hasFirstReview]);

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

  useEffect(() => {
    if (!shouldShowIntroGuide) setIntroOpen(false);
  }, [shouldShowIntroGuide]);

  useEffect(() => {
    if (!profile || profileIncomplete || hasSeenIntro || introMarkedLocal) return;
    setIntroOpen(true);
    setIntroMarkedLocal(true);
    markIntroSeenMutation.mutate();
  }, [hasSeenIntro, introMarkedLocal, profile, profileIncomplete, markIntroSeenMutation]);

  const closeIntro = () => {
    setIntroOpen(false);
    if (!profile || hasSeenIntro || introMarkedLocal) return;
    setIntroMarkedLocal(true);
    markIntroSeenMutation.mutate();
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow="Dashboard"
        title={`${displayGreeting}, ${displayName}`}
        description="Your trading overview, journal gaps, account health, and review momentum."
        actions={
          <button
            onClick={() => setNewOpen(true)}
            className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary/85 px-5 py-2.5 text-sm font-semibold text-primary-foreground ring-1 ring-primary/40 shadow-[0_0_0_1px_oklch(0.68_0.23_295/0.35),0_8px_28px_-6px_oklch(0.68_0.23_295/0.55),0_0_44px_-10px_oklch(0.68_0.23_295/0.65)] transition-all duration-200 hover:-translate-y-px hover:brightness-110 hover:shadow-[0_0_0_1px_oklch(0.68_0.23_295/0.5),0_12px_36px_-6px_oklch(0.68_0.23_295/0.7),0_0_64px_-12px_oklch(0.68_0.23_295/0.85)]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-br from-white/15 to-transparent opacity-60 mix-blend-overlay"
            />
            <Plus className="relative h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
            <span className="relative">New trade</span>
          </button>
        }
      />

      {/* Activation guide — only before first review */}
      {accounts !== undefined && !profileIncomplete && activationGuide && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionTransition}
          className={`mt-6 w-full overflow-hidden rounded-2xl border border-primary/18 bg-[radial-gradient(circle_at_top_left,oklch(0.68_0.23_295/0.08),transparent_32%),linear-gradient(145deg,oklch(0.14_0.022_270/0.9),oklch(0.09_0.014_270/0.86))] p-5 shadow-[0_18px_52px_-42px_oklch(0.68_0.23_295/0.36)] ring-1 ring-white/[0.05] backdrop-blur-xl sm:max-w-xl ${INTRO_CARD_HOVER}`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25 shadow-[0_0_28px_-12px_oklch(0.68_0.23_295/0.8)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/85">
                {activationGuide.eyebrow}
              </div>
              <h2 className="mt-1 text-lg font-bold tracking-tight">{activationGuide.title}</h2>
              <p className="mt-1.5 text-sm leading-6 text-foreground/68">{activationGuide.body}</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {activationGuide.to ? (
                  <Link
                    to={activationGuide.to}
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:-translate-y-px hover:brightness-110"
                  >
                    {activationGuide.cta}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewOpen(true)}
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:-translate-y-px hover:brightness-110"
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
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25 shadow-[0_0_28px_-12px_oklch(0.68_0.23_295/0.8)]">
              <Sparkles className="h-5 w-5" />
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
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={`relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[radial-gradient(circle_at_top_left,oklch(0.68_0.23_295/0.1),transparent_34%),linear-gradient(145deg,oklch(0.12_0.02_270/0.96),oklch(0.075_0.012_270/0.98))] p-7 shadow-[0_22px_70px_-34px_oklch(0_0_0/0.86),0_0_38px_-28px_oklch(0.68_0.23_295/0.46)] ${INTRO_CARD_HOVER}`}
            >
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/30 shadow-[0_0_32px_-10px_oklch(0.68_0.23_295/0.85)]">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/90">
                    Getting started
                  </div>
                  <h2 id="intro-guide-title" className="mt-1 text-2xl font-bold tracking-tight">
                    Your trading review starts here.
                  </h2>
                  {activationGuide && (
                    <div className="mt-4 rounded-xl bg-primary/[0.08] px-4 py-3 ring-1 ring-primary/25">
                      <div className="text-xs font-semibold text-primary">Next step</div>
                      <div className="mt-1 text-sm font-bold text-foreground">
                        {activationGuide.title}
                      </div>
                      <p className="mt-0.5 text-sm leading-5 text-foreground/80">
                        {activationGuide.body}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-7 grid gap-3">
                {INTRO_WORKFLOW.map(({ icon: Icon, title, body }, index) => {
                  const completed = (() => {
                    if (index === 0) return accountCount > 0;
                    if (index === 1) return realDb.length > 0;
                    if (index === 2) return hasFirstReview;
                    return false;
                  })();
                  const current = !completed && activationGuide?.title === title;
                  return (
                    <div
                      key={title}
                      className={cn(
                        `flex items-start gap-3 rounded-xl border px-4 py-3.5 ring-1 ${INTRO_CARD_HOVER}`,
                        completed
                          ? "border-success/18 bg-success/[0.045] ring-success/[0.08]"
                          : current
                            ? "border-primary/28 bg-white/[0.075] ring-primary/[0.18]"
                            : "border-white/[0.08] bg-white/[0.045] ring-white/[0.04]",
                      )}
                    >
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
                          {completed && (
                            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                              Done
                            </span>
                          )}
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
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:-translate-y-px hover:brightness-110 hover:shadow-[var(--shadow-glow-lg)]"
                  >
                    {activationGuide.cta}
                  </Link>
                ) : (
                  <button
                    onClick={() => {
                      closeIntro();
                      setNewOpen(true);
                    }}
                    className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-all duration-200 hover:-translate-y-px hover:brightness-110 hover:shadow-[var(--shadow-glow-lg)]"
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
            nextNum={realDb.length + 1}
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
        <div className="glow-card rounded-2xl p-5">
          <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
            TODAY NET R
          </div>
          <div
            className={cn(
              "mt-1.5 text-3xl font-bold tabular-nums",
              todayNetR > 0 && "text-success",
              todayNetR < 0 && "text-destructive",
            )}
          >
            {todayTrades.length === 0
              ? "—"
              : `${todayNetR > 0 ? "+" : ""}${Math.abs(todayNetR).toFixed(2)}R`}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Net result today</div>
        </div>
      </div>

      {/* Execution Focus */}
      {hasFirstReview && (
        <div
          className={cn(
            "mt-4 flex flex-col gap-4 rounded-2xl px-5 py-4 ring-1 sm:flex-row sm:items-center sm:justify-between",
            executionFocus.tone === "warning"
              ? "bg-[linear-gradient(135deg,oklch(0.15_0.025_70/0.72),oklch(0.09_0.014_270/0.9))] ring-warning/[0.18]"
              : "bg-[linear-gradient(135deg,oklch(0.15_0.035_295/0.64),oklch(0.09_0.014_270/0.9))] ring-primary/[0.16]",
          )}
        >
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/[0.06]",
                toneStyles[executionFocus.tone].icon,
              )}
            >
              <executionFocus.icon className="h-5 w-5" />
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
          <div className="rounded-xl bg-white/[0.035] px-3.5 py-2 text-xs font-medium leading-5 text-foreground/76 ring-1 ring-white/[0.055] sm:max-w-[270px]">
            {executionFocus.secondary}
          </div>
        </div>
      )}

      {/* Journal completeness reminder */}
      {hasJournalGaps && (
        <Link
          to="/trades"
          className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-warning/[0.045] px-5 py-3.5 ring-1 ring-warning/16 transition-all hover:bg-warning/[0.065]"
        >
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <div className="text-sm font-semibold">Journal reminder</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
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
          <span className="text-xs font-medium text-warning">Complete journal &rarr;</span>
        </Link>
      )}

      {/* KPI Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:auto-rows-fr">
        <StatCard icon={Briefcase} label="TOTAL TRADES" value={o.total} tone="info" />
        <StatCard
          icon={Target}
          label="WIN RATE"
          value={o.winRate == null ? "—" : o.winRate}
          decimals={1}
          suffix="%"
          tone="primary"
          sub={o.winRate == null ? "No closed trades" : undefined}
        />
        <StatCard
          icon={TrendingUp}
          label="AVERAGE RR"
          value={o.avgRR ?? 0}
          decimals={2}
          suffix="R"
          tone="success"
          sub={o.avgRR == null ? "No R recorded" : undefined}
        />
        <StatCard
          icon={Trophy}
          label="NET R"
          value={sumR}
          decimals={2}
          suffix="R"
          tone={sumR >= 0 ? "success" : "destructive"}
        />
        <StatCard
          icon={ClipboardList}
          label="REVIEWED TRADES"
          value={activeReviewedTradesCount}
          tone="warning"
          sub={o.total ? `${activeReviewedTradesCount} of ${o.total}` : "No trades yet"}
        />
        <StatCard
          icon={currentStreakStat.icon}
          label="CURRENT STREAK"
          value={currentStreakStat.value === "No streak yet" ? "—" : currentStreakStat.value}
          tone={currentStreakStat.tone}
          sub={currentStreakStat.value === "No streak yet" ? "No closed trades yet" : undefined}
        />
      </div>

      {/* Recent trades + Monthly performance */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div
          {...card}
          transition={{ ...motionTransition, delay: 0.04 }}
          className="section-card rounded-2xl p-5 lg:col-span-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4 text-primary" /> Recent trades
            </h3>
            <Link
              to="/trades"
              className="text-xs font-medium text-primary transition-colors duration-200 hover:text-primary-glow"
            >
              View all →
            </Link>
          </div>
          <div className="mt-4 space-y-1">
            {recent.length === 0 && (
              <PremiumEmptyState
                icon={History}
                title="No trades logged yet"
                description="Log your first trade to start building an execution record."
                compact
              />
            )}
            {recent.map((t, index) => {
              const rr = rrNum(t.achieved_rr);
              const tradeNumber = tradeNumbersById.get(t.id) ?? realDb.length - index;
              const tone: Tone =
                t.result === "win" ? "success" : t.result === "loss" ? "destructive" : "info";
              const label =
                t.result === "win"
                  ? "WIN"
                  : t.result === "loss"
                    ? "LOSS"
                    : t.result === "breakeven"
                      ? "BE"
                      : "—";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setReviewTrade({ id: t.id, number: tradeNumber })}
                  className="grid w-full grid-cols-[minmax(0,1fr)_minmax(78px,92px)_minmax(68px,78px)] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-all duration-200 hover:bg-white/[0.04] focus:outline-none focus-visible:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-primary/30"
                >
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-sm font-medium">{t.instrument}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatTradeDateOnly(t.trade_date)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 justify-self-end rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider",
                      toneStyles[tone].badge,
                    )}
                  >
                    {label}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 justify-self-end text-sm font-semibold tabular-nums",
                      tone === "success" && "text-success",
                      tone === "destructive" && "text-destructive",
                      tone === "info" && "text-muted-foreground",
                    )}
                  >
                    {rr > 0 ? "+" : ""}
                    {rr.toFixed(2)}R
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>

        <div className="lg:col-span-7">
          <MonthlyPerformanceTabbed
            monthChart={monthChart}
            monthLabel={monthLabel}
            currentMonthTradeCount={currentMonthRows.length}
          />
        </div>
      </div>

      {/* Overall Equity Curve */}
      <OverallEquitySection data={equityAll} tradeCount={activeRows.length} />

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
  );
}

function MonthlyPerformanceTabbed({
  monthChart,
  monthLabel,
  currentMonthTradeCount,
}: {
  monthChart: { d: string; v: number }[];
  monthLabel: string;
  currentMonthTradeCount: number;
}) {
  return (
    <motion.div
      {...card}
      transition={{ ...motionTransition, delay: 0.08 }}
      className="section-card rounded-2xl p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Calendar className="h-4 w-4 text-primary" /> Monthly performance
        </h3>
        <span className="rounded-md bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {monthLabel}
        </span>
      </div>

      <div className="mt-4 h-[260px]">
        {currentMonthTradeCount < 3 ? (
          <DashboardLowDataState description="Log at least 3 trades to make monthly performance useful." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthChart} margin={{ top: 10, right: 8, left: -16, bottom: 8 }}>
              <defs>
                <linearGradient id="dash-month" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.74 0.19 152)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="oklch(0.74 0.19 152)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.04)" vertical={false} />
              <XAxis
                dataKey="d"
                tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.13 0.018 270)",
                  border: "1px solid oklch(1 0 0 / 0.08)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v.toFixed(2)}R`, "Cum R"]}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke="oklch(0.74 0.19 152)"
                strokeWidth={2}
                fill="url(#dash-month)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}

function OverallEquitySection({
  data,
  tradeCount,
}: {
  data: { d: string; v: number }[];
  tradeCount: number;
}) {
  return (
    <motion.div
      {...card}
      transition={{ ...motionTransition, delay: 0.1 }}
      className="mt-4 section-card rounded-2xl p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" /> Overall equity curve
        </h3>
        <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          All-time
        </span>
      </div>
      <div className="mt-4 h-[320px]">
        {tradeCount < 3 ? (
          <DashboardLowDataState description="Log at least 3 trades to make the equity curve useful." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 8 }}>
              <defs>
                <linearGradient id="dash-equity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.68 0.23 295)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="oklch(0.68 0.23 295)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.04)" vertical={false} />
              <XAxis
                dataKey="d"
                tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }}
                axisLine={false}
                tickLine={false}
                tickMargin={10}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.13 0.018 270)",
                  border: "1px solid oklch(1 0 0 / 0.08)",
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: "0 8px 32px -8px oklch(0 0 0 / 0.5)",
                }}
                formatter={(v: number) => [`${v.toFixed(2)}R`, "Equity"]}
                labelStyle={{ color: "oklch(0.6 0 0)" }}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke="oklch(0.78 0.19 295)"
                strokeWidth={2}
                fill="url(#dash-equity)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}

function DashboardLowDataState({
  title = "More trades needed",
  description,
}: {
  title?: string;
  description: string;
}) {
  return (
    <div className="grid h-full min-h-[160px] place-items-center rounded-xl bg-white/[0.02] px-5 py-8 text-center ring-1 ring-white/[0.04]">
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
