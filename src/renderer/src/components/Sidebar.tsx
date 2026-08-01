import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Plus,
  Folder01,
  Folder02,
  FolderAdd,
  ChevronRight,
  Archive01,
  Edit01,
  LayoutAlignLeft,
  LayoutAlignRight,
  Settings01,
  Square,
  SquarePenIcon
} from './ui/icons'
import type { SessionMeta } from '../../../shared/protocol'
import { relTime } from '../util'
import { cn } from '../util'

interface Menu {
  session: SessionMeta
  x: number
  y: number
}

const MENU_WIDTH = 240
const MENU_HEIGHT_ESTIMATE = 140

interface Project {
  cwd: string
  name: string
  sessions: SessionMeta[]
  latest: string
}

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
  /** Brand label shown when the sidebar is expanded. */
  appName: string
}

export default function Sidebar({
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
  appName
}: Props): JSX.Element {
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<Menu | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    const onBlur = (): void => close()
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('contextmenu', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('contextmenu', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  const openMenu = (e: React.MouseEvent, session: SessionMeta): void => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - MENU_WIDTH - 8)
    const y = Math.min(e.clientY, window.innerHeight - MENU_HEIGHT_ESTIMATE - 8)
    // Close any existing menu synchronously, then open the new one on the next
    // microtask so the capture-phase close listener from the previous menu
    // does not immediately re-close this one.
    setMenu(null)
    queueMicrotask(() => setMenu({ session, x, y }))
  }

  const grouped = useMemo<Project[]>(() => {
    const byCwd = new Map<string, SessionMeta[]>()
    for (const s of sessions) {
      if (archivedSessionIds.has(s.id)) continue
      const list = byCwd.get(s.cwd)
      if (list) list.push(s)
      else byCwd.set(s.cwd, [s])
    }
    const out: Project[] = projects.map((p) => ({
      cwd: p.cwd,
      name: p.name,
      sessions: byCwd.get(p.cwd) ?? [],
      latest: byCwd.get(p.cwd)?.[0]?.modified ?? ''
    }))
    out.sort((a, b) => {
      if (!a.latest && !b.latest) return 0
      if (!a.latest) return -1
      if (!b.latest) return 1
      return a.latest < b.latest ? 1 : -1
    })
    return out
  }, [archivedSessionIds, sessions, projects])

  const activeCwd = useMemo(
    () => sessions.find((s) => s.id === activeId)?.cwd ?? null,
    [sessions, activeId]
  )

  // Codex-style quick access: the freshest threads across all projects.
  // Sessions arrive newest-first from App.
  const recent = useMemo(
    () => sessions.filter((s) => !archivedSessionIds.has(s.id)).slice(0, 4),
    [sessions, archivedSessionIds]
  )

  const isOpen = (p: Project, index: number): boolean => {
    if (p.cwd in toggled) return toggled[p.cwd]
    if (activeCwd) return p.cwd === activeCwd
    return index === 0
  }

  return (
    <>
    {/* No fill of its own — the sidebar rides directly on the window shell, so
        whatever backdrop the host resolved shows through it. */}
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-hidden transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-[260px]'
      )}
    >
      <div className={cn('drag-region flex h-9 shrink-0 items-center', collapsed ? 'justify-center' : 'pl-3.5')}>
        {!collapsed && (
          <span className="select-none truncate text-[12.5px] font-semibold tracking-tight text-foreground">
            {appName}
          </span>
        )}
      </div>

      <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto', collapsed ? 'px-1.5' : 'px-2')}>
        {/* h-[52px] matches ChatHeader so the first sidebar row and the panel
            header share a baseline across the seam. */}
        <div className={cn('flex h-[52px] shrink-0 items-center', collapsed ? 'justify-center' : 'pl-1')}>
          <button
            className={cn(
              'grid place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-selected hover:text-foreground',
              collapsed ? 'h-9 w-full' : 'size-8'
            )}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggle}
          >
            {collapsed ? <LayoutAlignRight size={16} strokeWidth={1.8} /> : <LayoutAlignLeft size={16} strokeWidth={1.8} />}
          </button>
        </div>

        <button
          className={cn(
            'mb-3 flex h-9 shrink-0 items-center rounded-lg text-[12.5px] font-medium text-foreground transition-colors hover:bg-hover',
            collapsed ? 'w-full justify-center' : 'w-full gap-2.5 px-3 text-left'
          )}
          title={collapsed ? 'New Chat' : undefined}
          aria-label={collapsed ? 'New Chat' : undefined}
          onClick={onHome}
        >
          <span className="relative grid size-[14px] shrink-0 place-items-center text-muted-foreground" aria-hidden="true">
            <Square size={14} strokeWidth={1.8} className="absolute" />
            <SquarePenIcon size={10} strokeWidth={1.8} className="absolute" />
          </span>
          {!collapsed && <span>New Chat</span>}
        </button>

        {!collapsed && recent.length > 0 && (
          <div className="mb-4 space-y-0.5">
            {recent.map((s) => {
              const running = runningIds.has(s.id)
              return (
                <button
                  key={s.id}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                    s.id === activeId ? 'bg-selected' : 'hover:bg-hover',
                    menu?.session.id === s.id && 'bg-hover'
                  )}
                  onClick={() => onOpen(s.id)}
                  onContextMenu={(e) => openMenu(e, s)}
                  title={s.title || s.preview || s.id}
                >
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      running ? 'bg-success' : 'bg-muted-foreground/40'
                    )}
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[12px]',
                      s.id === activeId ? 'font-medium text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {s.title || s.preview || `${s.messageCount} messages`}
                  </span>
                  {running && (
                    <span className="shrink-0 rounded-full border border-success/30 bg-success/10 px-1.5 py-px text-[10px] font-medium text-success-foreground">
                      Running
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                    {relTime(s.modified)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {!collapsed && <div className="flex items-center justify-between px-2.5 pb-1 pt-0.5">
          <span className="text-[12px] text-muted-foreground">
            Threads
          </span>
          <button
            className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Add project…"
            onClick={onAddProject}
          >
            <FolderAdd size={14} strokeWidth={1.8} />
          </button>
        </div>}

        {!collapsed && grouped.map((p, i) => {
          const open = isOpen(p, i)
          return (
            <motion.div key={p.cwd} layout="position" transition={{ duration: 0.18, ease: 'easeOut' }}>
              <div
                className="group flex items-center rounded-lg transition-colors hover:bg-hover"
                title={p.cwd}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 pr-1 text-left"
                  onClick={() => setToggled((t) => ({ ...t, [p.cwd]: !open }))}
                >
                  {open
                    ? <Folder02 size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
                    : <Folder01 size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
                  }
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{p.name}</span>
                </button>
                <button
                  className="mr-1.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-accent hover:text-primary group-hover:opacity-100"
                  title={`New session in ${p.name}`}
                  onClick={() => onCompose(p.cwd)}
                >
                  <Plus size={13} />
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
                    {p.sessions.length > 0 ? (
                      <div className="pl-4">
                        {p.sessions.map((s) => (
                          <button
                            key={s.id}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors',
                              s.id === activeId ? 'bg-selected' : 'hover:bg-hover',
                              menu?.session.id === s.id && 'bg-hover'
                            )}
                            onClick={() => onOpen(s.id)}
                            onContextMenu={(e) => openMenu(e, s)}
                            title={s.title || s.preview || s.id}
                          >
                            <span
                              className={cn(
                                'min-w-0 flex-1 truncate text-[12px]',
                                s.id === activeId
                                  ? 'font-medium text-foreground'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {s.title || s.preview || `${s.messageCount} messages`}
                            </span>
                            <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                              {relTime(s.modified)}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="pl-4">
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                          onClick={() => onCompose(p.cwd)}
                        >
                          <Plus size={12} strokeWidth={1.8} className="shrink-0" />
                          <span className="text-[12px]">Start first session</span>
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}

        {!collapsed && (
          <button
            className="flex w-full items-center gap-2 rounded-lg py-1.5 pl-2 pr-1 text-left text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            onClick={onAddProject}
          >
            <FolderAdd size={14} strokeWidth={1.8} className="shrink-0" />
            <span className="text-[12.5px]">Add project</span>
          </button>
        )}

      </div>
      <div className={cn('shrink-0 py-2', collapsed ? 'px-1.5' : 'px-2')}>
        <button
          className={cn(
            'flex h-9 items-center rounded-lg text-[12.5px] font-medium transition-colors',
            collapsed ? 'w-full justify-center' : 'w-full gap-2 px-3 text-left',
            settingsOpen ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-selected hover:text-foreground'
          )}
          title={collapsed ? 'Settings' : undefined}
          aria-label="Settings"
          onClick={onSettings}
        >
          <Settings01 size={15} strokeWidth={1.8} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>

    <AnimatePresence>
    {menu && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="fixed z-[51] w-[240px] overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl shadow-black/25"
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(e) => e.preventDefault()}
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
        </motion.div>
    )}
    </AnimatePresence>
    </>
  )
}
