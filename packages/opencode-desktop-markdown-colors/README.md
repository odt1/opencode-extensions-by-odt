# opencode-desktop-markdown-colors

CLI-style markdown colors for **OpenCode Desktop**. Headings, inline code, links, list markers, quotes and rules follow the active theme instead of rendering as one flat text color.

Part of [opencode-extensions-by-odt](https://github.com/odt1/opencode-extensions-by-odt).

## Why this exists

OpenCode Desktop's theme engine already emits the CLI's markdown tokens on `:root`:

```
--markdown-heading, --markdown-text, --markdown-link, --markdown-link-text,
--markdown-code, --markdown-block-quote, --markdown-emph, --markdown-strong,
--markdown-horizontal-rule, --markdown-list-item, --markdown-list-enumeration,
--markdown-image, --markdown-image-text, --markdown-code-block
```

But the app's markdown stylesheet never reads them. In `main-*.css`:

```css
[data-component=markdown] h1 { color: var(--v2-text-text-base); }
[data-component=markdown] :not(pre)>code { color: var(--v2-text-text-base); opacity:.6; }
[data-component=markdown] li::marker { color: var(--v2-text-text-muted); }
```

`var(--markdown-heading)` appears zero times in the app's CSS or JS. So every theme changes the tokens and the transcript ignores them. This plugin injects one stylesheet that wires the tokens to the elements, scoped with `:root` to outrank the app's rules without `!important`.

## What it colors

| Element | Token |
|---|---|
| h1–h6 | `--markdown-heading` |
| inline code | `--markdown-code` |
| links | `--markdown-link` |
| bold | `--markdown-strong` |
| italic | `--markdown-emph` |
| list markers | `--markdown-list-item` / `--markdown-list-enumeration` |
| blockquote | `--markdown-block-quote` |
| horizontal rule | `--markdown-horizontal-rule` |

Reasoning blocks stay muted, as the app intends.

## Install

```sh
opencode plugin add opencode-desktop-markdown-colors
```

Restart OpenCode Desktop once. Switch it off without removing it in **Settings → Extensions → Plugins**.

Needs OpenCode Desktop **2.3.0** or newer: GUI plugins arrived in 2.2.0 and their API is still experimental (`./gui-experimental`).

### From a clone

The built bundle is committed at `dist/gui-experimental.cjs`, so a checkout needs no build step and no `npm install`:

```sh
git clone https://github.com/odt1/opencode-extensions-by-odt ~/Projects/opencode-extensions-by-odt
```

```jsonc
// ~/.config/opencode/opencode.json
{
  "plugins": ["/Users/you/Projects/opencode-extensions-by-odt/packages/opencode-desktop-markdown-colors"]
}
```

`npm install` at the repository root is only needed to work on the plugin; `npm run dev -w opencode-desktop-markdown-colors` then rebuilds on save and hot-reloads every window.

## Develop

```sh
npm install                # once, at the repository root
npm run build -w opencode-desktop-markdown-colors      # one bundle: dist/gui-experimental.cjs
npm run dev -w opencode-desktop-markdown-colors        # same, on every save
npm run typecheck -w opencode-desktop-markdown-colors  # tsc --noEmit
```

The GUI must build to a single CommonJS file, so the bundle is produced by `@opencode/plugin/gui/vite`, which inlines dynamic imports and keeps the app's shared modules external.

## Licence

MIT — see [LICENSE](LICENSE).
