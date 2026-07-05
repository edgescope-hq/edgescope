import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Gauge,
  Layers,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTrades } from "@/lib/trades.functions";
import { formatTradeWhen, rrNum, type DbTrade } from "@/lib/trade-mappers";
import { sessionLabel } from "@/lib/trade-constants";
import { getReviewStatus } from "@/lib/review-status";
import { cn } from "@/lib/utils";
import { PageHeader, PageShell, PremiumEmptyState } from "@/components/ui/premium";

export const Route = createFileRoute("/_authenticated/edge-discovery")({
  head: () => ({
    meta: [
      { title: "Scope — EdgeScope" },
      {
        name: "description",
        content: "Find hidden patterns in your trading journal without signals or predictions.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ScopePage,
});

const REQUIRED_REVIEWED = 10;
const MIN_PATTERN_SAMPLE = 3;

type Confidence = "Low confidence" | "Medium confidence" | "High confidence";
type SectionKey = "opportunities" | "risks" | "conditions" | "behavior";

type ReviewedTrade = DbTrade & {
  reviewed: true;
  rr: number | null;
  decided: boolean;
  category: string;
  setup: string;
  directionLabel: "Long" | "Short";
  reviewedFields: number;
};

type ScopeInsight = {
  id: string;
  section: SectionKey;
  title: string;
  body: string;
  details?: string[];
  sampleSize: number;
  winRate: number | null;
  netR: number | null;
  confidence: Confidence;
  tradeIds: string[];
  strength: number;
};

function hasText(value: string | null | undefined): boolean {
  return !!value?.trim();
}

function hasItems(value: string[] | null | undefined): boolean {
  return Array.isArray(value) && value.some((item) => item.trim().length > 0);
}

function reviewedFieldCount(t: DbTrade): number {
  return [
    hasText(t.reasoning),
    hasText(t.lessons_learned),
    hasText(t.notes),
    hasText(t.mistakes_made),
    hasText(t.private_notes),
    hasText(t.emotion_before),
    hasText(t.emotion_during),
    hasText(t.emotion_after),
    (t.trade_screenshots?.length ?? 0) > 0,
  ].filter(Boolean).length;
}

function isReviewed(t: DbTrade): boolean {
  return getReviewStatus(t) === "reviewed";
}

function asReviewed(t: DbTrade): ReviewedTrade {
  const category = ((t.categories ?? []).find((c) => c?.trim()) ?? "").trim();
  return {
    ...t,
    reviewed: true,
    rr: t.achieved_rr == null || t.achieved_rr === "" ? null : rrNum(t.achieved_rr),
    decided: t.result === "win" || t.result === "loss",
    category,
    setup: category || "Untagged setup",
    directionLabel: t.direction === "short" ? "Short" : "Long",
    reviewedFields: reviewedFieldCount(t),
  };
}

function confidenceFor(sampleSize: number): Confidence {
  if (sampleSize >= 75) return "High confidence";
  if (sampleSize >= 30) return "Medium confidence";
  return "Low confidence";
}

function scopeStatusLabel(reviewedCount: number) {
  if (reviewedCount >= REQUIRED_REVIEWED) return "Ready";
  if (reviewedCount > 0) return "Building sample";
  return "Early";
}

function confidenceShort(value: Confidence): string {
  return value.replace(" confidence", "");
}

function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(0)}%`;
}

function rLabel(value: number | null): string {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

function tradeTimeMs(t: DbTrade): number | null {
  const value = new Date(`${t.trade_date}T${t.trade_time ?? "00:00:00"}`).getTime();
  return Number.isFinite(value) ? value : null;
}

function timeWindow(t: DbTrade): string | null {
  if (!t.trade_time) return null;
  const hour = Number(t.trade_time.slice(0, 2));
  if (!Number.isFinite(hour)) return null;
  if (hour < 6) return "Overnight";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function summarize(trades: ReviewedTrade[]) {
  const sampleSize = trades.length;
  const decided = trades.filter((t) => t.decided);
  const wins = decided.filter((t) => t.result === "win").length;
  const rrTrades = trades.filter((t) => t.rr != null);
  const netR = rrTrades.length ? rrTrades.reduce((sum, t) => sum + (t.rr ?? 0), 0) : null;
  return {
    sampleSize,
    winRate: decided.length ? (wins / decided.length) * 100 : null,
    netR,
    tradeIds: trades.map((t) => t.id),
  };
}

function uniqueTrades(trades: ReviewedTrade[]): ReviewedTrade[] {
  const seen = new Set<string>();
  return trades.filter((trade) => {
    if (seen.has(trade.id)) return false;
    seen.add(trade.id);
    return true;
  });
}

function statLine(label: string, trades: ReviewedTrade[]): string {
  const stats = summarize(trades);
  return `${label}: ${stats.sampleSize} trades, ${pct(stats.winRate)} win rate, ${rLabel(stats.netR)}`;
}

function insightStrength(sampleSize: number, netR: number | null, detailsCount = 0): number {
  const rWeight = Math.abs(netR ?? 0) * 3;
  const sampleWeight = Math.min(sampleSize, 30) / 3;
  return rWeight + sampleWeight + detailsCount;
}

function makeInsight(
  section: SectionKey,
  id: string,
  title: string,
  body: string,
  trades: ReviewedTrade[],
  details: string[] = [],
): ScopeInsight | null {
  if (trades.length < MIN_PATTERN_SAMPLE) return null;
  const stats = summarize(trades);
  if (stats.netR == null && stats.winRate == null) return null;
  return {
    id,
    section,
    title,
    body,
    sampleSize: stats.sampleSize,
    winRate: stats.winRate,
    netR: stats.netR,
    confidence: confidenceFor(stats.sampleSize),
    tradeIds: stats.tradeIds,
    details,
    strength: insightStrength(stats.sampleSize, stats.netR, details.length),
  };
}

function makeComparisonInsight(
  section: SectionKey,
  id: string,
  title: string,
  body: string,
  primaryLabel: string,
  primaryTrades: ReviewedTrade[],
  secondaryLabel: string,
  secondaryTrades: ReviewedTrade[],
): ScopeInsight | null {
  if (primaryTrades.length < MIN_PATTERN_SAMPLE || secondaryTrades.length < MIN_PATTERN_SAMPLE)
    return null;
  const primary = summarize(primaryTrades);
  const secondary = summarize(secondaryTrades);
  if (primary.netR == null || secondary.netR == null) return null;
  const difference = Math.abs(primary.netR - secondary.netR);
  const oppositeSigns =
    (primary.netR > 0 && secondary.netR < 0) || (primary.netR < 0 && secondary.netR > 0);
  if (!oppositeSigns && difference < 1.5) return null;

  const related = uniqueTrades([...primaryTrades, ...secondaryTrades]);
  const stats = summarize(related);
  return {
    id,
    section,
    title,
    body,
    details: [statLine(primaryLabel, primaryTrades), statLine(secondaryLabel, secondaryTrades)],
    sampleSize: related.length,
    winRate: stats.winRate,
    netR: stats.netR,
    confidence: confidenceFor(Math.min(primary.sampleSize, secondary.sampleSize)),
    tradeIds: stats.tradeIds,
    strength: insightStrength(related.length, difference, 2),
  };
}

function pushIfUseful(
  list: ScopeInsight[],
  insight: ScopeInsight | null,
  want: "positive" | "negative" | "either" = "either",
) {
  if (!insight) return;
  if (want === "positive" && (insight.netR ?? 0) <= 0) return;
  if (want === "negative" && (insight.netR ?? 0) >= 0) return;
  list.push(insight);
}

function groupBy(
  trades: ReviewedTrade[],
  getKey: (t: ReviewedTrade) => string | null,
  getLabel: (key: string) => string,
): Array<{ key: string; label: string; trades: ReviewedTrade[] }> {
  const map = new Map<string, ReviewedTrade[]>();
  for (const trade of trades) {
    const key = getKey(trade);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(trade);
  }
  return Array.from(map.entries()).map(([key, value]) => ({
    key,
    label: getLabel(key),
    trades: value,
  }));
}

function bestWorst(groups: Array<{ key: string; label: string; trades: ReviewedTrade[] }>) {
  const qualified = groups
    .map((group) => ({ ...group, stats: summarize(group.trades) }))
    .filter((group) => group.trades.length >= MIN_PATTERN_SAMPLE && group.stats.netR != null)
    .sort((a, b) => (b.stats.netR ?? 0) - (a.stats.netR ?? 0));
  const best = qualified[0] ?? null;
  const worst = qualified[qualified.length - 1] ?? null;
  if (!best || !worst || best.key === worst.key) return null;
  return { best, worst };
}

function topInsights(insights: ScopeInsight[], limit: number): ScopeInsight[] {
  const seen = new Set<string>();
  return insights
    .filter((insight) => {
      if (seen.has(insight.id)) return false;
      seen.add(insight.id);
      return true;
    })
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);
}

function strongestPatterns(trades: ReviewedTrade[]): ScopeInsight[] {
  const insights: ScopeInsight[] = [];
  const groups = [
    ...groupBy(
      trades,
      (t) => (t.instrument && t.session ? `instrument-session:${t.instrument}|${t.session}` : null),
      (key) => {
        const [, data] = key.split(":");
        const [instrument, session] = data.split("|");
        return `${instrument} + ${sessionLabel(session)}`;
      },
    ),
    ...groupBy(
      trades,
      (t) => (t.category && t.session ? `setup-session:${t.category}|${t.session}` : null),
      (key) => {
        const [, data] = key.split(":");
        const [category, session] = data.split("|");
        return `${category} + ${sessionLabel(session)}`;
      },
    ),
    ...groupBy(
      trades,
      (t) => (t.instrument ? `direction-instrument:${t.directionLabel}|${t.instrument}` : null),
      (key) => key.split(":")[1].replace("|", " "),
    ),
    ...groupBy(
      trades,
      (t) =>
        t.instrument && t.in_killzone === true ? `instrument-killzone:${t.instrument}` : null,
      (key) => `${key.split(":")[1]} during killzone`,
    ),
    ...groupBy(
      trades,
      (t) => (t.category && t.in_killzone === true ? `killzone-setup:${t.category}` : null),
      (key) => `${key.split(":")[1]} during killzone`,
    ),
  ];

  for (const group of groups) {
    const insight = makeInsight(
      "opportunities",
      `strong-${group.key}`,
      `${group.label} is performing well`,
      `${group.label} has produced positive R across your reviewed journal entries.`,
      group.trades,
    );
    pushIfUseful(insights, insight, "positive");
  }

  const killzone = trades.filter((t) => t.in_killzone === true);
  const nonKillzone = trades.filter((t) => t.in_killzone !== true);
  const killzoneComparison = makeComparisonInsight(
    "opportunities",
    "opportunity-killzone-vs-non",
    "Killzone trades are outperforming non-killzone trades",
    "Trades marked during killzone show a stronger R profile than trades outside killzone.",
    "Killzone",
    killzone,
    "Non-killzone",
    nonKillzone,
  );
  if (killzoneComparison && (summarize(killzone).netR ?? 0) > (summarize(nonKillzone).netR ?? 0))
    insights.push(killzoneComparison);

  for (const instrumentGroup of groupBy(
    trades,
    (t) => t.instrument || null,
    (key) => key,
  )) {
    const longs = instrumentGroup.trades.filter((t) => t.directionLabel === "Long");
    const shorts = instrumentGroup.trades.filter((t) => t.directionLabel === "Short");
    const longStats = summarize(longs);
    const shortStats = summarize(shorts);
    if ((longStats.netR ?? 0) === (shortStats.netR ?? 0)) continue;
    const betterLabel = (longStats.netR ?? 0) > (shortStats.netR ?? 0) ? "Long" : "Short";
    const weakerLabel = betterLabel === "Long" ? "Short" : "Long";
    const insight = makeComparisonInsight(
      "opportunities",
      `opportunity-${instrumentGroup.key}-direction-split`,
      `${instrumentGroup.label} ${betterLabel.toLowerCase()} trades are stronger than ${weakerLabel.toLowerCase()} trades`,
      `${instrumentGroup.label} has a meaningful direction split in your reviewed journal.`,
      betterLabel,
      betterLabel === "Long" ? longs : shorts,
      weakerLabel,
      weakerLabel === "Long" ? longs : shorts,
    );
    if (insight) insights.push(insight);
  }

  for (const setupGroup of groupBy(
    trades,
    (t) => t.category || null,
    (key) => key,
  )) {
    const split = bestWorst(
      groupBy(
        setupGroup.trades,
        (t) => t.session || null,
        (key) => sessionLabel(key),
      ),
    );
    if (!split) continue;
    const insight = makeComparisonInsight(
      "opportunities",
      `opportunity-${setupGroup.key}-session-split`,
      `${setupGroup.label} performs better in ${split.best.label}`,
      `${setupGroup.label} shows a session-dependent performance split.`,
      split.best.label,
      split.best.trades,
      split.worst.label,
      split.worst.trades,
    );
    if (insight && (split.best.stats.netR ?? 0) > 0) insights.push(insight);
  }

  for (const directionInstrumentGroup of groupBy(
    trades,
    (t) => (t.instrument && t.session ? `${t.instrument}|${t.directionLabel}` : null),
    (key) => key.replace("|", " "),
  )) {
    const split = bestWorst(
      groupBy(
        directionInstrumentGroup.trades,
        (t) => t.session || null,
        (key) => sessionLabel(key),
      ),
    );
    if (!split) continue;
    const insight = makeComparisonInsight(
      "opportunities",
      `opportunity-${directionInstrumentGroup.key}-session-split`,
      `${directionInstrumentGroup.label} performs better in ${split.best.label}`,
      `${directionInstrumentGroup.label} shows a session split that is easy to miss in a simple summary.`,
      split.best.label,
      split.best.trades,
      split.worst.label,
      split.worst.trades,
    );
    if (insight && (split.best.stats.netR ?? 0) > 0) insights.push(insight);
  }

  return topInsights(insights, 6);
}

function hiddenRisks(trades: ReviewedTrade[]): ScopeInsight[] {
  const insights: ScopeInsight[] = [];
  const chronological = [...trades].sort((a, b) => (tradeTimeMs(a) ?? 0) - (tradeTimeMs(b) ?? 0));
  const soonAfterLoss: ReviewedTrade[] = [];
  const dayMap = new Map<string, ReviewedTrade[]>();

  for (let i = 0; i < chronological.length; i += 1) {
    const current = chronological[i];
    const prev = chronological[i - 1];
    const currentMs = tradeTimeMs(current);
    const prevMs = prev ? tradeTimeMs(prev) : null;
    if (
      prev?.result === "loss" &&
      currentMs != null &&
      prevMs != null &&
      currentMs > prevMs &&
      currentMs - prevMs <= 20 * 60 * 1000
    ) {
      soonAfterLoss.push(current);
    }
    if (current.trade_date) {
      if (!dayMap.has(current.trade_date)) dayMap.set(current.trade_date, []);
      dayMap.get(current.trade_date)!.push(current);
    }
  }

  const heavyDayTrades: ReviewedTrade[] = [];
  const normalDayTrades: ReviewedTrade[] = [];
  for (const sameDayTrades of dayMap.values()) {
    if (sameDayTrades.length >= 5) heavyDayTrades.push(...sameDayTrades);
    if (sameDayTrades.length >= 1 && sameDayTrades.length <= 3)
      normalDayTrades.push(...sameDayTrades);
  }

  pushIfUseful(
    insights,
    makeInsight(
      "risks",
      "risk-fast-reentry-after-loss",
      "Fast re-entry after a loss is underperforming",
      "Trades taken within 20 minutes after a losing trade have negative R in your journal.",
      soonAfterLoss,
    ),
    "negative",
  );

  const overtrading = makeComparisonInsight(
    "risks",
    "risk-heavy-days-vs-normal-days",
    "High-volume trading days are weaker than normal days",
    "Days with 5 or more trades show worse performance than days with 1-3 trades.",
    "5+ trade days",
    heavyDayTrades,
    "1-3 trade days",
    normalDayTrades,
  );
  if (overtrading && (summarize(heavyDayTrades).netR ?? 0) < (summarize(normalDayTrades).netR ?? 0))
    insights.push(overtrading);

  pushIfUseful(
    insights,
    makeInsight(
      "risks",
      "risk-rule-break-tags",
      "Rule-break tags are reducing performance",
      "Trades with mistake or rule-break tags have a negative total R impact.",
      trades.filter((t) => hasItems(t.mistake_tags)),
    ),
    "negative",
  );

  pushIfUseful(
    insights,
    makeInsight(
      "risks",
      "risk-outside-killzone",
      "Outside-killzone trades are costing R",
      "Trades not marked as taken during killzone are negative overall.",
      trades.filter((t) => t.in_killzone !== true),
    ),
    "negative",
  );

  for (const group of groupBy(
    trades,
    (t) =>
      t.instrument && t.session ? `weak-instrument-session:${t.instrument}|${t.session}` : null,
    (key) => {
      const [, data] = key.split(":");
      const [instrument, session] = data.split("|");
      return `${instrument} + ${sessionLabel(session)}`;
    },
  )) {
    pushIfUseful(
      insights,
      makeInsight(
        "risks",
        `risk-${group.key}`,
        `${group.label} is a weak condition`,
        `${group.label} has a negative total R impact in your reviewed trades.`,
        group.trades,
      ),
      "negative",
    );
  }

  for (const group of groupBy(
    trades,
    (t) => (t.instrument ? `weak-instrument-direction:${t.instrument}|${t.directionLabel}` : null),
    (key) => key.split(":")[1].replace("|", " "),
  )) {
    pushIfUseful(
      insights,
      makeInsight(
        "risks",
        `risk-${group.key}`,
        `${group.label} is underperforming`,
        `${group.label} has a negative total R impact in your reviewed trades.`,
        group.trades,
      ),
      "negative",
    );
  }

  return topInsights(insights, 6);
}

function setupConditions(trades: ReviewedTrade[]): ScopeInsight[] {
  const insights: ScopeInsight[] = [];
  const groups = [
    ...groupBy(
      trades,
      (t) => (t.category && t.session ? `setup-session:${t.category}|${t.session}` : null),
      (key) => {
        const [, data] = key.split(":");
        const [category, session] = data.split("|");
        return `${category} + ${sessionLabel(session)}`;
      },
    ),
    ...groupBy(
      trades,
      (t) => (t.category && t.instrument ? `setup-instrument:${t.category}|${t.instrument}` : null),
      (key) => key.split(":")[1].replace("|", " + "),
    ),
    ...groupBy(
      trades,
      (t) => (t.category && t.in_killzone === true ? `setup-killzone:${t.category}` : null),
      (key) => `${key.split(":")[1]} + killzone`,
    ),
    ...groupBy(
      trades,
      (t) => (t.category ? `setup-direction:${t.category}|${t.directionLabel}` : null),
      (key) => key.split(":")[1].replace("|", " + "),
    ),
    ...groupBy(
      trades,
      (t) => {
        const window = timeWindow(t);
        return t.category && window ? `setup-time:${t.category}|${window}` : null;
      },
      (key) => key.split(":")[1].replace("|", " + "),
    ),
  ];

  for (const group of groups) {
    const stats = summarize(group.trades);
    if (stats.netR == null) continue;
    const positive = (stats.netR ?? 0) > 0;
    const insight = makeInsight(
      "conditions",
      `condition-${group.key}`,
      `${group.label} is ${positive ? "working" : "failing"}`,
      `${group.label} has ${positive ? "positive" : "negative"} R impact in your reviewed setup data.`,
      group.trades,
    );
    pushIfUseful(insights, insight);
  }

  for (const setupGroup of groupBy(
    trades,
    (t) => t.category || null,
    (key) => key,
  )) {
    const inside = setupGroup.trades.filter((t) => t.in_killzone === true);
    const outside = setupGroup.trades.filter((t) => t.in_killzone !== true);
    const insideStats = summarize(inside);
    const outsideStats = summarize(outside);
    const betterInside = (insideStats.netR ?? 0) > (outsideStats.netR ?? 0);
    const insight = makeComparisonInsight(
      "conditions",
      `condition-${setupGroup.key}-killzone-split`,
      `${setupGroup.label} changes inside vs outside killzone`,
      `${setupGroup.label} has a different R profile depending on killzone context.`,
      betterInside ? "During killzone" : "Outside killzone",
      betterInside ? inside : outside,
      betterInside ? "Outside killzone" : "During killzone",
      betterInside ? outside : inside,
    );
    if (insight) insights.push(insight);
  }

  for (const setupGroup of groupBy(
    trades,
    (t) => t.category || null,
    (key) => key,
  )) {
    const split = bestWorst(
      groupBy(
        setupGroup.trades,
        (t) => t.instrument || null,
        (key) => key,
      ),
    );
    if (!split) continue;
    const insight = makeComparisonInsight(
      "conditions",
      `condition-${setupGroup.key}-instrument-split`,
      `${setupGroup.label} is instrument-sensitive`,
      `${setupGroup.label} performs differently across instruments in your reviewed trades.`,
      split.best.label,
      split.best.trades,
      split.worst.label,
      split.worst.trades,
    );
    if (insight) insights.push(insight);
  }

  return topInsights(insights, 6);
}

function behaviorPatterns(trades: ReviewedTrade[]): ScopeInsight[] {
  const insights: ScopeInsight[] = [];
  const chronological = [...trades].sort((a, b) => (tradeTimeMs(a) ?? 0) - (tradeTimeMs(b) ?? 0));
  const afterTwoLosses: ReviewedTrade[] = [];
  const afterThreeWins: ReviewedTrade[] = [];
  const soonAfterLoss: ReviewedTrade[] = [];
  const fastFollowUp: ReviewedTrade[] = [];
  const highVolumeDays: ReviewedTrade[] = [];
  const ruleBreakAfterLoss: ReviewedTrade[] = [];
  const dayMap = new Map<string, ReviewedTrade[]>();

  for (let i = 0; i < chronological.length; i += 1) {
    const current = chronological[i];
    const prev = chronological[i - 1];
    const prev2 = chronological[i - 2];
    const prev3 = chronological[i - 3];
    if (prev?.result === "loss" && prev2?.result === "loss") {
      afterTwoLosses.push(current);
    }
    if (prev?.result === "win" && prev2?.result === "win" && prev3?.result === "win") {
      afterThreeWins.push(current);
    }
    const currentMs = tradeTimeMs(current);
    const prevMs = prev ? tradeTimeMs(prev) : null;
    if (
      currentMs != null &&
      prevMs != null &&
      currentMs > prevMs &&
      currentMs - prevMs <= 20 * 60 * 1000
    ) {
      fastFollowUp.push(current);
      if (prev?.result === "loss") soonAfterLoss.push(current);
    }
    if (prev?.result === "loss" && hasItems(current.mistake_tags)) {
      ruleBreakAfterLoss.push(current);
    }
    if (current.trade_date) {
      if (!dayMap.has(current.trade_date)) dayMap.set(current.trade_date, []);
      dayMap.get(current.trade_date)!.push(current);
    }
  }

  for (const sameDayTrades of dayMap.values()) {
    if (sameDayTrades.length >= 5) highVolumeDays.push(...sameDayTrades);
  }

  pushIfUseful(
    insights,
    makeInsight(
      "behavior",
      "behavior-after-two-losses",
      "Loss-streak risk detected",
      "After 2 consecutive losses, the next trade has underperformed in your journal.",
      afterTwoLosses,
    ),
    "negative",
  );
  const afterThreeWinsInsight = makeInsight(
    "behavior",
    "behavior-after-three-wins",
    "Post-win-streak behavior detected",
    "Trades taken after 3 consecutive wins show a measurable R impact in your journal.",
    afterThreeWins,
  );
  if (afterThreeWinsInsight?.netR != null) pushIfUseful(insights, afterThreeWinsInsight);
  const afterThreeIds = new Set(afterThreeWins.map((trade) => trade.id));
  const afterThreeComparison = makeComparisonInsight(
    "behavior",
    "behavior-after-three-wins-vs-rest",
    "Trades after 3 wins differ from normal trades",
    "Post-win-streak trades have a different R profile than the rest of your reviewed journal.",
    "After 3 wins",
    afterThreeWins,
    "Other trades",
    chronological.filter((trade) => !afterThreeIds.has(trade.id)),
  );
  if (afterThreeComparison) insights.push(afterThreeComparison);
  pushIfUseful(
    insights,
    makeInsight(
      "behavior",
      "behavior-soon-after-loss",
      "Trades soon after a loss are underperforming",
      "Trades taken within 20 minutes after a loss have negative R in your journal.",
      soonAfterLoss,
    ),
    "negative",
  );
  pushIfUseful(
    insights,
    makeInsight(
      "behavior",
      "behavior-fast-follow-up",
      "Fast follow-up trades are underperforming",
      "Trades taken within 20 minutes of the previous trade have negative R in your journal.",
      fastFollowUp,
    ),
    "negative",
  );
  pushIfUseful(
    insights,
    makeInsight(
      "behavior",
      "behavior-high-volume-days",
      "High-volume trading days are underperforming",
      "Days with 5 or more trades have negative R impact in your journal.",
      highVolumeDays,
    ),
    "negative",
  );
  pushIfUseful(
    insights,
    makeInsight(
      "behavior",
      "behavior-rule-break-after-loss",
      "Rule-break trades after losses are high risk",
      "Trades with rule-break tags after a losing trade have negative R impact.",
      ruleBreakAfterLoss,
    ),
    "negative",
  );

  const timeSplit = bestWorst(
    groupBy(
      trades,
      (t) => timeWindow(t),
      (key) => key,
    ),
  );
  if (timeSplit) {
    const timeInsight = makeComparisonInsight(
      "behavior",
      "behavior-time-window-split",
      `${timeSplit.best.label} trades are outperforming ${timeSplit.worst.label.toLowerCase()} trades`,
      "Time-of-day performance has a meaningful split in your reviewed journal.",
      timeSplit.best.label,
      timeSplit.best.trades,
      timeSplit.worst.label,
      timeSplit.worst.trades,
    );
    if (timeInsight) insights.push(timeInsight);
  }

  const mistakes = new Map<string, ReviewedTrade[]>();
  for (const trade of trades) {
    for (const tag of trade.mistake_tags ?? []) {
      const key = tag.trim();
      if (!key) continue;
      if (!mistakes.has(key)) mistakes.set(key, []);
      mistakes.get(key)!.push(trade);
    }
  }

  for (const [tag, taggedTrades] of mistakes.entries()) {
    pushIfUseful(
      insights,
      makeInsight(
        "behavior",
        `rule-${tag}`,
        `${tag} is costing R`,
        `Trades tagged with ${tag} have a negative total R impact. Review the related trades for repeatable behavior.`,
        taggedTrades,
      ),
      "negative",
    );
  }

  return topInsights(insights, 6);
}

function selectStrongInsights(
  candidates: Record<SectionKey, ScopeInsight[]>,
): Record<SectionKey, ScopeInsight[]> {
  const selected: ScopeInsight[] = [];
  const used = new Set<string>();
  const sectionOrder: SectionKey[] = ["opportunities", "risks", "conditions", "behavior"];

  for (const section of sectionOrder) {
    const first = topInsights(candidates[section], 1)[0];
    if (!first || used.has(first.id)) continue;
    selected.push(first);
    used.add(first.id);
  }

  const remaining = sectionOrder
    .flatMap((section) => candidates[section])
    .filter((insight) => !used.has(insight.id))
    .sort((a, b) => b.strength - a.strength);

  for (const insight of remaining) {
    if (selected.length >= 6) break;
    if (used.has(insight.id)) continue;
    selected.push(insight);
    used.add(insight.id);
  }

  return {
    opportunities: selected.filter((insight) => insight.section === "opportunities"),
    risks: selected.filter((insight) => insight.section === "risks"),
    conditions: selected.filter((insight) => insight.section === "conditions"),
    behavior: selected.filter((insight) => insight.section === "behavior"),
  };
}

function buildScopeInsights(trades: ReviewedTrade[]) {
  return selectStrongInsights({
    opportunities: strongestPatterns(trades),
    risks: hiddenRisks(trades),
    conditions: setupConditions(trades),
    behavior: behaviorPatterns(trades),
  });
}

function ScopePage() {
  const list = useServerFn(listTrades);
  const { data } = useSuspenseQuery({ queryKey: ["trades"], queryFn: () => list() });
  const trades = useMemo(() => (data ?? []) as DbTrade[], [data]);
  const reviewedTrades = useMemo(() => trades.filter(isReviewed).map(asReviewed), [trades]);
  const insights = useMemo(() => buildScopeInsights(reviewedTrades), [reviewedTrades]);
  const [related, setRelated] = useState<ScopeInsight | null>(null);

  const relatedTrades = useMemo(() => {
    if (!related) return [];
    const ids = new Set(related.tradeIds);
    return reviewedTrades.filter((trade) => ids.has(trade.id));
  }, [related, reviewedTrades]);

  const reviewedCount = reviewedTrades.length;
  const allInsights = [
    ...insights.opportunities,
    ...insights.risks,
    ...insights.conditions,
    ...insights.behavior,
  ];
  const pageConfidence = confidenceFor(reviewedCount);

  return (
    <PageShell>
      <div className="w-full max-w-6xl">
        <PageHeader
          icon={Sparkles}
          eyebrow="Pattern discovery"
          title="Scope"
          description="Find hidden patterns across setups, sessions, instruments, timing, and behavior — driven entirely by your reviewed journal data."
        />

        <div className="min-w-0">
          {reviewedCount < REQUIRED_REVIEWED ? (
            <LowDataScope reviewedCount={reviewedCount} />
          ) : (
            <>
              <DiscoverySummary
                reviewedCount={reviewedCount}
                confidence={pageConfidence}
                patternsFound={allInsights.length}
              />

              {allInsights.length === 0 ? (
                <PremiumEmptyState
                  icon={Lightbulb}
                  title="Discoveries are forming"
                  description="Scope will surface evidence-backed patterns here once enough reviews are completed."
                  className="mt-6 items-start text-left"
                />
              ) : (
                <div className="mt-8 space-y-8">
                  <InsightSection
                    icon={Target}
                    title="Journal Patterns"
                    subtitle="Repeated strengths in reviewed trades."
                    insights={insights.opportunities}
                    onRelated={setRelated}
                  />
                  <InsightSection
                    icon={AlertTriangle}
                    title="Risk Tendencies"
                    subtitle="Repeated conditions that cost R."
                    insights={insights.risks}
                    onRelated={setRelated}
                  />
                  <InsightSection
                    icon={Layers}
                    title="Setup Conditions"
                    subtitle="Setup context across sessions and instruments."
                    insights={insights.conditions}
                    onRelated={setRelated}
                  />
                  {insights.behavior.length > 0 && (
                    <InsightSection
                      icon={ShieldCheck}
                      title="Behavior Patterns"
                      subtitle="Execution patterns tied to review data."
                      insights={insights.behavior}
                      onRelated={setRelated}
                    />
                  )}
                </div>
              )}
              <AboutScopeCompact />
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {related && (
          <RelatedTradesModal
            insight={related}
            trades={relatedTrades}
            onClose={() => setRelated(null)}
          />
        )}
      </AnimatePresence>
    </PageShell>
  );
}

const scopePreviewCards = [
  {
    icon: Target,
    title: "Journal Patterns",
    body: "Repeated strengths and weaknesses across reviewed trades.",
  },
  {
    icon: AlertTriangle,
    title: "Risk Tendencies",
    body: "Risk behaviors that repeatedly cost or protect R.",
  },
  {
    icon: Layers,
    title: "Setup Conditions",
    body: "Setup context across sessions, instruments, and categories.",
  },
  {
    icon: ShieldCheck,
    title: "Behavior Patterns",
    body: "Execution habits visible in completed reviews.",
  },
];

function DiscoverySummary({
  reviewedCount,
  confidence,
  patternsFound,
}: {
  reviewedCount: number;
  confidence: Confidence;
  patternsFound: number;
}) {
  return (
    <div className="surface-card mt-6 rounded-2xl px-4 py-3">
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Status" value={scopeStatusLabel(reviewedCount)} />
        <SummaryMetric label="Reviewed trades" value={`${reviewedCount}`} />
        <SummaryMetric label="Confidence" value={confidenceShort(confidence)} />
        <SummaryMetric label="Patterns found" value={`${patternsFound}`} />
      </div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.045] px-3 py-2 ring-1 ring-white/[0.065]">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground">{value}</span>
    </div>
  );
}

function AboutScopeCompact() {
  return (
    <section className="surface-card mt-8 rounded-2xl p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold">About Scope</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Analytics shows what happened. Scope helps explain why it happened.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {scopePreviewCards.map(({ icon: Icon, title }) => (
            <div
              key={title}
              className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.065]"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-primary/80" />
              <span>{title}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LowDataScope({ reviewedCount }: { reviewedCount: number }) {
  const progress = Math.min(100, (reviewedCount / REQUIRED_REVIEWED) * 100);
  return (
    <div className="mt-5 space-y-5">
      <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.035] px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-white/[0.07]">
        <Check className="h-3.5 w-3.5 text-success/75" />
        No signals. No predictions. Only your journal data.
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="glow-card rounded-2xl p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Gauge className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold">Scope readiness</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {reviewedCount} / {REQUIRED_REVIEWED} complete reviews
                </p>
              </div>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary ring-1 ring-primary/20">
              {scopeStatusLabel(reviewedCount)}
            </span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
            {[
              { label: "Minimum", value: "10 complete reviews" },
              { label: "Recommended", value: "30+ complete reviews" },
              { label: "Source", value: "Reviewed trades only" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl bg-white/[0.025] px-3.5 py-3 ring-1 ring-white/[0.045]"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {item.label}
                </div>
                <div className="mt-1.5 font-semibold leading-5 text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Scope becomes more reliable as your completed review sample grows.
          </p>
        </motion.div>
        <section className="surface-card rounded-2xl p-5">
          <h2 className="text-sm font-bold">Pattern inputs</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Complete reviews help Scope inspect patterns with better context.
          </p>
          <div className="mt-4 space-y-2 text-xs">
            {[
              "Reasoning",
              "Mistakes / rule breaks",
              "Session / emotion / category context",
              "Planned vs achieved R",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2 ring-1 ring-white/[0.065]">
                <Check className="h-3.5 w-3.5 shrink-0 text-primary/75" />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section>
        <h2 className="text-lg font-bold tracking-tight">What Scope looks for</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {scopePreviewCards.map(({ icon: Icon, title, body }) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="surface-card flex h-full min-w-0 flex-col rounded-2xl p-4 text-left"
            >
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/15">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="select-none text-sm font-bold">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Lightbulb className="h-4 w-4 text-primary" /> Discoveries
        </h2>
        <div className="surface-card mt-3 rounded-2xl p-5">
          <h3 className="text-sm font-semibold">Not enough reviewed trades yet.</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Scope will surface patterns after at least 10 complete reviews.
          </p>
        </div>
      </section>
    </div>
  );
}

function InsightSection({
  icon: Icon,
  title,
  subtitle,
  insights,
  onRelated,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  insights: ScopeInsight[];
  onRelated: (insight: ScopeInsight) => void;
}) {
  if (insights.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Icon className="h-4 w-4 text-primary" /> {title}
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} onRelated={() => onRelated(insight)} />
        ))}
      </div>
    </section>
  );
}

function InsightCard({ insight, onRelated }: { insight: ScopeInsight; onRelated: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="glow-card rounded-2xl p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{insight.title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{insight.body}</p>
          {insight.details && insight.details.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {insight.details.map((detail) => (
                <div
                  key={detail}
                  className="rounded-lg bg-white/[0.025] px-3 py-2 text-xs text-muted-foreground ring-1 ring-white/[0.04]"
                >
                  {detail}
                </div>
              ))}
            </div>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1",
            insight.confidence === "High confidence" &&
              "bg-primary/15 text-primary ring-primary/25",
            insight.confidence === "Medium confidence" && "bg-info/15 text-info ring-info/25",
            insight.confidence === "Low confidence" && "bg-warning/10 text-warning ring-warning/25",
          )}
        >
          {insight.confidence}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Sample" value={`${insight.sampleSize}`} />
        <Metric label="Win rate" value={pct(insight.winRate)} />
        <Metric
          label="Net R"
          value={rLabel(insight.netR)}
          accent={insight.netR != null && insight.netR < 0 ? "risk" : "good"}
        />
      </div>
      {insight.tradeIds.length > 0 && (
        <button
          type="button"
          onClick={onRelated}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-white/[0.06] transition duration-200 hover:bg-white/[0.06] hover:text-foreground hover:ring-white/[0.1]"
        >
          View related trades <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </motion.div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "good" | "risk";
}) {
  return (
    <div className="rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.04]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-sm font-bold tabular-nums",
          accent === "good" && "text-primary",
          accent === "risk" && "text-warning",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function RelatedTradesModal({
  insight,
  trades,
  onClose,
}: {
  insight: ScopeInsight;
  trades: ReviewedTrade[];
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        className="glow-card w-full max-w-3xl rounded-2xl p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              Related trades
            </div>
            <h2 className="mt-1 text-lg font-bold">{insight.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Private evidence from your journal only.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close related trades"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl ring-1 ring-white/[0.06]">
          <div className="grid grid-cols-[128px_minmax(100px,1fr)_86px_82px_80px_minmax(120px,1fr)_110px] border-b border-white/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <div>Date</div>
            <div>Instrument</div>
            <div>Direction</div>
            <div>Result</div>
            <div>R</div>
            <div>Setup</div>
            <div>Review</div>
          </div>
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="grid grid-cols-[128px_minmax(100px,1fr)_86px_82px_80px_minmax(120px,1fr)_110px] items-center border-b border-white/[0.04] px-3 py-3 text-xs last:border-b-0"
            >
              <div className="text-muted-foreground">
                {formatTradeWhen(trade.trade_date, trade.trade_time)}
              </div>
              <div className="truncate font-semibold">{trade.instrument || "—"}</div>
              <div className="font-semibold">{trade.directionLabel}</div>
              <div
                className={cn(
                  "font-semibold uppercase",
                  trade.result === "win" && "text-success",
                  trade.result === "loss" && "text-destructive",
                  trade.result === "breakeven" && "text-info",
                )}
              >
                {trade.result ?? "—"}
              </div>
              <div className="font-semibold tabular-nums">
                {trade.rr == null ? "—" : rLabel(trade.rr)}
              </div>
              <div className="truncate text-muted-foreground">{trade.category || "—"}</div>
              <div>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                  Reviewed
                </span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
