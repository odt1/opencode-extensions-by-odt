import { Plugin, Style } from "@opencode/plugin/gui"
import { backgroundCss } from "./background"

export default Plugin.define({
  setup(ctx) {
    const css = backgroundCss(ctx.options)

    if (css) ctx.add(Style, css)
  },
})
