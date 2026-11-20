# How three harnesses drive the model

Scope: only the model-facing surface — system prompts, injected messages, request parameters, tool schemas, context rewriting. No tooling, UX or feature comparison. Everything here is from source at the revisions in this directory; path citations are relative to it.

Harnesses: `opencode/`, `oh-my-pi/` (omp), `deepseek-harness/` (dsh).

## TL;DR

| | opencode | oh-my-pi | deepseek-harness |
|---|---|---|---|
| Prompt built as | small base file + **swappable per-vendor prompt files** | **one large Handlebars template** + 113 fragments | **plugin registry of one-sentence sections** |
| Base prompt size | 111 words (+ tool bullets) | 1,770-word template, rendered larger | 555–843 words rendered |
| Voice | plain prose, low absolutism | dense imperative, `MUST`/`NEVER` everywhere | one-sentence imperatives per tool |
| AGENTS.md arrives as | separate **system** message, delta-updated | inside the **system prompt**, upfront | **user-role** `<system-reminder>` snapshot |
| Per-model adaptation | **voice rewritten per vendor** (6 dialects) | **wire format and prompt shape per model class** | none in prose; capability flags only |
| Mid-run correction | almost none | ~15 interrupt/injection templates | repeat-call guard, policy and time context |
| Decoding parameters | forwards configured ones | provider default unless set | none exist |

The one-line characterisation: **opencode** makes the model behave like the vendor intended; **oh-my-pi** makes it behave like a disciplined employee; **deepseek-harness** makes it behave like a component in a system it can see.

## 1. Where the prompt comes from

### opencode — data, not prose

`SessionSystemPrompt.make()` renders `opencode/packages/core/src/session/runner/prompt/system.txt` and splices conditional tool guidance (`opencode/packages/core/src/session/system-prompt.ts:9-30`): a shell bullet, a write bullet, and a full paragraph about `oldString`/`newString`/`replaceAll` for `edit`. That is the entire default prompt; everything else lives in tool descriptions and injected messages.

The request's `system` array has **two parts**: the agent prompt (or the default) and the joined instruction baseline (`opencode/packages/core/src/session/model-request.ts:113-128`). On Anthropic routes those parts stay separate blocks with an explicit cache breakpoint budget allocated `tools → system → messages` (`opencode/packages/ai/src/protocols/anthropic-messages.ts:960-977`).

### oh-my-pi — one prescriptive document, as ordered blocks

`buildSystemPrompt` returns an **array of blocks**, not one string: the rendered `system-prompt.md`, then one block per eval prelude's guidance, then the rendered `project-prompt.md` (`oh-my-pi/packages/coding-agent/src/system-prompt.ts:1173-1187`). The split exists so Anthropic caching can anchor a breakpoint on the last stable block, immediately before `<memories>` or `<project-context>` (`oh-my-pi/packages/ai/src/providers/anthropic.ts:4550-4620`).

The template is 1,770 words with 63 conditional blocks. It renders runtime facts *into* the prompt: tool inventory, internal `xd://` URLs, skill list, always-apply rules, delegation policy, personality block. `project-prompt.md` adds `<repo-rules>` ("MUST follow these context files for all tasks"), a `<dir-context>` list of nested AGENTS.md the model must read lazily, and a workspace tree to depth 3.

Override precedence, project over user: literal `SYSTEM.md` → `SYSTEM_TEMPLATE.md` (raw Handlebars over the same data) → per-model template → bundled default (`system-prompt.ts:752-800`).

### deepseek-harness — a registry of atoms

`SystemPrompt` is a plugin service where every package registers `{name, order, text}` (`deepseek-harness/packages/core/system-prompt/src/index.ts`). Order is centralised in `SECTION_ORDERS`: identity `-1000`, persona `0`, plan policy `500`, then one slot per tool `1000–3000`, MCP `3100`, structured output `9900`, persona suffix `10200`. Sections join with a blank line; empty sections drop.

The kernel is one sentence: `You are an AI agent powered by DeepSeek Harness.` The deployment persona is a config slot with a one-sentence YAML template — `You are a coding agent powered by the {{model}} model.` (`deepseek-harness/packages/bundle/headless/cordis.patch.yml:10-12`). The `minimal` preset sets the entire prompt to 47 bytes.

Each tool ships its own one-line section next to its implementation:

