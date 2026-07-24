import WebSocket from 'ws'
import type { RpcError } from '../shared/protocol'

interface Pending {
  resolve(value: unknown): void
  reject(err: RpcError): void
}

export interface RpcNotification {
  method: string
  params: unknown
}

// JSON-RPC 2.0 over one WebSocket. The myagent server rejects any connection
// carrying an Origin header, which is why this client lives in the main
// process (Node's ws sends none) instead of the renderer.
export class RpcClient {
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()

  onNotification: (n: RpcNotification) => void = () => {}
  onClose: (reason: string) => void = () => {}

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { maxPayload: 64 * 1024 * 1024 })
      let opened = false
      ws.on('open', () => {
        opened = true
        this.ws = ws
        resolve()
      })
      ws.on('message', (data) => this.handleMessage(data.toString()))
      ws.on('error', (err) => {
        if (!opened) reject(err)
      })
      ws.on('close', (code, reason) => {
        this.ws = null
        const detail = reason?.toString() || `code ${code}`
        for (const p of this.pending.values()) {
          p.reject({ code: -32000, message: `connection closed (${detail})` })
        }
        this.pending.clear()
        if (opened) this.onClose(detail)
      })
    })
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws) {
        reject({ code: -32000, message: 'not connected to myagent server' } satisfies RpcError)
        return
      }
      const id = this.nextId++
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }

  private handleMessage(raw: string): void {
    let msg: {
      id?: number | null
      method?: string
      params?: unknown
      result?: unknown
      error?: RpcError
    }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg.method) {
      this.onNotification({ method: msg.method, params: msg.params })
      return
    }
    if (typeof msg.id === 'number') {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(msg.error)
      else p.resolve(msg.result)
    }
  }
}
