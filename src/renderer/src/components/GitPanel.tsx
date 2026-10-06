import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, FolderTreeIcon, LeftToRightListBulletIcon } from '@hugeicons/core-free-icons'
import {
  ArrowDown02,
  ArrowUp02,
  Check,
  CheckmarkCircle02,
  ChevronDown,
  ChevronRight,
  GitBranch01,
  Folder01,
  GitCommit01,
  Loading03,
  MinusSign,
  Plus,
  Rotate01,
  Undo01
} from './ui/icons'
import type { GitBranch, GitCommit, GitFileChange, GitStatus } from '../../../shared/protocol'
import { BLOOM_FAST, bloomDown } from '../motion'
import { cn } from '../util'
import { parseUnifiedDiff, type ToolDiff } from '../diff'
import DiffView from './DiffView'

// Poll interval while the panel is open and the window is visible -- git has no
// change notifications. Every tick shells out to git, so this is deliberately
// slack: the panel also refreshes immediately after any mutation it performs.
const REFRESH_MS = 8000

const STATUS_META: Record<GitFileChange['status'], { badge: string; tone: string }> = {
  modified: { badge: 'M', tone: 'text-amber-500' },
  added: { badge: 'A', tone: 'text-success' },
  deleted: { badge: 'D', tone: 'text-destructive' },
  renamed: { badge: 'R', tone: 'text-blue-500' },
  untracked: { badge: 'U', tone: 'text-muted-foreground' },
  conflicted: { badge: '!', tone: 'text-destructive' }
}

// The panel owns one cwd for its whole subtree; DiffFor reads it without
// threading a prop through every row.
const CwdContext = createContext<string | null>(null)

/** Lazily fetches a per-file patch the first time its row is expanded. */
function DiffFor({ path, staged }: { path: string; staged: boolean }): JSX.Element {
  const [diff, setDiff] = useState<ToolDiff | null | 'loading'>('loading')
  const cwd = useContext(CwdContext)

  useEffect(() => {
    let alive = true
    if (!cwd) return
    setDiff('loading')
    window.myagent.git.diff(cwd, path, staged).then((res) => {
      if (alive) setDiff(res.ok ? parseUnifiedDiff(res.result) : null)
    })
    return () => {
      alive = false
    }
  }, [cwd, path, staged])

  if (diff === 'loading') {
    return <div className="px-2 py-2 text-ui-sm text-muted-foreground">Loading diff…</div>
  }
  if (diff === null) {
    return <div className="px-2 py-2 text-ui-sm text-muted-foreground">No textual changes.</div>
  }
  return (
    <div className="mx-2 my-1">
      <DiffView diff={diff} compact />
    </div>
  )
}

function Section({
  title,
  count,
  open,
  onToggle,
  actions,
  children
}: {
  title: string
  count: number
  open: boolean
  onToggle(): void
  actions?: { title: string; icon: JSX.Element; onClick(): void }[]
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="mb-1.5">
      <div className="group/section flex h-7 items-center gap-1 px-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight size={12} className={cn('shrink-0 text-foreground-subtlest transition-transform duration-150', open && 'rotate-90')} />
          <span className="truncate text-ui-sm font-medium text-muted-foreground">{title}</span>
        </button>
        <div className="relative flex h-5 min-w-[44px] shrink-0 items-center justify-end pr-1">
          <span className="text-ui-sm tabular-nums text-foreground-subtlest transition-opacity group-focus-within/section:opacity-0 group-hover/section:opacity-0">{count}</span>
          <div className="absolute right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within/section:opacity-100 group-hover/section:opacity-100">
          {actions?.map((action) => (
            <button
              key={action.title}
              type="button"
              title={action.title}
              aria-label={action.title}
              onClick={action.onClick}
              className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            >
              {action.icon}
            </button>
          ))}
          </div>
        </div>
      </div>
      {open && children}
    </div>
  )
}

interface TreeDir { name: string; path: string; dirs: Map<string, TreeDir>; files: GitFileChange[] }

