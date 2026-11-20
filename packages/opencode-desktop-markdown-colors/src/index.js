import { Plugin } from "@opencode/plugin"

// The desktop app only loads a plugin's GUI when its server part loads, so this
// file exists to keep that true. It does nothing else.
export default Plugin.define({
  id: "markdown-colors",
  setup() {},
})
