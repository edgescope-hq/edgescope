import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarDayTick,
  compactDateTick,
  dashboardCumulativeRPoints,
  dashboardChartEligibility,
  dashboardPointTick,
  formatRAxisTick,
  missingRTradeHeadline,
} from "./dashboard-charts.ts";

describe("Dashboard chart eligibility", () => {
  const valid = {
    result: "win",
    risk_amount: 100,
    pnl_amount: 200,
  };

  it("renders after exactly three trades with a valid Risk and P/L pair", () => {
    assert.deepEqual(dashboardChartEligibility([]), {
      eligible: false,
      validTradeCount: 0,
      missingTradeCount: 3,
    });
    assert.deepEqual(dashboardChartEligibility([valid]), {
      eligible: false,
      validTradeCount: 1,
      missingTradeCount: 2,
    });
    assert.equal(dashboardChartEligibility([valid, { ...valid, result: "loss" }]).eligible, false);
    assert.equal(dashboardChartEligibility([valid, { ...valid, result: "loss" }, valid]).eligible, true);
  });

  it("does not count persisted or zero R without the canonical pair", () => {
    const result = dashboardChartEligibility([
      { result: "win" },
      { result: "win", risk_amount: 0, pnl_amount: 0 },
      { result: "breakeven", risk_amount: 100, pnl_amount: 0 },
    ]);
    assert.equal(result.validTradeCount, 1);
    assert.equal(result.missingTradeCount, 2);
  });

  it("formats only signed R values on the axis", () => {
    assert.equal(formatRAxisTick(-2), "-2R");
    assert.equal(formatRAxisTick(0), "0R");
    assert.equal(formatRAxisTick(2), "+2R");
  });

  it("formats the dynamic missing-trade headline", () => {
    assert.equal(missingRTradeHeadline(1), "1 more trade with R data needed");
    assert.equal(missingRTradeHeadline(2), "2 more trades with R data needed");
  });

  it("formats real calendar dates without inventing day zero", () => {
    assert.equal(calendarDayTick("2026-07-04"), "4");
    assert.equal(compactDateTick("2026-07-20"), "Jul 20");
  });

  it("sorts valid realised-R trades and keeps same-date trades as separate points", () => {
    const points = dashboardCumulativeRPoints([
      { id: "late", trade_date: "2026-07-04", result: "loss", risk_amount: 100, pnl_amount: -50 },
      { id: "first", trade_date: "2026-07-02", result: "win", risk_amount: 100, pnl_amount: 200 },
      { id: "same-date", trade_date: "2026-07-04", result: "breakeven", risk_amount: 50, pnl_amount: 0 },
      { id: "missing", trade_date: "2026-07-03", result: "win", risk_amount: 100 },
    ]);
    assert.deepEqual(
      points.map((point) => [point.date, point.cumulativeR]),
      [
        ["2026-07-02", 2],
        ["2026-07-04", 1.5],
        ["2026-07-04", 1.5],
      ],
    );
    assert.equal(dashboardPointTick(points[2]!.point, points[1]!.point), "");
  });
});
