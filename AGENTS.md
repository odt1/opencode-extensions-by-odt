# Monorepo notes

Same purpose as the per-package `AGENTS.md` files: the context that is not visible from the code. This one covers the repository itself; each `packages/*/AGENTS.md` covers that plugin's API findings.

## Rules

- One plugin per directory under `packages/`. The directory name is the npm package name. Do not add a plugin that shares a directory with another.
- Every package is published independently. A change to one package never bumps another's version, and never edits another package's `dist/`.
- Every package carries its own `LICENSE` copy. npm only packs a licence file that lives inside the package directory, and `npm publish -w` packs the workspace, not the repository root.
- `dist/` is committed for the three GUI plugins. `opencode plugin add` runs Arborist with `ignoreScripts: true`, so a `prepare` script never runs — Git-based and tarball installs must already contain the bundle.
- `package.json` scripts run with the package directory as their working directory, so a `prepublishOnly` that checks `git diff -- dist` checks only its own bundle.

## Why `opencode-cd` is published as `opencode-desktop-cd`

`opencode-cd` was already taken on npm (v0.1.0, a TUI plugin that also changes the session directory) and so was `opencode-themes` (v1.0.0). The package names had to differ from the directory names the plugins started with. The plugin **id** in `Plugin.define` is deliberately independent of the npm name, so a future rename of the package does not change contribution ids or stored keys.

## Shared platform traps

These cost time once already; they are repeated from the package notes because they apply to every GUI plugin here.

- **Reserved plugin ids.** The app's own are `context`, `btw`, `debug`, `terminal`, `file`, `review`, `details`, `browser`, `pairing`, `updater`, `ssh`, `wsl`, `microsoft-office`, `sources`, `goal`, plus the `opencode` namespace. A collision does not error — the GUI silently does not load, and **Settings → Extensions → Plugins** shows the plugin as not loaded.
- **The GUI bundle is one CommonJS file.** `@opencode/plugin/gui/vite` inlines dynamic imports and fails the build on any `@opencode/*` or `effect/*` module the app does not provide. The app evaluates the bundle as CommonJS text, so a TypeScript source or an ES module is never a valid GUI entry.
- **`@opencode/plugin` ships no `require` condition.** The bundle cannot be `require()`d outside the app, so verify by loading the plugin in the app or by rebuilding — not with `node`.
- **A GUI plugin needs a server part.** Desktop lists a plugin's `./gui-experimental` only when its server part resolves. A package with only a GUI bundle works, but then the plugin id comes from the package name.
- **Config key.** V2 reads `plugins` (an array of strings or `{ package, options }`) from `~/.config/opencode/opencode.json`. Desktop reads that file, not `cli.json`.
- **Installed plugins are cached, not linked.** `opencode plugin add` installs a registry package under `~/.cache/opencode/npm/`, so editing a published package's source on disk changes nothing. A local-directory entry in `opencode.json` is the development route.

## Publishing

`docs/RELEASING.md` has the checklist. In short:

```sh
npm run check
npm pack --workspaces --dry-run    # what would ship
npm publish -w packages/opencode-status-pill
```

Nothing is published automatically. There is no release workflow and no token in the repository.

## Submitting to awesome-opencode

`docs/awesome-opencode/` holds one YAML per plugin. The list's rules require a public repository with **at least 25 stars and at least 30 days of age**, so an entry cannot be accepted on the day a repository is created. Re-read `docs/RELEASING.md` before opening the PR; the rules are copied there with the date they were checked.
