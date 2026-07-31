import type { JournalTrackingConfig, JournalTrackingField } from "./journal-tracking";

export const ANALYTICS_SECTION_IDS = [
  "highlights",
  "equity_curve",
  "planned_vs_achieved",
  "mistakes",
  "emotions",
  "exit_reason",
  "grade",
  "trade_management",
  "session",
  "day",
  "direction",
  "killzone",
  "category",
  "instrument",
  "entry_model",
  "market_condition",
  "entry_timeframe",
  "news_involvement",
  "custom_tags",
] as const;

export type AnalyticsSectionId = (typeof ANALYTICS_SECTION_IDS)[number];
export type AnalyticsSectionKind = "r-only" | "mixed" | "non-r";
export type AnalyticsReportGroup =
  | "overview"
  | "process_review"
  | "performance_patterns"
  | "trade_context";

export const ANALYTICS_REPORT_GROUPS: readonly {
  id: AnalyticsReportGroup;
  label: string;
}[] = [
  { id: "overview", label: "Overview" },
  { id: "process_review", label: "Process & Review" },
  { id: "performance_patterns", label: "Performance Patterns" },
  { id: "trade_context", label: "Trade Context" },
] as const;

export type AnalyticsSectionDefinition = {
  id: AnalyticsSectionId;
  label: string;
  kind: AnalyticsSectionKind;
  group: AnalyticsReportGroup;
  trackingField?: JournalTrackingField;
};

export const ANALYTICS_SECTION_DEFINITIONS: readonly AnalyticsSectionDefinition[] = [
  { id: "highlights", label: "Highlights", kind: "mixed", group: "overview" },
  { id: "equity_curve", label: "Equity Curve", kind: "r-only", group: "overview" },
  {
    id: "planned_vs_achieved",
    label: "Planned versus Achieved R",
    kind: "r-only",
    group: "process_review",
    trackingField: "planned_rr",
  },
  {
    id: "mistakes",
    label: "Execution Issues",
    kind: "mixed",
    group: "process_review",
    trackingField: "mistakes",
  },
  {
    id: "emotions",
    label: "Emotion Insights",
    kind: "mixed",
    group: "process_review",
    trackingField: "emotions",
  },
  {
    id: "exit_reason",
    label: "Exit Reason",
    kind: "mixed",
    group: "process_review",
    trackingField: "exit_reason",
  },
  {
    id: "grade",
    label: "Trade Grade",
    kind: "mixed",
    group: "process_review",
    trackingField: "grade",
  },
  {
    id: "trade_management",
    label: "Trade Management",
    kind: "mixed",
    group: "process_review",
    trackingField: "trade_management",
  },
  {
    id: "session",
    label: "Session Performance",
    kind: "mixed",
    group: "performance_patterns",
    trackingField: "session",
  },
  { id: "day", label: "Day Performance", kind: "mixed", group: "performance_patterns" },
  { id: "direction", label: "Direction Performance", kind: "mixed", group: "performance_patterns" },
  {
    id: "killzone",
    label: "Killzone Performance",
    kind: "mixed",
    group: "performance_patterns",
    trackingField: "killzone",
  },
  {
    id: "category",
    label: "Category Performance",
    kind: "mixed",
    group: "performance_patterns",
    trackingField: "category",
  },
  {
    id: "instrument",
    label: "Instrument Performance",
    kind: "mixed",
    group: "performance_patterns",
  },
  {
    id: "entry_model",
    label: "Entry Model / Trigger",
    kind: "mixed",
    group: "trade_context",
    trackingField: "entry_model",
  },
  {
    id: "market_condition",
    label: "Market Condition",
    kind: "mixed",
    group: "trade_context",
    trackingField: "market_condition",
  },
  {
    id: "entry_timeframe",
    label: "Entry Timeframe",
    kind: "mixed",
    group: "trade_context",
    trackingField: "entry_timeframe",
  },
  {
    id: "news_involvement",
    label: "News Involvement",
    kind: "mixed",
    group: "trade_context",
    trackingField: "news_involvement",
  },
  {
    id: "custom_tags",
    label: "Custom Tags",
    kind: "mixed",
    group: "trade_context",
    trackingField: "custom_tags",
  },
] as const;

