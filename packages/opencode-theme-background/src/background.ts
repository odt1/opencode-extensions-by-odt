import type { PluginOptions } from "@opencode/plugin/gui"

/**
 * The plugin's `options` from `opencode.json`:
 *
 * ```jsonc
 * {
 *   "plugins": [
 *     {
 *       "package": "opencode-theme-background",
 *       "options": {
 *         "light": "#f5f0e8",
 *         "dark": "#0b0b0b",
 *         "deep": { "light": "#ece5da", "dark": "#080808" },
 *         "layers": {
 *           "light": ["#e8e0d4", "#ddd4c6", "#d2c8b8", "#c7bcab"],
 *           "dark": ["#1a1a1a", "#242424", "#2e2e2e", "#3a3a3a"]
 *         }
 *       }
 *     }
 *   ]
 * }
 * ```
 */
export interface BackgroundOptions {
  /** Background for light mode. */
  readonly light?: string
  /** Background for dark mode. */
  readonly dark?: string
  /** The deeper background behind the base, per mode. */
  readonly deep?: { readonly light?: string; readonly dark?: string }
  /** Raised-surface colors, up to four per mode, for `layer-01` … `layer-04`. */
  readonly layers?: { readonly light?: readonly string[]; readonly dark?: readonly string[] }
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const list = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined

  const colors = value.map(text).filter((color): color is string => color !== undefined)

  return colors.length > 0 ? colors : undefined
}

/**
 * Builds the stylesheet that overrides the background tokens of whichever theme
 * is selected. Returns an empty string when no color is configured.
 *
 * The app's CSS reads the newer token set, so the base background is
 * `--v2-background-bg-base`, not the legacy `--background-base`. The
 * `[data-color-scheme]` attribute is set by the theme engine on every theme
 * change, so these rules follow light and dark without replacing the theme.
 */
export function backgroundCss(options: PluginOptions): string {
  const light = text(options.light)
  const dark = text(options.dark)
  const deep = record(options.deep)
  const layers = record(options.layers)

  const rules: string[] = []

  if (light) rules.push(`:root[data-color-scheme="light"] { --v2-background-bg-base: ${light}; }`)
  if (dark) rules.push(`:root[data-color-scheme="dark"] { --v2-background-bg-base: ${dark}; }`)

  const deepLight = text(deep.light)
  const deepDark = text(deep.dark)

  if (deepLight) rules.push(`:root[data-color-scheme="light"] { --v2-background-bg-deep: ${deepLight}; }`)
  if (deepDark) rules.push(`:root[data-color-scheme="dark"] { --v2-background-bg-deep: ${deepDark}; }`)

  for (const mode of ["light", "dark"] as const) {
    const colors = list(layers[mode])

    if (!colors) continue

    colors.slice(0, 4).forEach((color, index) => {
      rules.push(`:root[data-color-scheme="${mode}"] { --v2-background-bg-layer-0${index + 1}: ${color}; }`)
    })
  }

  if (rules.length === 0) return ""

  // The theme engine also sets an inline background-color on <html>; !important
  // is the only way a stylesheet beats an inline style.
  rules.push(`html { background-color: var(--v2-background-bg-base) !important; }`)

  return rules.join("\n")
}
