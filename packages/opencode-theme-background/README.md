# opencode-theme-background

Override the background color of **any** OpenCode Desktop theme, without replacing the theme. Pick Catppuccin, Tokyonight, Gruvbox, or any other theme in **Settings → Appearance → Theme**; this plugin only repaints the background.

Part of [opencode-extensions-by-odt](https://github.com/odt1/opencode-extensions-by-odt).

## Why a plugin

Desktop themes are not files on disk. There is no `~/.config/opencode/themes` for Desktop — that directory belongs to the CLI, whose theme format is different. A Desktop theme is a `Theme` contribution from a GUI plugin, so the only way to adjust one is a plugin that injects CSS on top of it.

This plugin does not ship a theme. It contributes a `Style` that overrides the background tokens of whichever theme is selected.

## Install

This plugin does nothing until it is given at least one colour, so add it with options:

```jsonc
// ~/.config/opencode/opencode.json
{
  "plugins": [
    {
      "package": "opencode-theme-background",
      "options": {
        "light": "#f5f0e8",
        "dark": "#0b0b0b"
      }
    }
  ]
}
```

Restart OpenCode Desktop once. Switch it off without removing it in **Settings → Extensions → Plugins**.

OpenCode Desktop **2.3.0** or newer: GUI plugins arrived in 2.2.0 and their API is still experimental (`./gui-experimental`).

### From a clone

The built bundle is committed at `dist/gui-experimental.cjs`, so a checkout needs no build step and no `npm install`:

```sh
git clone https://github.com/odt1/opencode-extensions-by-odt ~/Projects/opencode-extensions-by-odt
```

```jsonc
// ~/.config/opencode/opencode.json
{
  "plugins": [
    {
      "package": "/Users/you/Projects/opencode-extensions-by-odt/packages/opencode-theme-background",
      "options": { "light": "#f5f0e8", "dark": "#0b0b0b" }
    }
  ]
}
```

`npm install` at the repository root is only needed to work on the plugin; `npm run dev -w opencode-theme-background` then rebuilds on save and hot-reloads every window.

## Options

| Option | Type | Meaning |
|---|---|---|
| `light` | string | Background for light mode. |
| `dark` | string | Background for dark mode. |
| `deep` | `{ light?, dark? }` | The deeper background behind the base. |
| `layers` | `{ light?: string[], dark?: string[] }` | Up to four raised-surface colors, for `layer-01` … `layer-04`. |

At least one of `light` or `dark` is required; without one the plugin does nothing. Values can be hex, `var(--v2-grey-1100)`, or any CSS color.

Example with the full surface stack:

```jsonc
{
  "plugins": [
    {
      "package": "opencode-theme-background",
      "options": {
        "light": "#f5f0e8",
        "dark": "#0b0b0b",
        "deep": { "light": "#ece5da", "dark": "#080808" },
        "layers": {
          "light": ["#e8e0d4", "#ddd4c6", "#d2c8b8", "#c7bcab"],
          "dark": ["#1a1a1a", "#242424", "#2e2e2e", "#3a3a3a"]
        }
      }
    }
  ]
}
```

Overriding only `base` and `deep` keeps the theme's raised surfaces intact. Overriding every layer flattens the UI; it is opt-in for a reason.

## How it works

The app's CSS reads the newer token set, so the background is `--v2-background-bg-base`, not the legacy `--background-base`:

- `overrides: { "background-base": "#0b0b0b" }` in a theme writes the legacy token and only affects legacy surface blending.
- `--v2-background-bg-base` is what actually repaints the app.

The theme engine sets `data-color-scheme="light"` or `"dark"` on `<html>` on every theme change, so the plugin's rules follow light and dark without replacing the theme:

```css
:root[data-color-scheme="light"] { --v2-background-bg-base: #f5f0e8; }
:root[data-color-scheme="dark"]  { --v2-background-bg-base: #0b0b0b; }
```

The theme engine also sets an inline `background-color` on `<html>` (`#080808`/`#fafafa`), which a theme cannot change. The plugin adds:

```css
html { background-color: var(--v2-background-bg-base) !important; }
```

`!important` is required to beat the inline style. Without it, the main surfaces repaint but the html color still shows at overscroll and transparent edges.

### Why the npm name is not `opencode-themes`

`opencode-themes` was already taken on npm (1.0.2) when this was packaged, so the package is `opencode-theme-background`. The plugin id is the same string as the package name, because it prefixes every contribution id and stored key the plugin creates.

## Develop

```sh
npm install                # once, at the repository root
npm run build -w opencode-theme-background      # one bundle: dist/gui-experimental.cjs
npm run dev -w opencode-theme-background        # same, on every save
npm run typecheck -w opencode-theme-background  # tsc --noEmit
npm test -w opencode-theme-background           # node --test, the CSS builder
```

The GUI must build to a single CommonJS file, so the bundle is produced by `@opencode/plugin/gui/vite`, which inlines dynamic imports and keeps the app's shared modules external.

## Licence

MIT — see [LICENSE](LICENSE).
