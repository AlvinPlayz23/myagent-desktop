import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Loading03 } from './ui/icons'
import type { Message } from '../../../shared/protocol'
import type { ToolRun } from '../state'
import type { ToolActivityDisplay } from '../preferences'
import ToolCard from './ToolCard'
import Thinking from './Thinking'
import MessageView from './MessageView'
import { cn } from '../util'

// A single unit of agent work: reasoning or a tool call. Consecutive entries
// are rendered together so presentation stays decoupled from history.
export type WorkEntry =
  | { kind: 'tool'; run: ToolRun }
  | { kind: 'thinking'; id: string; text: string; redacted: boolean }
  | { kind: 'message'; id: string; msg: Message }

function duration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

function EntryView({ entry }: { entry: WorkEntry }): JSX.Element {
  if (entry.kind === 'tool') return <ToolCard run={entry.run} />
  if (entry.kind === 'message') return <MessageView msg={entry.msg} messageSize="default" showThinking={false} />
  return <Thinking text={entry.redacted ? '[redacted]' : entry.text} />
}

// Renders a run of consecutive work entries as one presentation unit. The
// conversation history is unchanged regardless of mode:
//   expanded  every entry open-able (reasoning + tool cards)
//   compact   a collapsible "Worked for …" fold
//   hidden    nothing, except tool failures which always stay visible
export default function ToolGroup({
  entries,
  display
}: {
  entries: WorkEntry[]
  display: ToolActivityDisplay
}): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null

  const runs = entries.flatMap((e) => (e.kind === 'tool' ? [e.run] : []))
  const running = runs.some((r) => r.status === 'running')
  const errors = runs.filter((r) => r.status === 'error')
  const toolCount = runs.length

  if (display === 'expanded') {
    return (
      <div className="mt-5 flex flex-col gap-0.5">
        {entries.map((entry) => (
          <EntryView key={entry.kind === 'tool' ? entry.run.id : entry.id} entry={entry} />
        ))}
      </div>
    )
  }

  if (display === 'hidden') {
    // Failures are never silently swallowed, even in the quietest mode.
    if (errors.length === 0) return null
    return (
      <div className="mt-5 flex flex-col gap-0.5">
        {errors.map((run) => (
          <ToolCard key={run.id} run={run} />
        ))}
      </div>
    )
  }

  // compact
  const label = (() => {
    const tools = `${toolCount} tool${toolCount === 1 ? '' : 's'}`
    if (running) return toolCount > 0 ? `Working · ${tools}` : 'Working'
    if (toolCount === 0) return 'Thinking'
    const startedAt = Math.min(...runs.map((r) => r.createdAt))
    const endedAt = Math.max(...runs.map((r) => r.updatedAt))
    return `Worked for ${duration(endedAt - startedAt)} · ${tools}`
  })()

  return (
    <section className="mt-5 [animation:rise_0.25s_ease]">
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className="flex flex-col gap-0.5 will-change-transform"
          >
            {entries.map((entry) => (
              <EntryView key={entry.kind === 'tool' ? entry.run.id : entry.id} entry={entry} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        className="group mt-2 flex w-full items-center gap-2 text-left text-muted-foreground transition-[color,transform] hover:text-foreground active:scale-[0.98]"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="h-px flex-1 bg-border transition-colors group-hover:bg-muted-foreground/40" />
        <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium">
          <ChevronRight
            size={13}
            strokeWidth={1.8}
            className={cn('transition-transform', open && '-rotate-90')}
          />
          {running && <Loading03 size={12} strokeWidth={1.8} className="animate-spin" />}
          {label}
          {errors.length > 0 && (
            <span className="text-destructive-foreground">· {errors.length} failed</span>
          )}
        </span>
        <span className="h-px flex-1 bg-border transition-colors group-hover:bg-muted-foreground/40" />
      </button>
    </section>
  )
}
