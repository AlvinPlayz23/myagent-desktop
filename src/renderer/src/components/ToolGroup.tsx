import { memo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import type { Message } from '../../../shared/protocol'
import type { ToolRun } from '../state'
import type { ToolActivityDisplay } from '../preferences'
import { isSubagent, type SubagentTask } from '../subagents'
import ToolCard from './ToolCard'
import SubagentToolCard from './SubagentToolCard'
import Thinking from './Thinking'
import MessageView from './MessageView'
import { cn, duration } from '../util'
import { disclosure } from '../motion'

// A single unit of agent work: reasoning or a tool call. Consecutive entries
// are rendered together so presentation stays decoupled from history.
export type WorkEntry =
  | { kind: 'tool'; run: ToolRun }
  | { kind: 'thinking'; id: string; text: string; redacted: boolean; durationMs?: number }
  | { kind: 'message'; id: string; msg: Message }

function EntryView({
  entry,
  tasks
}: {
  entry: WorkEntry
  tasks: ReadonlyMap<string, SubagentTask>
}): JSX.Element {
  if (entry.kind === 'tool') {
    // A subagent is handed off, not awaited, so it gets its own card instead of
    // the generic tool row. Tasks are keyed by tool call id, which is stable
    // across the pre-acknowledgement window (before a task id exists).
    if (isSubagent(entry.run.name)) {
      const task = tasks.get(entry.run.id)
      if (task) return <SubagentToolCard run={entry.run} task={task} />
    }
    return <ToolCard run={entry.run} />
  }
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
function ToolGroup({
  entries,
  tasks,
  display,
  live = false
}: {
  entries: WorkEntry[]
  /**
   * Background subagent tasks for the owning chat, keyed by tool call id.
   * Supplied by Chat so a subagent call renders as a hand-off card rather than a
   * finished command; omitted by callers that have no subagent state.
   */
  tasks?: ReadonlyMap<string, SubagentTask>
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
  const errors = entries.filter(
    (e): e is Extract<WorkEntry, { kind: 'tool' }> => e.kind === 'tool' && e.run.status === 'error'
  )
  const toolCount = runs.length

  const renderEntry = (entry: WorkEntry): JSX.Element => (
    <EntryView
      key={entry.kind === 'tool' ? entry.run.id : entry.id}
      entry={entry}
      tasks={tasks ?? EMPTY_TASKS}
    />
  )

  if (display === 'expanded') {
    return <div className="mt-5 flex flex-col">{entries.map(renderEntry)}</div>
  }

  if (display === 'hidden') {
    // Failures are never silently swallowed, even in the quietest mode.
    if (errors.length === 0) return null
    return <div className="mt-5 flex flex-col">{errors.map(renderEntry)}</div>
  }

  // compact — while the turn is still live (or thinking-only with nothing to
  // fold), show entries inline so users can watch each step. Once the turn ends
  // and there are tool calls, fold them behind a "Worked for …" divider that
  // starts collapsed; click to expand, click again to collapse.
  // Duration comes from tool-run timestamps so resumed history keeps summaries.
  if (running || toolCount === 0) {
    return (
      <section className="mt-5 transcript-rise">
        <div className="flex flex-col">{entries.map(renderEntry)}</div>
      </section>
    )
  }

  const startedAt = Math.min(...runs.map((r) => r.createdAt))
  const endedAt = Math.max(...runs.map((r) => r.updatedAt))
  const summary = `Worked for ${duration(endedAt - startedAt)} and made ${toolCount} tool ${toolCount === 1 ? 'call' : 'calls'}`
  return (
    <section className="mt-5 transcript-rise">
      <button
        type="button"
        className="group -mx-1.5 flex min-h-7 max-w-full items-center gap-1.5 rounded-lg px-1.5 text-left text-ui-base text-foreground-subtle outline-none transition-colors duration-[var(--duration-instant)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="min-w-0 truncate tabular-nums">{summary}</span>
        {errors.length > 0 && <span className="shrink-0 text-destructive-foreground">, {errors.length} failed</span>}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={14}
          strokeWidth={1.75}
          className={cn('shrink-0 text-foreground-subtlest transition-[transform,color] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] group-hover:text-foreground', open && 'rotate-90')}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={disclosure}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="flex flex-col pt-1">{entries.map(renderEntry)}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

const EMPTY_TASKS: ReadonlyMap<string, SubagentTask> = new Map()

// Chat rebuilds the entries array on every render, but the underlying runs,
// messages, and thinking entries keep their identities across pure streaming
// updates. Comparing by identity lets a text delta skip re-rendering every
// tool card and folded message in the timeline.
function sameEntries(a: WorkEntry[], b: WorkEntry[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((entry, i) => {
    const other = b[i]
    if (entry.kind !== other.kind) return false
    if (entry.kind === 'tool') return entry.run === (other as typeof entry).run
    if (entry.kind === 'message') return entry.msg === (other as typeof entry).msg
    return (
      entry.id === (other as typeof entry).id &&
      entry.text === (other as typeof entry).text &&
      entry.redacted === (other as typeof entry).redacted &&
      entry.durationMs === (other as typeof entry).durationMs
    )
  })
}

export default memo(
  ToolGroup,
  (prev, next) =>
    prev.display === next.display &&
    prev.live === next.live &&
    // The task index is memoized on chat identity, so this is a pointer compare
    // that only trips when a subagent actually started, settled or reported.
    prev.tasks === next.tasks &&
    sameEntries(prev.entries, next.entries)
)
