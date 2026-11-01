import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Alert02,
  ChevronLeft,
  ChevronRight,
  Loading03,
  Message01,
  MoreHorizontal
} from './ui/icons'
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card'
import Markdown from './LazyMarkdown'
import DiffView from './DiffView'
import { disclosure } from '../motion'
import { cn, duration } from '../util'
import { buildToolDiff } from '../diff'
import { toolIcon, TOOL_LABELS, toolSummary } from '../toolMeta'
import { useNow } from '../hooks/use-now'
import {
  SUBAGENT_STATUS,
  compactTokens,
  subagentCost,
  subagentDurationLabel,
  subagentElapsed,
  subagentModelLabel,
  type SubagentTask
} from '../subagents'
import type { SubagentToolCall, SubagentTrajectoryMessage } from '../../../shared/protocol'

/**
 * A trajectory tool call, rendered with the main timeline's tool-row anatomy:
 * same icon, same past-tense label, same argument summary chip, same
 * expandable body (bash command block, edit/write diff, result text).
 *
 * The shapes line up on purpose. A trajectory call carries `{id, name,
 * arguments?}` and its matching toolResult message carries `{toolCallId,
 * toolName, text?, isError?}` — enough to fill every slot of the ToolCard row
 * except live status, which a recorded trajectory never has.
 */
