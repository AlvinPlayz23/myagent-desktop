import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Cancel01Icon, Loading03Icon, Message01Icon } from '@hugeicons/core-free-icons'
import { cn } from '../util'
import { BLOOM_FAST, EASE_OUT, bloomDown } from '../motion'
import type { SessionMeta } from '../../../shared/protocol'
import type { ChatState } from '../state'
import type { RunIndicatorStyle } from '../preferences'
import RunIndicator from './RunIndicator'
import { CirclePlus, Pin02 } from './ui/icons'
import type { DiffStat } from '../hooks/use-diff-stats'

/** Narrowest a tab may get before the strip starts moving tabs into the overflow menu. */
const TAB_MIN_WIDTH = 116
const TAB_GAP = 2
/** Room reserved for the overflow trigger and the new-session button. */
const STRIP_CHROME = 44 + 32

interface TabProps {
  id: string
  label: string
  active: boolean
  running: boolean
  pinned: boolean
  diff?: DiffStat
  runIndicator: RunIndicatorStyle
  runIndicatorColor: string
  focusable: boolean
  onSelect(): void
  onClose(): void
  onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>): void
}

/**
 * One session tab. The leading glyph is the session's status (idle message
 * icon, or a spinner while a run is live) and trades places with the close
 * button on hover/focus, so the label keeps its full width and the close
 * target never sits next to the label's truncation edge.
 */
