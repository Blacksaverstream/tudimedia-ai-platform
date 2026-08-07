import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRoute } from "../src/routes.js";
test("normalizes known application routes", () => {
  assert.equal(normalizeRoute("/app/library/"), "/app/library");
  assert.equal(normalizeRoute("/pricing"), "/pricing");
});
test("rejects unknown routes", () => assert.equal(normalizeRoute("/private"), "/not-found"));
