import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight } from './ui/icons'
import type { Message } from '../../../shared/protocol'
import type { ToolRun } from '../state'
import type { ToolActivityDisplay } from '../preferences'
import ToolCard from './ToolCard'
import Thinking from './Thinking'
import MessageView from './MessageView'
import { cn, duration } from '../util'

// A single unit of agent work: reasoning or a tool call. Consecutive entries
// are rendered together so presentation stays decoupled from history.
export type WorkEntry =
  | { kind: 'tool'; run: ToolRun }
  | { kind: 'thinking'; id: string; text: string; redacted: boolean; durationMs?: number }
  | { kind: 'message'; id: string; msg: Message }

function EntryView({ entry }: { entry: WorkEntry }): JSX.Element {
  if (entry.kind === 'tool') return <ToolCard run={entry.run} />
  if (entry.kind === 'message') return <MessageView msg={entry.msg} messageSize="default" showThinking={false} />
  // Entries reaching a group are finalized, so reasoning is never live here.
  return <Thinking text={entry.redacted ? '[redacted]' : entry.text} durationMs={entry.durationMs} />
}

// Renders a run of consecutive work entries as one presentation unit. The
// conversation history is unchanged regardless of mode:
//   expanded  every entry open-able (reasoning + tool cards)
//   compact   tools inline while running; once the work settles they fold
//             behind a collapsed "Worked for …" divider the user can expand
//   hidden    nothing, except tool failures which always stay visible
export default function ToolGroup({
  entries,
  display,
  live = false
}: {
  entries: WorkEntry[]
  display: ToolActivityDisplay
  /**
   * The turn that produced these entries is still in flight. Tool status alone
   * cannot answer that: between two tool calls every run reads 'done' while the
   * provider is still thinking, retrying, or waiting on a slow response. Folding
   * on that would claim the work had finished and then reopen when the next
   * entry landed, so the fold waits for the turn itself to end.
   */
  live?: boolean
}): JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null

  const runs = entries.flatMap((e) => (e.kind === 'tool' ? [e.run] : []))
  const running = live || runs.some((r) => r.status === 'running')
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

  // compact — while the turn is still live (or thinking-only with nothing to
  // fold), show entries inline so users can watch each step. Once the turn ends
  // and there are tool calls, fold them behind a "Worked for …" divider that
  // starts collapsed; click to expand, click again to collapse.
  // Duration comes from tool-run timestamps so resumed history keeps summaries.
  if (running || toolCount === 0) {
    return (
      <section className="mt-5 [animation:rise_0.25s_ease]">
        <div className="flex flex-col gap-0.5">
          {entries.map((entry) => (
            <EntryView key={entry.kind === 'tool' ? entry.run.id : entry.id} entry={entry} />
          ))}
        </div>
      </section>
    )
  }

  const startedAt = Math.min(...runs.map((r) => r.createdAt))
  const endedAt = Math.max(...runs.map((r) => r.updatedAt))
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
          {`Worked for ${duration(endedAt - startedAt)} · ${toolCount} tool${toolCount === 1 ? '' : 's'}`}
          {errors.length > 0 && (
            <span className="text-destructive-foreground">· {errors.length} failed</span>
          )}
        </span>
        <span className="h-px flex-1 bg-border transition-colors group-hover:bg-muted-foreground/40" />
      </button>
    </section>
  )
}