export type AnalyticsPreferences = {
  hidden: AnalyticsSectionId[];
  order: AnalyticsSectionId[];
  summaryCards: AnalyticsKpiId[];
};

export const ANALYTICS_KPI_IDS = [
  "total_trades",
  "win_rate",
  "net_r",
  "avg_r",
  "completed_reviews",
  "profit_factor",
] as const;
export type AnalyticsKpiId = (typeof ANALYTICS_KPI_IDS)[number];
export const DEFAULT_ANALYTICS_SUMMARY_CARDS: AnalyticsKpiId[] = [
  "total_trades",
  "win_rate",
  "net_r",
  "avg_r",
  "completed_reviews",
];

export const DEFAULT_ANALYTICS_PREFERENCES: AnalyticsPreferences = {
  hidden: [
    "exit_reason",
    "grade",
    "trade_management",
    "entry_model",
    "market_condition",
    "entry_timeframe",
    "news_involvement",
    "custom_tags",
  ],
  order: [...ANALYTICS_SECTION_IDS],
  summaryCards: [...DEFAULT_ANALYTICS_SUMMARY_CARDS],
};

const definitionById = new Map(
  ANALYTICS_SECTION_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function isAnalyticsSectionId(value: unknown): value is AnalyticsSectionId {
  return typeof value === "string" && definitionById.has(value as AnalyticsSectionId);
}

export function analyticsPreferencesFromStored(value: unknown): AnalyticsPreferences {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as {
          hidden?: unknown;
          order?: unknown;
          summaryCards?: unknown;
          summary_cards?: unknown;
        })
      : {};
  const isLegacySavedPreference = Array.isArray(input.order);
  const hidden = Array.isArray(input.hidden)
    ? input.hidden.filter(isAnalyticsSectionId)
    : isLegacySavedPreference
      ? []
      : [...DEFAULT_ANALYTICS_PREFERENCES.hidden];
  const supplied = Array.isArray(input.order) ? input.order.filter(isAnalyticsSectionId) : [];
  const suppliedSet = new Set(supplied);
  const missing = ANALYTICS_SECTION_IDS.filter((id) => !suppliedSet.has(id));

  // Preserve a user's existing sequence, including the old optional-only format,
  // then insert newly supported sections at their curated relative positions.
  const order = [...new Set(supplied)];
  for (const id of missing) {
    const defaultIndex = ANALYTICS_SECTION_IDS.indexOf(id);
    const nextKnown = ANALYTICS_SECTION_IDS.slice(defaultIndex + 1).find((next) =>
      order.includes(next),
    );
    if (nextKnown) order.splice(order.indexOf(nextKnown), 0, id);
    else order.push(id);
  }

  const rawSummary = input.summaryCards ?? input.summary_cards;
  const summaryCards = Array.isArray(rawSummary)
    ? rawSummary.filter(
        (id): id is AnalyticsKpiId =>
          typeof id === "string" && (ANALYTICS_KPI_IDS as readonly string[]).includes(id),
      )
    : [...DEFAULT_ANALYTICS_SUMMARY_CARDS];
  return {
    hidden: [...new Set(hidden)],
    order,
    summaryCards: [...new Set(summaryCards)].slice(0, 6),
  };
}

export function analyticsPreferencesForStorage(preferences: AnalyticsPreferences) {
  const normalized = analyticsPreferencesFromStored(preferences);
  return {
    hidden: normalized.hidden,
    order: normalized.order,
    summaryCards: normalized.summaryCards,
  };
}

export function analyticsSectionAvailability(
  id: AnalyticsSectionId,
  tracking: JournalTrackingConfig,
  rPerformanceEnabled: boolean,
): { available: boolean; reason: string | null } {
  const definition = definitionById.get(id)!;
  if (definition.kind === "r-only" && !rPerformanceEnabled) {
    return { available: false, reason: "R Performance disabled" };
  }
  if (definition.trackingField && tracking[definition.trackingField] === "hidden") {
    return {
      available: false,
      reason: "Tracking hidden",
    };
  }
  return { available: true, reason: null };
}