- `deepseek-harness/packages/shell/tool-bash/src/index.ts:294` — "Check the [exit code: N] marker on every bash result; investigate failures before moving on."
- `deepseek-harness/packages/fs/tool-fs/src/read.ts:74` — "Use the read tool — not shell commands like cat, sed, head, or tail — to inspect text files."

The design rule is stated in the source: cross-call guidance belongs in the prompt, one-call facts belong in the schema (`tool-bash/src/index.ts:290`). A rendered example is `deepseek-harness/snapshots/sdk/text-turn/system-prompt.expected.md`.

Consequence: dsh's prompt is **composed, not authored**. Which sections exist is decided by which plugins load. `tool:todo` has no prompt section at all — only a tool description; `tool:lsp` has one but is not mounted by any shipped profile.

## 2. Size and voice

Measured in words (`wc -w`):

| file | words | role |
|---|---|---|
| `opencode/.../runner/prompt/system.txt` | 111 | default prompt |
| `opencode/.../plugin/system-prompt/anthropic.txt` | 49 | appended to the default for Claude |
| `opencode/.../plugin/system-prompt/gpt.txt` | 396 | replaces the default for GPT |
| `opencode/.../plugin/system-prompt/meta.txt` | 1,250 | replaces, with `{{MODEL_NAME}}` |
| `opencode/.../plugin/system-prompt/trinity.txt` | 1,257 | replaces |
| `opencode/.../plugin/system-prompt/kimi.txt` | 1,411 | replaces |
| `oh-my-pi/.../prompts/system/system-prompt.md` | 1,770 | template, before rendering |
| `deepseek-harness/snapshots/sdk/text-turn/...` | 555 | rendered dsh prompt |
| `deepseek-harness/snapshots/sdk/desktop-context/...` | 843 | rendered with more tools |

Absolutism density is the sharpest difference. opencode's default prompt contains no `MUST` or `NEVER`. dsh uses "not" constructions ("use the read tool — not shell commands") but almost never capitals. omp's tool descriptions are structured as `<instruction>`, `<critical>`, `<bash-alternatives>` sections where nearly every line is `MUST`, `NEVER` or `SHOULD`.

## 3. Per-model adaptation

This is where the two corrections to the obvious reading matter.

| adaptation | opencode | oh-my-pi | deepseek-harness |
|---|---|---|---|
| Vendor prompt dialects | **yes** — six, selected by model id | no | no |
| Tool wire dialect | no (native tools only) | **yes** — text protocols for models without native tool calling | no |
| Tool catalog in prompt | code mode catalog (all models) | **Gemini only** — full catalog inlined, schema descriptions stripped | no |
| Edit prompt variant | no | `full` / `compact` catalog axis | no |
| Mid-conversation prompt update | appends system messages | keeps system byte-stable, puts volatile data on the first user turn | capability-gated `systemPromptUpdate: 'in-history'` |

### opencode dialects

`opencode/packages/core/src/plugin/optimize.ts` selects a whole prompt by model id:

| model id contains | prompt | mode |
|---|---|---|
| `gpt` | `gpt.txt` | override |
| `gpt` + `astra` | `gpt-astra.txt` | override |
| `claude` | `anthropic.txt` | **append** |
| `kimi` | `kimi.txt` | override |
| `trinity` | `trinity.txt` | override |
| `muse` | `meta.txt` | override |

The dialects are written in each vendor's own house style: GPT gets commentary-vs-final channel discipline and autonomy rules; Kimi gets "You are OpenCode, an interactive general AI agent running on a user's computer" with mandatory parallel tool calls; Trinity gets Claude-Code-style HTML reminders and a hard "fewer than 4 lines" verbosity rule; Muse is told it is "powered by {{MODEL_NAME}}, a large language model trained by Meta MSL". Claude gets only the 49-word code-comment paragraph appended.

Related request-level change: `opencode/packages/core/src/plugin/verbosity.ts` silently sets `textVerbosity: "low"` for GPT‑5.x/6.

### oh-my-pi dialects

omp does not rewrite its personality per vendor, but it changes the **shape of the model-facing surface** by model class:

