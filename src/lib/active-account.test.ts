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

  it("keeps an accessible account and falls back for invalid or archived accounts", () => {
    assert.equal(normalizeActiveAccountId("active", accounts), "active");
    assert.equal(normalizeActiveAccountId("missing", accounts), ALL_ACCOUNTS);
    assert.equal(normalizeActiveAccountId("archived", accounts), ALL_ACCOUNTS);
  });

  it("scopes persisted selection to the authenticated user", () => {
    assert.notEqual(activeAccountStorageKey("user-a"), activeAccountStorageKey("user-b"));
  });
});
