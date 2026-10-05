import { memo } from 'react'
import { ChevronRight, Robot01 } from './ui/icons'
import {
  SUBAGENT_STATUS,
  subagentDurationLabel,
  subagentModelLabel,
  type SubagentTask
} from '../subagents'
import { cn } from '../util'

/**
 * The transcript row for a finished background subagent.
 *
 * This message is the *product* of the delegation: it carries the child's final
 * answer plus the trajectory it took to get there. It arrives as a user-role
 * message, so the transcript gives it its own row instead of a human bubble —
 * and a standalone row rather than a slot inside the folded work divider,
 * because a result buried under "Worked for 38s" is a result nobody reads.
 *
 * Clicking the row opens the detail modal (trajectory, final answer) instead of
 * expanding inline: the report is far too large for the timeline.
 *
 * A finished task's duration is fixed by its report, so unlike the tool card
 * this row never re-renders on a clock.
 */
function SubagentNotice({ task, onOpen }: { task: SubagentTask; onOpen(task: SubagentTask): void }): JSX.Element {
  const status = SUBAGENT_STATUS[task.state]
  const model = subagentModelLabel(task)

  return (
    <div
      className="transcript-rise my-0 flex flex-col text-ui-base"
      data-subagent-task={task.key}
    >
      <button
        className="-mx-1.5 flex min-h-8 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(task)}
        aria-haspopup="dialog"
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
            className="shrink-0 text-foreground-subtlest transition-transform duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)]"
            aria-hidden
          />
        </span>
      </button>
    </div>
  )
}

export default memo(SubagentNotice, (prev, next) => prev.task === next.task && prev.onOpen === next.onOpen)