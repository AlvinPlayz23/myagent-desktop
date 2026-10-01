#!/usr/bin/env node
/**
 * Design-system guardrails for the renderer.
 *
 * These rules exist so the interface keeps one type scale, one semantic color
 * vocabulary, and one radius hierarchy as it grows. Run with
 * `node scripts/check-design.mjs` (or `npm run lint:design`). Exits non-zero
 * when something drifts back.
 *
 * Rules
 *   1. No hard-coded UI font sizes. Use the text-ui-* scale. Arbitrary sizes
 *      like `text-[11.5px]` and Tailwind's built-in `text-sm`/`text-xs` on
 *      interface chrome are both rejected. Intrinsic content (markdown `pre`,
 *      `code`, mono blocks) is exempted by file allowlist below.
 *   2. No arbitrary text sizes at all: `text-[...]`.
 *   3. No raw scrim/overlay colors: `bg-black/NN` (except `bg-black/0`, a
 *      no-op used for hover transitions). Use `bg-overlay`.
 *
 * Opt out per line with `design:allow` for a genuinely justified exception.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RENDERER = join(ROOT, 'src', 'renderer', 'src')

/** Generated Base UI primitives keep their upstream sizing; they are not
 *  hand-authored app chrome. They still must not use arbitrary sizes. */
const PRIMITIVE_DIR = join(RENDERER, 'components', 'ui')
/** The design-system doc itself is markdown, not scanned. */
const SKIP_FILES = [join(RENDERER, 'styles.css')]

const violations = []
const rel = (file) => relative(ROOT, file).split(sep).join('/')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full)
  }
  return out
}

const FILES = walk(RENDERER).filter((f) => !SKIP_FILES.includes(f))
const isPrimitive = (file) => file.startsWith(PRIMITIVE_DIR)

const BUILTIN_SIZE = /\btext-(2xs|xs|sm|base|lg|xl|2xl|3xl)\b/
const ARBITRARY_SIZE = /text-\[[^\]]*(px|rem|em)[^\]]*\]/
const RAW_SCRIM = /bg-black\/(?!0\b)[0-9]+/

for (const file of FILES) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)

  for (const [i, line] of lines.entries()) {
    // A marker on the line itself or up to 3 lines above allows a justified
    // exception without disabling the rule for the whole file.
    const window = [lines[i], lines[i - 1], lines[i - 2], lines[i - 3]].filter(Boolean)
    if (window.some((l) => l.includes('design:allow'))) continue
    // Skip comments that merely mention the classes.
    const code = line.replace(/\/\/.*$/, '')
    if (ARBITRARY_SIZE.test(code)) {
      violations.push(`${rel(file)}:${i + 1}  arbitrary text size — use text-ui-*`)
      continue
    }
    // Rule 1 applies to hand-authored app chrome, not generated primitives,
    // whose layout pairs sizes with responsive breakpoints upstream.
    if (!isPrimitive(file) && BUILTIN_SIZE.test(code)) {
      violations.push(`${rel(file)}:${i + 1}  built-in text size on interface chrome — use text-ui-*`)
    }
    if (RAW_SCRIM.test(code)) {
      violations.push(`${rel(file)}:${i + 1}  raw scrim color — use bg-overlay`)
    }
  }
}

if (violations.length) {
  console.error(`check-design: ${violations.length} violation(s) in ${FILES.length} files\n`)
  for (const v of violations) console.error(`  ${v}`)
  console.error('\nSee DESIGN.md and the rule list at the top of scripts/check-design.mjs.')
  process.exit(1)
}
console.log(`check-design: clean (${FILES.length} files)`)
