import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const target = process.env.LOAD_TARGET_URL;
if (!target) throw new Error("LOAD_TARGET_URL is required.");
const requests = Number(process.env.LOAD_REQUESTS ?? 100);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 10);
const maxP95Ms = Number(process.env.LOAD_MAX_P95_MS ?? 250);
const timings = [];
let next = 0;
let failures = 0;
async function worker() {
  while (next < requests) {
    next += 1;
    const started = performance.now();
    try { const response = await fetch(`${target}/healthz`); if (!response.ok) failures += 1; }
    catch { failures += 1; }
    timings.push(performance.now() - started);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
timings.sort((a, b) => a - b);
const p95 = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)];
assert.equal(failures, 0, `${failures} requests failed`);
assert.ok(p95 <= maxP95Ms, `p95 ${p95.toFixed(1)}ms exceeds ${maxP95Ms}ms`);
console.log(JSON.stringify({ requests, concurrency, failures, p95Ms: Number(p95.toFixed(1)) }));
