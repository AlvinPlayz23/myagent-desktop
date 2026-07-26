import { useEffect, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Sparkles } from './ui/icons'
import type { ChatItem, ChatState } from '../state'
import type { Message } from '../../../shared/protocol'
import type { ToolActivityDisplay } from '../preferences'
import MessageView from './MessageView'
import ToolGroup, { type WorkEntry } from './ToolGroup'

// Rises a timeline entry in as it appends to a live conversation. Rows that
// are part of the first render (history load / session resume) pass
// animate=false so an entire transcript never replays its entrance.
function Entrance({ animate, children }: { animate: boolean; children: ReactNode }): JSX.Element {
  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

export default function Chat({
  chat,
  autoScroll = true,
  messageSize = 'default',
  toolActivityDisplay = 'compact'
}: {
  chat: ChatState
  autoScroll?: boolean
  messageSize?: 'compact' | 'default' | 'large'
  toolActivityDisplay?: ToolActivityDisplay
}): JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  // False during the first render only: anything present then is history.
  const liveRegion = useRef(false)
  useEffect(() => {
    liveRegion.current = true
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (el && autoScroll && pinned.current) el.scrollTop = el.scrollHeight
  }, [autoScroll, chat.items, chat.streaming, chat.toolRuns])

  const onScroll = (): void => {
    const el = scroller.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const renderItem = (item: ChatItem, key: string): JSX.Element | null => {
    if (item.kind === 'msg') {
      // Finalized reasoning is shown as a foldable work item (see ToolGroup),
      // so the message body row itself never re-renders thinking.
      return (
        <div key={key} className="mt-5">
          <MessageView msg={item.msg} messageSize={messageSize} showThinking={false} />
        </div>
      )
    }
    if (item.kind === 'compaction') {
      return (
        <div key={key} className="mt-5 flex items-center gap-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
          <span>context compacted</span>
          <span className="font-mono font-normal normal-case tracking-normal">
            {Math.round(item.info.tokensBefore / 1000)}k → {Math.round(item.info.tokensAfter / 1000)}k tokens
          </span>
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

  const flushSegment = (): void => {
    if (workEntries.length > 0) {
      rows.push(
        <Entrance key={`work-${segment}`} animate={liveRegion.current}>
          <ToolGroup entries={workEntries} display={toolActivityDisplay} />
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
        workEntries.push({ kind: 'thinking', id: item.id, text: item.text, redacted: item.redacted })
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
      } else if (item.kind === 'msg') {
        workEntries.push({ kind: 'message', id: `activity-${i}`, msg: item.msg })
      }
    }
  }
  flushSegment()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" ref={scroller} onScroll={onScroll}>
      <div className="mx-auto flex max-w-3xl flex-col px-5 pb-6 pt-7 sm:px-8">
        {chat.items.length === 0 && !chat.streaming && (
          <div className="mt-[8vh] flex items-start gap-3 rounded-2xl border border-dashed border-border bg-subtle px-5 py-4 text-muted-foreground [animation:rise_0.4s_ease]">
            <Sparkles size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="m-0 leading-relaxed">Fresh session in <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground">{chat.cwd}</code>. Describe what you want built, fixed, or explained.</p>
          </div>
        )}
        {rows}
        {chat.streaming && (
          <Entrance animate={liveRegion.current}>
            <div className="mt-5"><MessageView msg={chat.streaming} streaming messageSize={messageSize} /></div>
          </Entrance>
        )}
        {chat.running && !chat.streaming && (
          <div className="flex gap-1.5 px-0.5 py-1.5">
            <span className="size-[7px] rounded-full bg-foreground/70 [animation:work-pulse_1.2s_ease-in-out_infinite]" />
            <span className="size-[7px] rounded-full bg-foreground/70 [animation:work-pulse_1.2s_ease-in-out_0.15s_infinite]" />
            <span className="size-[7px] rounded-full bg-foreground/70 [animation:work-pulse_1.2s_ease-in-out_0.3s_infinite]" />
          </div>
        )}
        {chat.notice && <div className="self-center rounded-full border border-border bg-muted px-4.5 py-1.5 font-mono text-[11.5px] text-muted-foreground [animation:rise_0.3s_ease]">{chat.notice}</div>}
      </div>
    </div>
  )
}
