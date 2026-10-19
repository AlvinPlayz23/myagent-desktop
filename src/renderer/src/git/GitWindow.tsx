import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  CheckIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  RefreshIcon
} from '@hugeicons/core-free-icons'
import type { GithubStatus, PullFilter, PullRequestSummary, PullStateFilter } from '../../../shared/protocol'
import { Alert02, ChevronDown, Folder01, GitCommitHorizontal } from '../components/ui/icons'
import WindowControls from '../components/WindowControls'
import { BLOOM_FAST, bloomDown } from '../motion'
import { baseName, cn } from '../util'
import { listPulls, probe as probeRepo, type Probe } from './api'
import { IconButton } from './PullBits'
import PullList from './PullList'
import PullDetail from './PullDetail'
import { BranchesView, CommitsView } from './HistoryViews'

// The source-control window: a full-window screen (not a drawer) because a pull
// request needs a file tree, a diff and a conversation side by side, and none of
// that fits the 320px side panel. The panel still owns staging; this owns
// everything that is about the repository rather than the working tree.
//
// The window is the controller for the whole feature: it owns the selected
// project, the gh probe, the pull list and the route, so switching to a pull
// request and back never refetches or loses the filter.

interface Props {
  projects: { cwd: string; name: string }[]
  initialCwd: string | null
  onClose(): void
}

type Route =
  | { kind: 'pulls' }
  | { kind: 'pull'; number: number }
  | { kind: 'commits' }
  | { kind: 'branches' }

const STARS_KEY = 'myagent.git.stars'

function loadStars(): Set<number> {
  try {
    const raw = localStorage.getItem(STARS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [])
  } catch {
    return new Set()
  }
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick
}: {
  icon: React.ReactNode
  label: string
  count?: number
  active: boolean
  onClick(): void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left outline-none transition-colors duration-[var(--duration-instant)]',
        'focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
      )}
    >
      <span className={cn('grid size-4 shrink-0 place-items-center', active && 'text-brand')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-ui-caption font-medium">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 font-mono text-ui-xs tabular-nums text-foreground-subtlest">{count}</span>
      )}
    </button>
  )
}

