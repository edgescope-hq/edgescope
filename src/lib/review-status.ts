import { parsePlannedRR } from "@/lib/planned-rr";

// Single source of truth for trade review status across the app.
//
// A trade moves through three display states:
//   "incomplete"   — quick-capture essentials are missing (instrument, session,
//                    side, result, risk amount, profit/loss amount, planned RR, emotion)
//   "needs_review" — essentials are logged, but the detailed-review minimum
//                    (at least one screenshot + trade reasoning) is missing
//   "reviewed"     — essentials + screenshot + reasoning are all present
//
// Derived from existing trade fields only — no schema changes.

export type ReviewStatus = "incomplete" | "needs_review" | "reviewed";

export type ReviewStatusInput = {
  instrument?: string | null;
  session?: string | null;
  direction?: string | null;
  result?: string | null;
  planned_rr?: number | string | null;
  risk_amount?: number | string | null;
  reward_amount?: number | string | null;
  pnl_amount?: number | string | null;
  emotion_tags?: string[] | null;
  emotion_before?: string | null;
  emotion_during?: string | null;
  emotion_after?: string | null;
  reasoning?: string | null;
  trade_screenshots?: { id: string }[] | null;
  /** Overrides trade_screenshots when the caller already knows the count. */
  screenshot_count?: number | null;
};

function hasText(v: string | null | undefined): boolean {
  return !!v?.trim();
}

function hasNumber(v: number | string | null | undefined): boolean {
  if (v == null || v === "") return false;
  return Number.isFinite(typeof v === "number" ? v : Number(v));
}

export function hasQuickCaptureEssentials(t: ReviewStatusInput): boolean {
  const hasEmotion =
    (t.emotion_tags ?? []).some((tag) => tag.trim().length > 0) ||
    hasText(t.emotion_before) ||
    hasText(t.emotion_during) ||
    hasText(t.emotion_after);
  return (
    hasText(t.instrument) &&
    hasText(t.session) &&
    hasText(t.direction) &&
    hasText(t.result) &&
    hasNumber(t.risk_amount) &&
    (hasNumber(t.reward_amount) || hasNumber(t.pnl_amount)) &&
    parsePlannedRR(t.planned_rr) !== null &&
    hasEmotion
  );
}

export function hasDetailedReviewMinimum(t: ReviewStatusInput): boolean {
  const shots = t.screenshot_count ?? t.trade_screenshots?.length ?? 0;
  return shots > 0 && hasText(t.reasoning);
}

export function getReviewStatus(t: ReviewStatusInput): ReviewStatus {
  if (!hasQuickCaptureEssentials(t)) return "incomplete";
  if (!hasDetailedReviewMinimum(t)) return "needs_review";
  return "reviewed";
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  incomplete: "Needs details",
  needs_review: "Needs review",
  reviewed: "Reviewed",
};

// Calm badge tones: neutral while basics are missing, warning while the
// detailed review is pending, primary once fully reviewed.
export const REVIEW_STATUS_BADGE: Record<ReviewStatus, string> = {
  incomplete: "bg-white/[0.05] text-muted-foreground ring-white/[0.1]",
  needs_review: "bg-warning/10 text-warning ring-warning/25",
  reviewed: "bg-primary/12 text-primary ring-primary/25",
};
