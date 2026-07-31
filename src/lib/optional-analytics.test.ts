import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { optionalFieldAnalytics, sampleLabel } from "./optional-analytics.ts";
import type { DbTrade } from "./trade-mappers.ts";

const trade = (overrides: Partial<DbTrade>): DbTrade => ({
  id: crypto.randomUUID(),
  trade_date: "2026-07-20",
  trade_time: null,
  market: "other",
  instrument: "ES",
  direction: "long",
  result: "win",
  grade: null,
  session: null,
  killzone: null,
  achieved_rr: 1,
  planned_rr: null,
  risk_amount: 10,
  reward_amount: 10,
  pnl_amount: 10,
  reasoning: null,
  lessons_learned: null,
  notes: null,
  mistakes_made: null,
  private_notes: null,
  emotion_before: null,
  emotion_during: null,
  emotion_after: null,
  emotion_tags: [],
  mistake_tags: [],
  categories: [],
  subcategories: [],
  is_shared: false,
  in_killzone: null,
  ...overrides,
});

describe("optional tracking Analytics", () => {
  it("keeps missing R unavailable rather than converting it to zero", () => {
    const rows = optionalFieldAnalytics(
      [trade({ entry_model: "Sweep", achieved_rr: null, risk_amount: null, pnl_amount: null })],
      (item) => (item.entry_model ? [item.entry_model] : []),
    );
    assert.equal(rows[0].netR, null);
    assert.equal(rows[0].avgR, null);
  });
  it("groups values case-insensitively while retaining readable display text", () => {
    const rows = optionalFieldAnalytics(
      [trade({ custom_tags: ["CPI"] }), trade({ custom_tags: ["cpi"] })],
      (item) => item.custom_tags ?? [],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].count, 2);
  });
  it("uses the established early and small sample treatments", () => {
    assert.equal(sampleLabel(2), "early");
    assert.equal(sampleLabel(3), "small");
    assert.equal(sampleLabel(10), "normal");
  });
});
