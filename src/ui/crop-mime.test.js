import assert from "node:assert/strict";
import test from "node:test";
import { preferredImageMime } from "./crop-mime.js";

test("头像和全身图裁成 PNG，地点图跟着原文件", () => {
  assert.equal(preferredImageMime("image/png", "avatar"), "image/png");
  assert.equal(preferredImageMime("image/jpeg", "full"), "image/png");
  assert.equal(preferredImageMime("image/jpeg", "thinking"), "image/png");
  assert.equal(preferredImageMime("image/jpeg", "expression"), "image/png");
  assert.equal(preferredImageMime("image/jpeg", "action"), "image/png");
  assert.equal(preferredImageMime("image/png", "location-day"), "image/png");
  assert.equal(preferredImageMime("image/webp", "location-night"), "image/png");
  assert.equal(preferredImageMime("image/jpeg", "location-day"), "image/jpeg");
});
