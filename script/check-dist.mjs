#!/usr/bin/env node

// Fails when a committed GUI bundle is stale or untracked.
//
// A Node script rather than `test -z "$(git status ...)"`: npm runs scripts
// through cmd.exe on Windows, where `test` does not exist, so the shell form
// made `npm run check` and `npm publish` unusable there.
//
//   node script/check-dist.mjs              every packages/*/dist (repository root)
//   node script/check-dist.mjs dist         the caller's own bundle (a package)

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"

const packages = () => {
  if (!existsSync("packages")) return ["dist"]

  return readdirSync("packages", { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join("packages", entry.name, "dist")))
    .map((entry) => `packages/${entry.name}/dist`)
}

const args = process.argv.slice(2)
const spec = args.length > 0 ? args : packages()

if (spec.length === 0) process.exit(0)

let status
try {
  status = execFileSync("git", ["status", "--porcelain", "--", ...spec], { encoding: "utf8" })
} catch (error) {
  console.error(`dist check: git status failed: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}

if (status.trim() === "") process.exit(0)

console.error("dist check: these bundles are stale or untracked:")
console.error(status.trimEnd())
console.error("Rebuild and commit them before publishing.")
process.exit(1)
