import type {
  AgentEvent,
  CompactionInfo,
  ContentBlock,
  Message,
  ProvidersInfo,
  SessionMeta,
  ToolResult
} from '../../shared/protocol'
import type { ReasoningEffort } from '../../shared/protocol'

// Tool execution is a first-class timeline activity. It is deliberately
// separate from assistant messages so the presentation can be expanded,
// compact, or hidden without changing conversation history.
export interface ToolRun {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  createdAt: number
  updatedAt: number
  result?: ToolResult
  partial?: ToolResult
}

export interface TurnSummary {
  id: string
  startedAt: number
  endedAt?: number
}

export type ChatItem =
  | { kind: 'msg'; msg: Message; localId?: string }
  | { kind: 'tool'; toolCallId: string }
  | { kind: 'thinking'; id: string; text: string; redacted: boolean; durationMs?: number }
  | { kind: 'compaction'; info: CompactionInfo }
  | { kind: 'turn'; summary: TurnSummary }

// How long one reasoning block streamed for. The protocol carries no reasoning
// duration (Usage.reasoning is a token count), so it is measured off the stream.
// `length` is what distinguishes "still reasoning" from "block finished and the
// message moved on": endedAt only advances while the text is actually growing.
export interface ThinkingSpan {
  startedAt: number
  endedAt: number
  length: number
}

export interface ChatState {
  sessionId: string
  cwd: string
  model: string
  effort: ReasoningEffort
  items: ChatItem[]
  streaming: Message | null
  toolRuns: Record<string, ToolRun>
  running: boolean
  // A prompt was dispatched but `agent_start` has not arrived yet, so `running`
  // still reads false. Closing the tab in that window must not drop the chat,
  // or every later stream event and the final `done` hit missing-chat guards.
  awaitingStart: boolean
  notice: string | null
  cost: number
  lastTokens: number
  // Optimistic user bubbles awaiting their matching server message_end event.
  // IDs let a rejected RPC roll back exactly its own bubble, including
  // image-only prompts whose text is empty.
  pendingUsers: { id: string }[]
  // Reasoning spans for the message currently streaming, keyed by content-block
  // index; consumed and cleared when that message finalizes. streamStartedAt
  // anchors the first block so provider latency before the first reasoning
  // token is counted rather than silently dropped.
  streamStartedAt: number | null
  thinkingSpans: Record<number, ThinkingSpan>
}

export type ConnState = 'starting' | 'connected' | 'reconnecting' | 'disconnected'

export interface AppState {
  conn: ConnState
  connDetail?: string
  serverVersion?: string
  sessions: SessionMeta[]
  providers: ProvidersInfo
  // Every session this connection is tracking live, keyed by session id.
  // Background sessions keep receiving events and can run concurrently;
  // activeId picks the one shown in the main pane.
  chats: Record<string, ChatState>
  activeId: string | null
  // Ordered list of open tab session IDs (subset of chats keys).
  tabOrder: string[]
  loading: boolean
  fatal: string | null
  // Project cwd preselected in the home screen's dropdown.
  homeCwd: string | null
  // Projects added explicitly (folder picker) — kept even with zero sessions,
  // persisted so they survive restarts. Session cwds are merged in at render.
  projects: string[]
}

export function activeChat(state: AppState): ChatState | null {
  return state.activeId ? state.chats[state.activeId] ?? null : null
}

const PROJECTS_KEY = 'myagent.projects'

function loadProjects(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function persistProjects(projects: string[]): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  } catch {
    // storage unavailable; projects just won't survive restarts
  }
}

export const initialState: AppState = {
  conn: 'starting',
  sessions: [],
  providers: { providers: [], defaultModel: '' },
  chats: {},
  activeId: null,
  tabOrder: [],
  loading: false,
  fatal: null,
  homeCwd: null,
  projects: loadProjects()
}

export function messageText(msg: Message): string {
  return msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
}

export function contentText(content: ContentBlock[]): string {
  return content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
}

