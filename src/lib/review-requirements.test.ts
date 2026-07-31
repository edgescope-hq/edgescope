import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_REVIEW_REQUIREMENTS,
  missingReviewRequirements,
  requirementsFromPreferences,
} from "./review-requirements.ts";

describe("review requirements", () => {
  it("defaults to requiring one screenshot and nonblank reasoning", () => {
    assert.deepEqual(DEFAULT_REVIEW_REQUIREMENTS, {
      screenshot: true,
      reasoning: true,
      category: false,
      grade: false,
      entry_model: false,
      market_condition: false,
      entry_timeframe: false,
      news_involvement: false,
      exit_reason: false,
      trade_management: false,
      custom_tags: false,
    });
    assert.deepEqual(
      missingReviewRequirements(
        { screenshot_count: 1, reasoning: "Clear entry thesis." },
        DEFAULT_REVIEW_REQUIREMENTS,
      ),
      [],
    );
  });

  it("makes category and grade independently optional or required", () => {
    const requirements = {
      screenshot: false,
      reasoning: false,
      category: true,
      grade: true,
    };
    assert.deepEqual(missingReviewRequirements({}, requirements), ["category", "grade"]);
    assert.deepEqual(
      missingReviewRequirements({ categories: ["Breakout"], grade: "A" }, requirements),
      [],
    );
  });

  it("reports only the selected requirements that are missing", () => {
    assert.deepEqual(
      missingReviewRequirements(
        { screenshot_count: 0, reasoning: "", categories: [], grade: null },
        { screenshot: true, reasoning: false, category: true, grade: false },
      ),
      ["screenshot", "category"],
    );
  });

  it("allows deliberate completion when no requirements are selected", () => {
    assert.deepEqual(
      missingReviewRequirements(
        {},
        { screenshot: false, reasoning: false, category: false, grade: false },
      ),
      [],
    );
  });

  it("treats whitespace-only reasoning as missing", () => {
    assert.deepEqual(
      missingReviewRequirements(
        { screenshot_count: 1, reasoning: "   " },
        { ...DEFAULT_REVIEW_REQUIREMENTS },
      ),
      ["reasoning"],
    );
  });

  it("preserves the current screenshot criterion: any one screenshot", () => {
    assert.deepEqual(
      missingReviewRequirements(
        { screenshot_count: 1, reasoning: "Reviewed after LTF capture." },
        DEFAULT_REVIEW_REQUIREMENTS,
      ),
      [],
    );
  });

  it("uses safe guided defaults when a user has no preference row", () => {
    assert.deepEqual(requirementsFromPreferences(null), DEFAULT_REVIEW_REQUIREMENTS);
    assert.deepEqual(requirementsFromPreferences({ review_require_category: true }), {
      screenshot: true,
      reasoning: true,
      category: true,
      grade: false,
      entry_model: false,
      market_condition: false,
      entry_timeframe: false,
      news_involvement: false,
      exit_reason: false,
      trade_management: false,
      custom_tags: false,
    });
  });
});
