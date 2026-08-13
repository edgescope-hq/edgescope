import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dashboardExecutionFocusShowsRecentre,
  dashboardExecutionFocusState,
  dashboardTradesForAccount,
} from "./dashboard-data.ts";

describe("Dashboard account scope", () => {
  const accounts = [
    { id: "account-a", account_type: "live" },
    { id: "account-b", account_type: "demo" },
  ];
  const trades = [
    { id: "a-1", account_id: "account-a", is_paper: false },
    { id: "b-1", account_id: "account-b", is_paper: false },
    { id: "a-2", account_id: "account-a", is_paper: false },
  ];

  it("uses actual evidence only for the default scope", () => {
    assert.deepEqual(
      dashboardTradesForAccount(trades, accounts, "ALL").map((trade) => trade.id),
      ["a-1", "a-2"],
    );
  });

  it("allows explicit practice-account inspection and supports an empty account", () => {
    assert.deepEqual(
      dashboardTradesForAccount(trades, accounts, "account-b").map((trade) => trade.id),
      ["b-1"],
    );
    assert.deepEqual(dashboardTradesForAccount(trades, accounts, "empty-account"), []);
  });
});

describe("Dashboard Execution Focus priority", () => {
  it("uses the required deterministic priority when triggers overlap", () => {
    assert.equal(
      dashboardExecutionFocusState({ latestValidR: -3, currentLoss: 5, currentWin: 0 }),
      "large_loss",
    );
    assert.equal(
      dashboardExecutionFocusState({ latestValidR: 1, currentLoss: 4, currentWin: 4 }),
      "losing_streak",
    );
    assert.equal(
      dashboardExecutionFocusState({ latestValidR: 1, currentLoss: 0, currentWin: 3 }),
      "strong_run",
    );
    assert.equal(
      dashboardExecutionFocusState({ latestValidR: null, currentLoss: 2, currentWin: 2 }),
      "process_first",
    );
  });

  it("uses -3R as the large-loss boundary", () => {
    assert.equal(
      dashboardExecutionFocusState({ latestValidR: -2.99, currentLoss: 0, currentWin: 0 }),
      "process_first",
    );
    assert.equal(
      dashboardExecutionFocusState({ latestValidR: -3, currentLoss: 0, currentWin: 0 }),
      "large_loss",
    );
  });

  it("offers Recentre only for a large loss or a loss streak of at least five", () => {
    assert.equal(dashboardExecutionFocusShowsRecentre("losing_streak", 3), false);
    assert.equal(dashboardExecutionFocusShowsRecentre("losing_streak", 4), false);
    assert.equal(dashboardExecutionFocusShowsRecentre("losing_streak", 5), true);
    assert.equal(dashboardExecutionFocusShowsRecentre("large_loss", 0), true);
    assert.equal(dashboardExecutionFocusShowsRecentre("strong_run", 0), false);
    assert.equal(dashboardExecutionFocusShowsRecentre("process_first", 0), false);
  });
});