export function contentMatches(left: ContentBlock[], right: ContentBlock[]): boolean {
  return left.length === right.length && left.every((block, index) => {
    const other = right[index]
    return block.type === other.type && block.text === other.text && block.data === other.data && block.mimeType === other.mimeType
  })
}

// Preserve the provider's block order inside an assistant turn. A response can
// contain commentary before and between tool calls, so it must not be reduced
// to "all work, then all text".
function assistantTimelineItems(
  msg: Message,
  spans: Record<number, ThinkingSpan> = {}
): ChatItem[] {
  const out: ChatItem[] = []
  let body: Message['content'] = []

  const flushBody = (): void => {
    const hasBody = body.some(
      (block) => (block.type === 'text' && !!block.text?.trim()) || (block.type === 'image' && !!block.data)
    )
    if (hasBody) out.push({ kind: 'msg', msg: { ...msg, content: body } })
    body = []
  }

  msg.content.forEach((block, i) => {
    if (block.type === 'thinking' && (block.thinking || block.redacted)) {
      flushBody()
      const span = spans[i]
      out.push({
        kind: 'thinking',
        id: `${msg.timestamp}-${i}`,
        text: block.thinking ?? '',
        redacted: !!block.redacted,
        // Absent for history loaded from disk — it was never streamed here.
        durationMs: span ? span.endedAt - span.startedAt : undefined
      })
    } else if (block.type === 'toolCall' && block.id) {
      flushBody()
      out.push({ kind: 'tool', toolCallId: block.id })
    } else {
      body.push(block)
    }
  })
  flushBody()

  if (out.length === 0 && msg.stopReason === 'error' && msg.errorMessage) {
    out.push({ kind: 'msg', msg })
  }
  return out
}

// Reconcile a completed assistant message with tool placeholders created by
// tool_execution_start. The placeholders are removed and rebuilt in the exact
// assistant content order, preventing a live placeholder from permanently
// appearing before commentary that preceded its tool call.
function appendAssistantTimeline(
  items: ChatItem[],
  msg: Message,
  spans: Record<number, ThinkingSpan>
): ChatItem[] {
  const toolIDs = new Set(
    msg.content.flatMap((block) => (block.type === 'toolCall' && block.id ? [block.id] : []))
  )
  const withoutPlaceholders = items.filter(
    (item) => item.kind !== 'tool' || !toolIDs.has(item.toolCallId)
  )
  return [...withoutPlaceholders, ...assistantTimelineItems(msg, spans)]
}

// Extend the reasoning spans for a streaming partial. A span opens the first
// time its block carries content and its end only moves while that text keeps
// growing, so a block stops accruing time the moment the model switches to
// prose or a tool call.
function trackThinking(chat: ChatState, partial: Message): Record<number, ThinkingSpan> {
  const now = Date.now()
  let spans = chat.thinkingSpans
  partial.content.forEach((block, i) => {
    if (block.type !== 'thinking') return
    const length = block.thinking?.length ?? 0
    if (length === 0 && !block.redacted) return
    const prev = spans[i]
    if (!prev) {
      // Only the message's first reasoning block can claim the pre-stream wait;
      // for later ones that gap was tool work or prose, not thinking.
      const startedAt =
        Object.keys(spans).length === 0 ? chat.streamStartedAt ?? now : now
      spans = { ...spans, [i]: { startedAt, endedAt: now, length } }
    } else if (length > prev.length) {
      spans = { ...spans, [i]: { ...prev, endedAt: now, length } }
    }
  })
  return spans
}

export function newChat(sessionId: string, cwd: string, model: string, effort: ReasoningEffort = ''): ChatState {
  return {
    sessionId,
    cwd,
    model,
    effort,
    items: [],
    streaming: null,
    toolRuns: {},
    running: false,
    awaitingStart: false,
    notice: null,
    cost: 0,
    lastTokens: 0,
    pendingUsers: [],
    streamStartedAt: null,
    thinkingSpans: {}
  }
}

