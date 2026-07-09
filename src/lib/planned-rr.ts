/** Parse stored planned_rr values such as "0.1", "1", "1.5", or "2.5". */
export function parsePlannedRR(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 && raw <= 50 ? raw : null;
  const text = raw.trim().toUpperCase().replace(/R$/, "").trim();
  if (!text) return null;
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 && n <= 50 ? n : null;
}

export function rrBucketLabel(rr: number | null): string | null {
  if (rr == null) return null;
  if (rr < 1) return "Planned RR under 1R";
  if (rr < 2) return "Planned RR 1–2R";
  if (rr < 3) return "Planned RR 2–3R";
  if (rr < 4) return "Planned RR 3–4R";
  return "Planned RR 4R+";
}
