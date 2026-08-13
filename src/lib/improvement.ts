export type ImprovementAssessment = "followed" | "deviated" | "unassessable";
export type ImprovementResolution =
  "improved" | "unresolved" | "unsupported" | "no_longer_applicable";

export const IMPROVEMENT_ASSESSMENT_LABEL: Record<ImprovementAssessment, string> = {
  followed: "Followed",
  deviated: "Deviated",
  unassessable: "Unassessable",
};

export const IMPROVEMENT_RESOLUTION_LABEL: Record<ImprovementResolution, string> = {
  improved: "Improved",
  unresolved: "Unresolved",
  unsupported: "Unsupported / misdiagnosed",
  no_longer_applicable: "No longer applicable",
};

export function isTradeEligibleForFocus(
  trade: { created_at?: string | null; trade_date?: string | null; is_paper?: boolean | null },
  focus: { activated_at: string },
): boolean {
  if (trade.is_paper === true || !trade.created_at || !trade.trade_date) return false;
  const createdAt = Date.parse(trade.created_at);
  const activatedAt = Date.parse(focus.activated_at);
  if (!Number.isFinite(createdAt) || !Number.isFinite(activatedAt) || createdAt < activatedAt) {
    return false;
  }

  // Prevent a historical trade backfilled after activation from being counted
  // as prospective evidence. Date-only journal evidence cannot safely resolve
  // same-day ordering, so same-day rows remain trader-assessable.
  return trade.trade_date >= focus.activated_at.slice(0, 10);
}

export function improvementAssessmentCounts(
  occurrences: readonly { assessment: string }[],
): Record<ImprovementAssessment, number> {
  return occurrences.reduce<Record<ImprovementAssessment, number>>(
    (counts, occurrence) => {
      if (
        occurrence.assessment === "followed" ||
        occurrence.assessment === "deviated" ||
        occurrence.assessment === "unassessable"
      ) {
        counts[occurrence.assessment] += 1;
      }
      return counts;
    },
    { followed: 0, deviated: 0, unassessable: 0 },
  );
}