- **Tool dialect.** With `tools.format: auto`, a model without native tool calling gets an owned *text* protocol — Hermes, GLM, DeepSeek, Kimi, Qwen3, Gemma, MiniMax, XML, Harmony — and **no native tool schemas at all**; a `# Tools` block with one JSON function per line plus a format guide is appended as an extra system block (`oh-my-pi/packages/ai/src/dialect/catalog.ts:23-30`, `packages/agent/src/agent-loop.ts:2049-2057`).
- **Gemini.** The full tool catalog is inlined into the system prompt and the schema descriptions are removed from the wire (`config/inline-tool-descriptors-mode.ts:19-29`).
- Per-model catalog axes: `edit-prompt-variant` (`catalog/src/compat/axes.ts:479`), `delegation-bias` (`axes.ts:477`).

### deepseek-harness

No prose switches by model. The only model-conditioned content is the `{{model}}` / `{{provider}}` interpolation in the persona template. What *is* model-conditioned is protocol behaviour:

- `systemPromptUpdate: 'in-history'` — after the first request, a changed prompt is **appended** as a later system message instead of rewriting message 0 (`deepseek-harness/packages/llm/llm-deepseek/src/models.ts:15`, `serialize.ts:106-116`).
- `toolUpdate: 'in-history' | 'addition-only'` — tool-set changes may be expressed as `tool_addition` / `tool_removal` blocks in `developer`-role messages, and on DeepSeek may only *grow* mid-conversation (`llm-pi-ai/src/models.ts:75-91`).
- Tools can be deferred: `defer_loading: true` in the schema (`llm-deepseek/src/serialize.ts:160-167`).

## 4. Injections outside the system prompt

### opencode: instruction sources with deltas

Every piece of context is modelled as a source with `initial`, `changed` and `removed` renderings (`opencode/packages/core/src/session/instructions/index.ts`). Sources: code-mode catalog, MCP instructions, references, skills, discovered AGENTS.md, built-ins (date, environment), API-attached context.

Ordering is deliberate, and the comment says why: *"Ordered from most to least shared across sessions so the baseline stays a reusable prompt-cache prefix: user-level catalog and guidance, then project instructions, then the date and environment"* (`session/context.ts:162-173`).

Notable mechanics:

- AGENTS.md is discovered **lazily**: reading a file in a directory injects that directory's AGENTS.md mid-session (`session/instructions.ts:78`), rendered bare as `Instructions from: <path>\n<content>`.
- When an AGENTS.md changes, opencode sends a **unified diff** instead of the file when the diff is shorter (`instruction-discovery.ts:127-149`).
- Instruction changes become durable **system messages** ("Instructions updated: …", `session/message-updater.ts:159-168`).
- Code Mode is a first-class driver: the callable tool catalog is prompt text, **delta-updated** ("The Code Mode tool catalog has changed…", `codemode/instructions.ts`).
- A handful of synthetic notices: plan enter/leave, fork notice, subagent completion as `<subagent …>`, background job completion, goal nudges (`session/subagent-completion.ts:73-79`, `plugin/plan.ts:14-25`, `plugin/fork-notice.ts`).
- A max-steps message when the agent hits its ceiling (`session/runner/max-steps.ts`).

### oh-my-pi: a message-level interrupt system

113 fragments in `prompts/system/` (110 prompt files plus three personality presets), most injected as `<system-injection>` / `<system-interrupt>` / `<system-notice>` with attempt counters:

- empty stop → "Stopped without actionable output; task incomplete. Continue with a user-visible final answer or the next required tool call. Attempt #n/m"
- length stop → "Previous response hit the {{outputTokens}}-token output limit while still reasoning; it was discarded unseen… Reason only about the next step, then call the tool."
- malformed call → "Function calls written as text (code fences, `call:default_api:…`) are NOT calls."
- thinking loop → "STOP narrating intended actions. Issue one concrete normal-format tool call… Act, don't re-plan."
- tool loop → "You called `{{tool_name}}` {{count}} consecutive times with identical arguments… NEVER call `{{tool_name}}` with those arguments again this turn."
- tool roster change → "Tool availability changed. Now available: … Your current tool schema is authoritative for the full set."
- Gemini reasoning-without-tools → "<system-interrupt reason=\"reasoning_without_tool_calls\">"

omp keeps the system prompt **byte-stable** and moves date/cwd onto the first user turn, with the rationale in the source: putting it in the system tail invalidated the whole tool array in open-weight chat templates (`session/date-cwd-reminder.ts:1-15`).

### deepseek-harness: named runtime context, projected as a superseding snapshot

`PromptContext` entries render to a **user-role** message framed as:

> `<system-reminder>` / "The following information describes your current session. It replaces earlier versions of this context, including any retained in conversation summaries."

