# opencode-deepseek-adapt

A DeepSeek model behaviour optimization plugin for OpenCode.

Six request-time additions for OpenCode, ported from [DeepSeek Harness](https://github.com/deepseek-ai/dsh) and [oh-my-pi](https://github.com/can1357/oh-my-pi), optimizing it for `DeepSeek` model family (developed against `DeepSeek V4.1 Flash 1017`), implemented entirely as a light plugin. No OpenCode source is modified and no fork is required.

**Why:** OpenCode writes a special system prompt for GPT, Claude, Kimi, Trinity and Muse. For DeepSeek it falls back to the generic one. Meanwhile dsh and omp have been tuning for these models, so this borrows the parts that fit.

Part of [opencode-extensions-by-odt](https://github.com/odt1/opencode-extensions-by-odt).

## What it does

| Feature | Ported from | Why it helps a fast DeepSeek model |
|---|---|---|
| `dialect` | dsh persona + per-tool prompt sections | One-sentence "use X, not Y" doctrine for the built-in tools, in the style DeepSeek trained against; adds the two things OpenCode leaves implicit: which instruction wins when files disagree, and what to do when a tool is denied (don't retry the same call). It's skipped when the agent has its own system prompt |
| `subagentContext` | omp subagent prompt | A delegated subagent is told that verification belongs to the parent, so it does not run the builds, tests, linters or smoke runs unless the assignment says to |
| `todoNudge` | omp `mid-run-todo-nudge` | Counts tool calls since the last `todowrite` and pokes when the checklist has gone stale while items are still open. This one matters more here than in omp, because OpenCode's base prompt never mentions the todo list at all |
| `loopGuard` | dsh `guard/repeat-tool-reminder` | Catches the same tool call with the same arguments repeated over and over. Gentle at 3, names the tool and args at 5, "change action now" at 8. OpenCode has no loop guard, so without this a loop only ends when it hits the step ceiling |
| `clock` | dsh `context/time-context` | Without it the model only knows the date from session start, and nothing about elapsed time |
| `emptyRecovery` | dsh `EMPTY_RESPONSE` + omp empty-stop retry | A turn that ends with no text and no tool call is nudged to continue instead of stopping silently |

Only the two prompt additions (dialect and hand-off) touch the system prompt, and both append deterministically. Everything else lands at the **tail** of the request, because cache reads for these models cost roughly a twentieth of fresh input.

Both prompt additions hook the same `session.hook("context")` that OpenCode's own dialect table uses (`core/plugin/optimize.ts`), so **no core file is modified and nothing needs rebasing on an OpenCode update**.

Two dialect modes:

| `dialectMode` | Effect | Trade-off |
|---|---|---|
| `append` (default) | Adds `# Instruction precedence`, `# Tool discipline` and `# Delegation` after the prompt OpenCode already built | Cannot drift: it never restates OpenCode's own wording |
| `override` | Replaces the system prompt with the full dialect, including OpenCode's tool guidance | Reproduces the upstream dialect file exactly, but copies four guidance lines from `session/system-prompt.ts`; if those words change, this mode is stale until updated |

## Install

Requires OpenCode v2: it uses the `plugins` config key and the `ctx.session.hook` API. No build step, no dependencies — `src/index.js` is the whole plugin.

```sh
opencode plugin add opencode-deepseek-adapt
```

Restart OpenCode once.

To set options, use the object form in `opencode.json`, since `opencode plugin add` writes only the string form:

```jsonc
// ~/.config/opencode/opencode.json
"plugins": [
  {
    "package": "opencode-deepseek-adapt",
    "options": { "clockEveryMs": 300000 }
  }
]
```

From a clone, `package` also accepts a local directory — useful for development:

```sh
git clone https://github.com/odt1/opencode-extensions-by-odt ~/Projects/opencode-extensions-by-odt
```

```jsonc
"plugins": [
  { "package": "/Users/you/Projects/opencode-extensions-by-odt/packages/opencode-deepseek-adapt" }
]
```

`package` accepts an absolute path, a `file://` URL, or a `./` path relative to the config file. A bare directory path is not something `opencode plugin add` accepts, which is why this route is a config edit.

**Not** `opencode plugin add github:odt1/opencode-extensions-by-odt`. That looks right and isn't: the installer resolves packages through `@npmcli/arborist`, and npm 12 defaults `allow-git` to `none`, so it fails with `EALLOWGIT: Fetching packages of type "git" have been disabled`. If you really want the git route, opt in first with `npm config set allow-git=all` — that is a global relaxation of npm's git-dependency guard, so most people should just install from npm.

Options are merged over the defaults below, so an omitted key keeps its default. Values are validated when the plugin loads: a value of the wrong type, below the minimum for that option, or an unknown `dialectMode` falls back to its default rather than breaking the request. `models: []` is honoured as an explicit opt-out of the dialect.

## Options

| Option | Default | Meaning |
|---|---|---|
| `dialect` | `true` | Apply the DeepSeek doctrine to the system prompt |
| `dialectMode` | `"append"` | `append` adds doctrine after the live prompt; `override` replaces the prompt with the full dialect |
| `subagentContext` | `true` | Tell a delegated subagent that verification belongs to its parent |
| `emptyRecovery` | `true` | Resume a turn that ended with no text and no tool call |
| `todoNudge` | `true` | Nudge when the todo list goes stale during long work (needs `experimental.todo`) |
| `todoNudgeAfter` | `12` | Tool calls without a todo update before the first nudge |
| `todoNudgeMax` | `2` | Nudges allowed for one unchanged list |
| `emptyRecoveryMax` | `2` | Recoveries allowed in one stalled turn |
| `emptyRecoveryWindowMs` | `600000` | Gap that resets the recovery count |
| `loopGuard` | `true` | Inject repeat-tool-call reminders |
| `clock` | `true` | Inject sampled time and elapsed time |
| `models` | `["deepseek"]` | Case-insensitive substrings matched against the model id. Gates `dialect` only |
| `loopGentle` | `3` | First reminder threshold |
| `loopDetailed` | `5` | Names the tool, run length and arguments |
| `loopStrong` | `8` | Adds "change action now" |
| `clockEveryMs` | `300000` | Minimum gap between clock injections |
| `argumentsPreview` | `300` | Characters of arguments quoted back in a detailed reminder |

Only `dialect` is gated by `models`; the other five features apply to every model. Set `models` to `[]` to keep the dialect off while leaving the rest on.

### `todoNudge` needs `todowrite` switched on

`todowrite` is behind the `todo` experimental flag, and OpenCode turns flags off in release builds (`onByDefault = channel === "local" || channel === "dev"`). On a normal install the tool is not mounted at all, so the nudge never fires — it checks the mounted tool list first and returns when `todowrite` is absent. Enable it once:

```jsonc
// ~/.config/opencode/opencode.json
"experimental": { "todo": true }
```

or run with `OPENCODE_FLAGS=todo` for a single launch. Restart OpenCode afterwards: the toolset is built per session, so a config edit alone does not mount the tool in a session that is already open. The other five features do not depend on it.

## Behaviour notes

- **Dialect** is skipped when the agent has its own `system` prompt, matching how OpenCode's own dialect plugins behave. It is idempotent: the marker `(deepseek-adapt)` prevents a second application when the hook runs again for the same request. Tool lines are gated on the tools actually mounted, so a line never names a call the model cannot make — including the four guidance lines in `override` mode.
- **Todo nudge** counts tool calls since the last `todowrite`, reads the open items out of that call, and stays silent unless the session actually uses a list with something still open. One nudge per threshold, capped per unchanged list, reset by any real update. Requires `experimental.todo`, see above.
- **Failure isolation**: options are validated at load (a bad value falls back to its default rather than failing requests), every hook body is wrapped so an unexpected error is logged once and swallowed, and each session map is capped at 500 entries so a long-lived process cannot grow without bound.
- **Loop scanning is bounded**: only the trailing run of identical calls is examined, at most one past the strongest threshold, and a longer run is reported as "at least N" rather than re-serializing the whole history each step.
- **Whispers are not history**: the clock, loop-guard and todo nudges are pushed into the request only, so they never enter the transcript, never survive a reload, and never enlarge the cached prefix.
- **Hand-off** applies to any model when the agent's `mode` is `subagent`, including one with a custom system prompt (the explore agent), because it adds a rule rather than replacing prose.
- **Empty recovery** reads the session's public messages on `experimental.idle` and acts only when the last assistant turn has no non-whitespace `text` and no `tool-call` part, `finish === "stop"`, and no error or pending retry — which excludes a manual interrupt, a length stop and a provider failure. It skips while background work is pending, then sends one synthetic message that resumes the loop. Unlike the whispers, that one is durable: the resumed turn has to see it in the transcript.
- **Compaction** gets both prompt additions (dialect and hand-off) but never the clock, loop or todo reminders, so summaries are not polluted with transient context.
- **Loop guard** counts only *consecutive* identical calls across assistant messages, keyed on canonical (sorted-key) JSON arguments. One reminder per crossed threshold; a changed argument resets the run. A 3/5/8 ladder is deliberate — at 3 the model may still be verifying, by 8 the run is not progress.
- **Clock** measures from the previous request, which is the previous model-visible message. When no previous request is known (fresh process on a resumed session) the elapsed clause is omitted rather than guessed.
- **Injection safety**: any text this plugin quotes back into a `<system-reminder>` frame is escaped, so tool arguments containing `</system-reminder>` cannot close the frame. That discipline is ported from dsh's `runtime-context` escaping.

## Verify

```sh
npm test -w opencode-deepseek-adapt   # 35 cases against a fake plugin context, no OpenCode process needed
```

## Known limits

- The loop guard sees only what is in the request, so a run interrupted by compaction starts counting again.
- The clock's elapsed value is approximate: the hook fires per model request, so it measures step-to-step time, not wall time since the user spoke.
- Empty recovery depends on `session.context` returning the stored messages; if that call fails it stays quiet rather than guessing.
- Empty recovery can race a message you are already typing: if the empty turn ends while your next prompt is in flight, both can be admitted and you get two turns. `emptyRecoveryMax` keeps the damage to one duplicate instead of a cascade.
- That recovery costs one `session.context` call per idle, which returns the whole message list; there is no cheaper last-message read in the plugin API.
- One ported dsh behaviour is **not** possible without patching OpenCode: escaping tags inside core-authored synthetic messages (`session/subagent-completion.ts` interpolates subagent output into a `<subagent …>` frame). It is described in `MODEL-DRIVING.md`.

## Want the long version?

`MODEL-DRIVING.md` in this repo is the full three-harness comparison this came out of: how opencode, oh-my-pi and deepseek-harness each drive a model, with file citations.

## Licence

MIT — see [LICENSE](LICENSE). 
