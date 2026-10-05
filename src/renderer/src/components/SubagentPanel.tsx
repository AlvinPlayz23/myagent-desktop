import { memo, useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { ChevronRight, Loading03, Robot01 } from './ui/icons'
import {
  SUBAGENT_STATUS,
  subagentElapsedLabel,
  subagentModelLabel,
  subagentPromptPreview,
  type SubagentTask
} from '../subagents'
import { cn } from '../util'

/** Dot + text tone per state, mirroring the transcript's status pill. */
const DOT: Record<string, string> = {
  running: 'bg-busy',
  completed: 'bg-success',
  failed: 'bg-destructive',
  timed_out: 'bg-warning',
  cancelled: 'bg-foreground-subtlest'
}

/**
 * Ticks once a second, but only while a child is actually in flight. The panel
 * renders inside the app shell next to the streaming transcript, so an
 * unconditional clock would re-render it on every token.
 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function TaskRow({
  task,
  now,
  onOpen
}: {
  task: SubagentTask
  now: number
  /** Opens the full detail modal for this task. */
  onOpen(task: SubagentTask): void
}): JSX.Element {
  const status = SUBAGENT_STATUS[task.state]
  const running = task.state === 'running'
  const model = subagentModelLabel(task)
  const prompt = subagentPromptPreview(task.prompt)

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex w-full min-w-0 flex-col gap-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <span className="grid size-4 shrink-0 place-items-center">
            <Robot01 size={14} strokeWidth={1.5} className="text-muted-foreground" />
          </span>
          <span className={cn('size-1.5 shrink-0 rounded-full', DOT[task.state])} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-ui-sm text-foreground-subtle">
            {prompt || <span className="italic text-foreground-subtlest">(no prompt)</span>}
          </span>
          {running && (
            <Loading03 size={12} strokeWidth={1.75} className="shrink-0 animate-spin text-muted-foreground" />
          )}
          <span className="shrink-0 font-mono text-ui-xs tabular-nums text-foreground-subtlest">
            {subagentElapsedLabel(task, now)}
          </span>
          <ChevronRight
            size={12}
            strokeWidth={1.75}
            className="shrink-0 text-foreground-subtlest transition-transform duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)]"
            aria-hidden
          />
        </span>
        <span className="flex w-full min-w-0 items-center gap-1.5 pl-6 text-ui-xs">
          <span className={cn('shrink-0', status.className)}>{status.label}</span>
          {task.taskId && (
            <span className="shrink-0 font-mono text-foreground-subtlest">{task.taskId}</span>
          )}
          {model && <span className="min-w-0 truncate font-mono text-foreground-subtlest">· {model}</span>}
        </span>
      </button>
    </li>
  )
}

/**
 * Side list of every background subagent this session has delegated to.
 *
 * The transcript only shows a task where it was launched and where it
 * reported; this panel is the between-the-two view. Its job is answering
 * "what is the agent actually doing right now" — which matters most for
 * running children, since the parent turn has usually ended by the time a
 * report is still outstanding.
 */
function SubagentPanel({
  tasks,
  onClose,
  onOpen
}: {
  tasks: SubagentTask[]
  onClose(): void
  /** Opens the full detail modal for a task. */
  onOpen(task: SubagentTask): void
}): JSX.Element {
  const running = tasks.filter((t) => t.state === 'running')
  const finished = tasks.filter((t) => t.state !== 'running')
  const now = useNow(running.length > 0)

  const section = (title: string, rows: SubagentTask[]): JSX.Element | null => {
    if (rows.length === 0) return null
    return (
      <div className="mb-2">
        <div className="px-2 pb-0.5 text-ui-sm font-medium text-muted-foreground">
          {title} ({rows.length})
        </div>
        <ul className="m-0 list-none p-0">
          {rows.map((task) => (
            <TaskRow key={task.key} task={task} now={now} onOpen={onOpen} />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
        <Robot01 size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground">Subagents</span>
        {running.length > 0 && (
          <span className="shrink-0 rounded-full bg-busy/15 px-1.5 py-px text-ui-xs text-warning-foreground">
            {running.length} running
          </span>
        )}
        <button
          type="button"
          title="Close subagents panel"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} aria-hidden />
        </button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1 py-1.5">
        {tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
            <span className="grid size-11 place-items-center rounded-2xl border border-border bg-card">
              <Robot01 size={18} strokeWidth={1.5} className="text-foreground-subtlest" />
            </span>
            <p className="m-0 text-ui-sm leading-relaxed text-foreground-subtlest">
              No subagents in this session. The agent delegates background work on its own, and each task
              reports back here when it finishes.
            </p>
          </div>
        ) : (
          <>
            {section('Running', running)}
            {section('Finished', finished)}
          </>
        )}
      </div>
    </div>
  )
}

export default memo(SubagentPanel)