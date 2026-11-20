// DeepSeek adaptation for OpenCode, ported from DeepSeek Harness (dsh) and
// oh-my-pi (omp).
//
// Six request-time additions. Everything except the dialect lands at the tail of
// the request so the cached prefix stays byte-stable; cache reads for these
// models cost roughly a twentieth of fresh input, so nothing here reorders
// history. The dialect is deterministic per model and appended, never prepended.
//
//   1. dialect    — dsh's DeepSeek-tuned tool doctrine. `append` mode adds it
//                   after the prompt OpenCode already built (default, survives
//                   upstream changes); `override` mode reproduces the dialect
//                   file exactly.
//   2. handoff    — omp's subagent rule: a delegated child does not run the
//                   verification the parent owns.
//   3. loopGuard  — dsh's repeat-tool-call reminder: gentle at the first
//                   threshold, detailed later, naming the tool and its args.
//                   OpenCode has no loop guard, so identical-argument loops only
//                   end at the step ceiling.
//   4. clock      — dsh's sampled-time context: current time plus elapsed since
//                   the previous model-visible message.
//   5. todoNudge  — omp's stale-checklist reminder: counts tool calls since the
//                   last todowrite and asks for an update while items are open.
//   6. emptyReply — dsh's EMPTY_RESPONSE recovery, without core changes: an
//                   idle turn whose last assistant message carries no text and
//                   no tool call gets a synthetic nudge that resumes the loop.
//
// This runs through the same `session.hook("context")` that OpenCode's own
// dialect table (core/plugin/optimize.ts) uses, so no core file is touched and
// nothing needs rebasing when upstream moves.
//
// Everything is in-memory: no storage, no network, no files touched.

const MARKER = "(deepseek-adapt)"
const HANDOFF_MARKER = "(subagent-handoff)"
const TODO_TOOL = "todowrite"

/** How many sessions each in-memory map keeps before the oldest is dropped. */
const SESSION_CACHE = 500

const DEFAULTS = {
  dialect: true,
  /** `append` keeps the live prompt and adds doctrine; `override` replaces it with the dialect file. */
  dialectMode: "append",
  /** Tell a delegated subagent that verification belongs to its parent. */
  subagentContext: true,
  loopGuard: true,
  clock: true,
  /** Nudge when the todo list has not been touched for a long stretch of work. */
  todoNudge: true,
  /** Tool calls without a todo update before the first nudge. */
  todoNudgeAfter: 12,
  /** Nudges allowed for one unchanged list. */
  todoNudgeMax: 2,
  /** Resume a turn that ended with no text and no tool call. */
  emptyRecovery: true,
  /** How many recoveries one stalled turn may receive before the harness stays quiet. */
  emptyRecoveryMax: 2,
  /** A gap this long starts the recovery count over. */
  emptyRecoveryWindowMs: 10 * 60 * 1000,
  /** Match is a case-insensitive substring test against model id, modelID and family. */
  models: ["deepseek"],
  loopGentle: 3,
  loopDetailed: 5,
  loopStrong: 8,
  /** Minimum gap between clock injections. */
  clockEveryMs: 5 * 60 * 1000,
  /** Characters of tool arguments quoted back in a detailed reminder. */
  argumentsPreview: 300,
}

/**
 * Validated options. A plugin sits in the request path, so one bad config value
 * must fall back to its default rather than fail every model call. Numbers are
 * clamped to the smallest value that still means something.
 */
const resolveOptions = (input) => {
  const merged = { ...DEFAULTS, ...(input ?? {}) }
  const flag = (key) => (typeof merged[key] === "boolean" ? merged[key] : DEFAULTS[key])
  const count = (key, minimum) => {
    const value = Number(merged[key])
    return Number.isFinite(value) && value >= minimum ? value : DEFAULTS[key]
  }
  return {
    dialect: flag("dialect"),
    dialectMode: merged.dialectMode === "override" ? "override" : "append",
    subagentContext: flag("subagentContext"),
    loopGuard: flag("loopGuard"),
    clock: flag("clock"),
    todoNudge: flag("todoNudge"),
    emptyRecovery: flag("emptyRecovery"),
    // An empty list is an explicit opt-out of the dialect, so keep it; only a
    // non-array falls back to the default.
    models: Array.isArray(merged.models)
      ? merged.models.filter((model) => typeof model === "string")
      : DEFAULTS.models,
    loopGentle: count("loopGentle", 1),
    loopDetailed: count("loopDetailed", 1),
    loopStrong: count("loopStrong", 1),
    clockEveryMs: count("clockEveryMs", 1_000),
    argumentsPreview: count("argumentsPreview", 0),
    todoNudgeAfter: count("todoNudgeAfter", 1),
    todoNudgeMax: count("todoNudgeMax", 0),
    emptyRecoveryMax: count("emptyRecoveryMax", 0),
    emptyRecoveryWindowMs: count("emptyRecoveryWindowMs", 0),
  }
}