(`deepseek-harness/packages/core/agent-loop/src/runtime-context.ts:164-180`; an empty state emits "Earlier runtime-context snapshots no longer apply.")

Content dsh puts in front of the model that the others do not:

- **sandbox state** — "Current DSH file policy: workspace-write. … may modify files under the session workspace: …" plus "Do not refuse a required modification from this policy alone" (`sandbox-policy/src/index.ts:61-79`).
- **approval state** — "Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation" (`user-approval/src/index.ts:75`).
- **time** — a user message on `agent/pre-step`, throttled to 10 minutes: "Time sampled while preparing turn N, step S: <ISO> … Elapsed since the preceding model-visible message: 3m 5s" (`context/time-context`).
- **workspace instructions** with precedence framing — "More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions." (`context/agent-instructions/src/render.ts:18-25`), inside its own `<system-reminder>` with a byte budget.
- **delegation depth** — "Delegation depth for `subagent`: current 2, maximum 2, remaining levels 0. Do not call `subagent` at this depth."
- **subagent identity** — "You are a subagent delegated by agent \"lead\". … The root agent of your collaboration tree is \"lead\"."
- A max-tokens continuation: "Continue: summarize what happened without retrying the tool."
- A repeat-tool guard with thresholds `[3, 5, 8]`, gentle then detailed (`guard/repeat-tool-reminder/src/index.ts:70-86`).

dsh deliberately injects **no** git status, branch, OS or token budget.

## 5. Sampling and reasoning control

The most common wrong assumption: none of the three shapes behaviour through decoding parameters out of the box.

| | opencode | oh-my-pi | deepseek-harness |
|---|---|---|---|
| temperature | not set by default; forwards configured provider settings | `-1` = provider default; per-agent setting | optional, omitted by default |
| top_p / top_k | forwarded if configured | unset by default | **does not exist in the codebase** |
| tool_choice | provider default | normally auto; forced only by an internal queue | **does not exist** |
| parallel tool calls | provider default | harness-side cap | harness-side cap |
| verbosity | forces `textVerbosity: "low"` on GPT‑5.x/6 | ships `textVerbosity: "low"` | — |
| reasoning effort | user-selected variant, sent per provider; per-turn effort updates on Claude 5+ | default `high`; `auto` = LLM classifier | `thinking: enabled`, effort default `high` |
| max tokens | computed from context window minus estimate, 1% headroom, cap 256k | `fitOutputTokensToContextWindow`, default model max | static 256,000 default |

Three mechanisms stand out.

**omp decides its own reasoning depth.** With `defaultThinkingLevel: "auto"`, a judge model grades each prompt trivial/moderate/hard and maps it to `low/high/xhigh`, clamped to the model's range, `max` reachable by keyword (`auto-thinking/classifier.ts`, `session/model-controls.ts`). omp also ships a **prewalk**: a hidden planning pre-pass whose prompt starts "STOP: In NEXT reply, before further exploration, write complete plan" (`prompts/system/prewalk-plan.md`, `session/prewalk.ts`).

**opencode supports per-turn effort updates** for Claude, sending it inside the message stream rather than at the top (`ai/src/protocols/anthropic-messages.ts:919-935`).

**dsh maps effort to a coarse three-level ladder** — `off/low/high/max` — and treats empty output as a typed retry, not a nudge (`llm-deepseek/src/serialize.ts:147-156`).

## 6. Tool descriptions are the instruction surface

**opencode** — 4–6 sentence plain descriptions, few absolutes. `read` explains the `<line>: <content>` prefix and when to use `offset`/`limit`; `shell` explains backgrounding and carries a long anti-polling paragraph (`tool/plugin/shell.ts:BACKGROUND_INSTRUCTION`).

**oh-my-pi** — every edit mode has its own prompt *and* its own grammar (`crates/pi-edit/src/lib.rs:48-67`): `replace` 149 words, `patch` 448, `apply_patch` 375, `hashline` 285, `sloppy` 367, several with Lark grammars for non-JSON wire formats. The default mode is `hashline`, a line-addressed DSL — `[PATH#TAG]`, `PUT 1*:` followed by `+` body rows, `CUT`, `REM`, `MV DEST` — with tag-staleness rules ("After EVERY edit tag/numbers change: use edit response or fresh `read`; stale tag/surprise → STOP, re-read"). The non-default `replace` mode is the only one of the three harnesses that tells the model when to *bypass* its own tools:

> `<bash-alternatives>` "Pattern-addressed bulk changes: bash more efficient: |Regex replace|`sed -E -i …`|"

**dsh** — split by design: per-call facts in the JSON schema, cross-call doctrine in a one-sentence prompt section. The source comment is explicit: "Cross-call guidance belongs in the prompt rather than one-call schema prose."

## 7. Context rewriting

All three compact by reusing the live conversation prefix so the summary call hits the cache, but the artefact left behind differs.

- **opencode** appends the summarisation prompt as a user message, then stores a `<conversation-checkpoint>` with fixed sections (Goal / Work State / Next Move / Relevant Files ≤15 / Important Context), keeps ~15k tokens of tail, and supports **native provider compaction windows** replayed only on the model that produced them (`session/compaction.ts:185-270, 445-500`, `session/history.ts:41-58`).
- **oh-my-pi** keeps a 20k-token tail plus a structured summary (`## Goal`, `## Constraints & Preferences`, `## Progress`, `## Key Decisions`, `## Next Steps`, `## Critical Context`). Its `snapcompact` method is not summarisation at all: discarded history is serialised and **rasterised into PNG frames** that a vision model reads back as its own system prompt; the pass is local and deterministic, no LLM call (`packages/snapcompact/README.md:3-8`). Compaction method order defaults to `remote, snapcompact, handoff, shake, soft`.
- **deepseek-harness** replaces a span with a `<compacted-summary>` user message preceded by "Treat the captured context as established background and build on it without restating it. Continue the task directly… without acknowledging this checkpoint." Retains 16% of the budget as a tail, reserves 65,536 tokens of headroom, and the framed summary must be smaller than the span it replaces (`compaction-basic/src/summarizer.ts:25-74`, `region.ts:415-423`). Runtime-context snapshots deliberately re-assert themselves *over* the summary.

## 8. Subagents

- **opencode**: `general` plus `explore` with a purpose-written prompt — "Your role is EXCLUSIVELY to search and analyze… You MUST NOT create, modify, delete, move, or copy files" (`plugin/agent.ts:7-16`). Delegation guidance is absent from the default prompt; only the GPT dialects add "Do not spawn subagents unless the user … explicitly ask". Results arrive as `<subagent sessionID="…" state="…">` synthetic messages.
- **oh-my-pi**: a `delegationTier` knob — `gated` / `restrained` / `balanced` (default) / `eager` — plus mandatory "Delegation gates" ("NEVER outsource top-level plan", "NEVER delegate one slice", "NEVER babysit"). The subagent prompt is appended **last** so spawns share a cache prefix, swaps `# 2. Verify` for `# 2. Hand-off` ("NEVER run builds, tests, linters… the main agent verifies once all subagents land"), sets personality to none and drops AGENTS.md.
- **deepseek-harness**: children inherit the parent's preset and are **structurally identical** — the design note says "the deployment's system prompt stays uniform across parents and children" (`subagent/src/child-agent.ts:167-169`). What differs: a `subagent:delegation` context block, a `subagent:identity` block, `approval = never`, a restricted tool set, and a depth counter.

## 9. Cache and prefix discipline

This cuts across every other section, and it is where dsh and omp are most deliberate.

- opencode: explicit Anthropic breakpoint budget, `cache.ttl`, per-session `promptCacheKey`, a keep-alive warming plugin that pings the prefix (`plugin/warming.ts`).
- omp: system prompt built once per session and rebuilt only when an input signature changes; volatile data kept out; head caching anchored on the last non-deferred tool and the last stable system block.
- dsh: "Process-specific paths and endpoints stay out of the cached system prompt" (`system-prompt/src/index.ts:182-183`); policy changes "travel after retained history, so switching policy does not rewrite the stable system-prompt cache prefix" (`user-approval/src/index.ts:187-189`).

The reason is economic: for a model like DeepSeek V4.1 Flash, cache reads are roughly a twentieth of fresh input. A harness that rewrites its prefix on every turn pays for the whole conversation again.

## 10. Levers ranked by behavioural impact