export function visibleAnalyticsSections(
  preferences: AnalyticsPreferences,
  tracking: JournalTrackingConfig,
  rPerformanceEnabled: boolean,
): AnalyticsSectionId[] {
  const hidden = new Set(preferences.hidden);
  return ANALYTICS_SECTION_IDS.filter(
    (id) =>
      !hidden.has(id) && analyticsSectionAvailability(id, tracking, rPerformanceEnabled).available,
  );
}

export function moveAnalyticsSection(
  preferences: AnalyticsPreferences,
  id: AnalyticsSectionId,
  direction: -1 | 1,
): AnalyticsPreferences {
  const index = preferences.order.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= preferences.order.length) return preferences;
  const order = [...preferences.order];
  [order[index], order[target]] = [order[target], order[index]];
  return { ...preferences, order };
}

export function setAnalyticsSectionVisible(
  preferences: AnalyticsPreferences,
  id: AnalyticsSectionId,
  visible: boolean,
): AnalyticsPreferences {
  const hidden = new Set(preferences.hidden);
  if (visible) hidden.delete(id);
  else hidden.add(id);
  return { ...preferences, hidden: [...hidden] };
}

export const NON_R_KPI_IDS = ["total_trades", "win_rate", "completed_reviews"] as const;
export const R_KPI_IDS = ["net_r", "avg_r", "profit_factor"] as const;

export function analyticsKpiIds(rPerformanceEnabled: boolean): string[] {
  return rPerformanceEnabled ? [...NON_R_KPI_IDS, ...R_KPI_IDS] : [...NON_R_KPI_IDS];
}

const BASE_COLUMNS: Partial<Record<AnalyticsSectionId, readonly string[]>> = {
  direction: ["value", "trades", "win_rate"],
  session: ["value", "trades", "wins", "losses", "win_rate"],
  category: ["value", "trades", "win_rate"],
  killzone: ["value", "trades", "win_rate"],
  day: ["value", "trades", "win_rate"],
  mistakes: ["value", "occurrences"],
  emotions: ["value", "count", "win_rate"],
  grade: ["value", "trades"],
  instrument: ["value", "trades", "win_rate"],
  entry_model: ["value", "trades", "win_rate"],
  market_condition: ["value", "trades", "win_rate"],
  entry_timeframe: ["value", "trades", "win_rate"],
  news_involvement: ["value", "trades", "win_rate"],
  exit_reason: ["value", "trades", "win_rate"],
  trade_management: ["value", "trades", "win_rate"],
  custom_tags: ["value", "trades", "win_rate"],
};

const R_COLUMNS: Partial<Record<AnalyticsSectionId, readonly string[]>> = {
  direction: ["net_r", "avg_r"],
  session: ["net_r", "avg_r"],
  category: ["net_r", "avg_r", "avg_win", "avg_loss"],
  killzone: ["net_r", "avg_r"],
  day: ["net_r"],
  mistakes: ["net_r"],
  emotions: ["avg_r", "net_r"],
  grade: ["avg_r"],
  instrument: ["net_r", "avg_r"],
  entry_model: ["net_r", "avg_r", "profit_factor"],
  market_condition: ["net_r", "avg_r", "profit_factor"],
  entry_timeframe: ["net_r", "avg_r", "profit_factor"],
  news_involvement: ["net_r", "avg_r", "profit_factor"],
  exit_reason: ["net_r", "avg_r", "profit_factor"],
  trade_management: ["net_r", "avg_r", "profit_factor"],
  custom_tags: ["net_r", "avg_r", "profit_factor"],
};

export function analyticsSectionColumns(
  id: AnalyticsSectionId,
  rPerformanceEnabled: boolean,
): string[] {
  return [...(BASE_COLUMNS[id] ?? []), ...(rPerformanceEnabled ? (R_COLUMNS[id] ?? []) : [])];
}
