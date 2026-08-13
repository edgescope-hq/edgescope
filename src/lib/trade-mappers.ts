import type { TradeRow } from "@/lib/analytics";

// DB row from the `trades` table (shape returned by listTrades).
export type DbTrade = {
  id: string;
  status?: string | null;
  trade_date: string;
  trade_time: string | null;
  market: string;
  instrument: string | null;
  direction: string | null;
  result: string | null;
  grade: string | null;
  session: string | null;
  killzone: string | null;
  achieved_rr: number | string | null;
  planned_rr: number | string | null;
  risk_amount: number | string | null;
  reward_amount: number | string | null;
  pnl_amount: number | string | null;
  risk_percentage?: number | string | null;
  account_size?: number | string | null;
  reasoning: string | null;
  lessons_learned: string | null;
  notes: string | null;
  mistakes_made: string | null;
  private_notes: string | null;
  emotion_before: string | null;
  emotion_during: string | null;
  emotion_after: string | null;
  emotion_tags: string[] | null;
  mistake_tags: string[] | null;
  categories: string[] | null;
  /** Explicit primary observational category. Legacy categories[] remains intact. */
  primary_category?: string | null;
  subcategories: string[] | null;
  is_shared: boolean | null;
  is_paper?: boolean | null;
  in_killzone: boolean | null;
  review_completed_at?: string | null;
  setup_intent_version_id?: string | null;
  setup_intent_provenance?: "capture" | "retrospective_review" | null;
  setup_intent_recorded_at?: string | null;
  setup_adherence?: "followed" | "deviated" | "unassessable" | null;
  setup_adherence_recorded_at?: string | null;
  entry_model?: string | null;
  market_condition?: string | null;
  entry_timeframe?: string | null;
  news_involvement?: string | null;
  exit_reason?: string | null;
  trade_management?: string[] | null;
  custom_tags?: string[] | null;
  account_id?: string | null;
  created_at?: string;
  trade_screenshots?: { id: string }[] | null;
};

// Project a DB trade onto the analytics input shape.
export function toAnalytics(t: DbTrade): TradeRow {
  const category = primaryTradeCategory(t);
  return {
    id: t.id,
    result: t.result,
    achieved_rr: realizedR(t),
    grade: t.grade,
    session: t.session,
    killzone: t.killzone,
    market: t.market,
    trade_date: t.trade_date,
    trade_time: t.trade_time,
    created_at: t.created_at ?? null,
    emotion_before: t.emotion_before,
    emotion_during: t.emotion_during,
    emotion_after: t.emotion_after,
    // Analytics owns the current one-primary-Category contract. Additional
    // legacy strings remain available on the source trade and in export, but
    // are not silently promoted into multiple current classifications.
    categories: category ? [category] : [],
    subcategories: t.subcategories ?? [],
    mistake_tags: t.mistake_tags ?? [],
  };
}

