import type { TokenUsageInfo } from "@opencode/client"

/** The cache state of the latest step, as the pill reports it. */
export type CacheState = "warm" | "cold" | "stale" | "none"

export const ZERO_TOKENS: TokenUsageInfo = {
  input: 0,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
}

/** Everything the context window holds, the sum the app's context ring uses. */
export const totalTokens = (tokens: TokenUsageInfo) =>
  tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write

/** Prompt-side tokens: what the provider read, cached or not. */
export const promptTokens = (tokens: TokenUsageInfo) => tokens.input + tokens.cache.read + tokens.cache.write

export const hitRate = (tokens: TokenUsageInfo | undefined) => {
  if (!tokens) return undefined

  const prompt = promptTokens(tokens)

  return prompt > 0 ? tokens.cache.read / prompt : undefined
}

export const percent = (value: number) => `${Math.round(value * 100)}%`

export const age = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)

  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)

  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

/** USD, with four decimals below a cent so a cheap turn does not read as free. */
export const dollars = (value: number) => {
  const sign = value < 0 ? "-" : ""
  const amount = Math.abs(value)

  return `${sign}$${amount > 0 && amount < 0.01 ? amount.toFixed(4) : amount.toFixed(2)}`
}

/**
 * A cache write with no read on the latest step means the prompt was cold.
 * Past the TTL the entry is gone, so the last step no longer describes what the
 * next one will find — but a step that never touched the cache stays "none"
 * however old it is.
 */
export const cacheState = (
  tokens: TokenUsageInfo | undefined,
  at: number | undefined,
  now: number,
  ttl: number,
): CacheState => {
  const cache = tokens?.cache

  if (!cache) return "none"

  const base: CacheState = cache.read > 0 ? "warm" : cache.write > 0 ? "cold" : "none"

  if (base === "none") return "none"

  return at !== undefined && now - at > ttl ? "stale" : base
}