function TrajectoryToolRow({
  call,
  result
}: {
  call: SubagentToolCall
  result?: SubagentTrajectoryMessage
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const Icon = toolIcon(call.name)
  const label = TOOL_LABELS[call.name] ?? call.name
  const summary = toolSummary(call.arguments)
  const failed = result?.isError === true
  const resultText = result?.text ?? ''
  const args = call.arguments ?? {}
  const command = typeof args.command === 'string' ? args.command : null
  // buildToolDiff only reads name + args, so a recorded call renders the same
  // edit/write diff as its live transcript counterpart.
  const diff = useMemo(
    () => (failed ? null : buildToolDiff({ name: call.name, args })),
    [args, call.name, failed]
  )

  return (
    <div className="tool-row my-0 flex flex-col text-ui-sm">
      <button
        type="button"
        className="-mx-1.5 flex min-h-8 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="relative grid size-4 shrink-0 place-items-center">
          <Icon
            size={16}
            strokeWidth={1.5}
            className={cn(failed ? 'text-destructive-foreground' : 'text-foreground-subtle')}
          />
        </span>
        <span className="shrink-0 text-foreground-subtle">{label}</span>
        {failed && (
          <span className="flex shrink-0 items-center gap-1 text-ui-sm text-destructive-foreground">
            <Alert02 size={13} strokeWidth={1.75} aria-hidden />
            Failed
          </span>
        )}
        {diff && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-ui-xs tabular-nums">
            {diff.additions > 0 && <span className="text-diff-added-foreground">+{diff.additions}</span>}
            {diff.deletions > 0 && <span className="text-diff-removed-foreground">−{diff.deletions}</span>}
          </span>
        )}
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          {summary && (
            <span className="min-w-0 max-w-[14rem] truncate rounded-md bg-muted px-2 py-0.5 font-mono text-ui-xs text-foreground-subtle">
              {summary}
            </span>
          )}
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
              {command && (
                <div className="mb-1.5 whitespace-pre-wrap break-all rounded-md bg-surface px-2.5 py-1.5 text-foreground">
                  <span className="font-bold text-foreground">$</span> {command}
                </div>
              )}
              {diff ? (
                <DiffView diff={diff} />
              ) : resultText ? (
                <pre className="m-0 max-h-[360px] overflow-auto whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                  {resultText}
                </pre>
              ) : (
                <div className="italic text-foreground-subtlest">no output recorded</div>
              )}
              {result?.note && (
                <div className="mt-1.5 italic text-foreground-subtlest">{result.note}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A rare, actionable failure. Kept compact: the task itself is still the subject. */
function ErrorNote({ title, message }: { title?: string; message?: string }): JSX.Element {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-ui-sm text-destructive-foreground">
      <Alert02 size={14} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <p className="m-0 font-medium">{title}</p>}
        {message && (
          <pre
            className={cn(
              'm-0 whitespace-pre-wrap break-words font-mono text-ui-xs leading-relaxed',
              title && 'mt-1'
            )}
          >
            {message}
          </pre>
        )}
      </div>
    </div>
  )
}

interface Props {
  task: SubagentTask
  /** The launch acknowledgement text for a task that never started. Only the
   *  transcript card holds the tool run, so only it can supply this. */
  launchError?: string
  /** Returns the panel to its task list. */
  onBack(): void
  /** Returns to the list and scrolls the transcript to this task's row. */
  onShowInConversation(task: SubagentTask): void
}

/**
 * The full view of one background subagent: prompt, a compact list of tool
 * calls folded behind the tool-call disclosure, then the final answer.
 *
 * This is the drill-in target of the subagents side panel, not a dialog — it
 * fills the panel column it is dropped into. The task is resolved by key on
 * every render (see App), so a detail left open on a running child fills in the
 * moment its report lands instead of freezing on the launch snapshot.
 */
export default function SubagentDetail({ task, launchError, onBack, onShowInConversation }: Props): JSX.Element {
  const [trajectoryOpen, setTrajectoryOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [answerOpen, setAnswerOpen] = useState(false)
  const running = task.state === 'running' && !task.launchFailed
  // Ticks only while the child is in flight; settled reports have fixed times.
  const now = useNow(running)
  const status = task.launchFailed ? SUBAGENT_STATUS.failed : SUBAGENT_STATUS[task.state]
  const model = subagentModelLabel(task)
  const trajectory = task.trajectory ?? []

  // Escape steps back to the list. Scoped to the detail pane so it never fights
  // the app's global shortcut handling (Esc there only dismisses a notice).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  // Pair each result with its call so the compact tool row can expand onto its
  // outcome. The outer disclosure shows only tool calls; verbose assistant
  // commentary and system compaction notes stay out of this summary.
  const { blocks, toolCallCount } = useMemo(() => {
    const resultsByCallId = new Map<string, SubagentTrajectoryMessage>()
    for (const entry of trajectory) {
      if (entry.role === 'toolResult' && entry.toolCallId) {
        resultsByCallId.set(entry.toolCallId, entry)
      }
    }
    const out: JSX.Element[] = []
    let calls = 0
    trajectory.forEach((entry) => {
      if (entry.role === 'user') return
      if (entry.role === 'compaction' || entry.role === 'toolResult') return
      for (const call of entry.toolCalls ?? []) {
        calls++
        out.push(<TrajectoryToolRow key={call.id} call={call} result={resultsByCallId.get(call.id)} />)
      }
    })
    return { blocks: out, toolCallCount: calls }
  }, [trajectory])

  const elapsedMs = running ? subagentElapsed(task, now) : (task.durationMs ?? 0)
  const tokens = task.usage?.totalTokens ?? 0
  const details = [
    { label: 'Model', value: task.model?.trim() || model },
    { label: running ? 'Elapsed' : 'Duration', value: duration(elapsedMs) },
    { label: 'Tokens', value: tokens ? compactTokens(tokens) : '' },
    { label: 'Cost', value: subagentCost(task) }
  ].filter((detail) => detail.value)
  const final = task.finalResult ?? ''
  // Long delegation prompts are the common case; clamping keeps the tool calls
  // and the answer on screen instead of pushing them below a wall of text.
  const promptLong = task.prompt.length > 200

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border-seam pl-1 pr-1.5">
        <button
          type="button"
          title="Back to subagents"
          aria-label="Back to subagents"
          onClick={onBack}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft size={15} strokeWidth={1.8} aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate px-0.5 text-ui-sm font-medium text-foreground">
          Subagent
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-ui-xs">
          <span
            className={cn('size-1.5 shrink-0 rounded-full', status.dot, running && 'animate-pulse')}
            aria-hidden
          />
          <span className={status.className}>{status.label}</span>
        </span>
        <button
          type="button"
          title="Show in conversation"
          aria-label="Show in conversation"
          onClick={() => onShowInConversation(task)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Message01 size={14} strokeWidth={1.8} aria-hidden />
        </button>
        {!task.launchFailed && details.length > 0 && (
          <HoverCard>
            <HoverCardTrigger
              delay={150}
              render={
                <button
                  type="button"
                  aria-label="Task details"
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            >
              <MoreHorizontal size={15} strokeWidth={1.8} aria-hidden />
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-60">
              <dl className="m-0 flex flex-col gap-1.5 text-ui-xs">
                {details.map((detail) => (
                  <div key={detail.label} className="flex items-baseline justify-between gap-4">
                    <dt className="shrink-0 text-foreground-subtlest">{detail.label}</dt>
                    <dd className="m-0 min-w-0 break-all text-right font-mono text-foreground-subtle">
                      {detail.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </HoverCardContent>
          </HoverCard>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-3">
          {task.prompt && (
            <div>
              <p
                className={cn(
                  'm-0 whitespace-pre-wrap break-words text-ui-sm leading-relaxed text-foreground-subtle',
                  !promptOpen && promptLong && 'line-clamp-2'
                )}
              >
                {task.prompt}
              </p>
              {promptLong && (
                <button
                  type="button"
                  onClick={() => setPromptOpen((value) => !value)}
                  className="mt-1 text-ui-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {promptOpen ? 'Show less' : 'Show full prompt'}
                </button>
              )}
            </div>
          )}

          {task.launchFailed ? (
            <ErrorNote title="Failed to launch" message={launchError || task.error} />
          ) : (
            <>
              {task.error && <ErrorNote message={task.error} />}

              {running && blocks.length === 0 && (
                <div className="flex items-center gap-2 text-ui-sm text-muted-foreground">
                  <Loading03 size={13} strokeWidth={1.8} className="shrink-0 animate-spin" aria-hidden />
                  <span>Working…</span>
                </div>
              )}

              {toolCallCount > 0 && (
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="group -mx-1.5 flex min-h-7 max-w-full items-center gap-1.5 rounded-lg px-1.5 text-left text-ui-sm text-foreground-subtle outline-none transition-colors duration-[var(--duration-instant)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setTrajectoryOpen((value) => !value)}
                    aria-expanded={trajectoryOpen}
                  >
                    <span className="min-w-0 truncate tabular-nums">
                      {toolCallCount} tool {toolCallCount === 1 ? 'call' : 'calls'}
                    </span>
                    <ChevronRight
                      size={13}
                      strokeWidth={1.75}
                      className={cn(
                        'shrink-0 text-foreground-subtlest transition-[transform,color] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] group-hover:text-foreground',
                        trajectoryOpen && 'rotate-90'
                      )}
                      aria-hidden
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {trajectoryOpen && (
                      <motion.div
                        variants={disclosure}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="overflow-hidden"
                      >
                        <div className="flex flex-col gap-1.5 pt-1.5">{blocks}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {final ? (
                <div className="flex flex-col border-t border-border-seam pt-2">
                  <button
                    type="button"
                    className="group -mx-1.5 flex min-h-7 max-w-full items-center gap-1.5 rounded-lg px-1.5 text-left text-ui-sm text-foreground-subtle outline-none transition-colors duration-[var(--duration-instant)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setAnswerOpen((value) => !value)}
                    aria-expanded={answerOpen}
                  >
                    <span className="min-w-0 truncate">Final answer</span>
                    <ChevronRight
                      size={13}
                      strokeWidth={1.75}
                      className={cn(
                        'shrink-0 text-foreground-subtlest transition-[transform,color] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] group-hover:text-foreground',
                        answerOpen && 'rotate-90'
                      )}
                      aria-hidden
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {answerOpen && (
                      <motion.div
                        variants={disclosure}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="overflow-hidden"
                      >
                        <div className="chat-markdown pt-2 text-ui-sm">
                          <Markdown text={final} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : !running ? (
                <p className="m-0 text-ui-sm italic text-foreground-subtlest">No final answer.</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
