# Notes for whoever works on this next

Context that is not visible from the code, plus what is left to do before this is published.
Written 2026-11-16 against OpenCode Desktop 2.3.0 (macOS arm64).

## What this is

A background-only override for the desktop app's existing themes. It does not ship a theme and does not replace the selected one; it injects a stylesheet that repaints the background tokens on top of whatever theme is active.

The first build of this package was a theme pack (Tokyonight Warm, Gruvbox Soft). That was the wrong shape: the user wanted to keep an existing theme and change only its background. The theme pack was removed; the package is now a `Style` contribution driven by plugin options.

## The finding

Desktop themes are not files on disk. There is no user theme directory for the desktop app; the CLI's `~/.config/opencode/themes/` uses a different format and is not read by Desktop. A Desktop theme is a `Theme` registry contribution from a GUI plugin, and the host keys it as `<plugin id>:<theme id>`.

The app's CSS reads the newer token set. The background is `--v2-background-bg-base` (74 uses in the app stylesheet), not the legacy `--background-base`. A theme's `overrides` map writes the legacy set; `v2Overrides` writes the newer set. This plugin bypasses both and writes the CSS variable directly, so it works on top of any theme.

The theme engine sets `data-color-scheme="light"` or `"dark"` on `<html>` on every theme change, so `:root[data-color-scheme="…"]` follows the mode without a media query.

### The html inline style

The theme engine (`C0t` in the app bundle) also sets:

```js
document.documentElement.style.backgroundColor = dark ? "#080808" : "#fafafa"
```

That is an inline style, outside the token system. A theme cannot change it, and a normal stylesheet rule cannot beat it. The plugin adds `html { background-color: var(--v2-background-bg-base) !important; }`; `!important` is required. Without it, the main surfaces repaint but the html color still shows at overscroll and transparent edges.

## Layout

```
src/index.js          server part: declares the id, does nothing else
src/gui.tsx           Plugin.define({ setup }) — reads ctx.options, adds the Style
src/background.ts     parses options and builds the stylesheet
vite.config.ts        gui() preset from @opencode/plugin/gui/vite
```

### Why there is a server part at all

The desktop app skips a plugin's GUI when its server part fails to load. A package with no server part does work, but then the plugin id comes from the package name instead. Declaring `id: "theme-background"` keeps the id independent of the npm name (`opencode-theme-background`).

The server part is a plain `{ id, setup }` object rather than `Plugin.define`: that helper is identity, and importing it made `@opencode/plugin` a runtime dependency of a package that needs nothing at runtime. It is a devDependency for the build and its types only.

### Why the package name is not `opencode-themes`

`opencode-themes` was already taken on npm (1.0.2) as of 2026-11-16. `opencode-theme-background` was free. The directory can still be called `opencode-themes`.

### Why options and not a config file

The GUI `setup` runs in the window process, where Node built-ins are inert placeholders. Reading a file from `~/.config/opencode/` would need the main process and an `Ipc` bridge. Plugin options are already delivered to `ctx.options` in both processes, and changing them reloads the plugin, so they are the smallest correct mechanism.

### Why the CSS is built once

`ctx.add(Style, css)` takes a fixed string. The options are read at setup; changing them in `opencode.json` reloads the plugin, which rebuilds the stylesheet. There is no reactive path to update the CSS in place, and none is needed.

## Before publishing

At packaging time the checklist was:

1. ~~Pick a licence.~~ MIT, in `LICENSE`, with `"license": "MIT"` in `package.json`.
2. ~~Add repository metadata.~~ `repository` (with `directory`), `homepage` and `bugs` point at the public monorepo.
3. **Name check** — `opencode-theme-background` was unclaimed on npm as of 2026-11-20; `opencode-themes` was taken (1.0.2). Re-check before publishing.
4. **Version** — `0.1.0` for the first public release. The GUI API is experimental; expect to track app releases.
5. `npm run check` at the repository root, then `npm publish -w packages/opencode-theme-background`.
6. **Verify the published package**, not just the local one: `opencode plugin add opencode-theme-background` in a clean config, set the options, restart, confirm the background changes while the selected theme's syntax and markdown colors stay.
7. **`dist/` is committed**, so a clone and a tarball install both work without a build. `opencode plugin add` installs with lifecycle scripts disabled, so a `prepare` script would never run anyway. `prepublishOnly` rebuilds and fails on a dirty `dist/`.

## Gotchas worth remembering

- **Reserved plugin ids**: the app's own are `context`, `btw`, `debug`, `terminal`, `file`, `review`, `details`, `browser`, `pairing`, `updater`, `ssh`, `wsl`, `microsoft-office`, `sources`, `goal`, plus the `opencode` namespace. A collision means the GUI silently does not load — **Settings → Extensions → Plugins** shows it as not loaded.
- The GUI bundle must be one CommonJS file. `@opencode/plugin/gui/vite` inlines dynamic imports and fails the build on any `@opencode/*` or `effect/*` module the app does not provide.
- `@opencode/plugin` ships no `require` condition, so the bundle cannot be `require()`d outside the app. Verify by loading it in the app, or by rebuilding — not with `node`.
- Plugin config and GUI contributions are re-read on rebuild; the server part restarts with the app.
- The plugin's stylesheet is appended to `document.head` after the app's `<link>`, and `:root[data-color-scheme]` outranks the theme engine's `:root`, so the override wins without depending on order.
- Overriding only `base` and `deep` keeps the theme's raised surfaces intact. Overriding every layer flattens the UI; it is opt-in for a reason.

## Verification used while building this

```sh
npm run typecheck && npm run build
opencode-cli plugin list | grep theme-background     # "local  /Users/odt/Projects/opencode-themes"
grep theme-background ~/.local/share/opencode/log/opencode.log | tail   # reload lines after each build
```
