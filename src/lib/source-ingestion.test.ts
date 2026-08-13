import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPaperTrade, realizedRContract } from "./trade-mappers.ts";
import {
  buildObjectiveSourceEventInsert,
  resolveNormalizedNetPnl,
  stableExternalEventIdentity,
  type NormalizedSourceEconomics,
  type ObjectiveSourceEventDraft,
} from "./source-ingestion.ts";

const completeEconomics: NormalizedSourceEconomics = {
  currency: "USD",
  grossPnl: 125,
  commission: -4,
  fees: -1.25,
  swap: -0.75,
  otherCosts: 0,
  netPnl: null,
};

describe("source ingestion domain", () => {
  it("derives normalized net only from complete signed components", () => {
    assert.deepEqual(resolveNormalizedNetPnl(completeEconomics), {
      value: 119,
      provenance: "derived_complete_components",
    });

    assert.deepEqual(resolveNormalizedNetPnl({ ...completeEconomics, fees: null }), {
      value: null,
      provenance: "missing",
    });
  });

  it("keeps an explicit source-reported net authoritative without fabricating missing costs", () => {
    assert.deepEqual(
      resolveNormalizedNetPnl({
        currency: "USD",
        grossPnl: null,
        commission: null,
        fees: null,
        swap: null,
        otherCosts: null,
        netPnl: 87.35,
      }),
      { value: 87.35, provenance: "source_reported" },
    );
  });

  it("recognizes stable IDs only inside their real source scope", () => {
    assert.deepEqual(
      stableExternalEventIdentity({
        sourceId: "source-a",
        sourceAccountId: "account-a",
        externalIdKind: "deal",
        externalEventId: "42",
      }),
      {
        scopeKind: "source_account",
        scopeId: "account-a",
        externalIdKind: "deal",
        externalEventId: "42",
      },
    );
    assert.equal(
      stableExternalEventIdentity({
        sourceId: "source-a",
        sourceAccountId: null,
        externalIdKind: null,
        externalEventId: null,
      }),
      null,
    );
  });

  it("preserves raw, time, symbol, and economics evidence through normalization", () => {
    const rawPayload = {
      Symbol: "EURUSD.r",
      Time: "12/08/2026 14:35:09 +05:30",
      Commission: "-4.00",
    };
    const event = buildObjectiveSourceEventInsert({
      userId: "user-a",
      sourceId: "source-a",
      sourceAccountId: "account-a",
      ingestionRunId: "run-a",
      eventKind: "partial_exit",
      externalIdKind: "deal",
      externalEventId: "deal-42",
      sourceSymbol: "EURUSD.r",
      normalizedInstrument: "EURUSD",
      sourceTimestamp: "12/08/2026 14:35:09 +05:30",
      occurredAt: "2026-08-12T09:05:09.000Z",
      sourceTimezone: "Asia/Calcutta",
      sourceUtcOffsetMinutes: 330,
      economics: completeEconomics,
      rawPayload,
      normalizationMetadata: { adapter: "csv", mapping_version: 1 },
    });

    assert.deepEqual(event.raw_payload, rawPayload);
    assert.equal(event.source_symbol, "EURUSD.r");
    assert.equal(event.normalized_instrument, "EURUSD");
    assert.equal(event.source_timestamp, "12/08/2026 14:35:09 +05:30");
    assert.equal(event.occurred_at, "2026-08-12T09:05:09.000Z");
    assert.equal(event.commission, -4);
    assert.equal(event.net_pnl, null);
  });

  it("projects objective evidence without allowing trader enrichment to leak in", () => {
    const draft: ObjectiveSourceEventDraft & {
      category: string;
      reasoning: string;
      setup_intent_version_id: string;
      emotion_before: string;
    } = {
      userId: "user-a",
      sourceId: "source-a",
      ingestionRunId: "run-a",
      eventKind: "fill",
      economics: completeEconomics,
      rawPayload: { deal: "42" },
      category: "A setup",
      reasoning: "inferred narrative",
      setup_intent_version_id: "standard-a",
      emotion_before: "calm",
    };

    const event = buildObjectiveSourceEventInsert(draft);
    assert.equal("category" in event, false);
    assert.equal("reasoning" in event, false);
    assert.equal("setup_intent_version_id" in event, false);
    assert.equal("emotion_before" in event, false);
  });

  it("rejects half-formed definitive external identities", () => {
    assert.throws(
      () =>
        buildObjectiveSourceEventInsert({
          userId: "user-a",
          sourceId: "source-a",
          ingestionRunId: "run-a",
          eventKind: "fill",
          externalIdKind: "deal",
          economics: completeEconomics,
          rawPayload: {},
        }),
      /requires both ID kind and ID value/,
    );
  });

  it("does not change canonical realized-R or Paper quarantine semantics", () => {
    assert.deepEqual(
      realizedRContract({ status: "closed", result: "win", risk_amount: null, pnl_amount: 250 }),
      { value: null, source: "missing", eligible: false },
    );
    assert.deepEqual(
      realizedRContract({
        status: "closed",
        result: "win",
        risk_amount: null,
        pnl_amount: 250,
        achieved_rr: 1.5,
      }),
      { value: 1.5, source: "recorded_legacy", eligible: true },
    );
    assert.equal(isPaperTrade({ is_paper: true }), true);
    assert.equal(isPaperTrade({ is_paper: false }), false);
  });
});
