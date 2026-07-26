import type {
  AgentEvent,
  CompactionInfo,
  Message,
  ProvidersInfo,
  SessionMeta,
  ToolResult
} from '../../shared/protocol'

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
  | { kind: 'msg'; msg: Message }
  | { kind: 'tool'; toolCallId: string }
  | { kind: 'thinking'; id: string; text: string; redacted: boolean }
  | { kind: 'compaction'; info: CompactionInfo }
  | { kind: 'turn'; summary: TurnSummary }

export interface ChatState {
  sessionId: string
  cwd: string
  model: string
  items: ChatItem[]
  streaming: Message | null
  toolRuns: Record<string, ToolRun>
  running: boolean
  notice: string | null
  cost: number
  lastTokens: number
  // Optimistic user bubbles awaiting their matching server message_end event.
  // Text is retained rather than used as a global deduplication key: identical
  // prompts are valid and each must remain visible.
  pendingUserTexts: string[]
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

// Preserve the provider's block order inside an assistant turn. A response can
// contain commentary before and between tool calls, so it must not be reduced
// to "all work, then all text".
function assistantTimelineItems(msg: Message): ChatItem[] {
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
      out.push({ kind: 'thinking', id: `${msg.timestamp}-${i}`, text: block.thinking ?? '', redacted: !!block.redacted })
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
function appendAssistantTimeline(items: ChatItem[], msg: Message): ChatItem[] {
  const toolIDs = new Set(
    msg.content.flatMap((block) => (block.type === 'toolCall' && block.id ? [block.id] : []))
  )
  const withoutPlaceholders = items.filter(
    (item) => item.kind !== 'tool' || !toolIDs.has(item.toolCallId)
  )
  return [...withoutPlaceholders, ...assistantTimelineItems(msg)]
}

export function newChat(sessionId: string, cwd: string, model: string): ChatState {
  return {
    sessionId,
    cwd,
    model,
    items: [],
    streaming: null,
    toolRuns: {},
    running: false,
    notice: null,
    cost: 0,
    lastTokens: 0,
    pendingUserTexts: []
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
  return { ...chat, items, toolRuns, cost, lastTokens, streaming: null, pendingUserTexts: [] }
}

export function applyEvent(chat: ChatState, ev: AgentEvent): ChatState {
  switch (ev.type) {
    case 'agent_start': {
      const startedAt = Date.now()
      return {
        ...chat,
        running: true,
        notice: null,
        items: [
          ...chat.items,
          { kind: 'turn', summary: { id: `${startedAt}-${Math.random()}`, startedAt } }
        ]
      }
    }

    case 'agent_end':
      return finishTurn({ ...chat, running: false, streaming: null })

    case 'retry':
      return {
        ...chat,
        notice: `Provider error, retrying (attempt ${ev.attempt ?? '?'}/${ev.maxAttempts ?? '?'})...`
      }

    case 'message_start':
      if (ev.message?.role === 'assistant') return { ...chat, streaming: ev.message }
      return chat

    case 'message_update': {
      const partial = ev.assistantMessageEvent?.partial
      return partial ? { ...chat, streaming: partial } : chat
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
        const text = messageText(msg)
        const pendingIndex = chat.pendingUserTexts.indexOf(text)
        if (pendingIndex >= 0) {
          return {
            ...chat,
            pendingUserTexts: chat.pendingUserTexts.filter((_, index) => index !== pendingIndex)
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
        items: appendAssistantTimeline(chat.items, msg),
        streaming: null,
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
  | { type: 'focusChat'; sessionId: string }
  | { type: 'closeChat' }
  | { type: 'loading'; value: boolean }
  | { type: 'fatal'; message: string | null }
  | { type: 'event'; sessionId: string; event: AgentEvent }
  | { type: 'done'; sessionId: string; error?: string }
  | { type: 'localUser'; text: string }
  | { type: 'model'; model: string }
  | { type: 'notice'; text: string | null }
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
          chats: active ? { [active.sessionId]: { ...active, running: false, streaming: null } } : {}
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
    case 'openChat':
      return { ...withChat(state, action.chat), activeId: action.chat.sessionId, loading: false }
    case 'focusChat':
      if (!state.chats[action.sessionId]) return state
      return { ...state, activeId: action.sessionId, loading: false }
    case 'closeChat':
      return { ...state, activeId: null }
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
      const aborted = action.error?.toLowerCase().includes('abort')
      return withChat(state, {
        ...chat,
        running: false,
        streaming: null,
        notice: action.error ? (aborted ? 'Run stopped.' : action.error) : null,
        items: finishTurn(chat).items
      })
    }
    case 'localUser': {
      const chat = activeChat(state)
      if (!chat) return state
      const msg: Message = {
        role: 'user',
        content: [{ type: 'text', text: action.text }],
        timestamp: Date.now()
      }
      return withChat(state, {
        ...chat,
        items: [...chat.items, { kind: 'msg', msg }],
        pendingUserTexts: [...chat.pendingUserTexts, action.text],
        notice: null
      })
    }
    case 'model': {
      const chat = activeChat(state)
      if (!chat) return state
      return withChat(state, { ...chat, model: action.model })
    }
    case 'notice': {
      const chat = activeChat(state)
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
      return withChat(state, { ...chat, items: [], streaming: null, toolRuns: {}, notice: null })
    }
    default:
      return state
  }
}
