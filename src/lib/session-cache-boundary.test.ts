import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { authTransitionResetsUserCache, resetUserSessionCache } from "./session-cache-boundary";

describe("authenticated user cache boundary", () => {
  it("resets on sign-out and user replacement, not token refresh", () => {
    assert.equal(authTransitionResetsUserCache("a", null, "SIGNED_OUT"), true);
    assert.equal(authTransitionResetsUserCache("a", "b", "SIGNED_IN"), true);
    assert.equal(authTransitionResetsUserCache("a", "a", "TOKEN_REFRESHED"), false);
    assert.equal(authTransitionResetsUserCache(null, "a", "INITIAL_SESSION"), false);
  });

  it("removes cached user data", async () => {
    const client = new QueryClient();
    client.setQueryData(["trades"], [{ id: "prior-user" }]);
    await resetUserSessionCache(client);
    assert.equal(client.getQueryData(["trades"]), undefined);
  });
});
