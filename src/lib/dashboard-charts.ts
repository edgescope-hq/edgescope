import { realizedR, realizedRContract } from "@/lib/trade-mappers";

type RiskPnlTrade = {
  status?: string | null;
  result?: string | null;
  risk_amount?: number | string | null;
  pnl_amount?: number | string | null;
  reward_amount?: number | string | null;
  achieved_rr?: number | string | null;
  trade_date?: string | null;
  id?: string | null;
  trade_number?: number | null;
  created_at?: string | null;
};

export function hasValidRiskPnlPair(trade: RiskPnlTrade): boolean {
  return realizedRContract(trade).eligible;
}

export function qualifyingRValue(trade: RiskPnlTrade): number | null {
  return realizedR(trade);
}

export function dashboardChartEligibility(trades: readonly RiskPnlTrade[]) {
  const validTradeCount = trades.filter(hasValidRiskPnlPair).length;
  return {
    eligible: validTradeCount > 0,
    validTradeCount,
  };
}

export type DashboardChartPoint = {
  /** A stable categorical key; never a synthetic zero-origin point. */
  point: string;
  date: string;
  value: number;
  tradeCount: number;
};

export type DashboardChartDomain = {
  start: number;
  end: number;
};

export function dashboardChartTime(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return Date.parse(date);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function dashboardChartDateDomain(
  points: readonly DashboardChartPoint[],
): DashboardChartDomain | null {
  const times = points.map((point) => dashboardChartTime(point.date)).filter(Number.isFinite);
  if (times.length === 0) return null;
  return { start: Math.min(...times), end: Math.max(...times) };
}

export function dashboardChartDateTicks(
  points: readonly DashboardChartPoint[],
  maxCount: number,
): number[] {
  if (maxCount <= 0) return [];
  const times = [
    ...new Set(points.map((point) => dashboardChartTime(point.date)).filter(Number.isFinite)),
  ].sort((a, b) => a - b);
  if (times.length <= maxCount) return times;
  if (maxCount === 1) return [times[0]!];

  return Array.from({ length: maxCount }, (_, index) => {
    const candidateIndex = Math.round((index * (times.length - 1)) / (maxCount - 1));
    return times[candidateIndex]!;
  }).filter((tick, index, ticks) => index === 0 || tick !== ticks[index - 1]);
}

export type DashboardMovementTone = "rising" | "falling" | "flat";

export type DashboardMovementStop = {
  /** Normalized horizontal position used by the monthly chart's stroke gradient. */
  offset: number;
  tone: DashboardMovementTone;
};

/**
 * Produces abrupt gradient transitions at real turning points so the monthly
 * curve can distinguish rising and falling movement without changing its data.
 */
export function dashboardMovementStops(
  points: readonly DashboardChartPoint[],
): DashboardMovementStop[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return [
      { offset: 0, tone: "flat" },
      { offset: 1, tone: "flat" },
    ];
  }

  const times = points.map((point) => Date.parse(`${point.date}T00:00:00Z`));
  const firstTime = times[0]!;
  const lastTime = times.at(-1)!;
  const hasTimeSpan =
    times.every(Number.isFinite) && Number.isFinite(lastTime) && lastTime > firstTime;
  const positions = points.map((_, index) =>
    hasTimeSpan
      ? (times[index]! - firstTime) / (lastTime - firstTime)
      : index / (points.length - 1),
  );
  const movementTone = (from: number, to: number): DashboardMovementTone =>
    to > from ? "rising" : to < from ? "falling" : "flat";
  const stops: DashboardMovementStop[] = [];
  const append = (offset: number, tone: DashboardMovementTone) => {
    const normalizedOffset = Math.min(1, Math.max(0, offset));
    const previous = stops.at(-1);
    if (previous?.offset === normalizedOffset && previous.tone === tone) return;
    stops.push({ offset: normalizedOffset, tone });
  };

  let priorTone = movementTone(points[0]!.value, points[1]!.value);
  append(positions[0]!, priorTone);
  for (let index = 1; index < points.length; index += 1) {
    const tone = movementTone(points[index - 1]!.value, points[index]!.value);
    const segmentStart = positions[index - 1]!;
    if (tone !== priorTone) {
      append(segmentStart, priorTone);
      append(segmentStart, tone);
    }
    append(positions[index]!, tone);
    priorTone = tone;
  }
  return stops;
}

/**
 * Builds the chart population from the product-wide realized-R contract.
 * Derived Risk + P/L takes precedence; a finite recorded legacy R remains
 * eligible only when that pair is unavailable.
 */
export function dashboardDailyRPoints(trades: readonly RiskPnlTrade[]): DashboardChartPoint[] {
  const daily = new Map<string, { value: number; tradeCount: number }>();
  for (const trade of trades) {
    if (!hasValidRiskPnlPair(trade)) continue;
    const date = trade.trade_date?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const current = daily.get(date) ?? { value: 0, tradeCount: 0 };
    current.value += qualifyingRValue(trade)!;
    current.tradeCount += 1;
    daily.set(date, current);
  }

  return [...daily.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, aggregate]) => ({
      point: date,
      date,
      value: aggregate.value,
      tradeCount: aggregate.tradeCount,
    }));
}

export function dashboardCumulativeRPoints(trades: readonly RiskPnlTrade[]): DashboardChartPoint[] {
  let cumulativeR = 0;
  return dashboardDailyRPoints(trades).map((point) => {
    cumulativeR += point.value;
    return {
      ...point,
      value: cumulativeR,
    };
  });
}

export function formatRAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) < 0.005) return "";
  const decimals = Math.abs(value) > 0 && Math.abs(value) < 1 ? 2 : 1;
  const rounded = Number(value.toFixed(decimals));
  return `${rounded > 0 ? "+" : ""}${rounded}R`;
}

export function dashboardPointTick(point: string, previousPoint?: string): string {
  const date = point.split("|")[0] ?? "";
  const previousDate = previousPoint?.split("|")[0] ?? "";
  return date === previousDate ? "" : compactDateTick(date);
}

export function calendarDayTick(dateKey: string): string {
  const match = /^\d{4}-\d{2}-(\d{2})$/.exec(dateKey);
  return match ? String(Number(match[1])) : dateKey;
}

export function compactDateTick(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return dateKey;
  const month = new Date(2000, Number(match[2]) - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
  return `${month} ${Number(match[3])}`;
}
