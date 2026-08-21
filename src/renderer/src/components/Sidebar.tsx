import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
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
          initial={{ opacity: 0, filter: 'blur(4px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)', transition: { duration: 0.18, delay: 0.08, ease: 'easeOut' } }}
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
  onRestore
}: Props): JSX.Element {
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [projectQuery, setProjectQuery] = useState('')
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [archivedShown, setArchivedShown] = useState(ARCHIVED_INITIAL)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [branchByCwd, setBranchByCwd] = useState<Record<string, string | null>>({})
  const [settling, setSettling] = useState(false)
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

  /** Three-line session row: context · title · branch, status pinned right. */
  const sessionRow = (session: SessionMeta, muted = false): JSX.Element => {
    const running = runningIds.has(session.id)
    const project = knownProjects.find((item) => item.cwd === session.cwd)
    const branch = branchByCwd[session.cwd]
    const active = session.id === activeId
    const held = menu?.session.id === session.id
    return (
      <motion.button
        key={session.id}
        layout="position"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: EASE_OUT }}
        className={cn(
          'group relative block w-full rounded-[10px] px-2.5 py-[7px] text-left outline-none',
          'transition-[background-color,box-shadow] duration-150',
          'focus-visible:ring-2 focus-visible:ring-ring',
          active
            ? 'bg-selected shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_12%,transparent)]'
            : 'hover:bg-hover',
          held && !active && 'bg-hover',
          muted && 'opacity-70 hover:opacity-100'
        )}
        onClick={() => onOpen(session.id)}
        onContextMenu={(event) => openMenu(event, session)}
        title={label(session)}
      >
        {/* Line 1 — where: project @ device, with the timestamp pinned right. */}
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[10px] leading-[13px] tracking-[0.01em] text-muted-foreground/60">
            {project?.name ?? 'project'} <span className="text-muted-foreground/40">@ local</span>
          </span>
          <span className="ml-auto shrink-0 font-mono text-[9.5px] tabular-nums text-muted-foreground/45">
            {relTime(session.modified)}
          </span>
        </div>

        {/* Line 2 — what: the loudest thing in the row. */}
        <div
          className={cn(
            'mt-[3px] truncate text-[12.5px] leading-[17px] tracking-[-0.006em]',
            active ? 'font-medium text-foreground' : 'font-[450] text-foreground/85'
          )}
        >
          {label(session)}
        </div>

        {/* Line 3 — on what code, plus the live-run indicator. */}
        <div className="mt-[3px] flex min-w-0 items-center gap-1.5">
          <GitBranch01
            size={10}
            strokeWidth={1.8}
            className="shrink-0 text-muted-foreground/45"
          />
          <span className="min-w-0 truncate font-mono text-[9.5px] leading-[13px] text-muted-foreground/50">
            {branch ?? '—'}
          </span>
          <AnimatePresence initial={false}>
            {running && (
              <motion.span
                className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] font-medium text-[color:var(--busy)]"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.14, ease: EASE_OUT }}
              >
                <span className="size-[5px] rounded-full bg-[color:var(--busy)]" />
                Working
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </motion.button>
    )
  }

  const railButton = (
    key: string,
    icon: JSX.Element,
    title: string,
    onClick: () => void,
    selected = false
  ): JSX.Element => (
    <button
      key={key}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
      )}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {icon}
    </button>
  )

  return (
    <>
      <aside
        className={cn(
          'flex shrink-0 flex-col overflow-hidden transition-[width]',
          collapsed
            ? 'w-14 duration-[170ms] delay-[80ms] ease-[cubic-bezier(0.32,0.72,0,1)]'
            : 'w-[264px] duration-[280ms] ease-[cubic-bezier(0.34,1.4,0.64,1)]'
        )}
      >
        <div className="drag-region h-9 shrink-0" />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2">
          {/* Running sessions sit above the project picker so a run in another
              folder stays visible. No header and no container of its own: the
              rows are identical to every other row, they just come first, and
              the group collapses away entirely when the last run finishes. */}
          <AnimatePresence initial={false}>
            {!collapsed && runningSessions.length > 0 && (
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
          <div className={cn('flex shrink-0 items-center gap-1', collapsed ? 'h-auto' : 'h-[52px]')}>
            {collapsed ? (
              <div className="flex w-full flex-col items-center gap-1">
                {railButton(
                  'new',
                  <Plus size={15} strokeWidth={1.9} />,
                  knownProjects.length > 0 ? 'New session' : 'Add a project first',
                  newSessionAction
                )}
                {railButton(
                  'expand',
                  <LayoutAlignRight size={16} strokeWidth={1.8} />,
                  'Expand sidebar',
                  onToggle
                )}
              </div>
            ) : (
              <>
                <button
                  ref={projectButtonRef}
                  className={cn(
                    'flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] px-2 text-left outline-none',
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
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-[-0.006em] text-foreground">
                    {currentProject?.name ?? 'All projects'}
                  </span>
                  <ChevronDown
                    size={13}
                    className={cn(
                      'shrink-0 text-muted-foreground/70 transition-transform duration-200',
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
              the running-session rows. */}
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {/* Everything below the header is expanded-only, under one fade that
                clears before the width animates. The pinned width keeps rows from
                re-wrapping frame by frame as the panel narrows. */}
            <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                key="expanded"
                className="w-[248px] shrink-0 pb-2"
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{
                  opacity: 1,
                  filter: 'blur(0px)',
                  transition: { duration: 0.2, delay: 0.08, ease: 'easeOut' }
                }}
                exit={{ opacity: 0, transition: { duration: 0.08, ease: 'easeIn' } }}
              >
                <div className="space-y-[3px] pt-0.5">
                  <AnimatePresence initial={false}>
                    {visibleSessions.map((session) => sessionRow(session))}
                  </AnimatePresence>
                </div>

                {visibleSessions.length === 0 && runningSessions.length === 0 && (
                  <div className="mt-2 rounded-[10px] border border-dashed border-border/70 px-3 py-5 text-center">
                    <Message01
                      size={18}
                      strokeWidth={1.6}
                      className="mx-auto mb-2 text-muted-foreground/40"
                    />
                    <p className="text-[11.5px] text-muted-foreground/70">
                      {knownProjects.length === 0 ? 'No projects yet' : 'No sessions here'}
                    </p>
                    <button
                      className="mt-2.5 inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                      onClick={newSessionAction}
                    >
                      <Plus size={11} strokeWidth={2} />
                      {knownProjects.length > 0 ? 'New session' : 'Add project'}
                    </button>
                  </div>
                )}

                {/* Archived shelf. Count only while collapsed — expanded, the
                    rows speak for themselves. */}
                {archived.length > 0 && (
                  <div className="mt-3">
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-muted-foreground/70 transition-colors hover:bg-hover hover:text-foreground"
                      onClick={() => {
                        setArchivedShown(ARCHIVED_INITIAL)
                        setArchivedOpen((value) => !value)
                      }}
                    >
                      <Archive01 size={12} strokeWidth={1.8} className="shrink-0" />
                      <span className="whitespace-nowrap text-[11px]">
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
                                height: { duration: 0.26, ease: EASE_OUT },
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
                              open: { y: 0, transition: { duration: 0.26, ease: EASE_OUT } },
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
                                className="flex h-8 w-full items-center rounded-lg px-2.5 text-left text-[11px] text-muted-foreground/70 transition-colors hover:bg-hover hover:text-foreground"
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
              'flex h-9 w-full items-center gap-2 rounded-[10px] text-left text-[12px] font-medium outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring',
              settingsOpen ? 'bg-selected text-foreground' : 'text-muted-foreground',
              !settingsOpen && !settling && 'transition-colors hover:bg-hover hover:text-foreground',
              collapsed && 'justify-center'
            )}
            title="Settings"
            aria-label="Settings"
            onClick={onSettings}
          >
            <Settings01 size={15} strokeWidth={1.8} />
            <CollapseLabel show={!collapsed}>Settings</CollapseLabel>
          </button>
        </div>
      </aside>

      {/* Project picker. Fixed-positioned so the sidebar's collapse clip cannot
          cut it off. */}
      <AnimatePresence>
        {projectMenuOpen && !collapsed && (
          <motion.div
            ref={projectMenuRef}
            variants={bloomDown}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={BLOOM_FAST}
            className="fixed z-[60] w-[252px] origin-top-left overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl shadow-black/30"
            style={{
              left: projectButtonRef.current?.getBoundingClientRect().left ?? 12,
              top: (projectButtonRef.current?.getBoundingClientRect().bottom ?? 80) + 6
            }}
          >
            <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-2.5">
              <Search01 size={12} strokeWidth={1.8} className="shrink-0 text-muted-foreground/70" />
              <input
                autoFocus
                value={projectQuery}
                onChange={(event) => setProjectQuery(event.target.value)}
                placeholder="Search projects…"
                className="h-8 min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="no-scrollbar mt-1 max-h-[240px] overflow-y-auto">
              <button
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-hover',
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
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-hover',
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
                <p className="px-2.5 py-3 text-center text-[11.5px] text-muted-foreground/60">
                  No match
                </p>
              )}
            </div>

            <div className="mt-1 border-t border-border/60 pt-1">
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
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
            className="fixed z-[61] w-[240px] origin-top-left overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl shadow-black/25"
            style={{ left: menu.x, top: menu.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <div className="px-3 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
              session · {menu.session.id.slice(0, 8)}
            </div>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:bg-hover"
              onClick={() => {
                onOpen(menu.session.id)
                setMenu(null)
              }}
            >
              <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
              <span>Open session</span>
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:bg-hover"
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
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
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
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
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
    </>
  )
}

export default memo(Sidebar)
