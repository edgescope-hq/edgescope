// Pure, client-safe analytics over a user's trades.
// Keeps all dashboard/analytics math in one place.

export type TradeRow = {
  id?: string;
  result: string | null;
  achieved_rr: number | string | null;
  grade: string | null;
  session: string | null;
  killzone: string | null;
  market: string;
  trade_date: string;
  trade_time?: string | null;
  created_at?: string | null;
  emotion_before: string | null;
  emotion_during: string | null;
  emotion_after: string | null;
  categories: string[];
  subcategories: string[];
  mistake_tags: string[];
};

const num = (v: number | string | null): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function rrAvg(trades: TradeRow[]): number | null {
  const rrs = trades.map((t) => num(t.achieved_rr)).filter((n): n is number => n !== null);
  if (!rrs.length) return null;
  return rrs.reduce((a, b) => a + b, 0) / rrs.length;
}

export function computeWinRate(trades: { result: string | null }[]): number | null {
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const breakeven = trades.filter((t) => t.result === "breakeven").length;
  const decided = wins + losses + breakeven;
  return decided > 0 ? (wins / decided) * 100 : null;
}

function winRate(trades: TradeRow[]): number | null {
  return computeWinRate(trades);
}

export type GroupStat = {
  key: string;
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  avgRR: number | null;
};

export function groupBy(
  trades: TradeRow[],
  keyOf: (t: TradeRow) => string[] | string | null,
): GroupStat[] {
  const map = new Map<string, TradeRow[]>();
  for (const t of trades) {
    const raw = keyOf(t);
    const keys = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const k of keys) {
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
  }
  return Array.from(map.entries())
    .map(([key, group]) => ({
      key,
      count: group.length,
      wins: group.filter((t) => t.result === "win").length,
      losses: group.filter((t) => t.result === "loss").length,
      breakeven: group.filter((t) => t.result === "breakeven").length,
      winRate: winRate(group),
      avgRR: rrAvg(group),
    }))
    .sort((a, b) => b.count - a.count);
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

export function overview(trades: TradeRow[]) {
  const total = trades.length;
  const wins = trades.filter((t) => t.result === "win").length;
  const losses = trades.filter((t) => t.result === "loss").length;
  const breakeven = trades.filter((t) => t.result === "breakeven").length;

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

  const thisMonthTrades = trades.filter((t) => monthKey(t.trade_date) === thisMonth);
  const prevMonthTrades = trades.filter((t) => monthKey(t.trade_date) === prevMonth);

  return {
    total,
    wins,
    losses,
    breakeven,
    winRate: winRate(trades),
    avgRR: rrAvg(trades),
    thisMonth: {
      count: thisMonthTrades.length,
      winRate: winRate(thisMonthTrades),
      avgRR: rrAvg(thisMonthTrades),
    },
    prevMonth: {
      count: prevMonthTrades.length,
      winRate: winRate(prevMonthTrades),
      avgRR: rrAvg(prevMonthTrades),
    },
  };
}

export function gradeStats(trades: TradeRow[]): GroupStat[] {
  const order = ["A+", "A", "B+", "B", "C", "D"];
  const stats = groupBy(trades, (t) => t.grade);
  return stats.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

export function sessionStats(trades: TradeRow[]): GroupStat[] {
  return groupBy(trades, (t) => t.session);
}

export function categoryStats(trades: TradeRow[]): GroupStat[] {
  return groupBy(trades, (t) => t.categories);
}

export function subcategoryStats(trades: TradeRow[]): GroupStat[] {
  return groupBy(trades, (t) => t.subcategories);
}

export function marketStats(trades: TradeRow[]): GroupStat[] {
  return groupBy(trades, (t) => t.market);
}

export function killzoneStats(trades: TradeRow[]): GroupStat[] {
  return groupBy(trades, (t) => t.killzone);
}

export function emotionStats(
  trades: TradeRow[],
  stage: "before" | "during" | "after",
): GroupStat[] {
  const field = `emotion_${stage}` as keyof Pick<
    TradeRow,
    "emotion_before" | "emotion_during" | "emotion_after"
  >;
  return groupBy(trades, (t) => t[field]);
}

export function mistakeStats(trades: TradeRow[]): GroupStat[] {
  return groupBy(trades, (t) => t.mistake_tags);
}

// Best/worst by win rate, requiring a minimum sample to be meaningful.
export function bestWorst(
  stats: GroupStat[],
  minCount = 2,
): { best: GroupStat | null; worst: GroupStat | null } {
  const eligible = stats.filter((s) => s.count >= minCount && s.winRate != null);
  if (!eligible.length) return { best: null, worst: null };
  const sorted = [...eligible].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

export function mostCommon(stats: GroupStat[]): GroupStat | null {
  return stats.length ? stats[0] : null;
}

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * `trade_date` is a journal date, not an instant. Parse its calendar fields
 * directly so browser/UTC conversion can never move a Saturday or Sunday trade.
 */
export function weekdayFromTradeDate(tradeDate: string): (typeof WEEKDAYS)[number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tradeDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return null;
  const sundayFirst = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ] as const;
  return sundayFirst[date.getDay()];
}

export function weekdayStats(trades: TradeRow[]): GroupStat[] {
  const stats = groupBy(trades, (t) => weekdayFromTradeDate(t.trade_date));
  return stats.sort(
    (a, b) =>
      WEEKDAYS.indexOf(a.key as (typeof WEEKDAYS)[number]) -
      WEEKDAYS.indexOf(b.key as (typeof WEEKDAYS)[number]),
  );
}

export function monthStats(trades: TradeRow[]): GroupStat[] {
  return groupBy(trades, (t) => monthKey(t.trade_date)).sort((a, b) => a.key.localeCompare(b.key));
}

function tradeOrderKey(trade: TradeRow): string {
  return [trade.trade_date, trade.trade_time ?? "", trade.created_at ?? "", trade.id ?? ""].join(
    "|",
  );
}

// Cumulative R equity curve ordered by trade sequence, preserving same-date trades.
export function equityCurve(
  trades: TradeRow[],
): { date: string; cumR: number; tradeIndex: number }[] {
  const sorted = [...trades]
    .filter((t) => num(t.achieved_rr) !== null)
    .sort((a, b) => tradeOrderKey(a).localeCompare(tradeOrderKey(b)));
  let cum = 0;
  const points = [{ date: "Start", cumR: 0, tradeIndex: 0 }];
  sorted.forEach((t, index) => {
    cum += num(t.achieved_rr)!;
    points.push({ date: t.trade_date, cumR: Number(cum.toFixed(2)), tradeIndex: index + 1 });
  });
  return points;
}

export const fmtPct = (v: number | null): string => (v == null ? "—" : `${v.toFixed(1)}%`);
export const fmtRR = (v: number | null): string => (v == null ? "—" : `${v.toFixed(2)}R`);
