// Shared trade vocabulary used across forms, filters, and analytics.

export const MARKETS = [
  "forex",
  "crypto",
  "stocks",
  "indices",
  "futures",
  "commodities",
  "other",
] as const;

export const SESSIONS = [
  { v: "sydney", l: "Sydney" },
  { v: "tokyo", l: "Tokyo (Asia)" },
  { v: "london", l: "London" },
  { v: "new_york", l: "New York" },
  { v: "sydney_tokyo", l: "Sydney-Tokyo Overlap" },
  { v: "tokyo_london", l: "Tokyo-London Overlap" },
  { v: "london_new_york", l: "London-New York Overlap" },
] as const;

// Backward-compat labels for legacy session codes still present in old trades.
const LEGACY_SESSION_LABELS: Record<string, string> = {
  asia: "Asia",
  overlap: "LDN/NY Overlap",
};

export const GRADES = ["A+", "A", "B+", "B", "C", "D"] as const;

export const RESULTS = ["win", "loss", "breakeven"] as const;

export const EMOTIONS = [
  "Calm",
  "Confident",
  "Focused",
  "Fearful",
  "Hesitant",
  "FOMO",
  "Revenge",
  "Frustrated",
  "Other",
] as const;

export const MISTAKES = [
  "Entered Early",
  "Entered Late",
  "Moved Stop Loss",
  "No Confirmation",
  "Overtraded",
  "FOMO Entry",
  "Revenge Trade",
  "Ignored Plan",
  "Poor Risk Management",
] as const;

export const CATEGORIES = [
  "Liquidity Sweep",
  "Break and Retest",
  "Order Block",
  "Fair Value Gap",
  "Market Structure Shift",
  "Supply and Demand",
  "Trend Continuation",
  "Reversal",
] as const;

export const SUBCATEGORIES = [
  "Asia Sweep",
  "London Sweep",
  "New York Sweep",
  "Equal High Sweep",
  "Equal Low Sweep",
] as const;

export function sessionLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return SESSIONS.find((s) => s.v === v)?.l ?? LEGACY_SESSION_LABELS[v] ?? v;
}

export function marketLabel(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

// ICT-style killzones (IST). Stored on trade.killzone as one of the v values.
export const KILLZONES = [
  { v: "asian", l: "Asian (5:30 AM – 9:30 AM IST)" },
  { v: "london", l: "London (11:30 AM – 2:30 PM IST)" },
  { v: "new_york", l: "New York (4:30 PM – 7:30 PM IST)" },
  { v: "london_close", l: "London Close (8:30 PM – 10:30 PM IST)" },
] as const;

export function killzoneLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return KILLZONES.find((k) => k.v === v)?.l ?? v;
}
