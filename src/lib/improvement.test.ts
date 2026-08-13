import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { improvementAssessmentCounts, isTradeEligibleForFocus } from "./improvement.ts";

describe("prospective improvement evidence", () => {
  const focus = { activated_at: "2026-08-11T10:00:00.000Z" };

  it("rejects pre-activation, backfilled historical, and paper rows", () => {
    assert.equal(
      isTradeEligibleForFocus(
        { created_at: "2026-08-11T09:59:59.000Z", trade_date: "2026-08-11" },
        focus,
      ),
      false,
    );
    assert.equal(
      isTradeEligibleForFocus(
        { created_at: "2026-08-12T10:00:00.000Z", trade_date: "2026-08-10" },
        focus,
      ),
      false,
    );
    assert.equal(
      isTradeEligibleForFocus(
        { created_at: "2026-08-12T10:00:00.000Z", trade_date: "2026-08-12", is_paper: true },
        focus,
      ),
      false,
    );
  });

  it("keeps unassessable neutral and separate", () => {
    assert.deepEqual(
      improvementAssessmentCounts([
        { assessment: "followed" },
        { assessment: "deviated" },
        { assessment: "unassessable" },
        { assessment: "unassessable" },
      ]),
      { followed: 1, deviated: 1, unassessable: 2 },
    );
  });
});
