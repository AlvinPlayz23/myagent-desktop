import { memo } from 'react'
import { Alert02, ChevronRight, Loading03, Robot01 } from './ui/icons'
import type { ToolRun } from '../state'
import { useNow } from '../hooks/use-now'
import { subagentElapsedLabel, subagentModelLabel, type SubagentTask } from '../subagents'
import { cn } from '../util'

/** Result body of the launch acknowledgement, which is prose for the model. */
function ackText(run: ToolRun): string {
  const result = run.result ?? run.partial
  if (!result || !Array.isArray(result.content)) return ''
  return result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
}

/**
 * The subagent tool call, rendered as a first-class timeline row.
 *
 * A subagent is not an inline operation: the call returns a task id within a
 * frame and the child keeps working for minutes after the turn ends, delivering
 * its report later as a system-generated message. So this card does not read as
 * "a command that ran" — it reads as work that was *handed off*, and it keeps
 * ticking until the report lands.
 *
 * Clicking the row opens the detail modal (prompt, trajectory, final answer)
 * rather than expanding inline: the report is far too large for the timeline,
 * and the modal is where the trajectory lives.
 *
 * Shares the row anatomy of ToolCard (button, left edge, chevron) so adding a
 * distinct glyph and meta slot does not reshape the timeline.
 */
function SubagentToolCard({
  run,
  task,
  onOpen
}: {
  run: ToolRun
  task: SubagentTask
  /**
   * Opens the detail modal. Receives the launch acknowledgement text when the
   * task never started — only this card holds the tool run, so only it can
   * supply that error.
   */
  onOpen(task: SubagentTask, launchError?: string): void
}): JSX.Element {
  const running = task.state === 'running' && !task.launchFailed
  const now = useNow(running)
  const model = subagentModelLabel(task)

  const label = task.launchFailed
    ? 'Failed to launch subagent'
    : running
      ? 'Delegating to subagent'
      : 'Subagent finished'

  return (
    <div className="tool-row my-0 flex flex-col text-ui-base transcript-rise" data-subagent-task={task.key}>
      <button
        className="-mx-1.5 flex min-h-8 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(task, task.launchFailed ? ackText(run).trim() || undefined : undefined)}
        aria-haspopup="dialog"
      >
        <span className="relative grid size-4 shrink-0 place-items-center">
          <Robot01
            size={16}
            strokeWidth={1.5}
            className={cn(task.launchFailed ? 'text-destructive-foreground' : 'text-foreground-subtle')}
          />
        </span>
        <span
          className={cn(
            'shrink-0',
            running ? 'font-medium text-foreground' : 'text-foreground-subtle'
          )}
        >
          {label}
        </span>
        {running && (
          <Loading03
            size={13}
            strokeWidth={1.75}
            className="shrink-0 animate-spin text-foreground-subtle"
            aria-label="Running"
          />
        )}
        {task.launchFailed && (
          <span className="flex shrink-0 items-center gap-1 text-ui-sm text-destructive-foreground">
            <Alert02 size={13} strokeWidth={1.8} aria-hidden />
            Failed
          </span>
        )}
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          {model && (
            <span className="min-w-0 max-w-[14rem] truncate rounded-md bg-muted px-2 py-0.5 font-mono text-ui-sm text-foreground-subtle">
              {model}
            </span>
          )}
          {task.taskId && (
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-ui-xs text-foreground-subtlest">
              {task.taskId}
            </span>
          )}
          <span className="shrink-0 font-mono text-ui-xs tabular-nums text-foreground-subtlest">
            {subagentElapsedLabel(task, now)}
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

export default memo(SubagentToolCard, (prev, next) => {
  // Identity of the run and the task is what changes presentation; the parent
  // rebuilds neither on unrelated streaming updates. onOpen is a stable
  // callback owned by App.
  return prev.run === next.run && prev.task === next.task && prev.onOpen === next.onOpen
})