import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Activity,
  BarChart3,
  Target,
  Flame,
  CalendarDays,
  CalendarRange,
  Trophy,
  Layers,
  DollarSign,
  Grid3x3,
  Smile,
  Search,
  X,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EMOTIONS } from "@/lib/emotions";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrades } from "@/lib/trades.functions";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { cn } from "@/lib/utils";
import { sessionLabel, SESSIONS, KILLZONES, killzoneLabel } from "@/lib/trade-constants";
import {
  isPaperTrade,
  localDateKey,
  recordedR,
  rrNum,
  streaks,
  toAnalytics,
  type DbTrade,
} from "@/lib/trade-mappers";
import {
  categoryStats,
  equityCurve,
  sessionStats,
  weekdayStats,
  killzoneStats,
} from "@/lib/analytics";
import { getReviewStatus } from "@/lib/review-status";

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
  name: string;
  trades: number;
  winRate: number | null;
  netR: number;
  avgRR: number | null;
  avgProfit: number;
  avgLoss: number;
};

type ReportScope = "overall" | "weekly" | "monthly" | "quarterly" | "yearly";

type Report = {
  totalTrades: number;
  winRate: number | null;
  avgRR: number;
  totalR: number;
  bestSession: string;
  worstSession: string;
  sessions: {
    name: string;
    wins: number;
    losses: number;
    count: number;
    winRate: number | null;
    netR: number;
    avgRR: number | null;
  }[];
  killzones: {
    name: string;
    wins: number;
    losses: number;
    count: number;
    winRate: number | null;
    avgRR: number | null;
  }[];
  bestKillzone: string;
  worstKillzone: string;
  bestCategory: string;
  bestTrade: { sym: string; r: number } | null;
  worstTrade: { sym: string; r: number } | null;
  longest: { wins: number; losses: number };
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  reviewedTrades: number;
  equity: { d: string; v: number }[];
  equityInterval?: number;
  grades: { name: string; count: number; avgR: number }[];
  categories: CategoryRow[];
  weekdays: {
    name: string;
    count: number;
    winRate: number | null;
    wins: number;
    losses: number;
    netR: number | null;
  }[];
  bestDay: string | null;
  worstDay: string | null;
  // New breakdowns (Phase 3 cleanup)
  instruments: {
    name: string;
    count: number;
    winRate: number | null;
    netR: number;
    avgRR: number | null;
  }[];
  directions: {
    name: "Long" | "Short";
    count: number;
    winRate: number | null;
    netR: number;
    avgRR: number | null;
  }[];
  plannedVsAchieved: {
    plannedAvg: number | null;
    achievedAvg: number | null;
    capturePct: number | null;
    sampleSize: number;
  };
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
    inNetR: number | null;
    outNetR: number | null;
  };
  emotions: {
    items: {
      key: string;
      emoji: string;
      label: string;
      count: number;
      winRate: number | null;
      avgR: number | null;
      netR: number;
    }[];
    mostUsed: { key: string; emoji: string; label: string; count: number } | null;
    best: { key: string; emoji: string; label: string; winRate: number } | null;
    worst: { key: string; emoji: string; label: string; winRate: number } | null;
    total: number;
  };
};

function startOfWeekISO(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(d: Date): string {
  const start = startOfWeekISO(d);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function quarterKey(d: Date): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function yearKey(d: Date): string {
  return String(d.getFullYear());
}

function filterByScope(all: DbTrade[], scope: ReportScope, periodKey: string | null): DbTrade[] {
  if (scope === "overall") return all;
  if (scope === "weekly") {
    const key = periodKey ?? weekKey(new Date());
    return all.filter((t) => weekKey(new Date(t.trade_date + "T00:00:00")) === key);
  }
  if (scope === "quarterly") {
    const key = periodKey ?? quarterKey(new Date());
    return all.filter((t) => quarterKey(new Date(t.trade_date + "T00:00:00")) === key);
  }
  if (scope === "yearly") {
    const key = periodKey ?? yearKey(new Date());
    return all.filter((t) => t.trade_date.startsWith(key));
  }
  const key = periodKey ?? ymKey(new Date());
  return all.filter((t) => t.trade_date.startsWith(key));
}

function isCompletedReview(trade: DbTrade): boolean {
  return getReviewStatus(trade) === "reviewed";
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

function recentWeekKeys(count: number): string[] {
  const currentStart = startOfWeekISO(new Date());
  return Array.from({ length: count }, (_item, index) =>
    weekKey(addDays(currentStart, -7 * index)),
  );
}

function recentMonthKeys(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_item, index) =>
    ymKey(new Date(now.getFullYear(), now.getMonth() - index, 1)),
  );
}

function labelWeek(key: string): string {
  const start = new Date(key + "T00:00:00");
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const thisWk = weekKey(new Date());
  const lastWk = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return weekKey(d);
  })();
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

function cleanMonthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

type WeeklySelection = "current" | "previous" | "custom";

function weeklyRangeKeys(count: number): Set<string> {
  const currentStart = startOfWeekISO(new Date());
  const keys = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    keys.add(weekKey(addDays(currentStart, -7 * i)));
  }
  return keys;
}

function filterByWeeklySelection(
  all: DbTrade[],
  selection: WeeklySelection,
  customKey: string,
): DbTrade[] {
  const key =
    selection === "previous"
      ? weekKey(addDays(new Date(), -7))
      : selection === "custom"
        ? customKey
        : weekKey(new Date());
  return all.filter((t) => weekKey(new Date(t.trade_date + "T00:00:00")) === key);
}

