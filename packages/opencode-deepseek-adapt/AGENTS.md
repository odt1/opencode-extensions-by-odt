# Notes for whoever works on this next

Context that is not visible from the code. The design rationale lives in `README.md`; `MODEL-DRIVING.md` is the full three-harness comparison the plugin came out of. This file is only what an editor of the code needs.

## Shape

```
src/index.js          the whole plugin: one default `{ id, setup }` object
test/smoke.mjs        node --test-free assertion runner against a fake plugin context
```

- No dependencies, no build step, no bundler. `@opencode/plugin` is deliberately **not** imported at runtime: the module schema in `core/plugin/module.ts` only requires `default` to be `{ id, setup }`, and `Plugin.define` is an identity function. Keeping the import out is what makes the npm tarball 30 KB instead of 250 MB. It is a devDependency for `tsc` only.
- `npm run typecheck` runs `tsc` over the JavaScript (`checkJs`). Annotate the boundary — `setup(ctx)` and every helper that receives `ctx` — with `import("@opencode/plugin").Plugin.Context`. Without that annotation the helpers take `any`, and the checker stops proving anything: it once passed a `(await ctx.session.context(...))?.data` that read `.data` off an array.
- Every hook body goes through `guard()`, which logs once and swallows. A plugin bug must never fail a model request.
- Options are validated in `resolveOptions`. A wrong type, a value under the minimum, or an unknown `dialectMode` falls back to the default instead of throwing.
- Per-session maps are capped at 500 entries. Do not add an uncapped `Map` keyed by session or message id.
- Text quoted back into a `<system-reminder>` frame is escaped in one place. Do not interpolate raw tool arguments anywhere else.

## Tests

```sh
npm test -w opencode-deepseek-adapt
```

35 cases, no OpenCode process, no network. New behaviour belongs in `test/smoke.mjs`; the failures it catches are the silent ones (a nudge that fires twice, a prompt addition that is not idempotent, an escaping hole).

## Before publishing

1. **Name check** — `opencode-deepseek-adapt` was unclaimed on npm as of 2026-11-20. Re-check.
2. `npm run check` at the repository root, then `npm publish -w packages/opencode-deepseek-adapt`.
3. **Verify the published package**: `opencode plugin add opencode-deepseek-adapt` in a clean config, restart, confirm the dialect marker appears in a DeepSeek request.
4. `files` ships `src/index.js`, `README.md`, `MODEL-DRIVING.md`, `LICENSE`. There is no `dist/` to keep current — which is why a stale-bundle check is not needed here.
