import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeWinRate,
  equityCurve,
  fmtRR,
  weekdayFromTradeDate,
  weekdayStats,
  type TradeRow,
} from "./analytics.ts";
import { isResultComplete, realizedR } from "./trade-mappers.ts";

function trade(result: string | null) {
  return { result };
}

describe("computeWinRate", () => {
  it("null when no result-known trades", () => {
    assert.equal(computeWinRate([]), null);
    assert.equal(computeWinRate([trade(null)]), null);
    assert.equal(computeWinRate([trade(null), trade(null)]), null);
  });

  it("100% for 1 WIN", () => {
    assert.equal(computeWinRate([trade("win")]), 100);
  });

  it("0% for 1 LOSS", () => {
    assert.equal(computeWinRate([trade("loss")]), 0);
  });

  it("0% for 1 BREAK_EVEN", () => {
    assert.equal(computeWinRate([trade("breakeven")]), 0);
  });

  it("50% for 1 WIN + 1 LOSS", () => {
    assert.equal(computeWinRate([trade("win"), trade("loss")]), 50);
  });

  it("50% for 1 WIN + 1 BREAK_EVEN", () => {
    assert.equal(computeWinRate([trade("win"), trade("breakeven")]), 50);
  });

  it("33.3% for 1 WIN + 1 LOSS + 1 BREAK_EVEN", () => {
    const wr = computeWinRate([trade("win"), trade("loss"), trade("breakeven")]);
    assert.equal(typeof wr, "number");
    assert.equal((wr as number).toFixed(4), (100 / 3).toFixed(4));
  });

  it("100% when null result + 1 WIN (denominator excludes null)", () => {
    assert.equal(computeWinRate([trade(null), trade("win")]), 100);
  });

  it("counts WIN without risk/P&L data", () => {
    assert.equal(computeWinRate([trade("win")]), 100);
  });
});

describe("realised-R eligibility", () => {
  it("requires a valid result, positive risk, and numeric P/L", () => {
    assert.equal(isResultComplete({ result: "win", risk_amount: 100, pnl_amount: 200 }), true);
    assert.equal(isResultComplete({ result: "win", risk_amount: null, pnl_amount: 200 }), false);
    assert.equal(isResultComplete({ result: "win", risk_amount: 0, pnl_amount: 0 }), false);
    assert.equal(isResultComplete({ result: "open", risk_amount: 100, pnl_amount: 200 }), false);
  });

  it("keeps recorded zero distinct from missing R", () => {
    assert.equal(realizedR({ result: "breakeven", risk_amount: 100, pnl_amount: 0 }), 0);
    assert.equal(realizedR({ result: "win", risk_amount: 100, pnl_amount: null }), null);
    assert.equal(fmtRR(0), "0.00R");
    assert.equal(fmtRR(null), "—");
  });

  it("normalises result sign and derives R from the eligible pair", () => {
    assert.equal(realizedR({ result: "win", risk_amount: 100, pnl_amount: -250 }), 2.5);
    assert.equal(realizedR({ result: "loss", risk_amount: 100, pnl_amount: 250 }), -2.5);
  });
});

describe("equityCurve", () => {
  const row = (overrides: Partial<TradeRow>): TradeRow => ({
    id: "trade",
    result: "win",
    achieved_rr: 0,
    grade: null,
    session: null,
    killzone: null,
    market: "forex",
    trade_date: "2026-01-01",
    trade_time: null,
    created_at: null,
    emotion_before: null,
    emotion_during: null,
    emotion_after: null,
    categories: [],
    subcategories: [],
    mistake_tags: [],
    ...overrides,
  });

  it("orders valid R chronologically and excludes missing or non-finite values", () => {
    const curve = equityCurve([
      row({ id: "later", trade_date: "2026-01-02", achieved_rr: 2 }),
      row({ id: "missing", achieved_rr: null }),
      row({ id: "invalid", achieved_rr: Number.POSITIVE_INFINITY }),
      row({ id: "earlier", trade_date: "2026-01-01", achieved_rr: -1 }),
    ]);

    assert.deepEqual(
      curve.map((point) => point.cumR),
      [0, -1, 1],
    );
  });
});

describe("journal date weekdays", () => {
  it("keeps weekend journal dates in their stored weekday", () => {
    assert.equal(weekdayFromTradeDate("2026-07-25"), "Saturday");
    assert.equal(weekdayFromTradeDate("2026-07-26"), "Sunday");
  });

  it("does not shift a stored date at timezone boundaries", () => {
    assert.equal(weekdayFromTradeDate("2026-01-01"), "Thursday");
    assert.equal(weekdayFromTradeDate("2025-12-31"), "Wednesday");
  });

  it("uses Monday through Sunday fixed order", () => {
    const journalRow = (trade_date: string): TradeRow => ({
      result: "win",
      achieved_rr: 1,
      grade: null,
      session: null,
      killzone: null,
      market: "forex",
      trade_date,
      emotion_before: null,
      emotion_during: null,
      emotion_after: null,
      categories: [],
      subcategories: [],
      mistake_tags: [],
    });
    const rows = weekdayStats([
      journalRow("2026-07-26"),
      journalRow("2026-07-25"),
      journalRow("2026-07-20"),
    ]);
    assert.deepEqual(
      rows.map((item) => item.key),
      ["Monday", "Saturday", "Sunday"],
    );
  });
});
