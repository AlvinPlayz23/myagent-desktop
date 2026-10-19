import { memo } from 'react'
import { ChevronRight, Robot01 } from './ui/icons'
import {
  SUBAGENT_STATUS,
  subagentDurationLabel,
  subagentFinishedTime,
  subagentModelLabel,
  subagentPromptPreview,
  subagentResultPreview,
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
 * Clicking the row drills the subagents side panel into the detail (trajectory,
 * final answer) instead of expanding inline: the report is far too large for
 * the timeline.
 *
 * A finished task's duration is fixed by its report, so unlike the tool card
 * this row never re-renders on a clock.
 */
function SubagentNotice({ task, onOpen }: { task: SubagentTask; onOpen(task: SubagentTask): void }): JSX.Element {
  const status = SUBAGENT_STATUS[task.state]
  const completed = task.state === 'completed'
  const title = subagentPromptPreview(task.prompt, 120)
  const result = subagentResultPreview(task)
  const time = subagentFinishedTime(task)
  const model = subagentModelLabel(task)
  const meta = [model, subagentDurationLabel(task)].filter(Boolean).join(' · ')

  return (
    <div
      className="transcript-rise my-0 flex flex-col text-ui-base"
      data-subagent-task={task.key}
    >
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-xl px-3 py-2 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(task)}
        title={meta}
      >
        <Robot01 size={16} strokeWidth={1.5} className="shrink-0 text-foreground-subtle" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate font-medium text-foreground">
              {title || <span className="italic text-foreground-subtlest">Subagent task</span>}
            </span>
            <span className={cn('shrink-0 text-ui-sm', completed ? 'text-foreground-subtlest' : status.className)}>
              {completed ? 'Finished' : status.label}
            </span>
          </span>
          {result && <span className="min-w-0 truncate text-ui-sm text-foreground-subtlest">{result}</span>}
        </span>
        {time && <span className="shrink-0 text-ui-sm tabular-nums text-foreground-subtlest">{time}</span>}
        <ChevronRight
          size={13}
          strokeWidth={1.75}
          className="shrink-0 text-foreground-subtlest transition-transform duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)]"
          aria-hidden
        />
      </button>
    </div>
  )
}

export default memo(SubagentNotice, (prev, next) => prev.task === next.task && prev.onOpen === next.onOpen)