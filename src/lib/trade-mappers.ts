import type { TradeRow } from "@/lib/analytics";

// DB row from the `trades` table (shape returned by listTrades).
export type DbTrade = {
  id: string;
  trade_date: string;
  trade_time: string | null;
  market: string;
  instrument: string;
  direction: string;
  result: string | null;
  grade: string | null;
  session: string | null;
  killzone: string | null;
  achieved_rr: number | string | null;
  planned_rr: number | string | null;
  reasoning: string | null;
  lessons_learned: string | null;
  notes: string | null;
  emotion_before: string | null;
  emotion_during: string | null;
  emotion_after: string | null;
  emotion_tags: string[] | null;
  mistake_tags: string[] | null;
  categories: string[] | null;
  subcategories: string[] | null;
  is_shared: boolean | null;
  in_killzone: boolean | null;
  account_id?: string | null;
  created_at?: string;
  trade_screenshots?: { id: string }[] | null;
};


// Project a DB trade onto the analytics input shape.
export function toAnalytics(t: DbTrade): TradeRow {
  return {
    result: t.result,
    achieved_rr: t.achieved_rr,
    grade: t.grade,
    session: t.session,
    killzone: t.killzone,
    market: t.market,
    trade_date: t.trade_date,
    emotion_before: t.emotion_before,
    emotion_during: t.emotion_during,
    emotion_after: t.emotion_after,
    categories: t.categories ?? [],
    subcategories: t.subcategories ?? [],
    mistake_tags: t.mistake_tags ?? [],
  };
}

export function rrNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
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
  let curW = 0, curL = 0, lonW = 0, lonL = 0;
  for (const t of sorted) {
    if (t.result === "win") { curW += 1; curL = 0; lonW = Math.max(lonW, curW); }
    else if (t.result === "loss") { curL += 1; curW = 0; lonL = Math.max(lonL, curL); }
    else { /* breakeven / null does not reset streaks */ }
  }
  return { currentWin: curW, currentLoss: curL, longestWin: lonW, longestLoss: lonL };
}

// Format a `trade_date` (YYYY-MM-DD) + `trade_time` (HH:MM:SS) for display.
export function formatTradeWhen(date: string, time: string | null): string {
  try {
    const d = new Date(`${date}T${time ?? "00:00:00"}`);
    if (isNaN(d.getTime())) return date;
    const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (!time) return datePart;
    const timePart = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    return `${datePart}, ${timePart}`;
  } catch {
    return date;
  }
}
