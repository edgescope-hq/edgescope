import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target, Briefcase, TrendingUp, Calendar, Trophy, XOctagon, Scale, Crosshair,
  Clock, PieChart as PieIcon, Flame, Plus, Wallet, Shield, AlertTriangle,
  ClipboardList, Sparkles,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TradeFormModal } from "@/components/trades/trade-form-modal";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrades } from "@/lib/trades.functions";
import { getProfile } from "@/lib/account.functions";
import { getTradingPreferences, type TradingPreferences } from "@/lib/trading-preferences.functions";
import { listTradingAccounts, type TradingAccount } from "@/lib/trading-accounts.functions";
import { useISTGreeting } from "@/lib/use-ist-greeting";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { cn } from "@/lib/utils";
import {
  overview, categoryStats, equityCurve, sessionStats, fmtPct,
} from "@/lib/analytics";
import { toAnalytics, rrNum, streaks, formatTradeWhen, type DbTrade } from "@/lib/trade-mappers";
import { sessionLabel } from "@/lib/trade-constants";

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
  primary: { icon: "from-primary/25 to-primary/5 text-primary", badge: "bg-primary/15 text-primary" },
  info: { icon: "from-info/25 to-info/5 text-info", badge: "bg-info/15 text-info" },
  success: { icon: "from-success/25 to-success/5 text-success", badge: "bg-success/15 text-success" },
  warning: { icon: "from-warning/25 to-warning/5 text-warning", badge: "bg-warning/15 text-warning" },
  destructive: { icon: "from-destructive/25 to-destructive/5 text-destructive", badge: "bg-destructive/15 text-destructive" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const card = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function StatCard({
  icon: Icon, label, value, decimals = 0, suffix = "", tone, sub,
}: {
  icon: any; label: string; value: number; decimals?: number; suffix?: string; tone: Tone; sub?: string;
}) {
  const s = toneStyles[tone];
  return (
    <motion.div
      {...card}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glow-card interactive-card group relative overflow-hidden rounded-2xl p-5 hover:border-white/[0.1]"
    >
      <div className="flex items-start gap-4">
        <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/[0.06] transition-transform duration-300 group-hover:scale-105", s.icon)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">{label}</div>
          <div className="mt-1.5 text-3xl font-bold tracking-tight text-foreground">
            <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
          </div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
      </div>
    </motion.div>
  );
}

function MiniStat({ icon: Icon, label, value, sub, tone }: any) {
  const s = toneStyles[tone as Tone];
  return (
    <div className="glow-card interactive-card group flex items-center gap-4 rounded-2xl p-5 hover:border-white/[0.1]">
      <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/[0.06] transition-transform duration-300 group-hover:scale-105", s.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
        {sub && <div className={cn("text-xs font-medium", tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-muted-foreground")}>{sub}</div>}
      </div>
    </div>
  );
}

export function DashboardView() {
  const greeting = useISTGreeting();
  const [newOpen, setNewOpen] = useState(false);
  const tradesFn = useServerFn(listTrades);
  const profileFn = useServerFn(getProfile);
  const prefsFn = useServerFn(getTradingPreferences);
  const accountsFn = useServerFn(listTradingAccounts);
  const { data: trades } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => tradesFn() });
  const { data: profile } = useSuspenseQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const { data: prefs } = useQuery({ queryKey: ["trading-preferences"], queryFn: () => prefsFn() });
  const { data: accounts } = useQuery({ queryKey: ["trading-accounts"], queryFn: () => accountsFn() });
  const db = (trades ?? []) as DbTrade[];

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
    () => todayTrades.reduce((acc, t) => acc + (t.achieved_rr == null ? 0 : Number(t.achieved_rr) || 0), 0),
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
    () => activeRows.reduce((acc, t) => acc + (t.achieved_rr == null ? 0 : Number(t.achieved_rr) || 0), 0),
    [activeRows],
  );
  const lifetimeSumR = useMemo(
    () => lifetimeRows.reduce((acc, t) => acc + (t.achieved_rr == null ? 0 : Number(t.achieved_rr) || 0), 0),
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
        return { d: MONTHS[Number(m) - 1], v: Number(rToCurrency(r, startingBalance, riskPct).toFixed(2)) };
      });
  }, [activeRows, startingBalance, riskPct]);

  const hasActiveAccount = !!activeAccount && prefsRiskReady(prefs);
  const displayName = profile?.display_name || profile?.username || "trader";

  const [welcomeOpen, setWelcomeOpen] = useState(false);
  useEffect(() => {
    const dismissed = localStorage.getItem("edgescope_welcome_dismissed");
    if (!dismissed && db.length === 0) {
      setWelcomeOpen(true);
    }
  }, [db.length]);

  const dismissWelcome = () => {
    localStorage.setItem("edgescope_welcome_dismissed", "true");
    setWelcomeOpen(false);
  };

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl font-bold tracking-tight md:text-4xl"
          >
            {greeting}, {displayName} <span aria-hidden>👋</span>
          </motion.h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Here's your trading overview.</p>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary/85 px-5 py-2.5 text-sm font-semibold text-primary-foreground ring-1 ring-primary/40 shadow-[0_0_0_1px_oklch(0.68_0.23_295/0.35),0_8px_28px_-6px_oklch(0.68_0.23_295/0.55),0_0_44px_-10px_oklch(0.68_0.23_295/0.65)] transition-all duration-300 hover:brightness-110 hover:shadow-[0_0_0_1px_oklch(0.68_0.23_295/0.5),0_12px_36px_-6px_oklch(0.68_0.23_295/0.7),0_0_64px_-12px_oklch(0.68_0.23_295/0.85)] hover:-translate-y-px"
        >
          <span aria-hidden className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-br from-white/15 to-transparent opacity-60 mix-blend-overlay" />
          <Plus className="relative h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
          <span className="relative">New trade</span>
        </button>
      </div>

      <AnimatePresence>
        {welcomeOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md p-4">
            <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 10 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="glow-card w-full max-w-lg rounded-2xl p-6">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Welcome to EdgeScope</h2>
                  <p className="text-sm text-muted-foreground">Journal trades. Review decisions. Improve execution.</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                EdgeScope helps you track trades, understand your emotions, review your process, and discover patterns in your trading behavior over time.
              </p>
              <div className="mt-5 space-y-3">
                {[
                  { step: "1", text: "Log your first trade" },
                  { step: "2", text: "Review your execution" },
                  { step: "3", text: "Track emotions and mistakes" },
                  { step: "4", text: "Use Analytics and AI Discovery as your journal grows" },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.05]">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{item.step}</span>
                    <span className="text-sm text-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button onClick={dismissWelcome} className="rounded-xl bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-white/[0.06] hover:text-foreground">
                  Get Started
                </button>
                <button onClick={() => { dismissWelcome(); setNewOpen(true); }} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] hover:brightness-110">
                  Log First Trade
                </button>
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
          <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">TRADES TODAY</div>
          <div className="mt-1.5 text-3xl font-bold tabular-nums">{todayTrades.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {todayTrades.length === 0 ? "No trades logged today." : new Date().toLocaleDateString(undefined, { weekday: "long" })}
          </div>
        </div>
        <div className="glow-card rounded-2xl p-5">
          <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">TODAY NET R</div>
          <div className={cn("mt-1.5 text-3xl font-bold tabular-nums", todayNetR > 0 && "text-success", todayNetR < 0 && "text-destructive")}>
            {todayTrades.length === 0 ? "—" : `${todayNetR > 0 ? "+" : ""}${Math.abs(todayNetR).toFixed(2)}R`}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Across today's trades</div>
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
                {journalGaps.missingResult > 0 && <>{journalGaps.missingResult} trades missing result · </>}
                {journalGaps.missingAchievedR > 0 && <>{journalGaps.missingAchievedR} missing achieved R · </>}
                {journalGaps.missingReasoning > 0 && <>{journalGaps.missingReasoning} missing reasoning</>}
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
                <Link to="/accounts" className="ml-3 text-primary hover:text-primary-glow">Switch →</Link>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="glow-card interactive-card rounded-2xl p-5 ring-1 ring-primary/25 bg-primary/[0.04]">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-primary">CURRENT BALANCE</div>
              <div className="mt-1.5 text-3xl font-bold tabular-nums">{fmtMoney(currentBalance)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{activeAccount.name}</div>
            </div>
            <div className="glow-card interactive-card rounded-2xl p-5">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">STARTING BALANCE</div>
              <div className="mt-1.5 text-3xl font-bold tabular-nums">{fmtMoney(startingBalance ?? 0)}</div>
              <div className="mt-1 text-xs text-muted-foreground">Baseline</div>
            </div>
            <div className="glow-card interactive-card rounded-2xl p-5">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">ACCOUNT NET P&amp;L</div>
              <div className={cn("mt-1.5 text-3xl font-bold tabular-nums", netPnl > 0 && "text-success", netPnl < 0 && "text-destructive")}>
                {netPnl > 0 ? "+" : ""}{fmtMoney(netPnl)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{sumR >= 0 ? "+" : ""}{sumR.toFixed(2)}R on this account</div>
            </div>
          </div>

          {/* Lifetime Performance */}
          <div className="mt-6 glow-card rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="h-4 w-4 text-warning" /> Lifetime performance
              </h3>
              <span className="rounded-md bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">All accounts</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <LifetimeStat label="LIFETIME NET R" value={`${lifetimeSumR >= 0 ? "+" : ""}${lifetimeSumR.toFixed(2)}R`} tone={lifetimeSumR >= 0 ? "success" : "destructive"} />
              <LifetimeStat label="LIFETIME TRADES" value={String(lifetime.total)} tone="info" />
              <LifetimeStat label="WIN RATE" value={lifetime.winRate != null ? `${lifetime.winRate.toFixed(1)}%` : "—"} tone="primary" />
              <LifetimeStat label="AVG RR" value={lifetime.avgRR != null ? `${lifetime.avgRR.toFixed(2)}R` : "—"} tone="success" />
            </div>
          </div>
        </div>
      )}


      {/* KPI Cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Target} label="WIN RATE" value={o.winRate ?? 0} decimals={1} suffix="%" tone="primary" sub={o.winRate == null ? "No closed trades" : undefined} />
        <StatCard icon={Briefcase} label="TOTAL TRADES" value={o.total} tone="info" />
        <StatCard icon={TrendingUp} label="AVERAGE RR" value={o.avgRR ?? 0} decimals={2} suffix="R" tone="success" sub={o.avgRR == null ? "No R recorded" : undefined} />
        <StatCard icon={Calendar} label="THIS MONTH" value={o.thisMonth.count} tone="warning" sub={o.thisMonth.count ? `${fmtPct(o.thisMonth.winRate)} win rate` : "No trades yet"} />
      </div>

      {/* Mini stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MiniStat icon={Trophy} label="WINS" value={o.wins} sub={o.total ? `${((o.wins / o.total) * 100).toFixed(1)}%` : "0%"} tone="success" />
        <MiniStat icon={XOctagon} label="LOSSES" value={o.losses} sub={o.total ? `${((o.losses / o.total) * 100).toFixed(1)}%` : "0%"} tone="destructive" />
        <MiniStat icon={Scale} label="BREAKEVEN" value={o.breakeven} sub={o.total ? `${((o.breakeven / o.total) * 100).toFixed(1)}%` : "0%"} tone="primary" />
        <MiniStat icon={Crosshair} label="BEST SESSION" value={bestSession ? sessionLabel(bestSession.key) : "—"} sub={bestSession ? `${fmtPct(bestSession.winRate)} · ${bestSession.count} trades` : "Not enough data"} tone="info" />
      </div>

      {hasActiveAccount && (
        <div className="mt-6 glow-card rounded-2xl p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Shield className="h-4 w-4 text-primary" /> Risk overview</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <RiskRow icon={Target} label="RISK PER TRADE" value={prefs?.default_risk_pct != null ? `${prefs.default_risk_pct}%` : "—"} />
            <RiskRow icon={AlertTriangle} label="MAX DAILY LOSS" value={prefs?.max_daily_loss != null ? fmtMoney(prefs.max_daily_loss) : "Not set"} />
            <RiskRow icon={Briefcase} label="MAX TRADES / DAY" value={prefs?.max_trades_per_day != null ? String(prefs.max_trades_per_day) : "Not set"} />
          </div>
        </div>
      )}

      {/* Recent trades + Monthly performance */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <motion.div {...card} transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="glow-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-primary" /> Recent trades</h3>
            <Link to="/trades" className="text-xs font-medium text-primary transition-colors duration-200 hover:text-primary-glow">View all →</Link>
          </div>
          <div className="mt-4 space-y-1">
            {recent.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">No trades logged yet.</div>
            )}
            {recent.map((t) => {
              const rr = rrNum(t.achieved_rr);
              const tone: Tone = t.result === "win" ? "success" : t.result === "loss" ? "destructive" : "info";
              const label = t.result === "win" ? "WIN" : t.result === "loss" ? "LOSS" : t.result === "breakeven" ? "BE" : "—";
              return (
                <div key={t.id} className="grid grid-cols-[1.4fr_auto_auto] items-center gap-3 rounded-xl px-2 py-2.5 transition-all duration-200 hover:bg-white/[0.04]">
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-sm font-medium">{t.instrument}</div>
                    <div className="text-[11px] text-muted-foreground">{formatTradeWhen(t.trade_date, t.trade_time)}</div>
                  </div>
                  <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wider", toneStyles[tone].badge)}>
                    {label}
                  </span>
                  <span className={cn("shrink-0 text-sm font-semibold tabular-nums", tone === "success" && "text-success", tone === "destructive" && "text-destructive", tone === "info" && "text-muted-foreground")}>
                    {rr > 0 ? "+" : ""}{rr.toFixed(2)}R
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

      {/* Trades by setup */}
      <div className="mt-4 grid grid-cols-1 gap-4">
        <div className="glow-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><PieIcon className="h-4 w-4 text-primary" /> Trades by setup</h3>
            <Link to="/analytics" className="text-xs font-medium text-primary transition-colors duration-200 hover:text-primary-glow">View analytics →</Link>
          </div>
          {cats.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No categories yet. Add a category when logging a trade.</p>
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
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow transition-all duration-700 ease-out" style={{ width: `${(s.count / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Overall Equity Curve */}
      <OverallEquitySection data={equityAll} />
    </div>
  );
}

function LifetimeStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const s = toneStyles[tone];
  return (
    <div className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.04]">
      <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", s.badge.includes("text-success") && "text-success", s.badge.includes("text-destructive") && "text-destructive")}>{value}</div>
    </div>
  );
}

function RiskRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.04]">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-white/[0.06]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function MonthlyPerformanceTabbed({
  monthChart, monthLabel, growth, monthlyPnl, hasActiveAccount,
}: {
  monthChart: { d: string; v: number }[];
  monthLabel: string;
  growth: { d: string; v: number }[];
  monthlyPnl: { d: string; v: number }[];
  hasActiveAccount: boolean;
}) {
  const [tab, setTab] = useState<"growth" | "monthly" | "current">(hasActiveAccount ? "growth" : "current");

  const tabs: { id: "growth" | "monthly" | "current"; label: string; show: boolean }[] = [
    { id: "growth", label: "Account growth", show: hasActiveAccount },
    { id: "monthly", label: "Monthly P&L", show: hasActiveAccount },
    { id: "current", label: "This month", show: true },
  ];

  return (
    <motion.div
      {...card}
      transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="glow-card rounded-2xl p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Calendar className="h-4 w-4 text-primary" /> Monthly performance
        </h3>
        <span className="rounded-md bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-muted-foreground">{monthLabel}</span>
      </div>

      <div className="mt-4 inline-flex items-center gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.05]">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200",
              tab === t.id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 h-[260px]">
        {tab === "growth" && (growth.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">No closed trades yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={growth} margin={{ top: 10, right: 8, left: -8, bottom: 8 }}>
              <defs>
                <linearGradient id="dash-growth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.68 0.23 295)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="oklch(0.68 0.23 295)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.04)" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }} axisLine={false} tickLine={false} tickMargin={8} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: "oklch(0.13 0.018 270)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [fmtMoney(v), "Balance"]} />
              <Area type="monotone" dataKey="v" stroke="oklch(0.78 0.19 295)" strokeWidth={2} fill="url(#dash-growth)" />
            </AreaChart>
          </ResponsiveContainer>
        ))}

        {tab === "monthly" && (monthlyPnl.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">No monthly data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyPnl} margin={{ top: 10, right: 8, left: -8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.04)" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
              <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.03)" }} contentStyle={{ background: "oklch(0.13 0.018 270)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [fmtMoney(v), "P&L"]} />
              <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                {monthlyPnl.map((d, i) => (
                  <Cell key={i} fill={d.v >= 0 ? "oklch(0.74 0.19 152)" : "oklch(0.64 0.22 22)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ))}

        {tab === "current" && (monthChart.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">No trades this month yet.</div>
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
              <XAxis dataKey="d" tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }} axisLine={false} tickLine={false} tickMargin={8} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "oklch(0.13 0.018 270)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: 12, fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(2)}R`, "Cum R"]} />
              <Area type="monotone" dataKey="v" stroke="oklch(0.74 0.19 152)" strokeWidth={2} fill="url(#dash-month)" />
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
      transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
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
          <div className="grid h-full place-items-center text-sm text-muted-foreground">No closed trades yet.</div>
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
              <XAxis dataKey="d" tick={{ fontSize: 10, fill: "oklch(0.55 0 0)" }} axisLine={false} tickLine={false} tickMargin={10} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "oklch(0.13 0.018 270)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: 12, fontSize: 12, boxShadow: "0 8px 32px -8px oklch(0 0 0 / 0.5)" }}
                formatter={(v: number) => [`${v.toFixed(2)}R`, "Equity"]}
                labelStyle={{ color: "oklch(0.6 0 0)" }}
              />
              <Area type="monotone" dataKey="v" stroke="oklch(0.78 0.19 295)" strokeWidth={2} fill="url(#dash-equity)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}

function TradingStreakSection({ s }: { s: { currentWin: number; currentLoss: number; longestWin: number; longestLoss: number } }) {
  const streaks = [
    { label: "CURRENT WINNING STREAK", value: s.currentWin, tone: "success" as Tone, icon: Flame },
    { label: "CURRENT LOSING STREAK", value: s.currentLoss, tone: "destructive" as Tone, icon: XOctagon },
    { label: "LONGEST WINNING STREAK", value: s.longestWin, tone: "success" as Tone, icon: Trophy },
    { label: "LONGEST LOSING STREAK", value: s.longestLoss, tone: "destructive" as Tone, icon: XOctagon },
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
            <div key={st.label} className="flex items-center gap-4 rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.04]">
              <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/[0.06]", s.icon)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">{st.label}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{st.value}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
