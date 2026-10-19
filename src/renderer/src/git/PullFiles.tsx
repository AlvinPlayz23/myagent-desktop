import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PullRequestDetail, PullRequestFileChange } from '../../../shared/protocol'
import { parseUnifiedDiff, splitUnifiedPatch, type PatchFile, type ToolDiff } from '../diff'
import DiffView from '../components/DiffView'
import { ArrowDown02, ArrowUp02, ChevronDown, ChevronRight, Loading03, Search01 } from '../components/ui/icons'
import { cn } from '../util'
import { usePrefersReducedMotion } from '../hooks/use-reduced-motion'
import { CopyButton, DiffStat, FileChangeGlyph, IconButton, Note, type FileChangeStatus } from './PullBits'

// The diff viewer. A pull request is read in two rhythms — skim the whole shape
// of the change in the tree, then read one file closely — so the tree and the
// patch share the screen, the current file is derived from the scroll position,
// and every file collapses on its own.

interface Row {
  path: string
  oldPath?: string
  patch: string | null
  diff: ToolDiff | null
  additions: number
  deletions: number
  status: FileChangeStatus
}

interface Props {
  data: PullRequestDetail
  /** Raw unified patch, or null when it has not loaded (or does not exist). */
  patch: string | null
  loading: boolean
  files: PullRequestFileChange[]
}

function statusOf(file: PatchFile): FileChangeStatus {
  if (/^new file mode/m.test(file.patch)) return 'added'
  if (/^deleted file mode/m.test(file.patch)) return 'deleted'
  if (file.oldPath && file.oldPath !== file.path) return 'renamed'
  return 'modified'
}

/** Row key for collapse state and the file tree: the path after any rename. */
function rowKey(row: Row): string {
  return row.path
}

interface TreeDir {
  name: string
  path: string
  dirs: Map<string, TreeDir>
  rows: Row[]
}

function buildTree(rows: Row[]): TreeDir {
  const root: TreeDir = { name: '', path: '', dirs: new Map(), rows: [] }
  for (const row of rows) {
    const parts = row.path.split('/')
    let node = root
    for (const part of parts.slice(0, -1)) {
      const path = node.path ? `${node.path}/${part}` : part
      let next = node.dirs.get(part)
      if (!next) node.dirs.set(part, (next = { name: part, path, dirs: new Map(), rows: [] }))
      node = next
    }
    node.rows.push(row)
  }
  return root
}

