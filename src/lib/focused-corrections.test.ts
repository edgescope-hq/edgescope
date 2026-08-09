import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

describe("focused correction pass", () => {
  it("keeps four compact Dashboard rows and truthful trader-wide guidance", () => {
    const dashboard = source("src/components/dashboard/dashboard-view.tsx");
    assert.match(dashboard, /icon=\{PanelsTopLeft\}/);
    assert.match(dashboard, /slice\(0, 4\)/);
    assert.match(dashboard, /divide-y divide-white\/\[0\.06\]/);
    assert.match(dashboard, /grid-cols-\[minmax\(0,1fr\)_58px_78px\]/);
    assert.match(dashboard, /const journalGaps = useMemo\(\(\) => \{[\s\S]*realDb\.filter/);
    assert.match(dashboard, /account: "ALL",\s+review: "incomplete,needs_review"/);
    assert.match(dashboard, /text-sm font-semibold leading-5 text-foreground\/90/);
    assert.match(dashboard, /value=\{qualifyingR\.length > 0 \? sumR : "\\u2014"\}/);
    assert.match(dashboard, /No active win\/loss streak/);
  });

  it("uses truthful time-based chart data, restrained outcome color, and distinct fallbacks", () => {
    const dashboard = source("src/components/dashboard/dashboard-view.tsx");
    assert.match(dashboard, /id="dash-month-fill"/);
    assert.match(dashboard, /monthTone === "positive"/);
    assert.match(dashboard, /monthTone === "negative"/);
    assert.equal((dashboard.match(/type="linear"/g) ?? []).length, 4);
    assert.match(dashboard, /chartTimeTicks\(domain, 4\)/);
    assert.match(dashboard, /chartTimeTicks\(domain, 5\)/);
    assert.match(dashboard, /padding=\{\{ left: 12, right: 12 \}\}/);
    assert.match(dashboard, /padding=\{\{ left: 14, right: 14 \}\}/);
    assert.match(dashboard, /No trades logged this month/);
    assert.match(dashboard, /No trading history yet/);
    assert.match(dashboard, /No closed trades this month/);
    assert.match(dashboard, /No closed performance yet/);
    assert.doesNotMatch(dashboard, /before:via-primary/);
    assert.doesNotMatch(dashboard, /isChartAnchor|positiveR|negativeR/);
  });

  it("keeps the calendar visible behind month-grid and year menus", () => {
    const picker = source("src/components/trades/trade-date-picker.tsx");
    assert.match(picker, /headerMenu/);
    assert.match(picker, /aria-label="Choose month"/);
    assert.match(picker, /aria-label="Choose year"/);
    assert.match(picker, /grid grid-cols-3 gap-1/);
    assert.match(picker, /max-h-\[11\.25rem\].*overflow-y-auto/);
    assert.doesNotMatch(picker, /view === "months"/);
  });

  it("right-aligns sharing controls and keeps clear selection as a utility action", () => {
    for (const file of [
      "src/components/trades/trade-form-modal.tsx",
      "src/components/trades/trade-review-modal.tsx",
    ]) {
      const modal = source(file);
      assert.match(modal, /sm:grid-cols-2/);
      assert.match(modal, /justify-between/);
      assert.match(modal, /bg-primary\/10 text-foreground ring-1 ring-primary\/25/);
    }
    const quickCapture = source("src/components/trades/trade-form-modal.tsx");
    assert.doesNotMatch(quickCapture, /Review now|>Later</);
    for (const file of [
      "src/components/trades/trade-field-controls.tsx",
      "src/components/trades/session-select.tsx",
    ]) {
      const controls = source(file);
      assert.match(controls, /border-b border-white\/\[0\.07\] pb-1/);
      assert.match(controls, /Clear selection/);
    }
  });

  it("uses four Journal subsections with readable field dependencies", () => {
    const settings = source("src/routes/_authenticated/settings.tsx");
    assert.match(settings, /type JournalTab = "tracking" \| "requirements" \| "sessions" \| "screenshots"/);
    assert.match(settings, /xl:grid-cols-4/);
    assert.match(settings, /Journal preference actions/);
    assert.match(settings, /xl:grid-cols-2/);
    assert.match(settings, /appearsInPlacement\(tracking, field, "detailed_review"\)/);
    assert.match(settings, /Field hidden/);
    assert.match(settings, /Track field/);
    assert.match(settings, /openTrackingField\(dependencyField\)/);
    assert.doesNotMatch(settings, /Journal setup|Manage sessions|Configure screenshots/);
  });
});
