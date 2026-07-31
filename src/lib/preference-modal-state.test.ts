import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  screenshotDraftAfterDialogChange,
  shouldIgnoreParentDialogClose,
} from "./preference-modal-state.ts";

const persisted = {
  HTF: { enabled: false, label: "HTF" },
  MTF: { enabled: false, label: "MTF" },
  LTF: { enabled: true, label: "LTF" },
};

describe("nested preference modal state", () => {
  it("keeps Manage Sessions open while its removal confirmation closes", () => {
    assert.equal(shouldIgnoreParentDialogClose(false, true), true);
    assert.equal(shouldIgnoreParentDialogClose(false, false), false);
    assert.equal(shouldIgnoreParentDialogClose(true, true), false);
  });

  it("restores persisted screenshot values when the dialog closes without saving", () => {
    const draft = {
      HTF: { enabled: true, label: "Context" },
      MTF: { enabled: false, label: "MTF" },
      LTF: { enabled: true, label: "Entry" },
    };
    assert.deepEqual(screenshotDraftAfterDialogChange(false, persisted, draft), persisted);
    assert.deepEqual(screenshotDraftAfterDialogChange(true, persisted, draft), draft);
  });
});
