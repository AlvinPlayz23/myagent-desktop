import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { bloomPanel } from './motion'
import { api, ApiError } from './api'
import { activeChat, contentMatches, contentText, initialState, loadHistory, newChat, reducer, type ChatState } from './state'
import { createStreamCoalescer, type StreamCoalescer } from './streamCoalescer'
import { baseName, cn } from './util'
import { startChromeAnimation } from './chromeAnimation'
import Sidebar from './components/Sidebar'
import Chat from './components/Chat'
import ChatErrorBoundary from './components/ChatErrorBoundary'
import Composer from './components/Composer'
import StatusBar from './components/StatusBar'
import Home from './components/Home'
import TopBar from './components/TopBar'
import WindowControls from './components/WindowControls'
import TabBar from './components/TabBar'
import OpenWith from './components/OpenWith'
import SubagentPanel from './components/SubagentPanel'
import { useDiffStats } from './hooks/use-diff-stats'
import { subagentTaskIndex, subagentTaskList, revealSubagentInTranscript, type SubagentTask } from './subagents'
import { applyTheme, applyFontSize, loadPreferences, normalizeAppName, normalizeTransparency, runIndicatorColorValue, savePreferences, type Preferences } from './preferences'
import { loadSessionPreferences, saveSessionPreferences, type SessionPreferences } from './sessionPreferences'
// debug-panel: see debug-panel/README.md for what this is and how to remove it
import DebugPanel from './debug-panel/DebugPanel'
import type { CommandName } from './commands'
import { matchShortcut, composerFocus, composerModelPicker, type ShortcutId } from './shortcuts'
import type { ContentBlock, ReasoningEffort } from '../../shared/protocol'

// Surfaces the user has to ask for. They are large (Settings alone drags in
// ProviderManager; GitWindow pulls the whole PR/pull-request screen) and at any
// moment at most one is open, so shipping them in the entry chunk meant every
// cold start parsed ~4k lines of code that mostly never runs. Splitting them
// out is the single biggest win on first paint; each chunk is read from disk
// the first time its surface opens.
const Settings = lazy(() => import('./components/Settings'))
const GitWindow = lazy(() => import('./git/GitWindow'))
const GitPanel = lazy(() => import('./components/GitPanel'))
const CommandModal = lazy(() => import('./components/CommandModal'))
const RenameSessionModal = lazy(() => import('./components/RenameSessionModal'))
const ToolsModal = lazy(() => import('./components/ToolsModal'))

// Chunk loads resolve off local disk in single-digit milliseconds, so these
// fallbacks are deliberately near-invisible: a spinner that flashes once is
// worse than a moment of empty panel. They exist to avoid a layout jump, not
// to announce progress.
function PanelFallback(): JSX.Element {
  return <div className="h-full w-full" aria-hidden />
}

function ScreenFallback(): JSX.Element {
  return <div className="fixed inset-0 z-50 bg-background/80" aria-hidden />
}

const NO_SUBAGENTS: SubagentTask[] = []
const NO_CWDS: string[] = []
const NO_LABELS: string[] = []

