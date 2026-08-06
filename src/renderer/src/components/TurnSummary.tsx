import { type ReactNode, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight } from './ui/icons'
import { cn } from '../util'

function duration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

// Deliberately self-contained: remove the TurnSummary import and render in Chat.tsx
// to retire this experiment without affecting session state or the agent protocol.
export default function TurnSummary({ startedAt, endedAt, children }: { startedAt: number; endedAt?: number; children: ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  const elapsed = (endedAt ?? Date.now()) - startedAt

  return (
    <section className="turn-summary mt-5 [animation:rise_0.25s_ease]">
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="flex flex-col gap-0.5 will-change-transform"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        className="group mt-2 flex w-full items-center gap-2 text-left text-muted-foreground transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="h-px flex-1 bg-border transition-colors group-hover:bg-muted-foreground/25" />
        <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium transition-colors group-hover:text-foreground/80">
          <ChevronRight size={13} strokeWidth={1.8} className={cn('transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]', open && '-rotate-90')} />
          Worked for {duration(elapsed)}
        </span>
        <span className="h-px flex-1 bg-border transition-colors group-hover:bg-muted-foreground/25" />
      </button>
    </section>
  )
}
