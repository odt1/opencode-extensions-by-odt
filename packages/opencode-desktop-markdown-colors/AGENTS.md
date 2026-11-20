# Notes for whoever works on this next

Context that is not visible from the code. Written 2026-11-20 against OpenCode Desktop 2.3.0 (macOS arm64).

## The finding

The desktop app defines the CLI's markdown color tokens and its theme engine populates them, but the markdown stylesheet never consumes them. That is why every theme looks bland: the tokens change, the transcript does not.

Evidence from the installed app (`/Applications/OpenCode.app/Contents/Resources/app.asar`):

- `out/renderer/assets/main-*.css` contains `--markdown-heading:#9d7cd8` (dark) and `--markdown-heading:#d68c27` (light) in the `:root` theme blocks.
- The same file styles markdown with `--v2-text-text-base`, `--v2-text-text-muted` and `--v2-text-text-accent`.
- `var(--markdown-heading)` appears zero times in any CSS or JS file.
- The theme generator (`C0t` in `main-*.js`) writes the full token map, including `--markdown-*`, to `:root` on every theme change.

So the fix is a stylesheet, not a theme. A theme alone cannot work until the app's own CSS reads the tokens.

## Layout

```
src/index.js            server part: declares the id, does nothing else
src/gui.tsx             the gui-experimental entry: one Style contribution
src/gui/markdown.css    the stylesheet, imported with ?inline
src/env.d.ts            *.css?inline module declaration for tsc
vite.config.ts          gui() preset from @opencode/plugin/gui/vite
dist/gui-experimental.cjs  built bundle, committed so a clone needs no build
```

### The id is the package name

`id: "opencode-desktop-markdown-colors"` is the same string as the npm name. The id prefixes every contribution id and stored key the plugin creates, so letting them drift apart produces two names for one thing and no way to find the plugin in the app by the name you installed.

The server part is a plain `{ id, setup }` object rather than `Plugin.define`: that helper is identity, and importing it made `@opencode/plugin` — with the whole client SDK — a runtime dependency of a package that needs nothing at runtime. It is a devDependency for the build and its types only.

### Why `:root` on every selector

The app's rules are `[data-component=markdown] h1` (specificity 0,1,1). The plugin's stylesheet is appended to `document.head` after the app's `<link>`, so equal specificity would already win, but `:root` adds one class-level point and keeps the override stable if the app reorders its stylesheets. No `!important` is used, so the app's hover and state rules still compose.

### Why reasoning is reset

The app deliberately mutes reasoning blocks:

```css
[data-component=reasoning-part] [data-component=markdown] h1 { color: inherit }
[data-component=reasoning-part] [data-component=markdown] strong { color: var(--v2-text-text-muted) }
[data-component=reasoning-part] [data-component=markdown] :not(pre)>code { opacity:.6 }
```

The color rules above would repaint those, so the last block restores the muted look with higher specificity.

### Why `?inline`

`ctx.add(Style, css)` takes a string. Vite's `?inline` returns the stylesheet as a string and emits no separate CSS file, which the single-CJS bundle requires. `src/env.d.ts` declares the module because `tsconfig.json` uses `"types": ["node"]` and does not pull in `vite/client`.

## Before publishing

1. ~~Pick a licence.~~ MIT, in `LICENSE`, with `"license": "MIT"` in `package.json`.
2. ~~Add repository metadata.~~ `repository` (with `directory`), `homepage` and `bugs` point at the public monorepo.
3. **Name check** — `opencode-desktop-markdown-colors`, `opencode-markdown-colors` and `markdown-colors` were all unclaimed on npm as of 2026-11-20. Re-check before publishing.
4. **Version** — `0.1.0` for the first public release. The GUI API is experimental; expect to track app releases.
5. `npm run check` at the repository root, then `npm publish -w packages/opencode-desktop-markdown-colors`.
6. **Verify the published package**, not just the local one: `opencode plugin add opencode-desktop-markdown-colors` in a clean config, restart, confirm the transcript is colored.
7. **`dist/` is committed**, so a clone and a tarball install both work without a build — `opencode plugin add` installs with lifecycle scripts disabled, so the old `prepare` script would never have run.

## Gotchas worth remembering

- **Reserved plugin ids**: the app's own are `context`, `btw`, `debug`, `terminal`, `file`, `review`, `details`, `browser`, `pairing`, `updater`, `ssh`, `wsl`, `microsoft-office`, `sources`, `goal`, plus the `opencode` namespace. A collision means the GUI silently does not load — **Settings → Extensions → Plugins** shows it as not loaded.
- The GUI bundle must be one CommonJS file. `@opencode/plugin/gui/vite` inlines dynamic imports and fails the build on any `@opencode/*` or `effect/*` module the app does not provide.
- `@opencode/plugin` ships no `require` condition, so the bundle cannot be `require()`d outside the app. Verify by loading it in the app, or by rebuilding — not with `node`.
- Plugin config and GUI contributions are re-read on rebuild; the server part restarts with the app.
- The app's markdown CSS is not layered, so a later stylesheet wins ties. If a future build wraps its CSS in `@layer`, unlayered plugin styles still win.

## Verification

```sh
npm run build -w opencode-desktop-markdown-colors
opencode plugin list | grep markdown-colors
grep markdown-colors ~/.local/share/opencode/log/opencode.log | tail
```

The binary is `/Users/odt/.opencode/bin/opencode` (`opencode` is not on `PATH` by default).
