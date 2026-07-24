import { useState } from 'react'
import { BrainCircuit, ChevronRight } from './ui/icons'
import type { Message } from '../../../shared/protocol'
import type { ToolRun } from '../state'
import Markdown from './Markdown'
import ToolCard from './ToolCard'
import { cn } from '../util'

function Thinking({ text }: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="my-0 flex flex-col font-sans">
      <button
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-[12px] font-medium transition-colors hover:bg-hover/60 hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        <span className="grid w-3.5 place-items-center shrink-0">
          <ChevronRight size={12} strokeWidth={1.8} className={cn('text-muted-foreground/70 transition-transform', open && 'rotate-90')} />
        </span>
        <span className="grid w-4 place-items-center shrink-0">
          <BrainCircuit size={14} strokeWidth={1.8} className="text-muted-foreground" />
        </span>
        <span className="text-muted-foreground font-medium">thinking</span>
      </button>
      {open && (
        <div className="ml-7 mt-1 border-l-2 border-border/50 pl-3 py-1 font-sans text-[12.5px] italic leading-relaxed text-muted-foreground/90 whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  )
}

interface Props {
  msg: Message
  toolRuns: Record<string, ToolRun>
  streaming?: boolean
  messageSize?: 'compact' | 'default' | 'large'
  showThinking?: boolean
}

export default function MessageView({ msg, toolRuns, streaming, messageSize = 'default', showThinking = true }: Props): JSX.Element | null {
  const messageClass = messageSize === 'compact' ? 'text-[12px]' : messageSize === 'large' ? 'text-[15px]' : 'text-[13.5px]'
  if (msg.role === 'user') {
    const text = msg.content.map((b) => b.text ?? '').join('')
    return (
      <div className="flex justify-end [animation:rise_0.3s_ease]">
        <div className={cn('max-w-[80%] rounded-2xl rounded-br-md border border-border bg-hover px-4 py-2.5 leading-relaxed text-foreground', messageClass)}>
          <Markdown text={text} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex [animation:rise_0.3s_ease]">
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        {msg.content.map((block, i) => {
          if (showThinking && block.type === 'thinking' && (block.thinking || block.redacted)) {
            return <Thinking key={i} text={block.redacted ? '[redacted]' : block.thinking!} />
          }
          if (block.type === 'text' && block.text) {
            return <div key={i} className={messageClass}><Markdown text={block.text} /></div>
          }
          if (block.type === 'image' && block.data && block.mimeType) {
            return (
              <img
                key={i}
                src={`data:${block.mimeType};base64,${block.data}`}
                alt="Shared image"
                className="max-h-[520px] max-w-full rounded-xl outline outline-1 outline-border"
              />
            )
          }
          if (block.type === 'toolCall' && block.id) {
            const run = toolRuns[block.id] ?? {
              id: block.id,
              name: block.name ?? 'tool',
              args: block.arguments ?? {},
              status: 'running' as const
            }
            return <ToolCard key={block.id} run={run} />
          }
          return null
        })}
        {streaming && (
          <span className="inline-block h-[15px] w-[7px] rounded-[2px] bg-foreground/70 align-text-bottom [animation:blink_1s_steps(1)_infinite]" />
        )}
        {msg.stopReason === 'error' && msg.errorMessage && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 font-mono text-[12px] text-destructive-foreground">
            {msg.errorMessage}
          </div>
        )}
      </div>
    </div>
  )
}
