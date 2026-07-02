import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Target,
  Briefcase,
  TrendingUp,
  Calendar,
  Trophy,
  XOctagon,
  Scale,
  Crosshair,
  Clock,
  PieChart as PieIcon,
  Flame,
  Plus,
  Wallet,
  Shield,
  AlertTriangle,
  ClipboardList,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TradeFormModal } from "@/components/trades/trade-form-modal";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrades } from "@/lib/trades.functions";
import { getProfile, markIntroSeen, updateProfile } from "@/lib/account.functions";
import {
  getTradingPreferences,
  type TradingPreferences,
} from "@/lib/trading-preferences.functions";
import { listTradingAccounts, type TradingAccount } from "@/lib/trading-accounts.functions";
import { useISTGreeting } from "@/lib/use-ist-greeting";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";
import { cn } from "@/lib/utils";
import { overview, categoryStats, equityCurve, sessionStats, fmtPct } from "@/lib/analytics";
import { toAnalytics, rrNum, streaks, formatTradeWhen, type DbTrade } from "@/lib/trade-mappers";
import { sessionLabel } from "@/lib/trade-constants";
import { toast } from "sonner";

// Convert R-multiples to currency using starting balance × risk %.
function rToCurrency(r: number, startingBalance: number | null, riskPct: number | null): number {
  if (startingBalance == null || riskPct == null) return 0;
  return startingBalance * (riskPct / 100) * r;
}

function prefsRiskReady(p: TradingPreferences | null | undefined): boolean {
  return !!p && p.default_risk_pct != null;
}

function fmtMoney(v: number): string {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
    body: "Add reasoning, screenshots, mistakes, and grade to build useful feedback.",
  },
];

const SCOPE_UNLOCK_THRESHOLD = 10;
const INTRO_CARD_HOVER =
  "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_22px_70px_-34px_oklch(0.68_0.23_295/0.55)]";
const SOFT_ACCENT = "text-primary/80";

