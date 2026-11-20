# Notes for whoever works on this next

Context that is not visible from the code, plus what is left to do before this is published.
Written 2026-11-16 against OpenCode Desktop 2.3.0 (macOS arm64).

## Where it runs today

The plugin lives in the monorepo at `packages/opencode-status-pill`, and is installed from there by path until it is published:

```jsonc
// ~/.config/opencode/opencode.json
"plugins": ["/Users/odt/Projects/opencode-extensions-by-odt/packages/opencode-status-pill"]
```

- The server loaded it as `status-pill`, from `src/index.js`.
- `dist/gui-experimental.cjs` is watched, so `npm run build -w opencode-status-pill` hot-reloads the GUI in every window. Adding the package to the config for the first time needs an app restart.
- Previously lived at `~/.config/opencode/status-pill`, then at `~/Projects/status-pill`; both are gone.
- The server part is a plain `{ id, setup }` object, not `Plugin.define`. That helper is identity, and importing it made `@opencode/plugin` — with the entire client SDK — a runtime dependency of a package that needs nothing at runtime. `@opencode/plugin` is now a devDependency for the build and its types only.

## Layout

```
src/index.js          server part: declares the id, does nothing else
src/gui.tsx           Plugin.define({ ...definition, setup }) — the gui-experimental entry
src/gui/definition.ts i18n
src/gui/credits.ts    OpenRouter balance: key lookup + /credits call
src/gui/metrics.ts    pure helpers: token sums, hit rate, cache state, formatting
src/gui/metrics.test.ts  node --test cases for those helpers
src/gui/window.tsx    the contributions: CSS-free, one ComposerPill
vite.config.ts        gui() preset from @opencode/plugin/gui/vite
dist/gui-experimental.cjs  built bundle, committed so a clone needs no build
```

### Why there is a server part at all

The desktop app skips a plugin's GUI when its server part fails to load. A package with no server part does work, but then the plugin id comes from the package name instead — and the id prefixes every contribution id and stored key, so it is the package name here anyway: `opencode-status-pill`.

### Why only a ComposerPill

The original build also contributed `Slot at "session.header"`, next to the app's own usage button. It was removed on request: the composer pill is one place, not two.

### "Open session context" opens the app's own panel

The built-in **Context** panel is contributed by a built-in plugin with id `context` (`qe({ context: at, btw: lt, … })` in the app bundle), so its panel key is `context:main`. That is what `ctx.layout.toggle("context:main", session)` targets. A plugin cannot inject into or patch another plugin's contribution — `ctx.add` only adds its own items, and built-ins expose no `Contract`. Driving their panel is as close to "extending" it as the SDK allows.

## Data sources

All from the session's server store, the same figures the app renders:

```ts
const data = session.server.data
data.session.get(id)                      // tokens, model, revert
data.session.cost(id)                     // USD, includes subagents
data.session.message.list(id)             // + lastAssistantWithUsage(messages, boundary)
data.location.model.list(location)        // limit.context, may be undefined until synced
data.location.vcs.info(location)          // branch.current
```

- `input` excludes `cache.read`/`cache.write`. If it did not, the app's context ring — which sums all five fields — would overrun 100% on cached sessions.
- `reasoning` is its own field, not part of `output`.
- `model.list` and `vcs.info` return `undefined` until synced; `window.tsx` syncs both once per routed session and every 30 s.
- Git branch needs no main-process bridge: `data.location.vcs` already has it.

### OpenRouter balance

`GET https://openrouter.ai/api/v1/credits` returns `{ total_credits, total_usage }`; remaining is the difference. Three things are worth knowing:

- **The key is the one OpenCode already stores**, read with `ctx.client.credential.list()` and matching `integrationID === "openrouter"` with `active`. No second credential, no plugin option, no database read. Missing key → no row.
- **The docs are wrong about access.** The Credits SDK page says a management key is required; a plain inference key answered 200 on 2026-11-16 (`is_provisioning_key: false`). If OpenRouter tightens this, `loadCredits` returns `undefined` on `!response.ok` and the row disappears rather than erroring.
- **No server part involved.** `openrouter.ai` sends `access-control-allow-origin: *` and allows `Authorization`, so the window can call it directly. An RPC bridge would only add a hop — and would push the secret through a layer that may log inputs.

`/credits` reports **account** usage across all keys; `/key` reports the single key (`usage`, `limit_remaining`). They disagree on purpose — do not mix them into one figure.

### Not available

The OpenRouter endpoint actually used (`morph/fp8` for the pinned DeepSeek model) is nowhere in the client schema — `ModelRef` is just `{ id, providerID, variant }`, and assistant messages carry no endpoint field. The pill shows provider and model instead of asserting a route it cannot verify.

## Before publishing

At packaging time the checklist was:

