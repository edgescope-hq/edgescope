// Scope discovery engine — deterministic, evidence-based pattern scanning
// over REVIEWED trades only.
//
// Principles enforced here (not in the UI):
//   - No discovery below MIN_MATCHING matching trades. Hidden, not "low confidence".
//   - Every discovery compares against an explicit baseline (same-setup when
//     possible, otherwise the rest of the reviewed sample).
//   - Weak baseline differences are rejected, not shown.
//   - Combination depth grows with the reviewed sample (2 → 3 → 4 factors)
//     so tiny samples can never produce ultra-specific "patterns".
//   - Same reviewed trades in → same discoveries out. No randomness, no dates.
//
// Scope prefers showing nothing over showing a weak or misleading discovery.

import type { DbTrade } from "@/lib/trade-mappers";
import { recordedR } from "@/lib/trade-mappers";
import { sessionLabel } from "@/lib/trade-constants";
import { parsePlannedRR, rrBucketLabel } from "@/lib/planned-rr";

// ============ Public types ============

export type DiscoveryCategory = "setup" | "risk" | "execution" | "journal";

/** Matching-sample confidence. Anything below MIN_MATCHING is never shown. */
export type DiscoveryConfidence = "early" | "low" | "medium" | "good";

export type DiscoveryDirection = "positive" | "negative";

export type DiscoveryCondition = { key: string; label: string };

export type DiscoveryBaseline = {
  label: string;
  sampleSize: number;
  winRate: number | null;
  avgR: number | null;
};

export type ScopeDiscovery = {
  id: string;
  category: DiscoveryCategory;
  direction: DiscoveryDirection;
  title: string;
  description: string;
  conditionChips: DiscoveryCondition[];
  matchingTradeCount: number;
  winRate: number | null;
  avgR: number | null;
  baseline: DiscoveryBaseline;
  deltaWinRate: number | null;
  deltaAvgR: number | null;
  confidence: DiscoveryConfidence;
  caution: string;
  matchingTradeIds: string[];
  rankScore: number;
  dateRange?: string | null;
};

export type ScopeScanResult = {
  reviewedCount: number;
  /** Overall reviewed baseline, shown as context next to discoveries. */
  baselineWinRate: number | null;
  baselineAvgR: number | null;
  discoveries: ScopeDiscovery[];
};

// ============ Thresholds (all deterministic, tuned for honesty) ============

/** Below this many matching trades a pattern is hidden entirely. */
const MIN_MATCHING = 10;
/** A baseline with fewer trades than this cannot support a comparison. */
const MIN_BASELINE = 10;
/** Extra matching floor for deeper combinations (anti-overfitting). */
const MIN_MATCHING_3F = 12;
const MIN_MATCHING_4F = 16;
/** Reviewed-sample size required to unlock deeper combination scanning. */
const DEPTH_3_REVIEWED = 30;
const DEPTH_4_REVIEWED = 80;
/** Significance gates: reject weak baseline differences. */
const MIN_ABS_DELTA_R = 0.3; // avg R difference that stands alone
const MIN_ABS_DELTA_WIN = 12; // win-rate points, only counts with some R delta
const MIN_DELTA_R_WITH_WIN = 0.15;
/** Field-completeness below this share downgrades confidence one step. */
const MIN_FIELD_COMPLETENESS = 0.6;
/** Selection caps: Scope stays selective. */
const MAX_PER_CATEGORY = 3;
const MAX_TOTAL = 6;

export const SCOPE_CAUTION = "Not a signal — a review clue from your past reviewed trades.";

// ============ Internal trade projection ============

type ScopeTrade = {
  id: string;
  result: "win" | "loss" | "breakeven" | null;
  r: number | null;
  session: string | null;
  setup: string | null;
  instrument: string | null;
  direction: "long" | "short";
  plannedRR: number | null;
  rrBucket: string | null;
  inKillzone: boolean | null;
  riskAmount: number | null;
  mistakeTags: string[];
  reasoningLength: number;
  tradeDate: string;
  timeMs: number | null;
};

