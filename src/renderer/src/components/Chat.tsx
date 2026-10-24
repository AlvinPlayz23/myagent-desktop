import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Folder01 } from './ui/icons'
import type { ChatItem, ChatState } from '../state'
import type { Message } from '../../../shared/protocol'
import type { OrbVariant, ToolActivityDisplay } from '../preferences'
import { subagentTaskIndex, type SubagentTask } from '../subagents'
import MessageView from './MessageView'
import Working from './Working'
import SubagentNotice from './SubagentNotice'
import ToolGroup, { type WorkEntry } from './ToolGroup'
import { ArrowDown02 } from './ui/icons'
import { ScrollFadeViewport } from './ui/scroll-fade-viewport'

// Opening a session chases the bottom until the transcript stops growing (see
// the mount effect in Chat). Each frame that reveals and measures fresh rows
// resets the counter, so this many unchanged frames means every
// `content-visibility` estimate has resolved. The cap is a guard against a
// pathological transcript only — a real gesture ends the chase long before it,
// so this never holds the view hostage.
const STABLE_FRAMES = 4
const SETTLE_CAP_MS = 5000

// Rises a timeline entry in as it appends to a live conversation. Rows that
// are part of the first render (history load / session resume) pass
// animate=false so an entire transcript never replays its entrance.
//
// `transcript-row` lets the browser skip layout and paint for rows scrolled out
// of view, which is what keeps a long session from getting heavier than a short
// one. Nothing in a row paints outside its own box (the message actions card is
// inline by design), so its paint containment clips nothing.
function Entrance({ animate, children }: { animate: boolean; children: ReactNode }): JSX.Element {
  return (
    <motion.div
      className="transcript-row"
      initial={animate ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

export default function Chat({
  chat,
  autoScroll = true,
  messageSize = 'default',
  toolActivityDisplay = 'compact',
  compactSummary = false,
  workingOrb = 'S1',
  onOpenSubagent
}: {
  chat: ChatState
  autoScroll?: boolean
  messageSize?: 'compact' | 'default' | 'large'
  toolActivityDisplay?: ToolActivityDisplay
  compactSummary?: boolean
  workingOrb?: OrbVariant
  /** Drills the subagents panel into the detail for a task. */
  onOpenSubagent(task: SubagentTask, launchError?: string): void
}): JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  // Transcript body whose height changes as late layout settles (see the
  // ResizeObserver below).
  const contentRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  // Mirrors `pinned` into state so the jump-to-latest pill can appear/disappear.
  // Only flips on transitions; scrolling within the bottom region is free.
  const [atBottom, setAtBottom] = useState(true)
  // In-flight glide for the jump-to-latest pill. Native smooth scrolling is
  // too abrupt over long transcripts, so animate manually instead. The
  // destination is re-read every frame because content keeps growing while a
  // turn streams in. `pinned` deliberately flips only once the glide lands:
  // setting it early would let the autoscroll effect hard-snap past the
  // animation on the next streamed chunk.
  // False during the first render only: anything present then is history.
  const liveRegion = useRef(false)
  const glide = useRef<number | null>(null)
  // A session that has just mounted is still laying itself out. Transcript rows
  // carry `content-visibility: auto`, so a row that has never been painted
  // reports its 160px estimate instead of its real height; a long session looks
  // far shorter than it is on the first frame and grows by thousands of pixels
  // as rows are measured. Every one of those resizes fires a scroll event, and
  // reading those as "the user scrolled up" is what unpinned the view and left a
  // session switch stranded in the middle of the conversation. While `settling`
  // is true the transcript keeps chasing the bottom and onScroll refuses to
  // unpin on growth.
  const settling = useRef(true)
  // Read inside the mount machinery so toggling the preference mid-session
  // is respected without restarting the chase.
  const autoScrollRef = useRef(autoScroll)
  autoScrollRef.current = autoScroll
  // The scrollTop this component last wrote. While settling, a scroll event that
  // lands near it is layout arriving; one that lands above it is the reader
  // pulling the view up (wheel, scrollbar drag, PageUp) and ends the settle.
  const lastSnap = useRef(0)
  // Stop a mid-flight glide on unmount so the rAF chain never touches a dead node.
  useEffect(() => stopGlide, [])
  useEffect(() => {
    liveRegion.current = true
  }, [])

  // Follow new content while pinned, and ignore `pinned` for the first moments
  // of a mount so opening a session always starts at the latest message.
  useEffect(() => {
    const el = scroller.current
    if (!el || !autoScroll) return
    if (pinned.current || settling.current) {
      el.scrollTop = el.scrollHeight
      lastSnap.current = el.scrollTop
    }
  }, [autoScroll, chat.items, chat.streaming, chat.toolRuns])

  // Opening a session must always show its latest message, and one snap to
  // `scrollHeight` cannot do it: reading `scrollHeight` only measures the rows
  // above the fold, so the first snap reveals another screenful, which resolves
  // *their* estimates and grows the body again. Chase the bottom frame by frame
  // until the height stops changing — a handful of frames for even a long
  // session — with a wall-clock ceiling as the safety net.
  //
  // The placement is deliberately unconditional: landing on the latest message
  // is what opening a session *means*, so it does not consult `autoScroll` (that
  // preference governs following a live run). A real gesture always wins — see
  // takeOverScroll and the lastSnap check in onScroll.
  //
  // A layout effect, not an effect: the first snap must land before the browser
  // paints, otherwise a long session flashes its oldest message for a frame
  // before jumping down.
  useLayoutEffect(() => {
    const el = scroller.current
    const content = contentRef.current
    if (!el || !content) return
    settling.current = true
    pinned.current = true
    setAtBottom(true)

    let live = true
    let frame: number | null = null
    let deadline: ReturnType<typeof setTimeout> | null = null

    const stop = (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
      if (deadline !== null) {
        clearTimeout(deadline)
        deadline = null
      }
    }

    const end = (): void => {
      settling.current = false
      stop()
    }

    let lastHeight = -1
    let stable = 0
    const tick = (): void => {
      frame = null
      if (!live) return
      // The reader took the transcript back; stop placing the view for them.
      if (!pinned.current) {
        end()
        return
      }
      el.scrollTop = el.scrollHeight
      lastSnap.current = el.scrollTop
      const height = el.scrollHeight
      stable = height === lastHeight ? stable + 1 : 0
      lastHeight = height
      if (stable >= STABLE_FRAMES) {
        end()
        return
      }
      frame = requestAnimationFrame(tick)
    }

    const chase = (): void => {
      if (!live || !settling.current) return
      stable = 0
      lastHeight = -1
      if (frame === null) frame = requestAnimationFrame(tick)
    }

    // Late layout — a webfont swap, an image, a highlighted code block — restarts
    // the chase if it arrives mid-settle; after it, growth is ordinary pinned
    // auto-scroll.
    const ro = new ResizeObserver(() => {
      if (!live) return
      if (settling.current) chase()
      else if (pinned.current && autoScrollRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(content)
    // The viewport itself resizes when panels open/close around the chat.
    ro.observe(el)
    window.addEventListener('resize', chase)
    void document.fonts.ready.then(() => chase())

    // Snap before the first paint so nothing flashes at the top of the session.
    el.scrollTop = el.scrollHeight
    lastSnap.current = el.scrollTop
    chase()
    deadline = setTimeout(() => {
      el.scrollTop = el.scrollHeight
      lastSnap.current = el.scrollTop
      end()
    }, SETTLE_CAP_MS)

    return () => {
      live = false
      settling.current = false
      ro.disconnect()
      window.removeEventListener('resize', chase)
      stop()
    }
  }, [])

  const onScroll = (): void => {
    const el = scroller.current
    if (!el) return
    if (settling.current) {
      // A scroll event during the chase is the transcript measuring itself. It
      // only counts as the reader if the position moved *above* where we put it.
      if (el.scrollTop < lastSnap.current - 4) {
        settling.current = false
      } else {
        pinned.current = true
        setAtBottom(true)
        return
      }
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    // Hysteresis: unpin only once clearly away from the bottom, re-pin only
    // once back inside the bottom region. This stops flicker when streamed
    // chunks grow content mid-scroll.
    const next = pinned.current ? distance <= 120 : distance < 80
    pinned.current = next
    setAtBottom((prev) => (prev === next ? prev : next))
  }

  // Cancel any glide the moment the user scrolls by hand so the animation
  // never fights them for the scrollbar.
  const stopGlide = (): void => {
    if (glide.current !== null) {
      cancelAnimationFrame(glide.current)
      glide.current = null
    }
  }

  // Handing the transcript back to the reader. A physical gesture ends the
  // post-mount chase immediately: you asked to look somewhere, so the automatic
  // placement must stop moving the view under you.
  const takeOverScroll = (): void => {
    settling.current = false
    pinned.current = false
    setAtBottom(false)
  }

  // Wheel intent unpins synchronously, before the next streamed chunk's
  // autoscroll effect runs. Without this, fast token streaming snaps the view
  // back to the bottom between the physical wheel tick and the async scroll
  // event, making it impossible to scroll up mid-run.
  const onUserWheel = (e: { deltaY: number }): void => {
    stopGlide()
    if (e.deltaY < 0) takeOverScroll()
  }

  // Dragging the scrollbar or finger-dragging is unmistakably inspection;
  // onScroll re-pins the moment they land back at the bottom.
  const onUserTouch = (): void => {
    stopGlide()
    takeOverScroll()
  }

  const scrollToBottom = (): void => {
    const el = scroller.current
    if (!el) return
    stopGlide()
    const from = el.scrollTop
    // Longer trips get proportionally more time, clamped to a sane band.
    const distance = el.scrollHeight - el.clientHeight - from
    const duration = Math.max(240, Math.min(600, distance * 0.35))
    const startedAt = performance.now()
    const step = (now: number): void => {
      const t = Math.min(1, (now - startedAt) / duration)
      const ease = 1 - Math.pow(1 - t, 3) // easeOutCubic: fast start, soft landing
      el.scrollTop = from + (el.scrollHeight - el.clientHeight - from) * ease
      if (t < 1) {
        glide.current = requestAnimationFrame(step)
      } else {
        glide.current = null
        pinned.current = true
        setAtBottom(true)
      }
    }
    glide.current = requestAnimationFrame(step)
  }

  // One derivation feeds both the transcript's subagent rows and the tool
  // cards. Memoized on chat identity, so a streamed text delta costs nothing and
  // both consumers compare tasks by reference.
  const subagentTasks = subagentTaskIndex(chat)

  const renderItem = (item: ChatItem, key: string): JSX.Element | null => {
    if (item.kind === 'msg') {
      // Finalized reasoning is shown as a foldable work item (see ToolGroup),
      // so the message body row itself never re-renders thinking.
      //
      // `copyable` is safe to set here even though an assistant node built by
      // this function can still be demoted: when later work arrives the node is
      // dropped (finalAssistant = null) and the message is re-rendered from
      // scratch as a WorkEntry through EntryView, which does not pass the prop.
      // Only a node that survives to flushSegment as the turn's answer is ever
      // painted with the button. It is ignored for user messages.
      return (
        <div key={key} className="transcript-row mt-5">
          <MessageView
            msg={item.msg}
            messageSize={messageSize}
            showThinking={false}
            copyable={item.msg.role === 'assistant'}
          />
        </div>
      )
    }
    if (item.kind === 'compaction') {
      return (
        <div key={key} className="mt-5 flex items-center gap-3 text-ui-sm font-medium text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          <span>context compacted</span>
          <span className="font-mono font-normal normal-case tracking-normal">
            {Math.round(item.info.tokensBefore / 1000)}k → {Math.round(item.info.tokensAfter / 1000)}k tokens
          </span>
        </div>
      )
    }
    if (item.kind === 'subagent') {
      const task = subagentTasks.get(item.taskId)
      if (!task) return null
      return (
        <div key={key} className="mt-5">
          <SubagentNotice task={task} onOpen={onOpenSubagent} />
        </div>
      )
    }
    // Turn markers only describe agent lifecycle. They must never decide
    // whether a timeline message is visible.
    return null
  }

  // A single agent run can contain several assistant/tool cycles. Do not let
  // each cycle create its own fold: after a user message, collect all work and
  // assistant messages until the next user message, then render the work once
  // before the assistant text. This gives one stable transcript shape:
  //
  //   user
  //   Worked for ... · N tools
  //   assistant response
  //
  // Lifecycle markers are intentionally ignored here; agent_start is emitted
  // before the user message and turn markers are not display boundaries.
  const isWork = (item: ChatItem): boolean => item.kind === 'tool' || item.kind === 'thinking'
  const rows: JSX.Element[] = []
  let workEntries: WorkEntry[] = []
  let finalAssistant: JSX.Element | null = null
  let finalAssistantMsg: Message | null = null
  let segment = 0

  // `live` is only ever passed by the final flush below. Items are
  // chronological, so an in-flight turn's work always lands in the last
  // segment; every earlier segment is settled history and must still fold even
  // while a new turn runs.
  const flushSegment = (live = false): void => {
    if (workEntries.length > 0) {
    rows.push(
          <Entrance key={`work-${segment}`} animate={liveRegion.current}>
            <ToolGroup
              entries={workEntries}
              tasks={subagentTasks}
              display={toolActivityDisplay}
              live={live}
              compactSummary={compactSummary}
              onOpenSubagent={onOpenSubagent}
            />
          </Entrance>
        )
    }
    if (finalAssistant) rows.push(finalAssistant)
    workEntries = []
    finalAssistant = null
    finalAssistantMsg = null
    segment++
  }

  for (let i = 0; i < chat.items.length; i++) {
    const item = chat.items[i]
    if (item.kind === 'msg' && item.msg.role === 'user') {
      flushSegment()
      const node = renderItem(item, `item-${i}`)
      if (node) rows.push(<Entrance key={`enter-${i}`} animate={liveRegion.current}>{node}</Entrance>)
      continue
    }
    if (isWork(item)) {
      // An assistant message is only final if no more work follows it before
      // the next user message. The instant a work item arrives, move the
      // pending commentary into the activity list *before* that item. This is
      // what preserves: commentary → tool → commentary → tool.
      if (finalAssistantMsg) {
        workEntries.push({ kind: 'message', id: `message-before-${i}`, msg: finalAssistantMsg })
        finalAssistant = null
        finalAssistantMsg = null
      }
      if (item.kind === 'tool') {
        const run = chat.toolRuns[item.toolCallId]
        if (run && !workEntries.some((entry) => entry.kind === 'tool' && entry.run.id === run.id)) {
          workEntries.push({ kind: 'tool', run })
        }
      } else if (item.kind === 'thinking') {
        workEntries.push({
          kind: 'thinking',
          id: item.id,
          text: item.text,
          redacted: item.redacted,
          durationMs: item.durationMs
        })
      }
      continue
    }
    const node = renderItem(item, `item-${i}`)
    if (node) {
      if (item.kind === 'msg' && item.msg.role === 'assistant') {
        // No work followed the previous response. This is unusual but it
        // still cannot be the final response once another assistant body has
        // arrived, so retain it in chronological activity order.
        if (finalAssistantMsg) {
          workEntries.push({ kind: 'message', id: `message-before-${i}`, msg: finalAssistantMsg })
        }
        finalAssistant = node
        finalAssistantMsg = item.msg
      } else if (item.kind === 'compaction') {
        // Compaction is not agent commentary; keep its existing visible marker
        // in the transcript and do not absorb it into the work log.
        flushSegment()
        rows.push(<Entrance key={`enter-${i}`} animate={liveRegion.current}>{node}</Entrance>)
      } else if (item.kind === 'subagent') {
        // A finished subagent's report is the deliverable of the delegation, not
        // agent commentary — so it gets its own row rather than a slot inside the
        // folded "Worked for …" divider, where it would be invisible by default.
        flushSegment()
        rows.push(<Entrance key={`enter-${i}`} animate={liveRegion.current}>{node}</Entrance>)
      } else if (item.kind === 'msg') {
        workEntries.push({ kind: 'message', id: `activity-${i}`, msg: item.msg })
      }
    }
  }
  flushSegment(chat.running)

  // Elapsed reasoning time for the message still streaming, so a block that has
  // already stopped reasoning shows its duration without waiting for the turn.
  const streamingThinkingDurations: Record<number, number> = {}
  for (const [index, span] of Object.entries(chat.thinkingSpans)) {
    streamingThinkingDurations[Number(index)] = span.endedAt - span.startedAt
  }

  return (
    <div className="relative min-h-0 flex-1">
      <ScrollFadeViewport
        ref={scroller}
        // overflow-anchor off: the browser's scroll anchoring silently rewrites
        // scrollTop as rows measure, fighting the snap-to-bottom below.
        className="h-full [overflow-anchor:none]"
        onScroll={onScroll}
        onWheel={onUserWheel}
        onTouchStart={stopGlide}
        onTouchMove={onUserTouch}
      >
      <div className="mx-auto flex max-w-3xl flex-col px-5 pb-6 pt-7 sm:px-8" ref={contentRef}>
        {chat.items.length === 0 && !chat.streaming && (
          <div className="mt-[10vh] flex flex-col gap-2 px-1 [animation:rise_0.4s_ease]">
            <h2 className="text-balance text-ui-xl font-medium leading-tight tracking-[-0.02em] text-foreground">
              What should we work on in{' '}
              <span className="text-foreground-subtle">{chat.cwd.split(/[\\/]/).filter(Boolean).pop() ?? 'this folder'}</span>?
            </h2>
            <p className="flex min-w-0 items-center gap-1.5 font-mono text-ui-sm text-foreground-subtlest" title={chat.cwd}>
              <Folder01 size={12} strokeWidth={1.8} className="shrink-0" />
              <span className="min-w-0 truncate">{chat.cwd}</span>
            </p>
          </div>
        )}
        {rows}
        {chat.streaming && (
          <Entrance animate={liveRegion.current}>
            <div className="mt-5">
              <MessageView
                msg={chat.streaming}
                streaming
                messageSize={messageSize}
                thinkingDurations={streamingThinkingDurations}
              />
            </div>
          </Entrance>
        )}
        {chat.running && !chat.streaming && (
          <div className="px-1.5 py-1.5">
            <Working variant={workingOrb} />
          </div>
        )}
      </div>
      </ScrollFadeViewport>
      {/* Jump to latest: floats over the transcript while scrolled away from
          the bottom. Clicking glides back down and re-pins autoscroll on
          arrival. */}
      <AnimatePresence>
        {!atBottom && (
          <motion.button
            type="button"
            aria-label="Jump to latest"
            title="Jump to latest"
            onClick={scrollToBottom}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute bottom-4 left-1/2 z-10 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
          >
            <ArrowDown02 size={16} strokeWidth={1.8} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