function finiteNumber(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function recordedR(v: number | string | null | undefined): number | null {
  return finiteNumber(v);
}

function recordedRForResult(
  value: number | string | null | undefined,
  result: "win" | "loss" | "breakeven",
): number | null {
  const recorded = recordedR(value);
  if (recorded == null) return null;
  if (result === "win" && recorded < 0) return null;
  if (result === "loss" && recorded > 0) return null;
  if (result === "breakeven" && recorded !== 0) return null;
  return recorded;
}

export function primaryTradeCategory(t: {
  primary_category?: string | null;
  categories?: string[] | null;
}): string | null {
  const explicit = t.primary_category?.trim();
  if (explicit) return explicit;
  return (t.categories ?? []).find((value) => Boolean(value?.trim()))?.trim() || null;
}

export type RealizedRSource = "derived_risk_pnl" | "recorded_legacy" | "missing";

export type RealizedRContract = {
  value: number | null;
  source: RealizedRSource;
  eligible: boolean;
};

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localTimeKey(date = new Date()): string {
  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join(":");
}

export function isResultComplete(t: {
  status?: string | null;
  instrument?: string | null;
  session?: string | null;
  direction?: string | null;
  result?: string | null;
  planned_rr?: number | string | null;
  risk_amount?: number | string | null;
  pnl_amount?: number | string | null;
  reward_amount?: number | string | null;
}): boolean {
  return realizedR(t) !== null;
}

export function realizedR(t: {
  status?: string | null;
  result?: string | null;
  risk_amount?: number | string | null;
  pnl_amount?: number | string | null;
  reward_amount?: number | string | null;
  achieved_rr?: number | string | null;
}): number | null {
  return realizedRContract(t).value;
}

/**
 * Canonical realized-R evidence contract used everywhere in EdgeScope.
 *
 * - A known closed result plus positive Risk and finite P/L derives R.
 * - A finite historical achieved R is a provenance-marked fallback only when
 *   that source pair is unavailable.
 * - Planned R:R never participates.
 * - Missing or invalid evidence remains unknown.
 */
export function realizedRContract(t: {
  status?: string | null;
  result?: string | null;
  risk_amount?: number | string | null;
  pnl_amount?: number | string | null;
  reward_amount?: number | string | null;
  achieved_rr?: number | string | null;
}): RealizedRContract {
  if (t.status === "open") return { value: null, source: "missing", eligible: false };
  if (t.result !== "win" && t.result !== "loss" && t.result !== "breakeven") {
    return { value: null, source: "missing", eligible: false };
  }
  const risk = finiteNumber(t.risk_amount);
  const recordedPnl = finiteNumber(t.pnl_amount) ?? finiteNumber(t.reward_amount);
  // Risk and P/L are the canonical source for live trades. The persisted value is
  // retained as a compatibility fallback for valid historical imports that did not
  // capture the pair. This keeps every Analytics consumer on one result invariant.
  if (risk == null || risk <= 0 || recordedPnl == null) {
    const legacy = recordedRForResult(t.achieved_rr, t.result);
    return legacy == null
      ? { value: null, source: "missing", eligible: false }
      : { value: legacy, source: "recorded_legacy", eligible: true };
  }

  const signedPnl =
    t.result === "loss" ? -Math.abs(recordedPnl) : t.result === "win" ? Math.abs(recordedPnl) : 0;
  const value = signedPnl / risk;
  return Number.isFinite(value)
    ? { value: Number(value.toFixed(2)), source: "derived_risk_pnl", eligible: true }
    : { value: null, source: "missing", eligible: false };
}

export function isPaperTrade(t: { is_paper?: boolean | null }): boolean {
  return t.is_paper === true;
}

export function tradeDollarPnl(t: {
  status?: string | null;
  achieved_rr?: number | string | null;
  risk_amount?: number | string | null;
  risk_percentage?: number | string | null;
  account_size?: number | string | null;
  result?: string | null;
  reward_amount?: number | string | null;
  pnl_amount?: number | string | null;
}): number | null {
  if (t.result !== "win" && t.result !== "loss" && t.result !== "breakeven") return null;

  const actual = finiteNumber(t.pnl_amount) ?? finiteNumber(t.reward_amount);
  if (actual != null) {
    if (t.result === "loss") return -Math.abs(actual);
    if (t.result === "win") return Math.abs(actual);
    if (t.result === "breakeven") return 0;
    return actual;
  }

  const r = realizedR(t);
  const riskAmount = finiteNumber(t.risk_amount);
  if (r != null && riskAmount != null && riskAmount > 0) {
    const pnl = r * riskAmount;
    return Number.isFinite(pnl) ? pnl : null;
  }

  const riskPct = finiteNumber(t.risk_percentage);
  const accountSize = finiteNumber(t.account_size);
  if (r == null || riskPct == null || accountSize == null) return null;

  const pnl = r * (riskPct / 100) * accountSize;
  return Number.isFinite(pnl) ? pnl : null;
}

export function sumTradeDollarPnl<T extends Parameters<typeof tradeDollarPnl>[0]>(
  trades: readonly T[],
): number {
  return trades.reduce((sum, trade) => sum + (tradeDollarPnl(trade) ?? 0), 0);
}

export function numberTradesById<T extends { id: string }>(
  trades: readonly T[],
): Map<string, number> {
  const total = trades.length;
  return new Map(trades.map((trade, index) => [trade.id, total - index]));
}

// Calculate current/longest winning + losing streaks (chronological order).
export function streaks(trades: DbTrade[]): {
  currentWin: number;
  currentLoss: number;
  longestWin: number;
  longestLoss: number;
} {
  const sorted = [...trades].sort((a, b) =>
    (a.trade_date + (a.trade_time ?? "")).localeCompare(b.trade_date + (b.trade_time ?? "")),
  );
  let curW = 0,
    curL = 0,
    lonW = 0,
    lonL = 0;
  for (const t of sorted) {
    if (t.result === "win") {
      curW += 1;
      curL = 0;
      lonW = Math.max(lonW, curW);
    } else if (t.result === "loss") {
      curL += 1;
      curW = 0;
      lonL = Math.max(lonL, curL);
    } else {
      /* breakeven / null does not reset streaks */
    }
  }
  return { currentWin: curW, currentLoss: curL, longestWin: lonW, longestLoss: lonL };
}

// Format a `trade_date` (YYYY-MM-DD) + `trade_time` (HH:MM:SS) for display.
export function formatTradeWhen(date: string, time: string | null): string {
  try {
    const d = new Date(`${date}T${time ?? "00:00:00"}`);
    if (isNaN(d.getTime())) return date;
    const datePart = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    if (!time) return datePart;
    const timePart = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return `${datePart}, ${timePart}`;
  } catch {
    return date;
  }
}
