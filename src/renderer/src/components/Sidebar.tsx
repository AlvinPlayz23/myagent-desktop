import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { GitBranchIcon, Message01Icon } from '@hugeicons/core-free-icons'
import {
  Archive01,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Edit01,
  Folder01,
  Folder02,
  FolderAdd,
  GitBranch01,
  LayoutAlignLeft,
  LayoutAlignRight,
  Message01,
  Plus,
  Search01,
  Settings01,
  Tick01
} from './ui/icons'
import type { GitBranch, SessionMeta } from '../../../shared/protocol'
import { BLOOM_FAST, EASE_IN, EASE_OUT, bloomDown } from '../motion'
import { cn, relTime } from '../util'
import type { SidebarVariant } from '../preferences'
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from './ui/tooltip'

interface Menu { session: SessionMeta; x: number; y: number }

interface Props {
  sessions: SessionMeta[]
  projects: { cwd: string; name: string }[]
  activeId: string | null
  /** Sessions currently streaming a turn (background runs included). */
  runningIds: Set<string>
  onOpen(id: string): void
  onCompose(cwd: string): void
  onAddProject(): void
  onHome(): void
  collapsed: boolean
  onToggle(): void
  settingsOpen: boolean
  onSettings(): void
  archivedSessionIds: Set<string>
  onRename(id: string, currentTitle: string): void
  onArchive(id: string): void
  onRestore(id: string): void
  /** Sidebar presentation: the flat inbox list, or projects grouped with expandable sections. */
  sidebarVariant?: SidebarVariant
}

const MENU_WIDTH = 240
const MENU_HEIGHT = 140
const ARCHIVED_INITIAL = 8
const ARCHIVED_PAGE = 25

function label(session: SessionMeta): string {
  return session.title || session.preview || `${session.messageCount} messages`
}

