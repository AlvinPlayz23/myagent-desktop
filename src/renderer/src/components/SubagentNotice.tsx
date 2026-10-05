import { memo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Robot01 } from './ui/icons'
import {
  SUBAGENT_STATUS,
  subagentDurationLabel,
  subagentModelLabel,
  subagentPromptPreview,
  subagentStats,
  type SubagentTask
} from '../subagents'
import { cn } from '../util'
import { disclosure } from '../motion'

const MAX_BODY = 20000

/** One child message in the trajectory, rendered as a compact nested row. */
function TrajectoryRow({
  role,
  text,
  toolNames,
  isError,
  note
}: {
  role: string
  text?: string
  toolNames?: string[]
  isError?: boolean
  note?: string
}): JSX.Element {
  const tag =
    role === 'assistant' ? 'agent' : role === 'toolResult' ? 'tool' : role === 'compaction' ? 'system' : role
  return (
    <li className="flex gap-2 py-1">
      <span
        className={cn(
          'w-14 shrink-0 pt-px text-ui-2xs uppercase tracking-wide',
          isError ? 'text-destructive-foreground' : 'text-foreground-subtlest'
        )}
      >
        {tag}
      </span>
      <span className="min-w-0 flex-1 text-ui-sm leading-relaxed text-foreground-subtle">
        {note ? <span className="italic">{note}</span> : text}
        {toolNames && toolNames.length > 0 && (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {toolNames.map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="rounded-md bg-muted px-1.5 py-px font-mono text-ui-xs text-foreground-subtle"
              >
                {name}
              </span>
            ))}
          </span>
        )}
      </span>
    </li>
  )
}

/**
 * The transcript row for a finished background subagent.
 *
 * This message is the *product* of the delegation: it carries the child's final
 * answer plus the trajectory it took to get there. It arrives as a user-role
 * message, so the transcript gives it its own row instead of a human bubble —
 * and a standalone row rather than a slot inside the folded work divider,
 * because a result buried under "Worked for 38s" is a result nobody reads.
 *
 * A finished task's duration is fixed by its report, so unlike the tool card
 * this row never re-renders on a clock.
 */
function SubagentNotice({ task }: { task: SubagentTask }): JSX.Element {
  const [open, setOpen] = useState(false)
  const status = SUBAGENT_STATUS[task.state]
  const model = subagentModelLabel(task)
  const final = task.finalResult ?? ''
  const shown = final.length <= MAX_BODY ? final : `${final.slice(0, MAX_BODY)}\n\n[… truncated]`

  return (
    <div
      className="transcript-rise my-0 flex flex-col text-ui-base"
      data-subagent-task={task.key}
    >
      <button
        className="-mx-1.5 flex min-h-8 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="relative grid size-4 shrink-0 place-items-center">
          <Robot01 size={16} strokeWidth={1.5} className="text-foreground-subtle" />
        </span>
        <span className="shrink-0 text-foreground-subtle">
          Subagent <span className="font-mono text-ui-sm">{task.taskId ?? task.key}</span> finished
        </span>
        <span className={cn('shrink-0 text-ui-sm', status.className)}>{status.label}</span>
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          {model && (
            <span className="min-w-0 max-w-[14rem] truncate font-mono text-ui-xs text-foreground-subtlest">
              {model}
            </span>
          )}
          <span className="shrink-0 font-mono text-ui-xs tabular-nums text-foreground-subtlest">
            {subagentDurationLabel(task)}
          </span>
          <ChevronRight
            size={13}
            strokeWidth={1.75}
            className={cn(
              'shrink-0 text-foreground-subtlest transition-transform duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)]',
              open && 'rotate-90'
            )}
            aria-hidden
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={disclosure}
            initial="initial"
            animate="animate"
            exit="exit"
            className="ml-6 overflow-hidden"
          >
            <div className="surface-card min-w-0 px-2.5 py-2 font-mono text-ui-sm">
              {task.error && (
                <p className="m-0 mb-2 whitespace-pre-wrap break-words leading-relaxed text-destructive-foreground">
                  {task.error}
                </p>
              )}
              <div className="mb-1 font-sans text-ui-2xs uppercase tracking-wide text-foreground-subtlest">
                Final answer
              </div>
              <pre className="m-0 max-h-[360px] overflow-auto whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                {shown}
              </pre>
              {final.length > MAX_BODY && (
                <div className="mt-1 text-foreground-subtlest">
                  {(final.length - MAX_BODY).toLocaleString()} more chars in the full report
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-sans text-ui-xs text-foreground-subtlest">
                {subagentStats(task) && <span>{subagentStats(task)}</span>}
                {task.effort && <span>effort {task.effort}</span>}
                {task.provider && <span>{task.provider}</span>}
              </div>
              {task.trajectory && task.trajectory.length > 0 && (
                <div className="mt-2 border-t border-border/40 pt-1 font-sans">
                  <div className="mb-0.5 text-ui-2xs uppercase tracking-wide text-foreground-subtlest">
                    Trajectory ({task.trajectory.length})
                  </div>
                  <ul className="m-0 list-none p-0">
                    {task.trajectory.map((entry, i) => (
                      <TrajectoryRow
                        key={i}
                        role={entry.role}
                        text={entry.text}
                        toolNames={entry.toolCalls?.map((call) => call.name)}
                        isError={entry.isError}
                        note={entry.note}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {task.prompt && (
                <div className="mt-2 border-t border-border/40 pt-1 font-sans">
                  <div className="mb-0.5 text-ui-2xs uppercase tracking-wide text-foreground-subtlest">Prompt</div>
                  <p className="m-0 whitespace-pre-wrap break-words leading-relaxed text-ui-sm text-foreground-subtlest">
                    {subagentPromptPreview(task.prompt, 600)}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default memo(SubagentNotice, (prev, next) => prev.task === next.task)