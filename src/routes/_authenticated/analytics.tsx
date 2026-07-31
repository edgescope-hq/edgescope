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
  AlertTriangle,
  ArrowLeftRight,
  Award,
  BadgePercent,
  BarChart3,
  Brain,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  CalendarFold,
  CalendarRange,
  CandlestickChart,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Crosshair,
  Lightbulb,
  ListChecks,
  Sigma,
  Scale,
  SlidersHorizontal,
  ShieldAlert,
  Tags,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EMOTIONS } from "@/lib/emotions";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";
import { useMutation, useQueryClient, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrades } from "@/lib/trades.functions";
import { listTradingAccounts } from "@/lib/trading-accounts.functions";
import { AccountFilterSelect } from "@/components/account-filter-select";
import { useActiveAccount } from "@/components/active-account-provider";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { cn } from "@/lib/utils";
import { SearchInput } from "@/components/ui/search-input";
import { sessionLabel, SESSIONS, KILLZONES, killzoneLabel } from "@/lib/trade-constants";
import {
  isPaperTrade,
  isResultComplete,
  localDateKey,
  recordedR,
  realizedR,
  rrNum,
  streaks,
  toAnalytics,
  type DbTrade,
} from "@/lib/trade-mappers";
import {
  categoryStats,
  equityCurve,
  sessionStats,
  weekdayFromTradeDate,
  weekdayStats,
  killzoneStats,
} from "@/lib/analytics";
import { getReviewStatus } from "@/lib/review-status";
import { parsePlannedRR } from "@/lib/planned-rr";
import {
  getTradingPreferences,
  upsertTradingPreferences,
} from "@/lib/trading-preferences.functions";
import {
  JOURNAL_FIELD_META,
  journalTrackingFromPreferences,
  OPTIONAL_ANALYTICS_SECTIONS,
  stableTimeframeOrder,
  type OptionalAnalyticsSection,
} from "@/lib/journal-tracking";
import {
  ANALYTICS_SECTION_DEFINITIONS,
  ANALYTICS_REPORT_GROUPS,
  DEFAULT_ANALYTICS_PREFERENCES,
  analyticsKpiIds,
  analyticsPreferencesFromStored,
  analyticsSectionAvailability,
  moveAnalyticsSection,
  setAnalyticsSectionVisible,
  visibleAnalyticsSections,
  type AnalyticsPreferences,
  type AnalyticsReportGroup,
  type AnalyticsSectionId,
} from "@/lib/analytics-sections";
import { optionalFieldAnalytics, sampleLabel } from "@/lib/optional-analytics";

const MOTION_EASE = [0.16, 1, 0.3, 1] as const;
const CALM_TRANSITION = { duration: 0.22, ease: MOTION_EASE };
const MIN_BREAKDOWN_SAMPLE = 3;
const MIN_SESSION_HIGHLIGHT_SAMPLE = 5;
const MIN_KILLZONE_HIGHLIGHT_SAMPLE = 3;
const MIN_EMOTION_HIGHLIGHT_SAMPLE = 3;

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
  rCount: number;
  netR: number | null;
  avgRR: number | null;
  avgProfit: number | null;
  avgLoss: number | null;
};

type ReportScope = "overall" | "weekly" | "monthly" | "quarterly" | "yearly";

