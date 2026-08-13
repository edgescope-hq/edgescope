// Deterministic, claim-specific Scope interpretation.
//
// Evidence establishes; rules calculate; Scope interprets; the trader decides.
// A claim is eligible from the particular fields it needs, never from a
// universal Reviewed gate. Missing values remain unknown.

import type { DbTrade } from "@/lib/trade-mappers";
import { isPaperTrade, primaryTradeCategory, realizedR } from "@/lib/trade-mappers";
import { getReviewStatus } from "@/lib/review-status";
import { sessionLabel } from "@/lib/trade-constants";
import { parsePlannedRR, rrBucketLabel } from "@/lib/planned-rr";

export type DiscoveryCategory = "category" | "risk" | "execution";
export type DiscoveryConfidence = "early" | "low" | "medium" | "good";
export type DiscoveryDirection = "positive" | "negative";
export type DiscoveryCondition = { key: string; label: string };

export type BehavioralFocusCandidate = {
  behavior: string;
  triggerSituation: string;
  intendedBehavior: string;
  evidenceDefinition: string;
};

export type ScopeDiscovery = {
  id: string;
  category: DiscoveryCategory;
  direction: DiscoveryDirection;
  title: string;
  description: string;
  conditionChips: DiscoveryCondition[];
  matchingTradeCount: number;
  matchingResultCount: number;
  matchingRCount: number;
  winRate: number | null;
  avgR: number | null;
  baseline: {
    label: string;
    sampleSize: number;
    resultCount: number;
    rCount: number;
    winRate: number | null;
    avgR: number | null;
  };
  deltaWinRate: number | null;
  deltaAvgR: number | null;
  confidence: DiscoveryConfidence;
  caution: string;
  matchingTradeIds: string[];
  rankScore: number;
  dateRange: string | null;
  focusCandidate: BehavioralFocusCandidate | null;
};

export type ScopeScanResult = {
  evidenceTradeCount: number;
  resultEvidenceCount: number;
  rEvidenceCount: number;
  reviewedCount: number;
  baselineWinRate: number | null;
  baselineAvgR: number | null;
  discoveries: ScopeDiscovery[];
};

export type StandardChallenge = {
  id: string;
  standardId: string;
  standardVersionId: string;
  standardTitle: string;
  title: string;
  description: string;
  matchingTradeIds: string[];
  sampleSize: number;
  avgR: number;
  baselineAvgR: number | null;
};

export const SCOPE_CAUTION =
  "A review clue from your stored evidence, not a signal or instruction.";

const MIN_MATCHING = 6;
const MIN_BASELINE = 6;
const MIN_ABS_DELTA_R = 0.35;
const MIN_ABS_DELTA_WIN_RATE = 15;

type ScopeTrade = {
  id: string;
  result: "win" | "loss" | "breakeven" | null;
  r: number | null;
  session: string | null;
  category: string | null;
  instrument: string | null;
  direction: "long" | "short" | null;
  plannedRRBucket: string | null;
  riskPct: number | null;
  accountId: string | null;
  issueTags: string[];
  tradeDate: string;
  timeMs: number | null;
  setupIntentVersionId: string | null;
  setupIntentProvenance: "capture" | "retrospective_review" | null;
  setupIntentRecordedAt: string | null;
  setupAdherence: "followed" | "deviated" | "unassessable" | null;
};

