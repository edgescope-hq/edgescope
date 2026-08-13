import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_ACCOUNTS,
  activeAccountStorageKey,
  normalizeActiveAccountId,
} from "./active-account.ts";

describe("shared active-account selection", () => {
  const accounts = [
    { id: "active", status: "active" },
    { id: "archived", status: "archived" },
  ];

  it("keeps active or archived Account Views and falls back only for unknown accounts", () => {
    assert.equal(normalizeActiveAccountId("active", accounts), "active");
    assert.equal(normalizeActiveAccountId("missing", accounts), ALL_ACCOUNTS);
    assert.equal(normalizeActiveAccountId("archived", accounts), "archived");
  });

  it("scopes persisted selection to the authenticated user", () => {
    assert.notEqual(activeAccountStorageKey("user-a"), activeAccountStorageKey("user-b"));
  });
});
