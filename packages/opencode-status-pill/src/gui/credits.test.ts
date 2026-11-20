import assert from "node:assert/strict"
import { test } from "node:test"
import type { OpenCodeClient } from "@opencode/client"
import { loadCredits } from "./credits.ts"

/** Only `credential.list` is read, so the rest of the client is not modelled. */
const client = (credentials: unknown[]) =>
  ({ credential: { list: async () => credentials } }) as unknown as OpenCodeClient

const keyed = [{ integrationID: "openrouter", active: true, value: { type: "key", key: "sk-or-test" } }]

const body = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 })

test("no OpenRouter key means no balance, not a failure", async () => {
  // A retry cannot conjure a key, so this must resolve: the caller clears the row.
  assert.equal(await loadCredits(client([])), undefined)
  assert.equal(
    await loadCredits(client([{ integrationID: "openrouter", active: false, value: { type: "key", key: "x" } }])),
    undefined,
  )
})

test("a healthy reply becomes the remaining balance", async (t) => {
  t.mock.method(globalThis, "fetch", async () => body({ total_credits: 25, total_usage: 22.5 }))

  const credits = await loadCredits(client(keyed))

  assert.equal(credits?.total, 25)
  assert.equal(credits?.used, 22.5)
  assert.equal(credits?.remaining, 2.5)
  assert.ok(typeof credits?.at === "number")
})

test("a non-2xx reply throws so the caller can keep the last balance", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("nope", { status: 401 }))

  await assert.rejects(loadCredits(client(keyed)), /HTTP 401/)
})

test("an unexpected body throws instead of blanking the row", async (t) => {
  t.mock.method(globalThis, "fetch", async () => body({ total_credits: "25" }))

  await assert.rejects(loadCredits(client(keyed)), /unexpected response body/)
})

test("the caller's signal aborts the request", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string, init: { signal?: AbortSignal }) => {
    assert.ok(init.signal?.aborted, "an already-aborted signal reaches fetch")

    throw new DOMException("aborted", "AbortError")
  })

  await assert.rejects(loadCredits(client(keyed), AbortSignal.abort()), /aborted/)
})

test("the request carries the stored key and nothing else", async (t) => {
  let seen: { url: string; init?: RequestInit } | undefined
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    seen = { url, init }

    return body({ total_credits: 1, total_usage: 0 })
  })

  await loadCredits(client(keyed))

  assert.equal(seen?.url, "https://openrouter.ai/api/v1/credits")
  assert.equal(new Headers(seen?.init?.headers).get("authorization"), "Bearer sk-or-test")
})