1. **opencode's vendor prompt dialects** — the same harness asks GPT and Kimi for very different output shapes.
2. **omp's tool dialects** — for non-native models the entire tool-calling protocol becomes prompt text.
3. **omp's steering layer** — the only mechanism here that re-directs a *running* turn with specific corrective instructions.
4. **omp's auto effort classifier + prewalk** — decides reasoning depth and forces a plan, using extra model calls.
5. **dsh's policy visibility** — sandbox, approval, cwd, delegation depth, identity and elapsed time stated in-prompt, so enforcement is a decision the model can reason about instead of a silent failure.
6. **opencode's delta protocol** — diff-based instruction updates, catalog deltas, superseding notices: the model's context is *edited*, not rewritten.
7. **dsh's capability-gated projection** — prompt and tool lists can update mid-conversation without invalidating the prefix, on models that support it.
8. **Absolutism density** — dsh and omp write `MUST`/`NEVER` in nearly every sentence; opencode's default has none.
9. **Where instructions live** — system prompt (omp), separate system message (opencode), user-role reminder (dsh). This changes precedence and what survives compaction.

## Appendix A — file map

opencode:

- `packages/core/src/session/runner/prompt/system.txt`, `packages/core/src/plugin/optimize.ts`, `packages/core/src/plugin/system-prompt/*.txt`
- `packages/core/src/session/{context,instructions,instruction-discovery,compaction}.ts`
- `packages/core/src/session/runner/{max-steps,retry,to-llm-message}.ts`
- `packages/core/src/codemode/instructions.ts`, `packages/core/src/plugin/{plan,fork-notice,verbosity,warming}.ts`
- `packages/ai/src/protocols/anthropic-messages.ts`

oh-my-pi:

- `packages/coding-agent/src/prompts/system/` (110 fragments + 3 personalities), `packages/coding-agent/src/system-prompt.ts`
- `packages/coding-agent/src/session/{date-cwd-reminder,prewalk,model-controls,turn-recovery}.ts`
- `packages/coding-agent/src/auto-thinking/classifier.ts`, `packages/coding-agent/src/session/settings.ts`
- `crates/pi-edit/prompts/`, `packages/ai/src/dialect/`, `packages/snapcompact/`

deepseek-harness:

- `packages/core/system-prompt/src/index.ts`, `packages/core/agent-loop/src/{agent,runtime-context}.ts`
- `packages/preset/persona/src/index.ts`, `packages/context/{agent-instructions,time-context}/`
- `packages/llm/llm-deepseek/src/serialize.ts`, `packages/llm/llm-pi-ai/src/models.ts`
- `packages/compaction/compaction-basic/src/summarizer.ts`, `packages/guard/repeat-tool-reminder/`
- `snapshots/sdk/text-turn/system-prompt.expected.md`

## Appendix B — what is worth porting to OpenCode for a DeepSeek model

Constraint for this appendix: the live install is changed only through configuration and plugins. The dialect also exists as a three-file upstream patch, kept as a mail patch rather than applied to a fork.

First, the useful discovery: **OpenCode already matches dsh on the DeepSeek wire.** `opencode/packages/core/src/variant.ts:134-146` maps DeepSeek exactly as dsh does — `thinking: {type: enabled}` plus `reasoningEffort`, with the same `low/high/max` ladder (`deepseek-harness/packages/llm/llm-deepseek/src/serialize.ts:147-156`). The transport is not the gap.

The gap is the prompt. opencode ships six dialects and no DeepSeek entry, so this model runs on the generic 111-word prompt. dsh's entire prompt is already written in DeepSeek dialect: one-sentence imperatives, "use X — not Y", explicit exit-code checking, delegation as "one assistant message, then don't poll". That is prose tuned by DeepSeek for DeepSeek models, and it drops straight into an existing, tested mechanism.

### Implemented: `~/Projects/opencode-deepseek-adapt`

A plugin, registered in `~/.config/opencode/opencode.json`, with six features:

| Feature | Ported from | Gap it closes |
|---|---|---|
| `dialect` | dsh persona + per-tool sections, plus dsh's instruction-precedence framing | No DeepSeek prompt dialect in opencode; precedence and denial handling were implicit |
| `subagentContext` | omp subagent prompt | A delegated child inherited the full build prompt and ran its own verification |
| `todoNudge` | omp `mid-run-todo-nudge` | The base prompt never mentions the todo list, so a stale one is never corrected |
| `loopGuard` | `guard/repeat-tool-reminder` | opencode has no loop guard at all |
| `clock` | `context/time-context` | opencode injects the date and nothing else |
| `emptyRecovery` | dsh `EMPTY_RESPONSE`, omp empty-stop retry | A turn ending with no text and no tool call simply stopped |

Verify with `node test/smoke.mjs` (32 cases, fake plugin context).

