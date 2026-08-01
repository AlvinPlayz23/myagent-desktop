import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Archive01, ArrowShrink01, Cpu, Edit01, MoreHorizontal, PanelLeftOpen } from './ui/icons'
import type { ChatState } from '../state'
import { baseName, cn } from '../util'

interface Props {
  chat: ChatState
  title?: string
  onCompact(): void
  onRename(): void
  onArchive(): void
  /** Sidebar is collapsed, so the header owns the button that reopens it. */
  sidebarCollapsed: boolean
  onShowSidebar(): void
  // debug-panel: toggles the LLM debug drawer (see ../debug-panel/README.md)
  onToggleDebug(): void
  // debug-panel: whether the drawer is currently open (drives the toggle's active state)
  debugOpen: boolean
}

export default function ChatHeader({
  chat,
  title,
  onCompact,
  onRename,
  onArchive,
  sidebarCollapsed,
  onShowSidebar,
  onToggleDebug,
  debugOpen
}: Props): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (): void => setMenuOpen(false)
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [menuOpen])

  const project = baseName(chat.cwd)

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-4">
      {sidebarCollapsed && (
        <button
          className="no-drag grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          title="Show sidebar"
          aria-label="Show sidebar"
          onClick={onShowSidebar}
        >
          <PanelLeftOpen size={15} strokeWidth={1.8} />
        </button>
      )}

      <div className="pointer-events-none flex min-w-0 select-none items-center gap-2">
        <span className="truncate text-[14px] font-medium text-foreground">
          {title || project}
        </span>
        <span className="shrink-0 truncate text-[12.5px] text-muted-foreground">{project}</span>
        {chat.running && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-px text-[10.5px] font-medium uppercase tracking-wider text-success-foreground">
            <span className="size-1.5 rounded-full bg-success [animation:work-pulse_1.6s_ease-in-out_infinite]" />
            Running
          </span>
        )}
      </div>

      <div className="no-drag relative ml-auto flex items-center gap-1">
        {/* debug-panel: toggle button for the LLM debug drawer (also closes it) */}
        <button
          className={cn(
            'grid size-8 place-items-center rounded-full transition-colors',
            debugOpen
              ? 'bg-selected text-foreground'
              : 'text-muted-foreground hover:bg-hover hover:text-foreground'
          )}
          title={debugOpen ? 'Close LLM debug panel' : 'Open LLM debug panel'}
          aria-pressed={debugOpen}
          onClick={onToggleDebug}
        >
          <Cpu size={15} strokeWidth={1.8} />
        </button>

        <button
          className={cn(
            'grid size-8 place-items-center rounded-full transition-colors',
            menuOpen
              ? 'bg-selected text-foreground'
              : 'text-muted-foreground hover:bg-hover hover:text-foreground'
          )}
          title="More"
          aria-label="More actions"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MoreHorizontal size={16} strokeWidth={1.8} />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="absolute right-0 top-9 z-50 w-[200px] overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl shadow-black/25"
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:bg-hover"
                onClick={() => {
                  onRename()
                  setMenuOpen(false)
                }}
              >
                <Edit01 size={12} className="shrink-0 text-muted-foreground" />
                <span>Rename</span>
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:bg-hover disabled:pointer-events-none disabled:opacity-40"
                disabled={chat.running}
                title={chat.running ? 'Stop the active run before compacting' : undefined}
                onClick={() => {
                  onCompact()
                  setMenuOpen(false)
                }}
              >
                <ArrowShrink01 size={12} className="shrink-0 text-muted-foreground" />
                <span>Compact context</span>
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                onClick={() => {
                  onArchive()
                  setMenuOpen(false)
                }}
              >
                <Archive01 size={12} className="shrink-0" />
                <span>Archive</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
