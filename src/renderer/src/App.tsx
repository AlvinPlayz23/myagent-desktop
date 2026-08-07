import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { bloomPanel } from './motion'
import { api, ApiError } from './api'
import { activeChat, contentMatches, contentText, initialState, loadHistory, newChat, reducer } from './state'
import { baseName } from './util'
import Sidebar from './components/Sidebar'
import Chat from './components/Chat'
import Composer from './components/Composer'
import StatusBar from './components/StatusBar'
import Home from './components/Home'
import ChatHeader from './components/ChatHeader'
import Settings from './components/Settings'
import WindowControls from './components/WindowControls'
import { applyTheme, loadPreferences, normalizeAppName, normalizeTransparency, savePreferences, type Preferences } from './preferences'
import { loadSessionPreferences, saveSessionPreferences, type SessionPreferences } from './sessionPreferences'
// debug-panel: see debug-panel/README.md for what this is and how to remove it
import DebugPanel from './debug-panel/DebugPanel'
import type { CommandName } from './commands'
import CommandModal from './components/CommandModal'
import RenameSessionModal from './components/RenameSessionModal'
import { matchShortcut, composerFocus, composerModelPicker, type ShortcutId } from './shortcuts'
import type { ContentBlock, ReasoningEffort } from '../../shared/protocol'

export default function App(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [view, setView] = useState<'content' | 'settings'>('content')
  // debug-panel: drawer open/closed state
  const [debugOpen, setDebugOpen] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [queuedFollowUps, setQueuedFollowUps] = useState<{ id: string; sessionId: string; content: ContentBlock[]; label: string }[]>([])
  const [homeNotice, setHomeNotice] = useState<string | null>(null)
  const [sessionPreferences, setSessionPreferences] = useState<SessionPreferences>(loadSessionPreferences)
  const [modal, setModal] = useState<'help' | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
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
    applyTheme(preferences.theme)
    savePreferences(preferences)
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      if (preferences.theme === 'system') applyTheme('system')
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
    const opacity = 0.94 - transparency / 100 * 0.56
    document.documentElement.style.setProperty('--shell-opacity', opacity.toFixed(3))
    // Windows 10 needs a native DWM call for actual desktop blur. Other hosts
    // ignore this renderer-to-main update and keep their native material.
    void window.myagent.setTransparency(transparency)
  }, [preferences.transparency])

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
    return window.myagent.onWindowMaximized(setMaximized)
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
          dispatch({ type: 'event', sessionId: push.sessionId, event: push.event })
          break
        case 'done':
          setQueuedFollowUps((current) => current.filter((pending) => pending.sessionId !== push.sessionId))
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

  const handleCommand = useCallback(async (name: CommandName, argument: string) => {
    if (name === 'help') {
      if (argument) dispatch({ type: 'notice', text: argument })
      setModal('help')
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

  const runningIds = useMemo(
    () => new Set(Object.values(state.chats).filter((c) => c.running).map((c) => c.sessionId)),
    [state.chats]
  )

  // Map each global shortcut id to the callback that should run. Held in a ref
  // so the keydown listener (subscribed once) always calls the latest closures
  // without resubscribing on every state change.
  const shortcutsRef = useRef<Partial<Record<ShortcutId, (() => void) | null>>>({})
  shortcutsRef.current = {
    newTask: goHome,
    toggleSidebar: () => setSidebarCollapsed((value) => !value),
    openSettings: () => setView('settings'),
    focusComposer: () => composerFocus.current?.(),
    stop: () => { if (chat?.running) stop() },
    compact: () => { if (chat && !chat.running) compact() },
    modelPicker: () => composerModelPicker.current?.(),
    toggleDebug: () => setDebugOpen((value) => !value),
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
      {/* Titlebar strip: shell-owned and full width, so it reads as one band
          across the sidebar and the inset panel below it. Safe to span the
          sidebar because the sidebar's own top 36px is an empty spacer.

          The app title lives here rather than inside the sidebar so that
          collapsing the sidebar leaves it untouched — it is a property of the
          window, not of a panel that comes and goes. */}
      <div className="drag-region fixed inset-x-0 top-0 z-[5] flex h-9 items-center pl-3.5">
        <span className="select-none truncate text-[12.5px] font-semibold tracking-tight text-foreground">
          {normalizeAppName(preferences.appName)}
        </span>
      </div>
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
        onToggle={() => setSidebarCollapsed((value) => !value)}
        settingsOpen={view === 'settings'}
        onSettings={() => setView((v) => (v === 'settings' ? 'content' : 'settings'))}
        archivedSessionIds={new Set(archivedSessions.map((session) => session.id))}
        onRename={renameSession}
        onArchive={archiveSession}
      />
      <main className="main-panel surface-grain relative mt-9 flex min-w-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait">
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
            <ChatHeader
              chat={chat}
              title={(() => { const s = state.sessions.find((s) => s.id === chat.sessionId); return s?.title || s?.preview })()}
              onCompact={compact}
              onRename={() => {
                const s = state.sessions.find((s) => s.id === chat.sessionId)
                renameSession(chat.sessionId, s?.title || s?.preview || '')
              }}
              onArchive={() => archiveSession(chat.sessionId)}
              onToggleDebug={() => setDebugOpen((v) => !v)}
              debugOpen={debugOpen}
            />
            <Chat key={chat.sessionId} chat={chat} autoScroll={preferences.autoScroll} messageSize={preferences.messageSize} toolActivityDisplay={preferences.toolActivityDisplay} />
            <div className="shrink-0 px-4 pb-4 pt-2 sm:px-7">
              <Composer
                running={chat.running}
                onSend={send}
                onStop={stop}
                model={chat.model}
                providers={state.providers}
                onModel={changeModel}
                effort={chat.effort}
                onSetEffort={(effort) => void changeEffort(effort)}
                sendOnEnter={preferences.sendOnEnter}
                queuedFollowUps={queuedFollowUps.filter((pending) => pending.sessionId === chat.sessionId).map((pending) => pending.label)}
                notice={chat.notice}
                onDismissNotice={() => dispatch({ type: 'notice', text: null })}
                onCommand={handleCommand}
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
            onSelect={selectHomeCwd}
            onAddProject={addProject}
            onSend={homeSend}
            onRetry={bootstrap}
            providers={state.providers}
            notice={homeNotice}
            onDismissNotice={() => setHomeNotice(null)}
            sendOnEnter={preferences.sendOnEnter}
            onCommand={handleCommand}
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
        {renameTarget && <RenameSessionModal key="rename" initialTitle={renameTarget.title} onClose={() => setRenameTarget(null)} onSave={saveSessionRename} />}
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}