function labelWeekRange(key: string): string {
  const start = new Date(key + "T00:00:00");
  const end = addDays(start, 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const sameYear = start.getFullYear() === end.getFullYear();
  const endLabel = sameYear
    ? end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const startLabel = sameYear
    ? fmt(start)
    : start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} - ${endLabel}`;
}

function buildReport(trades: DbTrade[], scope: ReportScope): Report {
  const ana = trades.map(toAnalytics);
  const total = trades.length;
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const decided = wins + losses;
  const winRate = decided ? (wins / decided) * 100 : null;

  const rrs = ana.map((t) => recordedR(t.achieved_rr)).filter((n): n is number => n !== null);
  const totalR = rrs.reduce((a, b) => a + b, 0);
  const avgRR = rrs.length ? totalR / rrs.length : 0;

  const winsR = trades
    .filter((t) => t.result === "win")
    .map((t) => recordedR(t.achieved_rr))
    .filter((n): n is number => n !== null);
  const lossR = trades
    .filter((t) => t.result === "loss")
    .map((t) => recordedR(t.achieved_rr))
    .filter((n): n is number => n !== null);
  const sumWin = winsR.reduce((a, b) => a + b, 0);
  const sumLoss = Math.abs(lossR.reduce((a, b) => a + b, 0));
  const expectancy = rrs.length ? totalR / rrs.length : null;
  const profitFactor = sumWin > 0 && sumLoss > 0 ? sumWin / sumLoss : null;

  const eq = equityCurve(ana);
  let peak = 0,
    maxDD = 0;
  for (const p of eq) {
    peak = Math.max(peak, p.cumR);
    maxDD = Math.max(maxDD, peak - p.cumR);
  }

  const sStats = sessionStats(ana);
  const sessionOrder = SESSIONS.map((s) => ({ key: s.v, label: s.l }));
  const sessions = sessionOrder.map((o) => {
    const s = sStats.find((x) => x.key === o.key);
    const subset = ana.filter((t) => t.session === o.key);
    const rrList = subset
      .map((t) => rrNum(t.achieved_rr))
      .filter((_value, index) => subset[index].achieved_rr != null);
    const netR = rrList.reduce((sum, value) => sum + value, 0);
    return {
      name: o.label,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      count: s?.count ?? 0,
      winRate: s?.winRate ?? null,
      netR: Number(netR.toFixed(2)),
      avgRR: rrList.length ? Number((netR / rrList.length).toFixed(2)) : null,
    };
  });
  const eligibleSessions = sStats.filter((s) => s.winRate != null && s.count >= 5);
  const bestSessionStat = [...eligibleSessions].sort(
    (a, b) => (b.winRate ?? 0) - (a.winRate ?? 0),
  )[0];
  const worstSessionStat = [...eligibleSessions].sort(
    (a, b) => (a.winRate ?? 0) - (b.winRate ?? 0),
  )[0];

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
    const subset = ana.filter((t) => (t.categories ?? []).includes(s.key));
    const wList = subset.filter((t) => t.result === "win").map((t) => rrNum(t.achieved_rr));
    const lList = subset.filter((t) => t.result === "loss").map((t) => rrNum(t.achieved_rr));
    const net = subset.reduce((a, b) => a + rrNum(b.achieved_rr), 0);
    return {
      name: s.key,
      trades: s.count,
      winRate: s.winRate,
      netR: Number(net.toFixed(2)),
      avgRR: s.avgRR,
      avgProfit: wList.length
        ? Number((wList.reduce((a, b) => a + b, 0) / wList.length).toFixed(2))
        : 0,
      avgLoss: lList.length
        ? Number((lList.reduce((a, b) => a + b, 0) / lList.length).toFixed(2))
        : 0,
    };
  });
  const bestCategory = categories[0]?.name ?? "—";

  const closedTrades = trades.filter(
    (t) => t.result === "win" || t.result === "loss" || t.result === "breakeven",
  );
  let best: DbTrade | null = null,
    worst: DbTrade | null = null;
  for (const t of closedTrades) {
    const v = rrNum(t.achieved_rr);
    if (!best || v > rrNum(best.achieved_rr)) best = t;
    if (!worst || v < rrNum(worst.achieved_rr)) worst = t;
  }

  const stk = streaks(trades);

  const gradeOrder = ["A+", "A", "B+", "B", "C", "D"];
  const grades = gradeOrder.map((g) => {
    const sub = ana.filter((t) => t.grade === g);
    const r = sub.map((t) => recordedR(t.achieved_rr)).filter((n): n is number => n !== null);
    return {
      name: g,
      count: sub.length,
      avgR: r.length ? Number((r.reduce((a, b) => a + b, 0) / r.length).toFixed(2)) : 0,
    };
  });

  // ===== New aggregations =====
  // Instrument breakdown
  const byInstrument = new Map<string, DbTrade[]>();
  for (const t of trades) {
    const k = (t.instrument ?? "").trim() || "—";
    if (!byInstrument.has(k)) byInstrument.set(k, []);
    byInstrument.get(k)!.push(t);
  }
  const instruments = Array.from(byInstrument.entries())
    .map(([name, subset]) => {
      const w = subset.filter((t) => t.result === "win").length;
      const l = subset.filter((t) => t.result === "loss").length;
      const decided = w + l;
      const rrList = subset
        .filter((t) => t.result === "win" || t.result === "loss" || t.result === "breakeven")
        .map((t) => recordedR(t.achieved_rr))
        .filter((n): n is number => n !== null);
      const net = rrList.reduce((a, b) => a + b, 0);
      return {
        name,
        count: subset.length,
        winRate: decided ? (w / decided) * 100 : null,
        netR: Number(net.toFixed(2)),
        avgRR: rrList.length ? Number((net / rrList.length).toFixed(2)) : null,
      };
    })
    .sort((a, b) => b.netR - a.netR)
    .slice(0, 20);

  // Direction breakdown
  const directions = (["long", "short"] as const).map((dir) => {
    const subset = trades.filter((t) => t.direction === dir);
    const w = subset.filter((t) => t.result === "win").length;
    const ll = subset.filter((t) => t.result === "loss").length;
    const decided = w + ll;
    const rrList = subset
      .filter((t) => t.result === "win" || t.result === "loss" || t.result === "breakeven")
      .map((t) => recordedR(t.achieved_rr))
      .filter((n): n is number => n !== null);
    const net = rrList.reduce((a, b) => a + b, 0);
    return {
      name: (dir === "long" ? "Long" : "Short") as "Long" | "Short",
      count: subset.length,
      winRate: decided ? (w / decided) * 100 : null,
      netR: Number(net.toFixed(2)),
      avgRR: rrList.length ? Number((net / rrList.length).toFixed(2)) : null,
    };
  });

  // Planned vs Achieved — only trades where both are present
  const pairBoth = trades
    .filter((t) => t.result === "win" || t.result === "loss" || t.result === "breakeven")
    .map((t) => ({
      planned: t.planned_rr != null && t.planned_rr !== "" ? parseFloat(String(t.planned_rr)) : NaN,
      achieved: t.achieved_rr != null && t.achieved_rr !== "" ? Number(t.achieved_rr) : NaN,
    }))
    .filter((p) => Number.isFinite(p.planned) && Number.isFinite(p.achieved));
  const plannedVsAchieved = (() => {
    if (pairBoth.length === 0)
      return { plannedAvg: null, achievedAvg: null, capturePct: null, sampleSize: 0 };
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
    const closed = t.result === "win" || t.result === "loss" || t.result === "breakeven";
    const r = closed ? rrNum(t.achieved_rr) : 0;
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
    equityChart = eq.map((p) => ({
      d:
        p.tradeIndex === 0
          ? "0"
          : new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" }),
      v: p.cumR,
    }));
  } else if (scope === "monthly") {
    equityChart = eq.map((p) => ({ d: p.tradeIndex === 0 ? "0" : p.date.slice(8), v: p.cumR }));
    equityInterval = Math.max(0, Math.floor(equityChart.length / 8));
  } else {
    equityChart = eq.map((p) => ({ d: p.tradeIndex === 0 ? "0" : p.date, v: p.cumR }));
    equityInterval = Math.max(0, Math.floor(equityChart.length / 8));
  }

  // Day-of-week analysis (Mon–Fri primary focus)
  const wdStats = weekdayStats(ana);
  const TRADING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const weekdays = TRADING_DAYS.map((d) => {
    const s = wdStats.find((x) => x.key === d);
    const subset = trades.filter(
      (t) =>
        new Date(t.trade_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" }) === d,
    );
    const rrList = subset
      .filter((t) => t.result === "win" || t.result === "loss" || t.result === "breakeven")
      .map((t) => rrNum(t.achieved_rr))
      .filter((_value, index) => subset[index].achieved_rr != null);
    const netR = rrList.length ? rrList.reduce((sum, value) => sum + value, 0) : null;
    return {
      name: d,
      count: s?.count ?? 0,
      winRate: s?.winRate ?? null,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      netR: netR == null ? null : Number(netR.toFixed(2)),
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
    const vals = arr
      .filter((t) => t.result === "win" || t.result === "loss" || t.result === "breakeven")
      .map((t) => recordedR(t.achieved_rr))
      .filter((r): r is number => r != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const netROf = (arr: typeof trades) => {
    const vals = arr
      .filter((t) => t.result === "win" || t.result === "loss" || t.result === "breakeven")
      .map((t) => recordedR(t.achieved_rr))
      .filter((r): r is number => r != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
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
    inNetR: netROf(kzIn),
    outNetR: netROf(kzOut),
  };

  // Emotion insights — derived from trades.emotion_tags (multi)
  const emoMap = new Map<
    string,
    { count: number; wins: number; losses: number; rSum: number; rCount: number; netR: number }
  >();
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
      if (hasR) {
        cur.rSum += r;
        cur.rCount += 1;
        cur.netR += r;
      }
      emoMap.set(tag, cur);
    }
  }
  const emotionItems = Array.from(emoMap.entries())
    .map(([key, v]) => {
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
    })
    .sort((a, b) => b.count - a.count);
  const mostUsedEmo = emotionItems[0] ?? null;
  const eligibleEmo = emotionItems.filter((e) => e.winRate != null && e.count >= 2) as {
    key: string;
    emoji: string;
    label: string;
    count: number;
    winRate: number;
    avgR: number | null;
    netR: number;
  }[];
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
    bestTrade:
      best && rrNum(best.achieved_rr) > 0
        ? { sym: best.instrument, r: rrNum(best.achieved_rr) }
        : null,
    worstTrade:
      worst && rrNum(worst.achieved_rr) < 0
        ? { sym: worst.instrument, r: rrNum(worst.achieved_rr) }
        : null,
    longest: { wins: stk.longestWin, losses: stk.longestLoss },
    expectancy: expectancy == null ? null : Number(expectancy.toFixed(2)),
    profitFactor: profitFactor == null ? null : Number(profitFactor.toFixed(2)),
    maxDrawdown: Number(maxDD.toFixed(2)),
    reviewedTrades: trades.filter(isCompletedReview).length,
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
      mostUsed: mostUsedEmo
        ? {
            key: mostUsedEmo.key,
            emoji: mostUsedEmo.emoji,
            label: mostUsedEmo.label,
            count: mostUsedEmo.count,
          }
        : null,
      best: bestEmo
        ? { key: bestEmo.key, emoji: bestEmo.emoji, label: bestEmo.label, winRate: bestEmo.winRate }
        : null,
      worst: worstEmo
        ? {
            key: worstEmo.key,
            emoji: worstEmo.emoji,
            label: worstEmo.label,
            winRate: worstEmo.winRate,
          }
        : null,
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

function Kpi({
  icon: Icon,
  label,
  value,
  displayValue,
  suffix = "",
  tone,
  decimals = 0,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  displayValue?: ReactNode;
  suffix?: string;
  tone: keyof typeof toneMap;
  decimals?: number;
  sub?: string;
}) {
  return (
    <div className="glow-card group rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ring-white/[0.06]",
            toneMap[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight">
        {displayValue ?? <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function LowDataState({
  title = "More trades needed",
  description = "Log at least 3 trades to make this chart useful.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="grid min-h-[160px] place-items-center rounded-xl bg-white/[0.02] px-5 py-8 text-center ring-1 ring-white/[0.04]">
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SimpleSectionState({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-xl bg-white/[0.02] px-4 py-3 text-sm text-muted-foreground ring-1 ring-white/[0.04]">
      {children}
    </p>
  );
}

function signedR(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}R`;
}

