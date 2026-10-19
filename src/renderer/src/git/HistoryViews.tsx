import { useEffect, useMemo, useState } from 'react'
import type { GitBranch, GitCommit } from '../../../shared/protocol'
import { Alert02, Check, GitBranch01, GitCommitHorizontal, Loading03 } from '../components/ui/icons'
import { cn } from '../util'
import { CopyButton, Note } from './PullBits'
import { relLabel } from './format'

// The two views that come from the local repository rather than GitHub. They are
// deliberately plain: the working tree already has a home in the side panel, so
// what lives here is history — what landed, and what branches exist.

const LOG_LIMIT = 120

function Shell({
  title,
  count,
  trailing,
  children
}: {
  title: string
  count?: number
  trailing?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        <h1 className="text-ui-lg font-semibold tracking-tight text-foreground">{title}</h1>
        {count !== undefined && <span className="text-ui-caption tabular-nums text-foreground-subtle">{count}</span>}
        {trailing}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">{children}</div>
    </div>
  )
}

/** "Today" / "Yesterday" / "Oct 13" — the commit timeline's day separator. */
function dayLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  const now = new Date()
  const startOf = (value: Date): number => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(date)) / 86400e3)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
  })
}

export function CommitsView({ cwd, tick }: { cwd: string; tick: number }): JSX.Element {
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [branch, setBranch] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([window.myagent.git.log(cwd, LOG_LIMIT), window.myagent.git.status(cwd)])
      .then(([log, status]) => {
        if (!alive) return
        setCommits(log.ok ? log.result : [])
        setError(log.ok ? null : log.error.message)
        setBranch(status.ok ? status.result.branch : null)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [cwd, tick])

  // Grouped by day so a long history stays scannable, without an extra fetch.
  const groups = useMemo(() => {
    const out: { label: string; commits: GitCommit[] }[] = []
    for (const commit of commits) {
      const label = dayLabel(commit.date)
      const last = out[out.length - 1]
      if (last && last.label === label) last.commits.push(commit)
      else out.push({ label, commits: [commit] })
    }
    return out
  }, [commits])

  return (
    <Shell
      title="Commits"
      count={commits.length}
      trailing={
        <>
          {branch && (
            <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-ui-xs text-foreground-subtle">
              <GitBranch01 size={11} strokeWidth={1.9} />
              {branch}
            </span>
          )}
          {loading && <Loading03 size={13} className="animate-spin text-muted-foreground" />}
        </>
      }
    >
      {error && (
        <div className="mb-3">
          <Note tone="warning" icon={<Alert02 size={13} strokeWidth={2} />}>
            {error}
          </Note>
        </div>
      )}
      {!error && commits.length === 0 && !loading && (
        <p className="px-1 py-6 text-center text-ui-sm text-foreground-subtle">No commits yet in this repository.</p>
      )}
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <section key={group.label}>
            <div className="flex items-center gap-2 px-1 pb-1.5">
              <span className="text-ui-xs font-medium text-foreground-subtlest">{group.label}</span>
              <span className="text-ui-xs tabular-nums text-foreground-subtlest">{group.commits.length}</span>
              <span className="h-px min-w-4 flex-1 bg-border/60" aria-hidden />
            </div>
            <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60">
              {group.commits.map((commit) => (
                <li key={commit.hash} className="flex items-start gap-2.5 px-3 py-2.5 transition-colors duration-[var(--duration-instant)] hover:bg-hover">
                  <span className="mt-0.5 shrink-0 text-foreground-subtlest">
                    <GitCommitHorizontal size={13} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui-caption text-foreground" title={commit.subject}>
                      {commit.subject}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-ui-xs text-foreground-subtlest">
                      <span className="truncate">{commit.author}</span>
                      <span className="shrink-0">{relLabel(commit.date)}</span>
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-ui-xs text-foreground-subtle">{commit.shortHash}</span>
                  <CopyButton text={commit.hash} label="Copy commit hash" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  )
}

export function BranchesView({ cwd, tick }: { cwd: string; tick: number }): JSX.Element {
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    window.myagent.git
      .branches(cwd)
      .then((res) => {
        if (!alive) return
        setBranches(res.ok ? res.result : [])
        setError(res.ok ? null : res.error.message)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [cwd, tick])

  // The current branch leads: it is the one every other row is compared against.
  const ordered = useMemo(
    () => [...branches].sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name)),
    [branches]
  )

  return (
    <Shell
      title="Branches"
      count={branches.length}
      trailing={loading ? <Loading03 size={13} className="animate-spin text-muted-foreground" /> : undefined}
    >
      {error && (
        <div className="mb-3">
          <Note tone="warning" icon={<Alert02 size={13} strokeWidth={2} />}>
            {error}
          </Note>
        </div>
      )}
      {!error && branches.length === 0 && !loading && (
        <p className="px-1 py-6 text-center text-ui-sm text-foreground-subtle">This repository has no branches yet.</p>
      )}
      <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60">
        {ordered.map((branch) => (
          <li
            key={branch.name}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 transition-colors duration-[var(--duration-instant)] hover:bg-hover',
              branch.current && 'bg-card-selected'
            )}
          >
            <span className={cn('shrink-0', branch.current ? 'text-success' : 'text-foreground-subtlest')}>
              {branch.current ? <Check size={12} strokeWidth={2} /> : <GitBranch01 size={13} strokeWidth={1.7} />}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-mono text-ui-caption',
                branch.current ? 'font-medium text-foreground' : 'text-foreground-subtle'
              )}
            >
              {branch.name}
            </span>
            {branch.upstream && (
              <span className="hidden min-w-0 max-w-[40%] shrink-0 truncate font-mono text-ui-xs text-foreground-subtlest sm:block">
                {branch.upstream}
              </span>
            )}
            <span className="shrink-0 text-ui-xs text-foreground-subtlest">{relLabel(branch.modified)}</span>
          </li>
        ))}
      </ul>
    </Shell>
  )
}
