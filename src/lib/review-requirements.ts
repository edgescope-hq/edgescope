export type ReviewRequirements = {
  screenshot: boolean;
  reasoning: boolean;
  category: boolean;
  grade: boolean;
  entry_model: boolean;
  market_condition: boolean;
  entry_timeframe: boolean;
  news_involvement: boolean;
  exit_reason: boolean;
  trade_management: boolean;
  custom_tags: boolean;
};

export const DEFAULT_REVIEW_REQUIREMENTS: ReviewRequirements = {
  screenshot: true,
  reasoning: true,
  category: false,
  grade: false,
  entry_model: false,
  market_condition: false,
  entry_timeframe: false,
  news_involvement: false,
  exit_reason: false,
  trade_management: false,
  custom_tags: false,
};

export type ReviewRequirementInput = {
  screenshot_count?: number | null;
  reasoning?: string | null;
  categories?: string[] | null;
  grade?: string | null;
  entry_model?: string | null;
  market_condition?: string | null;
  entry_timeframe?: string | null;
  news_involvement?: string | null;
  exit_reason?: string | null;
  trade_management?: string[] | null;
  custom_tags?: string[] | null;
};

export type ReviewRequirementKey = keyof ReviewRequirements;

export const REVIEW_REQUIREMENT_LABEL: Record<ReviewRequirementKey, string> = {
  screenshot: "Screenshot",
  reasoning: "Trade reasoning",
  category: "Category",
  grade: "Trade grade",
  entry_model: "Entry model",
  market_condition: "Market condition",
  entry_timeframe: "Entry timeframe",
  news_involvement: "News involvement",
  exit_reason: "Exit reason",
  trade_management: "Trade management",
  custom_tags: "Custom tags",
};

export function missingReviewRequirements(
  input: ReviewRequirementInput,
  requirements: Partial<ReviewRequirements>,
): ReviewRequirementKey[] {
  const missing: ReviewRequirementKey[] = [];
  if (requirements.screenshot && (input.screenshot_count ?? 0) < 1) missing.push("screenshot");
  if (requirements.reasoning && !input.reasoning?.trim()) missing.push("reasoning");
  if (requirements.category && !(input.categories ?? []).some((category) => category.trim())) {
    missing.push("category");
  }
  if (requirements.grade && !input.grade?.trim()) missing.push("grade");
  if (requirements.entry_model && !input.entry_model?.trim()) missing.push("entry_model");
  if (requirements.market_condition && !input.market_condition?.trim())
    missing.push("market_condition");
  if (requirements.entry_timeframe && !input.entry_timeframe?.trim())
    missing.push("entry_timeframe");
  if (requirements.news_involvement && !input.news_involvement?.trim())
    missing.push("news_involvement");
  if (requirements.exit_reason && !input.exit_reason?.trim()) missing.push("exit_reason");
  if (requirements.trade_management && !(input.trade_management ?? []).length)
    missing.push("trade_management");
  if (requirements.custom_tags && !(input.custom_tags ?? []).length) missing.push("custom_tags");
  return missing;
}

export function requirementsFromPreferences(
  preferences:
    | {
        review_require_screenshot?: boolean | null;
        review_require_reasoning?: boolean | null;
        review_require_category?: boolean | null;
        review_require_grade?: boolean | null;
        review_require_entry_model?: boolean | null;
        review_require_market_condition?: boolean | null;
        review_require_entry_timeframe?: boolean | null;
        review_require_news_involvement?: boolean | null;
        review_require_exit_reason?: boolean | null;
        review_require_trade_management?: boolean | null;
        review_require_custom_tags?: boolean | null;
      }
    | null
    | undefined,
): ReviewRequirements {
  if (!preferences) return { ...DEFAULT_REVIEW_REQUIREMENTS };
  return {
    screenshot: preferences.review_require_screenshot ?? DEFAULT_REVIEW_REQUIREMENTS.screenshot,
    reasoning: preferences.review_require_reasoning ?? DEFAULT_REVIEW_REQUIREMENTS.reasoning,
    category: preferences.review_require_category ?? DEFAULT_REVIEW_REQUIREMENTS.category,
    grade: preferences.review_require_grade ?? DEFAULT_REVIEW_REQUIREMENTS.grade,
    entry_model: preferences.review_require_entry_model ?? false,
    market_condition: preferences.review_require_market_condition ?? false,
    entry_timeframe: preferences.review_require_entry_timeframe ?? false,
    news_involvement: preferences.review_require_news_involvement ?? false,
    exit_reason: preferences.review_require_exit_reason ?? false,
    trade_management: preferences.review_require_trade_management ?? false,
    custom_tags: preferences.review_require_custom_tags ?? false,
  };
}