Design constraints it respects: everything lands at the tail of the request so the cached prefix is untouched; the dialect is appended once (marker-guarded) and skipped for agents with a custom system prompt, mirroring opencode's own dialect plugins; quoted tool arguments are escaped so they cannot close a `<system-reminder>` frame.

The empty-reply recovery is the one that needed the most care. It reads the session's public messages on `experimental.idle` and acts only when the last assistant turn has no `text` and no `tool-call` part, `finish === "stop"`, and no error or pending retry — which excludes a manual interrupt, a length stop and a provider failure. It skips while background work is pending, nudges through `session.synthetic({ resume: true })` so no fake user message enters the transcript, and gives up after two attempts.

### Implemented in the plugin: the `deepseek.txt` dialect

The dialect first went in as a source patch. That was the wrong shape: `optimize.ts` is a file upstream keeps editing, so a copy of it there is a rebase on every change. It now lives in the plugin, using the **same `session.hook("context")`** that `optimize.ts`'s `make()` helper registers, and rewriting `event.system[0]` exactly as that helper does. No core file is touched.

Two modes, and the default is the one that cannot rot:

| `dialectMode` | What it does | Why |
|---|---|---|
| `append` (default) | Adds `# Instruction precedence`, `# Tool discipline` and `# Delegation` after the prompt opencode already built | It never restates opencode's wording, so an upstream prompt change reaches the model unchanged |
| `override` | Replaces `system[0]` with the dialect, substituting opencode's guidance bullets for the mounted tool set | Byte-for-byte the intended dialect; costs a copy of four guidance strings, which is where drift would appear |

Tool lines are gated on the mounted tool set in both modes, so the plugin is slightly stricter than the upstream file, which names tools unconditionally.

The upstream patch is kept as an artefact only — `patches/0001-feat-core-add-a-DeepSeek-system-prompt-dialect.patch`, one commit on branch `deepseek-prompt-dialect` in `opencode-deepseek-dialect/`. It is not installed and nothing depends on it. If it ever ships, set `"dialect": false`, because the model would otherwise receive the doctrine twice.

Verification: 32 smoke cases against a fake plugin context, plus the earlier render check in the checkout (`SessionSystemPrompt.render` with the `.txt` file: placeholder interpolates, output byte-stable, no unfilled braces). `bun test` in `packages/core` was not run — neither checkout has installed dependencies.

### Deliberately not ported

- dsh's registry architecture — opencode's plugin hooks already provide the shape.
- `defer_loading` — code mode's catalog is strictly better for a large tool set.
- Prefix-reusing compaction — opencode already appends the summary prompt to the live request.
- In-history system updates — opencode already appends `SystemMessage` for instruction changes.

### Needs a fork (therefore out of scope)

1. **Escaping in core-authored synthetic messages.** `session/subagent-completion.ts:77` interpolates subagent output and the caller's `description` into `<subagent …>…</subagent>`; `formatBody` interpolates shell command lines. A child that emits `</subagent><system-reminder>` gains harness authority, because the prompt tells the model that `<system-reminder>` blocks are harness instructions. dsh escapes closing tags in two places (`agent-loop/src/runtime-context.ts:172`, `context/agent-instructions/src/render.ts`); opencode does not escape at all. This is a security fix, not a feature, and it belongs upstream.
2. **Install-time instruction framing.** dsh adds a precedence sentence and a byte budget to workspace instructions. opencode renders AGENTS.md as bare `Instructions from: <path>` — fine for size, but there is no stated precedence when a user-level and a project-level file conflict. The plugin restores the precedence *rule* in the doctrine; the byte budget and the per-file framing still need the renderer.

Empty-response recovery was on this list and came off it: `experimental.idle` plus `session.context` plus `session.synthetic({ resume: true })` is enough to do it from a plugin, which is what `emptyRecovery` now does.

## Appendix C — method and limits

- Sources were read directly; quoting was re-verified with `sed`/`grep` because this environment's plain-text search output occasionally redacts identifiers.
- Sizes are `wc -w` on the files, not token counts from a live request. Rendered omp output is larger than its 1,770-word template because inventory, rules and workspace tree are interpolated.
- omp's 113 fragments were sampled, not all read; the ones cited are quoted.
- No harness was executed for the comparison. The plugin in Appendix B was exercised against a fake plugin context and is live in this installation — its clock and dialect injections in this session are its own output.