// Rebuild items + tool runs from a persisted history (session.resume).
export function loadHistory(chat: ChatState, messages: Message[]): ChatState {
  const items: ChatItem[] = []
  const toolRuns: Record<string, ToolRun> = {}
  let cost = 0
  let lastTokens = 0
  for (const msg of messages) {
    if (msg.role === 'toolResult') {
      const id = msg.toolCallId ?? ''
      toolRuns[id] = {
        id,
        name: msg.toolName ?? toolRuns[id]?.name ?? 'tool',
        args: toolRuns[id]?.args ?? {},
        status: msg.isError ? 'error' : 'done',
        createdAt: msg.timestamp,
        updatedAt: msg.timestamp,
        result: { content: msg.content, details: msg.details }
      }
      continue
    }
    if (msg.role === 'assistant') {
      for (const block of msg.content) {
        if (block.type === 'toolCall' && block.id) {
          toolRuns[block.id] = {
            id: block.id,
            name: block.name ?? 'tool',
            args: block.arguments ?? {},
            status: toolRuns[block.id]?.status ?? 'done',
            createdAt: toolRuns[block.id]?.createdAt ?? msg.timestamp,
            updatedAt: toolRuns[block.id]?.updatedAt ?? msg.timestamp,
            result: toolRuns[block.id]?.result
          }
        }
      }
      if (msg.usage) {
        cost += msg.usage.cost?.total ?? 0
        lastTokens = msg.usage.totalTokens
      }
    }
    if (msg.role === 'assistant') {
      items.push(...assistantTimelineItems(msg))
    } else {
      items.push({ kind: 'msg', msg })
    }
  }
  // Reasoning durations are not persisted, so resumed blocks show a bare
  // "Thought" rather than a fabricated elapsed time.
  return {
    ...chat,
    items,
    toolRuns,
    cost,
    lastTokens,
    streaming: null,
    pendingUsers: [],
    awaitingStart: false,
    streamStartedAt: null,
    thinkingSpans: {}
  }
}

