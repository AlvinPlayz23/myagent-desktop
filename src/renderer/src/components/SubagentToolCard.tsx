import { memo, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Alert02, ChevronRight, Loading03, Robot01 } from './ui/icons'
import type { ToolRun } from '../state'
import { useNow } from '../hooks/use-now'
import {
  subagentElapsedLabel,
  subagentModelLabel,
  subagentStats,
  type SubagentTask
} from '../subagents'
import { cn } from '../util'
import { disclosure } from '../motion'

const MAX_PREVIEW = 5000

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
 * Shares the row anatomy of ToolCard (button, left edge, chevron, `disclosure`
 * fold) so adding a distinct glyph and meta slot does not reshape the timeline.
 */
function SubagentToolCard({ run, task }: { run: ToolRun; task: SubagentTask }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const running = task.state === 'running' && !task.launchFailed
  const now = useNow(running)

  const prompt = task.prompt
  const shown = full || prompt.length <= MAX_PREVIEW ? prompt : prompt.slice(0, MAX_PREVIEW)
  const error = ackText(run).trim()
  const model = subagentModelLabel(task)

  // Only the arguments a caller actually set; an inherited model and effort
  // would otherwise print as empty rows every single time.
  const overrides = useMemo(() => {
    const rows: [string, string][] = []
    if (run.args.model) rows.push(['model', String(run.args.model)])
    if (run.args.effort) rows.push(['effort', String(run.args.effort)])
    if (typeof run.args.timeout === 'number') rows.push(['timeout', `${run.args.timeout}s`])
    return rows
  }, [run.args])

  const label = task.launchFailed
    ? 'Failed to launch subagent'
    : running
      ? 'Delegating to subagent'
      : 'Subagent finished'

  return (
    <div className="tool-row my-0 flex flex-col text-ui-base transcript-rise" data-subagent-task={task.key}>
      <button
        className="-mx-1.5 flex min-h-8 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
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
            <Alert02 size={13} strokeWidth={1.75} aria-hidden />
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
            <div className="py-1 font-mono text-ui-sm">
              {task.launchFailed && error ? (
                <pre className="m-0 max-h-[240px] overflow-auto whitespace-pre-wrap break-words leading-relaxed text-destructive-foreground">
                  {error}
                </pre>
              ) : prompt ? (
                <>
                  <div className="mb-1 text-ui-xs uppercase tracking-wide text-foreground-subtlest">Prompt</div>
                  <pre className="m-0 max-h-[360px] overflow-auto whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                    {shown}
                  </pre>
                </>
              ) : (
                <div className="italic text-foreground-subtlest">no prompt</div>
              )}
              {prompt.length > MAX_PREVIEW && !full && (
                <button
                  className="mt-1 block font-mono text-ui-sm text-foreground underline-offset-2 hover:underline"
                  onClick={() => setFull(true)}
                >
                  show {(prompt.length - MAX_PREVIEW).toLocaleString()} more chars
                </button>
              )}
              {overrides.length > 0 && (
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-ui-xs text-foreground-subtlest">
                  {overrides.map(([key, value]) => (
                    <div key={key} className="flex gap-1.5">
                      <dt>{key}</dt>
                      <dd className="text-foreground-subtle">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {!running && !task.launchFailed && subagentStats(task) && (
                <div className="mt-2 text-ui-xs text-foreground-subtlest">{subagentStats(task)}</div>
              )}
              {running && (
                <div className="mt-2 text-ui-xs italic text-foreground-subtlest">
                  the report arrives as a system message when it finishes
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default memo(SubagentToolCard, (prev, next) => {
  // Identity of the run and the task is what changes presentation; the parent
  // rebuilds neither on unrelated streaming updates.
  return prev.run === next.run && prev.task === next.task
})