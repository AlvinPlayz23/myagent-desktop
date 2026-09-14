import { memo, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '../util'
import { BLOOM_FAST, bloomDown } from '../motion'
import type { SessionMeta } from '../../../shared/protocol'
import type { ChatState } from '../state'

interface TabProps {
  label: string
  active: boolean
  running: boolean
  onSelect(): void
  onClose(e: React.MouseEvent): void
}

function Tab({ label, active, running, onSelect, onClose }: TabProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={label}
      className={cn(
        'group relative flex h-7 min-w-0 max-w-[180px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-left text-[12px] font-medium transition-[background-color,color,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] select-none',
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
    >
      {running && (
        <span className="size-1.5 shrink-0 rounded-full bg-success" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        role="button"
        aria-label="Close tab"
        onClick={onClose}
        className={cn(
          'grid size-4 shrink-0 place-items-center rounded-sm transition-[background-color,color,opacity] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)]',
          active
            ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
            : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
          <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    </button>
  )
}

interface Props {
  tabOrder: string[]
  chats: Record<string, ChatState>
  sessions: SessionMeta[]
  activeId: string | null
  runningIds: Set<string>
  appName: string
  onSelect(id: string): void
  onClose(id: string): void
}

// Fixed cap for the visible tab strip. Anything beyond this is hidden
// behind the +N overflow menu.
const MAX_VISIBLE_TABS = 8

interface OverflowProps {
  hiddenIds: string[]
  labelFor(id: string): string
  runningIds: Set<string>
  onSelect(id: string): void
  onClose(id: string): void
}

function OverflowMenu({ hiddenIds, labelFor, runningIds, onSelect, onClose }: OverflowProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | null>(null)

  const cancelClose = (): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = (): void => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), 150)
  }
  const openMenu = (): void => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setPos({ left: Math.min(rect.left, window.innerWidth - 252), top: rect.bottom + 6 })
    cancelClose()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', () => setOpen(false))
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      cancelClose()
    }
  }, [open])

  useEffect(() => () => cancelClose(), [])

  return (
    <>
      <div
        ref={rootRef}
        className="no-drag flex shrink-0 items-center gap-1.5"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <div className="h-5 w-px shrink-0 bg-border/60" aria-hidden />
        <button
          ref={buttonRef}
          type="button"
          aria-label={`${hiddenIds.length} more tabs — show hidden sessions`}
          aria-expanded={open}
          title={`${hiddenIds.length} more tabs`}
          onClick={() => (open ? setOpen(false) : openMenu())}
          className={cn(
            'flex h-7 cursor-pointer items-center rounded-full border px-2.5 text-[11px] font-semibold select-none',
            open
              ? 'border-border bg-selected text-foreground'
              : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          +{hiddenIds.length}
        </button>
      </div>

      {/* Fixed-positioned (like the project picker) so the tab strip's
          overflow clip and the titlebar can never cut it off. */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            variants={bloomDown}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={BLOOM_FAST}
            className="no-drag fixed z-[70] w-[240px] origin-top-left overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl shadow-black/30"
            style={{ left: pos.left, top: pos.top }}
            onMouseEnter={() => { cancelClose(); setOpen(true) }}
            onMouseLeave={scheduleClose}
          >
            <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Hidden tabs · {hiddenIds.length}
            </div>
            <div className="no-scrollbar max-h-[280px] overflow-y-auto">
              {hiddenIds.map((id) => {
                const label = labelFor(id)
                const running = runningIds.has(id)
                return (
                  <div
                    key={id}
                    role="button"
                    tabIndex={0}
                    title={label}
                    onClick={() => { onSelect(id); setOpen(false) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); setOpen(false) } }}
                    className="group flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-foreground transition-colors hover:bg-hover"
                  >
                    {running ? (
                      <span className="size-1.5 shrink-0 rounded-full bg-success" />
                    ) : (
                      <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/30" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <span
                      role="button"
                      aria-label={`Close ${label}`}
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onClose(id) }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClose(id) } }}
                      className="grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                        <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function TabBar({
  tabOrder,
  chats,
  sessions,
  activeId,
  runningIds,
  appName,
  onSelect,
  onClose,
}: Props): JSX.Element {
  function labelFor(id: string): string {
    const s = sessions.find((s) => s.id === id)
    if (s?.title) return s.title
    if (s?.preview) return s.preview
    const c = chats[id]
    if (c) return c.cwd.split(/[\\/]/).pop() ?? id
    return id.slice(0, 8)
  }

  // Fixed-limit windowing: show at most MAX_VISIBLE_TABS, always keeping
  // the active tab visible by swapping it into the last visible slot.
  let visibleIds = tabOrder
  let hiddenIds: string[] = []
  if (tabOrder.length > MAX_VISIBLE_TABS) {
    const head = tabOrder.slice(0, MAX_VISIBLE_TABS)
    if (activeId && tabOrder.includes(activeId) && !head.includes(activeId)) {
      visibleIds = [...tabOrder.slice(0, MAX_VISIBLE_TABS - 1), activeId]
      hiddenIds = tabOrder.filter((id) => !visibleIds.includes(id))
    } else {
      visibleIds = head
      hiddenIds = tabOrder.slice(MAX_VISIBLE_TABS)
    }
  }
  const hiddenCount = hiddenIds.length

  return (
    <div className="drag-region flex h-9 min-w-0 flex-1 items-center gap-1 px-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {visibleIds.map((id) => (
          <Tab
            key={id}
            label={labelFor(id)}
            active={id === activeId}
            running={runningIds.has(id)}
            onSelect={() => onSelect(id)}
            onClose={(e) => { e.stopPropagation(); onClose(id) }}
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <OverflowMenu
          hiddenIds={hiddenIds}
          labelFor={labelFor}
          runningIds={runningIds}
          onSelect={onSelect}
          onClose={onClose}
        />
      )}
    </div>
  )
}

// chats changes identity on every streaming event; only the cwd of each
// tabbed session is read (label fallback), so compare just that instead of
// the map itself. With stable runningIds this keeps the tab strip idle while
// a background or foreground session streams.
export default memo(
  TabBar,
  (prev, next) =>
    prev.activeId === next.activeId &&
    prev.appName === next.appName &&
    prev.runningIds === next.runningIds &&
    prev.sessions === next.sessions &&
    prev.tabOrder.length === next.tabOrder.length &&
    prev.tabOrder.every((id, i) => id === next.tabOrder[i]) &&
    prev.tabOrder.every((id) => prev.chats[id]?.cwd === next.chats[id]?.cwd)
)
