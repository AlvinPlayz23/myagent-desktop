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
    git: new Proxy({}, { get: () => async () => ({ ok: false, error: { code: 1, message: 'mock' } }) }),
  }
})()