/** Closing tags this plugin quotes back must not be able to end their own frame. */
const sanitize = (text) =>
  String(text).replace(/<\/(system-reminder|system-injection|system-interrupt)\s*>/gi, (tag) => `<\\${tag.slice(1)}`)

const canonical = (value) => {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`
}

const stable = (value) => {
  try {
    return canonical(value)
  } catch {
    return String(value)
  }
}

const targets = (options, model) => {
  const ids = [model?.id, model?.modelID, model?.family].join(" ").toLowerCase()
  return options.models.some((needle) => ids.includes(String(needle).toLowerCase()))
}

const has = (tools, name) => tools !== undefined && tools !== null && Object.hasOwn(tools, name)

/** The delegation tool is `subagent` in this build and `task` in older ones. */
const hasDelegation = (tools) => has(tools, "subagent") || has(tools, "task")

/** Insertion-ordered map with a ceiling, so a long-lived process cannot grow forever. */
const remember = (map, key, value) => {
  map.set(key, value)
  while (map.size > SESSION_CACHE) map.delete(map.keys().next().value)
}

const warned = new Set()

/**
 * Run one hook body. A whisper must never be able to fail the request it rides
 * on, so an unexpected error is reported once and swallowed.
 */
const guard = (name, handler) => async (event) => {
  try {
    await handler(event)
  } catch (error) {
    const message = `${name}: ${error?.message ?? error}`
    if (warned.has(message)) return
    warned.add(message)
    console.warn(`[deepseek-adapt] ${message}`)
  }
}

/** The agent behind one request, or undefined when the lookup is unavailable. */
const agentOf = async (ctx, event) => {
  try {
    return (await ctx.agent.get({ agentID: event.agent }))?.data
  } catch {
    return undefined
  }
}

/**
 * The tool guidance OpenCode interpolates into every dialect file. Copied from
 * `session/system-prompt.ts`; only `override` mode needs it, and `append` mode
 * never does, which is why `append` is the default.
 */
const guidance = (tools) => {
  const instructions = []
  if (has(tools, "shell")) {
    instructions.push(
      "- Prefer dedicated tools over shell commands; fall back to the shell when a tool cannot do what you need.",
      "- Do not chain shell commands with separators like `echo \"====\";` or `printf '---'`; the output becomes noisy in a way that makes the user's side of the conversation worse.",
    )
  }
  if (has(tools, "write")) {
    instructions.push(
      "- Use the write tool to create files or completely replace their content. Prefer using the edit tool for targeted changes.",
    )
  }
  if (has(tools, "edit")) {
    instructions.push(
      "- Use the edit tool for targeted changes to existing text files. It replaces the exact text in `oldString` with `newString`, and the values must differ. By default, `oldString` must occur exactly once. If it occurs multiple times, include more surrounding context to make it unique or set `replaceAll` to true to replace every occurrence.",
    )
  }
  return instructions.join("\n")
}

/** The dialect's own sections. `@@GUIDANCE@@` is replaced for the mounted tool set. */
const HEAD = `You are an AI agent running in OpenCode, a coding agent harness. Help the user accomplish their goals using the tools you have available.

# Harness
- Responses are rendered as GitHub-flavored Markdown.
- \`<system-reminder>\` blocks are harness instructions, not user-authored content. Read and follow them.
- Prefer parallelizing independent tool calls.
@@GUIDANCE@@

# Communication
- Lead with the outcome. State the main point in the first sentence, then only the detail that supports it.
- Use clear file paths when referring to files.
- Keep responses clear and concise, and avoid unnecessary technical jargon.

# Working in codebases
- Keep changes consistent with the structure, naming, style, and patterns of the surrounding code.
- Treat unfamiliar files or changes as potential user work and investigate before deleting or overwriting them.
- Read a file before editing it, unless you created or edited it earlier in this session.
- Reuse existing patterns rather than adding a second convention.`

/**
 * dsh's DeepSeek doctrine, in this harness's tool names, gated on the tools that
 * are actually mounted so a line never names a call the model cannot make.
 * `# Instruction precedence` is dsh's framing; opencode leaves it implicit.
 */
