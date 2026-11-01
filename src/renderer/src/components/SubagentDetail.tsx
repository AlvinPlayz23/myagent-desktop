import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Alert02, ChevronLeft, ChevronRight, Loading03 } from './ui/icons'
import { Button } from './ui/button'
import Markdown from './LazyMarkdown'
import DiffView from './DiffView'
import { disclosure } from '../motion'
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
 * calls folded behind the "Worked for …" divider, then the final answer.
 *
 * This is the drill-in target of the subagents side panel, not a dialog — it
 * fills the panel column it is dropped into. The task is resolved by key on
 * every render (see App), so a detail left open on a running child fills in the
 * moment its report lands instead of freezing on the launch snapshot.
 */
export default function SubagentDetail({ task, launchError, onBack, onShowInConversation }: Props): JSX.Element {
  const [trajectoryOpen, setTrajectoryOpen] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const running = task.state === 'running' && !task.launchFailed
  // Ticks only while the child is in flight; settled reports have fixed times.
  const now = useNow(running)
  const status = SUBAGENT_STATUS[task.state]
  const model = subagentModelLabel(task)
  const stats = subagentStats(task)
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
  const summary = `Worked for ${duration(elapsedMs)} and made ${toolCallCount} tool ${toolCallCount === 1 ? 'call' : 'calls'}`
  const final = task.finalResult ?? ''
  // Long delegation prompts are the common case; clamping keeps the trajectory
  // and the answer on screen instead of pushing them below a wall of text.
  const promptLong = task.prompt.length > 320

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border-seam pl-1 pr-2">
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
          {subagentPromptPreview(task.prompt, 80) || 'Subagent'}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-ui-sm">
          <span className={cn('size-1.5 shrink-0 rounded-full', status.dot)} aria-hidden />
          <span className={status.className}>{status.label}</span>
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-border-seam px-3 py-1 text-ui-xs text-foreground-subtlest">
        {model && <span className="min-w-0 truncate font-mono">{model}</span>}
        <span className="shrink-0 font-mono tabular-nums">
          {running ? `${duration(elapsedMs)}…` : subagentDurationLabel(task)}
        </span>
        {stats && <span className="min-w-0 truncate">{stats}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
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
          <div className="flex flex-col gap-3">
            {task.error && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-2.5 text-ui-sm text-destructive-foreground">
                <Alert02 size={14} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden />
                <span className="min-w-0 whitespace-pre-wrap break-words">{task.error}</span>
              </div>
            )}

            {task.prompt && (
              <div className="rounded-lg border border-border-seam bg-subtle px-3 py-2">
                  <p
                    className={cn(
                      'm-0 whitespace-pre-wrap break-words text-ui-sm leading-relaxed text-foreground-subtle',
                      !promptOpen && 'line-clamp-1'
                    )}
                  >
                    {task.prompt}
                  </p>
                  {promptLong && (
                    <button
                      type="button"
                      onClick={() => setPromptOpen((value) => !value)}
                      className="mt-1.5 text-ui-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {promptOpen ? 'Show less' : 'Show full prompt'}
                    </button>
                  )}
              </div>
            )}

            {running && blocks.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2.5 text-ui-sm text-muted-foreground">
                  <Loading03 size={14} strokeWidth={1.8} className="shrink-0 animate-spin" aria-hidden />
                  Still working — the trajectory lands here when the report arrives.
                </div>
              ) : blocks.length === 0 ? (
                <p className="m-0 text-ui-sm italic text-foreground-subtlest">
                  No tool calls were recorded.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className="group -mx-1.5 flex min-h-7 max-w-full items-center gap-1.5 rounded-lg px-1.5 text-left text-ui-sm text-foreground-subtle outline-none transition-colors duration-[var(--duration-instant)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
                        <div className="flex flex-col gap-1.5 pt-1.5">{blocks}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}

            {final ? (
              <div className="chat-markdown border-t border-border-seam pt-3 text-ui-sm">
                <Markdown text={final} />
              </div>
            ) : !running ? (
              <p className="m-0 border-t border-border-seam pt-3 text-ui-sm italic text-foreground-subtlest">
                No final answer recorded.
              </p>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-border-seam px-2 py-1.5">
        <Button variant="ghost" size="sm" onClick={() => onShowInConversation(task)}>
          Show in conversation
        </Button>
      </div>
    </div>
  )
}
