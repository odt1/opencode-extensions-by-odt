import { Plugin, Style } from "@opencode/plugin/gui"
import css from "./gui/markdown.css?inline"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, css)
  },
})