/** Expanded-only text: clears before the width collapse, blurs back in after. */
function CollapseLabel({ show, children }: { show: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          className="whitespace-nowrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.16, delay: 0.02, ease: 'easeOut' } }}
          exit={{ opacity: 0, transition: { duration: 0.02, ease: 'easeIn' } }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function Sidebar({
  sessions,
  projects,
  activeId,
  runningIds,
  onOpen,
  onCompose,
  onAddProject,
  onHome,
  collapsed,
  onToggle,
  settingsOpen,
  onSettings,
  archivedSessionIds,
  onRename,
  onArchive,
  onRestore,
  sidebarVariant = 'inbox'
}: Props): JSX.Element {
  const isGrouped = sidebarVariant === 'grouped'
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [projectQuery, setProjectQuery] = useState('')
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [archivedShown, setArchivedShown] = useState(ARCHIVED_INITIAL)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [branchByCwd, setBranchByCwd] = useState<Record<string, string | null>>({})
  const [settling, setSettling] = useState(false)
  // Grouped variant: per-project section open state, overriding the
  // follow-the-active-project default once the user toggles a section.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [hoveredProjectAction, setHoveredProjectAction] = useState<string | null>(null)
  const [focusedProjectAction, setFocusedProjectAction] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const projectButtonRef = useRef<HTMLButtonElement>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const branchRequests = useRef(new Set<string>())
  const firstRender = useRef(true)

  // Suppress full-width row hover fills while the panel width animates: a
  // `w-full` highlight resolves against the pre-transition width and is seen
  // shrinking with the panel.
  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setProjectMenuOpen(false)
    setSettling(true)
    const timer = window.setTimeout(() => setSettling(false), 300)
    return () => window.clearTimeout(timer)
  }, [collapsed])

  // Explicit projects first, then any session cwd not already covered.
  const knownProjects = useMemo(() => {
    const result = [...projects]
    const seen = new Set(result.map((project) => project.cwd))
    for (const session of sessions) {
      if (seen.has(session.cwd)) continue
      seen.add(session.cwd)
      const parts = session.cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
      result.push({ cwd: session.cwd, name: parts.at(-1) || session.cwd })
    }
    return result
  }, [projects, sessions])

  // Branch per project folder, resolved once per cwd. `branchRequests` dedupes
  // in-flight calls so a re-render mid-request cannot fire a second one.
  // Results are applied unconditionally whenever they land: the cache is
  // keyed by cwd, so a completed lookup stays valid even if `knownProjects`
  // changed while the request was in flight — cancelling it here would leave
  // the row blank with no effect rerun left to refill it.
  useEffect(() => {
    for (const { cwd } of knownProjects) {
      if (branchByCwd[cwd] !== undefined || branchRequests.current.has(cwd)) continue
      branchRequests.current.add(cwd)
      void window.myagent.git
        .branches(cwd)
        .then((result) => {
          const current = result.ok
            ? result.result.find((branch: GitBranch) => branch.current)?.name ?? null
            : null
          setBranchByCwd((previous) => ({ ...previous, [cwd]: current }))
        })
        .catch(() => {
          setBranchByCwd((previous) => ({ ...previous, [cwd]: null }))
        })
        .finally(() => {
          branchRequests.current.delete(cwd)
        })
    }
  }, [knownProjects, branchByCwd])

  // Source Control mutations (checkout above all) can move the current
  // branch; drop that cwd's cache entry so the lookup effect refetches it.
  useEffect(() => {
    const onGitMutated = (event: Event): void => {
      const detail = (event as CustomEvent<{ cwd?: string }>).detail
      const cwd = detail?.cwd
      if (!cwd) return
      setBranchByCwd((previous) => {
        if (!(cwd in previous)) return previous
        const next = { ...previous }
        delete next[cwd]
        return next
      })
    }
    window.addEventListener('myagent:git-mutated', onGitMutated)
    return () => window.removeEventListener('myagent:git-mutated', onGitMutated)
  }, [])

  useEffect(() => {
    if (!menu && !projectMenuOpen) return
    const dismiss = (): void => {
      setMenu(null)
      setProjectMenuOpen(false)
    }
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (
        menuRef.current?.contains(target) ||
        projectMenuRef.current?.contains(target) ||
        projectButtonRef.current?.contains(target)
      ) {
        return
      }
      dismiss()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('contextmenu', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', dismiss)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('contextmenu', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('resize', dismiss)
    }
  }, [menu, projectMenuOpen])

  // A removed project must not leave the list filtered to nothing.
  useEffect(() => {
    if (selectedCwd && !knownProjects.some((project) => project.cwd === selectedCwd)) {
      setSelectedCwd(null)
    }
  }, [knownProjects, selectedCwd])

  const openMenu = (event: React.MouseEvent, session: SessionMeta): void => {
    event.preventDefault()
    event.stopPropagation()
    setProjectMenuOpen(false)
    setMenu(null)
    const x = Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8)
    const y = Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 8)
    // Next microtask: the previous menu's capture-phase close listener must not
    // immediately dismiss this one.
    queueMicrotask(() => setMenu({ session, x, y }))
  }

  const currentProject = knownProjects.find((project) => project.cwd === selectedCwd)
  // "New session" is only a project-targeted compose when the sidebar filter
  // names a folder. Unfiltered, it must not silently retarget the Home
  // composer to the first known project — going Home preserves whatever the
  // user already picked there.
  const newSessionAction = (): void => {
    if (selectedCwd) onCompose(selectedCwd)
    else if (knownProjects.length > 0) onHome()
    else onAddProject()
  }

  // Live runs, ACROSS every project. This list deliberately ignores
  // `selectedCwd`: a run you started in another folder is exactly the thing the
  // project filter would otherwise hide from you, so urgency outranks scope.
  const runningSessions = useMemo(
    () => sessions.filter((session) => runningIds.has(session.id) && !archivedSessionIds.has(session.id)),
    [sessions, runningIds, archivedSessionIds]
  )

  // Running rows are pinned above the header, so they must not also appear
  // here — one row per session, never two.
  const visibleSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          !archivedSessionIds.has(session.id) &&
          !runningIds.has(session.id) &&
          (!selectedCwd || session.cwd === selectedCwd)
      ),
    [sessions, archivedSessionIds, runningIds, selectedCwd]
  )

  const archived = useMemo(
    () =>
      sessions.filter(
        (session) =>
          archivedSessionIds.has(session.id) && (!selectedCwd || session.cwd === selectedCwd)
      ),
    [sessions, archivedSessionIds, selectedCwd]
  )

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase()
    if (!query) return knownProjects
    return knownProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) || project.cwd.toLowerCase().includes(query)
    )
  }, [knownProjects, projectQuery])

  // Collapsed rail shows the 3 most relevant sessions (running first, then recent)
  // deduped so a running session does not appear twice - mirrors comet's
  // attention-ranked active list but capped for the narrow rail.
  const railSessions = useMemo(() => {
    const seen = new Set<string>()
    const out: SessionMeta[] = []
    for (const s of [...runningSessions, ...visibleSessions]) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push(s)
      if (out.length >= 3) break
    }
    return out
  }, [runningSessions, visibleSessions])

  // Grouped variant: every project folder in one place, sorted by latest
  // activity. Deliberately ignores `selectedCwd` — the inbox filter does not
  // apply here.
  const grouped = useMemo(() => {
    const byCwd = new Map<string, SessionMeta[]>()
    for (const session of sessions) {
      if (archivedSessionIds.has(session.id)) continue
      const list = byCwd.get(session.cwd)
      if (list) list.push(session)
      else byCwd.set(session.cwd, [session])
    }
    const out = knownProjects.map((project) => ({
      cwd: project.cwd,
      name: project.name,
      sessions: byCwd.get(project.cwd) ?? [],
      latest: byCwd.get(project.cwd)?.[0]?.modified ?? ''
    }))
    out.sort((a, b) => {
      if (!a.latest && !b.latest) return 0
      if (!a.latest) return -1
      if (!b.latest) return 1
      return a.latest < b.latest ? 1 : -1
    })
    return out
  }, [sessions, archivedSessionIds, knownProjects])

  const activeCwd = useMemo(
    () => sessions.find((session) => session.id === activeId)?.cwd ?? null,
    [sessions, activeId]
  )

  // A section stays open while its project is active until the user overrides
  // it; with nothing active, the first section leads.
  const isGroupOpen = (cwd: string, index: number): boolean => {
    if (cwd in toggled) return toggled[cwd]
    if (activeCwd) return cwd === activeCwd
    return index === 0
  }

  const handleGroupToggle = (index: number, nextOpen: boolean): void => {
    const cwd = grouped[index]?.cwd
    if (!cwd) return
    setToggled((previous) => ({ ...previous, [cwd]: nextOpen }))
  }

  // Comet edge_fade: 32px band, gated by scroll position (scrolled>1 && not at bottom)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = (): void => {
      const top = el.scrollTop > 1
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
      setShowTopFade(top)
      setShowBottomFade(bottom)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [visibleSessions, archived, collapsed, runningSessions])

  /** Two-line session row: title with age, then project and branch. A live
      run swaps the leading glyph for a pulsing dot, so status never costs a line. */
  const sessionRow = (session: SessionMeta, muted = false): JSX.Element => {
    const running = runningIds.has(session.id)
    const project = knownProjects.find((item) => item.cwd === session.cwd)
    const branch = branchByCwd[session.cwd]
    const active = session.id === activeId
    const held = menu?.session.id === session.id
    return (
      <motion.button
        key={session.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: EASE_OUT }}
        className={cn(
          'group relative flex w-full min-h-[46px] items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none',
          'transition-[background-color] duration-[var(--duration-instant)]',
          'focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'bg-selected' : 'hover:bg-hover',
          held && !active && 'bg-hover',
          muted && 'opacity-70 hover:opacity-100'
        )}
        onClick={() => onOpen(session.id)}
        onContextMenu={(event) => openMenu(event, session)}
        title={label(session)}
        aria-current={active ? 'true' : undefined}
      >
        <span className="mt-[3px] grid size-4 shrink-0 place-items-center" aria-hidden>
          {running ? (
            <span className="size-[7px] rounded-full bg-[color:var(--busy)] [animation:work-pulse_1.2s_ease-in-out_infinite]" />
          ) : (
            <HugeiconsIcon
              icon={Message01Icon}
              size={15}
              strokeWidth={1.5}
              className={active ? 'text-foreground' : 'text-foreground-subtlest'}
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-ui-base leading-[18px]',
                active ? 'font-medium text-foreground' : 'text-foreground/85'
              )}
            >
              {label(session)}
            </span>
            <span className="shrink-0 text-ui-xs tabular-nums text-foreground-subtlest">
              {relTime(session.modified)}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-ui-sm leading-[15px] text-foreground-subtle">
            <span className="min-w-0 shrink truncate">{project?.name ?? 'project'}</span>
            {branch && (
              <>
                <HugeiconsIcon icon={GitBranchIcon} size={11} strokeWidth={1.5} className="shrink-0 text-foreground-subtlest" aria-hidden />
                <span className="min-w-0 shrink-[2] truncate font-mono text-ui-xs text-foreground-subtlest">{branch}</span>
              </>
            )}
            {running && <span className="ml-auto shrink-0 text-ui-xs font-medium text-[color:var(--busy)]">Working</span>}
          </span>
        </span>
      </motion.button>
    )
  }

  /** Compact rectangle session row for the grouped variant (ported from
      the original grouped sidebar): single-line title + timestamp inside a
      left-border indent. Keeps a small status dot so live runs stay visible
      without the inbox row's 3-line bulk. */
  const groupedSessionRow = (session: SessionMeta): JSX.Element => {
    const running = runningIds.has(session.id)
    const active = session.id === activeId
    const held = menu?.session.id === session.id
    return (
      <button
        key={session.id}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left outline-none transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'bg-selected' : 'hover:bg-hover',
          held && 'bg-hover'
        )}
        onClick={() => onOpen(session.id)}
        onContextMenu={(event) => openMenu(event, session)}
        title={label(session)}
      >
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            running ? 'bg-success' : 'bg-muted-foreground/40'
          )}
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-ui-sm',
            active ? 'font-medium text-foreground' : 'text-muted-foreground'
          )}
        >
          {label(session)}
        </span>
        <span className="shrink-0 font-mono text-ui-xs text-muted-foreground">
          {relTime(session.modified)}
        </span>
      </button>
    )
  }

  // Comet-style rail button with right-side tooltip (coss/ui/tooltip).
  // Keeps native `title` for fallback, but shows a proper popup when collapsed.
  const railButton = (
    key: string,
    icon: JSX.Element,
    title: string,
    onClick: () => void,
    selected = false
  ): JSX.Element => (
    <Tooltip key={key}>
      <TooltipTrigger
        render={
          <button
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-lg outline-none transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
            )}
            aria-label={title}
            onClick={onClick}
          >
            {icon}
          </button>
        }
      />
      <TooltipPopup side="right" sideOffset={8} className="max-w-[220px] truncate">
        {title}
      </TooltipPopup>
    </Tooltip>
  )

  return (
    <TooltipProvider>
      <aside
        className={cn(
          // One speed both ways: the collapse used to start 80ms late while the
          // expand ran slower and overshot past the rail's own width, which read
          // as the sidebar bouncing. toggleSidebar masks the repaint meanwhile.
          'flex shrink-0 flex-col overflow-hidden transition-[width]',
          collapsed
            ? 'w-14 duration-[160ms] ease-[var(--ease-smooth-out)]'
            : 'w-[264px] duration-[180ms] ease-[var(--ease-smooth-out)]'
        )}
      >
        <div
          className="drag-region h-9 shrink-0"
          onDoubleClick={() => window.myagent.toggleMaximizeWindow().catch(() => {})}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2">
          {/* Running sessions sit above the project picker so a run in another
              folder stays visible. No header and no container of its own: the
              rows are identical to every other row, they just come first, and
              the group collapses away entirely when the last run finishes. */}
          <AnimatePresence initial={false}>
            {!collapsed && !isGrouped && runningSessions.length > 0 && (
              <motion.div
                key="running-sessions"
                className="w-[248px] shrink-0 space-y-[3px] overflow-hidden pb-1.5"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
              >
                <div className="no-scrollbar max-h-[280px] overflow-y-auto">
                  <AnimatePresence initial={false}>
                    {runningSessions.map((session) => sessionRow(session))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header. Collapsed it is a two-icon rail (expand, new session);
              expanded it is the project picker plus the new-session action.
              Fixed-size boxes anchored to the same edges in both states, so a
              hover fill rides the width transition instead of morphing. */}
          <div className={cn('flex shrink-0 items-center gap-1', collapsed ? 'h-auto py-1' : 'h-[52px]')}>
            {collapsed ? (
              <div className="flex w-full flex-col items-center gap-1">
                {railButton(
                  'new',
                  <Plus size={15} strokeWidth={1.9} />,
                  knownProjects.length > 0 ? 'New session' : 'Add a project first',
                  newSessionAction
                )}
                {railButton(
                  'search',
                  <Search01 size={15} strokeWidth={1.8} />,
                  'Search sessions',
                  () => {
                    // Expand and let the project filter receive focus via the header search
                    onToggle()
                  }
                )}
                <div className="my-1 h-px w-6 bg-border/50" />
                {railSessions.map((session) => {
                  const isActive = session.id === activeId
                  const isRunning = runningIds.has(session.id)
                  return (
                    <Tooltip key={`rail-${session.id}`}>
                      <TooltipTrigger
                        render={
                          <button
                            className={cn(
                              'relative grid size-8 shrink-0 place-items-center rounded-lg outline-none transition-colors',
                              'focus-visible:ring-2 focus-visible:ring-ring',
                              isActive
                                ? 'bg-selected text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_12%,transparent)]'
                                : 'text-muted-foreground hover:bg-hover hover:text-foreground',
                              isRunning && !isActive && 'ring-1 ring-[color:var(--busy)]/30'
                            )}
                            aria-label={label(session)}
                            onClick={() => onOpen(session.id)}
                            onContextMenu={(e) => openMenu(e as unknown as React.MouseEvent, session)}
                          >
                            <Message01 size={15} strokeWidth={1.8} />
                            {isRunning && (
                              <span className="absolute right-0.5 top-0.5 size-[6px] rounded-full bg-[color:var(--busy)] shadow-[0_0_0_1px_var(--background)]" />
                            )}
                          </button>
                        }
                      />
                      <TooltipPopup side="right" sideOffset={10} className="max-w-[240px]">
                        <div className="truncate text-ui-sm font-medium">{label(session)}</div>
                        <div className="truncate font-mono text-ui-xs text-foreground-subtlest">
                          {knownProjects.find((p) => p.cwd === session.cwd)?.name ?? 'project'} · {branchByCwd[session.cwd] ?? '—'}
                        </div>
                      </TooltipPopup>
                    </Tooltip>
                  )
                })}
                {railSessions.length === 0 && (
                  <span className="py-1 font-mono text-ui-xs text-foreground-subtlest">—</span>
                )}
                {archived.length > 0 &&
                  railButton(
                    'archived',
                    <Archive01 size={15} strokeWidth={1.8} />,
                    `Archived · ${archived.length}`,
                    () => {
                      onToggle()
                      // Open archived shelf after the expand animation settles
                      window.setTimeout(() => setArchivedOpen(true), 280)
                    }
                  )}
                <div className="my-1 h-px w-6 bg-border/50" />
                {railButton(
                  'expand',
                  <LayoutAlignRight size={16} strokeWidth={1.8} />,
                  'Expand sidebar',
                  onToggle
                )}
              </div>
            ) : isGrouped ? (
              <>
                <button
                  className={cn(
                    'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-ui-caption font-medium outline-none',
                    'focus-visible:ring-2 focus-visible:ring-ring',
                    !settling && 'transition-colors hover:bg-hover'
                  )}
                  title={knownProjects.length > 0 ? 'New session' : 'Add a project first'}
                  onClick={() => {
                    if (knownProjects.length > 0) onHome()
                    else onAddProject()
                  }}
                >
                  <Plus size={15} strokeWidth={1.9} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-foreground">New session</span>
                </button>
                {railButton(
                  'collapse',
                  <LayoutAlignLeft size={16} strokeWidth={1.8} />,
                  'Collapse sidebar',
                  onToggle
                )}
              </>
            ) : (
              <>
                <button
                  ref={projectButtonRef}
                  className={cn(
                    'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left outline-none',
                    'focus-visible:ring-2 focus-visible:ring-ring',
                    !settling && 'transition-colors',
                    projectMenuOpen ? 'bg-selected' : !settling && 'hover:bg-hover'
                  )}
                  title="Switch project"
                  onClick={() => {
                    setMenu(null)
                    setProjectQuery('')
                    setProjectMenuOpen((value) => !value)
                  }}
                >
                  <Folder02 size={15} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-ui-caption font-medium tracking-[-0.006em] text-foreground">
                    {currentProject?.name ?? 'All projects'}
                  </span>
                  <ChevronDown
                    size={13}
                    className={cn(
                      'shrink-0 text-foreground-subtlest transition-transform duration-200',
                      projectMenuOpen && 'rotate-180'
                    )}
                  />
                </button>
                {railButton(
                  'new',
                  <Plus size={15} strokeWidth={1.9} />,
                  knownProjects.length > 0 ? 'New session' : 'Add a project first',
                  newSessionAction
                )}
                {railButton(
                  'collapse',
                  <LayoutAlignLeft size={16} strokeWidth={1.8} />,
                  'Collapse sidebar',
                  onToggle
                )}
              </>
            )}
          </div>

          {/* The project picker stays fixed. Only the session/archive canvas
              below it scrolls, so changing the list never moves the picker or
              the running-session rows. Comet edge_fade: 28px mask gated by scroll. */}
          <div
            ref={scrollRef}
            className={cn(
              'no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden',
              showTopFade && showBottomFade && 'sidebar-fade',
              showTopFade && !showBottomFade && 'sidebar-fade-top',
              !showTopFade && showBottomFade && 'sidebar-fade-bottom'
            )}
          >
            {/* Everything below the header is expanded-only, under one fade that
                clears before the width animates. The pinned width keeps rows from
                re-wrapping frame by frame as the panel narrows. */}
            <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="expanded"
                className="w-[248px] shrink-0 pb-2"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: 0.16, delay: 0.02, ease: 'easeOut' }
                }}
                exit={{ opacity: 0, transition: { duration: 0.08, ease: 'easeIn' } }}
              >
                {isGrouped ? (
                  <>
                    <div className="flex items-center justify-between px-2 py-2">
                      <span className="text-ui-sm font-medium text-muted-foreground">
                        Projects
                      </span>
                      <button
                        className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                        title="Add project…"
                        aria-label="Add project…"
                        onClick={onAddProject}
                      >
                        <FolderAdd size={14} strokeWidth={1.8} />
                      </button>
                    </div>

                    {grouped.map((project, index) => {
                      const open = isGroupOpen(project.cwd, index)
                      const showProjectAction =
                        hoveredProjectAction === project.cwd || focusedProjectAction === project.cwd
                      return (
                        <motion.div
                          key={project.cwd}
                          className="pb-1"
                        >
                          <div
                            className={cn(
                              'group/proj relative flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-hover',
                              open && 'bg-hover'
                            )}
                            title={project.cwd}
                            onPointerEnter={() => setHoveredProjectAction(project.cwd)}
                            onPointerLeave={() => setHoveredProjectAction(null)}
                            onFocusCapture={(event) => {
                              if (
                                event.target instanceof HTMLElement &&
                                event.target.matches(':focus-visible')
                              ) {
                                setFocusedProjectAction(project.cwd)
                              }
                            }}
                            onBlurCapture={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                setFocusedProjectAction(null)
                              }
                            }}
                          >
                            <button
                              type="button"
                              className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => handleGroupToggle(index, !open)}
                              aria-expanded={open}
                            >
                              <ChevronRight
                                size={13}
                                strokeWidth={1.8}
                                className={cn(
                                  'shrink-0 text-muted-foreground transition-transform',
                                  open && 'rotate-90'
                                )}
                              />
                              {open ? (
                                <Folder02
                                  size={13}
                                  strokeWidth={1.8}
                                  className="shrink-0 text-foreground transition-opacity duration-[var(--duration-instant)]"
                                  style={{ opacity: showProjectAction ? 0 : 1 }}
                                />
                              ) : (
                                <Folder01
                                  size={13}
                                  strokeWidth={1.8}
                                  className="shrink-0 text-muted-foreground transition-opacity duration-[var(--duration-instant)]"
                                  style={{ opacity: showProjectAction ? 0 : 1 }}
                                />
                              )}
                              <span className="min-w-0 flex-1 truncate text-ui-caption font-medium">
                                {project.name}
                              </span>
                              <span className="shrink-0 rounded-full bg-muted px-1.5 py-px font-mono text-ui-xs text-muted-foreground">
                                {project.sessions.length}
                              </span>
                            </button>
                            <button
                              type="button"
                              className={cn(
                                'absolute left-[25.5px] top-1 z-10 grid size-5 place-items-center rounded-md text-muted-foreground transition-opacity duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                                !showProjectAction && 'pointer-events-none'
                              )}
                              style={{ opacity: showProjectAction ? 1 : 0 }}
                              title={`New session in ${project.name}`}
                              aria-label={`New session in ${project.name}`}
                              onClick={() => onCompose(project.cwd)}
                            >
                              <Plus
                                size={13}
                                strokeWidth={2}
                                className="absolute"
                              />
                            </button>
                          </div>

                          <AnimatePresence initial={false}>
                            {open && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15, ease: 'easeOut' }}
                                className="overflow-hidden"
                              >
                                {project.sessions.length > 0 ? (
                                  <div className="ml-4 border-l border-border pl-2">
                                    {project.sessions.map((session) => groupedSessionRow(session))}
                                  </div>
                                ) : (
                                  <div className="ml-4 border-l border-border pl-2">
                                    <button
                                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                                      onClick={() => onCompose(project.cwd)}
                                    >
                                      <Plus size={12} strokeWidth={1.8} className="shrink-0" />
                                      <span className="text-ui-sm">Start first session</span>
                                    </button>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )
                    })}

                    {grouped.every((project) => project.sessions.length === 0) && (
                      <div className="mt-2 rounded-lg border border-dashed border-border/70 px-3 py-5 text-center">
                        <Message01
                          size={18}
                          strokeWidth={1.6}
                          className="mx-auto mb-2 text-foreground-subtlest"
                        />
                        <p className="text-ui-sm text-foreground-subtlest">
                          {knownProjects.length === 0 ? 'No projects yet' : 'No sessions yet'}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                {visibleSessions.length > 0 && (
                  <div className="flex items-center gap-2 px-2.5 pb-0.5 pt-1.5">
                    <span className="text-ui-sm font-medium text-muted-foreground">Sessions</span>
                  </div>
                )}

                <div className="space-y-[3px] pt-0.5">
                  <AnimatePresence initial={false}>
                    {visibleSessions.map((session) => sessionRow(session))}
                  </AnimatePresence>
                </div>

                {visibleSessions.length === 0 && runningSessions.length === 0 && (
                  <div className="mt-2 rounded-lg border border-dashed border-border/70 px-3 py-5 text-center">
                    <Message01
                      size={18}
                      strokeWidth={1.6}
                      className="mx-auto mb-2 text-foreground-subtlest"
                    />
                    <p className="text-ui-sm text-foreground-subtlest">
                      {knownProjects.length === 0 ? 'No projects yet' : 'No sessions here'}
                    </p>
                    <button
                      className="mt-2.5 inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-ui-sm font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                      onClick={newSessionAction}
                    >
                      <Plus size={11} strokeWidth={2} />
                      {knownProjects.length > 0 ? 'New session' : 'Add project'}
                    </button>
                  </div>
                )}
                  </>
                )}

                {/* Archived shelf. Count only while collapsed — expanded, the
                    rows speak for themselves. */}
                {archived.length > 0 && (
                  <div className="mt-3">
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-foreground-subtlest transition-colors hover:bg-hover hover:text-foreground"
                      onClick={() => {
                        setArchivedShown(ARCHIVED_INITIAL)
                        setArchivedOpen((value) => !value)
                      }}
                    >
                      <Archive01 size={12} strokeWidth={1.8} className="shrink-0" />
                      <span className="whitespace-nowrap text-ui-sm">
                        {archivedOpen ? 'Archived' : `Archived · ${archived.length}`}
                      </span>
                      <span className="h-px min-w-0 flex-1 bg-border/60" />
                      <ChevronRight
                        size={11}
                        className={cn(
                          'shrink-0 transition-transform duration-200',
                          archivedOpen && 'rotate-90'
                        )}
                      />
                    </button>

                    <AnimatePresence initial={false}>
                      {archivedOpen && (
                        <motion.div
                          variants={{
                            open: {
                              height: 'auto',
                              opacity: 1,
                              transition: {
                                height: { duration: 0.24, ease: EASE_OUT },
                                opacity: { duration: 0.18, ease: 'easeOut' }
                              }
                            },
                            closed: {
                              height: 0,
                              opacity: 0,
                              transition: {
                                height: { duration: 0.2, ease: EASE_IN },
                                opacity: { duration: 0.14, ease: 'easeIn', delay: 0.04 }
                              }
                            }
                          }}
                          initial="closed"
                          animate="open"
                          exit="closed"
                          className="w-[248px] overflow-hidden"
                        >
                          <motion.div
                            variants={{
                              open: { y: 0, transition: { duration: 0.24, ease: EASE_OUT } },
                              closed: { y: -8, transition: { duration: 0.2, ease: EASE_IN } }
                            }}
                            className="mt-0.5 space-y-[3px] pl-1.5"
                          >
                            {archived.slice(0, archivedShown).map((session) => (
                              <motion.div
                                key={session.id}
                                variants={{
                                  open: { opacity: 1, transition: { duration: 0.18, ease: EASE_OUT } },
                                  closed: { opacity: 0, transition: { duration: 0.1, ease: EASE_IN } }
                                }}
                              >
                                {sessionRow(session, true)}
                              </motion.div>
                            ))}

                            {archived.length > archivedShown && (
                              <motion.button
                                variants={{
                                  open: { opacity: 1, transition: { duration: 0.18, ease: EASE_OUT } },
                                  closed: { opacity: 0, transition: { duration: 0.1, ease: EASE_IN } }
                                }}
                                className="flex h-8 w-full items-center rounded-lg px-2.5 text-left text-ui-sm text-foreground-subtlest transition-colors hover:bg-hover hover:text-foreground"
                                onClick={() => setArchivedShown((value) => value + ARCHIVED_PAGE)}
                              >
                                Show {Math.min(ARCHIVED_PAGE, archived.length - archivedShown)} more
                              </motion.button>
                            )}
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer: settings only. New sessions are created from the picker
            action above, keeping one clear creation affordance in the shell. */}
        <div className="shrink-0 px-2 pb-2 pt-1">
          <div className="mb-1 h-px bg-border/50" />
          <button
            className={cn(
              'flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-ui-sm font-semibold outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring',
              settingsOpen ? 'bg-selected text-foreground' : 'text-muted-foreground',
              !settingsOpen && !settling && 'transition-colors hover:bg-hover hover:text-foreground',
              collapsed && 'justify-center px-0'
            )}
            title="Settings"
            aria-label="Settings"
            onClick={onSettings}
          >
            <Settings01 size={16} strokeWidth={1.8} />
            <CollapseLabel show={!collapsed}>Settings</CollapseLabel>
          </button>
        </div>
      </aside>

      {/* Project picker. Fixed-positioned so the sidebar's collapse clip cannot
          cut it off. */}
      <AnimatePresence>
        {projectMenuOpen && !collapsed && !isGrouped && (
          <motion.div
            ref={projectMenuRef}
            variants={bloomDown}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={BLOOM_FAST}
            className="fixed z-[60] w-[252px] origin-top-left overflow-hidden rounded-lg border border-popover-border bg-menu $1 shadow-md"
            style={{
              left: projectButtonRef.current?.getBoundingClientRect().left ?? 12,
              top: (projectButtonRef.current?.getBoundingClientRect().bottom ?? 80) + 6
            }}
          >
            <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-2.5">
              <Search01 size={12} strokeWidth={1.8} className="shrink-0 text-foreground-subtlest" />
              <input
                autoFocus
                value={projectQuery}
                onChange={(event) => setProjectQuery(event.target.value)}
                placeholder="Search projects…"
                className="h-8 min-w-0 flex-1 bg-transparent text-ui-sm text-foreground outline-none placeholder:text-foreground-subtlest"
              />
            </div>

            <div className="no-scrollbar mt-1 max-h-[240px] overflow-y-auto">
              <button
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui-sm transition-colors hover:bg-hover',
                  selectedCwd === null && 'bg-selected'
                )}
                onClick={() => {
                  setSelectedCwd(null)
                  setProjectMenuOpen(false)
                }}
              >
                <Folder02 size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">All projects</span>
                {selectedCwd === null && <Tick01 size={12} className="shrink-0 text-muted-foreground" />}
              </button>

              {filteredProjects.map((project) => (
                <button
                  key={project.cwd}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui-sm transition-colors hover:bg-hover',
                    selectedCwd === project.cwd && 'bg-selected'
                  )}
                  title={project.cwd}
                  onClick={() => {
                    setSelectedCwd(project.cwd)
                    setProjectMenuOpen(false)
                  }}
                >
                  <Folder01 size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {selectedCwd === project.cwd && (
                    <Tick01 size={12} className="shrink-0 text-muted-foreground" />
                  )}
                </button>
              ))}

              {filteredProjects.length === 0 && (
                <p className="px-2.5 py-3 text-center text-ui-sm text-muted-foreground">
                  No match
                </p>
              )}
            </div>

            <div className="mt-1 border-t border-border/60 pt-1">
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                onClick={() => {
                  setProjectMenuOpen(false)
                  onAddProject()
                }}
              >
                <FolderAdd size={14} strokeWidth={1.8} className="shrink-0" />
                <span>Add project…</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menu && (
          <motion.div
            ref={menuRef}
            variants={bloomDown}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={BLOOM_FAST}
            className="fixed z-[61] w-[240px] origin-top-left overflow-hidden rounded-lg border border-popover-border bg-menu $1 shadow-md"
            style={{ left: menu.x, top: menu.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <div className="px-3 pb-1 pt-1.5 text-ui-xs font-medium text-foreground-subtlest">
              session · {menu.session.id.slice(0, 8)}
            </div>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ui-caption text-foreground transition-colors hover:bg-hover"
              onClick={() => {
                onOpen(menu.session.id)
                setMenu(null)
              }}
            >
              <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
              <span>Open session</span>
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ui-caption text-foreground transition-colors hover:bg-hover"
              onClick={() => {
                onRename(menu.session.id, menu.session.title || menu.session.preview || '')
                setMenu(null)
              }}
            >
              <Edit01 size={12} className="shrink-0 text-muted-foreground" />
              <span>Rename</span>
            </button>
            {archivedSessionIds.has(menu.session.id) ? (
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ui-caption text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                onClick={() => {
                  onRestore(menu.session.id)
                  setMenu(null)
                }}
              >
                <ArchiveRestore size={12} className="shrink-0" />
                <span>Restore</span>
              </button>
            ) : (
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ui-caption text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                onClick={() => {
                  onArchive(menu.session.id)
                  setMenu(null)
                }}
              >
                <Archive01 size={12} className="shrink-0" />
                <span>Archive</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipProvider>
  )
}

export default memo(Sidebar)