export function applyEvent(chat: ChatState, ev: AgentEvent): ChatState {
  switch (ev.type) {
    case 'agent_start': {
      const startedAt = Date.now()
      return {
        ...chat,
        running: true,
        awaitingStart: false,
        notice: null,
        items: [
          ...chat.items,
          { kind: 'turn', summary: { id: `${startedAt}-${Math.random()}`, startedAt } }
        ]
      }
    }

    case 'agent_end':
      return finishTurn({ ...chat, running: false, awaitingStart: false, streaming: null })

    case 'retry':
      return {
        ...chat,
        notice: `Provider error, retrying (attempt ${ev.attempt ?? '?'}/${ev.maxAttempts ?? '?'})...`
      }

    case 'message_start':
      if (ev.message?.role === 'assistant') {
        return { ...chat, streaming: ev.message, streamStartedAt: Date.now(), thinkingSpans: {} }
      }
      return chat

    case 'message_update': {
      const partial = ev.assistantMessageEvent?.partial
      if (!partial) return chat
      return { ...chat, streaming: partial, thinkingSpans: trackThinking(chat, partial) }
    }

    case 'message_end': {
      const msg = ev.message
      if (!msg) return chat
      if (msg.role === 'toolResult') {
        const id = msg.toolCallId ?? ''
        const prev = chat.toolRuns[id]
        return {
          ...chat,
          toolRuns: {
            ...chat.toolRuns,
            [id]: {
              id,
              name: msg.toolName ?? prev?.name ?? 'tool',
              args: prev?.args ?? {},
              status: msg.isError ? 'error' : 'done',
              createdAt: prev?.createdAt ?? msg.timestamp,
              updatedAt: msg.timestamp,
              result: { content: msg.content, details: msg.details }
            }
          }
        }
      }
      if (msg.role === 'user') {
        // A local bubble was already rendered for a prompt, steer, or queued
        // follow-up. Consume only its corresponding pending entry. Do not
        // deduplicate by looking at nearby message text: identical prompts are
        // legitimate and previously caused queued bubbles to disappear.
        const pendingIndex = chat.pendingUsers.findIndex((pending) => {
          const item = chat.items.find((candidate) => candidate.kind === 'msg' && candidate.localId === pending.id)
          return item?.kind === 'msg' && contentMatches(item.msg.content, msg.content)
        })
        if (pendingIndex >= 0) {
          const pending = chat.pendingUsers[pendingIndex]
          return {
            ...chat,
            items: chat.items.map((item) =>
              item.kind === 'msg' && item.localId === pending.id ? { kind: 'msg', msg } : item
            ),
            pendingUsers: chat.pendingUsers.filter((_, index) => index !== pendingIndex)
          }
        }
        return { ...chat, items: [...chat.items, { kind: 'msg', msg }] }
      }
      // assistant
      const toolRuns = { ...chat.toolRuns }
      for (const block of msg.content) {
        if (block.type === 'toolCall' && block.id && !toolRuns[block.id]) {
          toolRuns[block.id] = {
            id: block.id,
            name: block.name ?? 'tool',
            args: block.arguments ?? {},
            status: 'running',
            createdAt: msg.timestamp,
            updatedAt: msg.timestamp
          }
        }
      }
      return {
        ...chat,
        items: appendAssistantTimeline(chat.items, msg, chat.thinkingSpans),
        streaming: null,
        streamStartedAt: null,
        thinkingSpans: {},
        toolRuns,
        cost: chat.cost + (msg.usage?.cost?.total ?? 0),
        lastTokens: msg.usage?.totalTokens ?? chat.lastTokens
      }
    }

    case 'tool_execution_start': {
      const id = ev.toolCallId ?? ''
      const startedAt = Date.now()
      return {
        ...chat,
        toolRuns: {
          ...chat.toolRuns,
          [id]: {
            id,
            name: ev.toolName ?? 'tool',
            args: ev.args ?? chat.toolRuns[id]?.args ?? {},
            status: 'running',
            createdAt: chat.toolRuns[id]?.createdAt ?? startedAt,
            updatedAt: startedAt
          }
        },
        items: chat.items.some((item) => item.kind === 'tool' && item.toolCallId === id)
          ? chat.items
          : [...chat.items, { kind: 'tool', toolCallId: id }]
      }
    }

    case 'tool_execution_update': {
      const id = ev.toolCallId ?? ''
      const prev = chat.toolRuns[id]
      if (!prev) return chat
      return {
        ...chat,
        toolRuns: { ...chat.toolRuns, [id]: { ...prev, partial: ev.partialResult ?? prev.partial, updatedAt: Date.now() } }
      }
    }

    case 'tool_execution_end': {
      const id = ev.toolCallId ?? ''
      const prev = chat.toolRuns[id]
      return {
        ...chat,
        toolRuns: {
          ...chat.toolRuns,
          [id]: {
            id,
            name: ev.toolName ?? prev?.name ?? 'tool',
            args: prev?.args ?? ev.args ?? {},
            status: ev.isError ? 'error' : 'done',
            createdAt: prev?.createdAt ?? Date.now(),
            updatedAt: Date.now(),
            result: ev.result ?? prev?.result,
            partial: undefined
          }
        }
      }
    }

    case 'compaction_end':
      return ev.compaction
        ? { ...chat, items: [...chat.items, { kind: 'compaction', info: ev.compaction }] }
        : chat

    default:
      return chat
  }
}

function updateLatestTurn(items: ChatItem[], update: (summary: TurnSummary) => TurnSummary): ChatItem[] {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'turn') {
      return items.map((item, index) =>
        index === i && item.kind === 'turn' ? { ...item, summary: update(item.summary) } : item
      )
    }
  }
  return items
}

function finishTurn(chat: ChatState): ChatState {
  const endedAt = Date.now()
  return {
    ...chat,
    items: updateLatestTurn(chat.items, (summary) =>
      summary.endedAt ? summary : { ...summary, endedAt }
    )
  }
}