function toScopeTrade(t: DbTrade): ScopeTrade {
  const setup = ((t.categories ?? []).find((c) => c && c.trim()) ?? "").trim() || null;
  const plannedRR = parsePlannedRR(t.planned_rr);
  const timeMsRaw = t.trade_time ? new Date(`${t.trade_date}T${t.trade_time}`).getTime() : NaN;
  const risk = t.risk_amount == null || t.risk_amount === "" ? NaN : Number(t.risk_amount);
  return {
    id: t.id,
    result: t.result === "win" || t.result === "loss" || t.result === "breakeven" ? t.result : null,
    r: recordedR(t.achieved_rr),
    session: t.session?.trim() || null,
    setup,
    instrument: t.instrument?.trim() || null,
    direction: t.direction === "short" ? "short" : "long",
    plannedRR,
    rrBucket: rrBucketLabel(plannedRR),
    inKillzone: typeof t.in_killzone === "boolean" ? t.in_killzone : null,
    riskAmount: Number.isFinite(risk) ? risk : null,
    mistakeTags: (t.mistake_tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    reasoningLength: (t.reasoning ?? "").trim().length,
    tradeDate: t.trade_date,
    timeMs: Number.isFinite(timeMsRaw) ? timeMsRaw : null,
  };
}

// ============ Stats helpers ============

type SampleStats = {
  sampleSize: number;
  winRate: number | null;
  avgR: number | null;
  ids: string[];
};

function statsOf(trades: ScopeTrade[]): SampleStats {
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const decided = wins + losses;
  const rs = trades.map((t) => t.r).filter((r): r is number => r != null);
  return {
    sampleSize: trades.length,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    avgR: rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    ids: trades.map((t) => t.id),
  };
}

function confidenceFromMatching(count: number): DiscoveryConfidence {
  if (count >= 80) return "good";
  if (count >= 50) return "medium";
  if (count >= 20) return "low";
  return "early";
}

const CONFIDENCE_ORDER: DiscoveryConfidence[] = ["early", "low", "medium", "good"];

function downgrade(c: DiscoveryConfidence, steps: number): DiscoveryConfidence {
  const index = Math.max(0, CONFIDENCE_ORDER.indexOf(c) - steps);
  return CONFIDENCE_ORDER[index];
}

const CONFIDENCE_WEIGHT: Record<DiscoveryConfidence, number> = {
  early: 0,
  low: 0.2,
  medium: 0.4,
  good: 0.6,
};

// ============ Comparison core ============

type ComparisonInput = {
  id: string;
  category: DiscoveryCategory;
  matching: ScopeTrade[];
  baselineTrades: ScopeTrade[];
  baselineLabel: string;
  conditionChips: DiscoveryCondition[];
  /** Human phrase for the condition, used in the title. */
  conditionLabel: string;
  factorCount: number;
  /** Share (0..1) of reviewed trades that have all fields this check uses. */
  fieldCompleteness: number;
  minMatching?: number;
  /** Optional fixed title/description overrides for behavior-style checks. */
  title?: (direction: DiscoveryDirection) => string;
  description?: (direction: DiscoveryDirection) => string;
};

/**
 * Evaluate one condition against its baseline. Returns null when the evidence
 * does not clear the honesty bar (sample, baseline, or significance).
 */
function evaluateComparison(input: ComparisonInput): ScopeDiscovery | null {
  const minMatching = input.minMatching ?? MIN_MATCHING;
  if (input.matching.length < minMatching) return null;
  if (input.baselineTrades.length < MIN_BASELINE) return null;

  const m = statsOf(input.matching);
  const b = statsOf(input.baselineTrades);
  if (m.avgR == null || b.avgR == null) return null;

  const deltaAvgR = m.avgR - b.avgR;
  const deltaWinRate = m.winRate != null && b.winRate != null ? m.winRate - b.winRate : null;

  const isSmallSample = m.sampleSize < 20 || b.sampleSize < 20;
  const reqDeltaR = isSmallSample ? 0.5 : MIN_ABS_DELTA_R;
  const reqDeltaRWithWin = isSmallSample ? 0.25 : MIN_DELTA_R_WITH_WIN;
  const reqDeltaWin = isSmallSample ? 15 : MIN_ABS_DELTA_WIN;

  const significant =
    Math.abs(deltaAvgR) >= reqDeltaR ||
    (deltaWinRate != null &&
      Math.abs(deltaWinRate) >= reqDeltaWin &&
      Math.abs(deltaAvgR) >= reqDeltaRWithWin);
  if (!significant) return null;

  const direction: DiscoveryDirection = deltaAvgR >= 0 ? "positive" : "negative";

  let confidence = confidenceFromMatching(m.sampleSize);
  if (input.factorCount >= 3 && m.sampleSize < 25) confidence = downgrade(confidence, 1);
  if (input.fieldCompleteness < MIN_FIELD_COMPLETENESS) confidence = downgrade(confidence, 1);

  const title =
    input.title?.(direction) ??
    `${input.conditionLabel} is ${direction === "positive" ? "outperforming" : "underperforming"} ${input.baselineLabel.toLowerCase()}`;
  const description =
    input.description?.(direction) ??
    (direction === "positive"
      ? "Your reviewed data suggests this condition is currently outperforming its baseline. Evidence can change as your sample grows."
      : "Your reviewed data suggests this condition is currently underperforming its baseline. Consider reviewing the matching trades before changing any rules.");

  const rankScore =
    Math.abs(deltaAvgR) * 2 +
    (deltaWinRate != null ? Math.abs(deltaWinRate) / 20 : 0) +
    Math.min(m.sampleSize, 80) / 80 +
    CONFIDENCE_WEIGHT[confidence] -
    0.25 * Math.max(0, input.factorCount - 2) -
    (input.fieldCompleteness < MIN_FIELD_COMPLETENESS ? 0.2 : 0);

  const dates = input.matching.map((t) => t.tradeDate).filter(Boolean);
  let dateRange: string | null = null;
  if (dates.length > 0) {
    const sortedDates = [...dates].sort();
    const minDate = sortedDates[0];
    const maxDate = sortedDates[sortedDates.length - 1];
    const fmt = (dStr: string) => {
      try {
        return new Date(dStr + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      } catch {
        return dStr;
      }
    };
    dateRange = minDate === maxDate ? fmt(minDate) : `${fmt(minDate)} – ${fmt(maxDate)}`;
  }

  return {
    id: input.id,
    category: input.category,
    direction,
    title,
    description,
    conditionChips: input.conditionChips,
    matchingTradeCount: m.sampleSize,
    winRate: m.winRate,
    avgR: m.avgR,
    baseline: {
      label: input.baselineLabel,
      sampleSize: b.sampleSize,
      winRate: b.winRate,
      avgR: b.avgR,
    },
    deltaWinRate,
    deltaAvgR,
    confidence,
    caution: SCOPE_CAUTION,
    matchingTradeIds: m.ids,
    rankScore: Number(rankScore.toFixed(4)),
    dateRange,
  };
}

// ============ Setup Conditions: multi-factor combination scan ============

type Dimension = {
  key: string;
  /** null → trade does not participate in combos using this dimension. */
  valueOf: (t: ScopeTrade) => { value: string; label: string } | null;
};

const DIMENSIONS: Record<string, Dimension> = {
  session: {
    key: "session",
    valueOf: (t) => (t.session ? { value: t.session, label: sessionLabel(t.session) } : null),
  },
  setup: {
    key: "setup",
    valueOf: (t) => (t.setup ? { value: t.setup, label: t.setup } : null),
  },
  instrument: {
    key: "instrument",
    valueOf: (t) => (t.instrument ? { value: t.instrument, label: t.instrument } : null),
  },
  direction: {
    key: "direction",
    valueOf: (t) => ({ value: t.direction, label: t.direction === "short" ? "Short" : "Long" }),
  },
  rr: {
    key: "rr",
    valueOf: (t) => (t.rrBucket ? { value: t.rrBucket, label: t.rrBucket } : null),
  },
  killzone: {
    key: "killzone",
    valueOf: (t) =>
      t.inKillzone == null
        ? null
        : t.inKillzone
          ? { value: "in", label: "In killzone" }
          : { value: "out", label: "Outside killzone" },
  },
};

/** Meaningful combinations only — no exhaustive search over every pairing. */
const COMBOS_2F: string[][] = [
  ["session", "setup"],
  ["setup", "rr"],
  ["setup", "instrument"],
  ["setup", "direction"],
  ["setup", "killzone"],
  ["instrument", "rr"],
];
const COMBOS_3F: string[][] = [
  ["session", "setup", "rr"],
  ["instrument", "setup", "rr"],
  ["session", "setup", "instrument"],
  ["session", "setup", "killzone"],
];
const COMBOS_4F: string[][] = [["session", "setup", "instrument", "rr"]];

function scanSetupConditions(trades: ScopeTrade[]): ScopeDiscovery[] {
  const reviewedCount = trades.length;
  const combos: string[][] = [
    ...COMBOS_2F,
    ...(reviewedCount >= DEPTH_3_REVIEWED ? COMBOS_3F : []),
    ...(reviewedCount >= DEPTH_4_REVIEWED ? COMBOS_4F : []),
  ];

  const discoveries: ScopeDiscovery[] = [];

  for (const comboKeys of combos) {
    const dims = comboKeys.map((k) => DIMENSIONS[k]);
    const factorCount = dims.length;
    const minMatching =
      factorCount >= 4 ? MIN_MATCHING_4F : factorCount === 3 ? MIN_MATCHING_3F : MIN_MATCHING;

    // Trades that have every field used by this combo.
    const eligible: Array<{ trade: ScopeTrade; values: { value: string; label: string }[] }> = [];
    for (const trade of trades) {
      const values = dims.map((d) => d.valueOf(trade));
      if (values.every((v) => v != null)) {
        eligible.push({ trade, values: values as { value: string; label: string }[] });
      }
    }
    const fieldCompleteness = reviewedCount > 0 ? eligible.length / reviewedCount : 0;

    // Group eligible trades by their combined value key.
    const groups = new Map<string, { labels: string[]; trades: ScopeTrade[] }>();
    for (const { trade, values } of eligible) {
      const groupKey = values.map((v) => v.value).join("|");
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { labels: values.map((v) => v.label), trades: [] });
      }
      groups.get(groupKey)!.trades.push(trade);
    }

    for (const [groupKey, group] of groups) {
      if (group.trades.length < minMatching) continue;

      // Baseline: same setup excluding this combo when the combo includes a
      // setup; otherwise the rest of the reviewed sample.
      const setupIndex = comboKeys.indexOf("setup");
      const matchingIds = new Set(group.trades.map((t) => t.id));
      let baselineTrades: ScopeTrade[];
      let baselineLabel: string;
      if (setupIndex >= 0) {
        const setupValue = groupKey.split("|")[setupIndex];
        baselineTrades = trades.filter((t) => t.setup === setupValue && !matchingIds.has(t.id));
        baselineLabel = `Your other ${group.labels[setupIndex]} trades`;
      } else {
        baselineTrades = trades.filter((t) => !matchingIds.has(t.id));
        baselineLabel = "The rest of your reviewed trades";
      }

      const conditionLabel = group.labels.join(" + ");
      const discovery = evaluateComparison({
        id: `setup:${comboKeys.join("+")}:${groupKey}`,
        category: "setup",
        matching: group.trades,
        baselineTrades,
        baselineLabel,
        conditionChips: comboKeys.map((key, i) => ({ key, label: group.labels[i] })),
        conditionLabel,
        factorCount,
        fieldCompleteness,
        minMatching,
      });
      if (discovery) discoveries.push(discovery);
    }
  }

  return discoveries;
}

