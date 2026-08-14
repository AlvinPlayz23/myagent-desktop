import { spawn, ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { app } from 'electron'

// Cap on the startup log buffers. They exist only to explain a failed launch,
// so a few KB is plenty; without a bound a chatty server grows them for the
// entire lifetime of the app.
const LOG_TAIL = 16 * 1024

export interface SpawnedServer {
  url: string
  token: string
  stop(): void
}

// Locate the myagent binary: MYAGENT_BIN env, the repo root during dev
// (desktop/ lives inside the myagent repo), next to the packaged app, or PATH.
function findBinary(): string {
  const exe = process.platform === 'win32' ? 'myagent.exe' : 'myagent'
  const candidates = [
    process.env.MYAGENT_BIN,
    resolve(app.getAppPath(), '..', exe), // dev: desktop/../myagent.exe
    join(process.resourcesPath ?? '', exe) // packaged: resources/myagent.exe
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  return exe // fall back to PATH lookup
}

// Spawn `myagent serve --port 0 --token <t>` and wait for its readiness line:
//   connect: ws://127.0.0.1:PORT/ws?token=TOKEN
export function startServer(): Promise<SpawnedServer> {
  const token = randomBytes(16).toString('hex')
  const bin = findBinary()

  return new Promise((resolvePromise, reject) => {
    let proc: ChildProcess
    try {
      proc = spawn(bin, ['serve', '--port', '0', '--token', token], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        // Isolate desktop sessions from the CLI/TUI. Relative value is resolved
        // under config.Dir() by the Go side, so config.json + auth/ stay shared.
        env: { ...process.env, MYAGENT_SESSIONS_DIR: 'sessions/desktop' }
      })
    } catch (err) {
      reject(err)
      return
    }

    let settled = false
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        proc.kill()
        reject(new Error(`myagent serve did not start within 15s\n${stderr || stdout}`))
      }
    }, 15000)

    const stop = () => {
      clearTimeout(timer)
      if (!proc.killed) proc.kill()
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      if (settled) return // startup line already seen; don't retain server logs
      stdout += chunk.toString()
      const m = stdout.match(/connect:\s+(ws:\/\/\S+)/)
      if (m) {
        settled = true
        clearTimeout(timer)
        resolvePromise({ url: m[1], token, stop })
      }
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      // Same as stdout: the buffer exists purely to explain a startup failure,
      // so stop appending once startup settled. The length cap bounds the
      // pre-settle window, where a chatty server could otherwise grow it.
      if (settled || stderr.length >= LOG_TAIL) return
      stderr += chunk.toString()
    })
    proc.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(
          new Error(
            `failed to launch "${bin}": ${err.message}. ` +
              `Build myagent (go build -o myagent.exe .) or set MYAGENT_BIN.`
          )
        )
      }
    })
    proc.on('exit', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`myagent serve exited (code ${code})\n${(stderr || stdout).trim()}`))
      }
    })
  })
}
