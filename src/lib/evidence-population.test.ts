import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountTypePreservesEvidencePopulation,
  actualJournalTrades,
  evidenceOccurrencesForTrades,
  journalEvidencePopulationForTrade,
  journalTradesForEvidenceView,
} from "./evidence-population.ts";

const accounts = [
  { id: "personal", account_type: "personal" },
  { id: "live", account_type: "live" },
  { id: "funded", account_type: "funded" },
  { id: "challenge", account_type: "challenge" },
  { id: "demo", account_type: "demo" },
  { id: "backtest", account_type: "backtest" },
];

const trades = [
  { id: "actual-1", account_id: "personal", is_paper: false },
  { id: "actual-2", account_id: "live", is_paper: false },
  { id: "actual-3", account_id: "funded", is_paper: false },
  { id: "actual-4", account_id: "challenge", is_paper: false },
  { id: "practice-demo", account_id: "demo", is_paper: false },
  { id: "practice-paper", account_id: "live", is_paper: true },
  { id: "research-backtest", account_id: "backtest", is_paper: false },
  { id: "unknown-unlinked", account_id: null, is_paper: false },
  { id: "unknown-account", account_id: "missing", is_paper: false },
];

describe("journal evidence population", () => {
  it("distinguishes actual, practice, research, and unknown without inference", () => {
    assert.equal(journalEvidencePopulationForTrade(trades[0], accounts), "actual");
    assert.equal(journalEvidencePopulationForTrade(trades[4], accounts), "practice");
    assert.equal(journalEvidencePopulationForTrade(trades[5], accounts), "practice");
    assert.equal(journalEvidencePopulationForTrade(trades[6], accounts), "research");
    assert.equal(journalEvidencePopulationForTrade(trades[7], accounts), "unknown");
    assert.equal(journalEvidencePopulationForTrade(trades[8], accounts), "unknown");
  });

  it("keeps the default evidence population actual-only", () => {
    assert.deepEqual(
      actualJournalTrades(trades, accounts).map((trade) => trade.id),
      ["actual-1", "actual-2", "actual-3", "actual-4"],
    );
    assert.deepEqual(
      journalTradesForEvidenceView(trades, accounts, "ALL").map((trade) => trade.id),
      ["actual-1", "actual-2", "actual-3", "actual-4"],
    );
  });

  it("allows deliberate account inspection without admitting Paper rows", () => {
    assert.deepEqual(
      journalTradesForEvidenceView(trades, accounts, "demo").map((trade) => trade.id),
      ["practice-demo"],
    );
    assert.deepEqual(
      journalTradesForEvidenceView(trades, accounts, "backtest").map((trade) => trade.id),
      ["research-backtest"],
    );
    assert.deepEqual(
      journalTradesForEvidenceView(trades, accounts, "live").map((trade) => trade.id),
      ["actual-2"],
    );
  });

  it("filters measurement occurrences while preserving stored rows", () => {
    const occurrences = trades.map((trade) => ({ id: `occ-${trade.id}`, trade_id: trade.id }));
    assert.deepEqual(
      evidenceOccurrencesForTrades(occurrences, actualJournalTrades(trades, accounts)).map(
        (occurrence) => occurrence.trade_id,
      ),
      ["actual-1", "actual-2", "actual-3", "actual-4"],
    );
    assert.equal(occurrences.length, trades.length);
  });

  it("prevents an account edit from reclassifying its evidence population", () => {
    assert.equal(accountTypePreservesEvidencePopulation("personal", "live"), true);
    assert.equal(accountTypePreservesEvidencePopulation("live", "funded"), true);
    assert.equal(accountTypePreservesEvidencePopulation("demo", "live"), false);
    assert.equal(accountTypePreservesEvidencePopulation("demo", "backtest"), false);
    assert.equal(accountTypePreservesEvidencePopulation("backtest", "personal"), false);
  });
});