const doctrine = (tools) => {
  const parts = [
    `# Instruction precedence ${MARKER}`,
    "- Where instruction files conflict, the more specific one wins. None of them override the system prompt or a direct user request.",
  ]

  const discipline = []
  if (has(tools, "read")) {
    discipline.push(
      "- Inspect text files with `read` — not shell commands like cat, sed, head or tail. Use `offset` and `limit` for a line range or to continue a large file.",
    )
  }
  if (has(tools, "write")) {
    discipline.push("- Read an existing file before overwriting it with `write`; prefer `edit` for targeted changes.")
  }
  if (has(tools, "edit")) {
    discipline.push("- Read a file before editing it unless you created or edited it earlier in this session.")
  }
  if (has(tools, "patch")) {
    discipline.push(
      "- Prefer `patch` over separate `edit` calls for changes across files or separated regions. Every hunk needs enough context to match one place; a rejected patch changes nothing.",
    )
  }
  if (has(tools, "glob")) {
    discipline.push("- Discover files by path pattern with `glob` — not shell find.")
  }
  if (has(tools, "grep")) {
    discipline.push(
      "- Search file contents with `grep` — not shell grep or rg. Follow a match with `read` when you need surrounding context.",
    )
  }
  if (has(tools, "shell")) {
    discipline.push(
      "- Check the exit status of every shell result and investigate failures before moving on.",
      "- Shell commands, formatters, code generators and scripts can overwrite concurrent edits without conflict detection; coordinate those changes explicitly.",
    )
  }
  if (discipline.length > 0) {
    discipline.push("- If a tool is denied, do not retry the same call: change the approach or ask. A denial is a decision, not a transient error.")
    parts.push("", "# Tool discipline", ...discipline)
  }

  if (hasDelegation(tools)) {
    parts.push(
      "",
      "# Delegation",
      "- Start independent delegations together in one assistant message and keep working while they run. When only their results remain, end the turn instead of sleeping or polling.",
      "- Do not spawn subagents unless the user or applicable AGENTS.md/skill instructions ask for delegation or parallel agent work.",
    )
  }
  return parts.join("\n")
}

const renderOverride = (tools) => `${HEAD.replace("@@GUIDANCE@@", guidance(tools))}\n\n${doctrine(tools)}`

const HANDOFF = `# Subagent hand-off ${HANDOFF_MARKER}
- You are a delegated subagent. Verification belongs to the agent that spawned you: do not run builds, test suites, linters, formatters or smoke runs unless your assignment explicitly says to.
- Finish your slice, then report what you changed and which checks the parent should run.`

const applyDialect = (options, event, agent) => {
  if (!options.dialect || !targets(options, event.model)) return
  const system = event.system?.[0]
  if (!system || typeof system.text !== "string" || system.text.includes(MARKER)) return
  // A custom agent system prompt is the user's writing; do not replace or extend it.
  if (agent?.system) return
  event.system[0] =
    options.dialectMode === "override"
      ? { ...system, text: renderOverride(event.tools) }
      : { ...system, text: `${system.text}\n\n${doctrine(event.tools)}` }
}

const applyHandoff = (options, event, agent) => {
  if (!options.subagentContext || agent?.mode !== "subagent") return
  const system = event.system?.[0]
  if (!system || typeof system.text !== "string" || system.text.includes(HANDOFF_MARKER)) return
  event.system[0] = { ...system, text: `${system.text}\n\n${HANDOFF}` }
}

/**
 * The trailing run of identical tool calls. Scanned from the end and stopped at
 * the first difference, so a long session never re-serializes its whole history;
 * `limit` is one past the last threshold, which is all any message needs.
 */
const repeatedCall = (messages, limit) => {
  let last
  let lastKey
  let count = 0
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue
    for (let partIndex = message.content.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.content[partIndex]
      if (part?.type !== "tool-call") continue
      const key = `${part.name}\u0000${stable(part.input)}`
      if (last === undefined) {
        last = { name: part.name, input: part.input, key }
        lastKey = key
        count = 1
        continue
      }
      if (key !== lastKey) return { ...last, count, capped: false }
      count += 1
      if (count >= limit) return { ...last, count, capped: true }
    }
  }
  return last === undefined ? undefined : { ...last, count, capped: false }
}