export default function GitWindow({ projects, initialCwd, onClose }: Props): JSX.Element {
  const [cwd, setCwd] = useState<string | null>(initialCwd ?? projects[0]?.cwd ?? null)
  const [probe, setProbe] = useState<Probe | null>(null)
  const [pulls, setPulls] = useState<PullRequestSummary[]>([])
  // Which bucket/state the rows in `pulls` belong to. A fetch takes a beat, and
  // showing the previous bucket's pull requests under the new label makes a
  // filter look broken — so rows that do not match the current query are held
  // back and the list shows skeletons instead.
  const [loadedKey, setLoadedKey] = useState('')
  const [pullsLoading, setPullsLoading] = useState(true)
  const [pullsReason, setPullsReason] = useState<string | null>(null)
  const [filter, setFilter] = useState<PullFilter>('all')
  // Open is the working set; closed and merged are history, so they are opt-in.
  const [stateFilter, setStateFilter] = useState<PullStateFilter>('open')
  const [route, setRoute] = useState<Route>({ kind: 'pulls' })
  const [tick, setTick] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [stars, setStars] = useState<Set<number>>(loadStars)
  const [projectOpen, setProjectOpen] = useState(false)
  const projectRef = useRef<HTMLDivElement>(null)

  const repo: GithubStatus | null = probe?.status ?? null

  useEffect(() => {
    try {
      localStorage.setItem(STARS_KEY, JSON.stringify([...stars]))
    } catch {
      // A full or blocked localStorage must not break the window.
    }
  }, [stars])

  useEffect(() => {
    if (!cwd) {
      setProbe(null)
      return
    }
    let alive = true
    probeRepo(cwd).then((result) => {
      if (!alive) return
      setProbe(result)
      setRefreshing(false)
    })
    return () => {
      alive = false
    }
  }, [cwd, tick])

  const queryKey = `${cwd}\u0000${filter}\u0000${stateFilter}`

  useEffect(() => {
    if (!cwd || !probe) return
    let alive = true
    setPullsLoading(true)
    listPulls(cwd, filter, stateFilter, probe)
      .then((loaded) => {
        if (!alive) return
        setPulls(loaded.data)
        setLoadedKey(queryKey)
        setPullsReason(loaded.demo ? loaded.reason : null)
      })
      .catch((err: unknown) => {
        // Never leave the previous query's rows on screen under the new label.
        if (!alive) return
        setPulls([])
        setLoadedKey(queryKey)
        setPullsReason(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (alive) setPullsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [cwd, filter, stateFilter, probe, tick, queryKey])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !projectOpen) {
        if (route.kind === 'pull') setRoute({ kind: 'pulls' })
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, projectOpen, route.kind])

  useEffect(() => {
    if (!projectOpen) return
    const onDown = (event: MouseEvent): void => {
      if (projectRef.current && !projectRef.current.contains(event.target as Node)) setProjectOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [projectOpen])

  const refresh = useCallback(() => {
    setRefreshing(true)
    setTick((value) => value + 1)
  }, [])

  const toggleStar = useCallback((number: number) => {
    setStars((current) => {
      const next = new Set(current)
      if (next.has(number)) next.delete(number)
      else next.add(number)
      return next
    })
  }, [])

  const openPull = useCallback((number: number) => setRoute({ kind: 'pull', number }), [])

  // Rows only exist for the query they were fetched for; anything else is
  // mid-flight and renders as skeletons.
  const rows = loadedKey === queryKey ? pulls : []

  const attentionCount = useMemo(() => rows.filter((pull) => pull.checks === 'failing').length, [rows])

  const projectName = cwd ? baseName(cwd) : 'No project'

  if (!cwd) {
    return (
      <Window title="Source control">
        <div className="flex flex-1 items-center justify-center px-6 text-center text-ui-sm text-foreground-subtle">
          Add a project to see its repository, commits and pull requests.
        </div>
      </Window>
    )
  }

  return (
    <Window
      title="Source control"
      actions={
        <>
          <IconButton title="Refresh" onClick={refresh} disabled={refreshing}>
            <HugeiconsIcon
              icon={RefreshIcon}
              size={14}
              strokeWidth={1.8}
              className={cn(refreshing && 'animate-spin')}
              aria-hidden
            />
          </IconButton>
          <IconButton title="Close source control" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} aria-hidden />
          </IconButton>
        </>
      }
      lead={
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative" ref={projectRef}>
          <button
            type="button"
            onClick={() => setProjectOpen((value) => !value)}
            aria-expanded={projectOpen}
            aria-haspopup="menu"
            className="flex h-7 min-w-0 items-center gap-1.5 rounded-lg px-2 text-left transition-colors duration-[var(--duration-instant)] hover:bg-hover"
          >
            <Folder01 size={13} strokeWidth={1.7} className="shrink-0 text-muted-foreground" />
            <span className="max-w-[220px] truncate text-ui-caption font-medium text-foreground">{projectName}</span>
            <ChevronDown size={11} className="shrink-0 text-foreground-subtlest" />
          </button>
          <AnimatePresence>
            {projectOpen && (
              <motion.div
                role="menu"
                variants={bloomDown}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={BLOOM_FAST}
                className="absolute left-0 top-8 z-50 max-h-[320px] w-[260px] origin-top-left overflow-y-auto rounded-lg border border-popover-border bg-menu p-1 shadow-[var(--shadow-pop)]"
              >
                {projects.map((project) => (
                  <button
                    key={project.cwd}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProjectOpen(false)
                      setRoute({ kind: 'pulls' })
                      setCwd(project.cwd)
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-[var(--duration-instant)] hover:bg-menu-hover"
                  >
                    {project.cwd === cwd ? (
                      <HugeiconsIcon icon={CheckIcon} size={12} strokeWidth={2} className="shrink-0 text-success" aria-hidden />
                    ) : (
                      <span className="size-3 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui-caption text-foreground">{project.name}</span>
                      <span className="block truncate font-mono text-ui-xs text-foreground-subtlest">{project.cwd}</span>
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          </div>
          {repo?.repo && (
            <span className="min-w-0 truncate font-mono text-ui-xs text-foreground-subtlest" title={repo.repo}>
              {repo.repo}
            </span>
          )}
        </div>
      }
    >
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Source control sections" className="flex w-[188px] shrink-0 flex-col gap-0.5 border-r border-border/60 p-2">
          <NavItem
            icon={<HugeiconsIcon icon={GitPullRequestIcon} size={14} strokeWidth={1.8} aria-hidden />}
            label="Pull requests"
            count={rows.length}
            active={route.kind === 'pulls' || route.kind === 'pull'}
            onClick={() => setRoute({ kind: 'pulls' })}
          />
          <NavItem
            icon={<GitCommitHorizontal size={14} strokeWidth={1.8} />}
            label="Commits"
            active={route.kind === 'commits'}
            onClick={() => setRoute({ kind: 'commits' })}
          />
          <NavItem
            icon={<HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={1.8} aria-hidden />}
            label="Branches"
            active={route.kind === 'branches'}
            onClick={() => setRoute({ kind: 'branches' })}
          />
          {attentionCount > 0 && (
            <div className="mt-auto flex items-start gap-2 rounded-lg bg-warning/5 px-2 py-1.5 text-ui-xs text-warning-foreground">
              <Alert02 size={12} strokeWidth={2} className="mt-px shrink-0" />
              <span className="text-pretty">{attentionCount} pull requests have failing checks.</span>
            </div>
          )}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {pullsReason && (
            <div className="flex shrink-0 items-center gap-2 border-b border-warning/20 bg-warning/5 px-3 py-1.5 text-ui-xs text-warning-foreground">
              <Alert02 size={12} strokeWidth={2} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate" title={pullsReason}>
                Demo data — {pullsReason}
              </span>
            </div>
          )}

          {route.kind === 'pulls' && (
            <PullList
              pulls={rows}
              loading={pullsLoading}
              filter={filter}
              onFilter={setFilter}
              stateFilter={stateFilter}
              onStateFilter={setStateFilter}
              stars={stars}
              onToggleStar={toggleStar}
              onOpen={openPull}
              viewer={repo?.user ?? null}
            />
          )}
          {route.kind === 'pull' && (
            <PullDetail
              key={`${cwd}-${route.number}`}
              cwd={cwd}
              number={route.number}
              probe={probe}
              onBack={() => setRoute({ kind: 'pulls' })}
            />
          )}
          {route.kind === 'commits' && <CommitsView cwd={cwd} tick={tick} />}
          {route.kind === 'branches' && <BranchesView cwd={cwd} tick={tick} />}
        </div>
      </div>
    </Window>
  )
}

/**
 * The window chrome every screen shares: a drag strip that stops short of the
 * top-right corner, the screen itself, and then the window controls.
 *
 * The controls are the last child on purpose. Chromium folds drag regions into
 * one region by adding `drag` rects and subtracting `no-drag` rects in DOM
 * order, so a control rendered *before* a drag strip is covered again by that
 * strip's rect and stops receiving clicks — the window drags instead. The shell
 * relies on the same ordering for its own controls, and the drag strip also
 * stops 140px short of the corner so it never adds a rect there at all.
 */
function Window({
  title,
  lead,
  actions,
  children
}: {
  title: string
  lead?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <motion.div
      role="region"
      aria-label="Source control"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="no-drag fixed inset-0 z-[90] flex flex-col bg-background"
    >
      <div className="drag-region mr-[140px] flex h-9 shrink-0 items-center gap-1.5 pl-2">
        <span className="flex shrink-0 select-none items-center gap-1.5 pl-1">
          <HugeiconsIcon icon={GitPullRequestIcon} size={13} strokeWidth={1.8} className="text-muted-foreground" aria-hidden />
          <span className="text-ui-caption font-semibold tracking-tight text-foreground">{title}</span>
        </span>
        <div className="no-drag ml-1 flex min-w-0 items-center">{lead}</div>
        <div className="no-drag ml-auto flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      {children}
      <WindowControls />
    </motion.div>
  )
}
