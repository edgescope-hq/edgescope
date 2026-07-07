// Dynamic IST time-window labels for forex sessions and ICT killzones.
// Source timings are defined in their native exchange/market timezone so
// daylight-saving transitions are reflected automatically. Output strings
// always render in IST (Asia/Kolkata, no DST) using the current date.

type TzRange = { tz: string; startH: number; startM?: number; endH: number; endM?: number };

const IST = "Asia/Kolkata";

// Native local windows for each forex session.
const SESSION_RANGES: Record<string, TzRange> = {
  sydney: { tz: "Australia/Sydney", startH: 7, endH: 16 },
  tokyo: { tz: "Asia/Tokyo", startH: 9, endH: 18 },
  london: { tz: "Europe/London", startH: 8, endH: 17 },
  new_york: { tz: "America/New_York", startH: 8, endH: 17 },
};

// ICT killzones — defined in New York local time, with DST handled.
const KILLZONE_RANGES: Record<string, TzRange> = {
  asian: { tz: "America/New_York", startH: 20, endH: 24 }, // 8pm–12am ET
  london: { tz: "America/New_York", startH: 2, endH: 5 }, // 2am–5am ET
  new_york: { tz: "America/New_York", startH: 7, endH: 10 }, // 7am–10am ET
  london_close: { tz: "America/New_York", startH: 10, endH: 12 }, // 10am–12pm ET
};

// Returns "today" (in the given tz) as Y/M/D parts.
function todayParts(tz: string, ref: Date): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = dtf.format(ref).split("-").map(Number);
  return { y, m, d };
}

// Returns the tz offset (minutes east of UTC) at a specific UTC instant.
function tzOffsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(at).reduce<Record<string, string>>((a, p) => {
    a[p.type] = p.value;
    return a;
  }, {});
  // Intl may return "24" for midnight; normalize.
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUTC - at.getTime()) / 60000;
}

// Converts "today at H:M in tz" to a real UTC Date.
function localToUtc(tz: string, hour: number, minute: number, ref: Date): Date {
  const { y, m, d } = todayParts(tz, ref);
  // Initial guess assuming no DST shift, then correct using the real offset.
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute));
  const offset = tzOffsetMinutes(tz, guess);
  return new Date(guess.getTime() - offset * 60000);
}

function formatIST(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

function rangeToIST(r: TzRange, ref: Date): string {
  const s = localToUtc(r.tz, r.startH, r.startM ?? 0, ref);
  const e = localToUtc(r.tz, r.endH, r.endM ?? 0, ref);
  return `${formatIST(s)} – ${formatIST(e)} IST`;
}

function overlapToIST(a: TzRange, b: TzRange, ref: Date): string {
  const aS = localToUtc(a.tz, a.startH, a.startM ?? 0, ref);
  const aE = localToUtc(a.tz, a.endH, a.endM ?? 0, ref);
  const bS = localToUtc(b.tz, b.startH, b.startM ?? 0, ref);
  const bE = localToUtc(b.tz, b.endH, b.endM ?? 0, ref);
  const s = new Date(Math.max(aS.getTime(), bS.getTime()));
  const e = new Date(Math.min(aE.getTime(), bE.getTime()));
  if (e.getTime() <= s.getTime()) return "—";
  return `${formatIST(s)} – ${formatIST(e)} IST`;
}

export function sessionISTRange(v: string, ref: Date = new Date()): string {
  if (v === "sydney_tokyo") return overlapToIST(SESSION_RANGES.sydney, SESSION_RANGES.tokyo, ref);
  if (v === "tokyo_london") return overlapToIST(SESSION_RANGES.tokyo, SESSION_RANGES.london, ref);
  if (v === "london_new_york")
    return overlapToIST(SESSION_RANGES.london, SESSION_RANGES.new_york, ref);
  const r = SESSION_RANGES[v];
  return r ? rangeToIST(r, ref) : "";
}

export function killzoneISTRange(v: string, ref: Date = new Date()): string {
  const r = KILLZONE_RANGES[v];
  return r ? rangeToIST(r, ref) : "";
}

// Base, timing-free display names for each session.
export const SESSION_NAMES: Record<string, string> = {
  sydney: "Sydney",
  tokyo: "Tokyo / Asia",
  london: "London",
  new_york: "New York",
  sydney_tokyo: "Sydney–Tokyo Overlap",
  tokyo_london: "Tokyo–London Overlap",
  london_new_york: "London–New York Overlap",
};

export const KILLZONE_NAMES: Record<string, string> = {
  asian: "Asian",
  london: "London",
  new_york: "New York",
  london_close: "London Close",
};

export function sessionISTLabel(v: string, ref: Date = new Date()): string {
  const range = sessionISTRange(v, ref);
  return `${SESSION_NAMES[v] ?? v}${range ? ` (${range})` : ""}`;
}

export function killzoneISTLabel(v: string, ref: Date = new Date()): string {
  const range = killzoneISTRange(v, ref);
  return `${KILLZONE_NAMES[v] ?? v}${range ? ` (${range})` : ""}`;
}