/** Thresholds in ascending order; a reminder fires when a count crosses one, not on every call above it. */
const thresholds = (options) => [options.loopGentle, options.loopDetailed, options.loopStrong].sort((a, b) => a - b)

const crossedThreshold = (options, count) => {
  let crossed = -1
  for (const threshold of thresholds(options)) if (count >= threshold) crossed = threshold
  return crossed
}

const reminderText = (options, call, threshold) => {
  const level = threshold >= options.loopStrong ? "strong" : threshold >= options.loopDetailed ? "detailed" : "gentle"
  if (level === "gentle") {
    return [
      "<system-reminder>",
      "You are repeating the exact same tool call with identical arguments. Analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments instead of repeating the call.",
      "</system-reminder>",
    ].join("\n")
  }
  const preview = sanitize(stable(call.input)).slice(0, options.argumentsPreview)
  const times = call.capped ? `at least ${call.count}` : `${call.count}`
  const lines = [
    "<system-reminder>",
    `Repeated tool call: \`${sanitize(call.name)}\` was called ${times} consecutive times with identical arguments: \`${preview}\`.`,
    "The repetition is not making progress. Do not call it again with those arguments.",
  ]
  if (level === "strong") {
    lines.push(
      "Change action now: different arguments, a different tool, or report what is blocking you if evidence shows the task cannot proceed.",
    )
  }
  lines.push("</system-reminder>")
  return lines.join("\n")
}

const formatElapsed = (ms) => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const clockText = (elapsedMs) => {
  const now = new Date()
  const local = now.toLocaleString(undefined, { hour12: false, timeZoneName: "short" })
  const elapsed =
    elapsedMs === undefined
      ? `Time now: ${now.toISOString()} (${sanitize(local)}).`
      : `Time now: ${now.toISOString()} (${sanitize(local)}). Elapsed since the previous model-visible message: ${formatElapsed(elapsedMs)}.`
  return [
    "<system-reminder>",
    elapsed,
    "Use it only when timing matters; do not restate it in your reply.",
    "</system-reminder>",
  ].join("\n")
}

const EMPTY_NUDGE = (attempt, max) =>
  [
    "<system-reminder>",
    "Your previous turn produced no text and no tool call, so it ended without an answer. Continue now: either make the next concrete tool call, or give the user a final answer. Do not repeat work you already completed.",
    `Recovery ${attempt} of ${max}: if this one also ends without an answer, the harness stays quiet.`,
    "</system-reminder>",
  ].join("\n")

const isAssistant = (message) => message?.type === "assistant" || message?.role === "assistant"
const isUser = (message) => message?.type === "user" || message?.role === "user"

/** A part the user can act on: visible text or a tool call. An empty text part is neither. */
const isAnswer = (part) => {
  if (part?.type === "tool-call") return true
  return part?.type === "text" && typeof part.text === "string" && part.text.trim().length > 0
}

/**
 * Whether the trailing assistant turn ended with nothing the user can act on.
 * `finish !== "stop"` excludes what must not be retried: an interrupt, a length
 * stop, a provider error, and a turn that already called a tool.
 */
const isStalled = (messages) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (isUser(message)) return false
    if (!isAssistant(message)) continue
    if (message.error !== undefined || message.retry !== undefined) return false
    if (message.finish !== "stop") return false
    const content = Array.isArray(message.content) ? message.content : []
    return !content.some(isAnswer)
  }
  return false
}

const emptyReplyHook = (ctx, options, stalled) => async (event) => {
  if (!options.emptyRecovery) return
  // Background work will report on its own; a nudge now would race with it.
  if ((event.background?.length ?? 0) > 0) return
  let messages
  try {
    messages = (await ctx.session.context({ sessionID: event.sessionID }))?.data
  } catch {
    return
  }
  if (!Array.isArray(messages) || messages.length === 0) return

  if (!isStalled(messages)) {
    stalled.delete(event.sessionID)
    return
  }

  const now = Date.now()
  const prior = stalled.get(event.sessionID)
  const state = prior === undefined || now - prior.at > options.emptyRecoveryWindowMs ? { count: 0 } : prior
  if (state.count >= options.emptyRecoveryMax) return
  remember(stalled, event.sessionID, { count: state.count + 1, at: now })

  try {
    await ctx.session.synthetic({
      sessionID: event.sessionID,
      text: EMPTY_NUDGE(state.count + 1, options.emptyRecoveryMax),
      resume: true,
    })
  } catch {
    // A busy or closed session keeps its own error; recovery is optional.
  }
}

