import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_JOURNAL_TRACKING,
  DEFAULT_SCREENSHOT_SLOT_PREFERENCES,
  journalPreferencesWithScreenshotSlots,
  journalPreferencesWithSessions,
  journalSessionsFromPreferences,
  journalTrackingWithTradeCompletenessRequirements,
  journalTrackingFromPreferences,
  isEligibleForTradeCompleteness,
  normalizeTags,
  normalizeTradeManagement,
  toggleTradeManagement,
  stableTimeframeOrder,
  screenshotSlotsFromPreferences,
  tradeCompletenessRequirementsFromPreferences,
  validateTrackingConfiguration,
} from "./journal-tracking.ts";
import { analyticsPreferencesFromStored } from "./analytics-sections.ts";
import { getReviewStatus } from "./review-status.ts";

describe("journal tracking preferences", () => {
  it("uses guided defaults and ignores invalid placements", () => {
    assert.equal(journalTrackingFromPreferences(null).r_performance, "quick_capture");
    assert.deepEqual(
      journalTrackingFromPreferences({ entry_model: "both", grade: "quick_capture" }),
      { ...DEFAULT_JOURNAL_TRACKING, entry_model: "both", grade: "quick_capture" },
    );
  });

  it("keeps core completion while R Performance is disabled", () => {
    const trade = { instrument: "ES", direction: "long", result: "win" };
    assert.equal(getReviewStatus(trade), "incomplete");
    assert.equal(getReviewStatus({ ...trade, r_performance_enabled: false }), "needs_review");
  });

  it("normalizes tags and prevents management contradictions", () => {
    assert.deepEqual(normalizeTags([" CPI ", "cpi", "Re-entry", " "]), ["CPI", "Re-entry"]);
    assert.deepEqual(normalizeTradeManagement(["No adjustment", "Partial profit taken"]), [
      "No adjustment",
    ]);
  });

  it("preserves non-exclusive Trade Management selections", () => {
    const several = [
      "Moved stop to breakeven",
      "Partial profit taken",
      "Trailing stop used",
    ].reduce(toggleTradeManagement, [] as string[]);
    assert.deepEqual(several, [
      "Moved stop to breakeven",
      "Partial profit taken",
      "Trailing stop used",
    ]);
    assert.deepEqual(toggleTradeManagement(several, "Partial profit taken"), [
      "Moved stop to breakeven",
      "Trailing stop used",
    ]);
    assert.deepEqual(toggleTradeManagement(several, "No adjustment"), ["No adjustment"]);
    assert.deepEqual(toggleTradeManagement(["No adjustment"], "Tightened stop"), [
      "Tightened stop",
    ]);
    assert.deepEqual(normalizeTradeManagement(several), several);
  });

  it("uses a stable entry-timeframe order", () => {
    assert.ok(stableTimeframeOrder("5m") < stableTimeframeOrder("1h"));
    assert.ok(stableTimeframeOrder("Daily") < stableTimeframeOrder("Custom"));
  });

  it("rejects required fields hidden from every workflow", () => {
    const config = { ...DEFAULT_JOURNAL_TRACKING, reasoning: "hidden" as const };
    assert.deepEqual(validateTrackingConfiguration(config, { reasoning: true }), [
      {
        field: "reasoning",
        message: "Trade reasoning is required for review and cannot be hidden.",
      },
    ]);
  });

  it("persists only eligible trade-completeness selections beside placements", () => {
    const stored = journalTrackingWithTradeCompletenessRequirements(DEFAULT_JOURNAL_TRACKING, {
      session: true,
      emotions: true,
    });
    assert.deepEqual(tradeCompletenessRequirementsFromPreferences(stored), { session: true });
  });

  it("preserves extensible preference metadata when tracking is saved", () => {
    const stored = journalTrackingWithTradeCompletenessRequirements(
      DEFAULT_JOURNAL_TRACKING,
      { session: true },
      { __sessions: [{ id: "custom_a", label: "Frankfurt" }], future_key: { enabled: true } },
    );
    assert.deepEqual(stored.future_key, { enabled: true });
    assert.deepEqual(stored.__sessions, [{ id: "custom_a", label: "Frankfurt" }]);
  });

  it("loads default sessions and keeps archived custom sessions", () => {
    const current = journalPreferencesWithSessions({}, [
      {
        id: "custom_a",
        label: "Frankfurt",
        createdAt: "2026-07-24T00:00:00.000Z",
        archivedAt: "2026-07-25T00:00:00.000Z",
      },
    ]);
    const sessions = journalSessionsFromPreferences(current);
    assert.deepEqual(
      sessions.slice(0, 4).map((session) => session.id),
      ["asia", "london", "new_york", "london_new_york"],
    );
    assert.equal(sessions.find((session) => session.id === "custom_a")?.archivedAt != null, true);
  });

  it("normalizes screenshot slot labels without changing internal roles", () => {
    const stored = journalPreferencesWithScreenshotSlots(
      { future_key: true },
      {
        HTF: { enabled: false, label: "  Context  " },
        MTF: { enabled: true, label: "" },
        LTF: { enabled: true, label: "Entry" },
      },
    );
    const slots = screenshotSlotsFromPreferences(stored);
    assert.deepEqual(slots, {
      HTF: { enabled: false, label: "Context" },
      MTF: { enabled: true, label: DEFAULT_SCREENSHOT_SLOT_PREFERENCES.MTF.label },
      LTF: { enabled: true, label: "Entry" },
    });
    assert.equal(stored.future_key, true);
  });

  it("defaults to the private LTF capture slot without changing internal identities", () => {
    assert.deepEqual(screenshotSlotsFromPreferences(null), {
      HTF: { enabled: false, label: "HTF" },
      MTF: { enabled: false, label: "MTF" },
      LTF: { enabled: true, label: "LTF" },
    });
  });

  it("allows Community placement without making it a status requirement", () => {
    const stored = journalTrackingWithTradeCompletenessRequirements(
      { ...DEFAULT_JOURNAL_TRACKING, community: "both" },
      { community: true } as never,
    );
    assert.equal(journalTrackingFromPreferences(stored).community, "both");
    assert.deepEqual(tradeCompletenessRequirementsFromPreferences(stored), {});
  });

  it("exposes status eligibility only for requirement-capable Quick Capture fields", () => {
    const tracking = {
      ...DEFAULT_JOURNAL_TRACKING,
      session: "hidden" as const,
      entry_model: "both" as const,
      community: "both" as const,
    };
    assert.equal(isEligibleForTradeCompleteness(tracking, "session"), false);
    assert.equal(isEligibleForTradeCompleteness(tracking, "entry_model"), true);
    assert.equal(isEligibleForTradeCompleteness(tracking, "community"), false);
    assert.equal(isEligibleForTradeCompleteness(tracking, "emotions"), false);
  });

  it("restores screenshot defaults without changing sessions or unrelated preference metadata", () => {
    const sessions = [
      {
        id: "custom_open",
        label: "Open",
        createdAt: "2026-07-01T00:00:00.000Z",
        archivedAt: null,
      },
    ];
    const slots = {
      HTF: { enabled: true, label: "Context" },
      MTF: { enabled: false, label: "MTF" },
      LTF: { enabled: true, label: "Entry" },
    };
    const current = journalPreferencesWithScreenshotSlots(
      journalPreferencesWithSessions({ analytics_marker: "keep" }, sessions),
      slots,
    );
    const restoredTracking = journalPreferencesWithScreenshotSlots(
      journalTrackingWithTradeCompletenessRequirements(DEFAULT_JOURNAL_TRACKING, {}, current),
      DEFAULT_SCREENSHOT_SLOT_PREFERENCES,
    );

    assert.equal(restoredTracking.analytics_marker, "keep");
    assert.deepEqual(journalSessionsFromPreferences(restoredTracking).at(-1), sessions[0]);
    assert.deepEqual(
      screenshotSlotsFromPreferences(restoredTracking),
      DEFAULT_SCREENSHOT_SLOT_PREFERENCES,
    );
  });

  it("normalizes persisted Analytics visibility and order", () => {
    const preferences = analyticsPreferencesFromStored({
      hidden: ["custom_tags", "bad"],
      order: ["news_involvement", "news_involvement", "bad"],
    });
    assert.deepEqual(preferences.hidden, ["custom_tags"]);
    assert.ok(
      preferences.order.indexOf("news_involvement") < preferences.order.indexOf("custom_tags"),
    );
    assert.equal(new Set(preferences.order).size, preferences.order.length);
  });
});
