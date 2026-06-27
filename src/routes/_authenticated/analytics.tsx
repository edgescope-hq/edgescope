import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Activity, BarChart3, Target, Flame, CalendarDays, CalendarRange, Trophy, Layers, DollarSign, Grid3x3, Smile } from "lucide-react";
import { EMOTIONS } from "@/lib/emotions";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrades } from "@/lib/trades.functions";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { cn } from "@/lib/utils";
import { sessionLabel, SESSIONS, KILLZONES, killzoneLabel } from "@/lib/trade-constants";
import { toAnalytics, rrNum, streaks, type DbTrade } from "@/lib/trade-mappers";
import { categoryStats, equityCurve, sessionStats, weekdayStats, killzoneStats } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — EdgeScope" },
      { name: "description", content: "Weekly and monthly performance reports." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AnalyticsPage,
});

type CategoryRow = {
  name: string; trades: number; winRate: number; netR: number; avgRR: number; avgProfit: number; avgLoss: number;
};

type Report = {
  totalTrades: number;
  winRate: number;
  avgRR: number;
  totalR: number;
  bestSession: string;
  worstSession: string;
  sessions: { name: string; wins: number; losses: number }[];
  killzones: { name: string; wins: number; losses: number; count: number; winRate: number | null; avgRR: number | null }[];
  bestKillzone: string;
  worstKillzone: string;
  bestCategory: string;
  bestTrade: { sym: string; r: number } | null;
  worstTrade: { sym: string; r: number } | null;
  longest: { wins: number; losses: number };
  expectancy: number;
  profitFactor: number;
  maxDrawdown: number;
  equity: { d: string; v: number }[];
  equityInterval?: number;
  grades: { name: string; count: number; avgR: number }[];
  categories: CategoryRow[];
  weekdays: { name: string; count: number; winRate: number | null; wins: number; losses: number }[];
  bestDay: string | null;
  worstDay: string | null;
  // New breakdowns (Phase 3 cleanup)
  instruments: { name: string; count: number; winRate: number; netR: number; avgRR: number }[];
  directions: { name: "Long" | "Short"; count: number; winRate: number; netR: number; avgRR: number }[];
  plannedVsAchieved: { plannedAvg: number | null; achievedAvg: number | null; capturePct: number | null; sampleSize: number };
  mistakes: { name: string; count: number; netR: number }[];
  killzoneDiscipline: {
    total: number;
    inCount: number;
    outCount: number;
    pct: number | null;
    inWinRate: number | null;
    outWinRate: number | null;
    inAvgR: number | null;
    outAvgR: number | null;
  };
  emotions: {
    items: { key: string; emoji: string; label: string; count: number; winRate: number | null; avgR: number | null; netR: number }[];
    mostUsed: { key: string; emoji: string; label: string; count: number } | null;
    best: { key: string; emoji: string; label: string; winRate: number } | null;
    worst: { key: string; emoji: string; label: string; winRate: number } | null;
    total: number;
  };
};