// ============ Risk Behavior ============

function scanRiskBehavior(trades: ScopeTrade[]): ScopeDiscovery[] {
  const discoveries: ScopeDiscovery[] = [];
  const reviewedCount = trades.length;

  // 1) Planned RR bucket vs the other RR-known trades (RR-planning quality).
  const rrKnown = trades.filter((t) => t.rrBucket != null);
  const rrCompleteness = reviewedCount > 0 ? rrKnown.length / reviewedCount : 0;
  const buckets = new Map<string, ScopeTrade[]>();
  for (const t of rrKnown) {
    if (!buckets.has(t.rrBucket!)) buckets.set(t.rrBucket!, []);
    buckets.get(t.rrBucket!)!.push(t);
  }
  for (const [bucket, bucketTrades] of buckets) {
    const rest = rrKnown.filter((t) => t.rrBucket !== bucket);
    const discovery = evaluateComparison({
      id: `risk:rr-bucket:${bucket}`,
      category: "risk",
      matching: bucketTrades,
      baselineTrades: rest,
      baselineLabel: "Your trades planned at other RR levels",
      conditionChips: [{ key: "rr", label: bucket }],
      conditionLabel: bucket,
      factorCount: 2,
      fieldCompleteness: rrCompleteness,
    });
    if (discovery) discoveries.push(discovery);
  }

  // 2) Losses that ran beyond planned risk (achieved R at or below -1.3R).
  const losses = trades.filter((t) => t.result === "loss" && t.r != null);
  const overruns = losses.filter((t) => (t.r ?? 0) <= -1.3);
  if (losses.length >= 15 && overruns.length >= 10) {
    const overrunShare = overruns.length / losses.length;
    if (overrunShare >= 0.2) {
      const sharePct = Math.round(overrunShare * 100);
      const confidence = confidenceFromMatching(overruns.length);
      const rankScore = 1.0 + overruns.length / 80 + CONFIDENCE_WEIGHT[confidence];

      const dates = overruns.map((t) => t.tradeDate).filter(Boolean);
      let dateRange: string | null = null;
      if (dates.length > 0) {
        const sortedDates = [...dates].sort();
        const minDate = sortedDates[0];
        const maxDate = sortedDates[sortedDates.length - 1];
        const fmt = (dStr: string) => {
          try {
            return new Date(dStr + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
          } catch {
            return dStr;
          }
        };
        dateRange = minDate === maxDate ? fmt(minDate) : `${fmt(minDate)} – ${fmt(maxDate)}`;
      }

      const discovery: ScopeDiscovery = {
        id: "risk:loss-overrun",
        category: "risk",
        direction: "negative",
        title: "A meaningful share of your losses are exceeding planned risk",
        description: `${sharePct}% of your reviewed losses (${overruns.length} of ${losses.length}) ran worse than -1.3R. Review how these stops were handled — this is a review clue, not an instruction.`,
        conditionChips: [{ key: "loss", label: "Loss beyond -1.3R" }],
        matchingTradeCount: overruns.length,
        winRate: null,
        avgR: statsOf(overruns).avgR,
        baseline: {
          label: "All reviewed losses",
          sampleSize: losses.length,
          winRate: null,
          avgR: statsOf(losses).avgR,
        },
        deltaWinRate: null,
        deltaAvgR: null,
        confidence,
        caution: SCOPE_CAUTION,
        matchingTradeIds: overruns.map((t) => t.id),
        rankScore: Number(rankScore.toFixed(4)),
        dateRange,
      };
      discoveries.push(discovery);
    }
  }

  // 3) Oversized risk vs normal risk (needs risk_amount on enough trades).
  const riskKnown = trades.filter((t) => t.riskAmount != null && t.riskAmount! > 0);
  if (riskKnown.length >= 30) {
    const sortedRisk = riskKnown.map((t) => t.riskAmount!).sort((a, b) => a - b);
    const median = sortedRisk[Math.floor(sortedRisk.length / 2)];
    if (median > 0) {
      const oversized = riskKnown.filter((t) => t.riskAmount! > median * 1.5);
      const normal = riskKnown.filter((t) => t.riskAmount! <= median * 1.5);
      const discovery = evaluateComparison({
        id: "risk:oversized-risk",
        category: "risk",
        matching: oversized,
        baselineTrades: normal,
        baselineLabel: "Your normal-risk trades",
        conditionChips: [{ key: "risk", label: "Risk above 1.5× your median" }],
        conditionLabel: "Oversized-risk trades",
        factorCount: 2,
        fieldCompleteness: riskKnown.length / reviewedCount,
      });
      if (discovery && discovery.direction === "negative") discoveries.push(discovery);
    }
  }

  return discoveries;
}

// ============ Execution Behavior ============

function scanExecutionBehavior(trades: ScopeTrade[]): ScopeDiscovery[] {
  const discoveries: ScopeDiscovery[] = [];
  const reviewedCount = trades.length;

  // 1) Mistake-tagged trades vs clean trades (overall).
  const tagged = trades.filter((t) => t.mistakeTags.length > 0);
  const clean = trades.filter((t) => t.mistakeTags.length === 0);
  const taggedOverall = evaluateComparison({
    id: "execution:mistake-tagged",
    category: "execution",
    matching: tagged,
    baselineTrades: clean,
    baselineLabel: "Your trades without mistake tags",
    conditionChips: [{ key: "mistake", label: "Any mistake tag" }],
    conditionLabel: "Trades with mistake tags",
    factorCount: 2,
    fieldCompleteness: 1,
  });
  if (taggedOverall && taggedOverall.direction === "negative") discoveries.push(taggedOverall);

  // 2) Per-tag checks against untagged trades.
  const byTag = new Map<string, ScopeTrade[]>();
  for (const t of tagged) {
    for (const tag of t.mistakeTags) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push(t);
    }
  }
  for (const [tag, tagTrades] of byTag) {
    const discovery = evaluateComparison({
      id: `execution:tag:${tag}`,
      category: "execution",
      matching: tagTrades,
      baselineTrades: clean,
      baselineLabel: "Your trades without mistake tags",
      conditionChips: [{ key: "mistake", label: tag }],
      conditionLabel: `"${tag}" trades`,
      factorCount: 2,
      fieldCompleteness: 1,
    });
    if (discovery && discovery.direction === "negative") discoveries.push(discovery);
  }

  // 3) Fast re-entry after a loss (needs trade times).
  const timed = trades
    .filter((t) => t.timeMs != null)
    .sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0) || a.id.localeCompare(b.id));
  const reentries: ScopeTrade[] = [];
  for (let i = 1; i < timed.length; i += 1) {
    const prev = timed[i - 1];
    const current = timed[i];
    if (
      prev.result === "loss" &&
      current.timeMs! > prev.timeMs! &&
      current.timeMs! - prev.timeMs! <= 20 * 60 * 1000
    ) {
      reentries.push(current);
    }
  }
  const reentryIds = new Set(reentries.map((t) => t.id));
  const reentryDiscovery = evaluateComparison({
    id: "execution:fast-reentry",
    category: "execution",
    matching: reentries,
    baselineTrades: timed.filter((t) => !reentryIds.has(t.id)),
    baselineLabel: "Your other timed trades",
    conditionChips: [{ key: "timing", label: "Within 20 min of a loss" }],
    conditionLabel: "Re-entries within 20 minutes of a loss",
    factorCount: 2,
    fieldCompleteness: reviewedCount > 0 ? timed.length / reviewedCount : 0,
    title: (d) =>
      d === "negative"
        ? "Fast re-entries after a loss are underperforming your baseline"
        : "Fast re-entries after a loss differ from your baseline",
  });
  if (reentryDiscovery && reentryDiscovery.direction === "negative")
    discoveries.push(reentryDiscovery);

  // 4) Heavy trading days (5+ trades) vs measured days (1–3 trades).
  const byDay = new Map<string, ScopeTrade[]>();
  for (const t of trades) {
    if (!byDay.has(t.tradeDate)) byDay.set(t.tradeDate, []);
    byDay.get(t.tradeDate)!.push(t);
  }
  const heavy: ScopeTrade[] = [];
  const measured: ScopeTrade[] = [];
  for (const dayTrades of byDay.values()) {
    if (dayTrades.length >= 5) heavy.push(...dayTrades);
    else if (dayTrades.length <= 3) measured.push(...dayTrades);
  }
  const overtrading = evaluateComparison({
    id: "execution:heavy-days",
    category: "execution",
    matching: heavy,
    baselineTrades: measured,
    baselineLabel: "Your 1–3 trade days",
    conditionChips: [{ key: "volume", label: "5+ trades in a day" }],
    conditionLabel: "Trades on 5+ trade days",
    factorCount: 2,
    fieldCompleteness: 1,
    title: (d) =>
      d === "negative"
        ? "High-volume days are underperforming your normal days"
        : "High-volume days differ from your normal days",
  });
  if (overtrading && overtrading.direction === "negative") discoveries.push(overtrading);

  return discoveries;
}

