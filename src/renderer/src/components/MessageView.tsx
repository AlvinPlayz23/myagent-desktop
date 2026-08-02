import type { Message } from '../../../shared/protocol'
import Markdown from './Markdown'
import Thinking from './Thinking'
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
}

export default function MessageView({ msg, streaming, messageSize = 'default', showThinking = true, thinkingDurations }: Props): JSX.Element | null {
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
      </div>
    </div>
  )
}
