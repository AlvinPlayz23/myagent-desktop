import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { BLOOM_FAST, EASE_IN, EASE_OUT, bloomDown } from '../motion'
import { relTime } from '../util'
import { cn } from '../util'

interface Menu {
  session: SessionMeta
  x: number
  y: number
}

const MENU_WIDTH = 240
const MENU_HEIGHT_ESTIMATE = 140

// Sidebar text exists only in the expanded state. It clears ahead of the width
// collapse and fades back in once that has mostly finished, so a label is never
// caught mid-squeeze against the shrinking edge. `nowrap` keeps it clipping
// cleanly under the edge instead of reflowing on the way out.
//
// The exit is near-instant (opacity only, no filter blur) so every label is
// fully gone before the aside's width transition even begins — the collapse
// width carries an 80ms delay, and a nowrap label still on screen while the
// panel narrows is exactly the horizontal "smudge" this avoids. Dropping the
// blur off the exit also skips a full-subtree raster on the few layout-heavy
// collapse frames; at these durations nobody resolves a blur radius anyway.
// Blur stays on entry, where it is already isolated from the width motion. */
function CollapseLabel({
  show,
  className,
  children
}: {
  show: boolean
  className?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          className={cn('whitespace-nowrap', className)}
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
  onArchive
}: Props): JSX.Element {
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<Menu | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // The rail's *geometry* is what used to morph (see the layout notes on each
  // button): every box below now keeps a constant size or a constant distance
  // from the edge it is anchored to, so a hover highlight can only slide with
  // its button, never grow. What remains is New Chat / Settings, whose
  // highlight is a full-width row by design and therefore tracks the panel
  // width. This suppresses that one for the duration of the transition.
  //
  // Two details matter, and both were missing before:
  //   - `useLayoutEffect`, not `useEffect`. Passive effects run *after* paint,
  //     so the frame that first showed the collapsed layout still had `hover:`
  //     applied — the flash this is meant to prevent.
  //   - the colour transition has to come off with it. Dropping only the
  //     `hover:` class leaves `transition-colors` to fade the highlight out
  //     over its own 150ms, i.e. exactly across the collapse, which is the
  //     "rectangle that shrinks with the panel" all over again. Off means off.
  const [settling, setSettling] = useState(false)
  const firstRender = useRef(true)
  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setSettling(true)
    // Covers the slower of the two directions: collapse is 80ms delay + 170ms,
    // expand is 280ms.
    const t = window.setTimeout(() => setSettling(false), 300)
    return () => window.clearTimeout(t)
  }, [collapsed])

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
    {/* Width is animated with a CSS transition rather than Framer Motion, and
        deliberately asymmetric. Collapsing is a dismissal — the user has already
        decided, so it should get out of the way with a short decelerating curve;
        expanding is revealing content and can afford to settle, with an overshoot
        bezier past the target for a slight spring feel.

        The collapse's width transition carries an 80ms delay so the expanded
        content's opacity exit clears *before* the panel moves — content fades →
        panel slides shut, sequential, nothing competing for frames on the few
        collapse frames (the 170ms collapse curve is ~95% done at 80ms, so without
        the delay the entire exit would sit on the width's handful of meaningful
        frames). Expand does the mirror image: the content blurs in after the
        width has mostly settled, via its own 0.08s delay.

        Why CSS and not Motion for `width`: width is a layout property that forces
        the sibling `flex-1` main to reflow in lockstep. In this Electron/Chromium
        renderer, JS-driven per-frame mutation of it (motion.aside animate/style)
        gets the intermediate layout frames optimized away and snaps — while
        compositor-only properties like opacity animate fine. The browser's
        native transition engine drives width reliably, frame by frame. */}
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-hidden transition-[width]',
        collapsed
          ? 'w-14 duration-[170ms] delay-[80ms] ease-[cubic-bezier(0.32,0.72,0,1)]'
          : 'w-[260px] duration-[280ms] ease-[cubic-bezier(0.34,1.4,0.64,1)]'
      )}
    >
      {/* Spacer only. The app title used to sit here, but it belongs to the
          window rather than this panel, so it now lives in the titlebar strip
          in App.tsx and stays put when the sidebar collapses. */}
      <div className="drag-region h-9 shrink-0" />

      {/* The horizontal padding is deliberately the same in both states. It used
          to drop to px-1.5 when collapsed, which shifted every child 2px at the
          instant the class flipped — a jump layered on top of the width motion,
          and 2px of it left the rail's icons off the panel's centre line. At
          px-2 the numbers land exactly: collapsed content is 56 − 2×8 = 40px
          wide, centred on 28 = half the rail. Every offset below is derived from
          that, so the icons sit on one axis without any per-state nudging. */}
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-2">
        {/* h-[52px] matches ChatHeader so the first sidebar row and the panel
            header share a baseline across the seam. */}
        {/* Anchored to the right edge in both states, and that is the whole
            trick: the toggle is the button the pointer is on when the panel
            collapses, so it is the one whose highlight was seen morphing. It
            was `size-8` expanded and `h-9 w-full` collapsed, and `w-full`
            resolves against the *pre-transition* width — so on click the grey
            hover rect snapped from 32px to ~248px and only then shrank with the
            panel. That is the "rectangle that grows".
            Fixed size + fixed inset instead: the box never changes, it just
            rides the right edge inward as the width transition carries it, and
            `pr-1` inside a 40px content box parks it dead centre of the
            collapsed rail (40 − 4 − 32 = 4px left, 4px right). Hover can stay
            live through the transition because a constant box cannot morph —
            it reads as ordinary feedback on a button that happens to move. */}
        <div className="flex h-[52px] shrink-0 items-center justify-end pr-1">
          <button
            className={cn(
              'grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors',
              'hover:bg-selected hover:text-foreground',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggle}
          >
            {collapsed ? <LayoutAlignRight size={16} strokeWidth={1.8} /> : <LayoutAlignLeft size={16} strokeWidth={1.8} />}
          </button>
        </div>

        {/* The icon is centred by *padding*, not by `justify-center`, and that is
            the fix for the clip-in. Centring is relative to the box, so
            `justify-center` re-centred the icon against the width the panel had
            not finished leaving: on collapse it threw the icon ~100px right of
            where it was drawn, held it there for the 80ms width delay, then
            dragged it back left across the closing edge — read as a pop and a
            clip. Padding is relative to the left edge, which does not move
            (px-2 above is state-independent), so the icon simply stays where it
            already was and the panel closes around it. 13px = (40 − 14) / 2,
            which is also exactly centre once collapsed: the icon lands on its
            final position at frame 0 and never travels at all.
            `gap-2.5` stays in both states — inert with the label unmounted, and
            leaving it in means the label does not shift during its own exit.
            Hover is suppressed here (unlike the toggle) because the highlight is
            a full-width row by design, so it genuinely does resize with the
            panel; `transition-colors` goes with it, or it just fades out across
            the collapse instead. */}
        <button
          className={cn(
            'mb-3 flex h-9 w-full shrink-0 items-center gap-2.5 rounded-lg text-left text-[12.5px] font-medium text-foreground',
            !settling && 'transition-colors hover:bg-hover',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
            collapsed ? 'px-[13px]' : 'px-3'
          )}
          title={collapsed ? 'New Chat' : undefined}
          aria-label={collapsed ? 'New Chat' : undefined}
          onClick={onHome}
        >
          <span className="relative grid size-[14px] shrink-0 place-items-center text-muted-foreground" aria-hidden="true">
            <Square size={14} strokeWidth={1.8} className="absolute" />
            <SquarePenIcon size={10} strokeWidth={1.8} className="absolute" />
          </span>
          <CollapseLabel show={!collapsed}>New Chat</CollapseLabel>
        </button>

        {/* Everything below the icon rail is expanded-only. Grouped under one
            fade so collapsing doesn't blank several regions independently, and
            timed like CollapseLabel so it clears before the width animates.

            The exit is opacity-only (a filter blur here would raster a render
            pass over the whole subtree on the few width-collapse frames — dropped
            for the same reason as CollapseLabel). In tandem with the aside's 80ms
            collapse delay it reads cleanly as: content fades out → panel slides
            shut. Entry keeps the blur, isolated from the width motion by its own
            0.08s delay.

            The pinned width and the scroll parent's overflow-x-hidden are what
            stop the collapse looking sluggish: while this is exiting the aside
            is already narrowing, and an auto-width child would reflow every row
            inside it on the way out — text re-wrapping and truncating frame by
            frame. Held at its expanded width (260px aside − the px-2 rail) it
            simply slides under the clip instead, and with overflow-x explicit
            (per spec the unset axis computes to `auto` here) the scrollable
            extent is not re-derived every frame as the container shrinks. */}
        <AnimatePresence initial={false}>
        {!collapsed && (
        <motion.div
          key="expanded"
          className="w-[244px] shrink-0"
          initial={{ opacity: 0, filter: 'blur(4px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)', transition: { duration: 0.2, delay: 0.08, ease: 'easeOut' } }}
          exit={{ opacity: 0, transition: { duration: 0.08, ease: 'easeIn' } }}
        >
        {recent.length > 0 && (
          <div className="mb-4 space-y-0.5">
            <AnimatePresence initial={false}>
              {recent.map((s) => {
                const running = runningIds.has(s.id)
                return (
                  <motion.div
                    key={s.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                    className="overflow-hidden"
                  >
                    <button
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
                      <AnimatePresence initial={false}>
                        {running && (
                          <motion.span
                            className="shrink-0 overflow-hidden whitespace-nowrap rounded-full border border-success/30 bg-success/10 px-1.5 py-px text-[10px] font-medium text-success-foreground"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
                          >
                            Running
                          </motion.span>
                        )}
                      </AnimatePresence>
                      <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                        {relTime(s.modified)}
                      </span>
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        <div className="flex items-center justify-between px-2.5 pb-1 pt-0.5">
          <span className="whitespace-nowrap text-[12px] text-muted-foreground">
            Threads
          </span>
          <button
            className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Add project…"
            onClick={onAddProject}
          >
            <FolderAdd size={14} strokeWidth={1.8} />
          </button>
        </div>

        {grouped.map((p, i) => {
          const open = isOpen(p, i)
          return (
            <motion.div key={p.cwd}>
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
                    key={p.cwd}
                    // Labels, not plain objects. Variant propagation is what
                    // carries `closed` down to the travel wrapper and the rows
                    // on exit — animating this container with object values
                    // would collapse the height while everything inside it sat
                    // frozen, which is exactly what "no close animation" looks
                    // like. Descendants therefore declare `variants` only and
                    // inherit the label from here.
                    //
                    // The explicit width keeps text from reflowing during exit:
                    // session titles stay locked at their expanded layout instead
                    // of rewrapping as the parent shrinks.
                    variants={{
                      open: {
                        height: 'auto',
                        opacity: 1,
                        transition: {
                          height: { duration: 0.28, ease: EASE_OUT },
                          opacity: { duration: 0.18, ease: 'easeOut' }
                        }
                      },
                      closed: {
                        height: 0,
                        opacity: 0,
                        transition: {
                          height: { duration: 0.22, ease: EASE_IN },
                          // Hold opacity almost to the end: fading early leaves
                          // an empty gap visibly shrinking after the rows are
                          // already gone.
                          opacity: { duration: 0.16, ease: 'easeIn', delay: 0.04 }
                        }
                      }
                    }}
                    initial="closed"
                    animate="open"
                    exit="closed"
                    className="w-[244px] overflow-hidden"
                  >
                    {/* The rows travel *through* the opening height rather than
                        being revealed by it: they enter lifted and settle as
                        the container finishes, and on close they ride back up
                        into the folder row. That vertical travel is what reads
                        as a dropdown rather than a window shade.

                        Declares `variants` but no initial/animate/exit: the
                        label is inherited from the height container above, and
                        re-declaring it here would detach this branch from that
                        propagation instead of joining it. */}
                    <motion.div
                      variants={{
                        open: { y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
                        closed: { y: -10, transition: { duration: 0.22, ease: EASE_IN } }
                      }}
                    >
                    {p.sessions.length > 0 ? (
                      <div className="pl-4">
                        {p.sessions.map((s, si) => (
                          <motion.button
                            key={s.id}
                            variants={{
                              open: {
                                opacity: 1,
                                y: 0,
                                transition: {
                                  duration: 0.2,
                                  ease: EASE_OUT,
                                  // Cap the cascade: a project with 30 sessions
                                  // must not take 900ms to finish opening.
                                  delay: Math.min(si, 6) * 0.022
                                }
                              },
                              closed: {
                                opacity: 0,
                                y: -6,
                                // No per-row delay closing. Staggering an exit
                                // makes dismissal feel sluggish, and the rows
                                // have to be gone before the height finishes.
                                transition: { duration: 0.12, ease: EASE_IN }
                              }
                            }}
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
                          </motion.button>
                        ))}
                      </div>
                    ) : (
                      <div className="pl-4">
                        <motion.button
                          variants={{
                            open: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } },
                            closed: { opacity: 0, y: -6, transition: { duration: 0.12, ease: EASE_IN } }
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                          onClick={() => onCompose(p.cwd)}
                        >
                          <Plus size={12} strokeWidth={1.8} className="shrink-0" />
                          <span className="text-[12px]">Start first session</span>
                        </motion.button>
                      </div>
                    )}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}

        <button
          className="flex w-full items-center gap-2 rounded-lg py-1.5 pl-2 pr-1 text-left text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          onClick={onAddProject}
        >
          <FolderAdd size={14} strokeWidth={1.8} className="shrink-0" />
          <span className="whitespace-nowrap text-[12.5px]">Add project</span>
        </button>
        </motion.div>
        )}
        </AnimatePresence>

      </div>
      {/* Same treatment as New Chat, for the same reasons — this row has the
          identical always-mounted-icon shape, so it had the identical pop.
          12.5px = (40 − 15) / 2 for the 15px gear, which puts it on the same
          centre line as the icons above. The `settingsOpen` background is left
          alone: it is a selection state, not hover, and blinking it off for the
          length of the transition would be worse than letting it track the row.
          It keeps `transition-colors` so opening and closing Settings still
          cross-fades. */}
      <div className="shrink-0 px-2 py-2">
        <button
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-lg text-left text-[12.5px] font-medium',
            collapsed ? 'px-[12.5px]' : 'px-3',
            settingsOpen && 'bg-selected text-foreground transition-colors',
            !settingsOpen && 'text-muted-foreground',
            !settingsOpen && !settling && 'transition-colors hover:bg-selected hover:text-foreground'
          )}
          title={collapsed ? 'Settings' : undefined}
          aria-label="Settings"
          onClick={onSettings}
        >
          <Settings01 size={15} strokeWidth={1.8} className="shrink-0" />
          <CollapseLabel show={!collapsed}>Settings</CollapseLabel>
        </button>
      </div>
    </aside>

    <AnimatePresence>
    {menu && (
        <motion.div
          ref={menuRef}
          variants={bloomDown}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={BLOOM_FAST}
          className="fixed z-[51] w-[240px] origin-top-left overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl shadow-black/25"
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
