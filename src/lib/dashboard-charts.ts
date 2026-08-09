export const DASHBOARD_CHART_MIN_VALID_R_TRADES = 3;

type RiskPnlTrade = {
  result?: string | null;
  risk_amount?: number | string | null;
  pnl_amount?: number | string | null;
  reward_amount?: number | string | null;
  trade_date?: string | null;
  id?: string | null;
  trade_number?: number | null;
  created_at?: string | null;
};

function finiteNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function hasValidRiskPnlPair(trade: RiskPnlTrade): boolean {
  if (trade.result !== "win" && trade.result !== "loss" && trade.result !== "breakeven") {
    return false;
  }
  const risk = finiteNumber(trade.risk_amount);
  const pnl = finiteNumber(trade.pnl_amount ?? trade.reward_amount);
  return risk !== null && risk > 0 && pnl !== null;
}

export function qualifyingRValue(trade: RiskPnlTrade): number | null {
  if (!hasValidRiskPnlPair(trade)) return null;
  const risk = finiteNumber(trade.risk_amount)!;
  const rawPnl = finiteNumber(trade.pnl_amount ?? trade.reward_amount)!;
  const pnl =
    trade.result === "loss" ? -Math.abs(rawPnl) : trade.result === "win" ? Math.abs(rawPnl) : 0;
  const value = pnl / risk;
  return Number.isFinite(value) ? value : null;
}

export function dashboardChartEligibility(
  trades: readonly RiskPnlTrade[],
  required = DASHBOARD_CHART_MIN_VALID_R_TRADES,
) {
  const validTradeCount = trades.filter(hasValidRiskPnlPair).length;
  return {
    eligible: validTradeCount >= required,
    validTradeCount,
    missingTradeCount: Math.max(0, required - validTradeCount),
  };
}

export function missingRTradeHeadline(missingTradeCount: number): string {
  return `${missingTradeCount} more trade${missingTradeCount === 1 ? "" : "s"} with R data needed`;
}

export type DashboardChartPoint = {
  /** A stable categorical key; never a synthetic zero-origin point. */
  point: string;
  date: string;
  cumulativeR: number;
};

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
    hasTimeSpan ? (times[index]! - firstTime) / (lastTime - firstTime) : index / (points.length - 1),
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

  let priorTone = movementTone(points[0]!.cumulativeR, points[1]!.cumulativeR);
  append(positions[0]!, priorTone);
  for (let index = 1; index < points.length; index += 1) {
    const tone = movementTone(points[index - 1]!.cumulativeR, points[index]!.cumulativeR);
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
 * Builds the chart population from canonical realised-R inputs only.  The
 * persisted `achieved_rr` value is intentionally not used: a stale saved R
 * must never make a dashboard chart eligible or alter its cumulative line.
 */
export function dashboardCumulativeRPoints(
  trades: readonly RiskPnlTrade[],
): DashboardChartPoint[] {
  const valid = trades
    .filter(hasValidRiskPnlPair)
    .map((trade, index) => ({
      trade,
      index,
      date: trade.trade_date ?? "",
      stableOrder: trade.trade_number ?? trade.created_at ?? String(index).padStart(8, "0"),
      id: trade.id ?? "",
    }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        String(a.stableOrder).localeCompare(String(b.stableOrder), undefined, { numeric: true }) ||
        a.id.localeCompare(b.id) ||
        a.index - b.index,
    );

  let cumulativeR = 0;
  return valid.map(({ trade, date }, index) => {
    cumulativeR += qualifyingRValue(trade)!;
    return {
      point: `${date}|${String(index).padStart(4, "0")}`,
      date,
      cumulativeR,
    };
  });
}

export function formatRAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "";
  const decimals = Math.abs(value) > 0 && Math.abs(value) < 1 ? 2 : 1;
  const rounded = Math.abs(value) < 0.005 ? 0 : Number(value.toFixed(decimals));
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