type Report = {
  totalTrades: number;
  resultCompleteCount: number;
  winRate: number | null;
  avgRR: number | null;
  totalR: number | null;
  coverage: {
    results: number;
    sessions: number;
    categories: number;
    grades: number;
    mistakes: number;
    emotions: number;
    instruments: number;
    directions: number;
    killzone: number;
  };
  bestSession: string;
  worstSession: string;
  sessions: {
    name: string;
    wins: number;
    losses: number;
    breakeven: number;
    count: number;
    rCount: number;
    winRate: number | null;
    netR: number | null;
    avgRR: number | null;
  }[];
  killzones: {
    name: string;
    wins: number;
    losses: number;
    count: number;
    rCount: number;
    winRate: number | null;
    avgRR: number | null;
  }[];
  bestKillzone: string;
  worstKillzone: string;
  bestCategory: string;
  bestTrade: { sym: string; r: number } | null;
  worstTrade: { sym: string; r: number } | null;
  longest: { wins: number; losses: number };
  profitFactor: number | null;
  maxDrawdown: number | null;
  reviewedTrades: number;
  equity: { d: string; v: number }[];
  equityInterval?: number;
  grades: { name: string; count: number; rCount: number; avgR: number | null }[];
  categories: CategoryRow[];
  weekdays: {
    name: string;
    count: number;
    winRate: number | null;
    wins: number;
    losses: number;
    breakeven: number;
    netR: number | null;
  }[];
  bestDay: string | null;
  worstDay: string | null;
  // New breakdowns (Phase 3 cleanup)
  instruments: {
    name: string;
    count: number;
    rCount: number;
    winRate: number | null;
    netR: number | null;
    avgRR: number | null;
  }[];
  directions: {
    name: "Long" | "Short";
    count: number;
    rCount: number;
    winRate: number | null;
    netR: number | null;
    avgRR: number | null;
  }[];
  plannedVsAchieved: {
    plannedAvg: number | null;
    achievedAvg: number | null;
    sampleSize: number;
    avgGap: number | null;
  };
  mistakes: { name: string; count: number; rCount: number; netR: number | null }[];
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
    inRCount: number;
    outRCount: number;
  };
  emotions: {
    items: {
      key: string;
      emoji: string;
      label: string;
      count: number;
      rCount: number;
      winRate: number | null;
      avgR: number | null;
      netR: number | null;
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

function listQuarterKeys(all: DbTrade[]): string[] {
  const set = new Set<string>();
  for (const t of all) set.add(quarterKey(new Date(t.trade_date + "T00:00:00")));
  set.add(quarterKey(new Date()));
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

function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

function buildReport(trades: DbTrade[], scope: ReportScope): Report {
  const ana = trades.map(toAnalytics);
  const resultCompleteTrades = trades.filter(isResultComplete);
  const resultCompleteAna = resultCompleteTrades.map(toAnalytics);
  const total = trades.length;
  const resultCompleteCount = resultCompleteTrades.length;
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const breakeven = trades.filter((t) => t.result === "breakeven").length;
  const decided = wins + losses + breakeven;
  const winRate = decided ? (wins / decided) * 100 : null;
  const coverage = {
    results: decided,
    sessions: trades.filter((t) => Boolean(t.session?.trim())).length,
    categories: trades.filter((t) => (t.categories ?? []).some((value) => value.trim())).length,
    grades: trades.filter((t) => Boolean(t.grade?.trim())).length,
    mistakes: trades.filter((t) => (t.mistake_tags ?? []).some((value) => value.trim())).length,
    emotions: trades.filter((t) => (t.emotion_tags ?? []).some((value) => value.trim())).length,
    instruments: trades.filter((t) => Boolean(t.instrument?.trim())).length,
    directions: trades.filter((t) => t.direction === "long" || t.direction === "short").length,
    killzone: trades.filter((t) => typeof t.in_killzone === "boolean").length,
  };

  const rrs = resultCompleteAna
    .map((t) => recordedR(t.achieved_rr))
    .filter((n): n is number => n !== null);
  const totalR = rrs.reduce((a, b) => a + b, 0);
  const avgRR = rrs.length ? totalR / rrs.length : null;

  const winsR = resultCompleteTrades
    .filter((t) => t.result === "win")
    .map((t) => realizedR(t))
    .filter((n): n is number => n !== null);
  const lossR = resultCompleteTrades
    .filter((t) => t.result === "loss")
    .map((t) => realizedR(t))
    .filter((n): n is number => n !== null);
  const sumWin = winsR.reduce((a, b) => a + b, 0);
  const sumLoss = Math.abs(lossR.reduce((a, b) => a + b, 0));
  const profitFactor = sumWin > 0 && sumLoss > 0 ? sumWin / sumLoss : null;

  const eq = equityCurve(resultCompleteAna);
  let peak = 0,
    maxDD = 0;
  for (const p of eq) {
    peak = Math.max(peak, p.cumR);
    maxDD = Math.max(maxDD, peak - p.cumR);
  }

  const sStats = sessionStats(ana);
  const defaultSessionOrder = SESSIONS.map((s) => ({ key: s.v, label: s.l }));
  const customSessionOrder = sStats
    .filter((stat) => !defaultSessionOrder.some((session) => session.key === stat.key))
    .map((stat) => ({ key: stat.key, label: sessionLabel(stat.key) }));
  const sessionOrder = [...defaultSessionOrder, ...customSessionOrder];
  const sessions = sessionOrder.map((o) => {
    const s = sStats.find((x) => x.key === o.key);
    const subset = ana.filter((t) => t.session === o.key);
    const rrList = subset
      .map((t) => recordedR(t.achieved_rr))
      .filter((value): value is number => value !== null);
    const netR = rrList.reduce((sum, value) => sum + value, 0);
    return {
      name: o.label,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      breakeven: s?.breakeven ?? 0,
      count: s?.count ?? 0,
      rCount: rrList.length,
      winRate: s?.winRate ?? null,
      netR: rrList.length ? roundMetric(netR) : null,
      avgRR: rrList.length ? roundMetric(netR / rrList.length) : null,
    };
  });
  const eligibleSessions = sStats.filter(
    (s) => s.winRate != null && s.count >= MIN_SESSION_HIGHLIGHT_SAMPLE,
  );
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
    const subset = ana.filter((t) => t.killzone === o.v);
    const rCount = subset.filter((t) => recordedR(t.achieved_rr) !== null).length;
    return {
      name: o.l,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      count: s?.count ?? 0,
      rCount,
      winRate: s?.winRate ?? null,
      avgRR: s?.avgRR ?? null,
    };
  });
  const eligibleKz = kzStats.filter(
    (s) => s.winRate != null && s.count >= MIN_KILLZONE_HIGHLIGHT_SAMPLE,
  );
  const bestKzStat = [...eligibleKz].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0];
  const worstKzStat = [...eligibleKz].sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0))[0];

  const cStats = categoryStats(ana);
  const categories: CategoryRow[] = cStats.map((s) => {
    const subset = ana.filter((t) => (t.categories ?? []).includes(s.key));
    const rList = subset
      .map((t) => recordedR(t.achieved_rr))
      .filter((value): value is number => value !== null);
    const wList = subset
      .filter((t) => t.result === "win")
      .map((t) => recordedR(t.achieved_rr))
      .filter((value): value is number => value !== null);
    const lList = subset
      .filter((t) => t.result === "loss")
      .map((t) => recordedR(t.achieved_rr))
      .filter((value): value is number => value !== null);
    const net = rList.reduce((a, b) => a + b, 0);
    return {
      name: s.key,
      trades: s.count,
      winRate: s.winRate,
      rCount: rList.length,
      netR: rList.length ? roundMetric(net) : null,
      avgRR: rList.length ? roundMetric(net / rList.length) : null,
      avgProfit: wList.length ? roundMetric(wList.reduce((a, b) => a + b, 0) / wList.length) : null,
      avgLoss: lList.length ? roundMetric(lList.reduce((a, b) => a + b, 0) / lList.length) : null,
    };
  });
  const bestCategory = categories[0]?.name ?? "—";

  let best: DbTrade | null = null,
    worst: DbTrade | null = null;
  for (const t of resultCompleteTrades) {
    const value = realizedR(t);
    if (value == null) continue;
    if (!best || value > (realizedR(best) ?? Number.NEGATIVE_INFINITY)) best = t;
    if (!worst || value < (realizedR(worst) ?? Number.POSITIVE_INFINITY)) worst = t;
  }

  const stk = streaks(trades);

  const gradeOrder = ["A+", "A", "B+", "B", "C", "D"];
  const grades = gradeOrder.map((g) => {
    const sub = ana.filter((t) => t.grade === g);
    const r = sub.map((t) => recordedR(t.achieved_rr)).filter((n): n is number => n !== null);
    return {
      name: g,
      count: sub.length,
      rCount: r.length,
      avgR: r.length ? roundMetric(r.reduce((a, b) => a + b, 0) / r.length) : null,
    };
  });

  // ===== New aggregations =====
  // Instrument breakdown
  const byInstrument = new Map<string, DbTrade[]>();
  for (const t of trades) {
    const k = (t.instrument ?? "").trim();
    if (!k) continue;
    if (!byInstrument.has(k)) byInstrument.set(k, []);
    byInstrument.get(k)!.push(t);
  }
  const instruments = Array.from(byInstrument.entries())
    .map(([name, subset]) => {
      const w = subset.filter((t) => t.result === "win").length;
      const l = subset.filter((t) => t.result === "loss").length;
      const be = subset.filter((t) => t.result === "breakeven").length;
      const decided = w + l + be;
      const rrList = subset.map((t) => realizedR(t)).filter((n): n is number => n !== null);
      const net = rrList.reduce((a, b) => a + b, 0);
      return {
        name,
        count: subset.length,
        rCount: rrList.length,
        winRate: decided ? (w / decided) * 100 : null,
        netR: rrList.length ? roundMetric(net) : null,
        avgRR: rrList.length ? roundMetric(net / rrList.length) : null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Direction breakdown
  const directions = (["long", "short"] as const).map((dir) => {
    const subset = trades.filter((t) => t.direction === dir);
    const w = subset.filter((t) => t.result === "win").length;
    const ll = subset.filter((t) => t.result === "loss").length;
    const be = subset.filter((t) => t.result === "breakeven").length;
    const decided = w + ll + be;
    const rrList = subset.map((t) => realizedR(t)).filter((n): n is number => n !== null);
    const net = rrList.reduce((a, b) => a + b, 0);
    return {
      name: (dir === "long" ? "Long" : "Short") as "Long" | "Short",
      count: subset.length,
      rCount: rrList.length,
      winRate: decided ? (w / decided) * 100 : null,
      netR: rrList.length ? roundMetric(net) : null,
      avgRR: rrList.length ? roundMetric(net / rrList.length) : null,
    };
  });

  // Planned vs Achieved — paired comparison on the same eligible trades.
  const pairBoth = resultCompleteTrades
    .filter((t) => t.result === "win" || t.result === "loss" || t.result === "breakeven")
    .map((t) => ({
      planned: parsePlannedRR(t.planned_rr),
      achieved: realizedR(t),
    }))
    .filter(
      (p): p is { planned: number; achieved: number } =>
        p.planned != null && p.achieved != null && Number.isFinite(p.achieved),
    );
  const plannedVsAchieved = (() => {
    if (pairBoth.length === 0)
      return {
        plannedAvg: null,
        achievedAvg: null,
        sampleSize: 0,
        avgGap: null,
      };
    const pAvg = pairBoth.reduce((a, b) => a + b.planned, 0) / pairBoth.length;
    const aAvg = pairBoth.reduce((a, b) => a + b.achieved, 0) / pairBoth.length;
    const avgGap = aAvg - pAvg;
    return {
      plannedAvg: roundMetric(pAvg),
      achievedAvg: roundMetric(aAvg),
      sampleSize: pairBoth.length,
      avgGap: roundMetric(avgGap),
    };
  })();

  // Mistake-tag breakdown
  const mistakeMap = new Map<string, { count: number; rCount: number; netR: number }>();
  for (const t of trades) {
    const tags = (t.mistake_tags ?? []) as string[];
    const r = realizedR(t);
    for (const tag of tags) {
      if (!tag) continue;
      const cur = mistakeMap.get(tag) ?? { count: 0, rCount: 0, netR: 0 };
      cur.count += 1;
      if (r != null) {
        cur.rCount += 1;
        cur.netR += r;
      }
      mistakeMap.set(tag, cur);
    }
  }
  const mistakes = Array.from(mistakeMap.entries())
    .map(([name, v]) => ({
      name,
      count: v.count,
      rCount: v.rCount,
      netR: v.rCount ? roundMetric(v.netR) : null,
    }))
    .sort((a, b) => (a.netR ?? Number.POSITIVE_INFINITY) - (b.netR ?? Number.POSITIVE_INFINITY));

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
  const TRADING_DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const weekdays = TRADING_DAYS.map((d) => {
    const s = wdStats.find((x) => x.key === d);
    const subset = trades.filter((t) => weekdayFromTradeDate(t.trade_date) === d);
    const rrList = subset
      .map((t) => realizedR(t))
      .filter((value): value is number => value !== null);
    const netR = rrList.length ? rrList.reduce((sum, value) => sum + value, 0) : null;
    return {
      name: d,
      count: s?.count ?? 0,
      winRate: s?.winRate ?? null,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      breakeven: s?.breakeven ?? 0,
      netR: netR == null ? null : Number(netR.toFixed(2)),
    };
  });
  const eligibleDays = weekdays.filter((d) => d.count >= MIN_BREAKDOWN_SAMPLE && d.winRate != null);
  const sortedByWR = [...eligibleDays].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  const bestDay = sortedByWR[0]?.name ?? null;
  const worstDay = sortedByWR.length > 1 ? sortedByWR[sortedByWR.length - 1].name : null;

  // Killzone discipline (boolean in_killzone)
  const kzIn = trades.filter((t) => (t as { in_killzone?: boolean | null }).in_killzone === true);
  const kzOut = trades.filter((t) => (t as { in_killzone?: boolean | null }).in_killzone === false);
  const wrOf = (arr: typeof trades) => {
    const w = arr.filter((t) => t.result === "win").length;
    const l = arr.filter((t) => t.result === "loss").length;
    const be = arr.filter((t) => t.result === "breakeven").length;
    const d = w + l + be;
    return d ? (w / d) * 100 : null;
  };
  const avgROf = (arr: typeof trades) => {
    const vals = arr.map((t) => realizedR(t)).filter((r): r is number => r != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const netROf = (arr: typeof trades) => {
    const vals = arr.map((t) => realizedR(t)).filter((r): r is number => r != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const rCountOf = (arr: typeof trades) => arr.filter((trade) => realizedR(trade) != null).length;
  const killzoneTotal = kzIn.length + kzOut.length;
  const killzoneDiscipline = {
    total: killzoneTotal,
    inCount: kzIn.length,
    outCount: kzOut.length,
    pct: killzoneTotal ? (kzIn.length / killzoneTotal) * 100 : null,
    inWinRate: wrOf(kzIn),
    outWinRate: wrOf(kzOut),
    inAvgR: avgROf(kzIn),
    outAvgR: avgROf(kzOut),
    inNetR: netROf(kzIn),
    outNetR: netROf(kzOut),
    inRCount: rCountOf(kzIn),
    outRCount: rCountOf(kzOut),
  };

  // Emotion insights — derived from trades.emotion_tags (multi)
  const emoMap = new Map<
    string,
    {
      count: number;
      wins: number;
      losses: number;
      breakeven: number;
      rSum: number;
      rCount: number;
      netR: number;
    }
  >();
  for (const t of trades) {
    const tags = (t.emotion_tags ?? []) as string[];
    const r = realizedR(t);
    for (const tag of tags) {
      if (!tag) continue;
      const cur = emoMap.get(tag) ?? {
        count: 0,
        wins: 0,
        losses: 0,
        breakeven: 0,
        rSum: 0,
        rCount: 0,
        netR: 0,
      };
      cur.count += 1;
      if (t.result === "win") cur.wins += 1;
      if (t.result === "loss") cur.losses += 1;
      if (t.result === "breakeven") cur.breakeven += 1;
      if (r != null) {
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
      const decided = v.wins + v.losses + v.breakeven;
      return {
        key,
        emoji: meta?.emoji ?? "•",
        label: meta?.label ?? key,
        count: v.count,
        rCount: v.rCount,
        winRate: decided ? (v.wins / decided) * 100 : null,
        avgR: v.rCount ? Number((v.rSum / v.rCount).toFixed(2)) : null,
        netR: v.rCount ? roundMetric(v.netR) : null,
      };
    })
    .sort((a, b) => b.count - a.count);
  const mostUsedEmo = emotionItems[0] ?? null;
  const eligibleEmo = emotionItems.filter(
    (e) => e.winRate != null && e.count >= MIN_EMOTION_HIGHLIGHT_SAMPLE,
  ) as {
    key: string;
    emoji: string;
    label: string;
    count: number;
    rCount: number;
    winRate: number;
    avgR: number | null;
    netR: number | null;
  }[];
  const sortedEmo = [...eligibleEmo].sort((a, b) => b.winRate - a.winRate);
  const bestEmo = sortedEmo[0] ?? null;
  const worstEmo = sortedEmo.length > 1 ? sortedEmo[sortedEmo.length - 1] : null;

  return {
    totalTrades: total,
    resultCompleteCount,
    winRate,
    avgRR,
    totalR: rrs.length ? roundMetric(totalR) : null,
    coverage,
    bestSession: bestSessionStat ? sessionLabel(bestSessionStat.key) : "Not enough data",
    worstSession: worstSessionStat ? sessionLabel(worstSessionStat.key) : "Not enough data",
    sessions,
    killzones,
    bestKillzone: bestKzStat ? killzoneLabel(bestKzStat.key) : "Not enough data",
    worstKillzone: worstKzStat ? killzoneLabel(worstKzStat.key) : "Not enough data",
    bestCategory,
    bestTrade:
      best && (realizedR(best) ?? 0) > 0
        ? { sym: best.instrument ?? "—", r: realizedR(best) ?? 0 }
        : null,
    worstTrade:
      worst && (realizedR(worst) ?? 0) < 0
        ? { sym: worst.instrument ?? "—", r: realizedR(worst) ?? 0 }
        : null,
    longest: { wins: stk.longestWin, losses: stk.longestLoss },
    profitFactor: profitFactor == null ? null : Number(profitFactor.toFixed(2)),
    maxDrawdown: rrs.length ? roundMetric(maxDD) : null,
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

function ChartLowDataState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex h-full min-h-[136px] items-center justify-center overflow-hidden rounded-xl bg-white/[0.02] px-5 text-center ring-1 ring-white/[0.04]">
      <div aria-hidden className="absolute inset-x-5 bottom-4 top-4 opacity-35">
        <span className="absolute inset-y-0 left-0 border-l border-white/[0.08]" />
        <span className="absolute inset-x-0 bottom-0 border-b border-white/[0.08]" />
        <span className="absolute inset-x-0 top-1/3 border-t border-dashed border-white/[0.06]" />
        <span className="absolute inset-x-0 top-2/3 border-t border-dashed border-white/[0.06]" />
      </div>
      <div className="relative max-w-[24rem]">
        <div className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SimpleSectionState({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 flex min-h-[80px] items-center justify-center rounded-xl bg-white/[0.02] px-4 py-3 text-center text-sm text-muted-foreground ring-1 ring-white/[0.04]">
      {children}
    </div>
  );
}

function SmallSampleNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-xs leading-5 text-muted-foreground">{children}</p>;
}

function SampleStatus({ count, noun = "trades" }: { count: number; noun?: string }) {
  if (count < 3) {
    return (
      <div className="mt-3 rounded-lg bg-white/[0.025] px-3 py-2 text-xs text-muted-foreground ring-1 ring-white/[0.04]">
        <span className="font-semibold text-foreground/85">Early data</span>
        <span aria-hidden> · </span>
        {count} {count === 1 ? noun.replace(/s$/, "") : noun} recorded
        <span aria-hidden> · </span>
        Too early for a meaningful comparison
      </div>
    );
  }
  if (count < 10) {
    return (
      <SmallSampleNote>
        <span className="font-semibold text-foreground/80">Small sample</span> · Based on {count}{" "}
        {noun}.
      </SmallSampleNote>
    );
  }
  return null;
}

function CoverageNote({ label, count, total }: { label: string; count: number; total: number }) {
  if (count >= total) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {label} for {count} of {total} trades.
    </p>
  );
}

function countAwareGridClass(count: number): string {
  if (count === 1) return "sm:max-w-sm";
  if (count === 3) return "lg:grid-cols-3";
  if (count === 5)
    return "lg:grid-cols-6 [&>*]:lg:col-span-2 [&>*:nth-child(4)]:lg:col-start-2 2xl:grid-cols-5 [&>*]:2xl:col-span-1 [&>*:nth-child(4)]:2xl:col-start-auto";
  if (count === 6) return "lg:grid-cols-3";
  if (count === 7) return "xl:grid-cols-8 [&>*]:xl:col-span-2 [&>*:nth-child(5)]:xl:col-start-2";
  if (count === 8) return "xl:grid-cols-4";
  return "";
}

function signedR(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}R`;
}

function rColor(value: number | null | undefined): string {
  if (value == null) return "text-muted-foreground";
  if (value > 0) return "text-success";
  if (value < 0) return "text-destructive";
  return "text-muted-foreground";
}

function kpiToneForNumber(value: number | null | undefined): "success" | "destructive" | "info" {
  if (value == null) return "info";
  if (value > 0) return "success";
  if (value < 0) return "destructive";
  return "info";
}

function SessionTooltip({
  active,
  payload,
  label,
  showR = true,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Report["sessions"][number] }>;
  label?: string;
  showR?: boolean;
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
        {showR && (
          <>
            <div>
              Net R: <span className={rColor(data.netR)}>{signedR(data.netR)}</span>
            </div>
            <div>
              Avg R: <span className={rColor(data.avgRR)}>{signedR(data.avgRR)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LegacyReportView({
  r,
  trades,
  tracking,
  preferences,
  rPerformanceEnabled = true,
}: {
  r: Report;
  scope: ReportScope;
  trades: DbTrade[];
  tracking: ReturnType<typeof journalTrackingFromPreferences>;
  preferences: AnalyticsPreferences;
  rPerformanceEnabled?: boolean;
}) {
  const [activeDetailView, setActiveDetailView] = useState<
    "overview" | "categories" | "mistakes" | "emotions" | "instruments" | "sessions"
  >("overview");
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [pendingScrollSection, setPendingScrollSection] = useState<string | null>(null);
  const [showAllDays, setShowAllDays] = useState(false);
  const visibleSectionIds = useMemo(
    () => new Set(visibleAnalyticsSections(preferences, tracking, rPerformanceEnabled)),
    [preferences, rPerformanceEnabled, tracking],
  );
  const showSection = (id: AnalyticsSectionId) => visibleSectionIds.has(id);
  const sectionOrder = (id: AnalyticsSectionId) => preferences.order.indexOf(id) + 2;

  useEffect(() => {
    const detailSection: Partial<Record<typeof activeDetailView, AnalyticsSectionId>> = {
      categories: "category",
      mistakes: "mistakes",
      emotions: "emotions",
      instruments: "instrument",
      sessions: "session",
    };
    const section = detailSection[activeDetailView];
    if (section && !visibleSectionIds.has(section)) setActiveDetailView("overview");
  }, [activeDetailView, visibleSectionIds]);

  useEffect(() => {
    if (activeDetailView !== "overview" || !pendingScrollSection) return;
    const section = pendingScrollSection;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`analytics-section-${section}`);
      if (el) {
        el.scrollIntoView({ behavior: "instant", block: "center" });
        setHighlightedSection(section);
        window.setTimeout(() => setHighlightedSection(null), 400);
      }
      setPendingScrollSection(null);
    }, 230);
    return () => window.clearTimeout(timer);
  }, [activeDetailView, pendingScrollSection]);

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

  const hasUsefulEquity = r.resultCompleteCount >= 3;
  const hasSessionSample = r.coverage.sessions >= 3;
  const reviewGap = Math.max(0, r.totalTrades - r.reviewedTrades);
  const executionGap = r.plannedVsAchieved.avgGap;
  const repeatedCostlyMistake = r.mistakes.find(
    (mistake) => mistake.count >= MIN_BREAKDOWN_SAMPLE && mistake.netR != null && mistake.netR < 0,
  );
  const highlightCards = (
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
        ]
  ).filter((item) => {
    if (item.title === "Review gap") return true;
    if (!rPerformanceEnabled) return false;
    if (item.title === "Execution gap") return tracking.planned_rr !== "hidden";
    if (item.title === "Repeated costly mistake") return tracking.mistakes !== "hidden";
    return true;
  });

  if (activeDetailView !== "overview") {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`detail-${activeDetailView}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={CALM_TRANSITION}
          className="mt-6 flex flex-col gap-4"
        >
          <div>
            <button
              onClick={() => {
                const section = activeDetailView;
                setActiveDetailView("overview");
                setHighlightedSection(null);
                setPendingScrollSection(section);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition duration-200"
            >
              &larr; Back to Analytics
            </button>
          </div>

          {activeDetailView === "categories" && (
            <div className="section-card rounded-2xl p-5">
              <div className="border-b border-white/[0.06] pb-4 mb-4">
                <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <Tags className="h-5 w-5 text-primary" /> Category performance breakdown
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Full breakdown of your setup performance. Logged setups and categories.
                </p>
              </div>
              <SampleStatus count={r.coverage.categories} />
              <CoverageNote
                label="Category recorded"
                count={r.coverage.categories}
                total={r.totalTrades}
              />
              {r.categories.length === 0 ? (
                <SimpleSectionState>No categories tagged yet.</SimpleSectionState>
              ) : (
                <div className="overflow-x-auto">
                  <table className={cn("w-full text-sm", rPerformanceEnabled && "min-w-[720px]")}>
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="py-2.5 pr-4">Category</th>
                        <th className="py-2.5 pr-4 text-right">Trades</th>
                        <th className="py-2.5 pr-4 text-right">Win rate</th>
                        {rPerformanceEnabled && (
                          <>
                            <th className="py-2.5 pr-4 text-right">Net R</th>
                            <th className="py-2.5 pr-4 text-right">Avg R</th>
                            <th className="py-2.5 pr-4 text-right">Avg win</th>
                            <th className="py-2.5 text-right">Avg loss</th>
                          </>
                        )}
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
                            <td className="py-3 pr-4 font-medium">
                              <div>{c.name}</div>
                              {rPerformanceEnabled && c.rCount < c.trades && (
                                <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                                  R data for {c.rCount} of {c.trades}
                                </div>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-right tabular-nums">{c.trades}</td>
                            <td className="py-3 pr-4 text-right tabular-nums">
                              {c.winRate == null ? "—" : `${c.winRate.toFixed(1)}%`}
                            </td>
                            {rPerformanceEnabled && (
                              <>
                                <td
                                  className={cn(
                                    "py-3 pr-4 text-right font-semibold tabular-nums",
                                    rColor(c.netR),
                                  )}
                                >
                                  {signedR(c.netR)}
                                </td>
                                <td
                                  className={cn(
                                    "py-3 pr-4 text-right tabular-nums",
                                    c.avgRR == null ? "text-muted-foreground" : rColor(c.avgRR),
                                  )}
                                >
                                  {c.avgRR == null ? "—" : `${c.avgRR.toFixed(2)}R`}
                                </td>
                                <td
                                  className={cn(
                                    "py-3 pr-4 text-right tabular-nums",
                                    rColor(c.avgProfit),
                                  )}
                                >
                                  {signedR(c.avgProfit)}
                                </td>
                                <td
                                  className={cn("py-3 text-right tabular-nums", rColor(c.avgLoss))}
                                >
                                  {signedR(c.avgLoss)}
                                </td>
                              </>
                            )}
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
                  <AlertTriangle className="h-5 w-5 text-warning" /> Mistake analysis
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  All reviewed trade mistakes and rule-breaks found in your journal, ranked by
                  frequency.
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
                        <span className="text-xs text-muted-foreground">
                          {m.count} occurrences
                          {rPerformanceEnabled && m.rCount < m.count
                            ? ` · R data for ${m.rCount}`
                            : ""}
                        </span>
                      </div>
                      {rPerformanceEnabled && (
                        <span className={cn("text-sm font-bold tabular-nums", rColor(m.netR))}>
                          {signedR(m.netR)}
                        </span>
                      )}
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
                  <Brain className="h-5 w-5 text-primary" /> Emotion Insights
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Full breakdown of performance correlated with tagged psychological states and
                  emotions.
                </p>
              </div>
              <SampleStatus count={r.coverage.emotions} />
              <CoverageNote
                label="Emotion recorded"
                count={r.coverage.emotions}
                total={r.totalTrades}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                A trade may appear under more than one emotion.
              </p>
              {r.emotions.total === 0 ? (
                <SimpleSectionState>No emotions tagged yet.</SimpleSectionState>
              ) : (
                <div className="overflow-x-auto">
                  <table className={cn("w-full text-sm", rPerformanceEnabled && "min-w-[620px]")}>
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
                        {rPerformanceEnabled && (
                          <>
                            <th scope="col" className="py-3 pr-4 text-right">
                              Avg R
                            </th>
                            <th scope="col" className="py-3 text-right">
                              Net R
                            </th>
                          </>
                        )}
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
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{e.label}</span>
                                  {rPerformanceEnabled && e.rCount < e.count && (
                                    <span className="block text-[10px] text-muted-foreground">
                                      R data for {e.rCount} of {e.count}
                                    </span>
                                  )}
                                </span>
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
                            {rPerformanceEnabled && (
                              <>
                                <td
                                  className={cn(
                                    "py-3 pr-4 text-right font-semibold tabular-nums",
                                    rColor(e.avgR),
                                  )}
                                >
                                  {signedR(e.avgR)}
                                </td>
                                <td
                                  className={cn(
                                    "py-3 text-right font-semibold tabular-nums",
                                    rColor(e.netR),
                                  )}
                                >
                                  {signedR(e.netR)}
                                </td>
                              </>
                            )}
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
                  <CandlestickChart className="h-5 w-5 text-primary" /> Instrument performance
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Full performance breakdown by asset, ticker, or logged trading instrument.
                </p>
              </div>
              <SampleStatus count={r.coverage.instruments} />
              <CoverageNote
                label="Instrument recorded"
                count={r.coverage.instruments}
                total={r.totalTrades}
              />
              {r.instruments.length === 0 ? (
                <SimpleSectionState>No instruments logged yet.</SimpleSectionState>
              ) : (
                <div className="overflow-x-auto">
                  <table className={cn("w-full text-sm", rPerformanceEnabled && "min-w-[560px]")}>
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="py-2.5 pr-4">Instrument</th>
                        <th className="py-2.5 pr-4 text-right">Trades</th>
                        <th className="py-2.5 pr-4 text-right">Win rate</th>
                        {rPerformanceEnabled && (
                          <>
                            <th className="py-2.5 pr-4 text-right">Net R</th>
                            <th className="py-2.5 text-right">Avg R</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {r.instruments
                        .slice()
                        .sort((a, b) => b.count - a.count)
                        .map((i) => (
                          <tr
                            key={i.name}
                            className="border-b border-white/[0.04] last:border-0 transition hover:bg-white/[0.03]"
                          >
                            <td className="py-3.5 pr-4 font-semibold">
                              <div>{i.name}</div>
                              {rPerformanceEnabled && i.rCount < i.count && (
                                <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                                  R data for {i.rCount} of {i.count}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 pr-4 text-right tabular-nums">{i.count}</td>
                            <td className="py-3.5 pr-4 text-right tabular-nums">
                              {i.winRate == null ? "—" : `${i.winRate.toFixed(1)}%`}
                            </td>
                            {rPerformanceEnabled && (
                              <>
                                <td
                                  className={cn(
                                    "py-3.5 pr-4 text-right font-semibold tabular-nums",
                                    rColor(i.netR),
                                  )}
                                >
                                  {signedR(i.netR)}
                                </td>
                                <td
                                  className={cn(
                                    "py-3.5 text-right tabular-nums font-semibold",
                                    rColor(i.avgRR),
                                  )}
                                >
                                  {signedR(i.avgRR)}
                                </td>
                              </>
                            )}
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
                  <Clock className="h-5 w-5 text-primary" /> Session performance breakdown
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Full performance metrics categorized by your trading sessions.
                </p>
              </div>
              <SampleStatus count={r.coverage.sessions} />
              <CoverageNote
                label="Session recorded"
                count={r.coverage.sessions}
                total={r.totalTrades}
              />
              {r.sessions.length === 0 ? (
                <SimpleSectionState>No session data logged yet.</SimpleSectionState>
              ) : (
                <div className="overflow-x-auto">
                  <table className={cn("w-full text-sm", rPerformanceEnabled && "min-w-[620px]")}>
                    <thead>
                      <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="py-2.5 pr-4">Session</th>
                        <th className="py-2.5 pr-4 text-right">Trades</th>
                        <th className="py-2.5 pr-4 text-right">Wins</th>
                        <th className="py-2.5 pr-4 text-right">Losses</th>
                        <th className="py-2.5 pr-4 text-right">Win rate</th>
                        {rPerformanceEnabled && (
                          <>
                            <th className="py-2.5 pr-4 text-right">Net R</th>
                            <th className="py-2.5 text-right">Avg R</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {r.sessions.map((s) => (
                        <tr
                          key={s.name}
                          className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                        >
                          <td className="py-3 pr-4 font-medium">
                            <div>{s.name}</div>
                            {rPerformanceEnabled && s.rCount < s.count && (
                              <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                                R data for {s.rCount} of {s.count}
                              </div>
                            )}
                          </td>
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
                          {rPerformanceEnabled && (
                            <>
                              <td
                                className={cn(
                                  "py-3 pr-4 text-right font-bold tabular-nums",
                                  rColor(s.netR),
                                )}
                              >
                                {signedR(s.netR)}
                              </td>
                              <td
                                className={cn(
                                  "py-3 text-right font-semibold tabular-nums",
                                  rColor(s.avgRR),
                                )}
                              >
                                {signedR(s.avgRR)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key="overview"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={CALM_TRANSITION}
        className="mt-6 flex flex-col gap-4"
      >
        {/* Summary stats (first) */}
        <div
          className={cn(
            "order-1 grid grid-cols-1 gap-4 sm:grid-cols-2",
            countAwareGridClass(analyticsKpiIds(rPerformanceEnabled).length),
          )}
        >
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
          {rPerformanceEnabled && (
            <Kpi
              icon={TrendingUp}
              label="NET R"
              value={r.totalR ?? 0}
              displayValue={r.totalR == null ? "—" : undefined}
              decimals={2}
              suffix="R"
              tone={kpiToneForNumber(r.totalR)}
            />
          )}
          {rPerformanceEnabled && (
            <Kpi
              icon={Scale}
              label="AVG R"
              value={r.avgRR ?? 0}
              displayValue={r.avgRR == null ? "—" : undefined}
              decimals={2}
              suffix="R"
              tone={kpiToneForNumber(r.avgRR)}
            />
          )}
          {rPerformanceEnabled && (
            <Kpi
              icon={Calculator}
              label="PROFIT FACTOR"
              value={r.profitFactor ?? 0}
              displayValue={r.profitFactor == null ? "—" : undefined}
              decimals={2}
              tone="info"
              sub={r.profitFactor == null ? "Needs wins and losses" : undefined}
            />
          )}
          {rPerformanceEnabled && (
            <Kpi
              icon={ShieldAlert}
              label="MAX DRAWDOWN"
              value={r.maxDrawdown ?? 0}
              displayValue={r.maxDrawdown == null ? "—" : undefined}
              decimals={2}
              suffix="R"
              tone="warning"
            />
          )}
          <Kpi
            icon={ClipboardCheck}
            label="COMPLETED REVIEWS"
            value={0}
            displayValue={`${r.reviewedTrades} / ${r.totalTrades}`}
            tone="success"
          />
        </div>
        <p className="order-1 text-xs leading-5 text-muted-foreground">
          Results recorded for {r.coverage.results} of {r.totalTrades} trades
          {rPerformanceEnabled && (
            <>
              <span aria-hidden> · </span>R metrics based on {r.resultCompleteCount} of{" "}
              {r.totalTrades}
            </>
          )}
          <span aria-hidden> · </span>
          {r.reviewedTrades} of {r.totalTrades} trades reviewed
        </p>

        {/* Highlights */}
        {showSection("highlights") && (
          <div
            className="section-card rounded-2xl p-5"
            style={{ order: sectionOrder("highlights") }}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Lightbulb className="h-4 w-4 text-primary" /> Highlights
            </h3>
            {r.reviewedTrades < 10 ? (
              <div className="mt-4 rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.04]">
                <div className="text-sm font-semibold">Not enough reviewed trades yet</div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Add more detailed reviews to show reliable highlights.
                </p>
                <div
                  className={cn(
                    "mt-4 grid gap-2 text-xs",
                    countAwareGridClass(highlightCards.length),
                  )}
                >
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
              <div
                className={cn(
                  "mt-4 grid grid-cols-1 gap-3",
                  countAwareGridClass(highlightCards.length),
                )}
              >
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
        )}
        {/* Performance Charts — equity curve */}
        {showSection("equity_curve") && (
          <div
            className="section-card rounded-2xl p-5"
            style={{ order: sectionOrder("equity_curve") }}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" /> Equity curve
            </h3>
            <div className={cn("mt-4", hasUsefulEquity ? "h-[280px]" : "h-[152px]")}>
              {!hasUsefulEquity ? (
                <ChartLowDataState
                  icon={TrendingUp}
                  title={`${Math.max(0, 3 - r.resultCompleteCount)} more realised-R trade${Math.max(0, 3 - r.resultCompleteCount) === 1 ? "" : "s"} needed`}
                  description="Add risk and P/L."
                />
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
        )}

        {/* Session performance breakdown */}
        {showSection("session") && r.coverage.sessions > 0 && (
          <div
            id="analytics-section-sessions"
            style={{ order: sectionOrder("session") }}
            className={cn(
              "section-card rounded-2xl p-5 scroll-mt-28",
              r.coverage.sessions === 0 && "hidden",
              highlightedSection === "sessions" && "ring-1 ring-white/[0.05]",
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-primary" /> Session performance breakdown
              </h3>
              {r.sessions.length > 4 && (
                <button
                  onClick={() => setActiveDetailView("sessions")}
                  className="text-xs font-semibold text-primary transition hover:text-primary-glow"
                >
                  View all &rarr;
                </button>
              )}
            </div>
            <SampleStatus count={r.coverage.sessions} />
            <CoverageNote
              label="Session recorded"
              count={r.coverage.sessions}
              total={r.totalTrades}
            />
            <div className="mt-4">
              {!hasSessionSample ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {r.sessions
                    .filter((session) => session.count > 0)
                    .map((session) => (
                      <div
                        key={session.name}
                        className="rounded-xl bg-white/[0.025] px-3.5 py-3 ring-1 ring-white/[0.04]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold">{session.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {session.count} {session.count === 1 ? "trade" : "trades"}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                          <span>
                            {session.winRate == null ? "—" : `${session.winRate.toFixed(0)}% WR`}
                          </span>
                          {rPerformanceEnabled && (
                            <span className={rColor(session.netR)}>
                              {signedR(session.netR)} net
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <>
                  <div className="mb-2 hidden items-center justify-end gap-4 text-[10px] text-muted-foreground sm:flex">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-success" aria-hidden /> Wins
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-destructive" aria-hidden /> Losses
                    </span>
                  </div>
                  {/* Desktop Chart View */}
                  <div className="hidden h-[260px] sm:block">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={r.sessions.filter((session) => session.count > 0)}
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
                          content={<SessionTooltip showR={rPerformanceEnabled} />}
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
                    {r.sessions
                      .filter((session) => session.count > 0)
                      .map((s) => (
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
                            {rPerformanceEnabled && (
                              <div className={cn("text-xs font-bold tabular-nums", rColor(s.netR))}>
                                {signedR(s.netR)}
                              </div>
                            )}
                            <div className="text-[10px] text-muted-foreground">
                              {s.winRate == null ? "—" : `${s.winRate.toFixed(0)}% WR`}
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>

                  <AnimatePresence initial={false}>
                    {selectedSession && (
                      <motion.div
                        key={selectedSession.name}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={CALM_TRANSITION}
                        className="mt-4 rounded-xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.04]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                            Session Detail: {selectedSession.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedSession(null)}
                            className="text-[10px] font-semibold text-primary transition hover:text-primary-glow"
                          >
                            Clear selection
                          </button>
                        </div>
                        <div
                          className={cn(
                            "mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs",
                            rPerformanceEnabled && "sm:grid-cols-4",
                          )}
                        >
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
                          {rPerformanceEnabled && (
                            <>
                              <div>
                                <div className="text-muted-foreground/70">Net R</div>
                                <div
                                  className={cn("mt-0.5 font-bold", rColor(selectedSession.netR))}
                                >
                                  {signedR(selectedSession.netR)}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground/70">Avg R</div>
                                <div
                                  className={cn("mt-0.5 font-bold", rColor(selectedSession.avgRR))}
                                >
                                  {signedR(selectedSession.avgRR)}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </div>
        )}

        {/* Category performance breakdown */}
        {showSection("category") && r.coverage.categories > 0 && (
          <div
            id="analytics-section-categories"
            style={{ order: sectionOrder("category") }}
            className={cn(
              "section-card rounded-2xl p-5 scroll-mt-28",
              r.coverage.categories === 0 && "hidden",
              highlightedSection === "categories" && "ring-1 ring-white/[0.05]",
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Tags className="h-4 w-4 text-primary" /> Category performance breakdown
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
            <SampleStatus count={r.coverage.categories} />
            <CoverageNote
              label="Category recorded"
              count={r.coverage.categories}
              total={r.totalTrades}
            />
            {r.categories.length === 0 ? (
              <SimpleSectionState>No categories tagged yet.</SimpleSectionState>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className={cn("w-full text-sm", rPerformanceEnabled && "min-w-[720px]")}>
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="py-2.5 pr-4">Category</th>
                      <th className="py-2.5 pr-4 text-right">Trades</th>
                      <th className="py-2.5 pr-4 text-right">Win rate</th>
                      {rPerformanceEnabled && (
                        <>
                          <th className="py-2.5 pr-4 text-right">Net R</th>
                          <th className="py-2.5 pr-4 text-right">Avg R</th>
                          <th className="py-2.5 pr-4 text-right">Avg win</th>
                          <th className="py-2.5 text-right">Avg loss</th>
                        </>
                      )}
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
                          <td className="py-3 pr-4 font-medium">
                            <div>{c.name}</div>
                            {rPerformanceEnabled && c.rCount < c.trades && (
                              <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                                R data for {c.rCount} of {c.trades}
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-right tabular-nums">{c.trades}</td>
                          <td className="py-3 pr-4 text-right tabular-nums">
                            {c.winRate == null ? "—" : `${c.winRate.toFixed(1)}%`}
                          </td>
                          {rPerformanceEnabled && (
                            <>
                              <td
                                className={cn(
                                  "py-3 pr-4 text-right font-semibold tabular-nums",
                                  rColor(c.netR),
                                )}
                              >
                                {signedR(c.netR)}
                              </td>
                              <td
                                className={cn(
                                  "py-3 pr-4 text-right tabular-nums",
                                  c.avgRR == null ? "text-muted-foreground" : rColor(c.avgRR),
                                )}
                              >
                                {c.avgRR == null ? "—" : `${c.avgRR.toFixed(2)}R`}
                              </td>
                              <td
                                className={cn(
                                  "py-3 pr-4 text-right tabular-nums",
                                  rColor(c.avgProfit),
                                )}
                              >
                                {signedR(c.avgProfit)}
                              </td>
                              <td className={cn("py-3 text-right tabular-nums", rColor(c.avgLoss))}>
                                {signedR(c.avgLoss)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Mistake analysis */}
        {showSection("mistakes") && r.coverage.mistakes > 0 && r.mistakes.length > 0 && (
          <div
            id="analytics-section-mistakes"
            style={{ order: sectionOrder("mistakes") }}
            className={cn(
              "section-card rounded-2xl p-5 scroll-mt-28",
              r.coverage.mistakes === 0 && "hidden",
              highlightedSection === "mistakes" && "ring-1 ring-white/[0.05]",
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-warning" /> Mistake analysis
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
            <SampleStatus count={r.coverage.mistakes} />
            <CoverageNote
              label="Mistake data recorded"
              count={r.coverage.mistakes}
              total={r.totalTrades}
            />
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
                      <span className="text-xs text-muted-foreground">
                        {m.count} occurrences
                        {rPerformanceEnabled && m.rCount < m.count
                          ? ` · R data for ${m.rCount}`
                          : ""}
                      </span>
                    </div>
                    {rPerformanceEnabled && (
                      <span className={cn("text-sm font-bold tabular-nums", rColor(m.netR))}>
                        {signedR(m.netR)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Emotion insights */}
        {showSection("emotions") && r.coverage.emotions > 0 && r.emotions.total > 0 && (
          <div
            id="analytics-section-emotions"
            style={{ order: sectionOrder("emotions") }}
            className={cn(
              "section-card rounded-2xl p-5 scroll-mt-28",
              r.coverage.emotions === 0 && "hidden",
              highlightedSection === "emotions" && "ring-1 ring-white/[0.05]",
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Brain className="h-4 w-4 text-primary" /> Emotion Insights
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
            <SampleStatus count={r.coverage.emotions} />
            <CoverageNote
              label="Emotion recorded"
              count={r.coverage.emotions}
              total={r.totalTrades}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              A trade may appear under more than one emotion.
            </p>
            {r.emotions.total === 0 ? (
              <SimpleSectionState>No emotions tagged yet.</SimpleSectionState>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto">
                  <table className={cn("w-full text-sm", rPerformanceEnabled && "min-w-[620px]")}>
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
                        {rPerformanceEnabled && (
                          <>
                            <th scope="col" className="py-3 pr-4 text-right">
                              Avg R
                            </th>
                            <th scope="col" className="py-3 text-right">
                              Net R
                            </th>
                          </>
                        )}
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
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{e.label}</span>
                                  {rPerformanceEnabled && e.rCount < e.count && (
                                    <span className="block text-[10px] text-muted-foreground">
                                      R data for {e.rCount} of {e.count}
                                    </span>
                                  )}
                                </span>
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
                            {rPerformanceEnabled && (
                              <>
                                <td
                                  className={cn(
                                    "py-3 pr-4 text-right font-semibold tabular-nums",
                                    rColor(e.avgR),
                                  )}
                                >
                                  {signedR(e.avgR)}
                                </td>
                                <td
                                  className={cn(
                                    "py-3 text-right font-semibold tabular-nums",
                                    rColor(e.netR),
                                  )}
                                >
                                  {signedR(e.netR)}
                                </td>
                              </>
                            )}
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
        {/* Day Performance — scoped to report period */}
        {showSection("day") && (
          <div className="section-card rounded-2xl p-5" style={{ order: sectionOrder("day") }}>
            {(() => {
              const allDayCards = [
                ...r.weekdays.filter((d) => d.count > 0),
                ...r.weekdays.filter((d) => d.count === 0),
              ];
              const staticCards = allDayCards.slice(0, 3);
              const extraCards = allDayCards.slice(3);
              return (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <CalendarDays className="h-4 w-4 text-primary" /> Day Performance
                    </h3>
                    {r.weekdays.length > 3 && (
                      <button
                        onClick={() => setShowAllDays(!showAllDays)}
                        className="text-xs font-semibold text-primary transition hover:text-primary-glow"
                      >
                        {showAllDays ? "Show less" : "View all"} &rarr;
                      </button>
                    )}
                  </div>
                  <SampleStatus count={r.totalTrades} />
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                    {staticCards.map((d) => (
                      <div
                        key={d.name}
                        className="rounded-xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.04]"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-semibold tracking-[0.16em] text-foreground/80">
                            {d.name.slice(0, 3).toUpperCase()}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {d.count > 0 ? `${d.count} trade${d.count === 1 ? "" : "s"}` : ""}
                          </div>
                        </div>
                        <div className="mt-2 text-2xl font-bold tabular-nums text-foreground/85">
                          {d.winRate == null ? "—" : `${d.winRate.toFixed(0)}%`}
                        </div>
                        {rPerformanceEnabled && (
                          <div
                            className={cn(
                              "mt-1.5 text-xs font-semibold tabular-nums",
                              d.netR == null || d.count === 0
                                ? "text-muted-foreground"
                                : rColor(d.netR),
                            )}
                          >
                            {d.count === 0
                              ? "No data"
                              : d.netR == null
                                ? "—"
                                : `${signedR(d.netR)} net`}
                          </div>
                        )}
                      </div>
                    ))}
                    <AnimatePresence initial={false}>
                      {showAllDays &&
                        extraCards.map((d, index) => (
                          <motion.div
                            key={d.name}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{
                              opacity: 0,
                              x: 12,
                              transition: { delay: (extraCards.length - 1 - index) * 0.04 },
                            }}
                            transition={{
                              duration: 0.2,
                              ease: [0.16, 1, 0.3, 1],
                              delay: index * 0.04,
                            }}
                            className="rounded-xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.04]"
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-[11px] font-semibold tracking-[0.16em] text-foreground/80">
                                {d.name.slice(0, 3).toUpperCase()}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {d.count > 0 ? `${d.count} trade${d.count === 1 ? "" : "s"}` : ""}
                              </div>
                            </div>
                            <div className="mt-2 text-2xl font-bold tabular-nums text-foreground/85">
                              {d.winRate == null ? "—" : `${d.winRate.toFixed(0)}%`}
                            </div>
                            {rPerformanceEnabled && (
                              <div
                                className={cn(
                                  "mt-1.5 text-xs font-semibold tabular-nums",
                                  d.netR == null || d.count === 0
                                    ? "text-muted-foreground"
                                    : rColor(d.netR),
                                )}
                              >
                                {d.count === 0
                                  ? "No data"
                                  : d.netR == null
                                    ? "—"
                                    : `${signedR(d.netR)} net`}
                              </div>
                            )}
                          </motion.div>
                        ))}
                    </AnimatePresence>
                  </div>
                </>
              );
            })()}
          </div>
        )}
        {/* Planned vs Achieved R */}
        {showSection("planned_vs_achieved") && r.plannedVsAchieved.sampleSize > 0 && (
          <div
            style={{ order: sectionOrder("planned_vs_achieved") }}
            className={cn(
              "section-card rounded-2xl p-5",
              r.plannedVsAchieved.sampleSize === 0 && "hidden",
            )}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ArrowLeftRight className="h-4 w-4 text-primary" /> Planned vs Achieved R
            </h3>
            <SampleStatus count={r.plannedVsAchieved.sampleSize} noun="paired trades" />
            <p className="mt-2 text-xs text-muted-foreground">
              Based on {r.plannedVsAchieved.sampleSize} paired trade
              {r.plannedVsAchieved.sampleSize === 1 ? "" : "s"} with planned and realised R.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
                <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                  PLANNED AVG
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {r.plannedVsAchieved.plannedAvg?.toFixed(2)}R
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">Average planned R:R</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
                <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                  ACHIEVED AVG
                </div>
                <div
                  className={cn(
                    "mt-1 text-2xl font-bold tabular-nums",
                    rColor(r.plannedVsAchieved.achievedAvg),
                  )}
                >
                  {signedR(r.plannedVsAchieved.achievedAvg)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">Same paired trades</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
                <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                  AVG GAP
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {r.plannedVsAchieved.avgGap == null
                    ? "—"
                    : `${r.plannedVsAchieved.avgGap.toFixed(2)}R`}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">|achieved − planned|</div>
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
                <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                  EXECUTION GAP
                </div>
                <div
                  className={cn(
                    "mt-1 text-2xl font-bold tabular-nums",
                    rColor(r.plannedVsAchieved.avgGap),
                  )}
                >
                  {signedR(r.plannedVsAchieved.avgGap)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">Achieved − planned</div>
              </div>
            </div>
          </div>
        )}
        {/* Direction breakdown */}
        {showSection("direction") && r.coverage.directions > 0 && (
          <div
            style={{ order: sectionOrder("direction") }}
            className={cn("section-card rounded-2xl p-5", r.coverage.directions === 0 && "hidden")}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ArrowLeftRight className="h-4 w-4 text-primary" /> Direction performance
            </h3>
            <SampleStatus count={r.coverage.directions} />
            <CoverageNote
              label="Direction recorded"
              count={r.coverage.directions}
              total={r.totalTrades}
            />
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
                        "text-base font-bold",
                        d.name === "Long" ? "text-success/90" : "text-info/90",
                      )}
                    >
                      {d.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{d.count} trades</div>
                  </div>
                  <div
                    className={cn(
                      "mt-4 grid gap-4 text-sm",
                      rPerformanceEnabled ? "grid-cols-3" : "grid-cols-1",
                    )}
                  >
                    <div>
                      <div className="text-muted-foreground/80">Win rate</div>
                      <div className="mt-1 font-semibold tabular-nums text-foreground">
                        {d.winRate == null ? "—" : `${d.winRate.toFixed(1)}%`}
                      </div>
                    </div>
                    {rPerformanceEnabled && (
                      <>
                        <div>
                          <div className="text-muted-foreground/80">Net R</div>
                          <div
                            className={cn(
                              "mt-1 font-semibold tabular-nums",
                              d.netR == null ? "text-muted-foreground" : rColor(d.netR),
                            )}
                          >
                            {signedR(d.netR)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground/80">Avg R</div>
                          <div
                            className={cn(
                              "mt-1 font-semibold tabular-nums",
                              d.avgRR == null ? "text-muted-foreground" : rColor(d.avgRR),
                            )}
                          >
                            {d.avgRR == null ? "—" : signedR(d.avgRR)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {rPerformanceEnabled && d.rCount < d.count && (
                    <p className="mt-3 text-[10px] text-muted-foreground">
                      R metrics based on {d.rCount} of {d.count} trades.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Killzone performance */}
        {showSection("killzone") && r.coverage.killzone > 0 && (
          <div
            style={{ order: sectionOrder("killzone") }}
            className={cn("section-card rounded-2xl p-5", r.coverage.killzone === 0 && "hidden")}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Crosshair className="h-4 w-4 text-primary" /> Killzone Performance
            </h3>
            <SampleStatus count={r.coverage.killzone} />
            <CoverageNote
              label="Killzone choice recorded"
              count={r.coverage.killzone}
              total={r.totalTrades}
            />
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-primary/12">
                <div className="text-[10px] font-semibold tracking-[0.16em] text-primary/85">
                  IN KILLZONE
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {r.killzoneDiscipline.inCount} trade
                  {r.killzoneDiscipline.inCount === 1 ? "" : "s"}
                </div>
                <div
                  className={cn(
                    "mt-4 grid gap-4 text-sm",
                    rPerformanceEnabled ? "grid-cols-3" : "grid-cols-1",
                  )}
                >
                  <div>
                    <div className="text-muted-foreground/80">Win rate</div>
                    <div className="mt-1 font-semibold tabular-nums text-foreground">
                      {r.killzoneDiscipline.inWinRate == null
                        ? "—"
                        : r.killzoneDiscipline.inWinRate.toFixed(1) + "%"}
                    </div>
                  </div>
                  {rPerformanceEnabled && (
                    <>
                      <div>
                        <div className="text-muted-foreground/80">Net R</div>
                        <div
                          className={cn(
                            "mt-1 font-semibold tabular-nums",
                            rColor(r.killzoneDiscipline.inNetR),
                          )}
                        >
                          {signedR(r.killzoneDiscipline.inNetR)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground/80">Avg R</div>
                        <div
                          className={cn(
                            "mt-1 font-semibold tabular-nums",
                            rColor(r.killzoneDiscipline.inAvgR),
                          )}
                        >
                          {signedR(r.killzoneDiscipline.inAvgR)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {rPerformanceEnabled &&
                  r.killzoneDiscipline.inRCount < r.killzoneDiscipline.inCount && (
                    <p className="mt-3 text-[10px] text-muted-foreground">
                      R metrics based on {r.killzoneDiscipline.inRCount} of{" "}
                      {r.killzoneDiscipline.inCount} trades.
                    </p>
                  )}
              </div>
              <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
                <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                  OUTSIDE KILLZONE
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {r.killzoneDiscipline.outCount} trade
                  {r.killzoneDiscipline.outCount === 1 ? "" : "s"}
                </div>
                <div
                  className={cn(
                    "mt-4 grid gap-4 text-sm",
                    rPerformanceEnabled ? "grid-cols-3" : "grid-cols-1",
                  )}
                >
                  <div>
                    <div className="text-muted-foreground/80">Win rate</div>
                    <div className="mt-1 font-semibold tabular-nums text-foreground">
                      {r.killzoneDiscipline.outWinRate == null
                        ? "—"
                        : r.killzoneDiscipline.outWinRate.toFixed(1) + "%"}
                    </div>
                  </div>
                  {rPerformanceEnabled && (
                    <>
                      <div>
                        <div className="text-muted-foreground/80">Net R</div>
                        <div
                          className={cn(
                            "mt-1 font-semibold tabular-nums",
                            rColor(r.killzoneDiscipline.outNetR),
                          )}
                        >
                          {signedR(r.killzoneDiscipline.outNetR)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground/80">Avg R</div>
                        <div
                          className={cn(
                            "mt-1 font-semibold tabular-nums",
                            rColor(r.killzoneDiscipline.outAvgR),
                          )}
                        >
                          {signedR(r.killzoneDiscipline.outAvgR)}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {rPerformanceEnabled &&
                  r.killzoneDiscipline.outRCount < r.killzoneDiscipline.outCount && (
                    <p className="mt-3 text-[10px] text-muted-foreground">
                      R metrics based on {r.killzoneDiscipline.outRCount} of{" "}
                      {r.killzoneDiscipline.outCount} trades.
                    </p>
                  )}
              </div>
            </div>
          </div>
        )}
        {/* Grade distribution */}
        {showSection("grade") && r.coverage.grades > 0 && (
          <div
            style={{ order: sectionOrder("grade") }}
            className={cn("section-card rounded-2xl p-5", r.coverage.grades === 0 && "hidden")}
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Award className="h-4 w-4 text-warning" /> Grade distribution
            </h3>
            <SampleStatus count={r.coverage.grades} />
            <CoverageNote label="Grade recorded" count={r.coverage.grades} total={r.totalTrades} />
            <div className="mt-4 space-y-1.5">
              {r.grades
                .filter((grade) => grade.count > 0)
                .map((g) => (
                  <div
                    key={g.name}
                    className="flex items-center justify-between rounded-xl bg-white/[0.025] px-3.5 py-2.5 ring-1 ring-white/[0.04]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "w-7 text-sm font-bold",
                          g.name === "A+" || g.name === "A"
                            ? "text-warning"
                            : g.name === "B+" || g.name === "B"
                              ? "text-foreground"
                              : "text-muted-foreground",
                        )}
                      >
                        {g.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {g.count} {g.count === 1 ? "trade" : "trades"}
                        {rPerformanceEnabled && g.rCount < g.count
                          ? ` · R data for ${g.rCount}`
                          : ""}
                      </span>
                    </div>
                    {rPerformanceEnabled && (
                      <span
                        className={cn(
                          "text-xs font-semibold tabular-nums",
                          g.avgR != null ? rColor(g.avgR) : "text-muted-foreground",
                        )}
                      >
                        {g.avgR == null ? "—" : `${signedR(g.avgR)} avg`}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
        {/* Instrument breakdown */}
        {showSection("instrument") && r.coverage.instruments > 0 && (
          <div
            id="analytics-section-instruments"
            style={{ order: sectionOrder("instrument") }}
            className={cn(
              "section-card rounded-2xl p-5 scroll-mt-28",
              r.coverage.instruments === 0 && "hidden",
              highlightedSection === "instruments" && "ring-1 ring-white/[0.05]",
            )}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <CandlestickChart className="h-4 w-4 text-primary" /> Instrument performance
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
            <SampleStatus count={r.coverage.instruments} />
            <CoverageNote
              label="Instrument recorded"
              count={r.coverage.instruments}
              total={r.totalTrades}
            />
            {r.instruments.length === 0 ? (
              <SimpleSectionState>No instruments logged yet.</SimpleSectionState>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className={cn("w-full text-sm", rPerformanceEnabled && "min-w-[560px]")}>
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="py-2.5 pr-4">Instrument</th>
                      <th className="py-2.5 pr-4 text-right">Trades</th>
                      <th className="py-2.5 pr-4 text-right">Win rate</th>
                      {rPerformanceEnabled && (
                        <>
                          <th className="py-2.5 pr-4 text-right">Net R</th>
                          <th className="py-2.5 text-right">Avg R</th>
                        </>
                      )}
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
                          className="border-b border-white/[0.04] last:border-0 transition hover:bg-white/[0.03]"
                        >
                          <td className="py-3.5 pr-4 font-semibold">
                            <div>{i.name}</div>
                            {rPerformanceEnabled && i.rCount < i.count && (
                              <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                                R data for {i.rCount} of {i.count}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 pr-4 text-right tabular-nums">{i.count}</td>
                          <td className="py-3.5 pr-4 text-right tabular-nums">
                            {i.winRate == null ? "—" : `${i.winRate.toFixed(1)}%`}
                          </td>
                          {rPerformanceEnabled && (
                            <>
                              <td
                                className={cn(
                                  "py-3.5 pr-4 text-right font-semibold tabular-nums",
                                  rColor(i.netR),
                                )}
                              >
                                {signedR(i.netR)}
                              </td>
                              <td
                                className={cn(
                                  "py-3.5 text-right tabular-nums font-semibold",
                                  rColor(i.avgRR),
                                )}
                              >
                                {signedR(i.avgRR)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <OptionalTrackingAnalytics
          trades={trades}
          preferences={preferences}
          rPerformanceEnabled={rPerformanceEnabled}
          sectionOrder={sectionOrder}
          showSection={showSection}
        />
      </motion.div>
    </AnimatePresence>
  );
}

const REPORT_ICON_BY_SECTION: Record<AnalyticsSectionId, LucideIcon> = {
  highlights: Lightbulb,
  equity_curve: TrendingUp,
  planned_vs_achieved: ArrowLeftRight,
  mistakes: AlertTriangle,
  emotions: Brain,
  grade: Award,
  trade_management: ShieldAlert,
  session: Clock,
  day: CalendarDays,
  direction: ArrowLeftRight,
  killzone: Crosshair,
  category: Tags,
  instrument: CandlestickChart,
  entry_model: Target,
  market_condition: BarChart3,
  entry_timeframe: Clock,
  news_involvement: AlertTriangle,
  exit_reason: Crosshair,
  custom_tags: Tags,
};

const GROUP_ICON_BY_ID: Record<AnalyticsReportGroup, LucideIcon> = {
  overview: BarChart3,
  process_review: ClipboardCheck,
  performance_patterns: TrendingUp,
  trade_context: SlidersHorizontal,
};

const SUMMARY_ICON_BY_ID = {
  total_trades: BriefcaseBusiness,
  win_rate: BadgePercent,
  net_r: Sigma,
  avg_r: Scale,
  completed_reviews: ClipboardCheck,
  profit_factor: Calculator,
} as const;

function ReportSectionHeader({
  id,
  title,
  action,
}: {
  id: AnalyticsSectionId;
  title: string;
  description?: string;
  meta?: string;
  action?: ReactNode;
}) {
  const Icon = REPORT_ICON_BY_SECTION[id];
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon
          className={cn("h-4 w-4", id === "grade" ? "text-warning" : "text-primary")}
          aria-hidden="true"
        />
        {title}
      </h3>
      {action}
    </div>
  );
}

type CompactReportRow = {
  name: string;
  count: number;
  winRate: number | null;
  netR: number | null;
  avgR?: number | null;
  avgWin?: number | null;
  avgLoss?: number | null;
  rCount?: number;
};

function CompactReportSection({
  id,
  title,
  rows,
  rPerformanceEnabled,
  nameHeader = "Value",
  limit = 4,
  tagNames = false,
  showWinLoss = false,
  order,
}: {
  id: AnalyticsSectionId;
  title: string;
  rows: CompactReportRow[];
  rPerformanceEnabled: boolean;
  nameHeader?: string;
  limit?: number;
  tagNames?: boolean;
  showWinLoss?: boolean;
  order?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="section-card rounded-2xl p-5" style={{ order }}>
      <ReportSectionHeader
        id={id}
        title={title}
        action={
          rows.length > limit ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
              className="text-xs font-semibold text-primary transition-colors hover:text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
            >
              {expanded ? "Show less" : "View all →"}
            </button>
          ) : null
        }
      />
      <div className="mt-4 overflow-x-auto">
        <table
          className={cn(
            "w-full text-sm",
            rPerformanceEnabled && (showWinLoss ? "min-w-[720px]" : "min-w-[560px]"),
          )}
        >
          <thead>
            <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <th className="py-2.5 pr-4">{nameHeader}</th>
              <th className="py-2.5 pr-4 text-right">Trades</th>
              <th className="py-2.5 pr-4 text-right">Win rate</th>
              {rPerformanceEnabled && (
                <>
                  <th className="py-2.5 pr-4 text-right">Net R</th>
                  <th className="py-2.5 pr-4 text-right">Avg R</th>
                  {showWinLoss && (
                    <>
                      <th className="py-2.5 pr-4 text-right">Avg win</th>
                      <th className="py-2.5 text-right">Avg loss</th>
                    </>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, expanded ? rows.length : limit).map((row) => (
              <tr
                key={row.name}
                className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.03]"
              >
                <td className="py-3.5 pr-4 font-semibold">
                  <div className="max-w-[22rem] truncate">
                    {tagNames ? `#${row.name}` : row.name}
                  </div>
                  {rPerformanceEnabled && row.rCount != null && row.rCount < row.count && (
                    <div className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                      R data for {row.rCount} of {row.count}
                    </div>
                  )}
                </td>
                <td className="py-3.5 pr-4 text-right tabular-nums">{row.count}</td>
                <td className="py-3.5 pr-4 text-right tabular-nums">
                  {row.winRate == null ? "—" : `${row.winRate.toFixed(1)}%`}
                </td>
                {rPerformanceEnabled && (
                  <>
                    <td
                      className={cn(
                        "py-3.5 pr-4 text-right font-semibold tabular-nums",
                        rColor(row.netR),
                      )}
                    >
                      {signedR(row.netR)}
                    </td>
                    <td
                      className={cn(
                        "py-3.5 pr-4 text-right font-semibold tabular-nums",
                        rColor(row.avgR),
                      )}
                    >
                      {signedR(row.avgR)}
                    </td>
                    {showWinLoss && (
                      <>
                        <td className="py-3.5 pr-4 text-right tabular-nums">
                          {signedR(row.avgWin)}
                        </td>
                        <td className="py-3.5 text-right tabular-nums">{signedR(row.avgLoss)}</td>
                      </>
                    )}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExecutionIssueRows({
  rows,
  rPerformanceEnabled,
  order,
}: {
  rows: Report["mistakes"];
  rPerformanceEnabled: boolean;
  order?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="section-card rounded-2xl p-5" style={{ order }}>
      <ReportSectionHeader
        id="mistakes"
        title="Execution Issues"
        action={
          rows.length > 4 ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
              className="text-xs font-semibold text-primary transition-colors hover:text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
            >
              {expanded ? "Show less" : "View all →"}
            </button>
          ) : null
        }
      />
      <div className="mt-4 space-y-2">
        {rows.slice(0, expanded ? rows.length : 4).map((row) => (
          <div
            key={row.name}
            className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.03] px-4 py-2.5 ring-1 ring-white/[0.04]"
          >
            <div className="min-w-0">
              <span className="inline-flex max-w-full rounded-md bg-warning/10 px-2 py-1 text-xs font-semibold text-warning/90">
                <span className="truncate">{row.name}</span>
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {row.count} {row.count === 1 ? "trade" : "trades"}
              </span>
            </div>
            {rPerformanceEnabled && (
              <span className={cn("shrink-0 text-xs font-semibold tabular-nums", rColor(row.netR))}>
                {signedR(row.netR)}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function CompactBucketRows({
  rows,
  rPerformanceEnabled,
  limit = 4,
  variant = "default",
}: {
  rows: CompactReportRow[];
  rPerformanceEnabled: boolean;
  limit?: number;
  variant?: "default" | "issue" | "instrument" | "tag";
}) {
  return (
    <div className="mt-4">
      <div className="space-y-2">
        {rows.slice(0, limit).map((row) => (
          <div
            key={row.name}
            className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.03] px-4 py-2.5 ring-1 ring-white/[0.04]"
          >
            <div className="min-w-0">
              <span className="truncate text-sm font-semibold">
                {variant === "tag" ? `#${row.name}` : row.name}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {row.count} {row.count === 1 ? "trade" : "trades"}
              </span>
            </div>
            <span
              className={cn(
                "shrink-0 text-xs font-semibold tabular-nums",
                rPerformanceEnabled ? rColor(row.netR) : "text-muted-foreground",
              )}
            >
              {rPerformanceEnabled
                ? signedR(row.netR)
                : row.winRate == null
                  ? "—"
                  : `${row.winRate.toFixed(1)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultBlocks({
  wins,
  losses,
  breakeven,
  limit = 16,
}: {
  wins: number;
  losses: number;
  breakeven: number;
  limit?: number;
}) {
  const total = wins + losses + breakeven;
  if (!total) return <div className="h-2.5 flex-1 rounded bg-white/[0.06]" />;
  const counts = [wins, losses, breakeven];
  const shown = Math.min(total, limit);
  const rawAllocations = counts.map((count) => (count / total) * shown);
  const allocations = rawAllocations.map((value, index) =>
    counts[index] > 0 ? Math.max(1, Math.floor(value)) : 0,
  );
  while (allocations.reduce((sum, value) => sum + value, 0) < shown) {
    const index = rawAllocations
      .map((value, itemIndex) => value - allocations[itemIndex])
      .reduce((best, value, itemIndex, values) => (value > values[best] ? itemIndex : best), 0);
    allocations[index] += 1;
  }
  while (allocations.reduce((sum, value) => sum + value, 0) > shown) {
    const index = allocations.reduce(
      (best, value, itemIndex, values) => (value > 1 && value > values[best] ? itemIndex : best),
      allocations[0] > 1 ? 0 : allocations[1] > 1 ? 1 : 2,
    );
    allocations[index] -= 1;
  }
  const resultTypes = allocations.flatMap((count, type) =>
    Array.from({ length: count }, () => type),
  );
  const colors = ["bg-success/75", "bg-destructive/75", "bg-muted-foreground/55"];
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1"
      aria-label={`${wins} wins, ${losses} losses, ${breakeven} breakevens`}
    >
      {resultTypes.map((type, index) => (
        <span
          key={`${type}-${index}`}
          className={cn("h-2.5 min-w-1 flex-1 rounded-sm", colors[type])}
        />
      ))}
      {total > limit && (
        <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">+{total - limit}</span>
      )}
    </div>
  );
}

function AnalyticsReportExperience({
  r,
  trades,
  tracking,
  preferences,
  rPerformanceEnabled,
}: {
  r: Report;
  trades: DbTrade[];
  tracking: ReturnType<typeof journalTrackingFromPreferences>;
  preferences: AnalyticsPreferences;
  rPerformanceEnabled: boolean;
}) {
  const [group, setGroup] = useState<AnalyticsReportGroup>("overview");
  const [guideOpen, setGuideOpen] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const visible = useMemo(
    () => new Set(visibleAnalyticsSections(preferences, tracking, rPerformanceEnabled)),
    [preferences, rPerformanceEnabled, tracking],
  );
  const optionalRows = useMemo(() => {
    const values: Partial<Record<AnalyticsSectionId, (trade: DbTrade) => string[]>> = {
      entry_model: (trade) => (trade.entry_model ? [trade.entry_model] : []),
      market_condition: (trade) => (trade.market_condition ? [trade.market_condition] : []),
      entry_timeframe: (trade) => (trade.entry_timeframe ? [trade.entry_timeframe] : []),
      news_involvement: (trade) => (trade.news_involvement ? [trade.news_involvement] : []),
      exit_reason: (trade) => (trade.exit_reason ? [trade.exit_reason] : []),
      trade_management: (trade) => trade.trade_management ?? [],
      custom_tags: (trade) => trade.custom_tags ?? [],
    };
    return Object.fromEntries(
      Object.entries(values).map(([id, value]) => [
        id,
        optionalFieldAnalytics(
          trades,
          value!,
          id === "entry_timeframe" ? stableTimeframeOrder : undefined,
        ),
      ]),
    ) as Partial<Record<AnalyticsSectionId, ReturnType<typeof optionalFieldAnalytics>>>;
  }, [trades]);
  const sectionHasData = (id: AnalyticsSectionId) => {
    if (id === "highlights")
      return (
        r.reviewedTrades < r.totalTrades ||
        r.plannedVsAchieved.sampleSize >= 3 ||
        r.mistakes.some((item) => item.count >= 3 && (item.netR ?? 0) < 0)
      );
    if (id === "equity_curve") return r.equity.length > 1;
    if (id === "planned_vs_achieved") return r.plannedVsAchieved.sampleSize > 0;
    if (id === "session") return r.sessions.some((item) => item.count > 0);
    if (id === "day") return true;
    if (id === "direction") return r.directions.some((item) => item.count > 0);
    if (id === "killzone") return r.killzoneDiscipline.total > 0;
    if (id === "category") return r.categories.length > 0;
    if (id === "instrument") return r.instruments.length > 0;
    if (id === "mistakes") return r.mistakes.length > 0;
    if (id === "emotions") return r.emotions.items.length > 0;
    if (id === "grade") return r.grades.some((item) => item.count > 0);
    return (optionalRows[id]?.length ?? 0) > 0;
  };
  const availableGroups = ANALYTICS_REPORT_GROUPS.filter((item) =>
    ANALYTICS_SECTION_DEFINITIONS.some(
      (section) =>
        section.group === item.id && visible.has(section.id) && sectionHasData(section.id),
    ),
  );
  useEffect(() => {
    if (!availableGroups.some((item) => item.id === group))
      setGroup(availableGroups[0]?.id ?? "overview");
  }, [availableGroups, group]);

  const reviewGap = Math.max(0, r.totalTrades - r.reviewedTrades);
  const highlights = [
    reviewGap > 0
      ? {
          title: "Review gap",
          body: `${reviewGap} ${reviewGap === 1 ? "trade needs" : "trades need"} a completed review.`,
          target: "process_review" as const,
        }
      : null,
    r.plannedVsAchieved.sampleSize >= 3 && r.plannedVsAchieved.avgGap != null
      ? {
          title: "Plan versus result",
          body: `Achieved R is ${signedR(r.plannedVsAchieved.avgGap)} against plan across ${r.plannedVsAchieved.sampleSize} paired trades.`,
          target: "process_review" as const,
        }
      : null,
    r.mistakes.find((item) => item.count >= 3 && (item.netR ?? 0) < 0)
      ? (() => {
          const item = r.mistakes.find((entry) => entry.count >= 3 && (entry.netR ?? 0) < 0)!;
          return {
            title: "Repeated execution issue",
            body: `${item.name} occurred ${item.count} times with ${signedR(item.netR)} associated Net R.`,
            target: "process_review" as const,
          };
        })()
      : null,
  ]
    .filter(Boolean)
    .slice(0, 3) as { title: string; body: string; target: AnalyticsReportGroup }[];
  const summary = {
    total_trades: {
      label: "Total Trades",
      value: String(r.totalTrades),
      tone: "text-foreground",
      context: "Recorded in this view",
    },
    win_rate: {
      label: "Win Rate",
      value: r.winRate == null ? "—" : `${r.winRate.toFixed(1)}%`,
      tone: "text-foreground",
      context: `${r.resultCompleteCount} complete results`,
    },
    net_r: {
      label: "Net R",
      value: signedR(r.totalR),
      tone: rColor(r.totalR),
      context: `${r.resultCompleteCount} R-complete trades`,
    },
    avg_r: {
      label: "Avg R",
      value: signedR(r.avgRR),
      tone: rColor(r.avgRR),
      context: `${r.resultCompleteCount} R-complete trades`,
    },
    completed_reviews: {
      label: "Completed Reviews",
      value: `${r.reviewedTrades} / ${r.totalTrades}`,
      tone: "text-foreground",
      context: `${reviewGap} remaining`,
    },
    profit_factor: {
      label: "Profit Factor",
      value: r.profitFactor == null ? "—" : r.profitFactor.toFixed(2),
      tone: "text-foreground",
      context: `${r.resultCompleteCount} complete results`,
    },
  } as const;
  const summaryCards = preferences.summaryCards.filter(
    (id) => id !== "profit_factor" && (rPerformanceEnabled || (id !== "net_r" && id !== "avg_r")),
  );
  const populatedSessions = r.sessions
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.count > 0)
    .sort((a, b) => b.item.count - a.item.count || a.index - b.index)
    .map(({ item }) => item);
  const sessionRows = populatedSessions.filter((item) =>
    item.name.toLowerCase().includes(sessionSearch.toLowerCase()),
  );
  const renderBucket = (
    id: AnalyticsSectionId,
    title: string,
    rows: { name: string; count: number; winRate: number | null; netR: number | null }[],
    variant: "default" | "issue" | "instrument" | "tag" = "default",
  ) =>
    visible.has(id) && sectionHasData(id) ? (
      <section key={id} className="section-card rounded-2xl p-5">
        <ReportSectionHeader id={id} title={title} />
        <CompactBucketRows
          rows={rows}
          rPerformanceEnabled={rPerformanceEnabled}
          variant={variant}
        />
      </section>
    ) : null;

  return (
    <div className="mt-6 space-y-5">
      <div
        className={cn(
          "grid grid-cols-1 gap-3 sm:grid-cols-2",
          countAwareGridClass(summaryCards.length),
        )}
      >
        {summaryCards.map((id) => {
          const Icon = SUMMARY_ICON_BY_ID[id];
          return (
            <div key={id} className="glow-card flex min-h-32 flex-col rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {summary[id].label}
                </p>
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/[0.09] text-primary ring-1 ring-primary/15">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p
                className={cn(
                  "mt-3 font-display text-3xl font-semibold tracking-tight tabular-nums",
                  summary[id].tone,
                )}
              >
                {summary[id].value}
              </p>
              <p className="mt-auto pt-2 text-xs text-muted-foreground">{summary[id].context}</p>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/[0.025] px-4 py-3 text-sm text-muted-foreground ring-1 ring-white/[0.06]">
        <span>
          {r.totalTrades} {r.totalTrades === 1 ? "trade" : "trades"}
        </span>
        <span aria-hidden className="h-4 border-l border-white/[0.12]" />
        <span>{r.resultCompleteCount} with Risk and P/L</span>
        <span aria-hidden className="h-4 border-l border-white/[0.12]" />
        <span>
          {r.reviewedTrades} completed {r.reviewedTrades === 1 ? "review" : "reviews"}
        </span>
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
        >
          <Lightbulb className="size-3.5" aria-hidden="true" />
          Analytics information
        </button>
      </div>
      <div
        className="flex gap-1 overflow-x-auto rounded-xl bg-white/[0.025] p-1 ring-1 ring-white/[0.06]"
        role="tablist"
        aria-label="Analytics report groups"
      >
        {availableGroups.map((item) => {
          const Icon = GROUP_ICON_BY_ID[item.id];
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={group === item.id}
              onClick={() => setGroup(item.id)}
              className={cn(
                "inline-flex whitespace-nowrap items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                group === item.id
                  ? "bg-primary/[0.12] text-foreground ring-1 ring-primary/20"
                  : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>
      {group === "overview" && (
        <div className="space-y-5">
          {visible.has("highlights") && highlights.length > 0 && (
            <section className="section-card rounded-2xl p-5">
              <ReportSectionHeader
                id="highlights"
                title="Highlights"
                description="The clearest actions surfaced from the current report."
              />
              <div
                className={cn(
                  "mt-4 grid gap-3",
                  highlights.length === 1 && "max-w-2xl",
                  highlights.length === 2 && "sm:grid-cols-2",
                  highlights.length >= 3 && "md:grid-cols-3",
                )}
              >
                {highlights.map((item) => {
                  const HighlightIcon =
                    item.title === "Review gap"
                      ? ListChecks
                      : item.title === "Plan versus result"
                        ? ArrowLeftRight
                        : AlertTriangle;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setGroup(item.target)}
                      className="group rounded-xl bg-white/[0.025] p-4 text-left ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                    >
                      <span className="flex size-8 items-center justify-center rounded-lg bg-primary/[0.08] text-primary">
                        <HighlightIcon className="size-4" aria-hidden="true" />
                      </span>
                      <p className="mt-3 text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.body}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {visible.has("equity_curve") && (
            <section className="section-card rounded-2xl p-5">
              <ReportSectionHeader
                id="equity_curve"
                title="Equity Curve"
                description="Cumulative realized R from complete trade results."
                meta={`${r.resultCompleteCount} R-complete trades`}
              />
              {r.equity.length > 1 ? (
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={r.equity.filter((point) => point.d !== "0")}
                      margin={{ top: 8, right: 6, bottom: 0, left: -16 }}
                    >
                      <defs>
                        <linearGradient id="edge-r" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        stroke="rgba(255,255,255,.07)"
                        strokeDasharray="3 5"
                      />
                      <XAxis
                        dataKey="d"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "rgba(255,255,255,.38)", fontSize: 11 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "rgba(255,255,255,.38)", fontSize: 11 }}
                        tickFormatter={(value) => `${value}R`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "oklch(0.13 0.018 270)",
                          border: "1px solid rgba(255,255,255,.1)",
                          borderRadius: 10,
                        }}
                        formatter={(value) => [`${Number(value).toFixed(2)}R`, "Equity"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="var(--primary)"
                        fill="url(#edge-r)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: "var(--primary)", strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <SimpleSectionState>
                  R data becomes available after a completed result includes Risk and P/L.
                </SimpleSectionState>
              )}
            </section>
          )}
        </div>
      )}
      {group === "process_review" && (
        <div className="space-y-5">
          {visible.has("planned_vs_achieved") && r.plannedVsAchieved.sampleSize > 0 && (
            <section className="section-card rounded-2xl p-5">
              <ReportSectionHeader
                id="planned_vs_achieved"
                title="Planned vs Achieved R"
                description="Average planned risk-reward compared with the recorded result."
                meta={`${r.plannedVsAchieved.sampleSize} paired ${
                  r.plannedVsAchieved.sampleSize === 1 ? "trade" : "trades"
                }`}
              />
              <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="rounded-xl bg-primary/[0.045] p-4 ring-1 ring-primary/12">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Average planned
                  </p>
                  <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-primary">
                    {signedR(r.plannedVsAchieved.plannedAvg)}
                  </p>
                </div>
                <span
                  className="hidden items-center text-muted-foreground/55 sm:flex"
                  aria-hidden="true"
                >
                  <ArrowLeftRight className="size-5" />
                </span>
                <div className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.06]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Average achieved
                  </p>
                  <p
                    className={cn(
                      "mt-2 font-display text-2xl font-semibold tabular-nums",
                      rColor(r.plannedVsAchieved.achievedAvg),
                    )}
                  >
                    {signedR(r.plannedVsAchieved.achievedAvg)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-white/[0.025] px-4 py-3 ring-1 ring-white/[0.06]">
                <div>
                  <p className="text-xs font-semibold">Average gap</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Achieved minus planned</p>
                </div>
                <p
                  className={cn(
                    "font-display text-xl font-semibold tabular-nums",
                    rColor(r.plannedVsAchieved.avgGap),
                  )}
                >
                  {signedR(r.plannedVsAchieved.avgGap)}
                </p>
              </div>
            </section>
          )}
          {renderBucket(
            "mistakes",
            "Execution Issues",
            r.mistakes.map((item) => ({
              name: item.name,
              count: item.count,
              winRate: null,
              netR: item.netR,
            })),
            "issue",
          )}
          {visible.has("emotions") && r.emotions.items.length > 0 && (
            <section className="section-card rounded-2xl p-5">
              <ReportSectionHeader
                id="emotions"
                title="Emotion Insights"
                description="Mindset tags recorded across the selected trades."
              />
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {r.emotions.items.slice(0, 6).map((item) => (
                  <div
                    key={item.key}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]"
                  >
                    <span className="text-lg leading-none" aria-hidden="true">
                      {item.emoji}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.count} {item.count === 1 ? "trade" : "trades"}
                      </p>
                    </div>
                    <span className={cn("text-sm font-semibold tabular-nums", rColor(item.avgR))}>
                      {signedR(item.avgR)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {renderBucket(
            "grade",
            "Trade Grade",
            r.grades
              .filter((item) => item.count > 0)
              .map((item) => ({
                name: item.name,
                count: item.count,
                winRate: null,
                netR: item.avgR,
              })),
          )}
          {(["exit_reason", "trade_management"] as AnalyticsSectionId[]).map((id) =>
            renderBucket(
              id,
              ANALYTICS_SECTION_DEFINITIONS.find((item) => item.id === id)!.label,
              (optionalRows[id] ?? []).map((item) => ({
                name: item.value,
                count: item.count,
                winRate: item.winRate,
                netR: item.avgR,
              })),
            ),
          )}
        </div>
      )}
      {group === "performance_patterns" && (
        <div className="space-y-5">
          {visible.has("session") && populatedSessions.length > 0 && (
            <section className="section-card rounded-2xl p-5">
              <ReportSectionHeader
                id="session"
                title="Session Performance"
                description="Discrete results by recorded trading session."
                action={
                  populatedSessions.length > 4 ? (
                    <button
                      type="button"
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                      onClick={() => setShowAllSessions(true)}
                    >
                      View all
                    </button>
                  ) : null
                }
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {populatedSessions.slice(0, 4).map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-expanded={expandedSession === item.name}
                    onClick={() =>
                      setExpandedSession((current) => (current === item.name ? null : item.name))
                    }
                    className="group rounded-xl bg-white/[0.025] p-4 text-left ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-semibold">{item.name}</span>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-semibold tabular-nums",
                          rColor(item.netR),
                        )}
                      >
                        {signedR(item.netR)}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <ResultBlocks
                        wins={item.wins}
                        losses={item.losses}
                        breakeven={item.breakeven}
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.count} {item.count === 1 ? "trade" : "trades"}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "grid max-h-0 grid-cols-2 gap-x-3 overflow-hidden text-xs text-muted-foreground opacity-0 transition-[max-height,opacity,margin] duration-200 group-hover:mt-3 group-hover:max-h-12 group-hover:opacity-100 group-focus-visible:mt-3 group-focus-visible:max-h-12 group-focus-visible:opacity-100",
                        expandedSession === item.name && "mt-3 max-h-12 opacity-100",
                      )}
                    >
                      <span>
                        {item.wins}W · {item.losses}L · {item.breakeven}BE
                      </span>
                      <span className="text-right">
                        {item.winRate == null ? "—" : `${item.winRate.toFixed(1)}%`} win ·{" "}
                        {signedR(item.avgRR)} Avg R
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {visible.has("day") && (
            <section className="section-card rounded-2xl p-5">
              <ReportSectionHeader
                id="day"
                title="Day Performance"
                description="The full Monday–Sunday week, based on each trade's stored date."
              />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                {r.weekdays.map((item) => (
                  <div
                    key={item.name}
                    className={cn(
                      "rounded-xl p-3 ring-1",
                      item.count > 0
                        ? "bg-white/[0.03] ring-white/[0.07]"
                        : "bg-white/[0.012] text-muted-foreground/65 ring-white/[0.035]",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold">{item.name.slice(0, 3)}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {item.count}
                      </span>
                    </div>
                    {item.count > 0 ? (
                      <>
                        <div className="mt-3">
                          <ResultBlocks
                            wins={item.wins}
                            losses={item.losses}
                            breakeven={item.breakeven}
                            limit={8}
                          />
                        </div>
                        <p className="mt-2 flex items-center justify-between gap-1 text-[10px] tabular-nums">
                          <span className={cn("font-semibold", rColor(item.netR))}>
                            {signedR(item.netR)}
                          </span>
                          <span className="text-muted-foreground">
                            {item.winRate == null ? "—" : `${item.winRate.toFixed(0)}%`}
                          </span>
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-[10px]">No trades</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          {renderBucket(
            "direction",
            "Direction Performance",
            r.directions
              .filter((item) => item.count > 0)
              .map((item) => ({
                name: item.name,
                count: item.count,
                winRate: item.winRate,
                netR: item.netR,
              })),
          )}
          {visible.has("killzone") && r.killzoneDiscipline.total > 0 && (
            <section className="section-card rounded-2xl p-5">
              <ReportSectionHeader
                id="killzone"
                title="Killzone Performance"
                description="A neutral comparison of explicitly recorded Yes and No values."
              />
              <CompactBucketRows
                rPerformanceEnabled={rPerformanceEnabled}
                rows={[
                  {
                    name: "Recorded in Killzone",
                    count: r.killzoneDiscipline.inCount,
                    winRate: r.killzoneDiscipline.inWinRate,
                    netR: r.killzoneDiscipline.inNetR,
                  },
                  {
                    name: "Recorded outside Killzone",
                    count: r.killzoneDiscipline.outCount,
                    winRate: r.killzoneDiscipline.outWinRate,
                    netR: r.killzoneDiscipline.outNetR,
                  },
                ]}
              />
            </section>
          )}
          {renderBucket(
            "category",
            "Category Performance",
            r.categories.map((item) => ({
              name: item.name,
              count: item.trades,
              winRate: item.winRate,
              netR: item.netR,
            })),
          )}
          {renderBucket(
            "instrument",
            "Instrument Performance",
            r.instruments.map((item) => ({
              name: item.name,
              count: item.count,
              winRate: item.winRate,
              netR: item.netR,
            })),
            "instrument",
          )}
        </div>
      )}
      {group === "trade_context" && (
        <div className="space-y-5">
          {(
            [
              "entry_model",
              "market_condition",
              "entry_timeframe",
              "news_involvement",
              "custom_tags",
            ] as AnalyticsSectionId[]
          ).map((id) =>
            renderBucket(
              id,
              ANALYTICS_SECTION_DEFINITIONS.find((item) => item.id === id)!.label,
              (optionalRows[id] ?? []).map((item) => ({
                name: item.value,
                count: item.count,
                winRate: item.winRate,
                netR: item.netR,
              })),
              id === "custom_tags" ? "tag" : "default",
            ),
          )}
        </div>
      )}
      {guideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Analytics Guide"
          className="fixed inset-0 z-[60] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-xl overscroll-contain rounded-2xl border border-white/[0.1] bg-[oklch(0.13_0.018_270)] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Analytics Guide</h2>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                aria-label="Close Analytics Guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/[0.09] text-primary">
                  <CalendarRange className="size-4" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">Scope</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Reports use the selected account and period.
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/[0.09] text-primary">
                  <ListChecks className="size-4" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">Data completeness</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Result-complete trades power win/loss results. R-complete trades also have a valid
                  result, Risk and P/L. Completed Reviews use the durable review completion record.
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/[0.09] text-primary">
                  <Sigma className="size-4" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">Missing R</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Missing R is unavailable—not zero—so it does not distort Net R, Avg R, or the
                  equity curve.
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/[0.09] text-primary">
                  <Lightbulb className="size-4" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">Interpreting reports</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Reports without relevant data stay hidden. Interpret small samples carefully.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {showAllSessions && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="All sessions"
          className="fixed inset-0 z-[60] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-[oklch(0.13_0.018_270)] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">All Sessions</h2>
              <button
                type="button"
                onClick={() => setShowAllSessions(false)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                aria-label="Close all sessions"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {populatedSessions.length > 8 && (
              <SearchInput
                value={sessionSearch}
                onValueChange={setSessionSearch}
                placeholder="Search sessions"
                aria-label="Search sessions"
                wrapperClassName="mt-4"
                className="h-9 rounded-lg border border-white/[0.1] text-sm"
              />
            )}
            <div className="mt-4 space-y-3">
              {sessionRows.map((item) => (
                <div
                  key={item.name}
                  className="rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]"
                >
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{item.count} trades</span>
                    <span className={cn("text-sm tabular-nums", rColor(item.netR))}>
                      {signedR(item.netR)}
                    </span>
                  </div>
                  <div className="mt-3">
                    <ResultBlocks
                      wins={item.wins}
                      losses={item.losses}
                      breakeven={item.breakeven}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.wins} wins · {item.losses} losses · {item.breakeven} breakevens ·{" "}
                    {item.winRate == null ? "—" : `${item.winRate.toFixed(1)}%`} win rate ·{" "}
                    {signedR(item.avgRR)} Avg R
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RestoredAnalyticsReportExperience({
  r,
  trades,
  tracking,
  preferences,
  rPerformanceEnabled,
}: {
  r: Report;
  trades: DbTrade[];
  tracking: ReturnType<typeof journalTrackingFromPreferences>;
  preferences: AnalyticsPreferences;
  rPerformanceEnabled: boolean;
}) {
  const [group, setGroup] = useState<AnalyticsReportGroup>("overview");
  const [guideOpen, setGuideOpen] = useState(false);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [showAllDays, setShowAllDays] = useState(false);
  const [showAllEmotions, setShowAllEmotions] = useState(false);
  const visible = useMemo(
    () => new Set(visibleAnalyticsSections(preferences, tracking, rPerformanceEnabled)),
    [preferences, rPerformanceEnabled, tracking],
  );
  const optionalRows = useMemo(() => {
    const values: Partial<Record<AnalyticsSectionId, (trade: DbTrade) => string[]>> = {
      entry_model: (trade) => (trade.entry_model ? [trade.entry_model] : []),
      market_condition: (trade) => (trade.market_condition ? [trade.market_condition] : []),
      entry_timeframe: (trade) => (trade.entry_timeframe ? [trade.entry_timeframe] : []),
      news_involvement: (trade) => (trade.news_involvement ? [trade.news_involvement] : []),
      exit_reason: (trade) => (trade.exit_reason ? [trade.exit_reason] : []),
      trade_management: (trade) => trade.trade_management ?? [],
      custom_tags: (trade) => trade.custom_tags ?? [],
    };
    return Object.fromEntries(
      Object.entries(values).map(([id, value]) => [
        id,
        optionalFieldAnalytics(
          trades,
          value!,
          id === "entry_timeframe" ? stableTimeframeOrder : undefined,
        ),
      ]),
    ) as Partial<Record<AnalyticsSectionId, ReturnType<typeof optionalFieldAnalytics>>>;
  }, [trades]);

  const reviewGap = Math.max(0, r.totalTrades - r.reviewedTrades);
  const highlights = [
    reviewGap > 0
      ? {
          title: "Review gap",
          body: `${reviewGap} ${reviewGap === 1 ? "trade needs" : "trades need"} a completed review.`,
          target: "process_review" as const,
        }
      : null,
    r.plannedVsAchieved.sampleSize >= 3 && r.plannedVsAchieved.avgGap != null
      ? {
          title: "Plan versus result",
          body: `Achieved R is ${signedR(r.plannedVsAchieved.avgGap)} against plan across ${r.plannedVsAchieved.sampleSize} paired trades.`,
          target: "process_review" as const,
        }
      : null,
    r.mistakes.find((item) => item.count >= 3 && (item.netR ?? 0) < 0)
      ? (() => {
          const item = r.mistakes.find((entry) => entry.count >= 3 && (entry.netR ?? 0) < 0)!;
          return {
            title: "Repeated execution issue",
            body: `${item.name} occurred ${item.count} times with ${signedR(item.netR)} associated Net R.`,
            target: "process_review" as const,
          };
        })()
      : null,
  ]
    .filter(Boolean)
    .slice(0, 3) as { title: string; body: string; target: AnalyticsReportGroup }[];

  const sectionHasData = (id: AnalyticsSectionId) => {
    if (id === "highlights") return highlights.length > 0;
    if (id === "equity_curve") return true;
    if (id === "planned_vs_achieved") return r.plannedVsAchieved.sampleSize > 0;
    if (id === "session") return r.sessions.some((item) => item.count > 0);
    if (id === "day") return true;
    if (id === "direction") return r.coverage.directions > 0;
    if (id === "killzone") return r.killzoneDiscipline.total > 0;
    if (id === "category") return r.categories.length > 0;
    if (id === "instrument") return r.instruments.length > 0;
    if (id === "mistakes") return r.mistakes.length > 0;
    if (id === "emotions") return r.emotions.items.length > 0;
    if (id === "grade") return r.grades.some((item) => item.count > 0);
    return (optionalRows[id]?.length ?? 0) > 0;
  };
  const availableGroups = ANALYTICS_REPORT_GROUPS.filter((item) =>
    ANALYTICS_SECTION_DEFINITIONS.some(
      (section) =>
        section.group === item.id && visible.has(section.id) && sectionHasData(section.id),
    ),
  );
  useEffect(() => {
    if (!availableGroups.some((item) => item.id === group))
      setGroup(availableGroups[0]?.id ?? "overview");
  }, [availableGroups, group]);

  if (r.totalTrades === 0) {
    return (
      <div className="mt-6">
        <PremiumEmptyState
          icon={BarChart3}
          title="No trades in this period yet"
          description="Choose another report period or log a trade to populate analytics."
        />
      </div>
    );
  }

  const summaryCards = preferences.summaryCards.filter(
    (id) => id !== "profit_factor" && (rPerformanceEnabled || (id !== "net_r" && id !== "avg_r")),
  );
  const renderSummaryCard = (id: (typeof summaryCards)[number]) => {
    if (id === "total_trades")
      return (
        <Kpi key={id} icon={BarChart3} label="TOTAL TRADES" value={r.totalTrades} tone="info" />
      );
    if (id === "win_rate")
      return (
        <Kpi
          key={id}
          icon={Target}
          label="WIN RATE"
          value={r.winRate ?? 0}
          displayValue={r.winRate == null ? "—" : undefined}
          decimals={1}
          suffix="%"
          tone="primary"
        />
      );
    if (id === "net_r")
      return (
        <Kpi
          key={id}
          icon={TrendingUp}
          label="NET R"
          value={r.totalR ?? 0}
          displayValue={r.totalR == null ? "—" : undefined}
          decimals={2}
          suffix="R"
          tone={kpiToneForNumber(r.totalR)}
        />
      );
    if (id === "avg_r")
      return (
        <Kpi
          key={id}
          icon={Scale}
          label="AVG R"
          value={r.avgRR ?? 0}
          displayValue={r.avgRR == null ? "—" : undefined}
          decimals={2}
          suffix="R"
          tone={kpiToneForNumber(r.avgRR)}
        />
      );
    return (
      <Kpi
        key={id}
        icon={ClipboardCheck}
        label="COMPLETED REVIEWS"
        value={0}
        displayValue={`${r.reviewedTrades} / ${r.totalTrades}`}
        tone="success"
      />
    );
  };
  const populatedSessions = r.sessions
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.count > 0)
    .sort((a, b) => b.item.count - a.item.count || a.index - b.index)
    .map(({ item }) => item);
  const sessionRows = populatedSessions.filter((item) =>
    item.name.toLowerCase().includes(sessionSearch.toLowerCase()),
  );
  const selectedSession = populatedSessions.find((item) => item.name === expandedSession) ?? null;
  const hasUsefulEquity = r.resultCompleteCount >= 3 && r.equity.length > 1;
  const sectionOrder = (id: AnalyticsSectionId) => {
    const index = preferences.order.indexOf(id);
    return index === -1 ? preferences.order.length : index;
  };
  const optionalSection = (id: AnalyticsSectionId) => {
    const rows = optionalRows[id] ?? [];
    if (!visible.has(id) || rows.length === 0) return null;
    return (
      <CompactReportSection
        key={id}
        id={id}
        title={ANALYTICS_SECTION_DEFINITIONS.find((item) => item.id === id)!.label}
        rows={rows.map((item) => ({
          name: item.value,
          count: item.count,
          winRate: item.winRate,
          netR: item.netR,
          avgR: item.avgR,
          rCount: item.rCount,
        }))}
        rPerformanceEnabled={rPerformanceEnabled}
        tagNames={id === "custom_tags"}
        order={sectionOrder(id)}
      />
    );
  };

  return (
    <div className="mt-6 space-y-4">
      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2",
          countAwareGridClass(summaryCards.length),
        )}
      >
        {summaryCards.map(renderSummaryCard)}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2 text-xs leading-5 text-muted-foreground">
        <p>
          Results recorded for {r.coverage.results} of {r.totalTrades} trades
          {rPerformanceEnabled && (
            <>
              <span aria-hidden> · </span>R metrics based on {r.resultCompleteCount} of{" "}
              {r.totalTrades}
            </>
          )}
          <span aria-hidden> · </span>
          {r.reviewedTrades} of {r.totalTrades} trades reviewed
        </p>
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
        >
          <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
          Analytics information
        </button>
      </div>

      <div
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06]"
        role="tablist"
        aria-label="Analytics report groups"
      >
        {availableGroups.map((item) => {
          const Icon = GROUP_ICON_BY_ID[item.id];
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={group === item.id}
              onClick={() => setGroup(item.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                group === item.id
                  ? "bg-primary/12 text-foreground ring-1 ring-primary/25"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>

      {group === "overview" && (
        <div className="flex flex-col gap-4">
          {visible.has("highlights") && highlights.length > 0 && (
            <section
              className="section-card rounded-2xl p-5"
              style={{ order: sectionOrder("highlights") }}
            >
              <ReportSectionHeader id="highlights" title="Highlights" />
              <div
                className={cn(
                  "mt-4 grid grid-cols-1 gap-3",
                  countAwareGridClass(highlights.length),
                )}
              >
                {highlights.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => setGroup(item.target)}
                    className="rounded-xl bg-white/[0.025] p-4 text-left ring-1 ring-white/[0.04] transition-colors hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {item.title}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-foreground/85">{item.body}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {visible.has("equity_curve") && (
            <section
              className="section-card rounded-2xl p-5"
              style={{ order: sectionOrder("equity_curve") }}
            >
              <ReportSectionHeader id="equity_curve" title="Equity curve" />
              <div className={cn("mt-4", hasUsefulEquity ? "h-[280px]" : "h-[152px]")}>
                {!hasUsefulEquity ? (
                  <ChartLowDataState
                    icon={TrendingUp}
                    title={`${Math.max(0, 3 - r.resultCompleteCount)} more realised-R trade${Math.max(0, 3 - r.resultCompleteCount) === 1 ? "" : "s"} needed`}
                    description="Add risk and P/L."
                  />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={r.equity} margin={{ top: 10, right: 8, left: -16, bottom: 8 }}>
                      <defs>
                        <linearGradient id="restored-equity" x1="0" y1="0" x2="0" y2="1">
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
                        fill="url(#restored-equity)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {group === "process_review" && (
        <div className="flex flex-col gap-4">
          {visible.has("planned_vs_achieved") && r.plannedVsAchieved.sampleSize > 0 && (
            <section
              className="section-card rounded-2xl p-5"
              style={{ order: sectionOrder("planned_vs_achieved") }}
            >
              <ReportSectionHeader id="planned_vs_achieved" title="Planned vs Achieved R" />
              <SampleStatus count={r.plannedVsAchieved.sampleSize} noun="paired trades" />
              <p className="mt-2 text-xs text-muted-foreground">
                Based on {r.plannedVsAchieved.sampleSize} paired trade
                {r.plannedVsAchieved.sampleSize === 1 ? "" : "s"} with planned and realised R.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
                  <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    PLANNED AVG
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {r.plannedVsAchieved.plannedAvg == null
                      ? "—"
                      : `${r.plannedVsAchieved.plannedAvg.toFixed(2)}R`}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Average planned R:R</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
                  <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    ACHIEVED AVG
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-2xl font-bold tabular-nums",
                      rColor(r.plannedVsAchieved.achievedAvg),
                    )}
                  >
                    {signedR(r.plannedVsAchieved.achievedAvg)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Same paired trades</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/[0.05]">
                  <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                    EXECUTION GAP
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-2xl font-bold tabular-nums",
                      rColor(r.plannedVsAchieved.avgGap),
                    )}
                  >
                    {signedR(r.plannedVsAchieved.avgGap)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Achieved − planned</div>
                </div>
              </div>
            </section>
          )}

          {visible.has("mistakes") && r.mistakes.length > 0 && (
            <ExecutionIssueRows
              rows={r.mistakes}
              rPerformanceEnabled={rPerformanceEnabled}
              order={sectionOrder("mistakes")}
            />
          )}

          {visible.has("emotions") && r.emotions.items.length > 0 && (
            <section
              className="section-card rounded-2xl p-5"
              style={{ order: sectionOrder("emotions") }}
            >
              <ReportSectionHeader
                id="emotions"
                title="Emotion insights"
                action={
                  r.emotions.items.length > 4 ? (
                    <button
                      type="button"
                      aria-expanded={showAllEmotions}
                      onClick={() => setShowAllEmotions((current) => !current)}
                      className="text-xs font-semibold text-primary transition-colors hover:text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                    >
                      {showAllEmotions ? "Show less" : "View all →"}
                    </button>
                  ) : null
                }
              />
              <SampleStatus count={r.coverage.emotions} />
              <CoverageNote
                label="Emotion recorded"
                count={r.coverage.emotions}
                total={r.totalTrades}
              />
              <div className="mt-4 overflow-x-auto">
                <table className={cn("w-full text-sm", rPerformanceEnabled && "min-w-[560px]")}>
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="py-2.5 pr-4">Emotion</th>
                      <th className="py-2.5 pr-4 text-right">Count</th>
                      <th className="py-2.5 pr-4 text-right">Win rate</th>
                      {rPerformanceEnabled && (
                        <>
                          <th className="py-2.5 pr-4 text-right">Avg R</th>
                          <th className="py-2.5 text-right">Net R</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {r.emotions.items
                      .slice(0, showAllEmotions ? r.emotions.items.length : 4)
                      .map((item) => (
                        <tr
                          key={item.key}
                          className="border-b border-white/[0.04] transition-colors last:border-0 hover:bg-white/[0.03]"
                        >
                          <td className="py-3.5 pr-4 font-semibold">
                            <span className="mr-2" aria-hidden="true">
                              {item.emoji}
                            </span>
                            {item.label}
                          </td>
                          <td className="py-3.5 pr-4 text-right tabular-nums">{item.count}</td>
                          <td className="py-3.5 pr-4 text-right tabular-nums">
                            {item.winRate == null ? "—" : `${item.winRate.toFixed(1)}%`}
                          </td>
                          {rPerformanceEnabled && (
                            <>
                              <td
                                className={cn(
                                  "py-3.5 pr-4 text-right font-semibold tabular-nums",
                                  rColor(item.avgR),
                                )}
                              >
                                {signedR(item.avgR)}
                              </td>
                              <td
                                className={cn(
                                  "py-3.5 text-right font-semibold tabular-nums",
                                  rColor(item.netR),
                                )}
                              >
                                {signedR(item.netR)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {visible.has("grade") && r.grades.some((item) => item.count > 0) && (
            <section
              className="section-card rounded-2xl p-5"
              style={{ order: sectionOrder("grade") }}
            >
              <ReportSectionHeader id="grade" title="Grade distribution" />
              <SampleStatus count={r.coverage.grades} />
              <CoverageNote
                label="Grade recorded"
                count={r.coverage.grades}
                total={r.totalTrades}
              />
              <div className="mt-4 space-y-1.5">
                {r.grades
                  .filter((grade) => grade.count > 0)
                  .map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between rounded-xl bg-white/[0.025] px-3.5 py-2.5 ring-1 ring-white/[0.04]"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "w-7 text-sm font-bold",
                            item.name === "A+" || item.name === "A"
                              ? "text-warning"
                              : item.name === "B+" || item.name === "B"
                                ? "text-foreground"
                                : "text-muted-foreground",
                          )}
                        >
                          {item.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.count} {item.count === 1 ? "trade" : "trades"}
                        </span>
                      </div>
                      {rPerformanceEnabled && (
                        <span
                          className={cn("text-xs font-semibold tabular-nums", rColor(item.avgR))}
                        >
                          {item.avgR == null ? "—" : `${signedR(item.avgR)} avg`}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          )}

          {optionalSection("trade_management")}
          {optionalSection("exit_reason")}
        </div>
      )}

      {group === "performance_patterns" && (
        <div className="flex flex-col gap-4">
          {visible.has("session") && populatedSessions.length > 0 && (
            <section
              className="section-card rounded-2xl p-5"
              style={{ order: sectionOrder("session") }}
            >
              <ReportSectionHeader
                id="session"
                title="Session performance breakdown"
                action={
                  populatedSessions.length > 4 ? (
                    <button
                      type="button"
                      onClick={() => setShowAllSessions(true)}
                      className="text-xs font-semibold text-primary transition-colors hover:text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                    >
                      View all →
                    </button>
                  ) : null
                }
              />
              <SampleStatus count={r.coverage.sessions} />
              <CoverageNote
                label="Session recorded"
                count={r.coverage.sessions}
                total={r.totalTrades}
              />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {populatedSessions.slice(0, 4).map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-expanded={expandedSession === item.name}
                    onClick={() =>
                      setExpandedSession((current) => (current === item.name ? null : item.name))
                    }
                    className={cn(
                      "rounded-xl px-3.5 py-3 text-left ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                      expandedSession === item.name
                        ? "bg-primary/10 ring-primary/30"
                        : "bg-white/[0.025] ring-white/[0.04] hover:bg-white/[0.045]",
                    )}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold">{item.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {item.count} {item.count === 1 ? "trade" : "trades"}
                      </span>
                    </span>
                    <span className="mt-3 flex">
                      <ResultBlocks
                        wins={item.wins}
                        losses={item.losses}
                        breakeven={item.breakeven}
                      />
                    </span>
                    <span className="mt-2 flex gap-4 text-xs text-muted-foreground">
                      <span>{item.winRate == null ? "—" : `${item.winRate.toFixed(0)}% WR`}</span>
                      {rPerformanceEnabled && (
                        <span className={rColor(item.netR)}>{signedR(item.netR)} net</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {selectedSession && (
                <div className="mt-4 rounded-xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.04]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                    Session Detail: {selectedSession.name}
                  </div>
                  <div
                    className={cn(
                      "mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs",
                      rPerformanceEnabled && "sm:grid-cols-4",
                    )}
                  >
                    <div>
                      <div className="text-muted-foreground/70">Trades</div>
                      <div className="mt-0.5 font-bold">{selectedSession.count}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground/70">Win rate</div>
                      <div className="mt-0.5 font-bold">
                        {selectedSession.winRate == null
                          ? "—"
                          : `${selectedSession.winRate.toFixed(1)}%`}
                      </div>
                    </div>
                    {rPerformanceEnabled && (
                      <>
                        <div>
                          <div className="text-muted-foreground/70">Net R</div>
                          <div className={cn("mt-0.5 font-bold", rColor(selectedSession.netR))}>
                            {signedR(selectedSession.netR)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground/70">Avg R</div>
                          <div className={cn("mt-0.5 font-bold", rColor(selectedSession.avgRR))}>
                            {signedR(selectedSession.avgRR)}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {visible.has("day") && (
            <section
              className="section-card rounded-2xl p-5"
              style={{ order: sectionOrder("day") }}
            >
              <ReportSectionHeader
                id="day"
                title="Day performance"
                action={
                  <button
                    type="button"
                    aria-expanded={showAllDays}
                    onClick={() => setShowAllDays((current) => !current)}
                    className="text-xs font-semibold text-primary transition-colors hover:text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                  >
                    {showAllDays ? "Show less" : "View all →"}
                  </button>
                }
              />
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {r.weekdays.slice(0, showAllDays ? 7 : 3).map((item) => (
                  <div
                    key={item.name}
                    className={cn(
                      "rounded-xl p-3.5 ring-1",
                      item.count > 0
                        ? "bg-white/[0.025] ring-white/[0.04]"
                        : "bg-white/[0.015] ring-white/[0.025]",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold tracking-[0.16em] text-foreground/80">
                        {item.name.slice(0, 3).toUpperCase()}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {item.count > 0 ? `${item.count} trade${item.count === 1 ? "" : "s"}` : ""}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "mt-2 text-2xl font-bold tabular-nums",
                        item.count === 0 ? "text-muted-foreground/45" : "text-foreground/85",
                      )}
                    >
                      {item.winRate == null ? "—" : `${item.winRate.toFixed(0)}%`}
                    </div>
                    {rPerformanceEnabled && (
                      <div
                        className={cn(
                          "mt-1.5 text-xs font-semibold tabular-nums",
                          item.netR == null ? "text-muted-foreground" : rColor(item.netR),
                        )}
                      >
                        {item.count === 0 ? "No data" : `${signedR(item.netR)} net`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {visible.has("direction") && r.coverage.directions > 0 && (
            <section
              className="section-card rounded-2xl p-5"
              style={{ order: sectionOrder("direction") }}
            >
              <ReportSectionHeader id="direction" title="Direction performance" />
              <SampleStatus count={r.coverage.directions} />
              <CoverageNote
                label="Direction recorded"
                count={r.coverage.directions}
                total={r.totalTrades}
              />
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {r.directions.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.05]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-base font-bold">{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.count} {item.count === 1 ? "trade" : "trades"}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "mt-4 grid gap-4 text-sm",
                        rPerformanceEnabled ? "grid-cols-3" : "grid-cols-1",
                      )}
                    >
                      <div>
                        <div className="text-muted-foreground/80">Win rate</div>
                        <div className="mt-1 font-semibold tabular-nums">
                          {item.winRate == null ? "—" : `${item.winRate.toFixed(1)}%`}
                        </div>
                      </div>
                      {rPerformanceEnabled && (
                        <>
                          <div>
                            <div className="text-muted-foreground/80">Net R</div>
                            <div
                              className={cn("mt-1 font-semibold tabular-nums", rColor(item.netR))}
                            >
                              {signedR(item.netR)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground/80">Avg R</div>
                            <div
                              className={cn("mt-1 font-semibold tabular-nums", rColor(item.avgRR))}
                            >
                              {signedR(item.avgRR)}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {visible.has("killzone") && r.killzoneDiscipline.total > 0 && (
            <section
              className="section-card rounded-2xl p-5"
              style={{ order: sectionOrder("killzone") }}
            >
              <ReportSectionHeader id="killzone" title="Killzone Performance" />
              <SampleStatus count={r.coverage.killzone} />
              <CoverageNote
                label="Killzone choice recorded"
                count={r.coverage.killzone}
                total={r.totalTrades}
              />
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    name: "IN KILLZONE",
                    count: r.killzoneDiscipline.inCount,
                    winRate: r.killzoneDiscipline.inWinRate,
                    netR: r.killzoneDiscipline.inNetR,
                    avgR: r.killzoneDiscipline.inAvgR,
                  },
                  {
                    name: "OUTSIDE KILLZONE",
                    count: r.killzoneDiscipline.outCount,
                    winRate: r.killzoneDiscipline.outWinRate,
                    netR: r.killzoneDiscipline.outNetR,
                    avgR: r.killzoneDiscipline.outAvgR,
                  },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="rounded-xl bg-white/[0.025] p-4 ring-1 ring-white/[0.05]"
                  >
                    <div className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                      {item.name}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.count} {item.count === 1 ? "trade" : "trades"}
                    </div>
                    <div
                      className={cn(
                        "mt-4 grid gap-4 text-sm",
                        rPerformanceEnabled ? "grid-cols-3" : "grid-cols-1",
                      )}
                    >
                      <div>
                        <div className="text-muted-foreground/80">Win rate</div>
                        <div className="mt-1 font-semibold tabular-nums">
                          {item.winRate == null ? "—" : `${item.winRate.toFixed(1)}%`}
                        </div>
                      </div>
                      {rPerformanceEnabled && (
                        <>
                          <div>
                            <div className="text-muted-foreground/80">Net R</div>
                            <div
                              className={cn("mt-1 font-semibold tabular-nums", rColor(item.netR))}
                            >
                              {signedR(item.netR)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground/80">Avg R</div>
                            <div
                              className={cn("mt-1 font-semibold tabular-nums", rColor(item.avgR))}
                            >
                              {signedR(item.avgR)}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {visible.has("category") && r.categories.length > 0 && (
            <CompactReportSection
              id="category"
              title="Category performance"
              nameHeader="Category"
              rPerformanceEnabled={rPerformanceEnabled}
              showWinLoss
              order={sectionOrder("category")}
              rows={r.categories.map((item) => ({
                name: item.name,
                count: item.trades,
                winRate: item.winRate,
                netR: item.netR,
                avgR: item.avgRR,
                avgWin: item.avgProfit,
                avgLoss: item.avgLoss,
                rCount: item.rCount,
              }))}
            />
          )}

          {visible.has("instrument") && r.instruments.length > 0 && (
            <CompactReportSection
              id="instrument"
              title="Instrument performance"
              nameHeader="Instrument"
              rPerformanceEnabled={rPerformanceEnabled}
              order={sectionOrder("instrument")}
              rows={r.instruments.map((item) => ({
                name: item.name,
                count: item.count,
                winRate: item.winRate,
                netR: item.netR,
                avgR: item.avgRR,
                rCount: item.rCount,
              }))}
            />
          )}
        </div>
      )}

      {group === "trade_context" && (
        <div className="flex flex-col gap-4">
          {(
            [
              "entry_model",
              "market_condition",
              "entry_timeframe",
              "news_involvement",
              "custom_tags",
            ] as AnalyticsSectionId[]
          ).map(optionalSection)}
        </div>
      )}

      {guideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Analytics Guide"
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-md"
        >
          <div className="glow-card w-full max-w-lg overscroll-contain rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Analytics Guide</h2>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Close Analytics Guide"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 divide-y divide-white/[0.05] text-sm">
              <div className="py-3 first:pt-0">
                <h3 className="text-sm font-semibold">Scope</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Reports use the selected account and period.
                </p>
              </div>
              <div className="py-3">
                <h3 className="text-sm font-semibold">Data completeness</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Result-complete trades power win/loss results. R-complete trades also have a valid
                  result, Risk and P/L. Completed Reviews use the durable review completion record.
                </p>
              </div>
              <div className="py-3">
                <h3 className="text-sm font-semibold">Missing R</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Missing R is unavailable—not zero—so it does not distort Net R, Avg R, or the
                  equity curve.
                </p>
              </div>
              <div className="pt-3">
                <h3 className="text-sm font-semibold">Interpreting reports</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Reports without relevant data stay hidden. Interpret small samples carefully.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAllSessions && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="All sessions"
          className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4 backdrop-blur-md"
        >
          <div className="glow-card max-h-[85vh] w-full max-w-2xl overflow-auto overscroll-contain rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">All Sessions</h2>
              <button
                type="button"
                onClick={() => setShowAllSessions(false)}
                aria-label="Close all sessions"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {populatedSessions.length > 8 && (
              <SearchInput
                value={sessionSearch}
                onValueChange={setSessionSearch}
                placeholder="Search sessions"
                aria-label="Search sessions"
                wrapperClassName="mt-4"
              />
            )}
            <div className="mt-4 space-y-2">
              {sessionRows.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    setExpandedSession(item.name);
                    setShowAllSessions(false);
                  }}
                  className="w-full rounded-xl bg-white/[0.025] px-3.5 py-3 text-left ring-1 ring-white/[0.04] transition-colors hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold">{item.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {item.count} {item.count === 1 ? "trade" : "trades"}
                    </span>
                  </span>
                  <span className="mt-3 flex">
                    <ResultBlocks
                      wins={item.wins}
                      losses={item.losses}
                      breakeven={item.breakeven}
                    />
                  </span>
                  <span className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>
                      {item.wins}W · {item.losses}L · {item.breakeven}BE
                    </span>
                    <span>{item.winRate == null ? "—" : `${item.winRate.toFixed(1)}% WR`}</span>
                    {rPerformanceEnabled && (
                      <span className={rColor(item.netR)}>{signedR(item.netR)} net</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportView(props: {
  r: Report;
  scope: ReportScope;
  trades: DbTrade[];
  tracking: ReturnType<typeof journalTrackingFromPreferences>;
  preferences: AnalyticsPreferences;
  rPerformanceEnabled?: boolean;
}) {
  return (
    <RestoredAnalyticsReportExperience
      {...props}
      rPerformanceEnabled={props.rPerformanceEnabled ?? true}
    />
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
        initial={{ scale: 0.98, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 8 }}
        transition={CALM_TRANSITION}
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
        <SearchInput
          value={query}
          onValueChange={(value) => {
            setQuery(value);
            setVisibleCount(5);
          }}
          placeholder="Search range"
          aria-label="Search range"
          wrapperClassName="mt-4"
        />
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
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-opacity duration-150",
                    isSelected ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden={!isSelected}
                >
                  Selected
                </span>
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
type QuarterSelection = "current" | "previous" | "custom";

function labelMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function labelQuarterKey(key: string): string {
  const m = Number(key.split("-")[1].slice(1));
  const y = key.split("-")[0];
  return `Q${m} ${y}`;
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

function generateQuarterKeysInRange(oldestTradeDateStr: string | null): string[] {
  if (!oldestTradeDateStr) return [];

  const now = new Date();
  const currentQ = Math.floor(now.getMonth() / 3);
  const endQuarter = new Date(now.getFullYear(), currentQ * 3, 1);
  const parsedStart = new Date(oldestTradeDateStr + "T00:00:00");
  let startQuarter = endQuarter;
  if (!isNaN(parsedStart.getTime())) {
    const sq = Math.floor(parsedStart.getMonth() / 3);
    startQuarter = new Date(parsedStart.getFullYear(), sq * 3, 1);
  }

  if (startQuarter > endQuarter) {
    startQuarter = endQuarter;
  }

  const keys: string[] = [];
  let current = new Date(endQuarter);
  const maxIterations = 200;
  let iterations = 0;
  while (current >= startQuarter && iterations < maxIterations) {
    keys.push(quarterKey(current));
    current = new Date(current.getFullYear(), current.getMonth() - 3, 1);
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

function AnalyticsCustomizer({
  tracking,
  preferences,
  rPerformanceEnabled,
  onChange,
  saving,
  error,
}: {
  tracking: ReturnType<typeof journalTrackingFromPreferences>;
  preferences: AnalyticsPreferences;
  rPerformanceEnabled: boolean;
  onChange: (next: AnalyticsPreferences) => void;
  saving: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="analytics-customizer"
          className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.07] transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          Customize Analytics
        </button>
      </div>
      {open && (
        <div
          id="analytics-customizer"
          className="mt-3 space-y-1 rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.06]"
        >
          {preferences.order.map((id, index) => {
            const definition = ANALYTICS_SECTION_DEFINITIONS.find((item) => item.id === id)!;
            const availability = analyticsSectionAvailability(id, tracking, rPerformanceEnabled);
            const hidden = preferences.hidden.includes(id);
            return (
              <div
                key={id}
                className="flex flex-col gap-2 rounded-lg px-2 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div
                    className={cn(
                      "text-sm font-medium",
                      !availability.available && "text-muted-foreground",
                    )}
                  >
                    {definition.label}
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                      {!availability.available ? "Unavailable" : hidden ? "Hidden" : "Visible"}
                    </span>
                  </div>
                  {!availability.available && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{availability.reason}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={saving || !availability.available || hidden || index === 0}
                    onClick={() => onChange(moveAnalyticsSection(preferences, id, -1))}
                    className="rounded-md px-2 py-1 text-xs ring-1 ring-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={
                      saving ||
                      !availability.available ||
                      hidden ||
                      index === preferences.order.length - 1
                    }
                    onClick={() => onChange(moveAnalyticsSection(preferences, id, 1))}
                    className="rounded-md px-2 py-1 text-xs ring-1 ring-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    disabled={saving || !availability.available}
                    onClick={() => onChange(setAnalyticsSectionVisible(preferences, id, hidden))}
                    className="rounded-md px-2 py-1 text-xs ring-1 ring-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {hidden ? "Show" : "Hide"}
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t border-white/[0.06] px-2 pt-3">
            <span className={cn("text-xs text-muted-foreground", error && "text-destructive")}>
              {error ?? (saving ? "Saving changes…" : "Saved to your account")}
            </span>
            <button
              type="button"
              disabled={saving}
              onClick={() => onChange(DEFAULT_ANALYTICS_PREFERENCES)}
              className="text-xs font-semibold text-primary disabled:opacity-40"
            >
              Restore defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionalTrackingAnalytics({
  trades,
  preferences,
  rPerformanceEnabled,
  sectionOrder,
  showSection,
}: {
  trades: DbTrade[];
  preferences: AnalyticsPreferences;
  rPerformanceEnabled: boolean;
  sectionOrder: (id: AnalyticsSectionId) => number;
  showSection: (id: AnalyticsSectionId) => boolean;
}) {
  const fieldValues: Record<OptionalAnalyticsSection, (trade: DbTrade) => string[]> = {
    entry_model: (trade) => (trade.entry_model ? [trade.entry_model] : []),
    market_condition: (trade) => (trade.market_condition ? [trade.market_condition] : []),
    entry_timeframe: (trade) => (trade.entry_timeframe ? [trade.entry_timeframe] : []),
    news_involvement: (trade) => (trade.news_involvement ? [trade.news_involvement] : []),
    exit_reason: (trade) => (trade.exit_reason ? [trade.exit_reason] : []),
    trade_management: (trade) => trade.trade_management ?? [],
    custom_tags: (trade) => trade.custom_tags ?? [],
  };
  return (
    <>
      {preferences.order
        .filter((section): section is OptionalAnalyticsSection =>
          OPTIONAL_ANALYTICS_SECTIONS.includes(section as OptionalAnalyticsSection),
        )
        .map((section) => {
          if (!showSection(section)) return null;
          const rows = optionalFieldAnalytics(
            trades,
            fieldValues[section],
            section === "entry_timeframe" ? stableTimeframeOrder : undefined,
          );
          if (!rows.length) return null;
          const count = rows.reduce((sum, row) => sum + row.count, 0);
          const sample = sampleLabel(count);
          return (
            <section
              key={section}
              className="section-card rounded-2xl p-5"
              style={{ order: sectionOrder(section) }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{JOURNAL_FIELD_META[section].label}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recorded for {count} trade{count === 1 ? "" : "s"} in this report.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {sample === "early" ? "Early data" : sample === "small" ? "Small sample" : ""}
                </span>
              </div>
              {section === "custom_tags" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  A trade may appear under more than one tag.
                </p>
              )}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      <th className="pb-2">Value</th>
                      <th className="pb-2 text-right">Trades</th>
                      <th className="pb-2 text-right">Win rate</th>
                      {rPerformanceEnabled && (
                        <>
                          <th className="pb-2 text-right">Net R</th>
                          <th className="pb-2 text-right">Avg R</th>
                          <th className="pb-2 text-right">PF</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.value} className="border-t border-white/[0.05]">
                        <td className="py-2.5 font-medium">{row.value}</td>
                        <td className="py-2.5 text-right">{row.count}</td>
                        <td className="py-2.5 text-right">
                          {row.winRate == null ? "—" : `${row.winRate.toFixed(1)}%`}
                        </td>
                        {rPerformanceEnabled && (
                          <>
                            <td className="py-2.5 text-right">
                              {row.netR == null ? "—" : `${row.netR.toFixed(2)}R`}
                            </td>
                            <td className="py-2.5 text-right">
                              {row.avgR == null ? "—" : `${row.avgR.toFixed(2)}R`}
                            </td>
                            <td className="py-2.5 text-right">
                              {row.profitFactor == null ? "—" : row.profitFactor.toFixed(2)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
    </>
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
  const [quarterSel, setQuarterSel] = useState<QuarterSelection>("current");
  const [customQuarterKey, setCustomQuarterKey] = useState(quarterKey(new Date()));
  const [quarterPickerOpen, setQuarterPickerOpen] = useState(false);
  const fn = useServerFn(listTrades);
  const getPreferencesFn = useServerFn(getTradingPreferences);
  const savePreferencesFn = useServerFn(upsertTradingPreferences);
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => fn() });
  const { data: preferences } = useQuery({
    queryKey: ["trading-preferences"],
    queryFn: () => getPreferencesFn(),
  });
  const tracking = journalTrackingFromPreferences(preferences?.journal_tracking);
  const analyticsPreferences = analyticsPreferencesFromStored(preferences?.analytics_preferences);
  const saveAnalyticsPreferences = useMutation({
    mutationFn: (analytics_preferences: AnalyticsPreferences) =>
      savePreferencesFn({ data: { analytics_preferences } }),
    onSuccess: (row) => queryClient.setQueryData(["trading-preferences"], row),
  });
  const trades = useMemo(() => (data ?? []) as DbTrade[], [data]);
  const realTrades = useMemo(() => trades.filter((trade) => !isPaperTrade(trade)), [trades]);

  const accountsFn = useServerFn(listTradingAccounts);
  const { data: accounts } = useQuery({
    queryKey: ["trading-accounts"],
    queryFn: () => accountsFn(),
  });
  const { activeAccountId: selectedAccountId, setActiveAccountId: setSelectedAccountId } =
    useActiveAccount();

  const filteredTrades = useMemo(() => {
    if (selectedAccountId === "ALL") return realTrades;
    return realTrades.filter((t) => t.account_id === selectedAccountId);
  }, [realTrades, selectedAccountId]);

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

  const quarterPickerKeys = useMemo(() => {
    return generateQuarterKeysInRange(oldestTradeDate);
  }, [oldestTradeDate]);

  const labelCustomWeek = useCallback((key: string) => {
    return labelWeekRange(key);
  }, []);

  const labelCustomMonth = useCallback((key: string) => {
    return labelMonthKey(key);
  }, []);

  const labelCustomQuarter = useCallback((key: string) => {
    return labelQuarterKey(key);
  }, []);

  const currentWeekKey = weekKey(new Date());
  const prevWeekKey = weekKey(addDays(new Date(), -7));
  const currentMonthKey = ymKey(new Date());
  const prevMonthKey = ymKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const hasPreviousWeek = weekKeys.includes(prevWeekKey);
  const hasPreviousMonth = monthPickerKeys.includes(prevMonthKey);
  const currentQuarterKey = quarterKey(new Date());
  const prevQuarterKey = quarterKey(
    new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1),
  );
  const hasPreviousQuarter = quarterPickerKeys.includes(prevQuarterKey);

  useEffect(() => {
    if (weekSel === "previous" && !hasPreviousWeek) setWeekSel("current");
  }, [hasPreviousWeek, weekSel]);

  useEffect(() => {
    if (monthSel === "previous" && !hasPreviousMonth) setMonthSel("current");
  }, [hasPreviousMonth, monthSel]);

  useEffect(() => {
    if (quarterSel === "previous" && !hasPreviousQuarter) setQuarterSel("current");
  }, [hasPreviousQuarter, quarterSel]);

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
        : tab === "quarterly"
          ? quarterSel === "current"
            ? currentQuarterKey
            : quarterSel === "previous"
              ? prevQuarterKey
              : customQuarterKey
          : null;

  const reportTrades = useMemo(
    () => filterByScope(filteredTrades, tab, activeKey),
    [filteredTrades, tab, activeKey],
  );
  const report = useMemo(() => buildReport(reportTrades, tab), [reportTrades, tab]);

  const handleWeekSelection = (value: WeeklySelection) => {
    setWeekSel(value);
    if (value === "custom") setWeekPickerOpen(true);
  };

  const handleMonthSelection = (value: MonthSelection) => {
    setMonthSel(value);
    if (value === "custom") setMonthPickerOpen(true);
  };

  const handleQuarterSelection = (value: QuarterSelection) => {
    setQuarterSel(value);
    if (value === "custom") setQuarterPickerOpen(true);
  };

  return (
    <PageShell>
      <PageHeader
        icon={BarChart3}
        eyebrow="Reports"
        title="Analytics"
        description="Performance organized into overall, weekly, monthly, quarterly, and longer-horizon reports."
      />

      <div className="glow-card relative z-50 mt-6 overflow-visible rounded-2xl p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
            <div className="inline-flex flex-wrap rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/[0.06] sm:flex-nowrap">
              <button
                onClick={() => setTab("overall")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
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
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
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
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                  tab === "monthly"
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarRange className="h-4 w-4" /> Monthly
              </button>
              <button
                onClick={() => setTab("quarterly")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                  tab === "quarterly"
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarFold className="h-4 w-4" /> Quarterly
              </button>
            </div>

            {tab === "weekly" && (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] px-2 py-1.5 ring-1 ring-white/[0.06] sm:flex-nowrap">
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
              <div className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] px-2 py-1.5 ring-1 ring-white/[0.06] sm:flex-nowrap">
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
            {tab === "quarterly" && (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] px-2 py-1.5 ring-1 ring-white/[0.06] sm:flex-nowrap">
                <PeriodDropdown
                  value={quarterSel}
                  label={
                    quarterSel === "custom"
                      ? "Custom quarter"
                      : quarterSel === "previous"
                        ? "Previous quarter"
                        : "Current quarter"
                  }
                  options={[
                    { value: "current", label: "Current quarter" },
                    { value: "custom", label: "Custom quarter" },
                    ...(hasPreviousQuarter
                      ? [{ value: "previous", label: "Previous quarter" }]
                      : []),
                  ]}
                  onChange={(value) => handleQuarterSelection(value as QuarterSelection)}
                  ariaLabel="Quarterly report period"
                />
                {quarterSel === "custom" && (
                  <button
                    type="button"
                    onClick={() => setQuarterPickerOpen(true)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground"
                  >
                    {labelQuarterKey(customQuarterKey)}
                  </button>
                )}
              </div>
            )}
          </div>

          <AccountFilterSelect
            accounts={(accounts ?? []).filter((account) => account.status !== "archived")}
            value={selectedAccountId}
            onValueChange={setSelectedAccountId}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <ReportView
          key={`${selectedAccountId}-${tab}-${activeKey ?? "all"}`}
          r={report}
          scope={tab}
          trades={reportTrades}
          tracking={tracking}
          preferences={analyticsPreferences}
          rPerformanceEnabled={tracking.r_performance !== "hidden"}
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
        {quarterPickerOpen && (
          <PeriodPickerModal
            title="Select quarter"
            items={quarterPickerKeys}
            selected={customQuarterKey}
            labelFor={labelCustomQuarter}
            onClose={() => setQuarterPickerOpen(false)}
            onSelect={(key) => {
              setCustomQuarterKey(key);
              setQuarterSel("custom");
              setQuarterPickerOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </PageShell>
  );
}
