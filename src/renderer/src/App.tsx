import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { bloomPanel } from './motion'
import { api, ApiError } from './api'
import { activeChat, contentMatches, contentText, initialState, loadHistory, newChat, reducer } from './state'
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
import Settings from './components/Settings'
import WindowControls from './components/WindowControls'
import TabBar from './components/TabBar'
import OpenWith from './components/OpenWith'
import GitPanel from './components/GitPanel'
import SubagentPanel from './components/SubagentPanel'
import { BrainCircuit, ChevronRight } from './components/ui/icons'
import { useDiffStats } from './hooks/use-diff-stats'
import { subagentTaskIndex, subagentTaskList, revealSubagentInTranscript, type SubagentTask } from './subagents'
import { applyTheme, applyFontSize, loadPreferences, normalizeAppName, normalizeTransparency, runIndicatorColorValue, savePreferences, type Preferences } from './preferences'
import { loadSessionPreferences, saveSessionPreferences, type SessionPreferences } from './sessionPreferences'
// debug-panel: see debug-panel/README.md for what this is and how to remove it
import DebugPanel from './debug-panel/DebugPanel'
import type { CommandName } from './commands'
import CommandModal from './components/CommandModal'
import RenameSessionModal from './components/RenameSessionModal'
import ToolsModal from './components/ToolsModal'
import SubagentModal from './components/SubagentModal'
import { matchShortcut, composerFocus, composerModelPicker, type ShortcutId } from './shortcuts'
import type { ContentBlock, ReasoningEffort } from '../../shared/protocol'

const NO_SUBAGENTS: SubagentTask[] = []

