import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScopeDiscoveries, buildStandardChallenges } from "./scope-discovery";
import type { DbTrade } from "./trade-mappers";

function trade(index: number, overrides: Partial<DbTrade> = {}): DbTrade {
  return {
    id: `trade-${index}`,
    trade_date: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
    trade_time: null,
    market: "other",
    instrument: "ES",
    direction: null,
    result: index % 2 ? "win" : "loss",
    grade: null,
    session: null,
    killzone: null,
    achieved_rr: null,
    planned_rr: null,
    risk_amount: 100,
    reward_amount: index % 2 ? 100 : -100,
    pnl_amount: index % 2 ? 100 : -100,
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
  };
}

describe("Scope claim-specific evidence", () => {
  it("can return zero insights and never treats an absent issue tag as clean execution", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      trade(index, {
        result: index < 6 ? "loss" : "win",
        pnl_amount: index < 6 ? -100 : 100,
        reward_amount: index < 6 ? -100 : 100,
        mistake_tags: index < 6 ? ["Moved SL"] : [],
      }),
    );
    const scan = buildScopeDiscoveries(rows);
    assert.equal(scan.evidenceTradeCount, 12);
    assert.deepEqual(scan.discoveries, []);
  });

  it("quarantines paper rows from trader-wide evidence", () => {
    const scan = buildScopeDiscoveries([
      trade(1, { is_paper: false }),
      trade(2, { is_paper: true }),
    ]);
    assert.equal(scan.evidenceTradeCount, 1);
  });

  it("requires captured current-version intent and manual adherence for a standard challenge", () => {
    const version = {
      id: "version-1",
      effective_from: "2026-08-01T00:00:00.000Z",
    };
    const standard = {
      id: "standard-1",
      title: "Opening range continuation",
      status: "active",
      current_version: version,
    };
    const matching = [1, 2, 3].map((index) =>
      trade(index, {
        result: "loss",
        pnl_amount: -100,
        reward_amount: -100,
        setup_intent_version_id: version.id,
        setup_intent_provenance: "capture",
        setup_intent_recorded_at: "2026-08-11T10:00:00.000Z",
        setup_adherence: "followed",
      }),
    );
    const baseline = [4, 5, 6].map((index) =>
      trade(index, { result: "win", pnl_amount: 100, reward_amount: 100 }),
    );

    assert.equal(buildStandardChallenges([...matching, ...baseline], [standard]).length, 1);
    assert.equal(
      buildStandardChallenges(
        matching.map((row) => ({ ...row, setup_intent_provenance: "retrospective_review" })),
        [standard],
      ).length,
      0,
    );
  });
});
