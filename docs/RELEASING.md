# Releasing

Five independent npm packages ship from this repository. Nothing is automated: no release workflow, no token in the repository. Publishing is a local `npm publish`, run by the maintainer.

## 1. Before the first publish

- [ ] `npm login` — this machine was not authenticated to npm as of 2026-11-20 (`npm whoami` → `ENEEDAUTH`).
- [ ] Re-check every name. Names can be taken at any time, and a taken name is the one failure that cannot be undone after publish:

  ```sh
  for p in opencode-desktop-cd opencode-status-pill opencode-theme-background opencode-desktop-markdown-colors opencode-deepseek-adapt; do
    printf '%-30s ' "$p"; npm view "$p" version 2>&1 | tail -1
  done
  ```

  As of 2026-11-20: `opencode-cd` is taken (0.1.0) and `opencode-themes` is taken (1.0.2); the four names above are free.

- [ ] Confirm the repository is public. `repository`, `homepage` and `bugs` in every `package.json` point at `github.com/odt1/opencode-extensions-by-odt`; a private repo makes those links 404 for every consumer.

## 2. Check the tree

```sh
npm ci
npm run check          # typecheck + tests + build + "is the committed dist current?"
npm pack --workspaces --dry-run
```

`npm pack --dry-run` is the honest view of what ships. Expected contents per package:

| Package | Ships |
|---|---|
| `opencode-desktop-cd` | `dist/gui-experimental.cjs`, `src/index.js`, `README.md`, `LICENSE`, `package.json` |
| `opencode-status-pill` | same |
| `opencode-theme-background` | same |
| `opencode-desktop-markdown-colors` | same |
| `opencode-deepseek-adapt` | `src/index.js`, `README.md`, `MODEL-DRIVING.md`, `LICENSE`, `package.json` |

None of them declare a runtime dependency. The GUI packages need `@opencode/plugin` only to build, and the app supplies the module at runtime, so a consumer installs kilobytes rather than the client SDK.

## 3. Publish

One package at a time, so a failure is attributable:

```sh
npm publish -w packages/opencode-desktop-cd
npm publish -w packages/opencode-status-pill
npm publish -w packages/opencode-theme-background
npm publish -w packages/opencode-desktop-markdown-colors
npm publish -w packages/opencode-deepseek-adapt
```

`prepublishOnly` runs in each package and blocks the publish if typecheck, tests, or the rebuilt-bundle comparison fails. `--access public` is unnecessary: none of the names are scoped.

Then tag the release once, after all five are up:

```sh
git tag -a v0.1.0 -m "first public release" && git push origin v0.1.0
```

Later releases bump only the packages that changed, with their own tags (`opencode-status-pill@0.2.0`), so the tag says which package moved.

Finally, remove the **"Release status: not on npm yet"** note at the top of the root README's Install section, and commit that with the tag.

## 4. Verify the published packages, not the local ones

A clean config is the only proof. In a temporary `XDG_CONFIG_HOME` (or by backing up `~/.config/opencode/opencode.json`):

```sh
opencode plugin add opencode-status-pill
opencode plugin list
```

Restart OpenCode Desktop and confirm the pill appears. Repeat for `/cd`, the background override, and the DeepSeek adaptation (check for the `(deepseek-adapt)` marker in the request, as the package's `AGENTS.md` describes).

A published package is installed under `~/.cache/opencode/npm/`, so editing it on disk changes nothing. Re-publish, or use a local path while developing.

## 5. awesome-opencode

The list takes one YAML file per entry in `data/plugins/`, submitted as a pull request. Drafts for all five are in [`awesome-opencode/`](awesome-opencode). The rules, checked against `contributing.md` on 2026-11-20:

- **Public** repo, working links.
- **Maintained** — not archived, a commit in the last 90 days.
- **Traction** — **at least 25 stars**, and the repository **at least 30 days old**.
- **Complete** — valid YAML, `tagline` ≤ 120 characters, one file in the right folder.
- README.md is generated; do not edit it.

The repository was created on 2026-11-20, so it is eligible on **2026-12-20** at the earliest, and only with 25 stars. Submitting before then is rejected on rule 5, not on merit — wait, then send all five in one PR (one YAML each) so the entry set stays coherent.

A subdirectory entry is supported: `repo:` points at `.../tree/main/packages/<name>`, as Caspian and OpenWork already do.
