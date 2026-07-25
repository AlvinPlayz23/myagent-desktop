import { useEffect, useRef } from 'react'
import { Sparkles } from './ui/icons'
import type { ChatItem, ChatState } from '../state'
import MessageView from './MessageView'

export default function Chat({
  chat,
  autoScroll = true,
  messageSize = 'default'
}: {
  chat: ChatState
  autoScroll?: boolean
  messageSize?: 'compact' | 'default' | 'large'
}): JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

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
      return (
        <div key={key} className="mt-5">
          <MessageView msg={item.msg} toolRuns={chat.toolRuns} messageSize={messageSize} />
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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" ref={scroller} onScroll={onScroll}>
      <div className="mx-auto flex max-w-3xl flex-col px-5 pb-6 pt-7 sm:px-8">
        {chat.items.length === 0 && !chat.streaming && (
          <div className="mt-[8vh] flex items-start gap-3 rounded-2xl border border-dashed border-border bg-subtle px-5 py-4 text-muted-foreground [animation:rise_0.4s_ease]">
            <Sparkles size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="m-0 leading-relaxed">Fresh session in <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground">{chat.cwd}</code>. Describe what you want built, fixed, or explained.</p>
          </div>
        )}
        {chat.items.map((item, index) => renderItem(item, `item-${index}`))}
        {chat.streaming && <div className="mt-5"><MessageView msg={chat.streaming} toolRuns={chat.toolRuns} streaming messageSize={messageSize} /></div>}
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
