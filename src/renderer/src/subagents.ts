// Presentation model for background subagent tasks.
//
// A subagent's whole life spans three unrelated signals that never share a
// message: the tool call announces it, the acknowledgement names its task id,
// and the completion report (a separate system-generated message) closes it out.
// Deriving the list from `ChatState` on demand means the tool card, the
// transcript notice and the side panel all read one answer, and a session
// resumed from disk reconstructs identically to the live stream — the details
// blobs are persisted on both the tool result and the completion message.

import type { ChatItem, ChatState, ToolRun } from './state'
import type { SubagentAckDetails, SubagentReport, SubagentStatus, Usage } from '../../shared/protocol'
import { duration } from './util'

export const SUBAGENT_TOOL = 'subagent'

export function isSubagent(name: string | undefined): boolean {
  return name === SUBAGENT_TOOL
}

export type SubagentState = 'running' | SubagentStatus

export interface SubagentTask {
  /**
   * Stable identity for DOM keys and cross-view linking. Prefers the backend's
   * task id, falling back to the tool call id for the brief window before the
   * acknowledgement lands.
   */
  key: string
  toolCallId: string
  taskId?: string
  prompt: string
  /** Model the child actually ran on, else the requested override. */
  model?: string
  provider?: string
  effort?: string
  state: SubagentState
  /** Tool call observed — when the parent asked for the work. */
  startedAt: number
  /** Acknowledged — when the child was actually admitted and began. */
  launchedAt?: number
  endedAt?: number
  durationMs?: number
  turns?: number
  toolCalls?: number
  usage?: Usage
  finalResult?: string
  error?: string
  trajectory?: SubagentReport['trajectory']
  /**
   * The tool call itself failed (bad arguments, no active model, task limit), so
   * no child ever ran. Distinct from a child that ran and then failed: there is
   * a report to show in the latter case and nothing but the error in this one.
   */
  launchFailed: boolean
}

interface SubagentStatusMeta {
  label: string
  /** Tailwind text token for the status pill / dot. */
  className: string
}

export const SUBAGENT_STATUS: Record<SubagentState, SubagentStatusMeta> = {
  running: { label: 'Running', className: 'text-info-foreground' },
  completed: { label: 'Completed', className: 'text-success-foreground' },
  failed: { label: 'Failed', className: 'text-destructive-foreground' },
  timed_out: { label: 'Timed out', className: 'text-warning-foreground' },
  cancelled: { label: 'Cancelled', className: 'text-foreground-subtlest' }
}

