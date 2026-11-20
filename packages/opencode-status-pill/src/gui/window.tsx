import type { ModelInfo } from "@opencode/client"
import { lastAssistantWithUsage } from "@opencode/client/solid"
import {
  ComposerPill,
  createKeyed,
  type ComposerPillRow,
  type MountedSession,
  type Plugin,
} from "@opencode/plugin/gui"
import { createSignal } from "solid-js"
import { loadCredits, type Credits } from "./credits"
import type { definition } from "./definition"
import { age, cacheState, dollars, hitRate, percent, totalTokens, ZERO_TOKENS } from "./metrics"

/** The app's own context panel, contributed by its built-in `context` plugin. */
const CONTEXT_PANEL = "context:main"

/** How often the pill re-reads its figures even when nothing it tracks changes. */
const REFRESH_MS = 60_000

/** The balance changes only as the account spends, so it needs a slower clock. */
const CREDITS_MS = 5 * 60_000

/** Past this, a balance is shown with its age and no longer drives the capsule. */
const CREDITS_STALE_MS = 15 * 60_000

/** Consecutive failed refreshes before the last balance is dropped. */
const CREDITS_FAILURES = 3

/** Below these, the balance earns a warning in the capsule and the menu. */
const CREDITS_LOW = 5
const CREDITS_DANGER = 1

/**
 * Providers do not publish their cache TTL, so "warm" is only a claim about the
 * last step. After this long idle the entry has almost certainly expired, and
 * the next prompt will be cold.
 */
const CACHE_TTL_MS = 60 * 60_000

/** Plugin options, set as `{ "package": "...", "options": { ... } }` in opencode.json. */
type Options = {
  /** Where the balance appears: "always" (default), "low" (under creditLow), or "never". */
  creditCapsule?: "always" | "low" | "never"
  /** Dollars at or below which the balance counts as low. Default 5. */
  creditLow?: number
}

const n = (value?: number) => value ?? 0

function metrics(session: MountedSession) {
  const data = session.server.data
  const location = session.location

  const info = () => (data.session.missing(session.id) ? undefined : data.session.get(session.id))
  const step = () => {
    const current = info()

    return current ? lastAssistantWithUsage(data.session.message.list(session.id), current.revert?.messageID) : undefined
  }

  const tokens = () => info()?.tokens
  const stepTokens = () => step()?.tokens
  const stepTime = () => {
    const current = step()

    return current?.time.completed ?? current?.time.created
  }
  const cost = () => data.session.cost(session.id)

  const model = (): ModelInfo | undefined => {
    const ref = info()?.model

    if (!ref || !location) return undefined

    return data.location.model
      .list(location)
      ?.find((entry) => entry.providerID === ref.providerID && (entry.modelID === ref.id || entry.id === ref.id))
  }

  const branch = () => (location ? data.location.vcs.info(location)?.branch.current : undefined)

  /** Context fill, from the step whose tokens occupy the window now. */
  const context = () => {
    const limit = model()?.limit.context
    const used = stepTokens()

    return limit && used ? Math.min(1, totalTokens(used) / limit) : undefined
  }

  const state = () => cacheState(stepTokens(), stepTime(), Date.now(), CACHE_TTL_MS)

  const cacheHit = () => hitRate(tokens()) ?? hitRate(stepTokens())

  const modelName = () => {
    const id = model()?.modelID ?? info()?.model?.id

    return id ? id.slice(id.lastIndexOf("/") + 1) : undefined
  }

  const provider = () => info()?.model?.providerID
  const variant = () => info()?.model?.variant

  return {
    model,
    modelName,
    provider,
    variant,
    branch,
    context,
    state,
    cacheHit,
    tokens,
    stepTokens,
    stepTime,
    cost,
  }
}