function Tab({ id, label, active, running, pinned, diff, runIndicator, runIndicatorColor, focusable, onSelect, onClose, onKeyDown }: TabProps): JSX.Element {
  return (
    <div
      role="presentation"
      data-tab-id={id}
      onAuxClick={(e) => {
        if (e.button !== 1) return
        e.preventDefault()
        onClose()
      }}
      className={cn(
        'group/tab no-drag relative flex h-7 min-w-0 shrink items-center rounded-lg',
        'basis-[200px] [min-width:var(--tab-min)]',
        'transition-colors duration-[var(--duration-instant)] ease-[var(--ease-smooth-out)]',
        active ? 'text-foreground' : 'text-foreground-subtle hover:bg-hover hover:text-foreground'
      )}
      style={{ ['--tab-min' as string]: `${TAB_MIN_WIDTH}px` }}
    >
      {active && (
        <motion.span
          layoutId="session-tab-active"
          aria-hidden
          className="absolute inset-0 rounded-lg bg-selected shadow-[inset_0_0_0_1px_var(--border)]"
          transition={{ duration: 0.16, ease: EASE_OUT }}
        />
      )}
      <button
        type="button"
        role="tab"
        id={`session-tab-${id}`}
        aria-selected={active}
        tabIndex={focusable ? 0 : -1}
        title={label}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className="relative flex h-full min-w-0 flex-1 select-none items-center gap-2 rounded-lg pl-2.5 pr-7 text-left text-ui-caption font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative grid size-4 shrink-0 place-items-center">
          {running ? (
            <>
              <RunIndicator variant={runIndicator} color={runIndicatorColor} />
              <span className="sr-only">Running. </span>
            </>
          ) : pinned ? (
            <>
              <Pin02 size={13} strokeWidth={1.7} aria-hidden />
              <span className="sr-only">Pinned. </span>
            </>
          ) : (
            <HugeiconsIcon icon={Message01Icon} size={14} strokeWidth={1.5} aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {diff && (diff.insertions > 0 || diff.deletions > 0) && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-ui-xs tabular-nums" title="Uncommitted changes">
            <span className="text-success-foreground">+{diff.insertions}</span>
            <span className="text-destructive-foreground">−{diff.deletions}</span>
          </span>
        )}
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Close ${label}`}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className={cn(
          'absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-md text-foreground-subtle outline-none',
          'transition-[opacity,background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)]',
          'hover:bg-hover hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100'
        )}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
}

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

  const openMenu = (): void => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setPos({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), top: rect.bottom + 6 })
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
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onBlur = (): void => setOpen(false)
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [open])

  // Closing the last hidden tab leaves nothing to show.
  useEffect(() => {
    if (hiddenIds.length === 0) setOpen(false)
  }, [hiddenIds.length])

  const anyRunning = hiddenIds.some((id) => runningIds.has(id))

  return (
    <>
      <div ref={rootRef} className="no-drag shrink-0">
        <button
          ref={buttonRef}
          type="button"
          aria-label={`${hiddenIds.length} more sessions`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openMenu())}
          className={cn(
            'relative flex h-7 items-center gap-1 rounded-lg px-2 text-ui-caption font-medium tabular-nums outline-none',
            'transition-colors duration-[var(--duration-instant)] focus-visible:ring-2 focus-visible:ring-ring',
            open ? 'bg-selected text-foreground' : 'text-foreground-subtle hover:bg-hover hover:text-foreground'
          )}
        >
          {anyRunning && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[color:var(--busy)]" aria-hidden />}
          +{hiddenIds.length}
          <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={1.75} aria-hidden className={cn('transition-transform duration-[var(--duration-quick)]', open && 'rotate-180')} />
        </button>
      </div>

      {/* Fixed-positioned so the strip's overflow clip and the titlebar can never cut it off. */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label="Hidden sessions"
            variants={bloomDown}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={BLOOM_FAST}
            className="no-drag fixed z-[70] w-[260px] origin-top-left overflow-hidden rounded-xl bg-menu p-1 shadow-[var(--shadow-pop)]"
            style={{ left: pos.left, top: pos.top }}
          >
            <div className="px-2.5 pb-1 pt-1.5 text-ui-xs font-medium text-foreground-subtlest">Hidden sessions</div>
            <div className="no-scrollbar max-h-[280px] overflow-y-auto">
              {hiddenIds.map((id) => {
                const label = labelFor(id)
                const running = runningIds.has(id)
                return (
                  <div key={id} className="group/row flex items-center rounded-lg transition-colors duration-[var(--duration-instant)] focus-within:bg-hover hover:bg-hover">
                    <button
                      type="button"
                      role="menuitem"
                      title={label}
                      onClick={() => {
                        onSelect(id)
                        setOpen(false)
                      }}
                      className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-ui-caption text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {running ? (
                        <HugeiconsIcon icon={Loading03Icon} size={13} strokeWidth={1.75} className="shrink-0 animate-spin text-[color:var(--busy)]" aria-hidden />
                      ) : (
                        <HugeiconsIcon icon={Message01Icon} size={13} strokeWidth={1.5} className="shrink-0 text-foreground-subtlest" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Close ${label}`}
                      onClick={() => onClose(id)}
                      className="mr-1 grid size-6 shrink-0 place-items-center rounded-md text-foreground-subtle opacity-0 outline-none transition-opacity duration-[var(--duration-instant)] hover:bg-selected hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/row:opacity-100"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} aria-hidden />
                    </button>
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

interface Props {
  tabOrder: string[]
  chats: Record<string, ChatState>
  sessions: SessionMeta[]
  activeId: string | null
  runningIds: Set<string>
  appName: string
  runIndicator?: RunIndicatorStyle
  runIndicatorColor?: string
  pinnedIds?: Set<string>
  diffStats?: ReadonlyMap<string, DiffStat>
  onSelect(id: string): void
  onClose(id: string): void
  onNew(): void
}

function TabBar({ tabOrder, chats, sessions, activeId, runningIds, runIndicator = 'S1', runIndicatorColor = 'var(--busy)', pinnedIds, diffStats, onSelect, onClose, onNew }: Props): JSX.Element {
  const stripRef = useRef<HTMLDivElement>(null)
  const [capacity, setCapacity] = useState(8)

  // How many tabs fit at TAB_MIN_WIDTH. Measured, not guessed: the strip is
  // flex-1 between the app name and the window actions, so its width moves
  // with the window and with the sidebar.
  useLayoutEffect(() => {
    const el = stripRef.current
    if (!el) return
    const measure = (): void => {
      const fit = Math.floor((el.clientWidth - STRIP_CHROME + TAB_GAP) / (TAB_MIN_WIDTH + TAB_GAP))
      setCapacity(Math.max(1, fit))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const labelFor = (id: string): string => {
    const s = sessions.find((s) => s.id === id)
    if (s?.title) return s.title
    if (s?.preview) return s.preview
    const c = chats[id]
    if (c) return c.cwd.split(/[\\/]/).pop() ?? id
    return id.slice(0, 8)
  }

  // Show what fits, always keeping the active tab visible by swapping it into
  // the last visible slot.
  let visibleIds = tabOrder
  let hiddenIds: string[] = []
  if (tabOrder.length > capacity) {
    const head = tabOrder.slice(0, capacity)
    if (activeId && tabOrder.includes(activeId) && !head.includes(activeId)) {
      visibleIds = [...tabOrder.slice(0, capacity - 1), activeId]
    } else {
      visibleIds = head
    }
    hiddenIds = tabOrder.filter((id) => !visibleIds.includes(id))
  }

  // Roving tabindex: the active tab owns the tab stop; with none active
  // (Home), the first tab does.
  const stopId = activeId && visibleIds.includes(activeId) ? activeId : visibleIds[0]

  const focusTab = useCallback((id: string | undefined) => {
    if (!id) return
    stripRef.current?.querySelector<HTMLButtonElement>(`#session-tab-${CSS.escape(id)}`)?.focus()
  }, [])

  const onTabKey = (id: string) => (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    const i = visibleIds.indexOf(id)
    const move = (to: number): void => {
      e.preventDefault()
      focusTab(visibleIds[(to + visibleIds.length) % visibleIds.length])
    }
    if (e.key === 'ArrowRight') move(i + 1)
    else if (e.key === 'ArrowLeft') move(i - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(visibleIds.length - 1)
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      // Land on a neighbour so keyboard users are not dropped at the page top.
      focusTab(visibleIds[i + 1] ?? visibleIds[i - 1])
      onClose(id)
    }
  }

  return (
    <div className="drag-region flex h-9 min-w-0 flex-1 items-center gap-0.5 px-1">
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Open sessions"
        className="flex h-9 min-w-0 flex-1 items-center gap-0.5 overflow-hidden px-0.5"
      >
        {visibleIds.map((id) => (
          <Tab
            key={id}
            id={id}
            label={labelFor(id)}
            active={id === activeId}
            running={runningIds.has(id)}
            runIndicator={runIndicator}
            runIndicatorColor={runIndicatorColor}
            pinned={pinnedIds?.has(id) ?? false}
            diff={diffStats?.get(chats[id]?.cwd ?? '')}
            focusable={id === stopId}
            onSelect={() => onSelect(id)}
            onClose={() => onClose(id)}
            onKeyDown={onTabKey(id)}
          />
        ))}
        {hiddenIds.length > 0 && (
          <OverflowMenu hiddenIds={hiddenIds} labelFor={labelFor} runningIds={runningIds} onSelect={onSelect} onClose={onClose} />
        )}
        <button
          type="button"
          aria-label="New session"
          title="New session"
          onClick={onNew}
          className="no-drag grid size-7 shrink-0 place-items-center rounded-lg text-foreground-subtle outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CirclePlus size={18} />
        </button>
      </div>
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
    prev.runIndicator === next.runIndicator &&
    prev.runIndicatorColor === next.runIndicatorColor &&
    prev.pinnedIds === next.pinnedIds &&
    prev.diffStats === next.diffStats &&
    prev.runningIds === next.runningIds &&
    prev.sessions === next.sessions &&
    prev.onNew === next.onNew &&
    prev.tabOrder.length === next.tabOrder.length &&
    prev.tabOrder.every((id, i) => id === next.tabOrder[i]) &&
    prev.tabOrder.every((id) => prev.chats[id]?.cwd === next.chats[id]?.cwd)
)
