// Single source of truth for the durable trade-review lifecycle. A completed
// review remains a historical fact when preferences or optional evidence later
// change; only corruption of the trade's identity or outcome invalidates it.

export type ReviewStatus = "incomplete" | "needs_review" | "reviewed";

export type ReviewStatusInput = {
  instrument?: string | null;
  session?: string | null;
  direction?: string | null;
  result?: string | null;
  planned_rr?: number | string | null;
  achieved_rr?: number | string | null;
  risk_amount?: number | string | null;
  reward_amount?: number | string | null;
  pnl_amount?: number | string | null;
  emotion_tags?: string[] | null;
  emotion_before?: string | null;
  emotion_during?: string | null;
  emotion_after?: string | null;
  reasoning?: string | null;
  categories?: string[] | null;
  grade?: string | null;
  trade_screenshots?: { id: string }[] | null;
  /** Overrides trade_screenshots when the caller already knows the count. */
  screenshot_count?: number | null;
  review_completed_at?: string | null;
  /** R Performance may be disabled without making historical trades incomplete. */
  r_performance_enabled?: boolean | null;
  trade_completeness_requirements?: Partial<
    Record<
      | "planned_rr"
      | "session"
      | "screenshots"
      | "reasoning"
      | "category"
      | "grade"
      | "entry_model"
      | "market_condition"
      | "entry_timeframe"
      | "news_involvement"
      | "exit_reason"
      | "trade_management"
      | "custom_tags",
      boolean
    >
  >;
  entry_model?: string | null;
  market_condition?: string | null;
  entry_timeframe?: string | null;
  news_involvement?: string | null;
  exit_reason?: string | null;
  trade_management?: string[] | null;
  custom_tags?: string[] | null;
};

function hasText(v: string | null | undefined): boolean {
  return !!v?.trim();
}

function hasNumber(v: number | string | null | undefined): boolean {
  if (v == null || v === "") return false;
  return Number.isFinite(typeof v === "number" ? v : Number(v));
}

function hasPositiveNumber(v: number | string | null | undefined): boolean {
  return hasNumber(v) && Number(v) > 0;
}

export function hasQuickCaptureEssentials(t: ReviewStatusInput): boolean {
  const hasValidDirection = t.direction === "long" || t.direction === "short";
  const hasValidResult = t.result === "win" || t.result === "loss" || t.result === "breakeven";
  return (
    hasText(t.instrument) &&
    hasValidDirection &&
    hasValidResult &&
    (t.r_performance_enabled === false ||
      (hasPositiveNumber(t.risk_amount) && (hasNumber(t.reward_amount) || hasNumber(t.pnl_amount))))
  );
}

function screenshotCount(t: ReviewStatusInput): number {
  return t.screenshot_count ?? t.trade_screenshots?.length ?? 0;
}

function hasTradeCompletenessRequirements(t: ReviewStatusInput): boolean {
  const required = t.trade_completeness_requirements;
  if (!required) return true;
  if (required.planned_rr && !hasPositiveNumber(t.planned_rr)) return false;
  if (required.session && !hasText(t.session)) return false;
  if (required.screenshots && screenshotCount(t) < 1) return false;
  if (required.reasoning && !hasText(t.reasoning)) return false;
  if (required.category && !(t.categories ?? []).some((value) => hasText(value))) return false;
  if (required.grade && !hasText(t.grade)) return false;
  if (required.entry_model && !hasText(t.entry_model)) return false;
  if (required.market_condition && !hasText(t.market_condition)) return false;
  if (required.entry_timeframe && !hasText(t.entry_timeframe)) return false;
  if (required.news_involvement && !hasText(t.news_involvement)) return false;
  if (required.exit_reason && !hasText(t.exit_reason)) return false;
  if (required.trade_management && !(t.trade_management ?? []).length) return false;
  if (required.custom_tags && !(t.custom_tags ?? []).length) return false;
  return true;
}

/**
 * Essential identity/outcome facts whose later deletion can invalidate even a
 * historically completed review. Preference and optional-field changes are
 * intentionally excluded so they cannot rewrite completed history.
 */
export function hasDurableReviewEssentials(t: ReviewStatusInput): boolean {
  return (
    hasText(t.instrument) &&
    (t.direction === "long" || t.direction === "short") &&
    (t.result === "win" || t.result === "loss" || t.result === "breakeven")
  );
}

export function getReviewStatus(t: ReviewStatusInput): ReviewStatus {
  if (!hasDurableReviewEssentials(t)) return "incomplete";

  // Completion is a historical fact. Enabling R tracking or adding new review /
  // completeness requirements later must never downgrade it.
  if (t.review_completed_at) return "reviewed";

  if (!hasQuickCaptureEssentials(t) || !hasTradeCompletenessRequirements(t)) return "incomplete";
  return "needs_review";
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  incomplete: "Incomplete",
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
