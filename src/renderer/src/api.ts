import type {
  ContentBlock,
  Message,
  MyagentApi,
  ProviderInput,
  ProvidersInfo,
  RpcError,
  SessionInfo,
  ReasoningEffort,
  SessionMeta,
  SessionTool,
  SessionTools,
  ServerPush
} from '../../shared/protocol'

declare global {
  interface Window {
    myagent: MyagentApi
  }
}

export class ApiError extends Error {
  code: number
  constructor(err: RpcError) {
    super(err.message)
    this.code = err.code
  }
}

async function call<T>(method: string, params?: unknown): Promise<T> {
  const res = await window.myagent.rpc<T>(method, params)
  if (!res.ok) throw new ApiError(res.error)
  return res.result
}

export const api = {
  connect: async (): Promise<{ name: string; version: string }> => {
    const res = await window.myagent.connect()
    if (!res.ok) throw new ApiError(res.error)
    return res.result
  },
  providers: (): Promise<ProvidersInfo> => call('provider.list'),
  pickFolder: (): Promise<string | null> => window.myagent.pickFolder(),
  openWith: (target: 'explorer' | 'vscode', dir: string): Promise<boolean> => window.myagent.openWith(target, dir),
  onPush: (cb: (push: ServerPush) => void): (() => void) => window.myagent.onPush(cb),

  createSession: (cwd?: string, provider?: string, model?: string, effort?: ReasoningEffort): Promise<SessionInfo> =>
    call('session.create', { cwd, provider, model, effort }),
  resumeSession: (sessionId: string): Promise<SessionInfo & { messages: Message[] }> =>
    call('session.resume', { sessionId }),
  listSessions: async (): Promise<SessionMeta[]> => {
    const r = await call<{ sessions: SessionMeta[] }>('session.list')
    return r.sessions ?? []
  },
  prompt: (sessionId: string, content: ContentBlock[]): Promise<void> =>
    call('session.prompt', { sessionId, content }),
  steer: (sessionId: string, content: ContentBlock[]): Promise<void> =>
    call('session.steer', { sessionId, content }),
  followUp: (sessionId: string, content: ContentBlock[]): Promise<void> =>
    call('session.followUp', { sessionId, content }),
  abort: (sessionId: string): Promise<void> => call('session.abort', { sessionId }),
  compact: (sessionId: string): Promise<void> => call('session.compact', { sessionId }),
  sessionTools: async (sessionId: string): Promise<SessionTools> => {
    const result = await call<{ tools?: SessionTool[]; disabled?: string[]; running?: boolean }>(
      'session.tools',
      { sessionId }
    )
    return { tools: result.tools ?? [], disabled: result.disabled ?? [], running: result.running ?? false }
  },
  /**
   * Applies a deny list to the session and persists it globally to config.json,
   * so it also becomes the default for sessions created later. Rejected with
   * code -32001 (busy) while a run is in flight.
   *
   * `disabled` is normalized to [] because the Go handler's nil slice would
   * otherwise surface as null.
   */
  setTools: (sessionId: string, disabled: string[]): Promise<{ disabled: string[] }> =>
    call<{ disabled?: string[] }>('session.setTools', { sessionId, disabled }).then((result) => ({
      disabled: result.disabled ?? []
    })),
  setModel: (sessionId: string, provider: string, model: string): Promise<{ effort: ReasoningEffort }> =>
    call<{ effort?: ReasoningEffort }>('session.setModel', { sessionId, provider, model }).then((result) => ({ effort: result.effort ?? '' })),
  setEffort: (sessionId: string, effort: ReasoningEffort): Promise<{ effort: ReasoningEffort }> =>
    call<{ effort?: ReasoningEffort }>('session.setEffort', { sessionId, effort }).then((result) => ({ effort: result.effort ?? '' })),
  renameSession: (sessionId: string, title: string): Promise<{ title: string }> =>
    call('session.rename', { sessionId, title }),
  closeSession: (sessionId: string): Promise<void> => call('session.close', { sessionId }),
  saveProvider: (provider: ProviderInput): Promise<ProvidersInfo> => call('provider.save', provider),
  deleteProvider: (name: string): Promise<ProvidersInfo> => call('provider.delete', { name }),
  setDefaultProvider: (name: string, model: string): Promise<ProvidersInfo> => call('provider.setDefault', { name, model }),
  discoverProviderModels: (name: string, apiKey = ''): Promise<string[]> =>
    call<{ models: string[] }>('provider.discover', { name, apiKey }).then((result) => result.models ?? [])
}
