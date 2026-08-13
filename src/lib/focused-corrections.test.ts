import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

describe("focused correction pass", () => {
  it("keeps four structural Recent Trade rows and trader-facing global focus", () => {
    const dashboard = source("src/components/dashboard/dashboard-view.tsx");
    assert.match(dashboard, /icon=\{PanelsTopLeft\}/);
    assert.match(dashboard, /slice\(0, 4\)/);
    assert.match(dashboard, /divide-y divide-white\/\[0\.06\]/);
    assert.match(dashboard, /grid-cols-\[minmax\(0,1fr\)_64px_84px\]/);
    assert.match(dashboard, /flex w-full shrink-0 justify-end text-sm font-semibold tabular-nums/);
    assert.match(dashboard, /grid w-\[3\.25rem\] place-items-center/);
    assert.match(dashboard, /displayR == null \? \([\s\S]*R unavailable[\s\S]*w-full text-right/);
    assert.match(dashboard, /className="min-w-0 pr-5"/);
    assert.match(dashboard, /const journalGaps = useMemo\(\(\) => \{[\s\S]*dashboardDb\.filter/);
    assert.match(
      dashboard,
      /account: selectedAccountId === "ALL" \? undefined : selectedAccountId/,
    );
    assert.doesNotMatch(dashboard, /<TradeFormModal[\s\S]*?initialAccountId=\{selectedAccountId/);
    assert.doesNotMatch(dashboard, /Trader-wide|Across all trading accounts/);
    assert.match(dashboard, /Wait for your setup, keep risk defined/);
    assert.match(dashboard, /selectedAccountId === "ALL"[\s\S]*activationGuide/);
    assert.match(dashboard, /whitespace-nowrap pl-1 text-left text-3xl/);
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
    assert.match(dashboard, /dashboardChartDateTicks\(monthChart, 4\)/);
    assert.match(dashboard, /dashboardChartDateTicks\(data, 5\)/);
    assert.equal((dashboard.match(/padding=\{DASHBOARD_CHART_X_PADDING\}/g) ?? []).length, 2);
    assert.equal((dashboard.match(/width=\{DASHBOARD_CHART_Y_WIDTH\}/g) ?? []).length, 2);
    assert.match(dashboard, /Add R data to continue/);
    assert.match(dashboard, /Enter Risk and P\/L on a closed trade/);
    assert.match(dashboard, /No trades this month/);
    assert.match(dashboard, /Log a trade to begin tracking this month/);
    assert.match(dashboard, /No trading history yet/);
    assert.match(dashboard, /Log your first trade to begin your curve/);
    assert.match(dashboard, /dataKey="value"/);
    assert.doesNotMatch(dashboard, />Daily net realised R<|>Cumulative realised R by trading day</);
    assert.doesNotMatch(dashboard, /before:via-primary/);
    assert.doesNotMatch(dashboard, /isChartAnchor|positiveR|negativeR/);
  });

  it("uses mature Lucide semantics and concise Profile Setup and Guide copy", () => {
    const dashboard = source("src/components/dashboard/dashboard-view.tsx");
    assert.match(dashboard, /<UserPen className="h-5 w-5"/);
    assert.equal((dashboard.match(/<Route className="h-5 w-5"/g) ?? []).length, 3);
    assert.match(dashboard, /<Focus className|ExecutionFocusIcon/);
    assert.match(dashboard, /<NotebookPen className="h-5 w-5"/);
    assert.match(dashboard, /icon=\{CircleGauge\}[\s\S]*label="WIN RATE"/);
    assert.match(dashboard, /icon=\{Repeat2\}[\s\S]*label="CURRENT STREAK"/);
    assert.match(dashboard, /icon=\{ChartNoAxesColumn\}[\s\S]*label="AVERAGE R"/);
    for (const identity of ["trades", "winRate", "streak", "netR", "averageR", "reviews"]) {
      assert.equal(
        (dashboard.match(new RegExp(`iconIdentity="${identity}"`, "g")) ?? []).length,
        1,
      );
    }
    assert.match(dashboard, /border-primary\/20[\s\S]*ring-primary\/\[0\.2\]/);
    assert.match(
      dashboard,
      /border-warning\/\[0\.14\][\s\S]*bg-warning\/\[0\.055\][\s\S]*ring-warning\/\[0\.05\]/,
    );
    assert.match(dashboard, /Set up your profile/);
    assert.match(dashboard, /journal and Network/);
    assert.match(dashboard, /Network Username/);
    assert.match(dashboard, /Build your trading workflow/);
    assert.doesNotMatch(dashboard, /Set up your EdgeScope (?:profile|workflow)|community handle/);
    assert.doesNotMatch(
      dashboard,
      /<Sparkles|<User className|icon=\{Target\}|icon=\{ListOrdered\}|icon=\{Divide\}|<Compass/,
    );
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
    assert.match(
      settings,
      /type JournalTab = "tracking" \| "requirements" \| "sessions" \| "screenshots"/,
    );
    assert.match(settings, /xl:grid-cols-4/);
    assert.match(settings, /Journal preference actions/);
    assert.match(settings, /xl:grid-cols-2/);
    assert.match(settings, /appearsInPlacement\(tracking, field, "detailed_review"\)/);
    assert.match(settings, /Field hidden/);
    assert.match(settings, /Track field/);
    assert.match(settings, /openTrackingField\(dependencyField\)/);
    assert.match(settings, /const trackingDraftDirtyRef = useRef\(false\)/);
    assert.match(settings, /const requirementsDraftDirtyRef = useRef\(false\)/);
    assert.match(
      settings,
      /if \(!requirementsDraftDirtyRef\.current\) \{[\s\S]*setReviewRequirements\(storedReview\);[\s\S]*setTradeCompletenessRequirements\(storedCompleteness\);/,
    );
    assert.match(settings, /if \(!trackingDraftDirtyRef\.current\) setTracking\(storedTracking\)/);
    assert.match(
      settings,
      /import \{ DataExportSection \} from "@\/components\/settings\/data-export"/,
    );
    assert.match(settings, /active === "security"[\s\S]*<DataExportSection \/>/);
    assert.doesNotMatch(settings, /Journal setup|Manage sessions|Configure screenshots/);
  });
});