export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const options = (ctx.options ?? {}) as Options
  const capsuleMode =
    options.creditCapsule === "low" || options.creditCapsule === "never" ? options.creditCapsule : "always"
  const lowAt = typeof options.creditLow === "number" && options.creditLow >= 0 ? options.creditLow : CREDITS_LOW

  // A step can land without the host re-running `show`, which would leave a
  // cold cache reading as cold until the next prompt. One tick a minute keeps
  // warm/cold honest while a session sits idle.
  const [tick, setTick] = createSignal(0)
  const timer = setInterval(() => setTick((value) => value + 1), REFRESH_MS)

  const [credits, setCredits] = createSignal<Credits>()
  let failures = 0
  const load = () => {
    void loadCredits(ctx.client, ctx.signal)
      .then((value) => {
        failures = 0
        setCredits(value)
      })
      .catch(() => {
        // Keep the last balance through a blip, but not through a dead key.
        failures += 1
        if (failures >= CREDITS_FAILURES) setCredits(undefined)
      })
  }

  load()
  const creditsTimer = setInterval(load, CREDITS_MS)

  // Runs on every session open and switch. The branch is re-read because it can
  // change outside the app (a terminal checkout) without a vcs.branch.updated
  // event, and the read is 60 bytes. The model list is 278 KB and the store
  // already refreshes it from model.updated, so it is only primed when empty.
  createKeyed(
    () => ctx.sessions.current()?.key,
    (key) => {
      const session = ctx.sessions.current()

      if (!session || session.key !== key || !session.location) return

      const data = session.server.data
      const location = session.location

      void data.location.vcs.sync(location).catch(() => {})
      if (data.location.model.list(location) === undefined) void data.location.model.sync(location).catch(() => {})
    },
  )

  ctx.add(ComposerPill, {
    id: "status",
    show: (input) => {
      tick() // subscribe the host to the refresh timer
      const m = metrics(input.session)
      const context = m.context()
      const hit = m.cacheHit()
      const cost = m.cost()
      const state = m.state()
      const stepAt = m.stepTime()

      if (context === undefined && hit === undefined && cost === 0) return undefined

      // Cold/warm belongs on the capsule: it is the one cache fact a glance
      // needs, and the menu repeats the rest.
      const cache =
        hit === undefined
          ? undefined
          : state === "none"
            ? `cache ${percent(hit)}`
            : `cache ${percent(hit)} ${ctx.t(`cache.${state}`)}`

      // One dollar figure only: the balance when there is one, otherwise this
      // session's spend. Two amounts plus "left" overflow the capsule.
      const credit = credits()
      const fresh = credit !== undefined && Date.now() - credit.at <= CREDITS_STALE_MS
      const showCredit =
        fresh && (capsuleMode === "always" || (capsuleMode === "low" && credit.remaining <= lowAt))
      const money = showCredit ? `${dollars(credit.remaining)} left` : cost > 0 ? dollars(cost) : undefined

      const label = [context === undefined ? undefined : percent(context), cache, money]
        .filter(Boolean)
        .join(" · ")

      if (!label) return undefined

      const row = (
        id: string,
        label: string,
        detail: string,
        tone?: "success" | "warning" | "danger",
      ): ComposerPillRow => ({ id, label, detail, tone })

      return {
        icon: "status",
        label,
        title: ctx.t("pill.title"),
        tone:
          (context !== undefined && context >= 0.85) || (fresh && credit.remaining <= CREDITS_DANGER)
            ? "danger"
            : state === "cold" || (fresh && credit.remaining <= lowAt)
              ? "warning"
              : undefined,
        rows: [
          {
            id: "open",
            label: ctx.t("context.open"),
            icon: "window-analytics",
            run: () => ctx.layout.toggle(CONTEXT_PANEL, input.session),
          },
          row("model", ctx.t("row.model"), m.modelName() ?? ctx.t("value.none")),
          row(
            "provider",
            ctx.t("row.provider"),
            [m.provider(), m.variant()].filter(Boolean).join(" · ") || ctx.t("value.none"),
          ),
          row("branch", ctx.t("row.branch"), m.branch() ?? ctx.t("value.none")),
          row(
            "context",
            ctx.t("row.context"),
            context === undefined
              ? ctx.t("value.none")
              : `${percent(context)} · ${totalTokens(m.stepTokens() ?? ZERO_TOKENS).toLocaleString()} / ${n(m.model()?.limit.context).toLocaleString()}`,
            context !== undefined && context >= 0.85 ? "danger" : undefined,
          ),
          // Session totals, cache excluded: uncached input and generated output.
          row("input", ctx.t("row.input"), n(m.tokens()?.input).toLocaleString()),
          row(
            "output",
            ctx.t("row.output"),
            n(m.tokens()?.output).toLocaleString() +
              (n(m.tokens()?.reasoning) > 0 ? ` (+${n(m.tokens()?.reasoning).toLocaleString()} reasoning)` : ""),
          ),
          row(
            "cache",
            ctx.t("row.cache"),
            hit === undefined
              ? ctx.t("value.none")
              : [percent(hit), ctx.t(`cache.${state}`), stepAt === undefined ? undefined : age(Date.now() - stepAt)]
                  .filter(Boolean)
                  .join(" · "),
            state === "cold" ? "warning" : state === "warm" ? "success" : undefined,
          ),
          row("cacheRead", ctx.t("row.cacheRead"), n(m.tokens()?.cache.read).toLocaleString()),
          row("cacheWrite", ctx.t("row.cacheWrite"), n(m.tokens()?.cache.write).toLocaleString()),
          row("cost", ctx.t("row.cost"), dollars(cost)),
          row(
            "credit",
            ctx.t("row.credit"),
            credit === undefined
              ? ctx.t("value.none")
              : [dollars(credit.remaining), fresh ? undefined : age(Date.now() - credit.at)]
                  .filter(Boolean)
                  .join(" · "),
            credit === undefined || !fresh
              ? undefined
              : credit.remaining <= CREDITS_DANGER
                ? "danger"
                : credit.remaining <= lowAt
                  ? "warning"
                  : undefined,
          ),
        ],
      }
    },
  })

  return () => {
    clearInterval(timer)
    clearInterval(creditsTimer)
  }
}