function startOfWeekISO(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(d: Date): string {
  return startOfWeekISO(d).toISOString().slice(0, 10);
}

function filterByScope(all: DbTrade[], scope: "overall" | "weekly" | "monthly", periodKey: string | null): DbTrade[] {
  if (scope === "overall") return all;
  if (scope === "weekly") {
    const key = periodKey ?? weekKey(new Date());
    return all.filter((t) => weekKey(new Date(t.trade_date + "T00:00:00")) === key);
  }
  const key = periodKey ?? ymKey(new Date());
  return all.filter((t) => t.trade_date.startsWith(key));
}

function listWeekKeys(all: DbTrade[]): string[] {
  const set = new Set<string>();
  for (const t of all) set.add(weekKey(new Date(t.trade_date + "T00:00:00")));
  set.add(weekKey(new Date()));
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

function listMonthKeys(all: DbTrade[]): string[] {
  const set = new Set<string>();
  for (const t of all) set.add(t.trade_date.slice(0, 7));
  set.add(ymKey(new Date()));
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

function labelWeek(key: string): string {
  const start = new Date(key + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const thisWk = weekKey(new Date());
  const lastWk = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return weekKey(d); })();
  const prefix = key === thisWk ? "This week · " : key === lastWk ? "Last week · " : "";
  return `${prefix}${fmt(start)} – ${fmt(end)}`;
}

function labelMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const now = new Date();
  const thisM = ymKey(now);
  const lastM = ymKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prefix = key === thisM ? "This month · " : key === lastM ? "Last month · " : "";
  return `${prefix}${d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;
}

function buildReport(trades: DbTrade[], scope: "overall" | "weekly" | "monthly"): Report {
  const ana = trades.map(toAnalytics);
  const total = trades.length;
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const decided = wins + losses;
  const winRate = decided ? (wins / decided) * 100 : 0;

  const rrs = trades.map((t) => rrNum(t.achieved_rr)).filter((n, i) => trades[i].achieved_rr != null);
  const totalR = rrs.reduce((a, b) => a + b, 0);
  const avgRR = rrs.length ? totalR / rrs.length : 0;

  const winsR = trades.filter((t) => t.result === "win").map((t) => rrNum(t.achieved_rr));
  const lossR = trades.filter((t) => t.result === "loss").map((t) => rrNum(t.achieved_rr));
  const sumWin = winsR.reduce((a, b) => a + b, 0);
  const sumLoss = Math.abs(lossR.reduce((a, b) => a + b, 0));
  const expectancy = total ? totalR / total : 0;
  const profitFactor = sumLoss > 0 ? sumWin / sumLoss : sumWin > 0 ? Infinity : 0;

  const eq = equityCurve(ana);
  let peak = 0, maxDD = 0;
  for (const p of eq) {
    peak = Math.max(peak, p.cumR);
    maxDD = Math.max(maxDD, peak - p.cumR);
  }

  const sStats = sessionStats(ana);
  const sessionOrder = SESSIONS.map((s) => ({ key: s.v, label: s.l }));
  const sessions = sessionOrder.map((o) => {
    const s = sStats.find((x) => x.key === o.key);
    return { name: o.label, wins: s?.wins ?? 0, losses: s?.losses ?? 0 };
  });
  const eligibleSessions = sStats.filter((s) => s.winRate != null && s.count >= 5);
  const bestSessionStat = [...eligibleSessions].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
  const worstSessionStat = [...eligibleSessions].sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0))[0];

  // Killzone breakdown (ICT IST windows)
  const kzStats = killzoneStats(ana);
  const killzones = KILLZONES.map((o) => {
    const s = kzStats.find((x) => x.key === o.v);
    return {
      name: o.l,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      count: s?.count ?? 0,
      winRate: s?.winRate ?? null,
      avgRR: s?.avgRR ?? null,
    };
  });
  const eligibleKz = kzStats.filter((s) => s.winRate != null && s.count >= 3);
  const bestKzStat = [...eligibleKz].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
  const worstKzStat = [...eligibleKz].sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0))[0];

  const cStats = categoryStats(ana);
  const categories: CategoryRow[] = cStats.map((s) => {
    const subset = trades.filter((t) => (t.categories ?? []).includes(s.key));
    const wList = subset.filter((t) => t.result === "win").map((t) => rrNum(t.achieved_rr));
    const lList = subset.filter((t) => t.result === "loss").map((t) => rrNum(t.achieved_rr));
    const net = subset.reduce((a, b) => a + rrNum(b.achieved_rr), 0);
    return {
      name: s.key,
      trades: s.count,
      winRate: s.winRate ?? 0,
      netR: Number(net.toFixed(2)),
      avgRR: s.avgRR ?? 0,
      avgProfit: wList.length ? Number((wList.reduce((a, b) => a + b, 0) / wList.length).toFixed(2)) : 0,
      avgLoss: lList.length ? Number((lList.reduce((a, b) => a + b, 0) / lList.length).toFixed(2)) : 0,
    };
  });
  const bestCategory = categories[0]?.name ?? "—";

  let best: DbTrade | null = null, worst: DbTrade | null = null;
  for (const t of trades) {
    const v = rrNum(t.achieved_rr);
    if (!best || v > rrNum(best.achieved_rr)) best = t;
    if (!worst || v < rrNum(worst.achieved_rr)) worst = t;
  }

  const stk = streaks(trades);

  const gradeOrder = ["A+", "A", "B+", "B", "C", "D"];
  const grades = gradeOrder.map((g) => {
    const sub = trades.filter((t) => t.grade === g);
    const r = sub.map((t) => rrNum(t.achieved_rr));
    return { name: g, count: sub.length, avgR: r.length ? Number((r.reduce((a, b) => a + b, 0) / r.length).toFixed(2)) : 0 };
  });

  // ===== New aggregations =====
  // Instrument breakdown
  const byInstrument = new Map<string, DbTrade[]>();
  for (const t of trades) {
    const k = (t.instrument ?? "").trim() || "—";
    if (!byInstrument.has(k)) byInstrument.set(k, []);
    byInstrument.get(k)!.push(t);
  }
  const instruments = Array.from(byInstrument.entries()).map(([name, subset]) => {
    const w = subset.filter((t) => t.result === "win").length;
    const l = subset.filter((t) => t.result === "loss").length;
    const decided = w + l;
    const rrList = subset.map((t) => rrNum(t.achieved_rr));
    const net = rrList.reduce((a, b) => a + b, 0);
    return {
      name,
      count: subset.length,
      winRate: decided ? (w / decided) * 100 : 0,
      netR: Number(net.toFixed(2)),
      avgRR: rrList.length ? Number((net / rrList.length).toFixed(2)) : 0,
    };
  }).sort((a, b) => b.netR - a.netR).slice(0, 20);

  // Direction breakdown
  const directions = (["long", "short"] as const).map((dir) => {
    const subset = trades.filter((t) => t.direction === dir);
    const w = subset.filter((t) => t.result === "win").length;
    const ll = subset.filter((t) => t.result === "loss").length;
    const decided = w + ll;
    const rrList = subset.map((t) => rrNum(t.achieved_rr));
    const net = rrList.reduce((a, b) => a + b, 0);
    return {
      name: (dir === "long" ? "Long" : "Short") as "Long" | "Short",
      count: subset.length,
      winRate: decided ? (w / decided) * 100 : 0,
      netR: Number(net.toFixed(2)),
      avgRR: rrList.length ? Number((net / rrList.length).toFixed(2)) : 0,
    };
  });

  // Planned vs Achieved — only trades where both are present
  const pairBoth = trades
    .map((t) => ({
      planned: t.planned_rr != null && t.planned_rr !== "" ? parseFloat(String(t.planned_rr)) : NaN,
      achieved: t.achieved_rr != null && t.achieved_rr !== "" ? Number(t.achieved_rr) : NaN,
    }))
    .filter((p) => Number.isFinite(p.planned) && Number.isFinite(p.achieved));
  const plannedVsAchieved = (() => {
    if (pairBoth.length === 0) return { plannedAvg: null, achievedAvg: null, capturePct: null, sampleSize: 0 };
    const pAvg = pairBoth.reduce((a, b) => a + b.planned, 0) / pairBoth.length;
    const aAvg = pairBoth.reduce((a, b) => a + b.achieved, 0) / pairBoth.length;
    return {
      plannedAvg: Number(pAvg.toFixed(2)),
      achievedAvg: Number(aAvg.toFixed(2)),
      capturePct: pAvg > 0 ? Number(((aAvg / pAvg) * 100).toFixed(1)) : null,
      sampleSize: pairBoth.length,
    };
  })();

  // Mistake-tag breakdown
  const mistakeMap = new Map<string, { count: number; netR: number }>();
  for (const t of trades) {
    const tags = (t.mistake_tags ?? []) as string[];
    const r = rrNum(t.achieved_rr);
    for (const tag of tags) {
      if (!tag) continue;
      const cur = mistakeMap.get(tag) ?? { count: 0, netR: 0 };
      cur.count += 1;
      cur.netR += r;
      mistakeMap.set(tag, cur);
    }
  }
  const mistakes = Array.from(mistakeMap.entries())
    .map(([name, v]) => ({ name, count: v.count, netR: Number(v.netR.toFixed(2)) }))
    .sort((a, b) => a.netR - b.netR);

  let equityChart: { d: string; v: number }[];
  let equityInterval = 0;
  if (scope === "weekly") {
    equityChart = eq.map((p) => ({ d: new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" }), v: p.cumR }));
  } else if (scope === "monthly") {
    equityChart = eq.map((p) => ({ d: p.date.slice(8), v: p.cumR }));
    equityInterval = Math.max(0, Math.floor(equityChart.length / 8));
  } else {
    const byMonth = new Map<string, number>();
    for (const p of eq) byMonth.set(p.date.slice(0, 7), p.cumR);
    const monthsShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    equityChart = Array.from(byMonth.entries()).map(([k, v]) => ({ d: monthsShort[Number(k.split("-")[1]) - 1], v }));
  }

  // Day-of-week analysis (Mon–Fri primary focus)
  const wdStats = weekdayStats(ana);
  const TRADING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const weekdays = TRADING_DAYS.map((d) => {
    const s = wdStats.find((x) => x.key === d);
    return {
      name: d,
      count: s?.count ?? 0,
      winRate: s?.winRate ?? null,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
    };
  });
  const eligibleDays = weekdays.filter((d) => d.count >= 1 && d.winRate != null);
  const sortedByWR = [...eligibleDays].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  const bestDay = sortedByWR[0]?.name ?? null;
  const worstDay = sortedByWR.length > 1 ? sortedByWR[sortedByWR.length - 1].name : null;

  // Killzone discipline (boolean in_killzone)
  const kzIn = trades.filter((t) => (t as { in_killzone?: boolean | null }).in_killzone === true);
  const kzOut = trades.filter((t) => (t as { in_killzone?: boolean | null }).in_killzone !== true);
  const wrOf = (arr: typeof trades) => {
    const w = arr.filter((t) => t.result === "win").length;
    const l = arr.filter((t) => t.result === "loss").length;
    const d = w + l;
    return d ? (w / d) * 100 : null;
  };
  const avgROf = (arr: typeof trades) => {
    const vals = arr.map((t) => rrNum(t.achieved_rr)).filter((_, i) => arr[i].achieved_rr != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const killzoneDiscipline = {
    total,
    inCount: kzIn.length,
    outCount: kzOut.length,
    pct: total ? (kzIn.length / total) * 100 : null,
    inWinRate: wrOf(kzIn),
    outWinRate: wrOf(kzOut),
    inAvgR: avgROf(kzIn),
    outAvgR: avgROf(kzOut),
  };

  // Emotion insights — derived from trades.emotion_tags (multi)
  const emoMap = new Map<string, { count: number; wins: number; losses: number; rSum: number; rCount: number; netR: number }>();
  for (const t of trades) {
    const tags = (t.emotion_tags ?? []) as string[];
    const r = rrNum(t.achieved_rr);
    const hasR = t.achieved_rr != null;
    for (const tag of tags) {
      if (!tag) continue;
      const cur = emoMap.get(tag) ?? { count: 0, wins: 0, losses: 0, rSum: 0, rCount: 0, netR: 0 };
      cur.count += 1;
      if (t.result === "win") cur.wins += 1;
      if (t.result === "loss") cur.losses += 1;
      if (hasR) { cur.rSum += r; cur.rCount += 1; cur.netR += r; }
      emoMap.set(tag, cur);
    }
  }
  const emotionItems = Array.from(emoMap.entries()).map(([key, v]) => {
    const meta = EMOTIONS.find((e) => e.key === key);
    const decided = v.wins + v.losses;
    return {
      key,
      emoji: meta?.emoji ?? "•",
      label: meta?.label ?? key,
      count: v.count,
      winRate: decided ? (v.wins / decided) * 100 : null,
      avgR: v.rCount ? Number((v.rSum / v.rCount).toFixed(2)) : null,
      netR: Number(v.netR.toFixed(2)),
    };
  }).sort((a, b) => b.count - a.count);
  const mostUsedEmo = emotionItems[0] ?? null;
  const eligibleEmo = emotionItems.filter((e) => e.winRate != null && e.count >= 2) as { key: string; emoji: string; label: string; count: number; winRate: number; avgR: number | null; netR: number }[];
  const sortedEmo = [...eligibleEmo].sort((a, b) => b.winRate - a.winRate);
  const bestEmo = sortedEmo[0] ?? null;
  const worstEmo = sortedEmo.length > 1 ? sortedEmo[sortedEmo.length - 1] : null;

  return {
    totalTrades: total,
    winRate,
    avgRR,
    totalR: Number(totalR.toFixed(2)),
    bestSession: bestSessionStat ? sessionLabel(bestSessionStat.key) : "Not enough data",
    worstSession: worstSessionStat ? sessionLabel(worstSessionStat.key) : "Not enough data",
    sessions,
    killzones,
    bestKillzone: bestKzStat ? killzoneLabel(bestKzStat.key) : "Not enough data",
    worstKillzone: worstKzStat ? killzoneLabel(worstKzStat.key) : "Not enough data",
    bestCategory,
    bestTrade: best && rrNum(best.achieved_rr) > 0 ? { sym: best.instrument, r: rrNum(best.achieved_rr) } : null,
    worstTrade: worst && rrNum(worst.achieved_rr) < 0 ? { sym: worst.instrument, r: rrNum(worst.achieved_rr) } : null,
    longest: { wins: stk.longestWin, losses: stk.longestLoss },
    expectancy: Number(expectancy.toFixed(2)),
    profitFactor: Number.isFinite(profitFactor) ? Number(profitFactor.toFixed(2)) : 0,
    maxDrawdown: Number(maxDD.toFixed(2)),
    equity: equityChart,
    equityInterval,
    grades,
    categories,
    weekdays,
    bestDay,
    worstDay,
    instruments,
    directions,
    plannedVsAchieved,
    mistakes,
    killzoneDiscipline,
    emotions: {
      items: emotionItems,
      mostUsed: mostUsedEmo ? { key: mostUsedEmo.key, emoji: mostUsedEmo.emoji, label: mostUsedEmo.label, count: mostUsedEmo.count } : null,
      best: bestEmo ? { key: bestEmo.key, emoji: bestEmo.emoji, label: bestEmo.label, winRate: bestEmo.winRate } : null,
      worst: worstEmo ? { key: worstEmo.key, emoji: worstEmo.emoji, label: worstEmo.label, winRate: worstEmo.winRate } : null,
      total: emotionItems.reduce((a, b) => a + b.count, 0),
    },
  };
}

const toneMap: Record<string, string> = {
  success: "from-success/25 to-success/5 text-success",
  primary: "from-primary/25 to-primary/5 text-primary",
  info: "from-info/25 to-info/5 text-info",
  warning: "from-warning/25 to-warning/5 text-warning",
  destructive: "from-destructive/25 to-destructive/5 text-destructive",
};

function Kpi({ icon: Icon, label, value, suffix = "", tone, decimals = 0 }: any) {
  return (
    <div className="glow-card interactive-card group rounded-2xl p-5 hover:border-white/[0.1]">
      <div className="flex items-center gap-3">
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/[0.06] transition-transform duration-300 group-hover:scale-105", toneMap[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">{label}</div>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight">
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </div>
    </div>
  );
}

type LifetimeWeekday = { name: string; count: number; winRate: number | null; wins: number; losses: number };

function ReportView({ r, lifetimeWeekdays }: { r: Report; scope: "overall" | "weekly" | "monthly"; lifetimeWeekdays: LifetimeWeekday[] }) {
  if (r.totalTrades === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mt-6"
      >
        <div className="glow-card rounded-2xl p-10 text-center">
          <p className="text-sm text-muted-foreground">No trades in this period yet. Log a trade to populate analytics.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="mt-6 space-y-4"
    >
      {/* Summary stats (first) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        <Kpi icon={BarChart3} label="TOTAL TRADES" value={r.totalTrades} tone="info" />
        <Kpi icon={Target} label="WIN RATE" value={r.winRate} decimals={1} suffix="%" tone="primary" />
        <Kpi icon={DollarSign} label="NET R" value={r.totalR} decimals={2} suffix="R" tone={r.totalR >= 0 ? "success" : "destructive"} />
        <Kpi icon={Activity} label="AVG R:R" value={r.avgRR} decimals={2} suffix="R" tone="success" />
        <Kpi icon={BarChart3} label="PROFIT FACTOR" value={r.profitFactor} decimals={2} tone="info" />
        <Kpi icon={Target} label="EXPECTANCY" value={r.expectancy} decimals={2} suffix="R" tone="primary" />
        <Kpi icon={Flame} label="MAX DRAWDOWN" value={r.maxDrawdown} decimals={2} suffix="R" tone="warning" />
        <Kpi icon={Trophy} label="TOTAL R" value={r.totalR} decimals={1} suffix="R" tone={r.totalR >= 0 ? "success" : "destructive"} />
      </div>

      {/* Highlights (best/worst session, etc.) */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" /> Highlights</h3>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Best session</dt><dd className={cn("font-semibold", r.bestSession === "Not enough data" ? "text-foreground" : "text-success")}>{r.bestSession}</dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Worst session</dt><dd className={cn("font-semibold", r.worstSession === "Not enough data" ? "text-foreground" : "text-destructive")}>{r.worstSession}</dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Best category</dt><dd className="font-semibold text-primary">{r.bestCategory}</dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5 text-success" /> Best trade</dt><dd className="font-semibold text-success">{r.bestTrade ? `${r.bestTrade.sym} · +${r.bestTrade.r.toFixed(2)}R` : "—"}</dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Longest win streak</dt><dd className="font-semibold">{r.longest.wins}</dd></div>
          <div className="flex items-center justify-between"><dt className="text-muted-foreground">Longest loss streak</dt><dd className="font-semibold">{r.longest.losses}</dd></div>
        </dl>
      </div>

      {/* Performance Charts — equity curve */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="text-sm font-semibold">Equity curve</h3>
        <div className="mt-4 h-[280px]">
          {r.equity.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">Not enough data.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={r.equity} margin={{ top: 10, right: 8, left: -16, bottom: 8 }}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.68 0.23 295)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="oklch(0.68 0.23 295)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.04)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 11, fill: "oklch(0.55 0 0)" }} axisLine={false} tickLine={false} tickMargin={8} interval={r.equityInterval ?? 0} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "oklch(0.13 0.018 270)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: 12, fontSize: 12, boxShadow: "0 8px 32px -8px oklch(0 0 0 / 0.5)" }} />
                <Area type="monotone" dataKey="v" stroke="oklch(0.78 0.19 295)" strokeWidth={2} fill="url(#eq)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>



      {/* Session performance breakdown */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-primary" /> Session performance breakdown</h3>
        <div className="mt-4 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={r.sessions} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.04)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.55 0 0)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.03)" }} contentStyle={{ background: "oklch(0.13 0.018 270)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: 12, fontSize: 12, boxShadow: "0 8px 32px -8px oklch(0 0 0 / 0.5)" }} />
              <Bar dataKey="wins" stackId="a" fill="oklch(0.74 0.19 152)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="losses" stackId="a" fill="oklch(0.64 0.22 22)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category performance breakdown */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Grid3x3 className="h-4 w-4 text-primary" /> Category performance breakdown</h3>
        {r.categories.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No categories tagged yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="py-2.5 pr-4">Category</th>
                  <th className="py-2.5 pr-4 text-right">Trades</th>
                  <th className="py-2.5 pr-4 text-right">Win rate</th>
                  <th className="py-2.5 pr-4 text-right">Net R</th>
                  <th className="py-2.5 pr-4 text-right">Avg R:R</th>
                  <th className="py-2.5 pr-4 text-right">Avg win</th>
                  <th className="py-2.5 text-right">Avg loss</th>
                </tr>
              </thead>
              <tbody>
                {r.categories.map((c) => (
                  <tr key={c.name} className="border-b border-white/[0.04] last:border-0 transition-colors duration-150 hover:bg-white/[0.02]">
                    <td className="py-3 pr-4 font-medium">{c.name}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{c.trades}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{c.winRate.toFixed(1)}%</td>
                    <td className={cn("py-3 pr-4 text-right font-semibold tabular-nums", c.netR >= 0 ? "text-success" : "text-destructive")}>{c.netR >= 0 ? "+" : ""}{c.netR.toFixed(2)}R</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{c.avgRR.toFixed(2)}R</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-success">{c.avgProfit > 0 ? "+" : ""}{c.avgProfit.toFixed(2)}R</td>
                    <td className="py-3 text-right tabular-nums text-destructive">{c.avgLoss.toFixed(2)}R</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mistake analysis */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Flame className="h-4 w-4 text-warning" /> Mistake analysis
        </h3>
        {r.mistakes.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No mistakes tagged yet. Tag rule-breaks when logging trades to see what costs you most.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {r.mistakes.slice(0, 10).map((m) => (
              <div key={m.name} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2.5 ring-1 ring-white/[0.04]">
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.count} occurrences</span>
                </div>
                <span className={cn("text-sm font-bold tabular-nums", m.netR >= 0 ? "text-success" : "text-destructive")}>
                  {m.netR >= 0 ? "+" : ""}{m.netR}R
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emotion insights */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Smile className="h-4 w-4 text-primary" /> Emotion Insights
        </h3>
        {r.emotions.total === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No emotions logged yet. Tag emotions in Quick Capture to see how your state of mind affects performance.
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-3 pr-4 text-left">Emotion</th>
                    <th scope="col" className="py-3 pr-4 text-right">Count</th>
                    <th scope="col" className="py-3 pr-4 text-right">Win rate</th>
                    <th scope="col" className="py-3 pr-4 text-right">Avg R</th>
                    <th scope="col" className="py-3 text-right">Net R</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {r.emotions.items.map((e) => (
                    <tr key={e.key}>
                      <td className="py-3 pr-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-base leading-none">{e.emoji}</span>
                          <span className="truncate font-medium">{e.label}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{e.count}</td>
                      <td className={cn("py-3 pr-4 text-right font-semibold tabular-nums", e.winRate == null ? "text-muted-foreground" : e.winRate >= 50 ? "text-success" : "text-destructive")}>
                        {e.winRate == null ? "—" : `${e.winRate.toFixed(0)}%`}
                      </td>
                      <td className={cn("py-3 pr-4 text-right font-semibold tabular-nums", e.avgR == null ? "text-muted-foreground" : e.avgR >= 0 ? "text-success" : "text-destructive")}>
                        {e.avgR == null ? "—" : `${e.avgR >= 0 ? "+" : ""}${e.avgR.toFixed(2)}R`}
                      </td>
                      <td className={cn("py-3 text-right font-semibold tabular-nums", e.netR >= 0 ? "text-success" : "text-destructive")}>
                        {e.netR >= 0 ? "+" : ""}{e.netR.toFixed(2)}R
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Day Performance — lifetime */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" /> Day Performance
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {lifetimeWeekdays.map((d) => {
            const wr = d.winRate;
            const tone = wr == null ? "muted" : wr >= 60 ? "success" : wr >= 40 ? "primary" : "destructive";
            return (
              <div key={d.name} className="rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.04]">
                <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">{d.name.slice(0, 3).toUpperCase()}</div>
                <div className={cn(
                  "mt-1 text-xl font-bold tabular-nums",
                  tone === "success" && "text-success",
                  tone === "destructive" && "text-destructive",
                  tone === "primary" && "text-primary",
                  tone === "muted" && "text-muted-foreground",
                )}>
                  {wr == null ? "—" : `${wr.toFixed(0)}%`}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {d.count} trade{d.count === 1 ? "" : "s"}
                </div>
              </div>
            );
          })}
        </div>
      </div>


      {/* Planned vs Achieved R */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" /> Planned vs Achieved R
        </h3>
        {r.plannedVsAchieved.sampleSize === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Not enough data — log trades with entry/SL/TP prices to enable this view.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">PLANNED AVG</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{r.plannedVsAchieved.plannedAvg?.toFixed(2)}R</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">ACHIEVED AVG</div>
              <div className={cn("mt-1 text-2xl font-bold tabular-nums", (r.plannedVsAchieved.achievedAvg ?? 0) >= 0 ? "text-success" : "text-destructive")}>
                {(r.plannedVsAchieved.achievedAvg ?? 0) >= 0 ? "+" : ""}{r.plannedVsAchieved.achievedAvg?.toFixed(2)}R
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">CAPTURE %</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {r.plannedVsAchieved.capturePct == null ? "—" : `${r.plannedVsAchieved.capturePct}%`}
              </div>
              <div className="text-[11px] text-muted-foreground">{r.plannedVsAchieved.sampleSize} trades</div>
            </div>
          </div>
        )}
      </div>

      {/* Direction breakdown */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" /> Direction performance
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {r.directions.map((d) => (
            <div key={d.name} className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
              <div className="flex items-center justify-between">
                <div className={cn("text-sm font-bold", d.name === "Long" ? "text-success" : "text-destructive")}>{d.name}</div>
                <div className="text-[11px] text-muted-foreground">{d.count} trades</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div><div className="text-muted-foreground">Win rate</div><div className="mt-0.5 font-semibold tabular-nums">{d.winRate.toFixed(1)}%</div></div>
                <div><div className="text-muted-foreground">Net R</div><div className={cn("mt-0.5 font-semibold tabular-nums", d.netR >= 0 ? "text-success" : "text-destructive")}>{d.netR >= 0 ? "+" : ""}{d.netR}R</div></div>
                <div><div className="text-muted-foreground">Avg R</div><div className="mt-0.5 font-semibold tabular-nums">{d.avgRR.toFixed(2)}R</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grade distribution */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-warning" /> Grade distribution</h3>
        <div className="mt-4 h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={r.grades} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.04)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.55 0 0)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "oklch(1 0 0 / 0.03)" }} contentStyle={{ background: "oklch(0.13 0.018 270)", border: "1px solid oklch(1 0 0 / 0.08)", borderRadius: 12, fontSize: 12, boxShadow: "0 8px 32px -8px oklch(0 0 0 / 0.5)" }} />
              <Bar dataKey="count" fill="oklch(0.82 0.17 65)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Avg R by grade */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-primary" /> Average R by grade</h3>
        <dl className="mt-4 space-y-3 text-sm">
          {r.grades.map((g) => (
            <div key={g.name} className="flex items-center justify-between">
              <dt className="flex items-center gap-2.5 text-muted-foreground">
                <span className="inline-grid h-7 w-7 place-items-center rounded-lg bg-warning/10 text-[11px] font-bold text-warning">{g.name}</span>
                <span>{g.count} trades</span>
              </dt>
              <dd className={cn("font-semibold tabular-nums", g.avgR >= 0 ? "text-success" : "text-destructive")}>{g.avgR >= 0 ? "+" : ""}{g.avgR.toFixed(2)}R</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Killzone performance */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" /> Killzone Performance
        </h3>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">TAKEN DURING KILLZONE</div>
            <div className="mt-1 text-sm text-muted-foreground tabular-nums">
              {r.killzoneDiscipline.inCount} of {r.killzoneDiscipline.total} trade{r.killzoneDiscipline.total === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-3xl font-bold tabular-nums text-primary">
            {r.killzoneDiscipline.pct == null ? "—" : `${r.killzoneDiscipline.pct.toFixed(0)}%`}
          </div>
        </div>
      </div>

      {/* Instrument breakdown */}
      <div className="glow-card rounded-2xl p-5">

        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <DollarSign className="h-4 w-4 text-primary" /> Instrument performance
        </h3>
        {r.instruments.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No instruments logged yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="py-2.5 pr-4">Instrument</th>
                  <th className="py-2.5 pr-4 text-right">Trades</th>
                  <th className="py-2.5 pr-4 text-right">Win rate</th>
                  <th className="py-2.5 pr-4 text-right">Net R</th>
                  <th className="py-2.5 text-right">Avg R</th>
                </tr>
              </thead>
              <tbody>
                {r.instruments.map((i) => (
                  <tr key={i.name} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                    <td className="py-3 pr-4 font-medium">{i.name}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{i.count}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{i.winRate.toFixed(1)}%</td>
                    <td className={cn("py-3 pr-4 text-right font-semibold tabular-nums", i.netR >= 0 ? "text-success" : "text-destructive")}>{i.netR >= 0 ? "+" : ""}{i.netR}R</td>
                    <td className="py-3 text-right tabular-nums">{i.avgRR.toFixed(2)}R</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>




    </motion.div>
  );
}

function AnalyticsPage() {
  const [tab, setTab] = useState<"overall" | "weekly" | "monthly">("overall");
  const [weekSel, setWeekSel] = useState<string | null>(null);
  const [monthSel, setMonthSel] = useState<string | null>(null);
  const fn = useServerFn(listTrades);
  const { data } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => fn() });
  const trades = (data ?? []) as DbTrade[];

  const weekKeys = useMemo(() => listWeekKeys(trades), [trades]);
  const monthKeys = useMemo(() => listMonthKeys(trades), [trades]);
  // Default to the most recent period that actually contains trades, so a
  // brand-new week/month doesn't appear empty while history is still there.
  const tradeWeekSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of trades) s.add(weekKey(new Date(t.trade_date + "T00:00:00")));
    return s;
  }, [trades]);
  const tradeMonthSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of trades) s.add(t.trade_date.slice(0, 7));
    return s;
  }, [trades]);
  const defaultWeekKey = weekKeys.find((k) => tradeWeekSet.has(k)) ?? weekKeys[0] ?? null;
  const defaultMonthKey = monthKeys.find((k) => tradeMonthSet.has(k)) ?? monthKeys[0] ?? null;
  const activeKey = tab === "weekly" ? (weekSel ?? defaultWeekKey) : tab === "monthly" ? (monthSel ?? defaultMonthKey) : null;

  const report = useMemo(() => buildReport(filterByScope(trades, tab, activeKey), tab), [trades, tab, activeKey]);

  const lifetimeWeekdays = useMemo<LifetimeWeekday[]>(() => {
    const ana = trades.map(toAnalytics);
    const stats = weekdayStats(ana);
    const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return ALL_DAYS.map((d) => {
      const s = stats.find((x) => x.key === d);
      return {
        name: d,
        count: s?.count ?? 0,
        winRate: s?.winRate ?? null,
        wins: s?.wins ?? 0,
        losses: s?.losses ?? 0,
      };
    });
  }, [trades]);

  return (
    <div className="px-6 py-8 md:px-10 md:py-10">
      <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="text-3xl font-bold tracking-tight md:text-4xl">
        Analytics
      </motion.h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Performance organized into overall, weekly, and monthly reports.</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
          <button onClick={() => setTab("overall")} className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200", tab === "overall" ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]" : "text-muted-foreground hover:text-foreground")}>
            <BarChart3 className="h-4 w-4" /> Overall
          </button>
          <button onClick={() => setTab("weekly")} className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200", tab === "weekly" ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]" : "text-muted-foreground hover:text-foreground")}>
            <CalendarDays className="h-4 w-4" /> Weekly
          </button>
          <button onClick={() => setTab("monthly")} className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200", tab === "monthly" ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]" : "text-muted-foreground hover:text-foreground")}>
            <CalendarRange className="h-4 w-4" /> Monthly
          </button>
        </div>

        {tab === "weekly" && (
          <select
            value={weekSel ?? defaultWeekKey ?? ""}
            onChange={(e) => setWeekSel(e.target.value)}
            className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {weekKeys.map((k) => (
              <option key={k} value={k} className="bg-background text-foreground">{labelWeek(k)}</option>
            ))}
          </select>
        )}

        {tab === "monthly" && (
          <select
            value={monthSel ?? defaultMonthKey ?? ""}
            onChange={(e) => setMonthSel(e.target.value)}
            className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {monthKeys.map((k) => (
              <option key={k} value={k} className="bg-background text-foreground">{labelMonth(k)}</option>
            ))}
          </select>
        )}
      </div>

      <AnimatePresence mode="wait">
        <ReportView key={`${tab}-${activeKey ?? "all"}`} r={report} scope={tab} lifetimeWeekdays={lifetimeWeekdays} />
      </AnimatePresence>
    </div>
  );
}
