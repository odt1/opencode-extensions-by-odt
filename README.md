# opencode-extensions-by-odt

Four [OpenCode](https://opencode.ai) plugins, maintained in one repository: a `/cd` command for Desktop, a session status pill, a theme background override, and a DeepSeek behaviour adaptation.

All four target **OpenCode V2**. Three are **Desktop** GUI plugins and need OpenCode Desktop 2.3.0 or newer; the DeepSeek adaptation is a server plugin and works in any V2 client.

| Plugin | What it does | Where it shows |
|---|---|---|
| [opencode-desktop-cd](packages/opencode-desktop-cd) | `/cd` moves the current session to another directory, and with it to that directory's project — the command the CLI has and Desktop does not | Desktop |
| [opencode-status-pill](packages/opencode-status-pill) | Context fill, cache hit rate and OpenRouter balance in the pill row above the composer | Desktop |
| [opencode-theme-background](packages/opencode-theme-background) | Repaints the background of whichever theme is selected, without replacing the theme | Desktop |
| [opencode-deepseek-adapt](packages/opencode-deepseek-adapt) | DeepSeek-tuned prompt doctrine, subagent hand-off, repeat-call guard, clock, todo nudge, empty-reply recovery | CLI and Desktop |

## Install

Each plugin is its own npm package. Install the ones you want:

```sh
opencode plugin add opencode-desktop-cd
opencode plugin add opencode-status-pill
opencode plugin add opencode-theme-background
opencode plugin add opencode-deepseek-adapt
```

`opencode plugin add` writes the package into the global `plugins` array in `~/.config/opencode/opencode.json`. Restart OpenCode once after the first install.

Packages that take options (`opencode-theme-background`, `opencode-status-pill`, `opencode-deepseek-adapt`) need the object form in `opencode.json` instead, because the string form cannot carry options:

```jsonc
// ~/.config/opencode/opencode.json
{
  "plugins": [
    "opencode-desktop-cd",
    { "package": "opencode-theme-background", "options": { "light": "#f5f0e8", "dark": "#0b0b0b" } }
  ]
}
```

Options, requirements and caveats are in each package's README, linked above.

### Installing from a clone

Every package also works from a local checkout — useful for development, or when you want to pin exactly what you are running. The GUI bundles are committed, so a clone only needs the one runtime dependency:

```sh
git clone https://github.com/odt1/opencode-extensions-by-odt ~/Projects/opencode-extensions-by-odt
cd ~/Projects/opencode-extensions-by-odt && npm install --omit=dev --workspaces
```

Then point `opencode.json` at the package directory, by absolute path:

```jsonc
{
  "plugins": [
    "/Users/you/Projects/opencode-extensions-by-odt/packages/opencode-desktop-cd",
    "/Users/you/Projects/opencode-extensions-by-odt/packages/opencode-status-pill"
  ]
}
```

A bare directory path is not something `opencode plugin add` accepts — it takes a registry or Git specifier — so this route is a config edit.

## How the repository is laid out

```
packages/
  opencode-desktop-cd/        GUI plugin: /cd command
  opencode-status-pill/       GUI plugin: composer pill
  opencode-theme-background/  GUI plugin: background Style
  opencode-deepseek-adapt/    server plugin: request-time prompt additions
```

One npm package per directory. npm workspaces hoist a single install and a single lockfile to the root; every package is versioned and published independently.

The three GUI plugins follow the same shape: a server part (`src/index.js`) that exists only because Desktop loads a plugin's GUI only when its server part loads, and a `./gui-experimental` bundle built by `@opencode/plugin/gui/vite` into one CommonJS file at `dist/gui-experimental.cjs`. That bundle is committed, because `opencode plugin add` installs with lifecycle scripts disabled — a `prepare` script would never run.

`packages/*/AGENTS.md` holds the notes that are not visible from the code: API findings, SDK traps, and why each decision was made. `docs/` holds the release checklist and ready-to-submit list entries.

## Development

```sh
npm install          # one install for every workspace
npm run check        # typecheck + tests + build + "is the committed dist current?"
npm run build        # rebuild every GUI bundle (or: npm run dev -w <package>, watch mode)
npm test             # node --test, no browser and no OpenCode process needed
```

Node 22.18 or newer: the tests are TypeScript run through Node's own type stripping, and the GUI build uses Vite 7.

## Licence

MIT — see [LICENSE](LICENSE). Every package carries its own copy, because npm only includes a licence file that sits inside the package directory.
