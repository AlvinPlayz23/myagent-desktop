// Wire types mirroring internal/types/types.go and the server's JSON-RPC
// surface (internal/server/ws). Field names match the Go JSON tags exactly.

export type Role = 'user' | 'assistant' | 'toolResult'

// Canonical reasoning-effort levels (mirrors llm.Effort in the Go backend).
export type ReasoningEffort = '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ContentBlock {
  type: 'text' | 'thinking' | 'image' | 'toolCall'
  text?: string
  thinking?: string
  thinkingSignature?: string
  redacted?: boolean
  data?: string
  mimeType?: string
  id?: string
  name?: string
  arguments?: Record<string, unknown>
}

export interface Cost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
}

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning?: number
  totalTokens: number
  cost: Cost
}

export interface Message {
  role: Role
  content: ContentBlock[]
  api?: string
  provider?: string
  model?: string
  usage?: Usage
  stopReason?: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'
  errorMessage?: string
  toolCallId?: string
  toolName?: string
  isError?: boolean
  details?: unknown
  /**
   * Marks system-generated messages that carry `Role` 'user' for provider
   * compatibility but are not human input. Today the only producer is
   * `SubagentCompletionSource` (a finished background subagent). Ordinary
   * messages omit the field entirely, including sessions persisted before it
   * existed.
   */
  source?: string
  timestamp: number
}

/** `Message.source` value for an injected subagent completion. */
export const SubagentCompletionSource = 'subagent_completion'

/**
 * Details attached to the immediate launch acknowledgement of a subagent tool
 * call. Mirrors internal/subagent.AckDetails: the background task has started,
 * but the child has not finished.
 */
export interface SubagentAckDetails {
  taskId: string
  model: string
  effort?: string
  status: string
}

// ---------------------------------------------------------------------------
// Subagents
// ---------------------------------------------------------------------------

export type SubagentStatus = 'completed' | 'failed' | 'timed_out' | 'cancelled'

/** One tool call the child agent made, as recorded in its public trajectory. */
export interface SubagentToolCall {
  id: string
  name: string
}

/**
 * One message from the child's public trajectory. Thinking blocks, signatures
 * and arbitrary tool details are deliberately absent — this is the same
 * allowlisted view the model receives.
 */
export interface SubagentTrajectoryMessage {
  role: string
  text?: string
  toolCalls?: SubagentToolCall[]
  toolCallId?: string
  toolName?: string
  isError?: boolean
  note?: string
}

/**
 * The complete record of one background subagent run, carried as the details
 * of its system-generated completion message. Mirrors
 * internal/subagent.TaskReport.
 */
export interface SubagentReport {
  version: number
  taskId: string
  parentToolCallId: string
  prompt: string
  systemPrompt?: string
  cwd?: string
  provider?: string
  model: string
  effort?: string
  timeoutMs?: number
  startedAt: number
  endedAt: number
  status: SubagentStatus
  error?: string
  turns: number
  toolCalls: number
  usage?: Usage
  trajectory?: SubagentTrajectoryMessage[]
  finalResult: string
}

export interface ToolResult {
  content: ContentBlock[]
  details?: unknown
  terminate?: boolean
}

export interface AssistantMessageEvent {
  type:
    | 'start'
    | 'text_start'
    | 'text_delta'
    | 'text_end'
    | 'thinking_start'
    | 'thinking_delta'
    | 'thinking_end'
    | 'toolcall_start'
    | 'toolcall_delta'
    | 'toolcall_end'
    | 'done'
    | 'error'
  contentIndex?: number
  delta?: string
  partial?: Message
  message?: Message
  error?: Message
}

export interface CompactionInfo {
  summary: string
  firstKeptIndex: number
  tokensBefore: number
  tokensAfter: number
  readFiles?: string[]
  modifiedFiles?: string[]
}

export type AgentEventType =
  | 'agent_start'
  | 'agent_end'
  | 'turn_start'
  | 'turn_end'
  | 'message_start'
  | 'message_update'
  | 'message_end'
  | 'tool_execution_start'
  | 'tool_execution_update'
  | 'tool_execution_end'
  | 'compaction_start'
  | 'compaction_end'
  | 'retry'

export interface AgentEvent {
  type: AgentEventType
  message?: Message
  assistantMessageEvent?: AssistantMessageEvent
  toolResults?: Message[]
  messages?: Message[]
  toolCallId?: string
  toolName?: string
  args?: Record<string, unknown>
  result?: ToolResult
  partialResult?: ToolResult
  isError?: boolean
  compaction?: CompactionInfo
  attempt?: number
  maxAttempts?: number
}

export interface SessionMeta {
  id: string
  path: string
  cwd: string
  created: string
  modified: string
  messageCount: number
  preview: string
  title: string
}

export interface SessionInfo {
  sessionId: string
  model: string
  cwd: string
  effort?: ReasoningEffort
  messages?: Message[]
}

/**
 * One tool the model may be given, as reported by `session.tools`.
 * `description` is the model's own tool description passed through verbatim
 * from the Go side (tools.Tool.Description), so a client never hardcodes what a
 * tool does — which also makes plugin-provided tools self-describing.
 */