// ============ Journal Patterns (review quality) ============

function scanJournalPatterns(trades: ScopeTrade[]): ScopeDiscovery[] {
  const discoveries: ScopeDiscovery[] = [];
  const reviewedCount = trades.length;

  // 1) Brief reasoning vs detailed reasoning.
  const brief = trades.filter((t) => t.reasoningLength > 0 && t.reasoningLength < 80);
  const detailed = trades.filter((t) => t.reasoningLength >= 80);
  const reasoningDiscovery = evaluateComparison({
    id: "journal:brief-reasoning",
    category: "journal",
    matching: brief,
    baselineTrades: detailed,
    baselineLabel: "Your trades with detailed reasoning",
    conditionChips: [{ key: "review", label: "Brief reasoning (under 80 chars)" }],
    conditionLabel: "Trades with brief reasoning",
    factorCount: 2,
    fieldCompleteness: 1,
    title: (d) =>
      d === "negative"
        ? "Trades with brief reasoning are underperforming your detailed reviews"
        : "Trades with brief reasoning differ from your detailed reviews",
    description: (d) =>
      d === "negative"
        ? "Reviews with short reasoning coincide with weaker results in your journal. This may reflect rushed decisions or rushed reviews — worth re-reading these trades."
        : "Your briefly-reviewed trades currently differ from your detailed reviews. Worth re-reading a few to understand why.",
  });
  if (reasoningDiscovery) discoveries.push(reasoningDiscovery);

  return discoveries;
}