function ackOf(run: ToolRun): SubagentAckDetails | null {
  const details = run.result?.details
  if (!details || typeof details !== 'object') return null
  const ack = details as Partial<SubagentAckDetails>
  return typeof ack.taskId === 'string' ? (ack as SubagentAckDetails) : null
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Every subagent task in this chat, oldest first. Pure, so it can be memoized
 * on `items` + `toolRuns` and cost nothing until one of those changes.
 */
export function selectSubagentTasks(chat: ChatState): SubagentTask[] {
  const tasks = new Map<string, SubagentTask>()
  // Reports arrive keyed by task id, but a launch can be recorded before its
  // acknowledgement names one. `byToolCall` bridges that gap.
  const byToolCall = new Map<string, SubagentTask>()

  for (const item of chat.items) {
    if (item.kind === 'tool') {
      const run = chat.toolRuns[item.toolCallId]
      if (!run || !isSubagent(run.name)) continue
      // One tool call produces one task; re-seeding on every render of the same
      // item would reset the timer, so only an unknown call creates an entry.
      if (byToolCall.has(run.id)) continue
      const ack = ackOf(run)
      const task: SubagentTask = {
        key: ack?.taskId ?? run.id,
        toolCallId: run.id,
        taskId: ack?.taskId,
        prompt: str(run.args, 'prompt'),
        model: ack?.model || str(run.args, 'model'),
        effort: ack?.effort || str(run.args, 'effort'),
        state: 'running',
        startedAt: run.createdAt,
        // The ack is what the tool result carries, so a settled-but-unreported
        // task is genuinely in flight — the timer starts when the tool ended,
        // not when it was called.
        launchedAt: ack ? run.updatedAt : undefined,
        // A failed call never produced a report, so it can never settle.
        launchFailed: run.status === 'error'
      }
      tasks.set(task.key, task)
      byToolCall.set(run.id, task)
      continue
    }

    if (item.kind === 'subagent') {
      const report = item.report
      const task =
        tasks.get(report.taskId) ??
        (report.parentToolCallId ? byToolCall.get(report.parentToolCallId) : undefined)
      if (!task) continue
      // Key on the report's id from here on so a later re-render addresses the
      // same entry the panel and the notice are keyed by.
      if (task.key !== report.taskId) {
        tasks.delete(task.key)
        task.key = report.taskId
      }
      tasks.set(task.key, task)
      byToolCall.set(task.toolCallId, task)
      task.taskId = report.taskId
      task.state = report.status
      task.model = report.model || task.model
      task.provider = report.provider
      task.effort = report.effort || task.effort
      task.prompt = report.prompt || task.prompt
      task.startedAt = report.startedAt || task.startedAt
      task.launchedAt = task.launchedAt ?? report.startedAt
      task.endedAt = report.endedAt
      task.durationMs = report.endedAt - report.startedAt
      task.turns = report.turns
      task.toolCalls = report.toolCalls
      task.usage = report.usage
      task.finalResult = report.finalResult
      task.error = report.error
      task.trajectory = report.trajectory
    }
  }

  return [...tasks.values()]
}

/**
 * Both projections of the same derivation, memoized on the identity of the two
 * collections it reads. Streaming rewrites neither, so every consumer that asks
 * during one render pass gets the *same* task objects — which is what lets the
 * tool card's and notice's memo comparators compare them by reference, and what
 * keeps this off the streaming hot path.
 *
 * A one-entry cache is deliberate: transcript renders alternate between the
 * active and the outgoing chat, and holding more than the latest pair would let
 * a stale task object outlive the run that produced it.
 */
function derive(chat: ChatState): Derived {
  if (cached && cached.items === chat.items && cached.toolRuns === chat.toolRuns) return cached
  const tasks = selectSubagentTasks(chat)
  const index = new Map<string, SubagentTask>()
  for (const task of tasks) {
    index.set(task.key, task)
    // A task is re-keyed onto its backend id when its report lands, so the tool
    // call id is kept as an alias: the transcript's tool card is addressed by
    // that id, and without the alias it would silently fall back to the generic
    // tool row at the exact moment the card gains something to show.
    index.set(task.toolCallId, task)
  }
  cached = { items: chat.items, toolRuns: chat.toolRuns, tasks, index }
  return cached
}

interface Derived {
  items: ChatItem[]
  toolRuns: Record<string, ToolRun>
  tasks: SubagentTask[]
  index: ReadonlyMap<string, SubagentTask>
}

let cached: Derived | null = null

/** Every task, oldest first. Stable identity across unrelated re-renders. */
export function subagentTaskList(chat: ChatState): SubagentTask[] {
  return derive(chat).tasks
}

/** The same tasks keyed for lookup. */
export function subagentTaskIndex(chat: ChatState): ReadonlyMap<string, SubagentTask> {
  return derive(chat).index
}

/** Elapsed time of a task at `now`, for the live timer on a running child. */
export function subagentElapsed(task: SubagentTask, now: number): number {
  if (task.state !== 'running') return task.durationMs ?? 0
  const from = task.launchedAt ?? task.startedAt
  return Math.max(0, now - from)
}

export function subagentElapsedLabel(task: SubagentTask, now: number): string {
  return duration(subagentElapsed(task, now))
}

/** Fixed elapsed label for a settled task, whose duration its report fixes. */
export function subagentDurationLabel(task: SubagentTask): string {
  return duration(task.durationMs ?? 0)
}

const TOKEN_FACTORS: [number, string][] = [
  [1e9, 'b'],
  [1e6, 'm'],
  [1e3, 'k']
]

/** Compact token count: "12.3k", "1.2m". */
export function compactTokens(n: number): string {
  for (const [factor, suffix] of TOKEN_FACTORS) {
    if (n >= factor) {
      const scaled = n / factor
      return `${scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10}${suffix}`
    }
  }
  return String(n)
}

/** USD cost for a task, or '' when the provider reported none. */
export function subagentCost(task: SubagentTask): string {
  const total = task.usage?.cost?.total ?? 0
  if (!total) return ''
  return total < 0.01 ? `$${total.toFixed(4)}` : `$${total.toFixed(2)}`
}

/** Tool calls, tokens and cost as one metadata line, omitting empty parts. */
export function subagentStats(task: SubagentTask): string {
  const parts: string[] = []
  if (task.turns != null) parts.push(`${task.turns} ${task.turns === 1 ? 'turn' : 'turns'}`)
  if (task.toolCalls != null) parts.push(`${task.toolCalls} tool ${task.toolCalls === 1 ? 'call' : 'calls'}`)
  const tokens = task.usage?.totalTokens ?? 0
  if (tokens) parts.push(`${compactTokens(tokens)} tokens`)
  const cost = subagentCost(task)
  if (cost) parts.push(cost)
  return parts.join(' · ')
}

/** One-line prompt preview for a collapsed row. */
export function subagentPromptPreview(prompt: string, max = 120): string {
  const flat = prompt.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * Brings the transcript row for a task into view. Rows carry
 * `data-subagent-task` with the task key (see SubagentToolCard/SubagentNotice),
 * so the side panel and the detail modal can both jump to the conversation.
 */
export function revealSubagentInTranscript(key: string): void {
  const el = document.querySelector(`[data-subagent-task="${CSS.escape(key)}"]`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/** Model id without its provider prefix, for tight chips. */
export function subagentModelLabel(task: SubagentTask, max = 28): string {
  const model = task.model?.trim()
  if (!model) return ''
  const bare = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model
  return bare.length > max ? `${bare.slice(0, max - 1)}…` : bare
}