type LifetimeWeekday = {
  name: string;
  count: number;
  winRate: number | null;
  wins: number;
  losses: number;
  netR: number | null;
};

function SessionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Report["sessions"][number] }>;
  label?: string;
}) {
  if (!active) return null;
  const data = payload?.[0]?.payload;
  if (!data) return null;
  if (data.count === 0) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[oklch(0.13_0.018_270)] px-3 py-2 text-xs shadow-2xl shadow-black/40">
        <div className="font-semibold text-foreground">{label}</div>
        <div className="mt-1 text-muted-foreground">No trades logged</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[oklch(0.13_0.018_270)] px-3 py-2 text-xs shadow-2xl shadow-black/40">
      <div className="font-semibold text-foreground">{label}</div>
      <div className="mt-2 grid gap-1 text-muted-foreground">
        <div>
          Trades: <span className="text-foreground">{data.count}</span>
        </div>
        <div>
          Wins: <span className="text-foreground">{data.wins}</span>
        </div>
        <div>
          Losses: <span className="text-foreground">{data.losses}</span>
        </div>
        <div>
          Win rate:{" "}
          <span className="text-foreground">
            {data.winRate == null ? "—" : `${data.winRate.toFixed(1)}%`}
          </span>
        </div>
        <div>
          Net R:{" "}
          <span className={data.netR >= 0 ? "text-success" : "text-destructive"}>
            {signedR(data.netR)}
          </span>
        </div>
        <div>
          Avg R:{" "}
          <span
            className={
              data.avgRR == null
                ? "text-muted-foreground"
                : data.avgRR >= 0
                  ? "text-success"
                  : "text-destructive"
            }
          >
            {signedR(data.avgRR)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ReportView({
  r,
  lifetimeWeekdays,
}: {
  r: Report;
  scope: ReportScope;
  lifetimeWeekdays: LifetimeWeekday[];
}) {
  const [activeDetailView, setActiveDetailView] = useState<
    "overview" | "categories" | "mistakes" | "emotions" | "instruments" | "sessions"
  >("overview");
  const [selectedSession, setSelectedSession] = useState<any>(null);

  if (r.totalTrades === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mt-6"
      >
        <PremiumEmptyState
          icon={BarChart3}
          title="No trades in this period yet"
          description="Choose another report period or log a trade to populate analytics."
        />
      </motion.div>
    );
  }

  const hasUsefulEquity = r.totalTrades >= 3;
  const hasSessionSample = r.totalTrades >= 3;
  const reviewGap = Math.max(0, r.totalTrades - r.reviewedTrades);
  const executionGap =
    r.plannedVsAchieved.plannedAvg != null && r.plannedVsAchieved.achievedAvg != null
      ? Number((r.plannedVsAchieved.achievedAvg - r.plannedVsAchieved.plannedAvg).toFixed(2))
      : null;
  const repeatedCostlyMistake = r.mistakes.find(
    (mistake) => mistake.count >= 2 && mistake.netR < 0,
  );
  const highlightCards =
    r.reviewedTrades < 10
      ? [
          {
            title: "Review gap",
            body: "Tracks trades that still need detailed review.",
          },
          {
            title: "Execution gap",
            body: "Compares planned R with achieved R.",
          },
          {
            title: "Repeated costly mistake",
            body: "Finds repeated rule-breaks linked to lost R.",
          },
        ]
      : [
          {
            title: "Review gap",
            body:
              reviewGap === 0
                ? "All trades in this period have completed detailed reviews."
                : `${reviewGap} trade${reviewGap === 1 ? "" : "s"} still need detailed review.`,
          },
          {
            title: "Execution gap",
            body:
              executionGap == null
                ? "Add planned R to more trades to compare intent vs result."
                : executionGap < 0
                  ? `Achieved R is ${Math.abs(executionGap).toFixed(2)}R below planned R on average.`
                  : executionGap > 0
                    ? `Achieved R is ${executionGap.toFixed(2)}R above planned R on average.`
                    : "Achieved R matches planned R on average.",
          },
          {
            title: "Repeated costly mistake",
            body: repeatedCostlyMistake
              ? `${repeatedCostlyMistake.name} appeared ${repeatedCostlyMistake.count} times and is linked to ${signedR(repeatedCostlyMistake.netR)}.`
              : "No repeated costly mistake detected yet.",
          },
        ];

  if (activeDetailView !== "overview") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6 flex flex-col gap-4"
      >
        <div>
          <button
            onClick={() => setActiveDetailView("overview")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition duration-200"
          >
            &larr; Back to Analytics
          </button>
        </div>

        {activeDetailView === "categories" && (
          <div className="section-card rounded-2xl p-5">
            <div className="border-b border-white/[0.06] pb-4 mb-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Grid3x3 className="h-5 w-5 text-primary" /> Category performance breakdown
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Full breakdown of your setup performance. Logged setups and categories.
              </p>
            </div>
            {r.categories.length === 0 ? (
              <SimpleSectionState>No categories tagged yet.</SimpleSectionState>
            ) : (
              <div className="overflow-x-auto">
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
                    {r.categories
                      .slice()
                      .sort((a, b) => b.trades - a.trades)
                      .map((c) => (
                        <tr
                          key={c.name}
                          className="border-b border-white/[0.04] last:border-0 transition-colors duration-150 hover:bg-white/[0.02]"
                        >
                          <td className="py-3 pr-4 font-medium">{c.name}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">{c.trades}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {c.winRate == null ? "—" : `${c.winRate.toFixed(1)}%`}
                          </td>
                          <td
                            className={cn(
                              "py-3 pr-4 text-right font-semibold tabular-nums",
                              c.netR >= 0 ? "text-success" : "text-destructive",
                            )}
                          >
                            {c.netR >= 0 ? "+" : ""}
                            {c.netR.toFixed(2)}R
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {c.avgRR == null ? "—" : `${c.avgRR.toFixed(2)}R`}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-success">
                            {c.avgProfit > 0 ? "+" : ""}
                            {c.avgProfit.toFixed(2)}R
                          </td>
                          <td className="py-3 text-right tabular-nums text-destructive">
                            {c.avgLoss.toFixed(2)}R
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeDetailView === "mistakes" && (
          <div className="section-card rounded-2xl p-5">
            <div className="border-b border-white/[0.06] pb-4 mb-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Flame className="h-5 w-5 text-warning" /> Mistake analysis
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                All reviewed trade mistakes and rule-breaks found in your journal, ranked by
                costliness.
              </p>
            </div>
            {r.mistakes.length === 0 ? (
              <SimpleSectionState>No mistakes tagged yet.</SimpleSectionState>
            ) : (
              <div className="space-y-2">
                {r.mistakes.map((m) => (
                  <div
                    key={m.name}
                    className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2.5 ring-1 ring-white/[0.04]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded-md bg-warning/[0.12] px-2 py-0.5 text-[11px] font-semibold text-warning ring-1 ring-warning/[0.18]">
                        {m.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{m.count} occurrences</span>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        m.netR >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {m.netR >= 0 ? "+" : ""}
                      {m.netR}R
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeDetailView === "emotions" && (
          <div className="section-card rounded-2xl p-5">
            <div className="border-b border-white/[0.06] pb-4 mb-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Smile className="h-5 w-5 text-primary" /> Emotion Insights
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Full breakdown of performance correlated with tagged psychological states and
                emotions.
              </p>
            </div>
            {r.emotions.total === 0 ? (
              <SimpleSectionState>No emotions tagged yet.</SimpleSectionState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-3 pr-4 text-left">
                        Emotion
                      </th>
                      <th scope="col" className="py-3 pr-4 text-right">
                        Count
                      </th>
                      <th scope="col" className="py-3 pr-4 text-right">
                        Win rate
                      </th>
                      <th scope="col" className="py-3 pr-4 text-right">
                        Avg R
                      </th>
                      <th scope="col" className="py-3 text-right">
                        Net R
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {r.emotions.items
                      .filter((e) => e.count > 0)
                      .map((e) => (
                        <tr key={e.key}>
                          <td className="py-3 pr-4">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="text-base leading-none">{e.emoji}</span>
                              <span className="truncate font-medium">{e.label}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                            {e.count}
                          </td>
                          <td
                            className={cn(
                              "py-3 pr-4 text-right font-semibold tabular-nums",
                              e.winRate == null
                                ? "text-muted-foreground"
                                : e.winRate >= 50
                                  ? "text-success"
                                  : "text-destructive",
                            )}
                          >
                            {e.winRate == null ? "—" : `${e.winRate.toFixed(0)}%`}
                          </td>
                          <td
                            className={cn(
                              "py-3 pr-4 text-right font-semibold tabular-nums",
                              e.avgR == null
                                ? "text-muted-foreground"
                                : e.avgR >= 0
                                  ? "text-success"
                                  : "text-destructive",
                            )}
                          >
                            {e.avgR == null
                              ? "—"
                              : `${e.avgR >= 0 ? "+" : ""}${e.avgR.toFixed(2)}R`}
                          </td>
                          <td
                            className={cn(
                              "py-3 text-right font-semibold tabular-nums",
                              e.netR >= 0 ? "text-success" : "text-destructive",
                            )}
                          >
                            {e.netR >= 0 ? "+" : ""}
                            {e.netR.toFixed(2)}R
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeDetailView === "instruments" && (
          <div className="section-card rounded-2xl p-5">
            <div className="border-b border-white/[0.06] pb-4 mb-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <DollarSign className="h-5 w-5 text-primary" /> Instrument performance
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Full performance breakdown by asset, ticker, or logged trading instrument.
              </p>
            </div>
            {r.instruments.length === 0 ? (
              <SimpleSectionState>No instruments logged yet.</SimpleSectionState>
            ) : (
              <div className="overflow-x-auto">
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
                    {r.instruments
                      .slice()
                      .sort((a, b) => b.count - a.count)
                      .map((i) => (
                        <tr
                          key={i.name}
                          className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                        >
                          <td className="py-3 pr-4 font-medium">{i.name}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">{i.count}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {i.winRate == null ? "—" : `${i.winRate.toFixed(1)}%`}
                          </td>
                          <td
                            className={cn(
                              "py-3 pr-4 text-right font-semibold tabular-nums",
                              i.netR >= 0 ? "text-success" : "text-destructive",
                            )}
                          >
                            {i.netR >= 0 ? "+" : ""}
                            {i.netR}R
                          </td>
                          <td className="py-3 text-right tabular-nums">
                            {i.avgRR == null ? "—" : `${i.avgRR.toFixed(2)}R`}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeDetailView === "sessions" && (
          <div className="section-card rounded-2xl p-5">
            <div className="border-b border-white/[0.06] pb-4 mb-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Layers className="h-5 w-5 text-primary" /> Session performance breakdown
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Full performance metrics categorized by your trading sessions.
              </p>
            </div>
            {r.sessions.length === 0 ? (
              <SimpleSectionState>No session data logged yet.</SimpleSectionState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="py-2.5 pr-4">Session</th>
                      <th className="py-2.5 pr-4 text-right">Trades</th>
                      <th className="py-2.5 pr-4 text-right">Wins</th>
                      <th className="py-2.5 pr-4 text-right">Losses</th>
                      <th className="py-2.5 pr-4 text-right">Win rate</th>
                      <th className="py-2.5 pr-4 text-right">Net R</th>
                      <th className="py-2.5 text-right">Avg R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.sessions.map((s) => (
                      <tr
                        key={s.name}
                        className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                      >
                        <td className="py-3 pr-4 font-medium">{s.name}</td>
                        <td className="py-3 pr-4 text-right tabular-nums">{s.count}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-success/90">
                          {s.wins}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-destructive/80">
                          {s.losses}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums font-semibold">
                          {s.winRate == null ? "—" : `${s.winRate.toFixed(1)}%`}
                        </td>
                        <td
                          className={cn(
                            "py-3 pr-4 text-right font-bold tabular-nums",
                            s.netR >= 0 ? "text-success" : "text-destructive",
                          )}
                        >
                          {s.netR >= 0 ? "+" : ""}
                          {s.netR.toFixed(2)}R
                        </td>
                        <td
                          className={cn(
                            "py-3 text-right font-semibold tabular-nums",
                            s.avgRR == null
                              ? "text-muted-foreground"
                              : s.avgRR >= 0
                                ? "text-success"
                                : "text-destructive",
                          )}
                        >
                          {s.avgRR == null
                            ? "—"
                            : `${s.avgRR >= 0 ? "+" : ""}${s.avgRR.toFixed(2)}R`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="mt-6 flex flex-col gap-4"
    >
      {/* Summary stats (first) */}
      <div className="order-1 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        <Kpi icon={BarChart3} label="TOTAL TRADES" value={r.totalTrades} tone="info" />
        <Kpi
          icon={Target}
          label="WIN RATE"
          value={r.winRate ?? 0}
          displayValue={r.winRate == null ? "—" : undefined}
          decimals={1}
          suffix="%"
          tone="primary"
        />
        <Kpi
          icon={DollarSign}
          label="NET R"
          value={r.totalR}
          decimals={2}
          suffix="R"
          tone={r.totalR >= 0 ? "success" : "destructive"}
        />
        <Kpi
          icon={Activity}
          label="AVG R:R"
          value={r.avgRR}
          decimals={2}
          suffix="R"
          tone="success"
        />
        <Kpi
          icon={BarChart3}
          label="PROFIT FACTOR"
          value={r.profitFactor ?? 0}
          displayValue={r.profitFactor == null ? "—" : undefined}
          decimals={2}
          tone="info"
          sub={r.profitFactor == null ? "Needs wins and losses" : undefined}
        />
        <Kpi
          icon={Target}
          label="EXPECTANCY"
          value={r.expectancy ?? 0}
          displayValue={r.expectancy == null ? "—" : undefined}
          decimals={2}
          suffix="R"
          tone="primary"
        />
        <Kpi
          icon={Flame}
          label="MAX DRAWDOWN"
          value={r.maxDrawdown}
          decimals={2}
          suffix="R"
          tone="warning"
        />
        <Kpi
          icon={Trophy}
          label="COMPLETED REVIEWS"
          value={0}
          displayValue={`${r.reviewedTrades} / ${r.totalTrades}`}
          tone="success"
        />
      </div>

      {/* Highlights */}
      <div className="order-2 section-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" /> Highlights
        </h3>
        {r.reviewedTrades < 10 ? (
          <div className="mt-4 rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.04]">
            <div className="text-sm font-semibold">Not enough reviewed trades yet</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Complete more detailed reviews to unlock reliable highlights.
            </p>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
              {highlightCards.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg bg-white/[0.025] px-3 py-2 text-muted-foreground ring-1 ring-white/[0.04]"
                >
                  <div className="font-semibold text-foreground/85">{item.title}</div>
                  <p className="mt-1 leading-5">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {highlightCards.map((item) => (
              <div
                key={item.title}
                className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.04]"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {item.title}
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground/86">{item.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Performance Charts — equity curve */}
      <div className="order-3 section-card rounded-2xl p-5">
        <h3 className="text-sm font-semibold">Equity curve</h3>
        <div className="mt-4 h-[280px]">
          {!hasUsefulEquity ? (
            <LowDataState description="Log at least 3 trades to make the equity curve useful." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={r.equity} margin={{ top: 10, right: 8, left: -16, bottom: 8 }}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
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
                  tick={{ fontSize: 11, fill: "oklch(0.55 0 0)" }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  interval={r.equityInterval ?? 0}
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
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="oklch(0.78 0.19 295)"
                  strokeWidth={2}
                  fill="url(#eq)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Session performance breakdown */}
      <div className="order-6 section-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="h-4 w-4 text-primary" /> Session performance breakdown
        </h3>
        <div className="mt-4">
          {!hasSessionSample ? (
            <div className="h-[260px]">
              <LowDataState description="Log at least 3 trades to compare session performance." />
            </div>
          ) : (
            <>
              {/* Desktop Chart View */}
              <div className="hidden h-[260px] sm:block">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={r.sessions}
                    margin={{ top: 10, right: 8, left: -20, bottom: 0 }}
                    onClick={(state) => {
                      if (state && state.activePayload && state.activePayload.length > 0) {
                        const sessionData = state.activePayload[0].payload;
                        setSelectedSession(sessionData);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.04)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "oklch(0.55 0 0)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "oklch(0.5 0 0)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "oklch(1 0 0 / 0.03)" }}
                      content={<SessionTooltip />}
                    />
                    <Bar
                      dataKey="wins"
                      stackId="a"
                      fill="oklch(0.62 0.13 152)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="losses"
                      stackId="a"
                      fill="oklch(0.64 0.22 22)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Mobile List Fallback */}
              <div className="space-y-2 sm:hidden">
                {r.sessions.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setSelectedSession(s)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl p-3 text-left ring-1 transition",
                      selectedSession?.name === s.name
                        ? "bg-primary/12 ring-primary/35"
                        : "bg-white/[0.025] ring-white/[0.04] hover:bg-white/[0.045]",
                    )}
                  >
                    <div>
                      <div className="text-xs font-semibold text-foreground">{s.name}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {s.count} trade{s.count === 1 ? "" : "s"} · {s.wins}W - {s.losses}L
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={cn(
                          "text-xs font-bold tabular-nums",
                          s.netR >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {s.netR >= 0 ? "+" : ""}
                        {s.netR.toFixed(2)}R
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {s.winRate == null ? "—" : `${s.winRate.toFixed(0)}% WR`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Detail Panel */}
              <div className="mt-4 rounded-xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.04]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                    {selectedSession
                      ? `Session Detail: ${selectedSession.name}`
                      : "Select a session to view details"}
                  </span>
                  {selectedSession && (
                    <button
                      type="button"
                      onClick={() => setSelectedSession(null)}
                      className="text-[10px] font-semibold text-primary transition hover:text-primary-glow"
                    >
                      Clear selection
                    </button>
                  )}
                </div>
                {selectedSession ? (
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4 text-xs">
                    <div>
                      <div className="text-muted-foreground/70">Trades</div>
                      <div className="mt-0.5 font-bold text-foreground/90">
                        {selectedSession.count}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground/70">Win rate</div>
                      <div className="mt-0.5 font-bold text-foreground/90">
                        {selectedSession.winRate == null
                          ? "—"
                          : `${selectedSession.winRate.toFixed(1)}%`}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground/70">Net R</div>
                      <div
                        className={cn(
                          "mt-0.5 font-bold",
                          selectedSession.netR >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {selectedSession.netR >= 0 ? "+" : ""}
                        {selectedSession.netR.toFixed(2)}R
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground/70">Avg R</div>
                      <div
                        className={cn(
                          "mt-0.5 font-bold",
                          selectedSession.avgRR == null
                            ? "text-muted-foreground/70"
                            : selectedSession.avgRR >= 0
                              ? "text-success"
                              : "text-destructive",
                        )}
                      >
                        {selectedSession.avgRR == null
                          ? "—"
                          : `${selectedSession.avgRR >= 0 ? "+" : ""}${selectedSession.avgRR.toFixed(2)}R`}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground/60 italic">
                    Tap a session bar or list card above to view detailed metrics here.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Category performance breakdown */}
      <div className="order-8 section-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Grid3x3 className="h-4 w-4 text-primary" /> Category performance breakdown
          </h3>
          {r.categories.length > 4 && (
            <button
              onClick={() => setActiveDetailView("categories")}
              className="text-xs font-semibold text-primary transition hover:text-primary-glow"
            >
              View all &rarr;
            </button>
          )}
        </div>
        {r.categories.length === 0 ? (
          <SimpleSectionState>No categories tagged yet.</SimpleSectionState>
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
                {r.categories
                  .slice()
                  .sort((a, b) => b.trades - a.trades)
                  .slice(0, 4)
                  .map((c) => (
                    <tr
                      key={c.name}
                      className="border-b border-white/[0.04] last:border-0 transition-colors duration-150 hover:bg-white/[0.02]"
                    >
                      <td className="py-3 pr-4 font-medium">{c.name}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{c.trades}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {c.winRate == null ? "—" : `${c.winRate.toFixed(1)}%`}
                      </td>
                      <td
                        className={cn(
                          "py-3 pr-4 text-right font-semibold tabular-nums",
                          c.netR >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {c.netR >= 0 ? "+" : ""}
                        {c.netR.toFixed(2)}R
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {c.avgRR == null ? "—" : `${c.avgRR.toFixed(2)}R`}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-success">
                        {c.avgProfit > 0 ? "+" : ""}
                        {c.avgProfit.toFixed(2)}R
                      </td>
                      <td className="py-3 text-right tabular-nums text-destructive">
                        {c.avgLoss.toFixed(2)}R
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mistake analysis */}
      <div className="order-9 section-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Flame className="h-4 w-4 text-warning" /> Mistake analysis
          </h3>
          {r.mistakes.length > 4 && (
            <button
              onClick={() => setActiveDetailView("mistakes")}
              className="text-xs font-semibold text-primary transition hover:text-primary-glow"
            >
              View all &rarr;
            </button>
          )}
        </div>
        {r.mistakes.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No mistakes tagged yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {r.mistakes.slice(0, 4).map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2.5 ring-1 ring-white/[0.04]"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-warning/[0.12] px-2 py-0.5 text-[11px] font-semibold text-warning ring-1 ring-warning/[0.18]">
                    {m.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.count} occurrences</span>
                </div>
                <span
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    m.netR >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {m.netR >= 0 ? "+" : ""}
                  {m.netR}R
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emotion insights */}
      <div className="order-10 section-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Smile className="h-4 w-4 text-primary" /> Emotion Insights
          </h3>
          {(() => {
            const activeCount = r.emotions.items.filter((e) => e.count > 0).length;
            return (
              activeCount > 4 && (
                <button
                  onClick={() => setActiveDetailView("emotions")}
                  className="text-xs font-semibold text-primary transition hover:text-primary-glow"
                >
                  View all &rarr;
                </button>
              )
            );
          })()}
        </div>
        {r.emotions.total === 0 ? (
          <SimpleSectionState>No emotions tagged yet.</SimpleSectionState>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-3 pr-4 text-left">
                      Emotion
                    </th>
                    <th scope="col" className="py-3 pr-4 text-right">
                      Count
                    </th>
                    <th scope="col" className="py-3 pr-4 text-right">
                      Win rate
                    </th>
                    <th scope="col" className="py-3 pr-4 text-right">
                      Avg R
                    </th>
                    <th scope="col" className="py-3 text-right">
                      Net R
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {(() => {
                    const activeEmotions = r.emotions.items.filter((e) => e.count > 0);
                    return activeEmotions.slice(0, 4).map((e) => (
                      <tr key={e.key}>
                        <td className="py-3 pr-4">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="text-base leading-none">{e.emoji}</span>
                            <span className="truncate font-medium">{e.label}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                          {e.count}
                        </td>
                        <td
                          className={cn(
                            "py-3 pr-4 text-right font-semibold tabular-nums",
                            e.winRate == null
                              ? "text-muted-foreground"
                              : e.winRate >= 50
                                ? "text-success"
                                : "text-destructive",
                          )}
                        >
                          {e.winRate == null ? "—" : `${e.winRate.toFixed(0)}%`}
                        </td>
                        <td
                          className={cn(
                            "py-3 pr-4 text-right font-semibold tabular-nums",
                            e.avgR == null
                              ? "text-muted-foreground"
                              : e.avgR >= 0
                                ? "text-success"
                                : "text-destructive",
                          )}
                        >
                          {e.avgR == null ? "—" : `${e.avgR >= 0 ? "+" : ""}${e.avgR.toFixed(2)}R`}
                        </td>
                        <td
                          className={cn(
                            "py-3 text-right font-semibold tabular-nums",
                            e.netR >= 0 ? "text-success" : "text-destructive",
                          )}
                        >
                          {e.netR >= 0 ? "+" : ""}
                          {e.netR.toFixed(2)}R
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Day Performance — lifetime */}
      <div className="order-11 section-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" /> Day Performance
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {lifetimeWeekdays.map((d) => {
            const wr = d.winRate;
            const tone =
              wr == null ? "muted" : wr >= 60 ? "success" : wr >= 40 ? "primary" : "destructive";
            return (
              <div
                key={d.name}
                className="rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.04]"
              >
                <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                  {d.name.slice(0, 3).toUpperCase()}
                </div>
                <div
                  className={cn(
                    "mt-1 text-xl font-bold tabular-nums",
                    tone === "success" && "text-success",
                    tone === "destructive" && "text-destructive",
                    tone === "primary" && "text-primary",
                    tone === "muted" && "text-muted-foreground",
                  )}
                >
                  {wr == null ? "—" : `${wr.toFixed(0)}%`}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {d.count} trade{d.count === 1 ? "" : "s"}
                </div>
                <div
                  className={cn(
                    "mt-1 text-[11px] font-semibold tabular-nums",
                    d.netR == null
                      ? "text-muted-foreground"
                      : d.netR >= 0
                        ? "text-success"
                        : "text-destructive",
                  )}
                >
                  {d.netR == null ? "—" : `${signedR(d.netR)} net`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Planned vs Achieved R */}
      <div className="order-4 section-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" /> Planned vs Achieved R
        </h3>
        {r.plannedVsAchieved.sampleSize === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground/82">
            Not enough data — log trades with entry/SL/TP prices to enable this view.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                PLANNED AVG
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {r.plannedVsAchieved.plannedAvg?.toFixed(2)}R
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                ACHIEVED AVG
              </div>
              <div
                className={cn(
                  "mt-1 text-2xl font-bold tabular-nums",
                  (r.plannedVsAchieved.achievedAvg ?? 0) >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {(r.plannedVsAchieved.achievedAvg ?? 0) >= 0 ? "+" : ""}
                {r.plannedVsAchieved.achievedAvg?.toFixed(2)}R
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
              <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                CAPTURE %
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {r.plannedVsAchieved.capturePct == null
                  ? "—"
                  : `${r.plannedVsAchieved.capturePct}%`}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {r.plannedVsAchieved.sampleSize} trades
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Direction breakdown */}
      <div className="order-5 section-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" /> Direction performance
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {r.directions.map((d) => (
            <div
              key={d.name}
              className={cn(
                "rounded-xl bg-white/[0.025] p-4 ring-1",
                d.name === "Long" ? "ring-success/12" : "ring-info/12",
              )}
            >
              <div className="flex items-center justify-between">
                <div
                  className={cn(
                    "text-sm font-bold",
                    d.name === "Long" ? "text-success/90" : "text-info/90",
                  )}
                >
                  {d.name}
                </div>
                <div className="text-[11px] text-muted-foreground">{d.count} trades</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Win rate</div>
                  <div className="mt-0.5 font-semibold tabular-nums">
                    {d.winRate == null ? "—" : `${d.winRate.toFixed(1)}%`}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Net R</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-foreground">
                    {d.count === 0 ? "—" : signedR(d.netR)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Avg R</div>
                  <div className="mt-0.5 font-semibold tabular-nums">
                    {d.avgRR == null ? "—" : signedR(d.avgRR)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Killzone performance */}
      <div className="order-7 section-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" /> Killzone Performance
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-primary/12">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-primary/85">
              IN KILLZONE
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">Win rate</div>
                <div className="mt-0.5 font-semibold tabular-nums">
                  {r.killzoneDiscipline.inWinRate == null
                    ? "—"
                    : r.killzoneDiscipline.inWinRate.toFixed(1) + "%"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Net R</div>
                <div
                  className={cn(
                    "mt-0.5 font-semibold tabular-nums",
                    (r.killzoneDiscipline.inNetR ?? 0) >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {r.killzoneDiscipline.inNetR == null
                    ? "—"
                    : (r.killzoneDiscipline.inNetR >= 0 ? "+" : "") +
                      r.killzoneDiscipline.inNetR.toFixed(2) +
                      "R"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Avg R</div>
                <div className="mt-0.5 font-semibold tabular-nums">
                  {r.killzoneDiscipline.inAvgR == null
                    ? "—"
                    : (r.killzoneDiscipline.inAvgR >= 0 ? "+" : "") +
                      r.killzoneDiscipline.inAvgR.toFixed(2) +
                      "R"}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
              OUTSIDE KILLZONE
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">Win rate</div>
                <div className="mt-0.5 font-semibold tabular-nums">
                  {r.killzoneDiscipline.outWinRate == null
                    ? "—"
                    : r.killzoneDiscipline.outWinRate.toFixed(1) + "%"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Net R</div>
                <div
                  className={cn(
                    "mt-0.5 font-semibold tabular-nums",
                    (r.killzoneDiscipline.outNetR ?? 0) >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {r.killzoneDiscipline.outNetR == null
                    ? "—"
                    : (r.killzoneDiscipline.outNetR >= 0 ? "+" : "") +
                      r.killzoneDiscipline.outNetR.toFixed(2) +
                      "R"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Avg R</div>
                <div className="mt-0.5 font-semibold tabular-nums">
                  {r.killzoneDiscipline.outAvgR == null
                    ? "—"
                    : (r.killzoneDiscipline.outAvgR >= 0 ? "+" : "") +
                      r.killzoneDiscipline.outAvgR.toFixed(2) +
                      "R"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grade distribution */}
      <div className="order-12 section-card rounded-2xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="h-4 w-4 text-warning" /> Grade distribution
        </h3>
        {r.grades.every((g) => g.count === 0) ? (
          <SimpleSectionState>No grades assigned yet.</SimpleSectionState>
        ) : (
          <div className="mt-4 space-y-2">
            {r.grades.map((g) => (
              <div
                key={g.name}
                className="flex items-center justify-between rounded-xl bg-white/[0.025] px-4 py-3 ring-1 ring-white/[0.04]"
              >
                <div className="flex items-center gap-4">
                  <span className="w-8 text-base font-extrabold text-warning">{g.name}</span>
                  <span className="text-xs md:text-sm text-muted-foreground">
                    {g.count} {g.count === 1 ? "trade" : "trades"}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-sm md:text-base font-bold tabular-nums",
                    g.count > 0
                      ? g.avgR >= 0
                        ? "text-success"
                        : "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {g.count > 0 ? `${g.avgR >= 0 ? "+" : ""}${g.avgR.toFixed(2)}R avg` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instrument breakdown */}
      <div className="order-13 section-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <DollarSign className="h-4 w-4 text-primary" /> Instrument performance
          </h3>
          {r.instruments.length > 4 && (
            <button
              onClick={() => setActiveDetailView("instruments")}
              className="text-xs font-semibold text-primary transition hover:text-primary-glow"
            >
              View all &rarr;
            </button>
          )}
        </div>
        {r.instruments.length === 0 ? (
          <SimpleSectionState>No instruments logged yet.</SimpleSectionState>
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
                {r.instruments
                  .slice()
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 4)
                  .map((i) => (
                    <tr
                      key={i.name}
                      className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                    >
                      <td className="py-3 pr-4 font-medium">{i.name}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{i.count}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {i.winRate == null ? "—" : `${i.winRate.toFixed(1)}%`}
                      </td>
                      <td
                        className={cn(
                          "py-3 pr-4 text-right font-semibold tabular-nums",
                          i.netR >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {i.netR >= 0 ? "+" : ""}
                        {i.netR}R
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {i.avgRR == null ? "—" : `${i.avgRR.toFixed(2)}R`}
                      </td>
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

function PeriodPickerModal({
  title,
  items,
  selected,
  labelFor,
  onSelect,
  onClose,
}: {
  title: string;
  items: string[];
  selected: string | null;
  labelFor: (key: string) => string;
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(5);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((key) => `${labelFor(key)} ${key}`.toLowerCase().includes(q));
  }, [items, labelFor, query]);
  const visible = filtered.slice(0, visibleCount);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(event) => event.stopPropagation()}
        className="glow-card w-full max-w-md rounded-2xl p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(5);
            }}
            placeholder="Search range"
            className="w-full rounded-xl bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 ring-1 ring-white/[0.06] transition focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
          {visible.map((key) => {
            const isSelected = selected === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left text-sm ring-1 transition",
                  isSelected
                    ? "bg-primary/12 text-foreground ring-primary/35"
                    : "bg-white/[0.025] text-muted-foreground ring-white/[0.05] hover:bg-white/[0.045] hover:text-foreground",
                )}
              >
                <span>{labelFor(key)}</span>
                {isSelected && (
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                    Selected
                  </span>
                )}
              </button>
            );
          })}
          {visible.length === 0 && (
            <div className="rounded-xl bg-white/[0.025] px-3.5 py-6 text-center text-sm text-muted-foreground ring-1 ring-white/[0.05]">
              {items.length === 0 ? "No trade history yet." : "No ranges match your search."}
            </div>
          )}
        </div>
        {visibleCount < filtered.length && (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + 5)}
            className="mt-4 w-full rounded-xl bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] transition hover:text-foreground"
          >
            Show more
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}

type MonthSelection = "current" | "previous" | "custom";

function labelMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function generateWeekKeysInRange(oldestTradeDateStr: string | null): string[] {
  if (!oldestTradeDateStr) return [];

  const now = new Date();
  const endWeek = startOfWeekISO(now);
  const parsedStart = new Date(oldestTradeDateStr + "T00:00:00");
  let startWeek = endWeek;
  if (!isNaN(parsedStart.getTime())) {
    startWeek = startOfWeekISO(parsedStart);
  }

  if (startWeek > endWeek) {
    startWeek = endWeek;
  }

  const keys: string[] = [];
  let current = new Date(endWeek);
  const maxIterations = 2000;
  let iterations = 0;
  while (current >= startWeek && iterations < maxIterations) {
    keys.push(weekKey(current));
    current = addDays(current, -7);
    iterations++;
  }
  return keys;
}

function generateMonthKeysInRange(oldestTradeDateStr: string | null): string[] {
  if (!oldestTradeDateStr) return [];

  const now = new Date();
  const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const parsedStart = new Date(oldestTradeDateStr + "T00:00:00");
  let startMonth = endMonth;
  if (!isNaN(parsedStart.getTime())) {
    startMonth = new Date(parsedStart.getFullYear(), parsedStart.getMonth(), 1);
  }

  if (startMonth > endMonth) {
    startMonth = endMonth;
  }

  const keys: string[] = [];
  let current = new Date(endMonth);
  const maxIterations = 500;
  let iterations = 0;
  while (current >= startMonth && iterations < maxIterations) {
    keys.push(ymKey(current));
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
    iterations++;
  }
  return keys;
}

function PeriodDropdown({
  value,
  label,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  label: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative z-[80]">
      {open && (
        <button
          type="button"
          aria-label="Close period menu"
          className="fixed inset-0 z-[70] cursor-default"
          onClick={() => setOpen(false)}
        />
      )}
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative z-[90] inline-flex min-w-[9.5rem] items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/20 transition hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-primary/35"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+0.45rem)] z-[90] w-44 overflow-hidden rounded-xl border border-white/[0.08] bg-[oklch(0.105_0.018_270)] p-1 shadow-2xl shadow-black/40">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition",
                option.value === value
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsPage() {
  const [tab, setTab] = useState<ReportScope>("overall");
  const [weekSel, setWeekSel] = useState<WeeklySelection>("current");
  const [customWeekKey, setCustomWeekKey] = useState(weekKey(new Date()));
  const [monthSel, setMonthSel] = useState<MonthSelection>("current");
  const [customMonthKey, setCustomMonthKey] = useState(ymKey(new Date()));
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const fn = useServerFn(listTrades);
  const { data } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => fn() });
  const trades = useMemo(() => (data ?? []) as DbTrade[], [data]);
  const realTrades = useMemo(() => trades.filter((trade) => !isPaperTrade(trade)), [trades]);

  const oldestTradeDate = useMemo(() => {
    if (realTrades.length === 0) return null;
    return realTrades.reduce((oldest, t) => {
      if (!t.trade_date) return oldest;
      return t.trade_date < oldest ? t.trade_date : oldest;
    }, realTrades[0].trade_date || localDateKey());
  }, [realTrades]);

  const weekKeys = useMemo(() => {
    return generateWeekKeysInRange(oldestTradeDate);
  }, [oldestTradeDate]);

  const monthPickerKeys = useMemo(() => {
    return generateMonthKeysInRange(oldestTradeDate);
  }, [oldestTradeDate]);

  const labelCustomWeek = useCallback((key: string) => {
    return labelWeekRange(key);
  }, []);

  const labelCustomMonth = useCallback((key: string) => {
    return labelMonthKey(key);
  }, []);

  const currentWeekKey = weekKey(new Date());
  const prevWeekKey = weekKey(addDays(new Date(), -7));
  const currentMonthKey = ymKey(new Date());
  const prevMonthKey = ymKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const hasPreviousWeek = weekKeys.includes(prevWeekKey);
  const hasPreviousMonth = monthPickerKeys.includes(prevMonthKey);

  useEffect(() => {
    if (weekSel === "previous" && !hasPreviousWeek) setWeekSel("current");
  }, [hasPreviousWeek, weekSel]);

  useEffect(() => {
    if (monthSel === "previous" && !hasPreviousMonth) setMonthSel("current");
  }, [hasPreviousMonth, monthSel]);

  const activeKey =
    tab === "weekly"
      ? weekSel === "current"
        ? currentWeekKey
        : weekSel === "previous"
          ? prevWeekKey
          : customWeekKey
      : tab === "monthly"
        ? monthSel === "current"
          ? currentMonthKey
          : monthSel === "previous"
            ? prevMonthKey
            : customMonthKey
        : null;

  const reportTrades = useMemo(
    () => filterByScope(realTrades, tab, activeKey),
    [realTrades, tab, activeKey],
  );
  const report = useMemo(() => buildReport(reportTrades, tab), [reportTrades, tab]);

  const lifetimeWeekdays = useMemo<LifetimeWeekday[]>(() => {
    const ana = realTrades.map(toAnalytics);
    const stats = weekdayStats(ana);
    const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return ALL_DAYS.map((d) => {
      const s = stats.find((x) => x.key === d);
      const subset = realTrades.filter(
        (trade) =>
          new Date(trade.trade_date + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "long",
          }) === d,
      );
      const rrList = subset
        .map((trade) => recordedR(trade.achieved_rr))
        .filter((value): value is number => value != null);
      const netR = rrList.length ? rrList.reduce((sum, value) => sum + value, 0) : null;
      return {
        name: d,
        count: s?.count ?? 0,
        winRate: s?.winRate ?? null,
        wins: s?.wins ?? 0,
        losses: s?.losses ?? 0,
        netR: netR == null ? null : Number(netR.toFixed(2)),
      };
    });
  }, [realTrades]);

  const handleWeekSelection = (value: WeeklySelection) => {
    setWeekSel(value);
    if (value === "custom") setWeekPickerOpen(true);
  };

  const handleMonthSelection = (value: MonthSelection) => {
    setMonthSel(value);
    if (value === "custom") setMonthPickerOpen(true);
  };

  return (
    <PageShell>
      <PageHeader
        icon={BarChart3}
        eyebrow="Reports"
        title="Analytics"
        description="Performance organized into overall, weekly, monthly, and longer-horizon reports."
      />

      <div className="glow-card relative z-50 mt-6 flex flex-wrap items-center gap-3 overflow-visible rounded-2xl p-3">
        <div className="inline-flex flex-wrap rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]">
          <button
            onClick={() => setTab("overall")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200",
              tab === "overall"
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <BarChart3 className="h-4 w-4" /> Overall
          </button>
          <button
            onClick={() => setTab("weekly")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200",
              tab === "weekly"
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarDays className="h-4 w-4" /> Weekly
          </button>
          <button
            onClick={() => setTab("monthly")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200",
              tab === "monthly"
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CalendarRange className="h-4 w-4" /> Monthly
          </button>
        </div>

        {tab === "weekly" && (
          <div className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] px-2 py-1.5 ring-1 ring-white/[0.06]">
            <PeriodDropdown
              value={weekSel}
              label={
                weekSel === "custom"
                  ? "Custom week"
                  : weekSel === "previous"
                    ? "Previous week"
                    : "This week"
              }
              options={[
                { value: "current", label: "This week" },
                { value: "custom", label: "Custom week" },
                ...(hasPreviousWeek ? [{ value: "previous", label: "Previous week" }] : []),
              ]}
              onChange={(value) => handleWeekSelection(value as WeeklySelection)}
              ariaLabel="Weekly report period"
            />
            {weekSel === "custom" && (
              <button
                type="button"
                onClick={() => setWeekPickerOpen(true)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground"
              >
                {labelWeekRange(customWeekKey)}
              </button>
            )}
          </div>
        )}
        {tab === "monthly" && (
          <div className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] px-2 py-1.5 ring-1 ring-white/[0.06]">
            <PeriodDropdown
              value={monthSel}
              label={
                monthSel === "custom"
                  ? "Custom month"
                  : monthSel === "previous"
                    ? "Previous month"
                    : "This month"
              }
              options={[
                { value: "current", label: "This month" },
                { value: "custom", label: "Custom month" },
                ...(hasPreviousMonth ? [{ value: "previous", label: "Previous month" }] : []),
              ]}
              onChange={(value) => handleMonthSelection(value as MonthSelection)}
              ariaLabel="Monthly report period"
            />
            {monthSel === "custom" && (
              <button
                type="button"
                onClick={() => setMonthPickerOpen(true)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground"
              >
                {cleanMonthLabel(customMonthKey)}
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <ReportView
          key={`${tab}-${activeKey ?? "all"}`}
          r={report}
          scope={tab}
          lifetimeWeekdays={lifetimeWeekdays}
        />
      </AnimatePresence>
      <AnimatePresence>
        {weekPickerOpen && (
          <PeriodPickerModal
            title="Select week"
            items={weekKeys}
            selected={customWeekKey}
            labelFor={labelCustomWeek}
            onClose={() => setWeekPickerOpen(false)}
            onSelect={(key) => {
              setCustomWeekKey(key);
              setWeekSel("custom");
              setWeekPickerOpen(false);
            }}
          />
        )}
        {monthPickerOpen && (
          <PeriodPickerModal
            title="Select month"
            items={monthPickerKeys}
            selected={customMonthKey}
            labelFor={labelCustomMonth}
            onClose={() => setMonthPickerOpen(false)}
            onSelect={(key) => {
              setCustomMonthKey(key);
              setMonthSel("custom");
              setMonthPickerOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </PageShell>
  );
}
