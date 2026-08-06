import { useState } from 'react'
import type { Message } from '../../../shared/protocol'
import Markdown from './Markdown'
import Thinking from './Thinking'
import { Copy01, Check } from './ui/icons'
import { cn } from '../util'

// Copies the assistant's prose only — thinking blocks and tool calls are
// deliberately excluded, so what lands on the clipboard is what the message
// actually reads as on screen.
//
// The row is always in the DOM and only its opacity changes. Mounting it on
// hover would reflow the whole transcript under the cursor (and fight the
// autoscroll in Chat.tsx), so the space stays reserved and the button just
// fades in. `focus-visible:opacity-100` keeps it reachable by keyboard, where
// there is no hover to reveal it.
function CopyMessage({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard permission denied — nothing useful to report inline.
    }
  }

  return (
    <div className="mt-1 flex items-center">
      <button
        type="button"
        className={cn(
          'grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color,background-color]',
          'hover:bg-hover hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring',
          copied && 'text-success-foreground'
        )}
        onClick={() => void copy()}
        title={copied ? 'Copied' : 'Copy message'}
        aria-label={copied ? 'Copied' : 'Copy message'}
      >
        {copied ? <Check size={14} strokeWidth={1.8} /> : <Copy01 size={14} strokeWidth={1.8} />}
      </button>
    </div>
  )
}

interface Props {
  msg: Message
  streaming?: boolean
  messageSize?: 'compact' | 'default' | 'large'
  showThinking?: boolean
  /**
   * Measured reasoning durations for this message, keyed by content-block
   * index. Supplied while streaming so a block that has finished reasoning can
   * show its elapsed time immediately, rather than reading a bare "Thought"
   * until the whole message finalizes.
   */
  thinkingDurations?: Record<number, number>
  /**
   * Show the hover copy affordance. Opt-in, and off by default, because this
   * component renders in two very different roles: the turn's final answer, and
   * intermediate commentary folded inside a "Worked for …" group (see
   * ToolGroup's EntryView). Only the former is a message the user thinks of as
   * copyable — offering it on every folded fragment would put a row of buttons
   * down the inside of the fold. Chat.tsx sets it on the final answer alone.
   */
  copyable?: boolean
}

export default function MessageView({ msg, streaming, messageSize = 'default', showThinking = true, thinkingDurations, copyable = false }: Props): JSX.Element | null {
  const messageClass = messageSize === 'compact' ? 'text-[12px]' : messageSize === 'large' ? 'text-[15px]' : 'text-[13.5px]'
  if (msg.role === 'user') {
    const text = msg.content.map((b) => b.text ?? '').join('')
    return (
      <div className="flex justify-end [animation:rise_0.3s_ease]">
        {/* Uniformly rounded, no tail: the corner radius pairs with the
            composer's 24px so a sent message reads as the same object. */}
        <div className={cn('max-w-[80%] rounded-3xl border border-border bg-hover px-4 py-2.5 leading-relaxed text-foreground', messageClass)}>
          <Markdown text={text} />
        </div>
      </div>
    )
  }

  // Prose only, and only once the message is settled: a copy button on a
  // half-streamed answer would hand over a truncated one.
  const copyText = streaming
    ? ''
    : msg.content
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => b.text!.trim())
        .join('\n\n')

  return (
    <div className="group flex [animation:rise_0.3s_ease]">
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        {msg.content.map((block, i) => {
          if (showThinking && block.type === 'thinking' && (block.thinking || block.redacted)) {
            // Reasoning is still arriving only while its block is the last one:
            // any block after it means the model has moved on to prose or a tool.
            return (
              <Thinking
                key={i}
                text={block.redacted ? '[redacted]' : block.thinking!}
                live={!!streaming && i === msg.content.length - 1}
                durationMs={thinkingDurations?.[i]}
              />
            )
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
          // Tool calls are rendered as first-class timeline rows (see
          // ToolGroup), not inline inside the assistant message.
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
        {copyText.length > 0 && copyable && <CopyMessage text={copyText} />}
      </div>
    </div>
  )
}