type DashboardProfile = {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  has_seen_intro: boolean;
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
  const prefix = emailPrefix(profile.email);
  const username = normalizeHandle(profile.username);
  const display = normalizeHandle(profile.display_name);
  return !display || display === prefix || username === prefix;
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
  value: number;
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
      className="glow-card interactive-card group relative overflow-hidden rounded-2xl p-5 hover:border-white/[0.1]"
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/[0.06] transition-transform duration-300 group-hover:scale-105",
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
            <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
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
    <div className="glow-card interactive-card group flex items-center gap-4 rounded-2xl p-5 hover:border-white/[0.1]">
      <div
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/[0.06] transition-transform duration-300 group-hover:scale-105",
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
        className={`relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.1] bg-[radial-gradient(circle_at_top_left,oklch(0.68_0.23_295/0.14),transparent_34%),linear-gradient(145deg,oklch(0.12_0.02_270/0.97),oklch(0.075_0.012_270/0.98))] p-7 shadow-[0_28px_90px_-28px_oklch(0_0_0/0.9),0_0_58px_-26px_oklch(0.68_0.23_295/0.7)] ${INTRO_CARD_HOVER}`}
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

export function DashboardView() {
  const greeting = useISTGreeting();
  const [newOpen, setNewOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [introMarkedLocal, setIntroMarkedLocal] = useState(false);
  const tradesFn = useServerFn(listTrades);
  const profileFn = useServerFn(getProfile);
  const updateProfileFn = useServerFn(updateProfile);
  const markIntroSeenFn = useServerFn(markIntroSeen);
  const prefsFn = useServerFn(getTradingPreferences);
  const accountsFn = useServerFn(listTradingAccounts);
  const qc = useQueryClient();
  const { data: trades } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => tradesFn() });
  const { data: profile } = useSuspenseQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const { data: prefs } = useQuery({ queryKey: ["trading-preferences"], queryFn: () => prefsFn() });
  const { data: accounts } = useQuery({
    queryKey: ["trading-accounts"],
    queryFn: () => accountsFn(),
  });
  const db = useMemo(() => (trades ?? []) as DbTrade[], [trades]);

  const activeAccount: TradingAccount | null = useMemo(
    () => (accounts ?? []).find((a) => a.is_active) ?? null,
    [accounts],
  );

  // Lifetime = all trades across every account.
  const lifetimeRows = useMemo(() => db.map(toAnalytics), [db]);

  // Active-account-scoped rows (for current balance / charts).
  const activeRows = useMemo(() => {
    if (!activeAccount) return lifetimeRows;
    return db.filter((t) => t.account_id === activeAccount.id).map(toAnalytics);
  }, [db, activeAccount, lifetimeRows]);

  const o = useMemo(() => overview(activeRows), [activeRows]);
  const lifetime = useMemo(() => overview(lifetimeRows), [lifetimeRows]);
  const cats = useMemo(() => categoryStats(activeRows).slice(0, 6), [activeRows]);
  const eq = useMemo(() => equityCurve(activeRows), [activeRows]);
  const streak = useMemo(() => streaks(db), [db]);
  const bestSession = useMemo(() => {
    const stats = sessionStats(lifetimeRows).filter((s) => s.count >= 5 && s.winRate != null);
    if (!stats.length) return null;
    return [...stats].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
  }, [lifetimeRows]);

  const recent = useMemo(() => [...db].slice(0, 5), [db]);

  // ------ Today snapshot (Phase 3: lighter daily-focused dashboard) ------
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTrades = useMemo(() => db.filter((t) => t.trade_date === todayStr), [db, todayStr]);
  const todayNetR = useMemo(
    () =>
      todayTrades.reduce(
        (acc, t) => acc + (t.achieved_rr == null ? 0 : Number(t.achieved_rr) || 0),
        0,
      ),
    [todayTrades],
  );

  // ------ Journal completeness reminder ------
  // Only flag trades that are missing genuinely important summary fields.
  // We require: a result (win/loss/BE), an achieved R, and a reasoning note.
  // Empty journals or fully-filled journals will NOT show the reminder.
  const journalGaps = useMemo(() => {
    const missingResult = db.filter((t) => !t.result).length;
    const missingAchievedR = db.filter((t) => t.achieved_rr == null || t.achieved_rr === "").length;
    const missingReasoning = db.filter((t) => !t.reasoning || !t.reasoning.trim()).length;
    return { missingResult, missingAchievedR, missingReasoning };
  }, [db]);
  const hasJournalGaps =
    db.length > 0 &&
    journalGaps.missingResult + journalGaps.missingAchievedR + journalGaps.missingReasoning > 0;

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const monthChart = useMemo(() => {
    const monthTrades = activeRows.filter((t) => t.trade_date.startsWith(ym));
    const eqM = equityCurve(monthTrades);
    return eqM.map((p) => ({ d: p.date.slice(8), v: p.cumR }));
  }, [activeRows, ym]);

  const equityAll = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const p of eq) {
      const k = p.date.slice(0, 7);
      byMonth.set(k, p.cumR);
    }
    return Array.from(byMonth.entries()).map(([k, v]) => {
      const [, m] = k.split("-");
      return { d: MONTHS[Number(m) - 1], v };
    });
  }, [eq]);

  // Account overview math (in currency, using active account starting balance + prefs risk %).
  const startingBalance = activeAccount?.starting_balance ?? null;
  const riskPct = prefs?.default_risk_pct ?? null;
  const sumR = useMemo(
    () =>
      activeRows.reduce(
        (acc, t) => acc + (t.achieved_rr == null ? 0 : Number(t.achieved_rr) || 0),
        0,
      ),
    [activeRows],
  );
  const lifetimeSumR = useMemo(
    () =>
      lifetimeRows.reduce(
        (acc, t) => acc + (t.achieved_rr == null ? 0 : Number(t.achieved_rr) || 0),
        0,
      ),
    [lifetimeRows],
  );
  const netPnl = rToCurrency(sumR, startingBalance, riskPct);
  const currentBalance = (startingBalance ?? 0) + netPnl;

  // Account growth (cumulative $) line and monthly P&L bars derived from R per trade.
  const growthSeries = useMemo(() => {
    if (startingBalance == null || riskPct == null) return [];
    let cum = startingBalance;
    return eq.map((p, i) => {
      const prev = i === 0 ? 0 : eq[i - 1].cumR;
      const incrementR = p.cumR - prev;
      cum += rToCurrency(incrementR, startingBalance, riskPct);
      return { d: p.date, v: Number(cum.toFixed(2)) };
    });
  }, [eq, startingBalance, riskPct]);

  const monthlyPnlSeries = useMemo(() => {
    if (startingBalance == null || riskPct == null) return [];
    const byMonth = new Map<string, number>();
    for (const t of activeRows) {
      if (t.achieved_rr == null) continue;
      const k = t.trade_date.slice(0, 7);
      byMonth.set(k, (byMonth.get(k) ?? 0) + (Number(t.achieved_rr) || 0));
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, r]) => {
        const [, m] = k.split("-");
        return {
          d: MONTHS[Number(m) - 1],
          v: Number(rToCurrency(r, startingBalance, riskPct).toFixed(2)),
        };
      });
  }, [activeRows, startingBalance, riskPct]);

  const hasActiveAccount = !!activeAccount && prefsRiskReady(prefs);
  const accountCount = accounts?.length ?? 0;
  const profileIncomplete = isProfileIncomplete(profile);
  const hasSeenIntro = profile?.has_seen_intro ?? true;
  const shouldShowIntroGuide = accounts !== undefined && accountCount === 0 && db.length === 0;
  const displayName = profile?.display_name?.trim() || "Trader";
  const reviewedTradesCount = useMemo(
    () =>
      db.filter(
        (trade) =>
          !!trade.reasoning?.trim() ||
          !!trade.grade ||
          (trade.mistake_tags?.length ?? 0) > 0 ||
          (trade.trade_screenshots?.length ?? 0) > 0,
      ).length,
    [db],
  );
  const [scopeUnlockDismissed, setScopeUnlockDismissed] = useState(() => {
    try { return localStorage.getItem("edgescope.scopeUnlockDismissed") === "true"; }
    catch { return false; }
  });
  const hasFirstReview = reviewedTradesCount > 0;
  const scopeReady = reviewedTradesCount >= SCOPE_UNLOCK_THRESHOLD;

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
    if (db.length === 0) {
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
      body: "Add reasoning, screenshots, mistakes, and grade.",
      cta: "Complete review",
      to: "/trades" as const,
    };
  }, [accountCount, db.length, hasFirstReview]);

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
  }, [hasSeenIntro, introMarkedLocal, profile, profileIncomplete]);

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
        title={`${greeting}, ${displayName}`}
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
          className={`mt-6 w-full overflow-hidden rounded-2xl border border-primary/20 bg-[radial-gradient(circle_at_top_left,oklch(0.68_0.23_295/0.12),transparent_32%),linear-gradient(145deg,oklch(0.14_0.022_270/0.9),oklch(0.09_0.014_270/0.86))] p-5 shadow-[0_20px_70px_-44px_oklch(0.68_0.23_295/0.55)] ring-1 ring-white/[0.05] backdrop-blur-xl sm:max-w-xl ${INTRO_CARD_HOVER}`}
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
              <p className="mt-1.5 text-sm leading-6 text-foreground/68">
                {activationGuide.body}
              </p>
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
          className={`mt-6 w-full overflow-hidden rounded-2xl border border-primary/20 bg-[radial-gradient(circle_at_top_left,oklch(0.68_0.23_295/0.12),transparent_32%),linear-gradient(145deg,oklch(0.14_0.022_270/0.9),oklch(0.09_0.014_270/0.86))] p-5 shadow-[0_20px_70px_-44px_oklch(0.68_0.23_295/0.55)] ring-1 ring-white/[0.05] backdrop-blur-xl sm:max-w-xl ${INTRO_CARD_HOVER}`}
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
                    try { localStorage.setItem("edgescope.scopeUnlockDismissed", "true"); } catch {}
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
              className={`relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[radial-gradient(circle_at_top_left,oklch(0.68_0.23_295/0.16),transparent_34%),linear-gradient(145deg,oklch(0.12_0.02_270/0.96),oklch(0.075_0.012_270/0.98))] p-7 shadow-[0_28px_90px_-28px_oklch(0_0_0/0.9),0_0_64px_-24px_oklch(0.68_0.23_295/0.75)] ${INTRO_CARD_HOVER}`}
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
                    Your trading <span className={SOFT_ACCENT}>review</span> starts here.
                  </h2>
                  {activationGuide && (
                    <div className="mt-4 rounded-xl bg-primary/[0.08] px-4 py-3 ring-1 ring-primary/25">
                      <div className="text-xs font-semibold text-primary">Next step</div>
                      <div className="mt-1 text-sm font-bold text-foreground">{activationGuide.title}</div>
                      <p className="mt-0.5 text-sm leading-5 text-foreground/68">{activationGuide.body}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-7 grid gap-3">
                {INTRO_WORKFLOW.map(({ icon: Icon, title, body }, index) => {
                  const completed = (() => {
                    if (index === 0) return accountCount > 0;
                    if (index === 1) return db.length > 0;
                    if (index === 2) return hasFirstReview;
                    return false;
                  })();
                  return (
                    <div
                      key={title}
                      className={`flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.045] px-4 py-3.5 ring-1 ring-white/[0.04] ${INTRO_CARD_HOVER}`}
                    >
                      <div className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1",
                        completed
                          ? "bg-success/15 text-success ring-success/25"
                          : "bg-primary/12 text-primary ring-primary/20",
                      )}>
                        {completed ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                          {completed && (
                            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success">
                              Done
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-foreground/68">{body}</p>
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
                    onClick={() => { closeIntro(); setNewOpen(true); }}
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
            nextNum={db.length + 1}
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

      {/* Journal completeness reminder */}
      {hasJournalGaps && (
        <Link
          to="/trades"
          className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-warning/[0.06] px-5 py-4 ring-1 ring-warning/20 transition-all hover:bg-warning/[0.08]"
        >
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <div className="text-sm font-semibold">Journal reminder</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {journalGaps.missingResult > 0 && (
                  <>{journalGaps.missingResult} trades missing result · </>
                )}
                {journalGaps.missingAchievedR > 0 && (
                  <>{journalGaps.missingAchievedR} missing achieved R · </>
                )}
                {journalGaps.missingReasoning > 0 && (
                  <>{journalGaps.missingReasoning} missing reasoning</>
                )}
              </div>
            </div>
          </div>
          <span className="text-xs font-medium text-warning">Complete journal →</span>
        </Link>
      )}

      {hasActiveAccount && activeAccount && (
        <div className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Wallet className="h-4 w-4 text-primary" /> Active account
            </h2>
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{activeAccount.name}</span>
              <span className="mx-1.5 opacity-50">·</span>
              <span className="capitalize">{activeAccount.account_type}</span>
              {(accounts?.length ?? 0) > 1 && (
                <Link to="/accounts" className="ml-3 text-primary hover:text-primary-glow">
                  Switch →
                </Link>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="glow-card interactive-card rounded-2xl p-5 ring-1 ring-primary/25 bg-primary/[0.04]">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-primary">
                CURRENT BALANCE
              </div>
              <div className="mt-1.5 text-3xl font-bold tabular-nums">
                {fmtMoney(currentBalance)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{activeAccount.name}</div>
            </div>
            <div className="glow-card interactive-card rounded-2xl p-5">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                STARTING BALANCE
              </div>
              <div className="mt-1.5 text-3xl font-bold tabular-nums">
                {fmtMoney(startingBalance ?? 0)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Baseline</div>
            </div>
            <div className="glow-card interactive-card rounded-2xl p-5">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                ACCOUNT NET P&amp;L
              </div>
              <div
                className={cn(
                  "mt-1.5 text-3xl font-bold tabular-nums",
                  netPnl > 0 && "text-success",
                  netPnl < 0 && "text-destructive",
                )}
              >
                {netPnl > 0 ? "+" : ""}
                {fmtMoney(netPnl)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {sumR >= 0 ? "+" : ""}
                {sumR.toFixed(2)}R on this account
              </div>
            </div>
          </div>

          {/* Lifetime Performance */}
          <div className="mt-6 glow-card rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="h-4 w-4 text-warning" /> Lifetime performance
              </h3>
              <span className="rounded-md bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                All accounts
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <LifetimeStat
                label="LIFETIME NET R"
                value={`${lifetimeSumR >= 0 ? "+" : ""}${lifetimeSumR.toFixed(2)}R`}
                tone={lifetimeSumR >= 0 ? "success" : "destructive"}
              />
              <LifetimeStat label="LIFETIME TRADES" value={String(lifetime.total)} tone="info" />
              <LifetimeStat
                label="WIN RATE"
                value={lifetime.winRate != null ? `${lifetime.winRate.toFixed(1)}%` : "—"}
                tone="primary"
              />
              <LifetimeStat
                label="AVG RR"
                value={lifetime.avgRR != null ? `${lifetime.avgRR.toFixed(2)}R` : "—"}
                tone="success"
              />
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Target}
          label="WIN RATE"
          value={o.winRate ?? 0}
          decimals={1}
          suffix="%"
          tone="primary"
          sub={o.winRate == null ? "No closed trades" : undefined}
        />
        <StatCard icon={Briefcase} label="TOTAL TRADES" value={o.total} tone="info" />
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
          icon={Calendar}
          label="THIS MONTH"
          value={o.thisMonth.count}
          tone="warning"
          sub={o.thisMonth.count ? `${fmtPct(o.thisMonth.winRate)} win rate` : "No trades yet"}
        />
      </div>

      {/* Mini stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MiniStat
          icon={Trophy}
          label="WINS"
          value={o.wins}
          sub={o.total ? `${((o.wins / o.total) * 100).toFixed(1)}%` : "0%"}
          tone="success"
        />
        <MiniStat
          icon={XOctagon}
          label="LOSSES"
          value={o.losses}
          sub={o.total ? `${((o.losses / o.total) * 100).toFixed(1)}%` : "0%"}
          tone="destructive"
        />
        <MiniStat
          icon={Scale}
          label="BREAKEVEN"
          value={o.breakeven}
          sub={o.total ? `${((o.breakeven / o.total) * 100).toFixed(1)}%` : "0%"}
          tone="primary"
        />
        <MiniStat
          icon={Crosshair}
          label="BEST SESSION"
          value={bestSession ? sessionLabel(bestSession.key) : "—"}
          sub={
            bestSession
              ? `${fmtPct(bestSession.winRate)} · ${bestSession.count} trades`
              : "Not enough data"
          }
          tone="info"
        />
      </div>

      {hasActiveAccount && (
        <div className="mt-6 glow-card rounded-2xl p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4 text-primary" /> Risk overview
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <RiskRow
              icon={Target}
              label="RISK PER TRADE"
              value={prefs?.default_risk_pct != null ? `${prefs.default_risk_pct}%` : "—"}
            />
            <RiskRow
              icon={AlertTriangle}
              label="MAX DAILY LOSS"
              value={prefs?.max_daily_loss != null ? fmtMoney(prefs.max_daily_loss) : "Not set"}
            />
            <RiskRow
              icon={Briefcase}
              label="MAX TRADES / DAY"
              value={
                prefs?.max_trades_per_day != null ? String(prefs.max_trades_per_day) : "Not set"
              }
            />
          </div>
        </div>
      )}

      {/* Recent trades + Monthly performance */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div
          {...card}
          transition={{ ...motionTransition, delay: 0.04 }}
          className="glow-card rounded-2xl p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-primary" /> Recent trades
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
                icon={Clock}
                title="No trades logged yet"
                description="Log your first trade to start building an execution record."
                compact
              />
            )}
            {recent.map((t) => {
              const rr = rrNum(t.achieved_rr);
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
                <div
                  key={t.id}
                  className="grid grid-cols-[1.4fr_auto_auto] items-center gap-3 rounded-xl px-2 py-2.5 transition-all duration-200 hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-sm font-medium">{t.instrument}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatTradeWhen(t.trade_date, t.trade_time)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider",
                      toneStyles[tone].badge,
                    )}
                  >
                    {label}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      tone === "success" && "text-success",
                      tone === "destructive" && "text-destructive",
                      tone === "info" && "text-muted-foreground",
                    )}
                  >
                    {rr > 0 ? "+" : ""}
                    {rr.toFixed(2)}R
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        <MonthlyPerformanceTabbed
          monthChart={monthChart}
          monthLabel={monthLabel}
          growth={growthSeries}
          monthlyPnl={monthlyPnlSeries}
          hasActiveAccount={hasActiveAccount}
        />
      </div>

      {/* Trading streak */}
      <TradingStreakSection s={streak} />

      {/* Overall Equity Curve */}
      <OverallEquitySection data={equityAll} />

      {/* Trades by setup */}
      <div className="mt-4 grid grid-cols-1 gap-4">
        <div className="glow-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <PieIcon className="h-4 w-4 text-primary" /> Trades by setup
            </h3>
            <Link
              to="/analytics"
              className="text-xs font-medium text-primary transition-colors duration-200 hover:text-primary-glow"
            >
              View analytics →
            </Link>
          </div>
          {cats.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No categories yet. Add a category when logging a trade.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {cats.map((s) => {
                const max = Math.max(...cats.map((c) => c.count));
                return (
                  <div key={s.key}>
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{s.key}</span>
                      <span className="font-semibold tabular-nums">{s.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-700 ease-out"
                        style={{ width: `${(s.count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function LifetimeStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const s = toneStyles[tone];
  return (
    <div className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.04]">
      <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums",
          s.badge.includes("text-success") && "text-success",
          s.badge.includes("text-destructive") && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function RiskRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.04]">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-white/[0.06]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function MonthlyPerformanceTabbed({
  monthChart,
  monthLabel,
  growth,
  monthlyPnl,
  hasActiveAccount,
}: {
  monthChart: { d: string; v: number }[];
  monthLabel: string;
  growth: { d: string; v: number }[];
  monthlyPnl: { d: string; v: number }[];
  hasActiveAccount: boolean;
}) {
  const [tab, setTab] = useState<"growth" | "monthly" | "current">(
    hasActiveAccount ? "growth" : "current",
  );

  const tabs: { id: "growth" | "monthly" | "current"; label: string; show: boolean }[] = [
    { id: "growth", label: "Account growth", show: hasActiveAccount },
    { id: "monthly", label: "Monthly P&L", show: hasActiveAccount },
    { id: "current", label: "This month", show: true },
  ];

  return (
    <motion.div
      {...card}
      transition={{ ...motionTransition, delay: 0.08 }}
      className="glow-card rounded-2xl p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Calendar className="h-4 w-4 text-primary" /> Monthly performance
        </h3>
        <span className="rounded-md bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {monthLabel}
        </span>
      </div>

      <div className="mt-4 inline-flex items-center gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.05]">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
                tab === t.id
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
      </div>

      <div className="mt-4 h-[260px]">
        {tab === "growth" &&
          (growth.length === 0 ? (
            <PremiumChartEmpty text="No closed trades yet." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growth} margin={{ top: 10, right: 8, left: -8, bottom: 8 }}>
                <defs>
                  <linearGradient id="dash-growth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.68 0.23 295)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="oklch(0.68 0.23 295)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(1 0 0 / 0.04)"
                  vertical={false}
                />
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
                  tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.13 0.018 270)",
                    border: "1px solid oklch(1 0 0 / 0.08)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [fmtMoney(v), "Balance"]}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="oklch(0.78 0.19 295)"
                  strokeWidth={2}
                  fill="url(#dash-growth)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ))}

        {tab === "monthly" &&
          (monthlyPnl.length === 0 ? (
            <PremiumChartEmpty text="No monthly data yet." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyPnl} margin={{ top: 10, right: 8, left: -8, bottom: 8 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(1 0 0 / 0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="d"
                  tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  cursor={{ fill: "oklch(1 0 0 / 0.03)" }}
                  contentStyle={{
                    background: "oklch(0.13 0.018 270)",
                    border: "1px solid oklch(1 0 0 / 0.08)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [fmtMoney(v), "P&L"]}
                />
                <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                  {monthlyPnl.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.v >= 0 ? "oklch(0.74 0.19 152)" : "oklch(0.64 0.22 22)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ))}

        {tab === "current" &&
          (monthChart.length === 0 ? (
            <PremiumChartEmpty text="No trades this month yet." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthChart} margin={{ top: 10, right: 8, left: -16, bottom: 8 }}>
                <defs>
                  <linearGradient id="dash-month" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.74 0.19 152)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.74 0.19 152)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(1 0 0 / 0.04)"
                  vertical={false}
                />
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
          ))}
      </div>
    </motion.div>
  );
}

function OverallEquitySection({ data }: { data: { d: string; v: number }[] }) {
  return (
    <motion.div
      {...card}
      transition={{ ...motionTransition, delay: 0.1 }}
      className="mt-4 glow-card rounded-2xl p-5"
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
        {data.length === 0 ? (
          <PremiumChartEmpty text="No closed trades yet." />
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

function PremiumChartEmpty({ text }: { text: string }) {
  return (
    <div className="grid h-full place-items-center rounded-xl bg-white/[0.02] text-sm text-muted-foreground ring-1 ring-white/[0.04]">
      {text}
    </div>
  );
}

function TradingStreakSection({
  s,
}: {
  s: { currentWin: number; currentLoss: number; longestWin: number; longestLoss: number };
}) {
  const streaks = [
    { label: "CURRENT WINNING STREAK", value: s.currentWin, tone: "success" as Tone, icon: Flame },
    {
      label: "CURRENT LOSING STREAK",
      value: s.currentLoss,
      tone: "destructive" as Tone,
      icon: XOctagon,
    },
    { label: "LONGEST WINNING STREAK", value: s.longestWin, tone: "success" as Tone, icon: Trophy },
    {
      label: "LONGEST LOSING STREAK",
      value: s.longestLoss,
      tone: "destructive" as Tone,
      icon: XOctagon,
    },
  ];
  return (
    <div className="ambient-halo mt-4 glow-card rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Flame className="h-4 w-4 text-warning" /> Trading streak
      </h3>
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {streaks.map((st) => {
          const Icon = st.icon;
          const s = toneStyles[st.tone];
          return (
            <div
              key={st.label}
              className="flex items-center gap-4 rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.04]"
            >
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
                  {st.label}
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{st.value}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
