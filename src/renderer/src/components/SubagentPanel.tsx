import { memo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { ChevronRight, Loading03, Robot01 } from './ui/icons'
import SubagentDetail from './SubagentDetail'
import { useNow } from '../hooks/use-now'
import {
  SUBAGENT_STATUS,
  subagentElapsedLabel,
  subagentModelLabel,
  subagentPromptPreview,
  subagentResultPreview,
  type SubagentTask
} from '../subagents'
import { cn } from '../util'

/**
 * One task in the list.
 *
 * Three lines at most: what was asked, what came back, and the metadata line.
 * The task id lives in the detail view only — it is an identifier the reader
 * copies once, not something to scan past on every row.
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
  const status = SUBAGENT_STATUS[task.state]
  const running = task.state === 'running'
  const model = subagentModelLabel(task)
  const prompt = subagentPromptPreview(task.prompt)
  const result = running ? '' : subagentResultPreview(task)

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(task)}
        title={task.prompt}
        className="flex w-full min-w-0 flex-col gap-1 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border-seam hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <span className={cn('size-1.5 shrink-0 rounded-full', status.dot)} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground">
            {prompt || <span className="font-normal italic text-foreground-subtlest">(no prompt)</span>}
          </span>
          {running && (
            <Loading03
              size={12}
              strokeWidth={1.75}
              className="shrink-0 animate-spin text-muted-foreground"
              aria-label="Running"
            />
          )}
          <ChevronRight
            size={12}
            strokeWidth={1.75}
            className="shrink-0 text-foreground-subtlest transition-transform duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)]"
            aria-hidden
          />
        </span>

        {result && (
          <span className="line-clamp-2 pl-3.5 text-ui-xs leading-relaxed text-foreground-subtlest">
            {result}
          </span>
        )}

        <span className="flex w-full min-w-0 items-center gap-1.5 pl-3.5 text-ui-xs">
          <span className={cn('shrink-0 font-medium', status.className)}>{status.label}</span>
          {model && (
            <>
              <span className="shrink-0 text-foreground-subtlest" aria-hidden>
                ·
              </span>
              <span className="min-w-0 truncate font-mono text-foreground-subtlest">{model}</span>
            </>
          )}
          <span className="ml-auto shrink-0 font-mono tabular-nums text-foreground-subtlest">
            {subagentElapsedLabel(task, now)}
          </span>
        </span>
      </button>
    </li>
  )
}

/** Group heading: micro label, count, then a hairline out to the edge. */
function SectionHead({
  title,
  count,
  live = false
}: {
  title: string
  count: number
  live?: boolean
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-2.5 pb-1 pt-2.5">
      {live && <span className="size-1.5 shrink-0 rounded-full bg-busy" aria-hidden />}
      <span className="shrink-0 text-ui-2xs uppercase tracking-wide text-foreground-subtlest">
        {title}
      </span>
      <span className="shrink-0 font-mono text-ui-2xs tabular-nums text-foreground-subtlest">
        {count}
      </span>
      <span className="h-px min-w-2 flex-1 bg-border-seam" aria-hidden />
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
 */
function SubagentPanel({
  tasks,
  onClose,
  onOpen,
  detailTask,
  detailLaunchError,
  onBack,
  onShowInConversation
}: {
  tasks: SubagentTask[]
  onClose(): void
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
  const running = tasks.filter((t) => t.state === 'running')
  const finished = tasks.filter((t) => t.state !== 'running')
  const now = useNow(running.length > 0)

  // Kept below the hook on purpose: an early return above `useNow` would make
  // the clock conditional and break the hook order between list and detail.
  if (detailTask) {
    return (
      <SubagentDetail
        task={detailTask}
        launchError={detailLaunchError}
        onBack={onBack}
        onShowInConversation={onShowInConversation}
      />
    )
  }

  const section = (title: string, rows: SubagentTask[], live = false): JSX.Element | null => {
    if (rows.length === 0) return null
    return (
      <section>
        <SectionHead title={title} count={rows.length} live={live} />
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {rows.map((task) => (
            <TaskRow key={task.key} task={task} now={now} onOpen={onOpen} />
          ))}
        </ul>
      </section>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border-seam px-2">
        <Robot01 size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground">
          Subagents
        </span>
        {running.length > 0 && (
          <span className="shrink-0 rounded-full bg-busy/15 px-1.5 py-px text-ui-xs text-warning-foreground">
            {running.length} running
          </span>
        )}
        <button
          type="button"
          title="Close subagents panel"
          aria-label="Close subagents panel"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.8} aria-hidden />
        </button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pb-2 pt-0.5">
        {tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
            <span className="grid size-11 place-items-center rounded-2xl border border-border bg-card">
              <Robot01 size={18} strokeWidth={1.5} className="text-foreground-subtlest" aria-hidden />
            </span>
            <p className="m-0 text-ui-sm leading-relaxed text-foreground-subtlest">
              No subagents in this session. The agent delegates background work on its own, and each
              task reports back here when it finishes.
            </p>
          </div>
        ) : (
          <>
            {section('Running', running, true)}
            {section('Finished', finished)}
          </>
        )}
      </div>
    </div>
  )
}

export default memo(SubagentPanel)
