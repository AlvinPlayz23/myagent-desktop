import { memo } from 'react'
import type { Message } from '../../../shared/protocol'
import Markdown from './Markdown'
import Thinking from './Thinking'
import MessageActions from './MessageActions'
import { cn } from '../util'

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
  if (msg.role === 'user') {
    const text = msg.content.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('')
    const images = msg.content.filter((block) => block.type === 'image' && block.data && block.mimeType)
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
        {msg.stopReason === 'error' && msg.errorMessage && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 font-mono text-[12px] text-destructive-foreground">
            {msg.errorMessage}
          </div>
        )}
        {copyText.length > 0 && copyable && <MessageActions msg={msg} copyText={copyText} />}
      </div>
    </div>
  )
}

export default memo(MessageView)
