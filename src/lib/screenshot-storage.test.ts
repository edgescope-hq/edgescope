import assert from "node:assert/strict";
import test from "node:test";
import {
  isOwnedScreenshotPath,
  isPathWithinUserPrefix,
  joinUserStoragePath,
} from "./screenshot-storage.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const tradeId = "22222222-2222-4222-8222-222222222222";

test("accepts only the exact owner and trade path", () => {
  assert.equal(isOwnedScreenshotPath(`${userId}/${tradeId}/chart.png`, userId, tradeId), true);
  assert.equal(
    isOwnedScreenshotPath(
      `11111111-1111-4111-8111-111111111112/${tradeId}/chart.png`,
      userId,
      tradeId,
    ),
    false,
  );
  assert.equal(
    isOwnedScreenshotPath(
      `${userId}/22222222-2222-4222-8222-222222222223/chart.png`,
      userId,
      tradeId,
    ),
    false,
  );
  assert.equal(isOwnedScreenshotPath(`${userId}/${tradeId}/../chart.png`, userId, tradeId), false);
  assert.equal(isOwnedScreenshotPath(`${userId}\\${tradeId}\\chart.png`, userId, tradeId), false);
  assert.equal(isOwnedScreenshotPath(`${userId}/${tradeId}/%2Fchart.png`, userId, tradeId), false);
  assert.equal(
    isOwnedScreenshotPath(`${userId}/${tradeId}/%252fchart.png`, userId, tradeId),
    false,
  );
  assert.equal(isOwnedScreenshotPath(`${userId}/${tradeId}/%5cchart.png`, userId, tradeId), false);
  assert.equal(isOwnedScreenshotPath(`${userId}/${tradeId}/%2e%2e`, userId, tradeId), false);
});

test("uses an exact user folder boundary", () => {
  assert.equal(isPathWithinUserPrefix(`${userId}/folder/object`, userId), true);
  assert.equal(isPathWithinUserPrefix(`${userId}-suffix/folder/object`, userId), false);
  assert.equal(isPathWithinUserPrefix(`/${userId}/folder/object`, userId), false);
});

test("joins only safe child names below the user folder", () => {
  assert.equal(joinUserStoragePath(userId, tradeId, userId), `${userId}/${tradeId}`);
  assert.equal(joinUserStoragePath(userId, "..", userId), null);
  assert.equal(joinUserStoragePath(userId, "nested/name", userId), null);
});