function finite(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toScopeTrade(trade: DbTrade): ScopeTrade {
  const planned = parsePlannedRR(trade.planned_rr);
  const riskAmount = finite(trade.risk_amount);
  const accountSize = finite(trade.account_size);
  const storedRiskPct = finite(trade.risk_percentage);
  const riskPct =
    storedRiskPct != null && storedRiskPct > 0
      ? storedRiskPct
      : riskAmount != null && riskAmount > 0 && accountSize != null && accountSize > 0
        ? (riskAmount / accountSize) * 100
        : null;
  const time = trade.trade_time ? Date.parse(`${trade.trade_date}T${trade.trade_time}`) : NaN;
  return {
    id: trade.id,
    result:
      trade.status !== "open" &&
      (trade.result === "win" || trade.result === "loss" || trade.result === "breakeven")
        ? trade.result
        : null,
    r: realizedR(trade),
    session: trade.session?.trim() || null,
    category: primaryTradeCategory(trade),
    instrument: trade.instrument?.trim() || null,
    direction: trade.direction === "long" || trade.direction === "short" ? trade.direction : null,
    plannedRRBucket: rrBucketLabel(planned),
    riskPct,
    accountId: trade.account_id ?? null,
    issueTags: (trade.mistake_tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    tradeDate: trade.trade_date,
    timeMs: Number.isFinite(time) ? time : null,
    setupIntentVersionId: trade.setup_intent_version_id ?? null,
    setupIntentProvenance: trade.setup_intent_provenance ?? null,
    setupIntentRecordedAt: trade.setup_intent_recorded_at ?? null,
    setupAdherence:
      trade.setup_adherence === "followed" ||
      trade.setup_adherence === "deviated" ||
      trade.setup_adherence === "unassessable"
        ? trade.setup_adherence
        : null,
  };
}

type Stats = {
  sampleSize: number;
  resultCount: number;
  rCount: number;
  winRate: number | null;
  avgR: number | null;
  ids: string[];
};

function statsOf(trades: ScopeTrade[]): Stats {
  const resultRows = trades.filter((trade) => trade.result !== null);
  const wins = resultRows.filter((trade) => trade.result === "win").length;
  const rValues = trades.map((trade) => trade.r).filter((value): value is number => value !== null);
  return {
    sampleSize: trades.length,
    resultCount: resultRows.length,
    rCount: rValues.length,
    winRate: resultRows.length ? (wins / resultRows.length) * 100 : null,
    avgR: rValues.length ? rValues.reduce((sum, value) => sum + value, 0) / rValues.length : null,
    ids: trades.map((trade) => trade.id),
  };
}

function confidenceFor(count: number): DiscoveryConfidence {
  if (count >= 60) return "good";
  if (count >= 30) return "medium";
  if (count >= 15) return "low";
  return "early";
}

function dateRange(trades: ScopeTrade[]): string | null {
  const dates = trades
    .map((trade) => trade.tradeDate)
    .filter(Boolean)
    .sort();
  if (!dates.length) return null;
  const format = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return dates[0] === dates.at(-1)
    ? format(dates[0])
    : `${format(dates[0])} – ${format(dates.at(-1)!)}`;
}

function compare(input: {
  id: string;
  category: DiscoveryCategory;
  matching: ScopeTrade[];
  baseline: ScopeTrade[];
  baselineLabel: string;
  condition: DiscoveryCondition;
  conditionLabel: string;
  descriptionContext: string;
  focusCandidate?: BehavioralFocusCandidate | null;
  negativeOnly?: boolean;
}): ScopeDiscovery | null {
  if (input.matching.length < MIN_MATCHING || input.baseline.length < MIN_BASELINE) return null;
  const matching = statsOf(input.matching);
  const baseline = statsOf(input.baseline);
  const deltaR =
    matching.rCount >= MIN_MATCHING &&
    baseline.rCount >= MIN_BASELINE &&
    matching.avgR != null &&
    baseline.avgR != null
      ? matching.avgR - baseline.avgR
      : null;
  const deltaWin =
    matching.resultCount >= MIN_MATCHING &&
    baseline.resultCount >= MIN_BASELINE &&
    matching.winRate != null &&
    baseline.winRate != null
      ? matching.winRate - baseline.winRate
      : null;
  const significant =
    (deltaR != null && Math.abs(deltaR) >= MIN_ABS_DELTA_R) ||
    (deltaWin != null && Math.abs(deltaWin) >= MIN_ABS_DELTA_WIN_RATE);
  if (!significant) return null;
  const direction: DiscoveryDirection =
    deltaR != null
      ? deltaR >= 0
        ? "positive"
        : "negative"
      : (deltaWin ?? 0) >= 0
        ? "positive"
        : "negative";
  if (input.negativeOnly && direction !== "negative") return null;
  const verb = direction === "positive" ? "outperforming" : "underperforming";
  const description = `${input.descriptionContext} The stored outcomes differ from ${input.baselineLabel.toLowerCase()}; this establishes a correlation only.`;
  return {
    id: input.id,
    category: input.category,
    direction,
    title: `${input.conditionLabel} is ${verb} its comparison sample`,
    description,
    conditionChips: [input.condition],
    matchingTradeCount: matching.sampleSize,
    matchingResultCount: matching.resultCount,
    matchingRCount: matching.rCount,
    winRate: matching.winRate,
    avgR: matching.avgR,
    baseline: {
      label: input.baselineLabel,
      sampleSize: baseline.sampleSize,
      resultCount: baseline.resultCount,
      rCount: baseline.rCount,
      winRate: baseline.winRate,
      avgR: baseline.avgR,
    },
    deltaWinRate: deltaWin,
    deltaAvgR: deltaR,
    confidence: confidenceFor(matching.sampleSize),
    caution: SCOPE_CAUTION,
    matchingTradeIds: matching.ids,
    rankScore: Math.abs(deltaR ?? 0) * 2 + Math.abs(deltaWin ?? 0) / 20 + matching.sampleSize / 100,
    dateRange: dateRange(input.matching),
    focusCandidate: direction === "negative" ? (input.focusCandidate ?? null) : null,
  };
}

function scanDimension(
  trades: ScopeTrade[],
  input: {
    key: DiscoveryCategory | "session" | "instrument" | "direction";
    category: DiscoveryCategory;
    valueOf: (trade: ScopeTrade) => string | null;
    labelOf?: (value: string) => string;
  },
): ScopeDiscovery[] {
  const eligible = trades.filter(
    (trade) => input.valueOf(trade) !== null && (trade.result !== null || trade.r !== null),
  );
  const groups = new Map<string, ScopeTrade[]>();
  for (const trade of eligible) {
    const value = input.valueOf(trade)!;
    groups.set(value, [...(groups.get(value) ?? []), trade]);
  }
  const discoveries: ScopeDiscovery[] = [];
  for (const [value, matching] of groups) {
    const label = input.labelOf?.(value) ?? value;
    const baseline = eligible.filter((trade) => input.valueOf(trade) !== value);
    const discovery = compare({
      id: `${input.category}:${input.key}:${value}`,
      category: input.category,
      matching,
      baseline,
      baselineLabel: `Other ${String(input.key)}-known trades`,
      condition: { key: String(input.key), label },
      conditionLabel: label,
      descriptionContext:
        input.category === "category"
          ? "Category is observational context, not proof of Playbook intent or adherence."
          : "This comparison uses only trades with the evidence required for this claim.",
    });
    if (discovery) discoveries.push(discovery);
  }
  return discoveries;
}

function scanPlannedTargets(trades: ScopeTrade[]): ScopeDiscovery[] {
  const known = trades.filter(
    (trade) => trade.plannedRRBucket && (trade.result !== null || trade.r !== null),
  );
  const buckets = new Map<string, ScopeTrade[]>();
  for (const trade of known) {
    buckets.set(trade.plannedRRBucket!, [...(buckets.get(trade.plannedRRBucket!) ?? []), trade]);
  }
  const result: ScopeDiscovery[] = [];
  for (const [bucket, matching] of buckets) {
    const discovery = compare({
      id: `risk:planned-target:${bucket}`,
      category: "risk",
      matching,
      baseline: known.filter((trade) => trade.plannedRRBucket !== bucket),
      baselineLabel: "Trades with other recorded planned targets",
      condition: { key: "planned_rr", label: bucket },
      conditionLabel: `${bucket} planned targets`,
      descriptionContext:
        "Planned R:R is target context only; this comparison does not establish execution adherence.",
    });
    if (discovery) result.push(discovery);
  }
  return result;
}

function scanRiskSizing(trades: ScopeTrade[]): ScopeDiscovery[] {
  const byAccount = new Map<string, ScopeTrade[]>();
  for (const trade of trades.filter((item) => item.accountId && item.riskPct != null)) {
    byAccount.set(trade.accountId!, [...(byAccount.get(trade.accountId!) ?? []), trade]);
  }
  const result: ScopeDiscovery[] = [];
  for (const [accountId, accountTrades] of byAccount) {
    const ordered = accountTrades.map((trade) => trade.riskPct!).sort((a, b) => a - b);
    if (ordered.length < MIN_MATCHING + MIN_BASELINE) continue;
    const median = ordered[Math.floor(ordered.length / 2)];
    if (!(median > 0)) continue;
    const higher = accountTrades.filter((trade) => trade.riskPct! > median * 1.5);
    const usual = accountTrades.filter((trade) => trade.riskPct! <= median * 1.5);
    const discovery = compare({
      id: `risk:sizing:${accountId}`,
      category: "risk",
      matching: higher,
      baseline: usual,
      baselineLabel: "Lower-risk trades in the same account",
      condition: { key: "risk", label: "Risk above 1.5× account median" },
      conditionLabel: "Higher relative risk",
      descriptionContext:
        "Risk is normalized within one account so unlike account contexts are not compared.",
      negativeOnly: true,
      focusCandidate: {
        behavior: "Increasing risk above the account's usual range",
        triggerSituation: "When a planned trade would exceed 1.5× this account's usual risk",
        intendedBehavior: "Return to the pre-planned account risk instead of increasing size",
        evidenceDefinition:
          "Future higher-risk opportunities manually assessed for whether the trader returned to their chosen account risk before entry; P/L is not used.",
      },
    });
    if (discovery) result.push(discovery);
  }
  return result;
}

function scanExplicitExecutionIssues(trades: ScopeTrade[]): ScopeDiscovery[] {
  const explicitlyTagged = trades.filter(
    (trade) => trade.issueTags.length > 0 && (trade.result !== null || trade.r !== null),
  );
  const byTag = new Map<string, ScopeTrade[]>();
  for (const trade of explicitlyTagged) {
    for (const tag of trade.issueTags) byTag.set(tag, [...(byTag.get(tag) ?? []), trade]);
  }
  const result: ScopeDiscovery[] = [];
  for (const [tag, matching] of byTag) {
    const matchingIds = new Set(matching.map((trade) => trade.id));
    // Baseline contains other explicitly assessed issue-tagged trades. Untagged
    // rows are unknown, never mislabeled as clean execution.
    const baseline = explicitlyTagged.filter((trade) => !matchingIds.has(trade.id));
    const discovery = compare({
      id: `execution:issue:${tag}`,
      category: "execution",
      matching,
      baseline,
      baselineLabel: "Other explicitly issue-tagged trades",
      condition: { key: "issue", label: tag },
      conditionLabel: `"${tag}" occurrences`,
      descriptionContext:
        "Only explicit execution-issue evidence participates; no missing tag is treated as clean.",
      negativeOnly: true,
      focusCandidate: {
        behavior: tag,
        triggerSituation: `When the situation that usually precedes "${tag}" appears`,
        intendedBehavior: `Pause and follow the chosen process instead of repeating "${tag}"`,
        evidenceDefinition:
          "Future genuinely relevant trades assessed by the trader as Followed, Deviated, or Unassessable.",
      },
    });
    if (discovery) result.push(discovery);
  }
  return result;
}

function scanTimingAndVolume(trades: ScopeTrade[]): ScopeDiscovery[] {
  const result: ScopeDiscovery[] = [];
  const timed = trades
    .filter((trade) => trade.timeMs != null && (trade.result !== null || trade.r !== null))
    .sort((a, b) => a.timeMs! - b.timeMs! || a.id.localeCompare(b.id));
  const fast: ScopeTrade[] = [];
  for (let index = 1; index < timed.length; index += 1) {
    const previous = timed[index - 1];
    const current = timed[index];
    if (
      previous.result === "loss" &&
      current.timeMs! > previous.timeMs! &&
      current.timeMs! - previous.timeMs! <= 20 * 60 * 1000
    ) {
      fast.push(current);
    }
  }
  const fastIds = new Set(fast.map((trade) => trade.id));
  const fastDiscovery = compare({
    id: "execution:timing-after-loss",
    category: "execution",
    matching: fast,
    baseline: timed.filter((trade) => !fastIds.has(trade.id)),
    baselineLabel: "Other trades with recorded times",
    condition: { key: "timing", label: "Within 20 minutes after a loss" },
    conditionLabel: "Quick entries after a loss",
    descriptionContext:
      "Timing is observed; this does not infer revenge trading or the trader's emotional state.",
    negativeOnly: true,
    focusCandidate: {
      behavior: "Entering again within 20 minutes after a loss",
      triggerSituation: "When another opportunity appears within 20 minutes after a loss",
      intendedBehavior: "Pause and deliberately reassess before choosing whether to enter",
      evidenceDefinition:
        "Future quick-entry opportunities manually assessed for whether the deliberate reset was followed.",
    },
  });
  if (fastDiscovery) result.push(fastDiscovery);

  const byDay = new Map<string, ScopeTrade[]>();
  for (const trade of trades.filter((item) => item.result !== null || item.r !== null)) {
    byDay.set(trade.tradeDate, [...(byDay.get(trade.tradeDate) ?? []), trade]);
  }
  const highVolume: ScopeTrade[] = [];
  const measured: ScopeTrade[] = [];
  for (const dayTrades of byDay.values()) {
    if (dayTrades.length >= 5) highVolume.push(...dayTrades);
    else if (dayTrades.length <= 3) measured.push(...dayTrades);
  }
  const volumeDiscovery = compare({
    id: "execution:high-volume-days",
    category: "execution",
    matching: highVolume,
    baseline: measured,
    baselineLabel: "One-to-three-trade days",
    condition: { key: "volume", label: "Five or more trades in a day" },
    conditionLabel: "Higher-volume days",
    descriptionContext:
      "Daily count is observed; the comparison does not automatically classify a day as overtrading.",
    negativeOnly: true,
    focusCandidate: {
      behavior: "Continuing to trade after four entries in one day",
      triggerSituation: "When considering a fifth trade in the same journal day",
      intendedBehavior:
        "Pause and require an explicit deliberate reason before taking another trade",
      evidenceDefinition:
        "Future fifth-or-later opportunities manually assessed for whether the deliberate pause was followed.",
    },
  });
  if (volumeDiscovery) result.push(volumeDiscovery);
  return result;
}

function dedupeAndRank(discoveries: ScopeDiscovery[]): ScopeDiscovery[] {
  const signatures = new Set<string>();
  return [...discoveries]
    .sort((a, b) => b.rankScore - a.rankScore || a.id.localeCompare(b.id))
    .filter((discovery) => {
      const signature = [...discovery.matchingTradeIds].sort().join(",");
      if (signatures.has(signature)) return false;
      signatures.add(signature);
      return true;
    });
}

export function buildScopeDiscoveries(source: DbTrade[]): ScopeScanResult {
  const realSource = source.filter((trade) => !isPaperTrade(trade));
  const trades = realSource.map(toScopeTrade);
  const evidence = trades.filter((trade) => trade.result !== null || trade.r !== null);
  const overall = statsOf(evidence);
  const discoveries = dedupeAndRank([
    ...scanDimension(evidence, {
      key: "category",
      category: "category",
      valueOf: (trade) => trade.category,
    }),
    ...scanDimension(evidence, {
      key: "session",
      category: "category",
      valueOf: (trade) => trade.session,
      labelOf: sessionLabel,
    }),
    ...scanDimension(evidence, {
      key: "instrument",
      category: "category",
      valueOf: (trade) => trade.instrument,
    }),
    ...scanDimension(evidence, {
      key: "direction",
      category: "category",
      valueOf: (trade) => trade.direction,
      labelOf: (value) => (value === "long" ? "Long" : "Short"),
    }),
    ...scanPlannedTargets(evidence),
    ...scanRiskSizing(evidence),
    ...scanExplicitExecutionIssues(evidence),
    ...scanTimingAndVolume(evidence),
  ]);
  return {
    evidenceTradeCount: evidence.length,
    resultEvidenceCount: trades.filter((trade) => trade.result !== null).length,
    rEvidenceCount: trades.filter((trade) => trade.r !== null).length,
    reviewedCount: realSource.filter((trade) => getReviewStatus(trade) === "reviewed").length,
    baselineWinRate: overall.winRate,
    baselineAvgR: overall.avgR,
    discoveries,
  };
}

export function buildStandardChallenges(
  source: DbTrade[],
  standards: readonly {
    id: string;
    title: string;
    status: string;
    current_version: { id: string; effective_from: string } | null;
  }[],
): StandardChallenge[] {
  const trades = source.filter((trade) => !isPaperTrade(trade)).map(toScopeTrade);
  const allR = trades.filter((trade) => trade.r !== null);
  const challenges: StandardChallenge[] = [];
  for (const standard of standards) {
    const version = standard.current_version;
    if (standard.status !== "active" || !version) continue;
    const matching = trades.filter(
      (trade) =>
        trade.setupIntentVersionId === version.id &&
        trade.setupIntentProvenance === "capture" &&
        Boolean(
          trade.setupIntentRecordedAt &&
          Date.parse(trade.setupIntentRecordedAt) >= Date.parse(version.effective_from),
        ) &&
        trade.setupAdherence === "followed" &&
        trade.r !== null,
    );
    if (matching.length < 3) continue;
    const ids = new Set(matching.map((trade) => trade.id));
    const baseline = allR.filter((trade) => !ids.has(trade.id));
    const matchingStats = statsOf(matching);
    const baselineStats = statsOf(baseline);
    if (matchingStats.avgR == null || matchingStats.avgR >= -0.2) continue;
    if (baselineStats.avgR != null && matchingStats.avgR > baselineStats.avgR - MIN_ABS_DELTA_R) {
      continue;
    }
    challenges.push({
      id: `standard:${standard.id}:${version.id}`,
      standardId: standard.id,
      standardVersionId: version.id,
      standardTitle: standard.title,
      title: `Current standard “${standard.title}” warrants review`,
      description:
        "These trades explicitly referenced this current version and were assessed as followed, yet their realized-R evidence is materially weak. Scope is challenging the standard for trader review, not changing it.",
      matchingTradeIds: matchingStats.ids,
      sampleSize: matchingStats.sampleSize,
      avgR: matchingStats.avgR,
      baselineAvgR: baselineStats.avgR,
    });
  }
  return challenges;
}

export const CONFIDENCE_LABEL: Record<DiscoveryConfidence, string> = {
  early: "Early clue",
  low: "Low confidence",
  medium: "Medium confidence",
  good: "Good confidence",
};