/** Open items in a todowrite payload, or undefined when the payload cannot be read. */
const openTodos = (input) => {
  const todos = input?.todos
  if (!Array.isArray(todos)) return undefined
  return todos.filter((todo) => todo !== null && typeof todo === "object" && todo.status !== "completed").length
}

const todoNudgeText = (since, open) =>
  [
    "<system-reminder>",
    `${since} tool calls since the todo list was last updated, and it still shows ${open} open item${open === 1 ? "" : "s"}. Update it now: mark what finished as completed, and keep only what is genuinely pending.`,
    "</system-reminder>",
  ].join("\n")

/**
 * Counts tool calls since the last `todowrite`, so a long stretch of work cannot
 * leave a stale plan on screen. Silence unless the session already uses the list
 * and still has open items; one nudge per threshold, capped per unchanged list.
 */
const todoNudge = (options, event, state) => {
  if (!options.todoNudge || !Array.isArray(event.messages)) return
  if (!has(event.tools, TODO_TOOL)) return
  let calls = 0
  let lastTodoCall = -1
  let open
  for (const message of event.messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue
    for (const part of message.content) {
      if (part?.type !== "tool-call") continue
      calls += 1
      if (part.name !== TODO_TOOL) continue
      lastTodoCall = calls
      open = openTodos(part.input)
    }
  }
  if (lastTodoCall < 0 || open === undefined || open === 0) return

  const prior = state.get(event.sessionID)
  const sameList = prior !== undefined && prior.todoCall === lastTodoCall
  const nudges = sameList ? prior.nudges : 0
  if (nudges >= options.todoNudgeMax) return
  const since = calls - lastTodoCall
  if (since < options.todoNudgeAfter * (nudges + 1)) return

  remember(state, event.sessionID, { todoCall: lastTodoCall, nudges: nudges + 1 })
  event.messages.push({ role: "user", content: [{ type: "text", text: todoNudgeText(since, open) }] })
}

const whisper = (text) => ({ role: "user", content: [{ type: "text", text }] })

export default {
  id: "opencode-deepseek-adapt",
  async setup(ctx) {
    const options = resolveOptions(ctx.options)
    const loops = new Map()
    const clocks = new Map()
    const stalled = new Map()
    const todos = new Map()
    const loopLimit = Math.max(...thresholds(options)) + 1

    const onRequest = async (event) => {
      // The agent lookup is one round-trip on every step, so skip it when neither
      // prompt addition applies to this model.
      const wantsDialect = options.dialect && targets(options, event.model)
      const agent = wantsDialect || options.subagentContext ? await agentOf(ctx, event) : undefined
      applyDialect(options, event, agent)
      applyHandoff(options, event, agent)
      if (!Array.isArray(event.messages)) return

      if (options.clock) {
        const now = Date.now()
        const state = clocks.get(event.sessionID)
        if (state === undefined || now - state.injected >= options.clockEveryMs) {
          event.messages.push(whisper(clockText(state === undefined ? undefined : now - state.seen)))
          remember(clocks, event.sessionID, { seen: now, injected: now })
        } else {
          remember(clocks, event.sessionID, { seen: now, injected: state.injected })
        }
      }

      todoNudge(options, event, todos)

      if (!options.loopGuard) return
      const call = repeatedCall(event.messages, loopLimit)
      const threshold = call === undefined ? -1 : crossedThreshold(options, call.count)
      if (threshold < 0) {
        loops.delete(event.sessionID)
        return
      }
      const previous = loops.get(event.sessionID)
      // One reminder per crossed threshold; the same level never repeats for a run.
      if (previous !== undefined && previous.key === call.key && previous.threshold >= threshold) return
      remember(loops, event.sessionID, { key: call.key, threshold })
      event.messages.push(whisper(reminderText(options, call, threshold)))
    }

    // Compaction reuses the live prefix, so it gets the prompt additions and nothing else.
    const onCompaction = async (event) => {
      const wantsDialect = options.dialect && targets(options, event.model)
      const agent = wantsDialect || options.subagentContext ? await agentOf(ctx, event) : undefined
      applyDialect(options, event, agent)
      applyHandoff(options, event, agent)
    }

    await ctx.session.hook("context", guard("context", onRequest))
    await ctx.session.hook("compaction", guard("compaction", onCompaction))
    try {
      await ctx.session.hook("experimental.idle", guard("idle", emptyReplyHook(ctx, options, stalled)))
    } catch {
      // A host without the idle hook keeps the rest of the plugin working.
    }
  },
}
