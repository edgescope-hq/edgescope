import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

describe("focused correction pass", () => {
  it("keeps the Dashboard icon, four compact recent cards, aligned reminders, and eligible chart height", () => {
    const dashboard = source("src/components/dashboard/dashboard-view.tsx");
    assert.match(dashboard, /icon=\{PanelsTopLeft\}/);
    assert.match(dashboard, /slice\(0, 4\)/);
    assert.match(dashboard, /space-y-2\.5/);
    assert.match(dashboard, /min-h-\[120px\]/);
    assert.match(dashboard, /eligibility\.eligible \? "h-\[320px\]" : "h-\[170px\]"/);
  });

  it("renders monthly movement segments without a red falling stroke", () => {
    const dashboard = source("src/components/dashboard/dashboard-view.tsx");
    assert.match(dashboard, /const movementSegments = monthChart\.slice\(1\)/);
    assert.match(dashboard, /segment\.rose \? "oklch\(0\.74 0\.19 152\)" : "oklch\(0\.76 0\.15 295\)"/);
    assert.doesNotMatch(dashboard, /stroke="oklch\(0\.6[0-9] 0\.2[0-9] 2[0-9]\)/);
  });

  it("keeps the calendar visible behind vertical month and year menus", () => {
    const picker = source("src/components/trades/trade-date-picker.tsx");
    assert.match(picker, /headerMenu/);
    assert.match(picker, /aria-label="Choose month"/);
    assert.match(picker, /aria-label="Choose year"/);
    assert.match(picker, /max-h-\[11\.25rem\].*overflow-y-auto/);
    assert.doesNotMatch(picker, /view === "months"/);
  });

  it("uses compact sharing groups and keeps clear selection as a utility action", () => {
    for (const file of [
      "src/components/trades/trade-form-modal.tsx",
      "src/components/trades/trade-review-modal.tsx",
    ]) {
      assert.match(source(file), /sm:grid-cols-2/);
      assert.match(source(file), /bg-primary\/10 text-foreground ring-1 ring-primary\/25/);
    }
    for (const file of [
      "src/components/trades/trade-field-controls.tsx",
      "src/components/trades/session-select.tsx",
    ]) {
      const controls = source(file);
      assert.match(controls, /border-b border-white\/\[0\.07\] pb-1/);
      assert.match(controls, /Clear selection/);
    }
  });

  it("shows requirement rows only for their current placement and keeps setup actions separate", () => {
    const settings = source("src/routes/_authenticated/settings.tsx");
    assert.match(settings, /TRADE_COMPLETENESS_ELIGIBLE_FIELDS\.filter\(\(field\) =>\s*appearsInPlacement\(tracking, field, "quick_capture"\)/);
    assert.match(settings, /appearsInPlacement\(tracking, field, "detailed_review"\)/);
    assert.match(settings, /Journal setup/);
    assert.doesNotMatch(settings, /Field hidden/);
    assert.doesNotMatch(settings, /Track field/);
  });
});