function buildTree(files: GitFileChange[]): TreeDir {
  const root: TreeDir = { name: '', path: '', dirs: new Map(), files: [] }
  for (const file of files) {
    const parts = file.path.split('/')
    let node = root
    for (const part of parts.slice(0, -1)) {
      const path = node.path ? `${node.path}/${part}` : part
      let next = node.dirs.get(part)
      if (!next) node.dirs.set(part, (next = { name: part, path, dirs: new Map(), files: [] }))
      node = next
    }
    node.files.push(file)
  }
  return root
}

function FileRow({
  file,
  expanded,
  depth,
  onToggle,
  onStage,
  onUnstage,
  onDiscard
}: {
  file: GitFileChange
  /** Tree view nesting level; the folder is then shown by the tree, not the row. */
  depth?: number
  expanded: boolean
  onToggle(): void
  onStage(): void
  onUnstage(): void
  onDiscard(): void
}): JSX.Element {
  const meta = STATUS_META[file.status]
  const name = file.path.split('/').pop() ?? file.path
  const dir = depth === undefined ? file.path.slice(0, file.path.length - name.length).replace(/\/$/, '') : ''

  return (
    <div className="group">
      <div
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-hover"
        style={depth ? { paddingLeft: 8 + depth * 12 } : undefined}
        title={file.partial ? `${file.path}\n(partially staged - has unstaged changes)` : file.path}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
        >
          {/* Staged marker. Only staged rows render it: alignment only has to
              hold within a section, and a spacer on every unstaged row would
              cost filename width in a 320px panel. FileRow is keyed on path and
              the two lists render into different parents, so staging unmounts
              and remounts the row -- this animation therefore doubles as
              confirmation the click landed. A partially staged file (porcelain
              `MM`: staged edits plus newer unstaged ones) shows a dash instead
              of a tick, since a tick would overstate what is in the index --
              a dash is the conventional "some but not all" signal, whereas an
              empty circle would read as plain unchecked. */}
          {file.staged && (
            <motion.span
              role="img"
              aria-label={file.partial ? 'Partially staged' : 'Staged'}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
              className="grid size-3.5 shrink-0 place-items-center rounded-full bg-success/15 text-success"
            >
              {file.partial ? (
                <span className="block h-0.5 w-[6px] rounded-full bg-current" />
              ) : (
                <Check size={11} />
              )}
            </motion.span>
          )}
          <span className={cn('w-3 shrink-0 text-center font-mono text-ui-xs font-bold', meta.tone)}>
            {meta.badge}
          </span>
          <span className={cn('truncate text-ui-sm text-foreground', dir ? 'max-w-[65%] shrink-0' : 'min-w-0 flex-1')}>
            {name}
          </span>
          {dir && <span className="min-w-0 flex-1 truncate text-ui-xs text-muted-foreground">{dir}</span>}
        </button>

        {/* Stats and row actions share one slot, so the hidden actions never
            cost filename width: hover swaps one for the other. */}
        <div className="relative flex min-w-[44px] shrink-0 items-center justify-end">
          {(file.insertions > 0 || file.deletions > 0) && (
            <span className="font-mono text-ui-xs tabular-nums transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
              <span className="text-success">+{file.insertions}</span>{' '}
              <span className="text-destructive">-{file.deletions}</span>
            </span>
          )}

        <div className="absolute right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            title="Discard changes"
            onClick={onDiscard}
            className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <Undo01 size={11} />
          </button>
          <button
            type="button"
            title={file.staged ? 'Unstage' : 'Stage'}
            onClick={file.staged ? onUnstage : onStage}
            className="grid size-5 place-items-center rounded text-ui-caption leading-none text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            {file.staged ? '-' : '+'}
          </button>
        </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <DiffFor path={file.path} staged={file.staged} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface Props {
  cwd: string | null
  onClose(): void
}

export default function GitPanel({ cwd, onClose }: Props): JSX.Element {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [branchOpen, setBranchOpen] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [tree, setTree] = useState(() => localStorage.getItem('myagent.git.view') === 'tree')
  const [closedSections, setClosedSections] = useState<Set<string>>(new Set())
  const branchRef = useRef<HTMLDivElement>(null)

  // Collapses overlapping polls: on a large repo a status call can outlast the
  // interval, and without this the queue of git processes grows unbounded. A
  // plain boolean suffices because the panel is keyed on cwd at its usage site,
  // so switching repos remounts it rather than reusing this ref.
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!cwd || inFlight.current) return
    inFlight.current = true
    try {
      const res = await window.myagent.git.status(cwd)
      if (res.ok) {
        setStatus(res.result)
        // Clear on success, or a transient failure (a contended index.lock)
        // would leave its banner up for the rest of the session.
        setError(null)
      } else {
        setError(res.error.message)
      }
    } finally {
      inFlight.current = false
    }
  }, [cwd])

  // Polling stops while the window is hidden or minimized -- otherwise the
  // panel keeps spawning git processes in the background forever. Becoming
  // visible again refreshes at once, so nothing looks stale.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = (): void => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const start = (): void => {
      if (timer) return
      timer = setInterval(refresh, REFRESH_MS)
    }
    const sync = (): void => {
      if (document.hidden) {
        stop()
      } else {
        refresh()
        start()
      }
    }

    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [refresh])

  useEffect(() => {
    if (!cwd || !status?.isRepo) return
    window.myagent.git.branches(cwd).then((r) => r.ok && setBranches(r.result))
  }, [cwd, status?.isRepo, status?.branch])

  useEffect(() => {
    if (!cwd || !showLog) return
    window.myagent.git.log(cwd, 30).then((r) => r.ok && setCommits(r.result))
  }, [cwd, showLog, status?.branch])

  useEffect(() => {
    if (!branchOpen) return
    const onDown = (e: MouseEvent): void => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) setBranchOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [branchOpen])

  /** Run a git mutation, surface its error, and refresh on the way out. */
  const act = useCallback(
    async (label: string, fn: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
      setBusy(label)
      setError(null)
      try {
        const res = await fn()
        if (!res.ok && res.error) setError(res.error.message)
        // Only a checkout can move HEAD, and with it the branch the sidebar
        // displays. Emitting for stage/fetch/push et al. would just burn a
        // `git branches` subprocess per click.
        if (res.ok && cwd && label === 'checkout') {
          window.dispatchEvent(new CustomEvent('myagent:git-mutated', { detail: { cwd } }))
        }
      } finally {
        setBusy(null)
        refresh()
      }
    },
    [refresh]
  )

  const staged = useMemo(() => status?.files.filter((f) => f.staged) ?? [], [status])
  const unstaged = useMemo(() => status?.files.filter((f) => !f.staged) ?? [], [status])

  const toggleView = (): void =>
    setTree((value) => {
      localStorage.setItem('myagent.git.view', value ? 'list' : 'tree')
      return !value
    })
  const toggleSection = (id: string): void =>
    setClosedSections((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggle = (path: string): void =>
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const rowFor = (f: GitFileChange, depth?: number): JSX.Element => (
    <FileRow
      key={f.path}
      file={f}
      depth={depth}
      expanded={expanded.has(f.path)}
      onToggle={() => toggle(f.path)}
      onStage={() => act('stage', () => window.myagent.git.stage(cwd!, [f.path]))}
      onUnstage={() => act('unstage', () => window.myagent.git.unstage(cwd!, [f.path]))}
      onDiscard={() => {
        if (confirm(`Discard all changes to ${f.path}? This cannot be undone.`)) {
          act('discard', () => window.myagent.git.discard(cwd!, [f.path]))
        }
      }}
    />
  )

  const renderDir = (dir: TreeDir, depth: number): JSX.Element[] => [
    ...[...dir.dirs.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((dir) => {
        // Fold single-child chains (src/renderer/src) into one row.
        let node = dir
        let name = dir.name
        while (node.files.length === 0 && node.dirs.size === 1) {
          node = [...node.dirs.values()][0]
          name += `/${node.name}`
        }
        return { node, name }
      })
      .flatMap(({ node: child, name }) => [
        <div
          key={`dir-${child.path}`}
          className="flex h-6 items-center gap-1.5 truncate px-2 text-ui-xs text-foreground-subtle"
          style={{ paddingLeft: 8 + depth * 12 }}
          title={child.path}
        >
          <Folder01 size={12} strokeWidth={1.7} className="shrink-0" />
          <span className="truncate">{name}</span>
        </div>,
        ...renderDir(child, depth + 1)
      ]),
    ...dir.files.sort((a, b) => a.path.localeCompare(b.path)).map((f) => rowFor(f, depth))
  ]
  const renderFiles = (files: GitFileChange[]): JSX.Element[] =>
    tree ? renderDir(buildTree(files), 0) : files.map((f) => rowFor(f))

  const syncAction = ((): { label: string; run: () => void } | null => {
    if (!status?.isRepo || !status.branch || !cwd) return null
    const git = window.myagent.git
    if (!status.upstream) return { label: 'Publish branch', run: () => void act('push', () => git.push(cwd)) }
    if (status.ahead > 0 && status.behind > 0) {
      return {
        label: `Sync changes  ↑${status.ahead} ↓${status.behind}`,
        run: () => void act('sync', async () => {
          const pulled = await git.pull(cwd)
          return pulled.ok ? git.push(cwd) : pulled
        })
      }
    }
    if (status.ahead > 0) return { label: `Push  ↑${status.ahead}`, run: () => void act('push', () => git.push(cwd)) }
    if (status.behind > 0) return { label: `Pull  ↓${status.behind}`, run: () => void act('pull', () => git.pull(cwd)) }
    return null
  })()

  if (!cwd) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-ui-sm text-foreground-subtlest">
        Open a session to see its repository.
      </div>
    )
  }

  if (status && !status.isRepo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-ui-sm text-foreground-subtlest">This folder is not a git repository.</p>
        <button
          type="button"
          onClick={() => act('init', () => window.myagent.git.init(cwd))}
          className="h-8 rounded-lg border border-border bg-background px-3 text-ui-sm font-medium text-foreground transition-colors hover:bg-hover"
        >
          Initialize repository
        </button>
      </div>
    )
  }

  return (
    <CwdContext.Provider value={cwd}>
    <div className="flex h-full min-h-0 flex-col">
      {/* Branch + sync bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-2 py-1.5">
        <div className="relative min-w-0 flex-1" ref={branchRef}>
          <button
            type="button"
            onClick={() => setBranchOpen((v) => !v)}
            className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-hover"
            title={status?.upstream ? `Tracking ${status.upstream}` : 'No upstream'}
          >
            <GitBranch01 size={13} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground">
              {status ? (status.branch ?? 'detached') : '—'}
            </span>
            {!!status && (status.ahead > 0 || status.behind > 0) && (
              <span className="shrink-0 font-mono text-ui-xs text-muted-foreground">
                {status.ahead > 0 && `↑${status.ahead}`}
                {status.behind > 0 && `↓${status.behind}`}
              </span>
            )}
            <ChevronDown size={11} className="shrink-0 text-muted-foreground" />
          </button>

          <AnimatePresence>
            {branchOpen && (
              <motion.div
                variants={bloomDown}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={BLOOM_FAST}
                className="absolute left-0 top-8 z-50 max-h-[280px] w-[240px] origin-top-left overflow-y-auto rounded-lg border border-popover-border bg-menu $1 shadow-md"
              >
                {branches.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => {
                      setBranchOpen(false)
                      if (!b.current) act('checkout', () => window.myagent.git.checkout(cwd, b.name))
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ui-sm transition-colors hover:bg-hover"
                  >
                    {b.current ? (
                      <Check size={11} className="shrink-0 text-success" />
                    ) : (
                      <span className="size-[11px] shrink-0" />
                    )}
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        b.current ? 'font-medium text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {b.name}
                    </span>
                  </button>
                ))}
                {branches.length === 0 && (
                  <div className="px-3 py-2 text-center text-ui-sm text-muted-foreground">No branches</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          title="Fetch"
          disabled={!!busy}
          onClick={() => act('fetch', () => window.myagent.git.fetch(cwd))}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
        >
          {busy === 'fetch' ? <Loading03 size={14} className="animate-spin" /> : <Rotate01 size={14} strokeWidth={1.8} />}
        </button>
        <button
          type="button"
          title={tree ? 'View as list' : 'View as tree'}
          aria-label={tree ? 'View as list' : 'View as tree'}
          onClick={toggleView}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          <HugeiconsIcon icon={tree ? LeftToRightListBulletIcon : FolderTreeIcon} size={14} strokeWidth={1.8} aria-hidden />
        </button>
        <button
          type="button"
          title="Close git panel"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} aria-hidden />
        </button>
      </div>

      {error && (
        <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 font-mono text-ui-xs text-destructive-foreground">
          {error}
        </div>
      )}

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1 py-1.5">
        {status && status.files.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <CheckmarkCircle02 size={20} strokeWidth={1.6} className="text-foreground-subtlest" />
            <p className="text-ui-sm text-muted-foreground">No changes</p>
            <p className="text-ui-xs text-foreground-subtlest">Working tree is clean.</p>
          </div>
        )}

        {staged.length > 0 && (
          <Section
            title="Staged"
            count={staged.length}
            open={!closedSections.has('staged')}
            onToggle={() => toggleSection('staged')}
            actions={[{ title: 'Unstage all', icon: <MinusSign size={13} />, onClick: () => void act('unstage', () => window.myagent.git.unstage(cwd, [])) }]}
          >
            {renderFiles(staged)}
          </Section>
        )}

        {unstaged.length > 0 && (
          <Section
            title="Changes"
            count={unstaged.length}
            open={!closedSections.has('changes')}
            onToggle={() => toggleSection('changes')}
            actions={[
              {
                title: 'Discard all',
                icon: <Undo01 size={12} />,
                onClick: () => {
                  if (confirm(`Discard all ${unstaged.length} unstaged change(s)? This cannot be undone.`)) {
                    void act('discard', () => window.myagent.git.discard(cwd, unstaged.map((f) => f.path)))
                  }
                }
              },
              { title: 'Stage all', icon: <Plus size={13} />, onClick: () => void act('stage', () => window.myagent.git.stage(cwd, [])) }
            ]}
          >
            {renderFiles(unstaged)}
          </Section>
        )}

        {/* Recent commits */}
        <div className="mt-3 border-t border-border/60 pt-2">
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-hover"
          >
            {showLog ? (
              <ChevronDown size={11} className="shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight size={11} className="shrink-0 text-muted-foreground" />
            )}
            <span className="text-ui-sm font-medium text-muted-foreground">
              Recent commits
            </span>
          </button>
          {showLog &&
            commits.map((c) => (
              <div key={c.hash} className="flex items-start gap-1.5 px-2 py-1" title={`${c.author} · ${c.date}`}>
                <GitCommit01 size={11} className="mt-0.5 shrink-0 text-foreground-subtlest" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-ui-sm text-foreground">{c.subject}</div>
                  <div className="truncate font-mono text-ui-xs text-muted-foreground">
                    {c.shortHash} · {c.author}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Commit box */}
      <div className="shrink-0 border-t border-border/60 p-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={staged.length > 0 ? `Commit ${staged.length} staged file(s)…` : 'Commit message…'}
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-ui-sm text-foreground outline-none placeholder:text-foreground-subtlest focus:border-input focus:ring-1 focus:ring-ring/30"
        />
        <button
          type="button"
          disabled={!!busy || !message.trim() || staged.length === 0}
          onClick={() =>
            act('commit', async () => {
              const res = await window.myagent.git.commit(cwd, message)
              if (res.ok) setMessage('')
              return res
            })
          }
          className="mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-ui-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
        >
          {busy === 'commit' ? <Loading03 size={12} className="animate-spin" /> : <GitCommit01 size={12} />}
          Commit
        </button>
        {syncAction && (
          <button
            type="button"
            disabled={!!busy}
            onClick={syncAction.run}
            className="mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 whitespace-pre rounded-lg border border-border text-ui-sm font-medium text-foreground transition-colors hover:bg-hover disabled:pointer-events-none disabled:opacity-40"
          >
            {busy === 'push' || busy === 'pull' || busy === 'sync' ? <Loading03 size={12} className="animate-spin" /> : <ArrowUp02 size={12} />}
            {syncAction.label}
          </button>
        )}
      </div>
    </div>
    </CwdContext.Provider>
  )
}
