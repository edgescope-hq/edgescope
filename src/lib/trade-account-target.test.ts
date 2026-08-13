import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveQuickCaptureAccountId } from "./trade-account-target.ts";

describe("Quick Capture account target", () => {
  const accounts = [
    { id: "active", is_active: true, status: "active" },
    { id: "selected", is_active: false, status: "active" },
    { id: "archived", is_active: false, status: "archived" },
  ];

  it("uses a specific Dashboard account when supplied", () => {
    assert.equal(resolveQuickCaptureAccountId(accounts, "selected"), "selected");
  });

  it("preserves active-account behavior when no account is supplied", () => {
    assert.equal(resolveQuickCaptureAccountId(accounts), "active");
  });

  it("never targets an archived preferred account", () => {
    assert.equal(resolveQuickCaptureAccountId(accounts, "archived"), "active");
  });
});
