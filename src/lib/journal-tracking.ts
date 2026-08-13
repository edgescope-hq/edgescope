import { z } from "zod";

export const JOURNAL_PLACEMENTS = ["quick_capture", "detailed_review", "both", "hidden"] as const;
export type JournalPlacement = (typeof JOURNAL_PLACEMENTS)[number];

export const JOURNAL_TRACKING_FIELDS = [
  "r_performance",
  "planned_rr",
  "session",
  "emotions",
  "screenshots",
  "reasoning",
  "category",
  "grade",
  "killzone",
  "mistakes",
  "entry_model",
  "market_condition",
  "entry_timeframe",
  "news_involvement",
  "exit_reason",
  "trade_management",
  "custom_tags",
  "community",
] as const;

export type JournalTrackingField = (typeof JOURNAL_TRACKING_FIELDS)[number];

export type JournalTrackingConfig = Record<JournalTrackingField, JournalPlacement>;

/** Stored beside placements in the existing server-backed `journal_tracking` JSON value. */
export type TradeCompletenessRequirements = Partial<Record<JournalTrackingField, boolean>>;

export const TRADE_COMPLETENESS_ELIGIBLE_FIELDS: readonly JournalTrackingField[] = [
  "planned_rr",
  "session",
  "screenshots",
  "reasoning",
  "category",
  "grade",
  "entry_model",
  "market_condition",
  "entry_timeframe",
  "news_involvement",
  "exit_reason",
  "trade_management",
  "custom_tags",
];

const STATUS_REQUIREMENTS_KEY = "__status_requirements";
const SESSIONS_KEY = "__sessions";
const SCREENSHOT_SLOTS_KEY = "__screenshot_slots";

export type JournalSession = {
  id: string;
  label: string;
  createdAt: string;
  archivedAt: string | null;
};

export const DEFAULT_JOURNAL_SESSIONS: readonly JournalSession[] = [
  { id: "asia", label: "Asia", createdAt: "", archivedAt: null },
  { id: "london", label: "London", createdAt: "", archivedAt: null },
  { id: "new_york", label: "New York", createdAt: "", archivedAt: null },
  {
    id: "london_new_york",
    label: "London–New York Overlap",
    createdAt: "",
    archivedAt: null,
  },
];

export const SCREENSHOT_TIMEFRAMES = ["HTF", "MTF", "LTF"] as const;
export type ScreenshotTimeframe = (typeof SCREENSHOT_TIMEFRAMES)[number];
export type ScreenshotSlotPreference = {
  enabled: boolean;
  label: string;
};
export type ScreenshotSlotPreferences = Record<ScreenshotTimeframe, ScreenshotSlotPreference>;

export const DEFAULT_SCREENSHOT_SLOT_PREFERENCES: ScreenshotSlotPreferences = {
  HTF: { enabled: false, label: "HTF" },
  MTF: { enabled: false, label: "MTF" },
  LTF: { enabled: true, label: "LTF" },
};

export const DEFAULT_JOURNAL_TRACKING: JournalTrackingConfig = {
  r_performance: "quick_capture",
  planned_rr: "quick_capture",
  session: "quick_capture",
  emotions: "quick_capture",
  screenshots: "detailed_review",
  reasoning: "detailed_review",
  category: "detailed_review",
  grade: "hidden",
  killzone: "detailed_review",
  mistakes: "detailed_review",
  entry_model: "hidden",
  market_condition: "hidden",
  entry_timeframe: "hidden",
  news_involvement: "hidden",
  exit_reason: "hidden",
  trade_management: "hidden",
  custom_tags: "hidden",
  community: "detailed_review",
};

export const JOURNAL_FIELD_META: Record<
  JournalTrackingField,
  { label: string; allowed: JournalPlacement[]; reviewable?: boolean; description: string }
> = {
  r_performance: {
    label: "Risk & P/L",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "Calculates Achieved R",
  },
  planned_rr: {
    label: "Planned R:R",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "",
  },
  session: {
    label: "Session",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "",
  },
  emotions: {
    label: "Emotions",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "",
  },
  screenshots: {
    label: "Screenshots",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "",
  },
  reasoning: {
    label: "Trade reasoning",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "",
  },
  category: {
    label: "Category",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "",
  },
  grade: {
    label: "Trade grade",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "",
  },
  killzone: {
    label: "Killzone",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "",
  },
  mistakes: {
    label: "Execution Issues",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "",
  },
  entry_model: {
    label: "Entry model / trigger",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    reviewable: true,
    description: "",
  },
  market_condition: {
    label: "Market condition",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    reviewable: true,
    description: "",
  },
  entry_timeframe: {
    label: "Entry timeframe",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    reviewable: true,
    description: "",
  },
  news_involvement: {
    label: "News involvement",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    reviewable: true,
    description: "",
  },
  exit_reason: {
    label: "Exit reason",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    reviewable: true,
    description: "",
  },
  trade_management: {
    label: "Trade management",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    reviewable: true,
    description: "",
  },
  custom_tags: {
    label: "Custom tags",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    reviewable: true,
    description: "",
  },
  community: {
    label: "Network sharing",
    allowed: ["quick_capture", "detailed_review", "both", "hidden"],
    description: "",
  },
};

