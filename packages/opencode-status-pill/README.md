# opencode-status-pill

A session readout for **OpenCode Desktop**, in the pill row above the composer — beside the app's own background-work and todo pills. No separate window, panel, or bottom strip.

```
12% · cache 84% warm · $2.12 left
```

One dollar figure only: the OpenRouter balance when one is available, otherwise the session's spend (`$0.28`). Both amounts at once overflow the capsule.

Clicking it opens a menu with the full accounting, and its first action opens the app's built-in **Context** panel.

Part of [opencode-extensions-by-odt](https://github.com/odt1/opencode-extensions-by-odt).

## What it shows

| Where | Value |
|---|---|
| Capsule | context fill, cache hit rate with `warm`/`cold`, OpenRouter balance left — or session cost when no balance is known |
| Menu | model, provider, git branch |
| Menu | context used / model limit |
| Menu | input and output tokens (cache excluded) |
| Menu | cache hit rate, cache read, cache write |
| Menu | session cost in USD |
| Menu | OpenRouter credit left |

Colour follows the data: `danger` at 85% context fill or more, `warning` when the latest step wrote to the cache without reading it — a cold prompt.

## How the numbers are defined

- **Context** — the tokens of the assistant step that occupies the window now, over the model's `limit.context`. The same figure the app's own context ring draws.
- **Cache hit** — `cache.read / (input + cache.read + cache.write)`. Of the prompt the provider actually read, how much came from cache.
- **Warm / cold / stale** — from the latest step: any cache read is `warm`, a write with no read is `cold` (the prompt was cached but nothing was reused yet). After an hour of inactivity the entry has almost certainly expired, so it reads `stale` instead of claiming a cache that is gone. The menu shows how old that step is (`warm · 3m ago`).
- **Input** — uncached prompt tokens. opencode tracks `cache.read` and `cache.write` separately, so `input` excludes both.
- **Output** — generated tokens. Reasoning is shown beside it, not folded in, because opencode reports it as its own field.

Session totals add up as `input + output + reasoning + cache.read + cache.write` — the same sum the app uses for the context ring.

The pill re-reads its figures at least once a minute, so warm/cold settles even while a session sits idle.

- **Credit** — the account's remaining OpenRouter balance, from `GET /api/v1/credits`, using the same API key OpenCode already stores for the provider. Refreshed every five minutes. Warns under $5 and turns red under $1, in the menu and in the capsule when the capsule shows it. A failed refresh keeps the last balance through three attempts, then drops it; a balance older than 15 minutes is shown with its age and stops driving the capsule. Nothing is shown when the provider has no stored key, so OAuth accounts and other providers simply have no credit row.

## Requirements

- OpenCode Desktop **2.3.0** or newer. GUI plugins arrived in 2.2.0 and their API is still experimental (`./gui-experimental`), so a future release may change it.
- The desktop app reads `~/.config/opencode/opencode.json`, not `cli.json`.
- The credit row needs an OpenRouter API key stored in OpenCode. It is read through the app's own client and sent only to `openrouter.ai`.

## Install

```sh
opencode plugin add opencode-status-pill
```

Restart OpenCode Desktop once. Switch it off without removing it in **Settings → Extensions → Plugins**.

To set [options](#options), use the object form in `opencode.json`, since `opencode plugin add` writes only the string form:

```jsonc
// ~/.config/opencode/opencode.json
{
  "plugins": [
    { "package": "opencode-status-pill", "options": { "creditCapsule": "low", "creditLow": 5 } }
  ]
}
```

### From a clone

The built bundle is committed at `dist/gui-experimental.cjs`, so a checkout needs no build step and — because the server part has no runtime dependencies — no `npm install` either:

```sh
git clone https://github.com/odt1/opencode-extensions-by-odt ~/Projects/opencode-extensions-by-odt
```

```jsonc
// ~/.config/opencode/opencode.json
{
  "plugins": ["/Users/you/Projects/opencode-extensions-by-odt/packages/opencode-status-pill"]
}
```

`npm install` at the repository root is only needed to work on the plugin: it adds the build toolchain, which running it does not use. After that, `npm run dev -w opencode-status-pill` rebuilds on save and hot-reloads every window.

## Options

Set them on the plugin entry in `opencode.json`:

| Option | Values | Default | Effect |
|---|---|---|---|
| `creditCapsule` | `"always"`, `"low"`, `"never"` | `"always"` | Where the balance appears in the capsule. `"low"` shows it only at or below `creditLow`; `"never"` keeps it in the menu only. |
| `creditLow` | dollars | `5` | The threshold for `"low"`, and for the warning tone in the menu. |

When the balance is not shown in the capsule, the session cost takes that slot back.

## Develop

```sh
npm install                # once, at the repository root
npm run build -w opencode-status-pill      # one bundle: dist/gui-experimental.cjs
npm run dev -w opencode-status-pill        # same, on every save
npm run typecheck -w opencode-status-pill  # tsc --noEmit
npm test -w opencode-status-pill           # node --test, the pure helpers in src/gui/metrics.ts
```

The GUI must build to a single CommonJS file, so the bundle is produced by `@opencode/plugin/gui/vite`, which inlines dynamic imports and keeps the app's shared modules external.

## Licence

MIT — see [LICENSE](LICENSE).
