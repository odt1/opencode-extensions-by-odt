# Notes for whoever works on this next

Context that is not visible from the code. Written 2026-11-20 against OpenCode Desktop 2.3.0 (macOS arm64).

## Layout

```
src/index.js          server part: declares the id, does nothing else
src/gui.tsx           the gui-experimental entry: one Command
vite.config.ts        gui() preset from @opencode/plugin/gui/vite
dist/gui-experimental.cjs  built bundle, committed so a clone needs no build
```

### Why there is a server part at all

The desktop app skips a plugin's GUI when its server part fails to load. A package with no server part does work, but then the plugin id comes from the package name instead — and the id prefixes every contribution id and stored key, so it is the package name here anyway: `opencode-desktop-cd`.

The server part is a plain `{ id, setup }` object rather than `Plugin.define`: that helper is identity, and importing it made `@opencode/plugin` — with the whole client SDK — a runtime dependency of a package that needs nothing at runtime. It is a devDependency for the build and its types only.

### Why the npm name is not `opencode-cd`

`opencode-cd` was taken on npm (0.1.0, by another author: a TUI plugin that also changes the session directory). The package became `opencode-desktop-cd`, and the id moved with it. Nothing had shipped, so there was no stored key or keybind to migrate.

### Why the command re-reads the session

`enabled` and `run` both call `ctx.sessions.current()`. The command outlives the render that registered it, so a session switch between registration and the click would otherwise act on a stale session. This is the same rule the SDK states for every route-dependent action.

## Before publishing

1. **Name check** — `opencode-desktop-cd` was unclaimed on npm as of 2026-11-20. Re-check.
2. `npm run check` at the repository root, then `npm publish -w packages/opencode-desktop-cd`.
3. **Verify the published package**: `opencode plugin add opencode-desktop-cd` in a clean config, restart, run `/cd`. The tarball has no dependencies; `files` ships `dist/gui-experimental.cjs`, `src/index.js`, `README.md`, `LICENSE`.
4. `dist/` is committed and `prepublishOnly` fails on a dirty bundle.

## Verification

```sh
npm run build -w opencode-desktop-cd
opencode plugin list | grep desktop-cd
grep desktop-cd ~/.local/share/opencode/log/opencode.log | tail
```

The binary is `/Users/odt/.opencode/bin/opencode` (`opencode` is not on `PATH` by default).