export default function App(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [view, setView] = useState<'content' | 'settings'>('content')
  // debug-panel: drawer open/closed state
  const [debugOpen, setDebugOpen] = useState(false)
  const [gitOpen, setGitOpen] = useState(false)
  // The full-window source-control screen. Separate from `gitOpen` (the 320px
  // staging panel): they answer different questions and are used at different
  // moments, so neither replaces the other.
  const [gitWindowOpen, setGitWindowOpen] = useState(false)
  const [subagentsOpen, setSubagentsOpen] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [queuedFollowUps, setQueuedFollowUps] = useState<{ id: string; sessionId: string; content: ContentBlock[]; label: string }[]>([])
  const [homeNotice, setHomeNotice] = useState<string | null>(null)
  const [sessionPreferences, setSessionPreferences] = useState<SessionPreferences>(loadSessionPreferences)
  const [modal, setModal] = useState<'help' | 'tools' | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  // The subagent shown in the side panel's detail view, by task key. Resolved
  // against the live index on every render (not stored as an object) so a
  // detail left open on a running child fills in when its report lands.
  // launchError rides along because only the transcript card holds the tool run
  // that produced it. Null means the panel shows its list.
  const [subagentDetail, setSubagentDetail] = useState<{ key: string; launchError?: string } | null>(null)
  const chat = activeChat(state)
  const activeSession = useRef<string | null>(null)
  // Streaming deltas replace the active ChatState object on every frame. The
  // callbacks passed down to Composer/TopBar read it through this ref instead
  // of closing over it, so their identity survives a whole run and memoised
  // children can actually bail out mid-stream.
  const chatRef = useRef<ChatState | null>(chat)
  chatRef.current = chat
  // Same idea for the session list: title lookups happen at click time, so the
  // handlers that need them never change identity.
  const sessionsRef = useRef(state.sessions)
  sessionsRef.current = state.sessions
  const conn = useRef(state.conn)
  const chats = useRef(state.chats)
  activeSession.current = chat?.sessionId ?? null
  chats.current = state.chats
  // Refs read inside the stable keydown listener so it never resubscribes.
  const modalRef = useRef(modal)
  modalRef.current = modal
  const renameRef = useRef(renameTarget)
  renameRef.current = renameTarget
  // Same pattern for the active notice: the once-subscribed keydown listener
  // must see the latest value without resubscribing on every state change.
  const noticeRef = useRef<string | null>(null)
  noticeRef.current = chat?.notice ?? null

  useEffect(() => {
    applyTheme(preferences.theme, preferences.themeId)
    applyFontSize(preferences.interfaceFontSize)
    savePreferences(preferences)
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      if (preferences.theme === 'system') applyTheme('system', preferences.themeId)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preferences])

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', preferences.reducedMotion)
  }, [preferences.reducedMotion])

  // Native Acrylic, Mica, Vibrancy, and transparent windows all use the same
  // renderer-controlled tint. The OS still owns the blur/material effect;
  // this variable controls how strongly our shell is painted over it.
  useEffect(() => {
    const transparency = normalizeTransparency(preferences.transparency)
    // A zero slider reads as Solid: fully opaque shell, no blur request.
    const opacity = preferences.transparencyEnabled && transparency > 0 ? 0.94 - transparency / 100 * 0.56 : 1
    document.documentElement.style.setProperty('--shell-opacity', opacity.toFixed(3))
    // Windows 10 needs a native DWM call for actual desktop blur. Other hosts
    // ignore this renderer-to-main update and keep their native material.
    void window.myagent.setTransparency(preferences.transparencyEnabled, transparency)
  }, [preferences.transparency, preferences.transparencyEnabled])

  // How the window blends with the desktop is fixed for the process lifetime —
  // resolve it once and hand it to CSS, which owns every visual consequence.
  // Also drives the window corner radius, which has to square off when
  // maximized, so the maximized state is mirrored onto <html> alongside it.
  useEffect(() => {
    window.myagent
      .backdrop()
      .then((mode) => {
        document.documentElement.dataset.backdrop = mode
      })
      .catch(() => {
        document.documentElement.dataset.backdrop = 'none'
      })
    const setMaximized = (maximized: boolean): void => {
      document.documentElement.classList.toggle('window-maximized', maximized)
    }
    window.myagent.windowMaximized().then(setMaximized).catch(() => {})
    const offMaximized = window.myagent.onWindowMaximized(setMaximized)
    // A transparent (Win10 fallback) window repaints in software while DWM
    // animates a maximize/resize — the "fills left, then right" stutter. The
    // sidebar blur and panel grain dominate that repaint cost, so drop them
    // while the size is settling and restore them once it stops changing.
    let resizeTimer: number | null = null
    const onResize = (): void => {
      document.documentElement.classList.add('window-resizing')
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null
        document.documentElement.classList.remove('window-resizing')
      }, 250)
    }
    window.addEventListener('resize', onResize)
    // Re-sync after focus: a missed maximize event must not stick forever.
    const onFocus = (): void => {
      window.myagent.windowMaximized().then(setMaximized).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => {
      offMaximized()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('focus', onFocus)
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      document.documentElement.classList.remove('window-resizing')
    }
  }, [])

  useEffect(() => {
    saveSessionPreferences(sessionPreferences)
  }, [sessionPreferences])

  // Switching tabs drops any open subagent detail with it: the panel remounts
  // on the new session, and a key resolved against the old chat is meaningless.
  useEffect(() => {
    setSubagentDetail(null)
  }, [chat?.sessionId])

  // Settled (non-retry) notices auto-dismiss after a few seconds so they don't
  // linger in the composer. Live retry notices persist until the run resolves.
  const noticeText = chat?.notice ?? null
  useEffect(() => {
    if (!noticeText || /retry/i.test(noticeText)) return
    const timer = setTimeout(() => dispatch({ type: 'notice', text: null }), 5000)
    return () => clearTimeout(timer)
  }, [noticeText])

  const refreshSessions = useCallback(async () => {
    try {
      const sessions = await api.listSessions()
      sessions.sort((a, b) => (a.modified < b.modified ? 1 : -1))
      dispatch({ type: 'sessions', sessions })
    } catch {
      // transient; status bar reflects connection problems
    }
  }, [])

  const bootstrap = useCallback(async () => {
    dispatch({ type: 'fatal', message: null })
    try {
      await api.connect()
      dispatch({ type: 'providers', providers: await api.providers() })
      await refreshSessions()
    } catch (err) {
      dispatch({ type: 'fatal', message: err instanceof Error ? err.message : String(err) })
    }
  }, [refreshSessions])

  const coalescerRef = useRef<StreamCoalescer | null>(null)
  if (coalescerRef.current === null) {
    coalescerRef.current = createStreamCoalescer({
      emit: (sessionId, event) => dispatch({ type: 'event', sessionId, event }),
      isActive: (sessionId) => sessionId === activeSession.current
    })
  }
  const coalescer = coalescerRef.current

  useEffect(() => () => coalescer.dispose(), [coalescer])

  // Focus moved; pending background work for the newly active session must
  // move to the per-frame schedule instead of waiting out the slow timer.
  useEffect(() => {
    if (chat?.sessionId) coalescer.activate(chat.sessionId)
  }, [chat?.sessionId, coalescer])

  useEffect(() => {
    // Pushes arrive batched: the main process coalesces per-event server
    // notifications into one IPC message per tick. The whole batch is handled
    // inside one listener call, so React 18 folds the resulting dispatches
    // into a single render pass — one wake-up per tick instead of per token.
    const off = api.onPush((batch) => {
      for (const push of batch) {
        switch (push.kind) {
          case 'hello':
            dispatch({ type: 'hello', version: push.version })
            break
          case 'status': {
            const prev = conn.current
            conn.current = push.state
            dispatch({ type: 'conn', state: push.state, detail: push.detail })
            // Ownership is dropped server-side on disconnect; re-claim the open
            // session after a successful reconnect.
            if (push.state === 'connected' && prev !== 'connected' && activeSession.current) {
              const id = activeSession.current
              api
                .resumeSession(id)
                .then((info) =>
                  dispatch({
                    type: 'openChat',
                    chat: loadHistory(newChat(info.sessionId, info.cwd, info.model, info.effort ?? ''), info.messages)
                  })
                )
                .catch(() => {})
            }
            break
          }
          case 'event':
            if (push.event.type === 'message_end' && push.event.message?.role === 'user') {
              setQueuedFollowUps((current) => {
                const index = current.findIndex(
                  (pending) => pending.sessionId === push.sessionId && contentMatches(pending.content, push.event.message!.content)
                )
                const next = index < 0 ? current : current.filter((_, itemIndex) => itemIndex !== index)
                return next
              })
            }
            coalescer.push(push.sessionId, push.event)
            break
          case 'done':
            setQueuedFollowUps((current) => current.filter((pending) => pending.sessionId !== push.sessionId))
            coalescer.drop(push.sessionId)
            dispatch({ type: 'done', sessionId: push.sessionId, error: push.error })
            refreshSessions()
            break
        }
      }
    })
    bootstrap()
    return off
  }, [bootstrap, refreshSessions])

  const openSession = useCallback(async (id: string) => {
    setView('content')
    // Already tracked live on this connection (possibly mid-run in the
    // background): its state is fresher than disk, just switch to it.
    if (chats.current[id]) {
      dispatch({ type: 'focusChat', sessionId: id })
      return
    }
    dispatch({ type: 'loading', value: true })
    try {
      const info = await api.resumeSession(id)
      dispatch({
        type: 'openChat',
        chat: loadHistory(newChat(info.sessionId, info.cwd, info.model, info.effort ?? ''), info.messages)
      })
    } catch (err) {
      dispatch({ type: 'loading', value: false })
      dispatch({ type: 'fatal', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  // Explicit projects first (insertion order), then any session cwds not
  // already covered — the single ordered list used by sidebar + home dropdown.
  const projectList = useMemo(() => {
    const seen = new Set<string>()
    const out: { cwd: string; name: string }[] = []
    for (const cwd of state.projects) {
      if (!seen.has(cwd)) {
        seen.add(cwd)
        out.push({ cwd, name: baseName(cwd) })
      }
    }
    for (const s of state.sessions) {
      if (!seen.has(s.cwd)) {
        seen.add(s.cwd)
        out.push({ cwd: s.cwd, name: baseName(s.cwd) })
      }
    }
    return out
  }, [state.projects, state.sessions])

  // "+" next to the Projects title: pick a folder, register it as a project,
  // land on the home screen with it preselected.
  const addProject = useCallback(async () => {
    const cwd = await api.pickFolder()
    if (!cwd) return
    dispatch({ type: 'addProject', cwd })
    dispatch({ type: 'home', cwd })
  }, [])

  // Per-project "+": go to the home/compose screen with that project selected.
  const composeIn = useCallback((cwd: string) => {
    setView('content')
    dispatch({ type: 'addProject', cwd })
    dispatch({ type: 'home', cwd })
  }, [])

  const goHome = useCallback(() => {
    setView('content')
    dispatch({ type: 'home' })
  }, [])

  const selectHomeCwd = useCallback((cwd: string) => dispatch({ type: 'home', cwd }), [])

  // Both of these animate the width of a panel that sits next to the chat
  // column, which reflows the transcript and repaints the shell around it — see
  // chromeAnimation.ts for what gets masked while they run. The duration passed
  // here matches each animation's own token.
  const toggleSidebar = useCallback(() => {
    startChromeAnimation(240)
    setSidebarCollapsed((value) => !value)
  }, [])
  const toggleGit = useCallback(() => {
    startChromeAnimation(200)
    setGitOpen((value) => !value)
  }, [])
  // Closing the panel also drops the detail: reopening should land on the list,
  // not on whatever task was last inspected.
  const toggleSubagents = useCallback(() => {
    startChromeAnimation(200)
    setSubagentsOpen((value) => !value)
    setSubagentDetail(null)
  }, [])
  // Clicking any subagent row (transcript card, completion notice, side-panel
  // row) drills the side panel into that task's detail, opening the panel if it
  // is closed. Stored by key so the detail always reads the latest task object —
  // including a report that lands while it is open.
  const openSubagent = useCallback((task: SubagentTask, launchError?: string) => {
    setSubagentsOpen(true)
    setSubagentDetail({ key: task.key, launchError })
  }, [])
  const closeSubagentDetail = useCallback(() => setSubagentDetail(null), [])
  const showSubagentInConversation = useCallback((task: SubagentTask) => {
    setSubagentDetail(null)
    // Let the detail swap out of the panel before the transcript jumps.
    window.setTimeout(() => revealSubagentInTranscript(task.key), 60)
  }, [])
  const toggleSettings = useCallback(() => setView((v) => (v === 'settings' ? 'content' : 'settings')), [])
  const openSettings = useCallback(() => setView('settings'), [])

  // Home composer: create a session in the selected project, then prompt.
  const homeSend = useCallback(
    async (content: ContentBlock[], modelRef?: string, effort?: ReasoningEffort) => {
      const cwd = state.homeCwd ?? projectList[0]?.cwd
      if (!cwd) return
      setHomeNotice(null)
      try {
        const divider = modelRef?.indexOf('/') ?? -1
        const provider = divider > 0 ? modelRef?.slice(0, divider) : undefined
        const model = divider > 0 ? modelRef?.slice(divider + 1) : undefined
        const info = await api.createSession(cwd, provider, model, effort)
        const sessionId = info.sessionId
        const localId = crypto.randomUUID()
        dispatch({ type: 'trackChat', chat: newChat(sessionId, info.cwd, info.model, info.effort ?? effort) })
        dispatch({ type: 'localUser', sessionId, localId, content })
        try {
          await api.prompt(sessionId, content)
        } catch (err) {
          dispatch({ type: 'rollbackLocalUser', sessionId, localId })
          throw err
        }
        dispatch({ type: 'focusChat', sessionId })
        refreshSessions()
      } catch (err) {
        setHomeNotice(err instanceof Error ? err.message : String(err))
        throw err
      }
    },
    [state.homeCwd, projectList, refreshSessions]
  )

  const send = useCallback(
    async (content: ContentBlock[], queue: boolean) => {
      // Read through the ref: the callback then keeps one identity for the
      // whole session, and `running` is evaluated at call time — the more
      // correct reading if the turn started while the user was still typing.
      const chat = chatRef.current
      if (!chat) return
      const sessionId = chat.sessionId
      const localId = crypto.randomUUID()
      const text = contentText(content)
      const imageCount = content.filter((block) => block.type === 'image').length
      const label = text || `${imageCount} image${imageCount === 1 ? '' : 's'} attached`
      let queued = false
      dispatch({ type: 'localUser', sessionId, localId, content })
      try {
        if (chat.running) {
          if (queue) {
            // Render the queued message before the RPC can emit its echoed
            // message_end event. This preserves ordering and gives the user
            // immediate confirmation that the follow-up was accepted.
            queued = true
            setQueuedFollowUps((current) => [...current, { id: localId, sessionId, content, label }])
            await api.followUp(sessionId, content)
          } else {
            await api.steer(sessionId, content)
          }
        } else {
          await api.prompt(sessionId, content)
        }
      } catch (err) {
        dispatch({ type: 'rollbackLocalUser', sessionId, localId })
        if (queued) {
          setQueuedFollowUps((current) => current.filter((pending) => pending.id !== localId))
        }
        dispatch({
          type: 'chatNotice',
          sessionId,
          text: err instanceof ApiError ? err.message : String(err)
        })
        throw err
      }
    },
    []
  )

  const stop = useCallback(() => {
    const chat = chatRef.current
    if (chat) api.abort(chat.sessionId).catch(() => {})
  }, [])

  const compact = useCallback(() => {
    const chat = chatRef.current
    if (!chat) return
    api.compact(chat.sessionId).catch((err) => {
      dispatch({ type: 'notice', text: err instanceof Error ? err.message : String(err) })
    })
  }, [])

  const changeModel = useCallback(
    async (provider: string, model: string) => {
      const chat = chatRef.current
      if (!chat) return
      try {
        const result = await api.setModel(chat.sessionId, provider, model)
        dispatch({ type: 'model', model: `${provider}/${model}` })
        dispatch({ type: 'effort', sessionId: chat.sessionId, effort: result.effort })
      } catch (err) {
        dispatch({ type: 'notice', text: err instanceof Error ? err.message : String(err) })
      }
    },
    []
  )

  // Live-refreshes one provider's model list from its /v1/models endpoint and
  // merges the discovered IDs into the provider list state. Failures are
  // silent: the catalog-backed list stays usable on its own.
  const discoverModels = useCallback((name: string) => {
    void api
      .discoverProviderModels(name)
      .then(async () => dispatch({ type: 'providers', providers: await api.providers() }))
      .catch(() => {})
  }, [])

  const changeEffort = useCallback(
    async (effort: ReasoningEffort) => {
      const chat = chatRef.current
      if (!chat) return
      const previous = chat.effort
      dispatch({ type: 'effort', sessionId: chat.sessionId, effort })
      try {
        const result = await api.setEffort(chat.sessionId, effort)
        dispatch({ type: 'effort', sessionId: chat.sessionId, effort: result.effort })
      } catch (err) {
        dispatch({ type: 'effort', sessionId: chat.sessionId, effort: previous })
        dispatch({ type: 'chatNotice', sessionId: chat.sessionId, text: err instanceof Error ? err.message : String(err) })
      }
    },
    []
  )

  // Stable wrappers so the memoised composer is never handed a fresh arrow on
  // a streaming delta.
  const setEffort = useCallback((effort: ReasoningEffort) => void changeEffort(effort), [changeEffort])
  const dismissChatNotice = useCallback(() => dispatch({ type: 'notice', text: null }), [])

  // Every handler below is a stable reference: they are re-created only when
  // their real dependencies move, never when a streaming delta lands. Without
  // this the memoised Composer/TopBar/TabBar receive fresh arrows every frame
  // and re-render anyway, which is what made the old `memo()` calls no-ops.
  const toggleDebug = useCallback(() => setDebugOpen((value) => !value), [])
  const closeDebug = useCallback(() => setDebugOpen(false), [])
  const openGitWindow = useCallback(() => setGitWindowOpen(true), [])
  const closeGitWindow = useCallback(() => setGitWindowOpen(false), [])
  const openHelp = useCallback(() => setModal('help'), [])
  const closeModal = useCallback(() => setModal(null), [])
  const closeGit = useCallback(() => setGitOpen(false), [])
  const closeSubagents = useCallback(() => {
    setSubagentsOpen(false)
    setSubagentDetail(null)
  }, [])
  const closeSettings = useCallback(() => setView('content'), [])
  const dismissHomeNotice = useCallback(() => setHomeNotice(null), [])
  const focusTab = useCallback((id: string) => dispatch({ type: 'focusChat', sessionId: id }), [])
  const closeTab = useCallback((id: string) => dispatch({ type: 'closeTab', sessionId: id }), [])

  // Title/rename read the session list at call time (via sessionsRef) instead
  // of being rebuilt from `state.sessions` on every render.
  const topBarTitle = useMemo(() => {
    const id = chat?.sessionId
    if (!id) return undefined
    const session = state.sessions.find((s) => s.id === id)
    return session?.title || session?.preview
  }, [state.sessions, chat?.sessionId])

  const renameActiveSession = useCallback(() => {
    const id = chatRef.current?.sessionId
    if (!id) return
    const session = sessionsRef.current.find((s) => s.id === id)
    setRenameTarget({ id, title: session?.title || session?.preview || '' })
  }, [])

  // The server rejects a tools change with ErrBusy while a run is in flight
  // (the registry swap must not land mid-turn), so refuse it here too rather
  // than letting the user stage toggles that cannot be saved.
  const applyTools = useCallback((disabled: string[]) => {
    const chat = chatRef.current
    if (!chat) return
    dispatch({
      type: 'chatNotice',
      sessionId: chat.sessionId,
      text: disabled.length === 0 ? 'All tools enabled.' : `Tools updated globally: ${disabled.length} disabled.`
    })
  }, [])

  const handleCommand = useCallback(async (name: CommandName, argument: string) => {
    const chat = chatRef.current
    if (name === 'help') {
      if (argument) dispatch({ type: 'notice', text: argument })
      setModal('help')
      return
    }
    // Checked before the `!chat` bail: /tools is reachable from the home
    // composer too, where it needs an explanation rather than silence.
    if (name === 'tools') {
      if (!chat) {
        dispatch({ type: 'notice', text: 'Open a chat to change tools.' })
        return
      }
      if (chat.running) {
        dispatch({ type: 'notice', text: 'Stop the active run before changing tools.' })
        return
      }
      setModal('tools')
      return
    }
    if (!chat) return
    if (name === 'clear') { dispatch({ type: 'clearVisible' }); return }
    if (name === 'compact') {
      if (chat.running) dispatch({ type: 'notice', text: 'Stop the active run before compacting context.' })
      else compact()
    }
  }, [compact])

  const renameSession = useCallback((id: string, currentTitle: string) => {
    setRenameTarget({ id, title: currentTitle })
  }, [])

  const saveSessionRename = useCallback(async (title: string) => {
    if (!renameTarget) return
    await api.renameSession(renameTarget.id, title)
    await refreshSessions()
  }, [refreshSessions, renameTarget])

  const archiveSession = useCallback((id: string) => {
    setSessionPreferences((current) => ({ ...current, [id]: { ...current[id], archived: true } }))
    if (chatRef.current?.sessionId === id) dispatch({ type: 'home' })
  }, [])

  const archiveActiveSession = useCallback(() => {
    const id = chatRef.current?.sessionId
    if (id) archiveSession(id)
  }, [archiveSession])

  const restoreSession = useCallback((id: string) => {
    setSessionPreferences((current) => ({ ...current, [id]: { ...current[id], archived: false } }))
  }, [])

  const archivedSessions = useMemo(
    () => state.sessions.filter((session) => sessionPreferences[session.id]?.archived),
    [sessionPreferences, state.sessions]
  )

  const pinSession = useCallback((id: string, pinned: boolean) => {
    setSessionPreferences((current) => ({ ...current, [id]: { ...current[id], pinned } }))
  }, [])

  const pinnedKey = useMemo(
    () =>
      Object.entries(sessionPreferences)
        .filter(([, pref]) => pref.pinned)
        .map(([id]) => id)
        .sort()
        .join(','),
    [sessionPreferences]
  )
  const pinnedSessionIds = useMemo(() => new Set(pinnedKey ? pinnedKey.split(',') : []), [pinnedKey])

  const archivedSessionIds = useMemo(
    () => new Set(archivedSessions.map((session) => session.id)),
    [archivedSessions]
  )

  // Keyed through a string so the Set keeps its identity while chats churn on
  // every streaming event; memoized panes (Sidebar, TabBar) then skip
  // re-rendering for deltas that do not change which sessions are running.
  const runningKey = useMemo(
    () =>
      Object.values(state.chats)
        .filter((c) => c.running)
        .map((c) => c.sessionId)
        .sort()
        .join(','),
    [state.chats]
  )
  const runningIds = useMemo(() => new Set(runningKey ? runningKey.split(',') : []), [runningKey])

  // Background subagents outlive the turn that launched them, so the active
  // session is the only scope that answers "what is this session doing now".
  // subagentTaskList is memoized on chat identity, so this is free per token.
  const subagentTasks = chat ? subagentTaskList(chat) : NO_SUBAGENTS
  const runningSubagents = subagentTasks.reduce((n, t) => (t.state === 'running' ? n + 1 : n), 0)
  // Same string-key trick for the folder list: `chats` churns on every delta,
  // but which folders the tabs point at only changes when a tab moves, so the
  // array handed to useDiffStats keeps its identity mid-stream.
  const tabCwdKey = useMemo(
    () => state.tabOrder.map((id) => state.chats[id]?.cwd).filter((cwd): cwd is string => !!cwd).join('\n'),
    [state.tabOrder, state.chats]
  )
  const tabCwds = useMemo(() => (tabCwdKey ? tabCwdKey.split('\n') : NO_CWDS), [tabCwdKey])
  const diffStats = useDiffStats(tabCwds, preferences.tabDiffCounts, runningKey)
  // Projections handed to memoised children. Each is rebuilt only when its
  // inputs really change, so a streaming delta leaves their identity alone.
  const queuedFollowUpLabels = useMemo(
    () =>
      chat
        ? queuedFollowUps.filter((pending) => pending.sessionId === chat.sessionId).map((pending) => pending.label)
        : NO_LABELS,
    [queuedFollowUps, chat?.sessionId]
  )
  const recentSessions = useMemo(
    () => state.sessions.filter((session) => !archivedSessionIds.has(session.id)).slice(0, 6),
    [state.sessions, archivedSessionIds]
  )

  // The detail's task, resolved live by key. Undefined (tab closed, session
  // switched) falls the panel back to its list rather than a stale snapshot.
  const subagentDetailTask =
    subagentDetail && chat ? subagentTaskIndex(chat).get(subagentDetail.key) : undefined

  // Map each global shortcut id to the callback that should run. Held in a ref
  // so the keydown listener (subscribed once) always calls the latest closures
  // without resubscribing on every state change.
  const shortcutsRef = useRef<Partial<Record<ShortcutId, (() => void) | null>>>({})
  shortcutsRef.current = {
    newTask: goHome,
    toggleSidebar,
    openSettings,
    focusComposer: () => composerFocus.current?.(),
    stop: () => { if (chat?.running) stop() },
    compact: () => { if (chat && !chat.running) compact() },
    modelPicker: () => composerModelPicker.current?.(),
    toggleDebug: () => setDebugOpen((value) => !value),
    toggleGitWindow: () => setGitWindowOpen((value) => !value),
    toggleSubagents: () => { if (chat) toggleSubagents() },
    closeTab: () => { if (chat) dispatch({ type: 'closeTab', sessionId: chat.sessionId }) },
    switchTab1: () => { const id = state.tabOrder[0]; if (id) dispatch({ type: 'focusChat', sessionId: id }) },
    switchTab2: () => { const id = state.tabOrder[1]; if (id) dispatch({ type: 'focusChat', sessionId: id }) },
    switchTab3: () => { const id = state.tabOrder[2]; if (id) dispatch({ type: 'focusChat', sessionId: id }) },
    switchTab4: () => { const id = state.tabOrder[3]; if (id) dispatch({ type: 'focusChat', sessionId: id }) },
    switchTab5: () => { const id = state.tabOrder[4]; if (id) dispatch({ type: 'focusChat', sessionId: id }) },
    switchTab6: () => { const id = state.tabOrder[5]; if (id) dispatch({ type: 'focusChat', sessionId: id }) },
    switchTab7: () => { const id = state.tabOrder[6]; if (id) dispatch({ type: 'focusChat', sessionId: id }) },
    switchTab8: () => { const id = state.tabOrder[7]; if (id) dispatch({ type: 'focusChat', sessionId: id }) },
    switchTab9: () => { const id = state.tabOrder[8]; if (id) dispatch({ type: 'focusChat', sessionId: id }) },
    commands: () => setModal('help')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Pause global shortcuts while a modal dialog is open so its own Esc
      // handling and focus stay predictable.
      if (modalRef.current !== null || renameRef.current !== null) return
      // Esc dismisses the current notice (same as the ✕ on the notice tab).
      if (e.key === 'Escape' && noticeRef.current) {
        dispatch({ type: 'notice', text: null })
        return
      }
      const id = matchShortcut(e)
      if (!id) return
      const handler = shortcutsRef.current[id]
      if (!handler) return
      e.preventDefault()
      handler()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <MotionConfig reducedMotion={preferences.reducedMotion ? 'always' : 'user'}>
    <div className="app-shell flex h-screen w-full overflow-hidden">
      <Sidebar
        sessions={state.sessions}
        projects={projectList}
        activeId={chat?.sessionId ?? null}
        runningIds={runningIds}
        onOpen={openSession}
        onCompose={composeIn}
        onAddProject={addProject}
        onHome={goHome}
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        settingsOpen={view === 'settings'}
        onSettings={toggleSettings}
        archivedSessionIds={archivedSessionIds}
        onRename={renameSession}
        onArchive={archiveSession}
        pinnedSessionIds={pinnedSessionIds}
        onPin={pinSession}
        onRestore={restoreSession}
        sidebarVariant={preferences.sidebarVariant}
        runIndicator={preferences.runIndicator}
        sidebarRunColor={preferences.sidebarRunColor}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* The tab strip rides the window shell, not the chat panel: the panel
            below is its own rounded surface, so the strip reads as chrome
            sitting on top of it rather than as part of the transcript. */}
        <div
          className={cn(
            'drag-region relative flex h-9 shrink-0 items-center gap-2 overflow-visible pl-2',
            // The window controls are fixed over the top-right corner, and the
            // strip now spans the full width whether or not a side panel is
            // open, so it always has to clear them.
            'pr-[140px]'
          )}
          onDoubleClick={(e) => {
            // Tabs, buttons and inputs own their double-clicks — only empty
            // titlebar area toggles maximize, like a native caption.
            if ((e.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"]')) return
            window.myagent.toggleMaximizeWindow().catch(() => {})
          }}
        >
          <span className="flex shrink-0 select-none items-center pl-2">
            <span className="truncate text-ui-caption font-semibold tracking-tight text-foreground">
              {normalizeAppName(preferences.appName)}
            </span>
          </span>
          <TabBar
            tabOrder={state.tabOrder}
            chats={state.chats}
            sessions={state.sessions}
            activeId={state.activeId}
            runningIds={runningIds}
            appName={normalizeAppName(preferences.appName)}
            runIndicator={preferences.runIndicator}
            runIndicatorColor={runIndicatorColorValue(preferences.sidebarRunColor)}
            pinnedIds={pinnedSessionIds}
            diffStats={preferences.tabDiffCounts ? diffStats : undefined}
            onSelect={focusTab}
            onClose={closeTab}
            onNew={goHome}
          />
          {chat && (
            <div className="no-drag ml-auto flex shrink-0 items-center gap-2">
              <div className="h-5 w-px shrink-0 bg-border/60" aria-hidden />
              <OpenWith cwd={chat.cwd} />
            </div>
          )}
          <TopBar
            chat={chat}
            title={topBarTitle}
            onCompact={compact}
            onRename={renameActiveSession}
            onArchive={archiveActiveSession}
            onToggleDebug={toggleDebug}
            debugOpen={debugOpen}
            onToggleGit={toggleGit}
            gitOpen={gitOpen}
            onOpenGitWindow={openGitWindow}
            onToggleSubagents={toggleSubagents}
            subagentsOpen={subagentsOpen}
            runningSubagents={runningSubagents}
            onSettings={toggleSettings}
            settingsOpen={view === 'settings'}
            onHelp={openHelp}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 gap-2 px-2 pb-2">
        <div className="main-panel surface-grain relative flex min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="popLayout">
        <motion.div
          key={chat ? `chat-${chat.sessionId}` : 'home'}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          variants={bloomPanel}
          initial="initial"
          animate="animate"
          exit="exit"
        >
        {chat ? (
          <>
            <ChatErrorBoundary key={chat.sessionId}>
              <Chat key={chat.sessionId} chat={chat} autoScroll={preferences.autoScroll} messageSize={preferences.messageSize} toolActivityDisplay={preferences.toolActivityDisplay} compactSummary={preferences.compactTurnSummary} workingOrb={preferences.workingOrb} onOpenSubagent={openSubagent} />
            </ChatErrorBoundary>
            <div className="shrink-0 px-4 pb-4 pt-2 sm:px-7">
              <Composer
                running={chat.running}
                onSend={send}
                onStop={stop}
                model={chat.model}
                providers={state.providers}
                onModel={changeModel}
                onDiscoverModels={discoverModels}
                effort={chat.effort}
                onSetEffort={setEffort}
                sendOnEnter={preferences.sendOnEnter}
                modelSelectorVariant={preferences.modelSelectorVariant}
                effortSelectorVariant={preferences.effortSelectorVariant}
                queuedFollowUps={queuedFollowUpLabels}
                notice={chat.notice}
                onDismissNotice={dismissChatNotice}
                onCommand={handleCommand}
                contextSessionId={chat.sessionId}
                contextRevision={chat.items.length + chat.lastTokens}
                subagentRunning={preferences.subagentsChip && runningSubagents > 0}
                subagentsOpen={subagentsOpen}
                onToggleSubagents={toggleSubagents}
                cwd={chat.cwd}
                compact={chat.items.length > 0 || chat.streaming != null || chat.running || chat.awaitingStart}
              />
            </div>
            {/* debug-panel: LLM request/retry timeline drawer */}
            <DebugPanel sessionId={chat.sessionId} open={debugOpen} onClose={closeDebug} />
          </>
        ) : (
          <Home
            loading={state.loading || state.conn === 'starting'}
            fatal={state.fatal}
            projects={projectList}
            selected={state.homeCwd}
            appName={normalizeAppName(preferences.appName)}
            onSelect={selectHomeCwd}
            onAddProject={addProject}
            onSend={homeSend}
            onRetry={bootstrap}
            providers={state.providers}
            onDiscoverModels={discoverModels}
            notice={homeNotice}
            onDismissNotice={dismissHomeNotice}
            sendOnEnter={preferences.sendOnEnter}
            modelSelectorVariant={preferences.modelSelectorVariant}
            effortSelectorVariant={preferences.effortSelectorVariant}
            onCommand={handleCommand}
            recentSessions={recentSessions}
            onOpenSession={openSession}
            onSettings={toggleSettings}
          />
        )}
        </motion.div>
        </AnimatePresence>

        <StatusBar
          conn={state.conn}
          detail={state.connDetail}
          version={state.serverVersion}
          chat={chat}
        />
        </div>

        {/* One shared column: with both panels open they stack (Git over
            Subagents) instead of sitting side by side, so the pair costs the
            transcript 320px rather than 640px. */}
        <AnimatePresence initial={false}>
          {(gitOpen || subagentsOpen) && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="shrink-0 overflow-hidden rounded-xl border border-border/60 bg-card/40"
            >
              <div className="flex h-full w-[320px] flex-col">
                {/* No title-bar spacer: the window controls live over the tab
                    strip above this panel, never over the panel itself. */}
                {gitOpen && (
                  <div className={cn('min-h-0', subagentsOpen ? 'flex-[3]' : 'flex-1')}>
                    {/* Keyed on cwd so switching to a different project remounts
                        the panel: fresh status, fresh poll timer, and no chance of
                        the previous repo's in-flight reply landing here. */}
                    <Suspense fallback={<PanelFallback />}>
                      <GitPanel
                        key={chat?.cwd ?? 'none'}
                        cwd={chat?.cwd ?? null}
                        onClose={closeGit}
                        onExpand={openGitWindow}
                      />
                    </Suspense>
                  </div>
                )}
                {subagentsOpen && (
                  <div
                    className={cn(
                      'min-h-0 flex-[2]',
                      // Two panels sharing one card: the rule separates them
                      // inside the surface, so it stays a hairline divider.
                      gitOpen && 'border-t border-border/60'
                    )}
                  >
                    {/* Keyed on the session so switching tabs remounts and drops
                        the previous expansion state. */}
                    <SubagentPanel
                      key={chat?.sessionId ?? 'none'}
                      tasks={subagentTasks}
                      onClose={closeSubagents}
                      onOpen={openSubagent}
                      detailTask={subagentDetailTask}
                      detailLaunchError={subagentDetail?.launchError}
                      onBack={closeSubagentDetail}
                      onShowInConversation={showSubagentInConversation}
                    />
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
        </div>
        </div>
      </main>
      {/* The window controls move into the source-control window while it is
          open, so exactly one set exists and it stays above whatever is on top. */}
      {!gitWindowOpen && <WindowControls />}
      <AnimatePresence>
        {gitWindowOpen && (
          <Suspense fallback={<ScreenFallback />}>
            <GitWindow
              key="git-window"
              projects={projectList}
              initialCwd={chat?.cwd ?? state.homeCwd ?? null}
              onClose={closeGitWindow}
            />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {view === 'settings' && (
          <Suspense fallback={<ScreenFallback />}>
          <Settings
            key="settings-modal"
            preferences={preferences}
            onChange={(patch) => setPreferences((current) => ({ ...current, ...patch }))}
            conn={state.conn}
            detail={state.connDetail}
            serverVersion={state.serverVersion}
            onReconnect={bootstrap}
            archivedSessions={archivedSessions}
            onOpenArchived={openSession}
            onRestore={restoreSession}
            providers={state.providers}
            onSaveProvider={async (input) => { const providers = await api.saveProvider(input); dispatch({ type: 'providers', providers }) }}
            onDeleteProvider={async (name) => { const providers = await api.deleteProvider(name); dispatch({ type: 'providers', providers }) }}
            onDefaultProvider={async (name, model) => { const providers = await api.setDefaultProvider(name, model); dispatch({ type: 'providers', providers }) }}
            onDiscoverProvider={async (name, apiKey) => { const models = await api.discoverProviderModels(name, apiKey); const providers = await api.providers(); dispatch({ type: 'providers', providers }); return models }}
            onClose={closeSettings}
          />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {modal === 'help' && (
          <Suspense fallback={null}>
            <CommandModal key="help" onClose={closeModal} />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {modal === 'tools' && chat && (
          <Suspense fallback={null}>
            <ToolsModal key="tools" sessionId={chat.sessionId} onClose={closeModal} onSaved={applyTools} />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {renameTarget && (
          <Suspense fallback={null}>
            <RenameSessionModal key="rename" initialTitle={renameTarget.title} onClose={() => setRenameTarget(null)} onSave={saveSessionRename} />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}
