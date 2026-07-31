import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getReviewStatus, type ReviewStatusInput } from "./review-status.ts";

const reviewedTrade: ReviewStatusInput = {
  instrument: "EURUSD",
  direction: "long",
  result: "win",
  risk_amount: 100,
  pnl_amount: 200,
  screenshot_count: 1,
  reasoning: "Entry matched the plan.",
  session: "london",
  emotion_tags: ["calm"],
  planned_rr: 2,
  review_completed_at: "2026-07-21T09:00:00.000Z",
};

describe("trade review status", () => {
  it("does not downgrade a persisted Reviewed trade when optional fields are removed", () => {
    assert.equal(getReviewStatus(reviewedTrade), "reviewed");
    assert.equal(
      getReviewStatus({
        ...reviewedTrade,
        session: null,
        emotion_tags: [],
        emotion_before: null,
        emotion_during: null,
        emotion_after: null,
        planned_rr: null,
      }),
      "reviewed",
    );
  });

  it("keeps historical Reviewed trades reviewed after requirements later change", () => {
    assert.equal(
      getReviewStatus({
        ...reviewedTrade,
        reasoning: null,
        categories: [],
        grade: null,
        screenshot_count: 0,
      }),
      "reviewed",
    );
  });

  it("temporarily becomes Incomplete when the R pair is removed and restores Reviewed", () => {
    const withoutRisk = { ...reviewedTrade, risk_amount: null };
    const withoutPnl = { ...reviewedTrade, pnl_amount: null };

    assert.equal(getReviewStatus(withoutRisk), "incomplete");
    assert.equal(getReviewStatus(withoutPnl), "incomplete");
    assert.equal(withoutRisk.reasoning, reviewedTrade.reasoning);
    assert.equal(withoutRisk.screenshot_count, reviewedTrade.screenshot_count);
    assert.equal(getReviewStatus({ ...withoutRisk, risk_amount: 100 }), "reviewed");
    assert.equal(getReviewStatus({ ...withoutPnl, pnl_amount: 200 }), "reviewed");
  });

  it("treats malformed core fields and non-positive risk as Incomplete", () => {
    assert.equal(getReviewStatus({ ...reviewedTrade, instrument: "" }), "incomplete");
    assert.equal(getReviewStatus({ ...reviewedTrade, direction: "sideways" }), "incomplete");
    assert.equal(getReviewStatus({ ...reviewedTrade, result: "open" }), "incomplete");
    assert.equal(getReviewStatus({ ...reviewedTrade, risk_amount: 0 }), "incomplete");
  });

  it("keeps a valid but uncompleted trade in Needs review", () => {
    assert.equal(
      getReviewStatus({ ...reviewedTrade, review_completed_at: null, screenshot_count: 0 }),
      "needs_review",
    );
    assert.equal(
      getReviewStatus({ ...reviewedTrade, review_completed_at: null, reasoning: "" }),
      "needs_review",
    );
  });

  it("applies selected Quick Capture requirements without treating emotions as status data", () => {
    assert.equal(
      getReviewStatus({
        ...reviewedTrade,
        review_completed_at: null,
        session: null,
        trade_completeness_requirements: { session: true },
      }),
      "incomplete",
    );
    assert.equal(
      getReviewStatus({
        ...reviewedTrade,
        emotion_tags: [],
        trade_completeness_requirements: {},
      }),
      "reviewed",
    );
  });
});
