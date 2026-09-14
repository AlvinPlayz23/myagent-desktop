import { memo, useState } from 'react'
import type { Message } from '../../../shared/protocol'
import Markdown from './Markdown'
import Thinking from './Thinking'
import MessageActions from './MessageActions'
import { Alert02, Check, Copy01 } from './ui/icons'
import { parseProviderError } from '../errorMessage'
import { cn } from '../util'

function ErrorCard({ raw }: { raw: string }): JSX.Element {
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)
  const parsed = parseProviderError(raw)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(parsed.raw)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard unavailable — keep the card as-is.
    }
  }

  if (dismissed) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-muted-foreground">
        <Alert02 size={13} strokeWidth={1.8} className="shrink-0 text-destructive-foreground/70" />
        <span className="min-w-0 flex-1 truncate">
          Something went wrong{parsed.status ? ` (${parsed.status}${parsed.title && parsed.title !== `Request failed (${parsed.status})` ? ` · ${parsed.title}` : ''})` : ''} — dismissed
        </span>
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="shrink-0 rounded-md px-2 py-1 font-medium text-foreground/80 transition-colors hover:bg-hover hover:text-foreground"
        >
          Show
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-3 [animation:rise_0.3s_ease]">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive-foreground">
        <Alert02 size={14} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {parsed.status != null && (
            <span className="rounded-md bg-destructive/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-destructive-foreground">
              {parsed.status}
            </span>
          )}
          <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">{parsed.title}</span>
        </div>
        {(parsed.detail ?? parsed.hint) && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {parsed.detail}
            {parsed.detail && parsed.hint ? ` ${parsed.hint}` : parsed.hint}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={() => void copy()}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            title={copied ? 'Copied' : 'Copy full error'}
            aria-label={copied ? 'Copied' : 'Copy full error'}
          >
            {copied ? <Check size={13} strokeWidth={1.8} /> : <Copy01 size={13} strokeWidth={1.8} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      </div>
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

function MessageView({ msg, streaming, messageSize = 'default', showThinking = true, thinkingDurations, copyable = false }: Props): JSX.Element | null {
  const messageClass = messageSize === 'compact' ? 'text-[12px]' : messageSize === 'large' ? 'text-[15px]' : 'text-[13.5px]'
  // The wire can deliver `"content": null` (Go nil slice), e.g. a streaming
  // partial that never produced a block before stop/abort. Never let that
  // throw during render — an empty transcript row is always preferable to a
  // blank app.
  if (!msg) return null
  const blocks = Array.isArray(msg.content) ? msg.content : []
  if (msg.role === 'user') {
    const text = blocks.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('')
    const images = blocks.filter((block) => block.type === 'image' && block.data && block.mimeType)
    return (
      <div className="flex justify-end [animation:rise_0.3s_ease]">
        {/* Uniformly rounded, no tail: the corner radius pairs with the
            composer's 24px so a sent message reads as the same object. */}
        <div className={cn('flex max-w-[80%] flex-col gap-2.5 rounded-3xl border border-border bg-hover p-2.5 leading-relaxed text-foreground', text && 'px-4', messageClass)}>
          {images.length > 0 && (
			<div className={cn('grid gap-2', images.length > 1 && 'grid-cols-2')}>
			  {images.map((image, index) => (
				<img
				  key={index}
				  src={`data:${image.mimeType};base64,${image.data}`}
				  alt={`Attached image ${index + 1}`}
				  className="attachment-image max-h-64 max-w-full rounded-2xl object-cover"
				/>
			  ))}
			</div>
		  )}
		  {text && <Markdown text={text} />}
        </div>
      </div>
    )
  }

  // Prose only, and only once the message is settled: a copy button on a
  // half-streamed answer would hand over a truncated one.
  const copyText = streaming
    ? ''
    : blocks
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => b.text!.trim())
        .join('\n\n')

  return (
    <div className="group flex [animation:rise_0.3s_ease]">
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        {blocks.map((block, i) => {
          if (showThinking && block.type === 'thinking' && (block.thinking || block.redacted)) {
            // Reasoning is still arriving only while its block is the last one:
            // any block after it means the model has moved on to prose or a tool.
            return (
              <Thinking
                key={i}
                text={block.redacted ? '[redacted]' : block.thinking!}
                live={!!streaming && i === blocks.length - 1}
                durationMs={thinkingDurations?.[i]}
              />
            )
          }
          if (block.type === 'text' && block.text) {
            // While the message is still streaming the text is rendered as a
            // plain pre-wrapped node: react-markdown would re-parse the whole
            // growing transcript on every delta. The full parse runs once the
            // message finalizes and this branch stops matching.
            if (streaming) {
              return (
                <div key={i} className={cn('chat-markdown whitespace-pre-wrap', messageClass)}>
                  {block.text}
                </div>
              )
            }
            return <div key={i} className={messageClass}><Markdown text={block.text} /></div>
          }
          if (block.type === 'image' && block.data && block.mimeType) {
            return (
              <img
                key={i}
                src={`data:${block.mimeType};base64,${block.data}`}
                alt="Shared image"
				className="attachment-image max-h-[520px] max-w-full rounded-xl"
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
        {msg.stopReason === 'error' && msg.errorMessage && <ErrorCard raw={msg.errorMessage} />}
        {copyText.length > 0 && copyable && <MessageActions msg={msg} copyText={copyText} />}
      </div>
    </div>
  )
}

export default memo(MessageView)
