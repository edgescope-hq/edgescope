import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const BUTTON_FILES = [
  "src/components/trades/trade-date-picker.tsx",
  "src/components/trades/trade-form-modal.tsx",
  "src/components/trades/trade-review-modal.tsx",
  "src/components/trades/session-select.tsx",
  "src/components/trades/screenshot-slot-settings.tsx",
  "src/components/trades/screenshot-viewer.tsx",
  "src/components/ui/search-input.tsx",
  "src/routes/_authenticated/settings.tsx",
  "src/routes/_authenticated/trades.tsx",
];

describe("nested modal action safety", () => {
  for (const file of BUTTON_FILES) {
    it(`${file} uses non-submit native buttons`, () => {
      const source = readFileSync(file, "utf8");
      const buttonTags = source.match(/<button\b[\s\S]*?>/g) ?? [];
      assert.ok(buttonTags.length > 0);
      for (const tag of buttonTags) assert.match(tag, /\btype="button"/);
    });
  }

  it("ConfirmDialog actions cannot submit an ancestor form", () => {
    const source = readFileSync("src/components/ui/confirm-dialog.tsx", "utf8");
    for (const component of ["AlertDialogCancel", "AlertDialogAction"]) {
      const tag = source.match(new RegExp(`<${component}\\b[\\s\\S]*?>`))?.[0] ?? "";
      assert.match(tag, /\btype="button"/);
    }
  });
});
