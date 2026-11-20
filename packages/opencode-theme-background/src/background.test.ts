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