export const journalTrackingConfigSchema = z.object({}).passthrough();

export function journalTrackingFromPreferences(config: unknown): JournalTrackingConfig {
  const values =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Partial<JournalTrackingConfig>)
      : {};
  const merged = { ...DEFAULT_JOURNAL_TRACKING, ...values };
  for (const field of JOURNAL_TRACKING_FIELDS) {
    if (!JOURNAL_FIELD_META[field].allowed.includes(merged[field])) {
      merged[field] = DEFAULT_JOURNAL_TRACKING[field];
    }
  }
  return merged;
}

export function tradeCompletenessRequirementsFromPreferences(
  config: unknown,
): TradeCompletenessRequirements {
  if (!config || typeof config !== "object" || Array.isArray(config)) return {};
  const stored = (config as Record<string, unknown>)[STATUS_REQUIREMENTS_KEY];
  const values =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? ((stored as Record<string, unknown>).trade_completeness as
          Record<string, unknown> | undefined)
      : undefined;
  const requirements: TradeCompletenessRequirements = {};
  for (const field of TRADE_COMPLETENESS_ELIGIBLE_FIELDS) {
    if (values?.[field] === true) requirements[field] = true;
  }
  return requirements;
}

export function journalTrackingWithTradeCompletenessRequirements(
  tracking: JournalTrackingConfig,
  requirements: TradeCompletenessRequirements,
  currentPreferences?: unknown,
): Record<string, unknown> {
  const normalized = Object.fromEntries(
    TRADE_COMPLETENESS_ELIGIBLE_FIELDS.filter((field) => requirements[field]).map((field) => [
      field,
      true,
    ]),
  );
  const current =
    currentPreferences &&
    typeof currentPreferences === "object" &&
    !Array.isArray(currentPreferences)
      ? (currentPreferences as Record<string, unknown>)
      : {};
  return {
    ...current,
    ...tracking,
    [STATUS_REQUIREMENTS_KEY]: { trade_completeness: normalized },
  };
}

function normalizedSession(value: unknown): JournalSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim().slice(0, 80) : "";
  const label =
    typeof row.label === "string" ? row.label.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  if (!id || !label) return null;
  return {
    id,
    label,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    archivedAt: typeof row.archivedAt === "string" ? row.archivedAt : null,
  };
}

export function journalSessionsFromPreferences(config: unknown): JournalSession[] {
  const stored =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)[SESSIONS_KEY]
      : undefined;
  const custom = Array.isArray(stored)
    ? stored.map(normalizedSession).filter((row): row is JournalSession => row !== null)
    : [];
  const customById = new Map(custom.map((row) => [row.id, row]));
  return [
    ...DEFAULT_JOURNAL_SESSIONS.map((row) => customById.get(row.id) ?? row),
    ...custom.filter((row) => !DEFAULT_JOURNAL_SESSIONS.some((item) => item.id === row.id)),
  ];
}

export function journalPreferencesWithSessions(
  currentPreferences: unknown,
  sessions: JournalSession[],
): Record<string, unknown> {
  const current =
    currentPreferences &&
    typeof currentPreferences === "object" &&
    !Array.isArray(currentPreferences)
      ? (currentPreferences as Record<string, unknown>)
      : {};
  return { ...current, [SESSIONS_KEY]: sessions };
}

export function screenshotSlotsFromPreferences(config: unknown): ScreenshotSlotPreferences {
  const stored =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)[SCREENSHOT_SLOTS_KEY]
      : undefined;
  const values =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    SCREENSHOT_TIMEFRAMES.map((timeframe) => {
      const value =
        values[timeframe] && typeof values[timeframe] === "object"
          ? (values[timeframe] as Record<string, unknown>)
          : {};
      const label =
        typeof value.label === "string" ? value.label.trim().replace(/\s+/g, " ").slice(0, 32) : "";
      return [
        timeframe,
        {
          enabled:
            typeof value.enabled === "boolean"
              ? value.enabled
              : DEFAULT_SCREENSHOT_SLOT_PREFERENCES[timeframe].enabled,
          label: label || DEFAULT_SCREENSHOT_SLOT_PREFERENCES[timeframe].label,
        },
      ];
    }),
  ) as ScreenshotSlotPreferences;
}

export function journalPreferencesWithScreenshotSlots(
  currentPreferences: unknown,
  slots: ScreenshotSlotPreferences,
): Record<string, unknown> {
  const current =
    currentPreferences &&
    typeof currentPreferences === "object" &&
    !Array.isArray(currentPreferences)
      ? (currentPreferences as Record<string, unknown>)
      : {};
  return { ...current, [SCREENSHOT_SLOTS_KEY]: slots };
}

