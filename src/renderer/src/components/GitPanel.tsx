import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowDownTray,
  ArrowUpTray,
  Check,
  ChevronDown,
  ChevronRight,
  GitBranch01,
  GitCommit01,
  Loading03,
  Refresh01,
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
    return <div className="px-2 py-2 text-[11px] text-muted-foreground/60">Loading diff…</div>
  }
  if (diff === null) {
    return <div className="px-2 py-2 text-[11px] text-muted-foreground/60">No textual changes.</div>
  }
  return (
    <div className="mx-2 my-1 max-h-[320px] overflow-y-auto">
      <DiffView diff={diff} />
    </div>
  )
}

function FileRow({
  file,
  expanded,
  onToggle,
  onStage,
  onUnstage,
  onDiscard
}: {
  file: GitFileChange
  expanded: boolean
  onToggle(): void
  onStage(): void
  onUnstage(): void
  onDiscard(): void
}): JSX.Element {
  const meta = STATUS_META[file.status]
  const name = file.path.split('/').pop() ?? file.path
  const dir = file.path.slice(0, file.path.length - name.length).replace(/\/$/, '')

  return (
    <div className="group">
      <div
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-hover"
        title={file.path}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
        >
          <span className={cn('w-3 shrink-0 text-center font-mono text-[10px] font-bold', meta.tone)}>
            {meta.badge}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{name}</span>
          {dir && (
            <span className="hidden shrink-0 truncate text-[10.5px] text-muted-foreground/60 sm:inline">{dir}</span>
          )}
        </button>

        {(file.insertions > 0 || file.deletions > 0) && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums">
            <span className="text-success">+{file.insertions}</span>{' '}
            <span className="text-destructive">-{file.deletions}</span>
          </span>
        )}

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
            className="grid size-5 place-items-center rounded text-[13px] leading-none text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            {file.staged ? '-' : '+'}
          </button>
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
      } finally {
        setBusy(null)
        refresh()
      }
    },
    [refresh]
  )

  const staged = useMemo(() => status?.files.filter((f) => f.staged) ?? [], [status])
  const unstaged = useMemo(() => status?.files.filter((f) => !f.staged) ?? [], [status])

  const toggle = (path: string): void =>
    setExpanded((cur) => {
      const next = new Set(cur)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const rowFor = (f: GitFileChange): JSX.Element => (
    <FileRow
      key={f.path}
      file={f}
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

  if (!cwd) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground/70">
        Open a session to see its repository.
      </div>
    )
  }

  if (status && !status.isRepo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-xs text-muted-foreground/70">This folder is not a git repository.</p>
        <button
          type="button"
          onClick={() => act('init', () => window.myagent.git.init(cwd))}
          className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-hover"
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
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
              {status ? (status.branch ?? 'detached') : '—'}
            </span>
            {!!status && (status.ahead > 0 || status.behind > 0) && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
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
                className="absolute left-0 top-8 z-50 max-h-[280px] w-[240px] origin-top-left overflow-y-auto rounded-xl border border-border bg-popover py-1 shadow-xl shadow-black/25"
              >
                {branches.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => {
                      setBranchOpen(false)
                      if (!b.current) act('checkout', () => window.myagent.git.checkout(cwd, b.name))
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-hover"
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
                  <div className="px-3 py-2 text-center text-[11px] text-muted-foreground/60">No branches</div>
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
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
        >
          {busy === 'fetch' ? <Loading03 size={12} className="animate-spin" /> : <Refresh01 size={12} />}
        </button>
        <button
          type="button"
          title="Pull"
          disabled={!!busy}
          onClick={() => act('pull', () => window.myagent.git.pull(cwd))}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
        >
          <ArrowDownTray size={12} />
        </button>
        <button
          type="button"
          title="Push"
          disabled={!!busy}
          onClick={() => act('push', () => window.myagent.git.push(cwd))}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
        >
          <ArrowUpTray size={12} />
        </button>
        <button
          type="button"
          title="Close git panel"
          onClick={onClose}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
            <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-3 py-1.5 font-mono text-[10.5px] text-destructive-foreground">
          {error}
        </div>
      )}

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1 py-1.5">
        {status && status.files.length === 0 && (
          <div className="px-3 py-8 text-center text-[11.5px] text-muted-foreground/60">
            No changes. Working tree is clean.
          </div>
        )}

        {staged.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center justify-between px-2 pb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Staged ({staged.length})
              </span>
              <button
                type="button"
                onClick={() => act('unstage', () => window.myagent.git.unstage(cwd, []))}
                className="text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Unstage all
              </button>
            </div>
            {staged.map(rowFor)}
          </div>
        )}

        {unstaged.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 pb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Changes ({unstaged.length})
              </span>
              <button
                type="button"
                onClick={() => act('stage', () => window.myagent.git.stage(cwd, []))}
                className="text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Stage all
              </button>
            </div>
            {unstaged.map(rowFor)}
          </div>
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
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Recent commits
            </span>
          </button>
          {showLog &&
            commits.map((c) => (
              <div key={c.hash} className="flex items-start gap-1.5 px-2 py-1" title={`${c.author} · ${c.date}`}>
                <GitCommit01 size={11} className="mt-0.5 shrink-0 text-muted-foreground/50" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] text-foreground">{c.subject}</div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground/60">
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
          className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-input focus:ring-1 focus:ring-ring/30"
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
          className="mt-1.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
        >
          {busy === 'commit' ? <Loading03 size={12} className="animate-spin" /> : <GitCommit01 size={12} />}
          Commit
        </button>
      </div>
    </div>
    </CwdContext.Provider>
  )
}
