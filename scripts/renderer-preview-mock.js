// Browser stand-in for the Electron preload bridge (window.myagent), used only
// by scripts/renderer-preview.vite.config.mts so the renderer can run without
// Electron or a backend. Sending a prompt marks that session as running.
(() => {
  const listeners = new Set()
  const emit = (push) => listeners.forEach((cb) => cb(push))
  const now = Date.now()
  const mk = (id, cwd, title, preview, n, ago) => ({ id, path: '/x/' + id, cwd, created: new Date(now - ago - 3600e3).toISOString(), modified: new Date(now - ago).toISOString(), messageCount: n, preview, title })
  const sessions = [
    mk('s1', '/home/dev/myagent-desktop', 'Rework session tabs', 'Rework session tabs', 14, 60e3),
    mk('s2', '/home/dev/myagent-desktop', 'Fix streaming coalescer', '', 22, 3600e3),
    mk('s3', '/home/dev/api-gateway', 'Add rate limiter middleware', '', 9, 7200e3),
    mk('s4', '/home/dev/api-gateway', 'Why is the build failing on CI?', '', 31, 86400e3),
    mk('s5', '/home/dev/docs-site', 'Migrate docs to MDX', '', 5, 2*86400e3),
    mk('s6', '/home/dev/docs-site', 'Write onboarding guide', '', 12, 3*86400e3),
    mk('s7', '/home/dev/docs-site', 'Search index regeneration script', '', 7, 4*86400e3),
    mk('s8', '/home/dev/api-gateway', 'Profile slow endpoint', '', 18, 5*86400e3),
    mk('s9', '/home/dev/api-gateway', 'Refactor auth tokens', '', 11, 6*86400e3),
  ]
  const usage = { input: 1200, output: 340, cacheRead: 0, cacheWrite: 0, totalTokens: 1540, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.012 } }
  const msgs = () => [
    { role: 'user', timestamp: now - 600e3, content: [{ type: 'text', text: 'The session tabs feel cramped. Can you rework them so running sessions are obvious and long titles truncate cleanly?' }] },
    { role: 'assistant', timestamp: now - 590e3, model: 'claude-opus-4-7', provider: 'anthropic', usage, stopReason: 'toolUse', content: [
      { type: 'thinking', thinking: 'Look at TabBar first, then the tokens.' },
      { type: 'text', text: 'I will start by reading the tab strip and the shared tokens.' },
      { type: 'toolCall', id: 't1', name: 'read', arguments: { path: 'src/renderer/src/components/TabBar.tsx' } },
      { type: 'toolCall', id: 't2', name: 'bash', arguments: { command: 'npm run typecheck' } } ] },
    { role: 'toolResult', timestamp: now - 580e3, toolCallId: 't1', toolName: 'read', content: [{ type: 'text', text: 'export function TabBar() {}' }] },
    { role: 'toolResult', timestamp: now - 570e3, toolCallId: 't2', toolName: 'bash', content: [{ type: 'text', text: 'ok' }] },
    { role: 'assistant', timestamp: now - 560e3, model: 'claude-opus-4-7', provider: 'anthropic', usage, stopReason: 'stop', content: [
      { type: 'text', text: "Here's the plan:\n\n## Tab strip\n\n- Running sessions get a live indicator\n- Titles truncate with a fade\n- Close on middle click\n\n```ts\nconst tab = { id: 's1', running: true }\n```\n\nRun `npm run typecheck` when done." } ] },
  ]
  const providers = { defaultModel: 'anthropic/claude-opus-4-7', providers: [
    { name: 'anthropic', models: ['claude-opus-4-7', 'claude-sonnet-4-5'], source: 'auth', hasApiKey: true, origin: 'builtin' },
    { name: 'openai', models: ['gpt-5.5', 'gpt-5-mini'], source: 'auth', hasApiKey: true, origin: 'builtin' } ], available: [] }
  const ok = (result) => ({ ok: true, result })
  window.myagent = {
    connect: async () => ok({ name: 'myagent', version: '0.4.2' }),
    rpc: async (m, p) => {
      if (m === 'provider.list') return ok(providers)
      if (m === 'session.list') return ok({ sessions })
      if (m === 'session.resume') { const s = sessions.find(s => s.id === p.sessionId); return ok({ sessionId: s.id, model: 'anthropic/claude-opus-4-7', cwd: s.cwd, effort: 'medium', messages: msgs() }) }
      if (m === 'session.create') return ok({ sessionId: 'new' + Math.random(), model: 'anthropic/claude-opus-4-7', cwd: p.cwd || '/home/dev/x', effort: 'medium' })
      if (m === 'session.prompt') { setTimeout(() => emit({ kind: 'event', sessionId: p.sessionId, event: { type: 'agent_start' } }), 100) }
      return ok({})
    },
    pickFolder: async () => null, setTheme: async () => {}, setTransparency: async () => {}, backdrop: async () => 'none',
    minimizeWindow: async () => {}, toggleMaximizeWindow: async () => false, closeWindow: async () => {}, windowMaximized: async () => false,
    openWith: async () => true, onWindowMaximized: () => () => {}, onPush: (cb) => { listeners.add(cb); setTimeout(() => cb({ kind: 'hello', name: 'myagent', version: '0.4.2', protocol: 1 }), 50); setTimeout(() => cb({ kind: 'status', state: 'connected' }), 60); return () => listeners.delete(cb) },
    git: (() => {
      const patch = [
        'diff --git a/src/renderer/src/components/TabBar.tsx b/src/renderer/src/components/TabBar.tsx',
        'index 3f2a1b0..9c4d7e2 100644',
        '--- a/src/renderer/src/components/TabBar.tsx',
        '+++ b/src/renderer/src/components/TabBar.tsx',
        '@@ -12,7 +12,9 @@ export function TabBar({ tabs, activeId }: Props) {',
        '   const visible = useVisibleTabs(tabs, width)',
        '-  const overflow = tabs.length - visible.length',
        '+  const overflow = Math.max(0, tabs.length - visible.length)',
        '+  const hasOverflow = overflow > 0 // keep the menu out of the tab order when empty',
        '   return (',
        '     <div role="tablist" className="flex items-center gap-0.5">',
        '-      {visible.map((tab) => <Tab key={tab.id} {...tab} />)}',
        '+      {visible.map((tab) => <Tab key={tab.id} {...tab} active={tab.id === activeId} />)}',
        '     </div>',
        ''
      ].join('\n')
      const files = [
        { path: 'src/renderer/src/components/TabBar.tsx', status: 'modified', staged: true, insertions: 12, deletions: 3 },
        { path: 'src/renderer/src/components/Sidebar.tsx', status: 'modified', staged: true, partial: true, insertions: 48, deletions: 31 },
        { path: 'src/renderer/src/components/a-very-long-component-file-name-that-keeps-going.tsx', status: 'added', staged: false, insertions: 220, deletions: 0 },
        { path: 'scripts/old-build.mjs', status: 'deleted', staged: false, insertions: 0, deletions: 64 },
        { path: 'notes.md', status: 'untracked', staged: false, insertions: 0, deletions: 0 }
      ]
      const res = (result) => async () => ({ ok: true, result })
      return {
        status: res({ isRepo: true, branch: 'feature/redesign-the-session-tabs-and-sidebar', upstream: 'origin/main', ahead: 2, behind: 1, files, insertions: 280, deletions: 98 }),
        diff: res(patch),
        branches: res([{ name: 'main', upstream: null, current: false, modified: '' }, { name: 'feature/redesign-the-session-tabs-and-sidebar', upstream: null, current: true, modified: '' }]),
        log: res([{ hash: 'a'.repeat(40), shortHash: 'aaaaaaa', author: 'dev', date: new Date().toISOString(), subject: 'Rework tabs' }]),
        stage: res(undefined), unstage: res(undefined), discard: res(undefined), commit: res('ok'), push: res('ok'), pull: res('ok'), fetch: res('ok'), checkout: res(undefined), createBranch: res(undefined), init: res(undefined)
      }
    })(),
  }
})()
