import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Copy01, Check, MoreHorizontal } from './ui/icons'
import type { Message } from '../../../shared/protocol'
import MessageDetails from './MessageDetails'
import { cn } from '../util'

// The hover affordances under a finished answer: copy, and an overflow toggle
// that reveals the details card.
//
// The row is always in the DOM and only its opacity changes. Mounting it on
// hover would reflow the transcript under the cursor (and fight the autoscroll
// in Chat.tsx), so the space stays reserved and the buttons just fade in.
// `focus-visible:opacity-100` keeps them reachable by keyboard, where there is
// no hover to reveal them.
//
// The details card is deliberately *not* in a popover. It animates its own
// width and height, and a floating menu would have to be sized to the card's
// largest state up front — clipping it at every other size. Inline under the
// message it can size itself, and the transcript reflows around it the same way
// it does for any other row.
export default function MessageActions({
  msg,
  copyText,
  durationMs
}: {
  msg: Message
  copyText: string
  durationMs?: number
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  // Nothing to show without usage: the card would be a header over an empty
  // grid, so the toggle that opens it is withheld too.
  const hasDetails = !!msg.usage

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard permission denied — nothing useful to report inline.
    }
  }

  const button = cn(
    'grid size-7 place-items-center rounded-md text-muted-foreground opacity-0',
    'transition-[opacity,color,background-color]',
    'hover:bg-hover hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring'
  )

  return (
    <div className="mt-1">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className={cn(button, copied && 'text-success-foreground')}
          onClick={() => void copy()}
          title={copied ? 'Copied' : 'Copy message'}
          aria-label={copied ? 'Copied' : 'Copy message'}
        >
          {copied ? <Check size={14} strokeWidth={1.8} /> : <Copy01 size={14} strokeWidth={1.8} />}
        </button>

        {hasDetails && (
          // Pinned visible while the card is open, so the control that closes it
          // cannot fade out from under the pointer.
          <button
            type="button"
            className={cn(button, showDetails && 'bg-hover text-foreground opacity-100')}
            onClick={() => setShowDetails((v) => !v)}
            title={showDetails ? 'Hide details' : 'Show details'}
            aria-label={showDetails ? 'Hide details' : 'Show details'}
            aria-expanded={showDetails}
          >
            <MoreHorizontal size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/* Opacity only. The card runs its own width/height springs on mount, and
          a wrapper animating geometry as well would have the two fighting for
          the same frames. */}
      <AnimatePresence initial={false}>
        {showDetails && hasDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } }}
            exit={{ opacity: 0, transition: { duration: 0.12, ease: 'easeIn' } }}
            className="mt-2"
          >
            <MessageDetails msg={msg} durationMs={durationMs} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}