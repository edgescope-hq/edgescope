import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundedCalendarYears,
  formatDateKey,
  initialCalendarStartYear,
  parseDateKey,
} from "./trade-date-picker.ts";

describe("Trade Date picker model", () => {
  it("builds a bounded initial range from two years before the earliest trade", () => {
    assert.equal(
      initialCalendarStartYear({
        earliestTradeYear: 2026,
        selectedYear: 2026,
        currentYear: 2026,
      }),
      2024,
    );
    assert.deepEqual(boundedCalendarYears(2024, 2026), [2024, 2025, 2026]);
  });

  it("includes an older deliberately selected backfill year", () => {
    assert.equal(
      initialCalendarStartYear({
        earliestTradeYear: 2026,
        selectedYear: 2020,
        currentYear: 2026,
      }),
      2020,
    );
  });

  it("round-trips leap-day keys without timezone shifting", () => {
    const date = parseDateKey("2024-02-29");
    assert.ok(date);
    assert.equal(formatDateKey(date), "2024-02-29");
    assert.equal(parseDateKey("2026-02-29"), undefined);
    assert.equal(parseDateKey("2026-04-31"), undefined);
  });
});
