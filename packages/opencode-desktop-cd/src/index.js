// The desktop app loads a plugin's GUI only when its server part loads, so this
// file exists to keep that true. It does nothing else.
//
// A plain object rather than `Plugin.define`: that helper is an identity
// function, and importing it would make `@opencode/plugin` — which brings the
// whole client SDK, AWS, Redis and OpenTelemetry — a runtime dependency of a
// package that needs nothing at runtime. The GUI bundle keeps `@opencode/*`
// external and gets them from the app, so only the build needs the types.
export default {
  id: "cd",
  setup() {},
}
