// Protocol smoke test: mirrors src/main/server.ts + rpc.ts against a real
// `myagent serve` process. Run: node scripts/smoke.mjs
import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import WebSocket from 'ws'
import { resolve } from 'path'

const token = randomBytes(16).toString('hex')
const bin = resolve(import.meta.dirname, '..', '..', 'myagent.exe')
const proc = spawn(bin, ['serve', '--port', '0', '--token', token], {
  cwd: import.meta.dirname,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
})

let out = ''
const url = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout waiting for connect line\n' + out)), 15000)
  proc.stdout.on('data', (c) => {
    out += c.toString()
    const m = out.match(/connect:\s+(ws:\/\/\S+)/)
    if (m) {
      clearTimeout(t)
      resolve(m[1])
    }
  })
  proc.stderr.on('data', (c) => (out += c.toString()))
  proc.on('exit', (code) => reject(new Error(`serve exited ${code}\n${out}`)))
})
console.log('server url:', url.replace(token, '<token>'))

const ws = new WebSocket(url)
let id = 0
const pending = new Map()
const call = (method, params) =>
  new Promise((resolve, reject) => {
    const i = ++id
    pending.set(i, { resolve, reject })
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }))
  })

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  if (msg.method) {
    console.log('notify:', msg.method, JSON.stringify(msg.params).slice(0, 120))
    return
  }
  const p = pending.get(msg.id)
  if (!p) return
  pending.delete(msg.id)
  msg.error ? p.reject(new Error(`${msg.error.code}: ${msg.error.message}`)) : p.resolve(msg.result)
})

await new Promise((r, j) => ws.on('open', r) && 0 || ws.on('error', j))
console.log('ws open')

const list = await call('session.list')
console.log('session.list ok:', (list.sessions ?? []).length, 'sessions')

const created = await call('session.create', { cwd: process.cwd() })
console.log('session.create ok:', created.sessionId, created.model)

const msgs = await call('session.messages', { sessionId: created.sessionId })
console.log('session.messages ok:', (msgs.messages ?? []).length, 'messages')

await call('session.close', { sessionId: created.sessionId })
console.log('session.close ok')

ws.close()
proc.kill()
console.log('SMOKE PASS')
process.exit(0)