1. ~~Pick a licence.~~ MIT, in `LICENSE`, with `"license": "MIT"` in `package.json`.
2. ~~Add repository metadata.~~ `repository` (with `directory`), `homepage` and `bugs` point at the public monorepo.
3. **Name check** — `opencode-status-pill` was unclaimed on npm as of 2026-11-20. Re-check before publishing; a name can be taken between then and now.
4. **Version** — `0.1.0` for the first public release. The API is experimental; expect to track app releases.
5. `npm run check` at the repository root, then `npm publish -w packages/opencode-status-pill`. `prepublishOnly` typechecks, tests, rebuilds and fails if the rebuilt bundle differs from the committed one.
6. **Verify the published package**, not just the local one: `opencode plugin add opencode-status-pill` in a clean config, restart, confirm the pill appears. `npm publish` ships `files` only — `dist/gui-experimental.cjs`, `src/index.js`, `README.md`, `LICENSE` — and the tarball has no dependencies, so a clean config needs nothing else.
7. **`dist/` is committed.** The bundle is in git so a clone runs without a build step, and `opencode plugin add` installs with lifecycle scripts disabled so a `prepare` script would never run anyway. That makes a stale bundle the main risk: `prepublishOnly` rebuilds and then fails if `git diff -- dist/` is non-empty, and `npm run check` runs the same comparison in CI.

## Gotchas worth remembering

- **Reserved plugin ids**: the app's own are `context`, `btw`, `debug`, `terminal`, `file`, `review`, `details`, `browser`, `pairing`, `updater`, `ssh`, `wsl`, `microsoft-office`, `sources`, `goal`, plus the `opencode` namespace. A collision means the GUI silently does not load — **Settings → Extensions → Plugins** shows it as not loaded.
- **One dollar figure in the capsule.** The balance replaces the session cost there, because `20% · cache 96% warm · $0.34 · $2.05 left` truncates mid-word in the pill. The cost is still a menu row; when no balance is available the cost takes the capsule slot back, unlabelled, since it is then the only amount.
- **Cache state is time-aware.** `CACHE_TTL_MS` (1 h) turns `warm` into `stale` once the last step is older than that. Providers publish no TTL, so this is a heuristic: the alternative is claiming a cache that expired hours ago. The menu row also prints the step's age, so the raw fact is always visible. If a provider's real TTL is known, change the constant, not the label.
- **Options come from `ctx.options`**, set as `{ "package": "...", "options": { ... } }` in `opencode.json` — the plain string form has no options. `creditCapsule` (`always`/`low`/`never`) and `creditLow` (dollars) are read once in `setup`, so changing them reloads the plugin. Unknown values fall back to the defaults rather than throwing.
- **Two clocks, no polling sync.** `REFRESH_MS` (60 s) re-reads tokens and cache; `CREDITS_MS` (5 min) re-reads the balance, which is also fetched on setup. Nothing polls the store: a 30 s `model.sync` was removed because `/api/model` is ~278 KB and the store already refreshes it from `model.updated` / `provider.updated`.
- **Session open and switch.** The host re-runs `show` for the newly mounted composer, so the pill's own figures are current without help. `createKeyed` on the routed session key then re-syncs **vcs only** (60 B): a branch can change in a terminal without a `vcs.branch.updated` event. The model list is primed only when the location's store is empty. Credits are account-level, so a switch does not refresh them.
- **Balance freshness.** A failed refresh keeps the last value through `CREDITS_FAILURES` (3) attempts, then clears it. Past `CREDITS_STALE_MS` (15 min) the row prints the age and the capsule falls back to session cost, so a dead key cannot masquerade as a current balance.
- **The 60 s tick is load-bearing.** The host re-runs `show` only when something it read changes, so a step that lands without a tracked store change would leave a cold cache reading as cold until the next prompt. `show` reads a `createSignal` that a `setInterval` bumps every `REFRESH_MS`; that subscription is what forces the re-read. Do not remove it as "unused".
- The GUI bundle must be one CommonJS file. `@opencode/plugin/gui/vite` inlines dynamic imports and fails the build on any `@opencode/*` or `effect/*` module the app does not provide.
- `@opencode/plugin` ships no `require` condition, so the bundle cannot be `require()`d outside the app. Verify by loading it in the app, or by rebuilding — not with `node`.
- Plugin config and GUI contributions are re-read on rebuild; the server part restarts with the app.

## Tests

`npm test` runs `node --test` over `src/gui/metrics.test.ts` — no DOM, no bundler, Node's own type stripping. The cache-state matrix (warm/cold/stale/none × age) lives there because that is where the subtle bugs were: a provider that never caches must stay `none` however old the step, and a step past the TTL must not claim `warm`.

Keep new pure logic in `metrics.ts` rather than in the component, so it stays testable.

## Verification used while building this

```sh
npm run check
opencode plugin list | grep status-pill     # "local  …/packages/opencode-status-pill"
grep status-pill ~/.local/share/opencode/log/opencode.log | tail   # reload lines after each build
```

The binary is `/Users/odt/.opencode/bin/opencode` (`opencode` is not on `PATH` by default).
