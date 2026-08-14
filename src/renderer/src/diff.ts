import type { ToolRun } from './state'

// Client-side diff building for edit/write tool cards. Diffs are derived from
// the tool-call arguments (edits[].oldText/newText, write content), so line
// numbers are relative to each edit block rather than the file on disk.

export type DiffLineKind = 'ctx' | 'add' | 'del' | 'skip'

export interface DiffLine {
  kind: DiffLineKind
  oldNo?: number
  newNo?: number
  text: string
}

export interface DiffBlock {
  header?: string
  lines: DiffLine[]
}

export interface ToolDiff {
  additions: number
  deletions: number
  blocks: DiffBlock[]
}

// Cells above which the LCS table is not worth building; fall back to
// del-all/add-all so pathological inputs stay O(n).
const MAX_LCS_CELLS = 250_000

// Unchanged lines kept on each side of a change before the run is collapsed
// into a "N unchanged lines" separator.
const CONTEXT_LINES = 3

function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

// diffLines produces a line-level diff of oldText vs newText via a
// longest-common-subsequence walk, numbering lines 1..n within each side.
function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText)
  const b = splitLines(newText)
  const n = a.length
  const m = b.length
  const out: DiffLine[] = []

  if (n * m > MAX_LCS_CELLS) {
    a.forEach((text, i) => out.push({ kind: 'del', oldNo: i + 1, text }))
    b.forEach((text, i) => out.push({ kind: 'add', newNo: i + 1, text }))
    return out
  }

  const width = m + 1
  const dp = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1])
    }
  }

  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'ctx', oldNo: i + 1, newNo: j + 1, text: a[i] })
      i++
      j++
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      out.push({ kind: 'del', oldNo: i + 1, text: a[i] })
      i++
    } else {
      out.push({ kind: 'add', newNo: j + 1, text: b[j] })
      j++
    }
  }
  while (i < n) {
    out.push({ kind: 'del', oldNo: i + 1, text: a[i] })
    i++
  }
  while (j < m) {
    out.push({ kind: 'add', newNo: j + 1, text: b[j] })
    j++
  }
  return out
}

// collapseContext folds long runs of unchanged lines into a skip separator,
// keeping CONTEXT_LINES on each side — the GitHub "expand" band.
function collapseContext(lines: DiffLine[]): DiffLine[] {
  const out: DiffLine[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].kind !== 'ctx') {
      out.push(lines[i])
      i++
      continue
    }
    let j = i
    while (j < lines.length && lines[j].kind === 'ctx') j++
    const run = j - i
    if (run > CONTEXT_LINES * 2 + 1) {
      for (let k = i; k < i + CONTEXT_LINES; k++) out.push(lines[k])
      out.push({ kind: 'skip', text: `${run - CONTEXT_LINES * 2} unchanged lines` })
      for (let k = j - CONTEXT_LINES; k < j; k++) out.push(lines[k])
    } else {
      for (let k = i; k < j; k++) out.push(lines[k])
    }
    i = j
  }
  return out
}

// buildToolDiff derives a renderable diff for edit/write runs, or null when
// the tool has no diff representation (or the args are malformed).
export function buildToolDiff(run: ToolRun): ToolDiff | null {
  if (run.name === 'edit') {
    const edits = run.args.edits
    if (!Array.isArray(edits) || edits.length === 0) return null
    const blocks: DiffBlock[] = []
    let additions = 0
    let deletions = 0
    for (let i = 0; i < edits.length; i++) {
      const e = edits[i] as Record<string, unknown>
      const oldText = typeof e?.oldText === 'string' ? e.oldText : null
      const newText = typeof e?.newText === 'string' ? e.newText : null
      if (oldText === null || newText === null) return null
      const lines = diffLines(oldText, newText)
      for (const line of lines) {
        if (line.kind === 'add') additions++
        else if (line.kind === 'del') deletions++
      }
      blocks.push({
        header: edits.length > 1 ? `edit ${i + 1} of ${edits.length}` : undefined,
        lines: collapseContext(lines)
      })
    }
    return { additions, deletions, blocks }
  }

  if (run.name === 'write') {
    const content = run.args.content
    if (typeof content !== 'string') return null
    const lines = splitLines(content).map(
      (text, i): DiffLine => ({ kind: 'add', newNo: i + 1, text })
    )
    return { additions: lines.length, deletions: 0, blocks: [{ lines }] }
  }

  return null
}

// parseUnifiedDiff converts `git diff` output into the same ToolDiff shape the
// edit/write cards render, so source control reuses DiffView. Unlike
// buildToolDiff, line numbers come from the @@ hunk headers and are real
// file offsets. Returns null when the patch contains no hunks (binary files,
// pure mode changes).
export function parseUnifiedDiff(patch: string): ToolDiff | null {
  const blocks: DiffBlock[] = []
  let lines: DiffLine[] = []
  let additions = 0
  let deletions = 0
  let oldNo = 0
  let newNo = 0

  const flush = (header?: string): void => {
    if (lines.length > 0) blocks.push({ header, lines })
    lines = []
  }

  let pendingHeader: string | undefined
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('diff --git') || raw.startsWith('index ')) continue
    if (raw.startsWith('--- ') || raw.startsWith('+++ ')) continue

    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(raw)
    if (hunk) {
      flush(pendingHeader)
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      pendingHeader = hunk[3].trim() || undefined
      continue
    }

    if (raw.startsWith('+')) {
      lines.push({ kind: 'add', newNo, text: raw.slice(1) })
      newNo++
      additions++
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'del', oldNo, text: raw.slice(1) })
      oldNo++
      deletions++
    } else if (raw.startsWith(' ') || raw === '') {
      lines.push({ kind: 'ctx', oldNo, newNo, text: raw.slice(1) })
      oldNo++
      newNo++
    }
    // '\ No newline at end of file' and any other metadata is dropped.
  }
  flush(pendingHeader)

  if (blocks.length === 0) return null
  return { additions, deletions, blocks }
}