export default function PullFiles({ data, patch, loading, files }: Props): JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<Map<number, HTMLElement>>(new Map())
  const reduceMotion = usePrefersReducedMotion()

  const parsed = useMemo(() => (patch ? splitUnifiedPatch(patch) : []), [patch])

  /**
   * The tree is driven by the patch when there is one, because only the patch
   * knows a file's status; GitHub's file list supplies the counts for files
   * whose patch is missing (binary files, or a diff that failed to load).
   */
  const rows = useMemo<Row[]>(() => {
    const stats = new Map(files.map((file) => [file.path, file]))
    if (parsed.length === 0) {
      return files.map((file) => ({
        path: file.path,
        oldPath: file.oldPath,
        patch: null,
        diff: null,
        additions: file.additions,
        deletions: file.deletions,
        status: file.oldPath ? 'renamed' : 'modified'
      }))
    }
    return parsed.map((file) => {
      const diff = parseUnifiedDiff(file.patch)
      const stat = stats.get(file.path)
      return {
        path: file.path,
        oldPath: file.oldPath,
        patch: file.patch,
        diff,
        additions: diff?.additions ?? stat?.additions ?? 0,
        deletions: diff?.deletions ?? stat?.deletions ?? 0,
        status: statusOf(file)
      }
    })
  }, [parsed, files])

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({ additions: sum.additions + row.additions, deletions: sum.deletions + row.deletions }),
        { additions: 0, deletions: 0 }
      ),
    [rows]
  )

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => row.path.toLowerCase().includes(needle))
  }, [rows, query])

  const tree = useMemo(() => buildTree(visibleRows), [visibleRows])

  // The "File 12 of 31" indicator follows the scroll: whichever card owns the
  // top of the viewport is the file being read.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observed = [...cardsRef.current.values()]
    if (observed.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const hits = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number((entry.target as HTMLElement).dataset.index))
          .filter((index) => !Number.isNaN(index))
        if (hits.length > 0) setCurrent(Math.min(...hits))
      },
      { root, rootMargin: '0px 0px -75% 0px' }
    )
    for (const node of observed) observer.observe(node)
    return () => observer.disconnect()
  }, [rows])

  const goto = useCallback(
    (index: number) => {
      const node = cardsRef.current.get(index)
      if (!node) return
      setCurrent(index)
      node.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
    },
    [reduceMotion]
  )

  const toggle = (path: string): void =>
    setCollapsed((currentSet) => {
      const next = new Set(currentSet)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const step = (delta: number): void => {
    const next = Math.min(rows.length - 1, Math.max(0, current + delta))
    goto(next)
  }

  const renderTree = (dir: TreeDir, depth: number): JSX.Element[] => [
    ...[...dir.dirs.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((child) => {
        // Fold single-child chains (crates/engine/src) into one row.
        let node = child
        let name = child.name
        while (node.rows.length === 0 && node.dirs.size === 1) {
          node = [...node.dirs.values()][0] as TreeDir
          name += `/${node.name}`
        }
        return [
          <div
            key={`dir-${node.path}`}
            className="flex h-6 items-center gap-1.5 truncate px-2 text-ui-xs text-foreground-subtle"
            style={{ paddingLeft: 8 + depth * 12 }}
            title={node.path}
          >
            <span className="truncate">{name}</span>
          </div>,
          ...renderTree(node, depth + 1)
        ]
      }),
    ...dir.rows
      .slice()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((row) => {
        const index = rows.indexOf(row)
        return (
          <button
            key={rowKey(row)}
            type="button"
            onClick={() => goto(index)}
            title={row.path}
            style={{ paddingLeft: 8 + depth * 12 }}
            className={cn(
              'flex h-6 w-full items-center gap-1.5 pr-2 text-left outline-none transition-colors duration-[var(--duration-instant)]',
              'hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring',
              index === current && 'bg-selected'
            )}
          >
            <FileChangeGlyph status={row.status} />
            <span className="min-w-0 flex-1 truncate text-ui-xs text-foreground">{row.path.split('/').pop()}</span>
            <DiffStat additions={row.additions} deletions={row.deletions} />
          </button>
        )
      })
  ]

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-ui-sm text-foreground-subtle">
        <Loading03 size={14} className="animate-spin" />
        Loading diff…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="px-6 py-6">
        <Note>
          {patch === null
            ? 'No diff is available for this pull request.'
            : 'This pull request has no changed files.'}
        </Note>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside aria-label="Changed files" className="flex w-[268px] shrink-0 flex-col border-r border-border/60">
        <div className="shrink-0 border-b border-border/60 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ui-caption font-medium text-foreground">
              Files <span className="tabular-nums text-foreground-subtlest">{rows.length}</span>
            </span>
            <DiffStat additions={totals.additions} deletions={totals.deletions} />
          </div>
          <div className="relative mt-2">
            <Search01 size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtlest" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a changed file…"
              aria-label="Find a changed file"
              className="h-7 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-ui-xs text-foreground outline-none transition-colors duration-[var(--duration-instant)] placeholder:text-foreground-subtlest focus:border-input-border-focused focus:ring-2 focus:ring-ring/20"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {visibleRows.length === 0 ? (
            <p className="px-3 py-3 text-ui-xs text-foreground-subtlest">No file matches “{query.trim()}”.</p>
          ) : (
            renderTree(tree, 0)
          )}
          {/* GitHub reports files whose patch is empty (binaries, mode-only
              changes); the tree can only show the ones with content. */}
          {rows.length < data.changedFiles && !query && (
            <p className="px-3 py-3 text-ui-xs text-foreground-subtlest">
              {data.changedFiles - rows.length} more file{data.changedFiles - rows.length === 1 ? '' : 's'} changed with no
              textual diff.
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 px-2">
          <IconButton title="Previous file" onClick={() => step(-1)} disabled={current <= 0}>
            <ArrowUp02 size={13} strokeWidth={1.9} />
          </IconButton>
          <IconButton title="Next file" onClick={() => step(1)} disabled={current >= rows.length - 1}>
            <ArrowDown02 size={13} strokeWidth={1.9} />
          </IconButton>
          <span className="ml-1 shrink-0 text-ui-xs tabular-nums text-foreground-subtle">
            File {Math.min(current + 1, rows.length)} of {rows.length}
          </span>
          <span className="mx-1.5 h-4 w-px shrink-0 bg-border" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-ui-xs text-foreground-subtle" title={rows[current]?.path}>
            {rows[current]?.path}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed(new Set())}
            className="shrink-0 rounded-md px-2 py-1 text-ui-xs text-muted-foreground outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(new Set(rows.map(rowKey)))}
            className="shrink-0 rounded-md px-2 py-1 text-ui-xs text-muted-foreground outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Collapse all
          </button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="flex flex-col gap-3">
            {rows.map((row, index) => {
              const open = !collapsed.has(rowKey(row))
              return (
                <section
                  key={rowKey(row)}
                  data-index={index}
                  ref={(node) => {
                    if (node) cardsRef.current.set(index, node)
                    else cardsRef.current.delete(index)
                  }}
                  className="scroll-mt-3 overflow-hidden rounded-xl border border-border/60 bg-card"
                >
                  <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-border/60 bg-surface px-2">
                    <button
                      type="button"
                      onClick={() => toggle(rowKey(row))}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {open ? (
                        <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
                      )}
                      <FileChangeGlyph status={row.status} />
                      <span className="shrink-0 font-mono text-ui-xs font-medium text-foreground">{row.path}</span>
                      {row.oldPath && row.oldPath !== row.path && (
                        <span className="min-w-0 truncate font-mono text-ui-xs text-foreground-subtlest">← {row.oldPath}</span>
                      )}
                    </button>
                    <DiffStat additions={row.additions} deletions={row.deletions} />
                    <CopyButton text={row.path} label="Copy path" />
                  </div>
                  {open &&
                    (row.diff ? (
                      <DiffView diff={row.diff} maxLines={Infinity} viewportClassName="max-h-none" bare />
                    ) : (
                      <p className="px-3 py-3 text-ui-xs text-foreground-subtlest">No textual changes to show.</p>
                    ))}
                </section>
              )
            })}
          </div>
          <div className="py-3 text-center text-ui-xs text-foreground-subtlest">
            {data.comments.length > 0 ? `${data.comments.length} comments on this pull request` : 'End of diff'}
          </div>
        </div>
      </div>
    </div>
  )
}
