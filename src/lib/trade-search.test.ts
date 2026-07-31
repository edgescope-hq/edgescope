import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTradeDateKey, matchesTradeSearch, tradeSearchSuggestions } from "./trade-search.ts";

const row = {
  num: 4,
  instrument: "EUR USD",
  category: "London Breakout",
  tradeDate: "2026-07-20",
};

describe("My Trades search", () => {
  it("matches hash-prefixed exact or partial trade numbers", () => {
    assert.equal(matchesTradeSearch(row, "#4"), true);
    assert.equal(matchesTradeSearch({ ...row, num: 42 }, "#4"), true);
    assert.equal(matchesTradeSearch(row, "#20"), false);
    assert.equal(matchesTradeSearch(row, "#"), true);
  });

  it("treats plain numbers as date queries rather than trade numbers or substrings", () => {
    assert.equal(matchesTradeSearch(row, "4"), false);
    assert.equal(matchesTradeSearch({ ...row, tradeDate: "2026-07-04" }, "4"), true);
    assert.equal(matchesTradeSearch(row, "20"), true);
    assert.equal(matchesTradeSearch({ ...row, tradeDate: "2026-08-04" }, "20"), false);
    assert.equal(matchesTradeSearch(row, "7"), true);
    assert.equal(matchesTradeSearch(row, "2026"), true);
  });

  it("matches textual, numeric, and ISO date formats without timezone conversion", () => {
    for (const query of [
      "jul",
      "july",
      "jul 20",
      "20 jul",
      "7/20/2026",
      "20/7/2026",
      "2026-07-20",
    ]) {
      assert.equal(matchesTradeSearch(row, query), true, query);
    }
    assert.equal(matchesTradeSearch(row, "jul 21"), false);
  });

  it("matches non-numeric instrument and setup text case-insensitively", () => {
    assert.equal(matchesTradeSearch(row, "eurusd"), true);
    assert.equal(matchesTradeSearch(row, "BREAKOUT"), true);
    assert.equal(matchesTradeSearch(row, "London Br"), true);
    assert.equal(matchesTradeSearch(row, "reversal"), false);
  });

  it("builds bounded hash suggestions and exact matches first", () => {
    const suggestions = tradeSearchSuggestions(
      [row, { ...row, num: 42, instrument: "BTCUSD" }],
      "#4",
    );
    assert.deepEqual(suggestions.map((item) => item.value), ["#4", "#42"]);
    assert.equal(tradeSearchSuggestions([row], "#")[0]?.value, "#4");
  });

  it("uses the visible day-month-year date format", () => {
    assert.equal(formatTradeDateKey("2026-07-19"), "19 Jul 2026");
  });

  it("restores all rows for blank input", () => {
    assert.equal(matchesTradeSearch(row, ""), true);
    assert.equal(matchesTradeSearch(row, "   "), true);
  });
});
