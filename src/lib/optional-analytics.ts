import { realizedR, type DbTrade } from "./trade-mappers.ts";

export type OptionalAnalyticsRow = {
  value: string;
  count: number;
  resultCount: number;
  winRate: number | null;
  rCount: number;
  netR: number | null;
  avgR: number | null;
  profitFactor: number | null;
};

export function optionalFieldAnalytics(
  trades: DbTrade[],
  values: (trade: DbTrade) => string[],
  order?: (value: string) => number,
): OptionalAnalyticsRow[] {
  const groups = new Map<string, DbTrade[]>();
  for (const trade of trades) {
    for (const raw of values(trade)) {
      const value = raw.trim();
      if (!value) continue;
      const key = value.toLocaleLowerCase();
      const existing = groups.get(key) ?? [];
      if (!existing.length) Object.defineProperty(existing, "label", { value, enumerable: false });
      existing.push(trade);
      groups.set(key, existing);
    }
  }
  return [...groups.values()]
    .map((subset) => {
      const value = (subset as typeof subset & { label: string }).label;
      const decided = subset.filter((trade) => trade.result != null);
      const wins = decided.filter((trade) => trade.result === "win").length;
      const r = subset.map(realizedRForAnalytics).filter((item): item is number => item !== null);
      const positive = r.filter((item) => item > 0).reduce((sum, item) => sum + item, 0);
      const negative = Math.abs(r.filter((item) => item < 0).reduce((sum, item) => sum + item, 0));
      return {
        value,
        count: subset.length,
        resultCount: decided.length,
        winRate: decided.length ? (wins / decided.length) * 100 : null,
        rCount: r.length,
        netR: r.length ? r.reduce((sum, item) => sum + item, 0) : null,
        avgR: r.length ? r.reduce((sum, item) => sum + item, 0) / r.length : null,
        profitFactor: positive > 0 && negative > 0 ? positive / negative : null,
      };
    })
    .sort(
      (a, b) =>
        (order?.(a.value) ?? 0) - (order?.(b.value) ?? 0) ||
        b.count - a.count ||
        a.value.localeCompare(b.value),
    );
}

export const timeframeAnalytics = (trades: DbTrade[]) =>
  optionalFieldAnalytics(
    trades,
    (trade) => (trade.entry_timeframe ? [trade.entry_timeframe] : []),
    stableTimeframeOrder,
  );

export function sampleLabel(count: number): "early" | "small" | "normal" {
  return count < 3 ? "early" : count < 10 ? "small" : "normal";
}

export function hasRecordedR(trade: DbTrade): boolean {
  return realizedRForAnalytics(trade) !== null;
}

function realizedRForAnalytics(trade: DbTrade): number | null {
  return realizedR(trade);
}

function stableTimeframeOrder(value: string): number {
  const values = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "Daily"];
  const index = values.indexOf(value);
  return index === -1 ? values.length : index;
}
