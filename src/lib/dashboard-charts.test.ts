import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarDayTick,
  compactDateTick,
  dashboardChartDateDomain,
  dashboardChartDateTicks,
  dashboardChartTime,
  dashboardCumulativeRPoints,
  dashboardDailyRPoints,
  dashboardChartEligibility,
  dashboardMovementStops,
  dashboardPointTick,
  formatRAxisTick,
} from "./dashboard-charts.ts";

describe("Dashboard chart eligibility", () => {
  const valid = {
    result: "win",
    risk_amount: 100,
    pnl_amount: 200,
  };

  it("renders after the first trade with a valid Risk and P/L pair", () => {
    assert.deepEqual(dashboardChartEligibility([]), {
      eligible: false,
      validTradeCount: 0,
    });
    assert.deepEqual(dashboardChartEligibility([valid]), {
      eligible: true,
      validTradeCount: 1,
    });
  });

  it("uses valid recorded legacy R only when the canonical pair is unavailable", () => {
    const result = dashboardChartEligibility([
      { result: "win", achieved_rr: 1.5 },
      { result: "win", risk_amount: 0, pnl_amount: 0 },
      { result: "breakeven", risk_amount: 100, pnl_amount: 0 },
    ]);
    assert.equal(result.validTradeCount, 2);
    assert.equal(result.eligible, true);
  });

  it("formats only signed R values on the axis", () => {
    assert.equal(formatRAxisTick(-2), "-2R");
    assert.equal(formatRAxisTick(0), "");
    assert.equal(formatRAxisTick(0.05), "+0.05R");
    assert.equal(formatRAxisTick(2), "+2R");
  });

  it("formats real calendar dates without inventing day zero", () => {
    assert.equal(calendarDayTick("2026-07-04"), "4");
    assert.equal(compactDateTick("2026-07-20"), "Jul 20");
  });

  it("aggregates same-date trades before plotting daily and cumulative R", () => {
    const trades = [
      { id: "late", trade_date: "2026-07-04", result: "loss", risk_amount: 100, pnl_amount: -50 },
      { id: "first", trade_date: "2026-07-02", result: "win", risk_amount: 100, pnl_amount: 200 },
      { id: "same-date", trade_date: "2026-07-04", result: "win", risk_amount: 50, pnl_amount: 25 },
      { id: "missing", trade_date: "2026-07-03", result: "win", risk_amount: 100 },
    ];
    const daily = dashboardDailyRPoints(trades);
    const points = dashboardCumulativeRPoints([...trades]);
    assert.deepEqual(
      daily.map((point) => [point.date, point.value, point.tradeCount]),
      [
        ["2026-07-02", 2, 1],
        ["2026-07-04", 0, 2],
      ],
    );
    assert.deepEqual(
      points.map((point) => [point.date, point.value, point.tradeCount]),
      [
        ["2026-07-02", 2, 1],
        ["2026-07-04", 2, 2],
      ],
    );
    assert.equal(new Set(points.map((point) => point.date)).size, points.length);
    assert.equal(dashboardPointTick(points[1]!.point, points[0]!.point), "Jul 4");
    assert.equal(dashboardChartEligibility(trades).eligible, true);
    assert.deepEqual(dashboardChartDateDomain(points), {
      start: dashboardChartTime("2026-07-02"),
      end: dashboardChartTime("2026-07-04"),
    });
    assert.deepEqual(dashboardChartDateTicks(points, 4), [
      dashboardChartTime("2026-07-02"),
      dashboardChartTime("2026-07-04"),
    ]);
  });

  it("keeps a one-trade single day eligible without inventing surrounding dates", () => {
    const sameDayTrades = [
      { trade_date: "2026-07-08", result: "win", risk_amount: 100, pnl_amount: 100 },
    ];
    const daily = dashboardDailyRPoints(sameDayTrades);
    const cumulative = dashboardCumulativeRPoints(sameDayTrades);
    const realDate = dashboardChartTime("2026-07-08");

    assert.equal(dashboardChartEligibility(sameDayTrades).eligible, true);
    assert.deepEqual(
      daily.map((point) => [point.date, point.value, point.tradeCount]),
      [["2026-07-08", 1, 1]],
    );
    assert.equal(cumulative.length, 1);
    assert.deepEqual(dashboardChartDateDomain(daily), { start: realDate, end: realDate });
    assert.deepEqual(dashboardChartDateTicks(daily, 4), [realDate]);
  });

  it("marks real monthly rises and falls without changing cumulative values", () => {
    const points = [
      { point: "1", date: "2026-07-02", value: 1, tradeCount: 1 },
      { point: "2", date: "2026-07-12", value: 2.5, tradeCount: 1 },
      { point: "3", date: "2026-07-22", value: 1.25, tradeCount: 1 },
    ];

    const stops = dashboardMovementStops(points);
    assert.deepEqual(
      stops.map(({ offset, tone }) => [offset, tone]),
      [
        [0, "rising"],
        [0.5, "rising"],
        [0.5, "falling"],
        [1, "falling"],
      ],
    );
    assert.deepEqual(
      points.map((point) => point.value),
      [1, 2.5, 1.25],
    );
  });
});