export default function App(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [view, setView] = useState<'content' | 'settings'>('content')
  // debug-panel: drawer open/closed state
  const [debugOpen, setDebugOpen] = useState(false)
  const [gitOpen, setGitOpen] = useState(false)
  const [subagentsOpen, setSubagentsOpen] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [queuedFollowUps, setQueuedFollowUps] = useState<{ id: string; sessionId: string; content: ContentBlock[]; label: string }[]>([])
  const [homeNotice, setHomeNotice] = useState<string | null>(null)
  const [sessionPreferences, setSessionPreferences] = useState<SessionPreferences>(loadSessionPreferences)
  const [modal, setModal] = useState<'help' | 'tools' | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  // The open subagent detail modal, by task key. Resolved against the live
  // index on every render (not stored as an object) so a modal left open on a
  // running child fills in when its report lands. launchError rides along
  // because only the transcript card holds the tool run that produced it.
  const [subagentModal, setSubagentModal] = useState<{ key: string; launchError?: string } | null>(null)
  const chat = activeChat(state)
  const activeSession = useRef<string | null>(null)
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
    const off = api.onPush((push) => {
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
  const toggleSubagents = useCallback(() => {
    startChromeAnimation(200)
    setSubagentsOpen((value) => !value)
  }, [])
  // Clicking any subagent row (transcript card, completion notice, side-panel
  // row) opens the detail modal. Stored by key so the modal always reads the
  // latest task object — including a report that lands while it is open.
  const openSubagent = useCallback((task: SubagentTask, launchError?: string) => {
    setSubagentModal({ key: task.key, launchError })
  }, [])
  const showSubagentInConversation = useCallback((task: SubagentTask) => {
    setSubagentModal(null)
    // Let the modal's exit fade out before the transcript jumps underneath it.
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
    [chat]
  )

  const stop = useCallback(() => {
    if (chat) api.abort(chat.sessionId).catch(() => {})
  }, [chat])

  const compact = useCallback(() => {
    if (!chat) return
    api.compact(chat.sessionId).catch((err) => {
      dispatch({ type: 'notice', text: err instanceof Error ? err.message : String(err) })
    })
  }, [chat])

  const changeModel = useCallback(
    async (provider: string, model: string) => {
      if (!chat) return
      try {
        const result = await api.setModel(chat.sessionId, provider, model)
        dispatch({ type: 'model', model: `${provider}/${model}` })
        dispatch({ type: 'effort', sessionId: chat.sessionId, effort: result.effort })
      } catch (err) {
        dispatch({ type: 'notice', text: err instanceof Error ? err.message : String(err) })
      }
    },
    [chat]
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
    [chat]
  )

  // The server rejects a tools change with ErrBusy while a run is in flight
  // (the registry swap must not land mid-turn), so refuse it here too rather
  // than letting the user stage toggles that cannot be saved.
  const applyTools = useCallback((disabled: string[]) => {
    if (!chat) return
    dispatch({
      type: 'chatNotice',
      sessionId: chat.sessionId,
      text: disabled.length === 0 ? 'All tools enabled.' : `Tools updated globally: ${disabled.length} disabled.`
    })
  }, [chat])

  const handleCommand = useCallback(async (name: CommandName, argument: string) => {
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
  }, [compact, chat])

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
    if (chat?.sessionId === id) dispatch({ type: 'home' })
  }, [chat?.sessionId])

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
  const tabCwds = useMemo(
    () => state.tabOrder.map((id) => state.chats[id]?.cwd).filter((cwd): cwd is string => !!cwd),
    [state.tabOrder, state.chats]
  )
  const diffStats = useDiffStats(tabCwds, preferences.tabDiffCounts, runningKey)
  // The modal's task, resolved live by key. A null here (tab closed, session
  // switched) unmounts the modal rather than showing a stale snapshot.
  const subagentModalTask = subagentModal && chat ? subagentTaskIndex(chat).get(subagentModal.key) : undefined

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
      <main className="main-panel surface-grain relative flex min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className={cn(
            'drag-region relative flex h-9 shrink-0 items-center gap-2 overflow-visible pl-2 transition-[padding] duration-[160ms] ease-[var(--ease-smooth-out)]',
            // With a side panel open the window controls sit over that panel's
            // title strip, so the top bar no longer has to clear them.
            gitOpen || subagentsOpen ? 'pr-2' : 'pr-[140px]'
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
            onSelect={(id) => dispatch({ type: 'focusChat', sessionId: id })}
            onClose={(id) => dispatch({ type: 'closeTab', sessionId: id })}
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
            title={chat ? (() => { const s = state.sessions.find((s) => s.id === chat.sessionId); return s?.title || s?.preview })() : undefined}
            onCompact={compact}
            onRename={() => {
              if (!chat) return
              const s = state.sessions.find((s) => s.id === chat.sessionId)
              renameSession(chat.sessionId, s?.title || s?.preview || '')
            }}
            onArchive={() => { if (chat) archiveSession(chat.sessionId) }}
            onToggleDebug={() => setDebugOpen((v) => !v)}
            debugOpen={debugOpen}
            onToggleGit={toggleGit}
            gitOpen={gitOpen}
            onToggleSubagents={toggleSubagents}
            subagentsOpen={subagentsOpen}
            runningSubagents={runningSubagents}
            onSettings={toggleSettings}
            settingsOpen={view === 'settings'}
            onHelp={() => setModal('help')}
          />
        </div>
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
              {preferences.subagentsChip && subagentTasks.length > 0 && (
                <div className="mx-auto w-full max-w-3xl px-1">
                <button
                  type="button"
                  onClick={toggleSubagents}
                  aria-expanded={subagentsOpen}
                  className="mb-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-ui-sm text-foreground-subtle outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <BrainCircuit size={13} strokeWidth={1.7} className="shrink-0" />
                  <span>Subagents</span>
                  <span className="text-ui-xs tabular-nums text-foreground-subtlest">{subagentTasks.length}</span>
                  {runningSubagents > 0 && <span className="sr-only">{runningSubagents} running</span>}
                  <ChevronRight size={12} className="shrink-0" />
                </button>
                </div>
              )}
              <Composer
                running={chat.running}
                onSend={send}
                onStop={stop}
                model={chat.model}
                providers={state.providers}
                onModel={changeModel}
                onDiscoverModels={discoverModels}
                effort={chat.effort}
                onSetEffort={(effort) => void changeEffort(effort)}
                sendOnEnter={preferences.sendOnEnter}
                modelSelectorVariant={preferences.modelSelectorVariant}
                effortSelectorVariant={preferences.effortSelectorVariant}
                queuedFollowUps={queuedFollowUps.filter((pending) => pending.sessionId === chat.sessionId).map((pending) => pending.label)}
                notice={chat.notice}
                onDismissNotice={() => dispatch({ type: 'notice', text: null })}
                onCommand={handleCommand}
                compact={chat.items.length > 0 || chat.streaming != null || chat.running || chat.awaitingStart}
              />
            </div>
            {/* debug-panel: LLM request/retry timeline drawer */}
            <DebugPanel sessionId={chat.sessionId} open={debugOpen} onClose={() => setDebugOpen(false)} />
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
            onDismissNotice={() => setHomeNotice(null)}
            sendOnEnter={preferences.sendOnEnter}
            modelSelectorVariant={preferences.modelSelectorVariant}
            effortSelectorVariant={preferences.effortSelectorVariant}
            onCommand={handleCommand}
            recentSessions={state.sessions.filter((s) => !archivedSessionIds.has(s.id)).slice(0, 6)}
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

        <AnimatePresence initial={false}>
          {gitOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="shrink-0 overflow-hidden border-l border-border/60 bg-card/40"
            >
              <div className="flex h-full w-[320px] flex-col">
                {/* The window controls are fixed over the top-right corner, so
                    the panel starts below the title-bar strip or its header
                    buttons would sit under them and swallow the clicks. */}
                <div className="drag-region h-9 shrink-0" />
                <div className="min-h-0 flex-1">
                  {/* Keyed on cwd so switching to a different project remounts
                      the panel: fresh status, fresh poll timer, and no chance of
                      the previous repo's in-flight reply landing here. */}
                  <GitPanel
                    key={chat?.cwd ?? 'none'}
                    cwd={chat?.cwd ?? null}
                    onClose={() => setGitOpen(false)}
                  />
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {subagentsOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="shrink-0 overflow-hidden border-l border-border/60 bg-card/40"
            >
              <div className="flex h-full w-[320px] flex-col">
                {/* Same reason as the git panel above: the window controls are
                    fixed over the top-right corner. */}
                <div className="drag-region h-9 shrink-0" />
                <div className="min-h-0 flex-1">
                  {/* Keyed on the session so switching tabs remounts and drops
                      the previous expansion state. */}
                  <SubagentPanel
                    key={chat?.sessionId ?? 'none'}
                    tasks={subagentTasks}
                    onClose={() => setSubagentsOpen(false)}
                    onOpen={openSubagent}
                  />
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
      <WindowControls />
      <AnimatePresence>
        {view === 'settings' && (
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
            onClose={() => setView('content')}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {modal === 'help' && <CommandModal key="help" onClose={() => setModal(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {modal === 'tools' && chat && (
          <ToolsModal key="tools" sessionId={chat.sessionId} onClose={() => setModal(null)} onSaved={applyTools} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {renameTarget && <RenameSessionModal key="rename" initialTitle={renameTarget.title} onClose={() => setRenameTarget(null)} onSave={saveSessionRename} />}
      </AnimatePresence>
      <AnimatePresence>
        {subagentModalTask && (
          <SubagentModal
            key={subagentModalTask.key}
            task={subagentModalTask}
            launchError={subagentModal?.launchError}
            onClose={() => setSubagentModal(null)}
            onShowInConversation={showSubagentInConversation}
          />
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}
