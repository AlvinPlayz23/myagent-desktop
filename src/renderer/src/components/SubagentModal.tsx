import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Alert02, ChevronRight, Loading03, Robot01 } from './ui/icons'
import { Button } from './ui/button'
import Markdown from './Markdown'
import DiffView from './DiffView'
import { BLOOM, bloomIn, disclosure } from '../motion'
import { cn, duration } from '../util'
import { buildToolDiff } from '../diff'
import { toolIcon, TOOL_LABELS, toolSummary } from '../toolMeta'
import { useNow } from '../hooks/use-now'
import {
  SUBAGENT_STATUS,
  subagentDurationLabel,
  subagentElapsed,
  subagentModelLabel,
  subagentPromptPreview,
  subagentStats,
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
    <div className="tool-row my-0 flex flex-col text-ui-base">
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
            <span className="min-w-0 max-w-[26rem] truncate rounded-md bg-muted px-2 py-0.5 font-mono text-ui-sm text-foreground-subtle">
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

/** A toolResult the pairing pass could not match to a call. Never expected
 *  (results always follow their call), but a trajectory must not drop content. */
function OrphanResultRow({ result }: { result: SubagentTrajectoryMessage }): JSX.Element {
  return (
    <div className="flex gap-2 py-1">
      <span
        className={cn(
          'w-14 shrink-0 pt-px font-mono text-ui-2xs uppercase tracking-wide',
          result.isError ? 'text-destructive-foreground' : 'text-foreground-subtlest'
        )}
      >
        {result.toolName || 'tool'}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-ui-sm leading-relaxed text-muted-foreground">
        {result.text || result.note || '—'}
      </span>
    </div>
  )
}

function CompactionRow({ note }: { note: string }): JSX.Element {
  return (
    <div className="flex gap-2 py-1">
      <span className="w-14 shrink-0 pt-px font-mono text-ui-2xs uppercase tracking-wide text-foreground-subtlest">
        system
      </span>
      <span className="min-w-0 flex-1 text-ui-sm italic leading-relaxed text-foreground-subtle">{note}</span>
    </div>
  )
}

interface Props {
  task: SubagentTask
  /** The launch acknowledgement text for a task that never started. Only the
   *  transcript card holds the tool run, so only it can supply this. */
  launchError?: string
  onClose(): void
  /** Closes the modal and scrolls the transcript to this task's row. */
  onShowInConversation(task: SubagentTask): void
}

/**
 * The full view of one background subagent: prompt, trajectory rendered like
 * the main timeline (assistant prose as markdown, tool calls in ToolCard
 * anatomy, folded behind the same "Worked for …" divider), then the final
 * answer. Opened by clicking any subagent row — the transcript card, the
 * completion notice, or a side-panel row.
 *
 * The task is resolved by key on every render (see App), so a modal left open
 * on a running child fills in the moment its report lands instead of freezing
 * on the launch snapshot.
 */
export default function SubagentModal({ task, launchError, onClose, onShowInConversation }: Props): JSX.Element {
  const [trajectoryOpen, setTrajectoryOpen] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const running = task.state === 'running' && !task.launchFailed
  // Ticks only while the child is in flight; settled reports have fixed times.
  const now = useNow(running)
  const status = SUBAGENT_STATUS[task.state]
  const model = subagentModelLabel(task)
  const stats = subagentStats(task)
  const trajectory = task.trajectory ?? []

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Steal focus from the composer for the same reason ToolsModal does: an
  // open modal must own ArrowUp/Down/Space/Enter, not the textarea behind it.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Pair each result with its call so the row expands onto the outcome, exactly
  // like a live tool card. The wire order is preserved; user-role entries are
  // skipped because the Prompt section already shows the delegation prompt.
  const { blocks, toolCallCount } = useMemo(() => {
    const resultsByCallId = new Map<string, SubagentTrajectoryMessage>()
    const callIds = new Set<string>()
    for (const entry of trajectory) {
      for (const call of entry.toolCalls ?? []) callIds.add(call.id)
      if (entry.role === 'toolResult' && entry.toolCallId) {
        resultsByCallId.set(entry.toolCallId, entry)
      }
    }
    const out: JSX.Element[] = []
    let calls = 0
    trajectory.forEach((entry, i) => {
      if (entry.role === 'user') return
      if (entry.role === 'compaction') {
        if (entry.note) out.push(<CompactionRow key={`c-${i}`} note={entry.note} />)
        return
      }
      if (entry.role === 'toolResult') {
        // Paired results render inside their call's row; only a result whose
        // call id never appears (truncated report) gets its own row.
        if (!entry.toolCallId || !callIds.has(entry.toolCallId)) {
          out.push(<OrphanResultRow key={`r-${i}`} result={entry} />)
        }
        return
      }
      if (entry.text) {
        out.push(
          <div key={`t-${i}`} className="chat-markdown text-ui-base">
            <Markdown text={entry.text} />
          </div>
        )
      }
      for (const call of entry.toolCalls ?? []) {
        calls++
        out.push(<TrajectoryToolRow key={call.id} call={call} result={resultsByCallId.get(call.id)} />)
      }
    })
    return { blocks: out, toolCallCount: calls }
  }, [trajectory])

  const elapsedMs = running ? subagentElapsed(task, now) : (task.durationMs ?? 0)
  const summary = `Worked for ${duration(elapsedMs)} and made ${toolCallCount} tool ${toolCallCount === 1 ? 'call' : 'calls'}`
  const final = task.finalResult ?? ''

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-overlay p-5 backdrop-blur-[2px]"
      onMouseDown={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subagent-modal-title"
        tabIndex={-1}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-popover-border bg-popover text-popover-foreground shadow-lg focus:outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        variants={bloomIn}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={BLOOM}
      >
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <Robot01 size={16} strokeWidth={1.8} className="shrink-0 text-muted-foreground" aria-hidden />
            <h2 id="subagent-modal-title" className="m-0 min-w-0 flex-1 truncate text-ui-lg font-semibold text-foreground">
              {subagentPromptPreview(task.prompt, 80) || 'Subagent'}
            </h2>
            <span className={cn('shrink-0 text-ui-sm', status.className)}>{status.label}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-ui-sm text-muted-foreground">
            {model && <span className="truncate font-mono text-ui-xs text-foreground-subtle">{model}</span>}
            {task.taskId && (
              <span className="shrink-0 font-mono text-ui-xs text-foreground-subtlest">{task.taskId}</span>
            )}
            <span className="shrink-0 font-mono text-ui-xs tabular-nums text-foreground-subtlest">
              {running ? `${duration(elapsedMs)}…` : subagentDurationLabel(task)}
            </span>
            {stats && <span className="min-w-0">{stats}</span>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {task.launchFailed ? (
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-ui-sm font-medium text-destructive-foreground">
                <Alert02 size={14} strokeWidth={1.8} aria-hidden />
                Failed to launch subagent
              </div>
              {(launchError || task.error) && (
                <pre className="m-0 mt-1.5 whitespace-pre-wrap break-words font-mono text-ui-sm leading-relaxed text-destructive-foreground">
                  {launchError || task.error}
                </pre>
              )}
            </div>
          ) : (
            <>
              {task.error && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-ui-sm text-destructive-foreground">
                  <Alert02 size={14} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden />
                  <span className="min-w-0 whitespace-pre-wrap break-words">{task.error}</span>
                </div>
              )}

              {task.prompt && (
                <div className="mb-4">
                  <div className="mb-1 text-ui-2xs uppercase tracking-wide text-foreground-subtlest">Prompt</div>
                  <pre className="m-0 max-h-[240px] overflow-auto whitespace-pre-wrap break-words font-mono text-ui-sm leading-relaxed text-muted-foreground">
                    {task.prompt}
                  </pre>
                </div>
              )}

              {running && blocks.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-subtle px-3.5 py-3 text-ui-sm text-muted-foreground">
                  <Loading03 size={14} strokeWidth={1.8} className="shrink-0 animate-spin" aria-hidden />
                  Still working — the trajectory and final answer land here when the report arrives.
                </div>
              ) : blocks.length > 0 ? (
                <div className="mb-4">
                  {toolCallCount === 0 ? (
                    <div className="flex flex-col gap-2.5">{blocks}</div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="group -mx-1.5 flex min-h-7 max-w-full items-center gap-1.5 rounded-lg px-1.5 text-left text-ui-base text-foreground-subtle outline-none transition-colors duration-[var(--duration-instant)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => setTrajectoryOpen((value) => !value)}
                        aria-expanded={trajectoryOpen}
                      >
                        <span className="min-w-0 truncate tabular-nums">{summary}</span>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          size={14}
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
                            <div className="flex flex-col gap-2.5 pt-1.5">{blocks}</div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </div>
              ) : null}

              <div className="mb-1 text-ui-2xs uppercase tracking-wide text-foreground-subtlest">
                Final answer
              </div>
              {final ? (
                <div className="chat-markdown text-ui-base">
                  <Markdown text={final} />
                </div>
              ) : (
                <p className="m-0 text-ui-sm italic text-foreground-subtlest">
                  {running ? 'No answer yet — the child is still working.' : 'No final answer recorded.'}
                </p>
              )}
              {(task.effort || task.provider) && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-ui-xs text-foreground-subtlest">
                  {task.effort && <span>effort {task.effort}</span>}
                  {task.provider && <span>{task.provider}</span>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onShowInConversation(task)}
          >
            Show in conversation
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </motion.section>
    </motion.div>
  )
}
