import type {
  Message,
  MyagentApi,
  ProviderInput,
  ProvidersInfo,
  RpcError,
  SessionInfo,
  SessionMeta,
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
  onPush: (cb: (push: ServerPush) => void): (() => void) => window.myagent.onPush(cb),

  createSession: (cwd?: string, provider?: string, model?: string): Promise<SessionInfo> =>
    call('session.create', { cwd, provider, model }),
  resumeSession: (sessionId: string): Promise<SessionInfo & { messages: Message[] }> =>
    call('session.resume', { sessionId }),
  listSessions: async (): Promise<SessionMeta[]> => {
    const r = await call<{ sessions: SessionMeta[] }>('session.list')
    return r.sessions ?? []
  },
  prompt: (sessionId: string, message: string): Promise<void> =>
    call('session.prompt', { sessionId, message }),
  steer: (sessionId: string, message: string): Promise<void> =>
    call('session.steer', { sessionId, message }),
  followUp: (sessionId: string, message: string): Promise<void> =>
    call('session.followUp', { sessionId, message }),
  abort: (sessionId: string): Promise<void> => call('session.abort', { sessionId }),
  compact: (sessionId: string): Promise<void> => call('session.compact', { sessionId }),
  setModel: (sessionId: string, provider: string, model: string): Promise<void> =>
    call('session.setModel', { sessionId, provider, model }),
  closeSession: (sessionId: string): Promise<void> => call('session.close', { sessionId }),
  saveProvider: (provider: ProviderInput): Promise<ProvidersInfo> => call('provider.save', provider),
  deleteProvider: (name: string): Promise<ProvidersInfo> => call('provider.delete', { name }),
  setDefaultProvider: (name: string, model: string): Promise<ProvidersInfo> => call('provider.setDefault', { name, model }),
  discoverProviderModels: (name: string, apiKey = ''): Promise<string[]> =>
    call<{ models: string[] }>('provider.discover', { name, apiKey }).then((result) => result.models ?? [])
}