// ============ Selection: dedupe, rank, cap ============

function signatureOf(d: ScopeDiscovery): string {
  return [...d.matchingTradeIds].sort().join(",");
}

function selectDiscoveries(candidates: ScopeDiscovery[]): ScopeDiscovery[] {
  // Deterministic order: rank desc, then id for stable ties.
  const ranked = [...candidates].sort(
    (a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id),
  );

  const seenSignatures = new Set<string>();
  const perCategory = new Map<DiscoveryCategory, number>();
  const selected: ScopeDiscovery[] = [];

  for (const discovery of ranked) {
    if (selected.length >= MAX_TOTAL) break;
    if (discovery.id.startsWith("risk:rr-bucket:")) {
      const bucket = discovery.id.replace("risk:rr-bucket:", "");
      const hasSetupCombo = candidates.some(
        (c) =>
          c.category === "setup" &&
          c.conditionChips.some((chip) => chip.key === "rr" && chip.label === bucket),
      );
      if (hasSetupCombo) continue;
    }
    const signature = signatureOf(discovery);
    if (seenSignatures.has(signature)) continue; // same trade set, keep strongest only
    const count = perCategory.get(discovery.category) ?? 0;
    if (count >= MAX_PER_CATEGORY) continue;
    seenSignatures.add(signature);
    perCategory.set(discovery.category, count + 1);
    selected.push(discovery);
  }

  return selected;
}

// ============ Entry point ============

/**
 * Scan reviewed trades for evidence-backed discoveries.
 * `reviewed` must already be filtered to fully-reviewed trades.
 */
export function buildScopeDiscoveries(reviewed: DbTrade[]): ScopeScanResult {
  const trades = reviewed.map(toScopeTrade);
  const overall = statsOf(trades);

  const candidates: ScopeDiscovery[] = [
    ...scanSetupConditions(trades),
    ...scanRiskBehavior(trades),
    ...scanExecutionBehavior(trades),
    ...scanJournalPatterns(trades),
  ];

  return {
    reviewedCount: trades.length,
    baselineWinRate: overall.winRate,
    baselineAvgR: overall.avgR,
    discoveries: selectDiscoveries(candidates),
  };
}

export const CONFIDENCE_LABEL: Record<DiscoveryConfidence, string> = {
  early: "Early clue",
  low: "Low confidence",
  medium: "Medium confidence",
  good: "Good confidence",
};
