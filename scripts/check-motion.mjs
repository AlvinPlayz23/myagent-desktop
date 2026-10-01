#!/usr/bin/env node
/**
 * Motion guardrails for the renderer.
 *
 * Every rule here exists because the app shipped the opposite of it and felt
 * heavy because of it. Run with `node scripts/check-motion.mjs` (or
 * `npm run lint:motion`). Exits non-zero when something drifts back.
 *
 * Rules
 *   1. No animated blur. An animated `filter` is re-rasterized every frame and
 *      cannot be composited; inside this window (translucent shell, blurred
 *      sidebar) that was the single most expensive thing the renderer did.
 *      Opt out per line with `motion:allow-blur` — reserve it for a one-shot
 *      celebration on a small element.
 *   2. No static will-change. A hint belongs on an element that lives only as
 *      long as its animation; Chromium promotes on animation start anyway.
 *      Opt out per line with `motion:allow-will-change`.
 *   3. Nothing above 250ms on an interaction path. Longer values are allowed
 *      for the deliberate celebration token families, or with a per-line
 *      `motion:allow-long`.
 *   4. No `AnimatePresence mode="wait"`. A waiting exit runs to completion
 *      before the entrance starts, which is what made a tab switch cost half a
 *      second. Use popLayout so both halves overlap.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RENDERER = join(ROOT, 'src', 'renderer', 'src')

/** Popups that exist only while their own open/close transition runs. */
const WILL_CHANGE_OK_DIRS = [join(RENDERER, 'components', 'ui')]
/** Token families that are deliberate, one-shot celebrations. They may exceed the
 * budget because a celebration is the point — but only animation timing. Static
 * cadences (think/reason/matrix/stream) are excluded from the duration rule
 * separately below via NOT_A_TRANSITION. */
const LONG_OK_TOKENS = /^--(check|badge|digit|avatar|tilt|stack|toast|reel|revert|clear|pulse|reveal|shimmer|morph|like|toggle)-/
/** Token namespaces that are cadences, not transition durations. */
const NOT_A_TRANSITION = /^--(think|reason|matrix|stream)-/
const MAX_MS = 250
const MAX_SECONDS = MAX_MS / 1000

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

const FILES = walk(RENDERER)
const isUiPrimitive = (file) => WILL_CHANGE_OK_DIRS.some((dir) => file.startsWith(dir))

for (const file of FILES) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const at = (index) => `${rel(file)}:${text.slice(0, index).split('\n').length}`
  const marked = (index, kind) => {
    const start = text.slice(0, index).split('\n').length
    const lines = text.split(/\r?\n/)
    // Check the declaration line itself and, for CSS, up to 12 lines above it:
    // a marker for a celebration lives on the rule's own line (the first line of
    // the block), and 12 covers the distance to the transition block inside it.
    return Array.from({ length: 13 }, (_, i) => start - 12 + i)
      .map((n) => lines[n - 1])
      .filter(Boolean)
      .some((line) => line.includes(`motion:allow-${kind}`))
  }
  const isCss = file.endsWith('.css')

  // 1a. A CSS transition that includes the `filter` property.
  for (const match of text.matchAll(/\btransition(?:-property)?\s*:\s*([^;{}]*);/g)) {
    // `backdrop-filter` must not count as `filter`.
    if (/(^|[\s,])filter\b/.test(match[1]) && !marked(match.index, 'blur')) {
      violations.push(`${at(match.index)}  transition includes \`filter\` — not compositable`)
    }
  }

  // 1b. A blur utility animated alongside a transition utility on one element.
  if (!isCss) {
    for (const [i, line] of lines.entries()) {
      const animated = /transition-|duration-|animate-/.test(line)
      const blurred = /(?<!backdrop-)blur-(\[|\d|none)/.test(line)
      if (animated && blurred && !line.includes('motion:allow-blur')) {
        violations.push(`${rel(file)}:${i + 1}  blur utility on an element that transitions`)
      }
    }
  }

  // 1c. motion variants carrying a blur filter.
  for (const match of text.matchAll(/\bfilter:\s*[`']([^`']*)\bblur\(/g)) {
    if (!marked(match.index, 'blur')) {
      violations.push(`${at(match.index)}  motion variant animates blur: ${match[1].trim()}`)
    }
  }

  // 2. Static will-change.
  if (isCss) {
    for (const match of text.matchAll(/^[ \t]*will-change\s*:/gm)) {
      if (!marked(match.index, 'will-change')) {
        violations.push(`${at(match.index)}  static will-change in a class rule`)
      }
    }
  } else if (!isUiPrimitive(file)) {
    for (const [i, line] of lines.entries()) {
      if (/will-change|willChange/.test(line) && !line.includes('motion:allow-will-change')) {
        violations.push(`${rel(file)}:${i + 1}  will-change on a long-lived element`)
      }
    }
  }

  // 3a. Long CSS duration tokens.
  if (isCss) {
    for (const match of text.matchAll(/^[ \t]*(--[a-z0-9-]+)\s*:\s*([\d.]+)(ms|s)\s*;/gm)) {
      const [, name, value, unit] = match
      if (!/(duration|dur|delay|hold|stagger)/.test(name)) continue
      if (NOT_A_TRANSITION.test(name) || LONG_OK_TOKENS.test(name)) continue
      const length = unit === 's' ? parseFloat(value) * 1000 : parseFloat(value)
      if (length > MAX_MS && !marked(match.index, 'long')) {
        violations.push(`${at(match.index)}  ${name}: ${value}${unit} is over ${MAX_MS}ms`)
      }
    }
  }

  // 3b. Long numeric motion durations. Values are seconds in this codebase.
  // Generated Base-UI primitives under components/ui/ are third-party furniture
  // that mount and unmount around their own transitions, so they are exempt.
  if (!isCss && !isUiPrimitive(file)) {
    for (const [i, line] of lines.entries()) {
      if (line.includes('motion:allow-long')) continue
      for (const m of line.matchAll(/duration:\s*([\d.]+)/g)) {
        if (parseFloat(m[1]) > MAX_SECONDS && parseFloat(m[1]) <= 5) {
          violations.push(`${rel(file)}:${i + 1}  duration ${m[1]} (s) is over ${MAX_MS}ms`)
        }
      }
    }
  }

  // 1d. Tailwind duration utilities above the budget.
  if (!isCss && !isUiPrimitive(file)) {
    for (const [i, line] of lines.entries()) {
      if (line.includes('motion:allow-long')) continue
      for (const m of line.matchAll(/duration-(\d{3,})\b/g)) {
        if (parseInt(m[1], 10) > MAX_MS) {
          violations.push(`${rel(file)}:${i + 1}  duration-${m[1]} is over ${MAX_MS}ms`)
        }
      }
    }
  }

  // 4. AnimatePresence mode="wait" serialises exit + entrance.
  for (const match of text.matchAll(/mode="wait"/g)) {
    violations.push(`${at(match.index)}  mode="wait" — use popLayout so they overlap`)
  }
}

if (violations.length) {
  console.error(`check-motion: ${violations.length} violation(s) in ${FILES.length} files\n`)
  for (const v of violations) console.error(`  ${v}`)
  console.error('\nSee the rule list at the top of scripts/check-motion.mjs.')
  process.exit(1)
}
console.log(`check-motion: clean (${FILES.length} files)`)

