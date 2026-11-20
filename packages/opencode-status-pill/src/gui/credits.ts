import type { OpenCodeClient } from "@opencode/client"

/** The account's OpenRouter balance, in USD, and when it was read. */
export type Credits = {
  total: number
  used: number
  remaining: number
  at: number
}

const ENDPOINT = "https://openrouter.ai/api/v1/credits"
const TIMEOUT_MS = 10_000
/**
 * The key OpenCode already uses for the provider, so the balance needs no
 * second credential. Undefined when the provider is connected another way,
 * such as an OAuth account or an environment variable.
 *
 * The API has no filter, so this returns every provider's credential to the
 * window; only the OpenRouter one is read. Any plugin in the window can make
 * the same call, so this adds no exposure of its own.
 */
async function openrouterKey(client: OpenCodeClient): Promise<string | undefined> {
  const entries = await client.credential.list()
  const entry = entries.find((item) => item.integrationID === "openrouter" && item.active)

  return entry?.value.type === "key" ? entry.value.key : undefined
}

/**
 * Read where the call is made: `ctx.client` is a new object after the server
 * restarts. Two outcomes are kept apart on purpose:
 *
 * - `undefined` means the account has no OpenRouter key, which no retry can fix,
 *   so the caller clears the row at once.
 * - A failed request throws, so the caller can hold the last known balance
 *   through a few attempts before dropping it.
 */
export async function loadCredits(client: OpenCodeClient, signal?: AbortSignal): Promise<Credits | undefined> {
  const key = await openrouterKey(client)

  if (!key) return undefined

  const response = await fetch(ENDPOINT, {
    headers: { Authorization: `Bearer ${key}` },
    // Chromium 116+ (the desktop app's floor) and Node both implement `any`.
    signal: signal ? AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), signal]) : AbortSignal.timeout(TIMEOUT_MS),
  })

  if (!response.ok) throw new Error(`OpenRouter credits: HTTP ${response.status}`)

  const body = (await response.json()) as { data?: { total_credits?: number; total_usage?: number } }
  const total = body.data?.total_credits
  const used = body.data?.total_usage

  // A body the shape above does not describe is a failure, not an empty account:
  // throwing keeps the last balance instead of blanking the row on one bad reply.
  if (typeof total !== "number" || typeof used !== "number")
    throw new Error("OpenRouter credits: unexpected response body")

  return { total, used, remaining: total - used, at: Date.now() }
}
