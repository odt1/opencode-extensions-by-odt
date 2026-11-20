# opencode-desktop-cd

`/cd` for OpenCode Desktop: move the current session to another directory, which also moves it to that directory's project.

The CLI has `/cd` built in (`session.cd`). The desktop app does not, so this plugin adds the same command there.

Part of [opencode-extensions-by-odt](https://github.com/odt1/opencode-extensions-by-odt).

## Usage

In the composer of a session:

```
/cd /Users/you/Projects/other-project
/cd ~/Projects/other-project
/cd ../sibling-project
```

- No argument: `/cd` alone opens the native folder picker.
- `~`, `~/…` and relative paths are resolved by the server, exactly as for the CLI: relative paths against the session's current directory.
- A running session is not refused: the server admits the move and applies it at the next step boundary. The toast says so instead of claiming the session already moved.

The same command is in the command palette as **Change working directory** (section: Session), so you can bind a key in Settings › Shortcuts.

## Install

```sh
opencode plugin add opencode-desktop-cd
```

Restart OpenCode Desktop once. Switch it off without removing it in **Settings → Extensions → Plugins**.

`/cd` is a GUI plugin, so it needs OpenCode Desktop **2.3.0** or newer. GUI plugins arrived in 2.2.0 and their API is still experimental (`./gui-experimental`), so a future release may change it.

### From a clone

Useful for development, or to pin exactly what you run. The GUI bundle is committed, so a clone needs no build and no install:

```sh
git clone https://github.com/odt1/opencode-extensions-by-odt ~/Projects/opencode-extensions-by-odt
```

```jsonc
// ~/.config/opencode/opencode.json
{ "plugins": ["/Users/you/Projects/opencode-extensions-by-odt/packages/opencode-desktop-cd"] }
```

A bare directory path is not something `opencode plugin add` accepts, which is why this route is a config edit.

## How it works

A GUI plugin (`./gui-experimental`) registers one `Command` with `slash: { name: "cd", arguments: true }` and `enabled` bound to the mounted session. On run it:

1. reads the mounted session from `ctx.sessions.current()`;
2. takes the argument, or picks a folder through `ctx.desktop.pick`;
3. for an absolute path, warms the client's location cache with `server.data.location.syncInfo` so the destination's screen does not flash as unavailable;
4. calls `server.client.session.move({ sessionID, directory })` — the same `POST /api/session/{id}/move` the CLI uses — with `ctx.signal` so a plugin reload aborts it;
5. reports success, the queued move, or the server's error as a toast.

`src/index.js` is an empty server part: the desktop app loads a plugin's GUI only when its server part loads.

### Why not validate the path first

The move endpoint resolves `~`, relative paths, existence and directory-ness itself, and returns specific errors ("Directory does not exist", "Not a directory", "Directory is unavailable"). Resolving in the window would disagree with it: a window cannot expand `~` (no Node built-ins), and `location.get` rejects a `~` path that `session.move` accepts.

### Why the npm name is not `opencode-cd`

`opencode-cd` was taken (a TUI plugin that also changes the session directory). The plugin id inside the package is independent of the npm name, so the package could be renamed again without changing contribution ids.

## Development

```sh
npm install                # once, at the repository root
npm run build -w opencode-desktop-cd
npm run dev -w opencode-desktop-cd     # rebuild on save
npm run typecheck -w opencode-desktop-cd
```

The app reloads the GUI on every rebuild. Adding the plugin for the first time needs View › Reload Webview.

The GUI must build to a single CommonJS file, so the bundle is produced by `@opencode/plugin/gui/vite`, which inlines dynamic imports and keeps the app's shared modules external. The bundle is committed, so `opencode plugin add` — which installs with lifecycle scripts disabled — gets a working plugin without a build.

## Licence

MIT — see [LICENSE](LICENSE).
