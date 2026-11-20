import assert from "node:assert/strict"
import { test } from "node:test"
import { backgroundCss } from "./background.ts"

// Options arrive from `opencode.json` unvalidated, so the tests feed values that
// the option type says cannot happen. The cast is the point of the helper.
const css = (options: Record<string, unknown>) =>
  backgroundCss(options as Parameters<typeof backgroundCss>[0])

test("no colour configured produces no stylesheet", () => {
  assert.equal(css({}), "")
  assert.equal(css({ light: "  ", dark: undefined, layers: {} }), "")
})

test("one mode writes that mode's base rule plus the html override", () => {
  assert.equal(
    css({ light: "#f5f0e8" }),
    [`:root[data-color-scheme="light"] { --v2-background-bg-base: #f5f0e8; }`,
     `html { background-color: var(--v2-background-bg-base) !important; }`].join("\n"),
  )
})

test("both modes stay independent", () => {
  const out = css({ light: "#fafafa", dark: "#0b0b0b" })
  assert.match(out, /data-color-scheme="light".*#fafafa/)
  assert.match(out, /data-color-scheme="dark".*#0b0b0b/)
  assert.equal(out.match(/html \{/g)?.length, 1)
})

test("deep overrides the deeper background, not the base", () => {
  const out = css({ dark: "#0b0b0b", deep: { dark: "#080808" } })
  assert.match(out, /--v2-background-bg-deep: #080808/)
  assert.doesNotMatch(out, /data-color-scheme="light"/)
})

test("layers map to layer-01 … layer-04 and extras are dropped", () => {
  const out = css({ dark: "#0b0b0b", layers: { dark: ["#1a1a1a", "#242424", "#2e2e2e", "#3a3a3a", "#444444", "#555555"] } })
  for (const [index, colour] of ["#1a1a1a", "#242424", "#2e2e2e", "#3a3a3a"].entries()) {
    assert.match(out, new RegExp(`--v2-background-bg-layer-0${index + 1}: ${colour};`))
  }
  assert.doesNotMatch(out, /#444444|#555555/)
})

test("a layer list with no usable colours is ignored", () => {
  assert.equal(css({ layers: { light: [1, null, "  "] } }), "")
})

test("values can be CSS variables and are trimmed", () => {
  const out = css({ light: "  var(--v2-grey-1000)  " })
  assert.match(out, /--v2-background-bg-base: var\(--v2-grey-1000\);/)
})

test("wrongly typed input falls back to doing nothing instead of throwing", () => {
  assert.equal(css({ light: 42, dark: ["#000"], deep: "nope", layers: "nope" }), "")
  assert.equal(css({ layers: { dark: "#0b0b0b" } }), "")
})

test("a value that would close the rule is ignored", () => {
  // `opencode.json` is JSON: any string can arrive, and one stray brace would
  // take the rest of the override with it.
  assert.equal(css({ light: "red; } body { display: none }" }), "")
  assert.equal(css({ dark: "#000\n}" }), "")

  // Only the bad declaration disappears; the valid one beside it stays.
  const mixed = css({ dark: "#000", deep: { dark: "rgb(0 0 0);}" } })
  assert.match(mixed, /--v2-background-bg-base: #000;/)
  assert.doesNotMatch(mixed, /bg-deep/)
})

test("a rejected layer is dropped without taking its siblings", () => {
  const out = css({ dark: "#0b0b0b", layers: { dark: ["#1a1a1a", "bad}", "#2e2e2e"] } })
  assert.match(out, /layer-01: #1a1a1a/)
  assert.match(out, /layer-02: #2e2e2e/)
  assert.doesNotMatch(out, /bad/)
})

test("legal functional colours survive the guard", () => {
  const out = css({ light: "color-mix(in oklch, white 80%, black)", dark: "rgb(11 11 11 / 95%)" })
  assert.match(out, /--v2-background-bg-base: color-mix\(in oklch, white 80%, black\);/)
  assert.match(out, /--v2-background-bg-base: rgb\(11 11 11 \/ 95%\);/)
})
