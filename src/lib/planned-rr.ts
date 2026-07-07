/** Parse planned_rr text: "2", "2.5R", "1:3", "1/3" → numeric reward multiple. */
export function parsePlannedRR(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 && raw <= 50 ? raw : null;
  const text = raw.trim().toUpperCase().replace(/R$/, "").trim();
  if (!text) return null;
  const ratio = text.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const risk = Number(ratio[1]);
    const reward = Number(ratio[2]);
    if (!Number.isFinite(risk) || !Number.isFinite(reward) || risk <= 0) return null;
    const rr = reward / risk;
    return rr > 0 && rr <= 50 ? rr : null;
  }
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