export interface SessionTool {
  name: string
  description: string
}

/** Result of `session.tools`: the toggleable set plus the session's state. */
export interface SessionTools {
  /** Toggleable tools in registry order. Excludes tools the active profile disallows. */
  tools: SessionTool[]
  /** The session's current deny list; a tool listed here still appears in `tools` so it can be re-enabled. */
  disabled: string[]
  /** True while an agent run is in flight. A save is rejected server-side (ErrBusy) while this holds. */
  running: boolean
}

export interface RpcError {
  code: number
  message: string
  data?: unknown
}

// Pushed from main to renderer.
export type ServerPush =
  | { kind: 'hello'; name: string; version: string; protocol: number }
  | { kind: 'event'; sessionId: string; event: AgentEvent }
  | { kind: 'done'; sessionId: string; error?: string }
  | { kind: 'status'; state: 'starting' | 'connected' | 'reconnecting' | 'disconnected'; detail?: string }

export interface ProviderEntry {
  name: string
  models: string[]
  source: 'config' | 'auth'
  baseUrl?: string
  hasApiKey?: boolean
  reasoningDialect?: 'openai' | 'openrouter' | 'deepseek'
  origin?: 'builtin' | 'custom' | 'builtin_override'
  modelDetails?: ProviderModelDetails[]
}

export interface ProviderModelDetails {
  id: string
  reasoningKnown: boolean
  reasoning: boolean
  supportedEfforts?: ReasoningEffort[]
}

export interface ProvidersInfo {
  providers: ProviderEntry[]
  defaultModel: string
  available?: ProviderOption[]
}

export interface ProviderOption {
  name: string
  label: string
  baseUrl?: string
}

export interface ProviderInput {
  name: string
  baseUrl: string
  model: string
  apiKey: string
  builtin: boolean
  reasoningDialect?: 'openai' | 'openrouter' | 'deepseek'
}

export type RpcResult<T = unknown> = { ok: true; result: T } | { ok: false; error: RpcError }

/**
 * How the window blends with the desktop behind it, resolved once at startup
 * from the host platform. `acrylic`/`mica` are Windows 11 compositor materials,
 * `vibrancy` is the macOS equivalent, `transparent` is a plain see-through
 * window (Windows 10 and Linux, where no blur API exists), and `none` means the
 * window is opaque and the shell paints a solid fill instead.
 */
export type BackdropMode = 'acrylic' | 'mica' | 'vibrancy' | 'transparent' | 'none'

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted'

export interface GitFileChange {
  path: string
  /** Pre-rename path, present only for renames. */
  origPath?: string
  status: GitFileStatus
  /** True when the index copy differs from HEAD. */
  staged: boolean
  /**
   * True when the file is staged *and* has further unstaged edits on top
   * (porcelain XY of `MM` and friends). Such a path appears once, under
   * Staged, so the UI needs this to avoid claiming it is fully staged.
   */
  partial?: boolean
  insertions: number
  deletions: number
}

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  files: GitFileChange[]
  insertions: number
  deletions: number
}

export interface GitBranch {
  name: string
  upstream: string | null
  current: boolean
  modified: string
}

export interface GitCommit {
  hash: string
  shortHash: string
  author: string
  date: string
  subject: string
}

export interface GitApi {
  status(cwd: string): Promise<RpcResult<GitStatus>>
  diff(cwd: string, path?: string, staged?: boolean): Promise<RpcResult<string>>
  branches(cwd: string): Promise<RpcResult<GitBranch[]>>
  log(cwd: string, limit?: number): Promise<RpcResult<GitCommit[]>>
  stage(cwd: string, paths: string[]): Promise<RpcResult<void>>
  unstage(cwd: string, paths: string[]): Promise<RpcResult<void>>
  discard(cwd: string, paths: string[]): Promise<RpcResult<void>>
  commit(cwd: string, message: string, amend?: boolean): Promise<RpcResult<string>>
  push(cwd: string): Promise<RpcResult<string>>
  pull(cwd: string): Promise<RpcResult<string>>
  fetch(cwd: string): Promise<RpcResult<string>>
  checkout(cwd: string, branch: string): Promise<RpcResult<void>>
  createBranch(cwd: string, name: string): Promise<RpcResult<void>>
  init(cwd: string): Promise<RpcResult<void>>
}

// API exposed on window.myagent by the preload script.
export interface MyagentApi {
  connect(): Promise<RpcResult<{ name: string; version: string }>>
  rpc<T = unknown>(method: string, params?: unknown): Promise<RpcResult<T>>
  pickFolder(): Promise<string | null>
  setTheme(theme: 'light' | 'dark'): Promise<void>
  setTransparency(enabled: boolean, value: number): Promise<void>
  backdrop(): Promise<BackdropMode>
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<boolean>
  closeWindow(): Promise<void>
  windowMaximized(): Promise<boolean>
  openWith(target: 'explorer' | 'vscode', dir: string): Promise<boolean>
  onWindowMaximized(cb: (maximized: boolean) => void): () => void
  onPush(cb: (push: ServerPush) => void): () => void
  git: GitApi
}
