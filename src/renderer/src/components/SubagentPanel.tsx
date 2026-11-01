import { memo } from 'react'
import { ChevronRight, Robot01 } from './ui/icons'
import SubagentDetail from './SubagentDetail'
import { useNow } from '../hooks/use-now'
import { SUBAGENT_STATUS, subagentElapsedLabel, type SubagentTask } from '../subagents'
import { cn } from '../util'

/**
 * One task in the list.
 *
 * A single line: state, what was asked, how long it took. Model, result and
 * trajectory all live in the detail view — the panel is for scanning, not
 * reading.
 */
function TaskRow({
  task,
  now,
  onOpen
}: {
  task: SubagentTask
  now: number
  /** Drills the panel into this task's detail. */
  onOpen(task: SubagentTask): void
}): JSX.Element {
  const running = task.state === 'running' && !task.launchFailed
  const completed = task.state === 'completed' && !task.launchFailed
  const status = task.launchFailed ? SUBAGENT_STATUS.failed : SUBAGENT_STATUS[task.state]
  const prompt = task.prompt.replace(/\s+/g, ' ').trim()

  // Only live and abnormal states carry a note. A completed row is just the
  // task, so a long history stays quiet; its duration lives in the detail.
  const note = running ? subagentElapsedLabel(task, now) : completed ? '' : status.label
  const noteTone = running ? 'text-foreground-subtlest' : status.className

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(task)}
        title={task.prompt}
        className="group flex h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            status.dot,
            // Completed is the quiet default. Only live and abnormal states
            // earn a mark, so a history of finished work stays calm.
            completed && 'invisible',
            running && 'animate-pulse'
          )}
          aria-hidden
        />
        <span className="sr-only">{status.label}: </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-ui-sm group-hover:text-foreground',
            running ? 'text-foreground' : 'text-foreground-subtle'
          )}
        >
          {prompt ? (
            prompt
          ) : (
            <span className="italic text-foreground-subtlest">(no prompt)</span>
          )}
        </span>
        {note && (
          <span className={cn('shrink-0 font-mono text-ui-xs tabular-nums', noteTone)}>{note}</span>
        )}
        <ChevronRight
          size={12}
          strokeWidth={1.75}
          className="shrink-0 text-foreground-subtlest opacity-0 transition-opacity duration-[var(--duration-quick)] group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
      </button>
    </li>
  )
}

/** Group heading: a quiet label and its count. */
function SectionHead({ title, count }: { title: string; count: number }): JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5 px-2 pb-1 pt-3">
      <span className="text-ui-2xs font-medium uppercase tracking-wide text-foreground-subtlest">
        {title}
      </span>
      <span className="font-mono text-ui-2xs tabular-nums text-foreground-subtlest">{count}</span>
    </div>
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
 *
 * It is also where a task's detail lives: selecting a row (here or from either
 * transcript row) drills the same column into the full report instead of
 * opening a dialog over the app. `detailTask` is resolved by key in App, so a
 * detail left open on a running child fills in when its report lands.
 *
 * The list has no chrome of its own. The dock tab already names the panel and
 * owns its close button; a second header would only repeat both.
 */
function SubagentPanel({
  tasks,
  onOpen,
  detailTask,
  detailLaunchError,
  onBack,
  onShowInConversation
}: {
  tasks: SubagentTask[]
  /** Drills the panel into a task's detail. */
  onOpen(task: SubagentTask): void
  /** The task to show in detail, or undefined for the list. */
  detailTask?: SubagentTask
  detailLaunchError?: string
  /** Returns the panel to its task list. */
  onBack(): void
  /** Returns to the list and scrolls the transcript to this task's row. */
  onShowInConversation(task: SubagentTask): void
}): JSX.Element {
  const running = tasks.filter((task) => task.state === 'running' && !task.launchFailed)
  const finished = tasks.filter((task) => task.state !== 'running' || task.launchFailed)
  const now = useNow(running.length > 0)

  // Kept below the hook on purpose: an early return above `useNow` would make
  // the clock conditional and break the hook order between list and detail.
  if (detailTask) {
    return (
      <SubagentDetail
        key={detailTask.toolCallId}
        task={detailTask}
        launchError={detailLaunchError}
        onBack={onBack}
        onShowInConversation={onShowInConversation}
      />
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Robot01 size={16} strokeWidth={1.5} className="text-foreground-subtlest" aria-hidden />
        <p className="m-0 text-ui-sm text-foreground-subtlest">
          No subagents yet — delegated work appears here.
        </p>
      </div>
    )
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-1.5 pb-2 pt-1">
      {running.length > 0 && (
        <section>
          <SectionHead title="Running" count={running.length} />
          <ul className="m-0 flex list-none flex-col p-0">
            {running.map((task) => (
              <TaskRow key={task.key} task={task} now={now} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}
      {finished.length > 0 && (
        <section>
          <SectionHead title="Finished" count={finished.length} />
          <ul className="m-0 flex list-none flex-col p-0">
            {finished.map((task) => (
              <TaskRow key={task.key} task={task} now={now} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default memo(SubagentPanel)