export type Action =
  | { type: 'conn'; state: ConnState; detail?: string }
  | { type: 'hello'; version: string }
  | { type: 'sessions'; sessions: SessionMeta[] }
  | { type: 'providers'; providers: ProvidersInfo }
  | { type: 'openChat'; chat: ChatState }
  | { type: 'trackChat'; chat: ChatState }
  | { type: 'focusChat'; sessionId: string }
  | { type: 'closeChat' }
  | { type: 'closeTab'; sessionId: string }
  | { type: 'loading'; value: boolean }
  | { type: 'fatal'; message: string | null }
  | { type: 'event'; sessionId: string; event: AgentEvent }
  | { type: 'done'; sessionId: string; error?: string }
  | { type: 'localUser'; sessionId: string; localId: string; content: ContentBlock[] }
  | { type: 'rollbackLocalUser'; sessionId: string; localId: string }
  | { type: 'model'; model: string }
  | { type: 'effort'; sessionId: string; effort: ReasoningEffort }
  | { type: 'notice'; text: string | null }
  | { type: 'chatNotice'; sessionId: string; text: string | null }
  | { type: 'home'; cwd?: string }
  | { type: 'addProject'; cwd: string }
  | { type: 'clearVisible' }

// Replace one tracked chat, leaving the rest of the map untouched.
function withChat(state: AppState, chat: ChatState): AppState {
  return { ...state, chats: { ...state.chats, [chat.sessionId]: chat } }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'conn': {
      // A disconnect aborts every run and drops ownership server-side. Keep
      // only the visible chat (marked idle); background chats must re-resume
      // from disk anyway, and keeping them would leave stale ownership state.
      if (action.state === 'disconnected') {
        const active = activeChat(state)
        return {
          ...state,
          conn: action.state,
          connDetail: action.detail,
          chats: active ? { [active.sessionId]: { ...active, running: false, awaitingStart: false, streaming: null } } : {}
        }
      }
      return { ...state, conn: action.state, connDetail: action.detail }
    }
    case 'hello':
      return { ...state, serverVersion: action.version }
    case 'sessions':
      return { ...state, sessions: action.sessions }
    case 'providers':
      return { ...state, providers: action.providers }
    case 'openChat': {
      const id = action.chat.sessionId
      const tabOrder = state.tabOrder.includes(id) ? state.tabOrder : [...state.tabOrder, id]
      return { ...withChat(state, action.chat), activeId: id, tabOrder, loading: false }
    }
    case 'trackChat': {
      const id = action.chat.sessionId
      const tabOrder = state.tabOrder.includes(id) ? state.tabOrder : [...state.tabOrder, id]
      return { ...withChat(state, action.chat), tabOrder }
    }
    case 'focusChat': {
      if (!state.chats[action.sessionId]) return state
      const id = action.sessionId
      const tabOrder = state.tabOrder.includes(id) ? state.tabOrder : [...state.tabOrder, id]
      return { ...state, activeId: id, tabOrder, loading: false }
    }
    case 'closeChat':
      return { ...state, activeId: null }
    case 'closeTab': {
      const id = action.sessionId
      const newOrder = state.tabOrder.filter((t) => t !== id)
      const newChats = { ...state.chats }
      // A LIVE run survives its tab. Deleting the chat unconditionally dropped
      // it from `chats`, and with it from `runningIds` — so closing the tab of
      // a running session (⌘W) orphaned the run: the agent kept working
      // server-side while nothing in the UI tracked it, and every remaining
      // `event`/`done` push for it was silently discarded, because both of
      // those cases bail when the chat is missing.
      //
      // Closing a tab is a VIEW action, not an abort (`stop` is the abort).
      // So a running chat stays tracked, just untabbed: it keeps folding
      // events, still reports through `runningIds`, and `focusChat` can
      // re-attach a tab for it straight from the sidebar. `done` reaps it once
      // the run actually ends.
      //
      // The same protection covers the prompt-in-flight window: after
      // `localUser` but before `agent_start`, `running` still reads false, so
      // `awaitingStart` carries the "a request is out" signal instead.
      if (!newChats[id]?.running && !newChats[id]?.awaitingStart) delete newChats[id]
      let newActive = state.activeId
      if (state.activeId === id) {
        const idx = state.tabOrder.indexOf(id)
        newActive = newOrder[idx] ?? newOrder[idx - 1] ?? null
      }
      return { ...state, chats: newChats, tabOrder: newOrder, activeId: newActive, loading: false }
    }
    case 'loading':
      return { ...state, loading: action.value }
    case 'fatal':
      return { ...state, fatal: action.message }
    case 'event': {
      const chat = state.chats[action.sessionId]
      if (!chat) return state
      return withChat(state, applyEvent(chat, action.event))
    }
    case 'done': {
      const chat = state.chats[action.sessionId]
      if (!chat) return state
      // Reap a DETACHED run: `closeTab` kept this chat tracked only so the run
      // could finish and report. With no tab left there is nothing to render
      // it, and the transcript is on disk (re-openable from the sidebar), so
      // holding it would just grow `chats` for the life of the process.
      //
      // NOTE: this path deliberately drops the run's outcome, so a detached
      // run that FAILED currently resolves to nothing visible. This branch is
      // the hook for the planned unseen marker: record `done` vs `error` for
      // `action.sessionId` here (App.tsx already calls `refreshSessions()` on
      // the same push, so the sidebar re-sorts either way).
      if (!state.tabOrder.includes(action.sessionId)) {
        const remaining = { ...state.chats }
        delete remaining[action.sessionId]
        return { ...state, chats: remaining }
      }
      const aborted = action.error?.toLowerCase().includes('abort')
      const err = action.error?.toLowerCase() ?? ''
      // Map raw backend errors to friendly user-facing wording. Go's
      // context.Canceled surfaces as "context canceled"; it means the run was
      // interrupted (user stopped it or the connection dropped).
      const friendly: string | null = action.error
        ? err.includes('context canceled') || err.includes('context cancelled')
          ? 'Run was interrupted.'
          : aborted
            ? 'Run stopped.'
            : action.error
        : null
      return withChat(state, {
        ...chat,
        running: false,
        awaitingStart: false,
        streaming: null,
        notice: friendly,
        items: finishTurn(chat).items
      })
    }
    case 'localUser': {
      const chat = state.chats[action.sessionId]
      if (!chat) return state
      const msg: Message = {
        role: 'user',
        content: action.content,
        timestamp: Date.now()
      }
      return withChat(state, {
        ...chat,
        items: [...chat.items, { kind: 'msg', msg, localId: action.localId }],
        pendingUsers: [...chat.pendingUsers, { id: action.localId }],
        awaitingStart: true,
        notice: null
      })
    }
    case 'rollbackLocalUser': {
      const chat = state.chats[action.sessionId]
      if (!chat) return state
      return withChat(state, {
        ...chat,
        items: chat.items.filter((item) => item.kind !== 'msg' || item.localId !== action.localId),
        pendingUsers: chat.pendingUsers.filter((pending) => pending.id !== action.localId),
        awaitingStart: false
      })
    }
    case 'model': {
      const chat = activeChat(state)
      if (!chat) return state
      return withChat(state, { ...chat, model: action.model })
    }
    case 'effort': {
      const chat = state.chats[action.sessionId]
      if (!chat) return state
      return withChat(state, { ...chat, effort: action.effort })
    }
    case 'notice': {
      const chat = activeChat(state)
      if (!chat) return state
      return withChat(state, { ...chat, notice: action.text })
    }
    case 'chatNotice': {
      const chat = state.chats[action.sessionId]
      if (!chat) return state
      return withChat(state, { ...chat, notice: action.text })
    }
    case 'home':
      return { ...state, activeId: null, loading: false, homeCwd: action.cwd ?? state.homeCwd }
    case 'addProject': {
      const projects = [action.cwd, ...state.projects.filter((c) => c !== action.cwd)]
      persistProjects(projects)
      return { ...state, projects }
    }
    case 'clearVisible': {
      const chat = activeChat(state)
      if (!chat) return state
      return withChat(state, {
        ...chat,
        items: [],
        streaming: null,
        toolRuns: {},
        notice: null,
        streamStartedAt: null,
        thinkingSpans: {}
      })
    }
    default:
      return state
  }
}