export function appearsInPlacement(
  config: JournalTrackingConfig,
  field: JournalTrackingField,
  placement: "quick_capture" | "detailed_review",
): boolean {
  return config[field] === placement || config[field] === "both";
}

export function isEligibleForTradeCompleteness(
  config: JournalTrackingConfig,
  field: JournalTrackingField,
): boolean {
  return (
    TRADE_COMPLETENESS_ELIGIBLE_FIELDS.includes(field) &&
    appearsInPlacement(config, field, "quick_capture")
  );
}

export const MARKET_CONDITIONS = [
  "Trending",
  "Ranging",
  "Reversal / transition",
  "Choppy / unclear",
] as const;
export const ENTRY_TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1D",
  "Custom",
] as const;
export const NEWS_INVOLVEMENT = [
  "No relevant news",
  "Before scheduled news",
  "During scheduled news",
  "After scheduled news",
  "Unexpected news",
] as const;
export const EXIT_REASONS = [
  "Target hit",
  "Stop loss",
  "Breakeven",
  "Manual exit",
  "Trailing stop",
  "Time/session exit",
  "Rule-based exit",
  "Other",
] as const;
export const TRADE_MANAGEMENT_ACTIONS = [
  "No adjustment",
  "Moved stop to breakeven",
  "Tightened stop",
  "Partial profit taken",
  "Added to position",
  "Trailing stop used",
  "Other",
] as const;

export function normalizeSingleValue(value: string | null | undefined, max = 80): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return normalized ? normalized.slice(0, max) : null;
}

export function normalizeEntryTimeframe(value: string | null | undefined): string | null {
  const normalized = normalizeSingleValue(value, 32);
  if (!normalized) return null;
  const aliases: Record<string, string> = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1D",
    daily: "1D",
    custom: "Custom",
  };
  return aliases[normalized.toLowerCase()] ?? normalized;
}

export function normalizeTags(values: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of values ?? []) {
    const value = normalizeSingleValue(raw, 48);
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(value);
    if (tags.length === 12) break;
  }
  return tags;
}

export function normalizeTradeManagement(values: string[] | null | undefined): string[] {
  const unique = normalizeTags(values);
  return unique.includes("No adjustment")
    ? ["No adjustment"]
    : unique.filter((value) => value !== "No adjustment");
}

export function toggleTradeManagement(current: string[], value: string): string[] {
  const selected = current.includes(value);
  if (value === "No adjustment") return selected ? [] : ["No adjustment"];
  if (selected) return current.filter((item) => item !== value);
  return [...current.filter((item) => item !== "No adjustment"), value];
}

export function stableTimeframeOrder(value: string): number {
  const normalized = normalizeEntryTimeframe(value);
  const index = ENTRY_TIMEFRAMES.indexOf(normalized as (typeof ENTRY_TIMEFRAMES)[number]);
  return index === -1 ? ENTRY_TIMEFRAMES.length : index;
}

export type TrackingConfigurationIssue = {
  field: JournalTrackingField;
  message: string;
};

const REVIEWABLE_FIELDS = JOURNAL_TRACKING_FIELDS.filter(
  (field) =>
    JOURNAL_FIELD_META[field].reviewable ||
    ["screenshots", "reasoning", "category", "grade"].includes(field),
);

export function validateTrackingConfiguration(
  config: JournalTrackingConfig,
  requirements: Partial<Record<JournalTrackingField, boolean>>,
  tradeRequirements: TradeCompletenessRequirements = {},
): TrackingConfigurationIssue[] {
  const issues: TrackingConfigurationIssue[] = [];
  for (const field of REVIEWABLE_FIELDS) {
    if (!requirements[field]) continue;
    if (config[field] === "hidden") {
      issues.push({
        field,
        message: `${JOURNAL_FIELD_META[field].label} is required for review and cannot be hidden.`,
      });
    }
  }
  for (const field of TRADE_COMPLETENESS_ELIGIBLE_FIELDS) {
    if (!tradeRequirements[field]) continue;
    if (!isEligibleForTradeCompleteness(config, field)) {
      issues.push({
        field,
        message: `${JOURNAL_FIELD_META[field].label} is required for trade completeness and must stay in Quick Capture.`,
      });
    }
    if (requirements[field] && config[field] === "both") {
      issues.push({
        field,
        message: `${JOURNAL_FIELD_META[field].label} cannot be required for both trade completeness and review completion.`,
      });
    }
  }
  return issues;
}

export const OPTIONAL_ANALYTICS_SECTIONS = [
  "entry_model",
  "market_condition",
  "entry_timeframe",
  "news_involvement",
  "exit_reason",
  "trade_management",
  "custom_tags",
] as const;
export type OptionalAnalyticsSection = (typeof OPTIONAL_ANALYTICS_SECTIONS)[number];
