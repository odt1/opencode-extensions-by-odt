import assert from "node:assert/strict"
import { test } from "node:test"
import { age, cacheState, dollars, hitRate, percent, totalTokens, ZERO_TOKENS } from "./metrics.ts"

const tokens = (input: number, output: number, read: number, write: number, reasoning = 0) => ({
  input,
  output,
  reasoning,
  cache: { read, write },
})

const HOUR = 60 * 60_000
const NOW = 1_800_000_000_000

test("totalTokens sums every field the context ring counts", () => {
  assert.equal(totalTokens(tokens(10, 20, 30, 40, 5)), 105)
  assert.equal(totalTokens(ZERO_TOKENS), 0)
})

test("hitRate is cache reads over prompt-side tokens", () => {
  assert.equal(hitRate(tokens(50, 999, 50, 0)), 0.5)
  assert.equal(hitRate(tokens(0, 0, 0, 0)), undefined)
  assert.equal(hitRate(undefined), undefined)
})

test("hitRate ignores output and reasoning", () => {
  assert.equal(hitRate(tokens(0, 5000, 100, 0, 5000)), 1)
})

test("cacheState is none without a step", () => {
  assert.equal(cacheState(undefined, NOW, NOW, HOUR), "none")
})

test("cacheState is none for a provider that never caches, however old", () => {
  assert.equal(cacheState(tokens(10, 10, 0, 0), NOW - 48 * HOUR, NOW, HOUR), "none")
})

test("cacheState is warm or cold within the TTL", () => {
  assert.equal(cacheState(tokens(10, 10, 5, 0), NOW - 60_000, NOW, HOUR), "warm")
  assert.equal(cacheState(tokens(10, 10, 0, 5), NOW - 60_000, NOW, HOUR), "cold")
})

test("cacheState goes stale past the TTL, keeping the kind of cache use", () => {
  assert.equal(cacheState(tokens(10, 10, 5, 0), NOW - 2 * HOUR, NOW, HOUR), "stale")
  assert.equal(cacheState(tokens(10, 10, 0, 5), NOW - 2 * HOUR, NOW, HOUR), "stale")
})

test("cacheState treats a missing timestamp as current", () => {
  assert.equal(cacheState(tokens(10, 10, 5, 0), undefined, NOW, HOUR), "warm")
})

test("dollars keeps four decimals below a cent and signs negatives", () => {
  assert.equal(dollars(0), "$0.00")
  assert.equal(dollars(2.1), "$2.10")
  assert.equal(dollars(0.0042), "$0.0042")
  assert.equal(dollars(-0.5), "-$0.50")
  assert.equal(dollars(-0.0042), "-$0.0042")
})

test("age rounds to the largest useful unit", () => {
  assert.equal(age(30_000), "now")
  assert.equal(age(5 * 60_000), "5m ago")
  assert.equal(age(90 * 60_000), "1h ago")
  assert.equal(age(30 * HOUR), "1d ago")
})

test("percent rounds to whole percent", () => {
  assert.equal(percent(0.123), "12%")
  assert.equal(percent(1), "100%")
})
