import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANALYTICS_SECTION_IDS,
  DEFAULT_ANALYTICS_PREFERENCES,
  analyticsPreferencesFromStored,
  analyticsPreferencesForStorage,
  analyticsKpiIds,
  analyticsSectionColumns,
  analyticsSectionAvailability,
  moveAnalyticsSection,
  setAnalyticsSectionVisible,
  visibleAnalyticsSections,
} from "./analytics-sections.ts";
import { DEFAULT_JOURNAL_TRACKING } from "./journal-tracking.ts";

describe("unified Analytics section preferences", () => {
  it("upgrades optional-only preferences without overwriting choices", () => {
    const stored = analyticsPreferencesFromStored({
      hidden: ["custom_tags"],
      order: ["news_involvement", "entry_model", "custom_tags"],
    });

    assert.equal(stored.order.length, ANALYTICS_SECTION_IDS.length);
    assert.deepEqual(stored.hidden, ["custom_tags"]);
    assert.ok(stored.order.indexOf("news_involvement") < stored.order.indexOf("entry_model"));
    assert.ok(stored.order.indexOf("entry_model") < stored.order.indexOf("custom_tags"));
    assert.equal(new Set(stored.order).size, stored.order.length);
  });

  it("ignores stale IDs, removes duplicates, and inserts all missing sections", () => {
    const stored = analyticsPreferencesFromStored({
      hidden: ["direction", "unknown", "direction"],
      order: ["session", "unknown", "session"],
    });

    assert.deepEqual(stored.hidden, ["direction"]);
    assert.equal(stored.order.filter((id) => id === "session").length, 1);
    assert.deepEqual(new Set(stored.order), new Set(ANALYTICS_SECTION_IDS));
  });

  it("restores the complete curated defaults", () => {
    assert.deepEqual(DEFAULT_ANALYTICS_PREFERENCES.summaryCards, [
      "total_trades",
      "win_rate",
      "net_r",
      "avg_r",
      "completed_reviews",
    ]);
    assert.deepEqual(DEFAULT_ANALYTICS_PREFERENCES.order, [...ANALYTICS_SECTION_IDS]);
    assert.ok(DEFAULT_ANALYTICS_PREFERENCES.hidden.includes("custom_tags"));
  });

  it("serializes valid defaults without changing order or visibility", () => {
    assert.deepEqual(analyticsPreferencesForStorage(DEFAULT_ANALYTICS_PREFERENCES), {
      hidden: DEFAULT_ANALYTICS_PREFERENCES.hidden,
      order: DEFAULT_ANALYTICS_PREFERENCES.order,
      summaryCards: DEFAULT_ANALYTICS_PREFERENCES.summaryCards,
    });
  });

  it("restores only the active Analytics preference area", () => {
    const stored = analyticsPreferencesFromStored({
      hidden: ["session"],
      order: ["instrument", "session"],
      summaryCards: ["total_trades", "completed_reviews"],
    });
    const summaryRestore = {
      ...stored,
      summaryCards: [...DEFAULT_ANALYTICS_PREFERENCES.summaryCards],
    };
    const reportRestore = {
      ...stored,
      hidden: [...DEFAULT_ANALYTICS_PREFERENCES.hidden],
    };

    assert.deepEqual(summaryRestore.hidden, stored.hidden);
    assert.deepEqual(summaryRestore.order, stored.order);
    assert.deepEqual(reportRestore.summaryCards, stored.summaryCards);
    assert.deepEqual(reportRestore.order, stored.order);
  });

  it("moves and hides legacy and optional sections in the same model", () => {
    const movedLegacy = moveAnalyticsSection(DEFAULT_ANALYTICS_PREFERENCES, "session", -1);
    assert.ok(movedLegacy.order.indexOf("session") < movedLegacy.order.indexOf("direction"));

    const movedOptional = moveAnalyticsSection(movedLegacy, "custom_tags", -1);
    assert.ok(
      movedOptional.order.indexOf("custom_tags") < movedOptional.order.indexOf("news_involvement"),
    );

    const hidden = setAnalyticsSectionVisible(movedOptional, "session", false);
    assert.ok(hidden.hidden.includes("session"));
    assert.ok(!setAnalyticsSectionVisible(hidden, "session", true).hidden.includes("session"));
  });
});

describe("Analytics section availability and R suppression", () => {
  it("removes R KPIs while retaining the non-R summary", () => {
    assert.deepEqual(analyticsKpiIds(false), ["total_trades", "win_rate", "completed_reviews"]);
    assert.ok(analyticsKpiIds(true).includes("profit_factor"));
    assert.ok(!analyticsKpiIds(true).includes("max_drawdown"));
  });

  it("omits R columns from every mixed breakdown and restores them", () => {
    for (const id of [
      "direction",
      "session",
      "category",
      "killzone",
      "day",
      "mistakes",
      "emotions",
      "grade",
      "instrument",
      "entry_model",
      "market_condition",
      "entry_timeframe",
      "news_involvement",
      "exit_reason",
      "trade_management",
      "custom_tags",
    ] as const) {
      const disabled = analyticsSectionColumns(id, false);
      const enabled = analyticsSectionColumns(id, true);
      assert.ok(
        !disabled.some((column) =>
          ["net_r", "avg_r", "avg_win", "avg_loss", "profit_factor"].includes(column),
        ),
      );
      assert.ok(enabled.length > disabled.length);
      assert.ok(
        disabled.includes(
          id === "mistakes"
            ? "occurrences"
            : id === "grade"
              ? "trades"
              : id === "emotions"
                ? "count"
                : "trades",
        ),
      );
    }
  });

  it("makes R-only sections unavailable while mixed sections remain", () => {
    assert.equal(
      analyticsSectionAvailability("equity_curve", DEFAULT_JOURNAL_TRACKING, false).available,
      false,
    );
    assert.equal(
      analyticsSectionAvailability("planned_vs_achieved", DEFAULT_JOURNAL_TRACKING, false)
        .available,
      false,
    );
    for (const id of [
      "highlights",
      "direction",
      "session",
      "category",
      "killzone",
      "day",
      "mistakes",
      "emotions",
      "instrument",
    ] as const) {
      assert.equal(
        analyticsSectionAvailability(id, DEFAULT_JOURNAL_TRACKING, false).available,
        true,
      );
    }
  });

  it("restores R-only sections without changing stored visibility or order", () => {
    const preferences = analyticsPreferencesFromStored({
      hidden: ["equity_curve"],
      order: ["planned_vs_achieved", "equity_curve"],
    });
    const disabled = visibleAnalyticsSections(preferences, DEFAULT_JOURNAL_TRACKING, false);
    const enabled = visibleAnalyticsSections(preferences, DEFAULT_JOURNAL_TRACKING, true);

    assert.ok(!disabled.includes("planned_vs_achieved"));
    assert.ok(enabled.includes("planned_vs_achieved"));
    assert.ok(!enabled.includes("equity_curve"));
    assert.deepEqual(preferences.hidden, ["equity_curve"]);
    assert.equal(preferences.order[0], "planned_vs_achieved");
  });

  it("temporarily removes tracking-bound sections and restores their preference", () => {
    const preferences = analyticsPreferencesFromStored({ order: ["entry_model", "direction"] });
    const disabledTracking = { ...DEFAULT_JOURNAL_TRACKING, entry_model: "hidden" as const };
    const enabledTracking = { ...disabledTracking, entry_model: "both" as const };

    assert.ok(
      !visibleAnalyticsSections(preferences, disabledTracking, true).includes("entry_model"),
    );
    assert.ok(visibleAnalyticsSections(preferences, enabledTracking, true).includes("entry_model"));
    assert.ok(preferences.order.indexOf("entry_model") < preferences.order.indexOf("direction"));
  });

  it("renders reports in curated order even when legacy stored order differs", () => {
    const preferences = analyticsPreferencesFromStored({
      hidden: [],
      order: ["instrument", "highlights", "direction"],
    });
    const visible = visibleAnalyticsSections(preferences, DEFAULT_JOURNAL_TRACKING, true);
    assert.ok(visible.indexOf("highlights") < visible.indexOf("direction"));
    assert.ok(visible.indexOf("direction") < visible.indexOf("instrument"));
  });
});
