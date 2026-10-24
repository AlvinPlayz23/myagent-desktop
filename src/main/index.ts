import { app, shell, BrowserWindow, ipcMain, dialog, nativeTheme, screen } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs'
import { join } from 'path'
import { release } from 'os'
import { startServer, SpawnedServer } from './server'
import { RpcClient } from './rpc'
import type {
  AgentEvent,
  BackdropMode,
  PullFilter,
  PullStateFilter,
  RpcResult,
  ServerPush
} from '../shared/protocol'
import * as git from './git'
import * as gh from './gh'
import * as files from './files'

let win: BrowserWindow | null = null
let server: SpawnedServer | null = null
const rpc = new RpcClient()
let hello: { name: string; version: string; protocol: number } | null = null
let connecting: Promise<RpcResult<{ name: string; version: string }>> | null = null
let appTheme: 'light' | 'dark' | null = null
let transparency = 50
let transparencyEnabled = true

// `moved`/`resized` fire continuously while the window is dragged or snapped,
// and each one used to cost an IPC message plus a renderer re-render. Only the
// settled state matters for the caption icon, so coalesce to the trailing
// edge; maximize/unmaximize still report immediately because they are discrete.
let maximizedPushTimer: NodeJS.Timeout | null = null
let lastMaximized: boolean | null = null

function sendWindowMaximized(): void {
  const maximized = win?.isMaximized() ?? false
  if (maximized === lastMaximized) return
  lastMaximized = maximized
  win?.webContents.send('myagent:window:maximized', maximized)
}

function pushWindowMaximized(): void {
  sendWindowMaximized()
}

function scheduleWindowMaximized(): void {
  if (maximizedPushTimer !== null) clearTimeout(maximizedPushTimer)
  maximizedPushTimer = setTimeout(() => {
    maximizedPushTimer = null
    sendWindowMaximized()
  }, 80)
}

// Server notifications arrive one WebSocket frame per agent event. Batching
// them into one IPC message per tick cuts ~50x sends during streaming and
// keeps the main thread off of structured-clone overhead. Low-latency pushes
// (hello/status/done) bypass the wait by flushing immediately.
const pushQueue: ServerPush[] = []
let pushFlushTimer: NodeJS.Timeout | null = null
const PUSH_FLUSH_MS = 32

function sendPush(batch: ServerPush[]): void {
  if (batch.length === 0) return
  win?.webContents.send('myagent:push', batch)
}

function flushPushQueue(): void {
  pushFlushTimer = null
  if (pushQueue.length === 0) return
  const batch = pushQueue.splice(0, pushQueue.length)
  sendPush(batch)
}

function enqueuePush(p: ServerPush, immediate = false): void {
  pushQueue.push(p)
  if (immediate) {
    flushPushQueue()
    return
  }
  if (pushFlushTimer === null) {
    pushFlushTimer = setTimeout(flushPushQueue, PUSH_FLUSH_MS)
  }
}

function wireClient(): void {
  rpc.onNotification = ({ method, params }) => {
    if (method === 'server.hello') {
      hello = params as typeof hello
      enqueuePush({ kind: 'hello', ...(hello as NonNullable<typeof hello>) }, true)
    } else if (method === 'session.event') {
      const p = params as { sessionId: string; event: AgentEvent }
      enqueuePush({ kind: 'event', sessionId: p.sessionId, event: p.event })
    } else if (method === 'session.done') {
      const p = params as { sessionId: string; error?: string }
      enqueuePush({ kind: 'done', sessionId: p.sessionId, error: p.error }, true)
    }
  }
  rpc.onClose = (reason) => {
    enqueuePush({ kind: 'status', state: 'disconnected', detail: reason }, true)
    attemptReconnect()
  }
}

let reconnectTries = 0
async function attemptReconnect(): Promise<void> {
  if (!server || rpc.connected) return
  while (server && !rpc.connected && reconnectTries < 5) {
    reconnectTries++
    enqueuePush({ kind: 'status', state: 'reconnecting', detail: `attempt ${reconnectTries}` }, true)
    await new Promise((r) => setTimeout(r, 500 * reconnectTries))
    try {
      await rpc.connect(server.url)
      reconnectTries = 0
      enqueuePush({ kind: 'status', state: 'connected' }, true)
      return
    } catch {
      // next attempt
    }
  }
  if (!rpc.connected) {
    // Server process may have died: respawn it once on the next connect().
    server?.stop()
    server = null
    connecting = null
    enqueuePush({ kind: 'status', state: 'disconnected', detail: 'server unreachable' }, true)
  }
}

async function ensureConnected(): Promise<RpcResult<{ name: string; version: string }>> {
  if (rpc.connected) {
    // A reloaded renderer boots in 'starting' and only learns state from
    // pushes; re-emit what it missed while the connection stayed up.
    enqueuePush({ kind: 'status', state: 'connected' }, true)
    if (hello) enqueuePush({ kind: 'hello', ...hello }, true)
    return { ok: true, result: { name: hello?.name ?? 'myagent', version: hello?.version ?? '' } }
  }
  if (connecting) return connecting
  connecting = (async (): Promise<RpcResult<{ name: string; version: string }>> => {
    try {
      enqueuePush({ kind: 'status', state: 'starting' }, true)
      if (!server) server = await startServer()
      await rpc.connect(server.url)
      reconnectTries = 0
      enqueuePush({ kind: 'status', state: 'connected' }, true)
      return { ok: true, result: { name: 'myagent', version: hello?.version ?? '' } }
    } catch (err) {
      server?.stop()
      server = null
      const message = err instanceof Error ? err.message : String(err)
      enqueuePush({ kind: 'status', state: 'disconnected', detail: message }, true)
      return { ok: false, error: { code: -32000, message } }
    } finally {
      connecting = null
    }
  })()
  return connecting
}

// Pre-paint window background for both themes, kept close to the renderer
// surface colors so load doesn't flash a mismatched fill. Only consulted when
// the window is opaque — every other backdrop mode needs a zero-alpha fill.
function chromeColor(): string {
  const dark = appTheme === 'dark' || (appTheme === null && nativeTheme.shouldUseDarkColors)
  return dark ? '#141414' : '#f5f5f5'
}

function shellOpacity(): number {
  if (!transparencyEnabled) return 1
  return 0.94 - Math.min(100, Math.max(0, transparency)) / 100 * 0.56
}

let acrylicRefresh: ReturnType<typeof setTimeout> | null = null
let setWindowCompositionAttribute: ((hwnd: number, data: unknown) => number) | null = null
let compositionBindingFailed = false

// Electron exposes no Windows 10 material API, so the DWM call is made directly
// through FFI. Bound lazily: the failure path has to stay silent and one-shot.
function bindComposition(): typeof setWindowCompositionAttribute {
  if (setWindowCompositionAttribute || compositionBindingFailed) return setWindowCompositionAttribute
  try {
    const koffi = require('koffi')
    const AccentPolicy = koffi.struct('AccentPolicy', {
      State: 'int',
      Flags: 'int',
      Color: 'int',
      Animation: 'int'
    })
    // WINCOMPATTRDATA is { DWORD; PVOID; SIZE_T } — cbData is pointer-sized, so
    // it must be size_t. Declaring it as int leaves the upper half undefined on
    // x64 and the call is rejected.
    const WindowCompositionAttributeData = koffi.struct('WindowCompositionAttributeData', {
      Attribute: 'int',
      DataPointer: koffi.pointer(AccentPolicy),
      Size: 'size_t'
    })
    const user32 = koffi.load('user32.dll')
    // The HWND is taken as uintptr_t, not void*: koffi would pass the address of
    // a Buffer rather than the handle value it contains.
    setWindowCompositionAttribute = user32.func('__stdcall', 'SetWindowCompositionAttribute', 'int', [
      'uintptr_t',
      koffi.pointer(WindowCompositionAttributeData)
    ])
  } catch (err) {
    compositionBindingFailed = true
    console.warn('Windows 10 blur unavailable; using transparent fallback:', err)
  }
  return setWindowCompositionAttribute
}

/** Read the HWND value out of the Buffer Electron hands back. */
function nativeHandle(target: BrowserWindow): number {
  const buffer = target.getNativeWindowHandle()
  return buffer.length >= 8 ? Number(buffer.readBigUInt64LE(0)) : buffer.readUInt32LE(0)
}

function applyWindows10Acrylic(): void {
  if (!win || process.platform !== 'win32' || backdrop !== 'transparent') return
  if (acrylicRefresh) clearTimeout(acrylicRefresh)
  acrylicRefresh = setTimeout(() => {
    acrylicRefresh = null
    if (!win || win.isDestroyed()) return
    const apply = bindComposition()
    if (!apply) return

    // State 0 is ACCENT_DISABLED. Transparency off — or the slider parked on
    // Solid — must clear whatever policy an earlier call latched, not stack an
    // opaque blur layer over the desktop.
    if (!transparencyEnabled || transparency <= 0) {
      try {
        const ok = apply(nativeHandle(win), {
          Attribute: 19,
          DataPointer: { State: 0, Flags: 0, Color: 0, Animation: 0 },
          Size: 16
        })
        if (!ok) console.warn('Windows 10 blur clear rejected by DWM; material may linger')
      } catch {
        // Nothing to recover: the window just keeps its previous material.
      }
      return
    }

    const dark = appTheme === 'dark' || (appTheme === null && nativeTheme.shouldUseDarkColors)
    // Matches the --shell-rgb tokens in the renderer's styles.css.
    const red = dark ? 20 : 240
    const green = dark ? 20 : 236
    const blue = dark ? 22 : 228
    // AccentPolicy expects ABGR, not CSS RGBA.
    const gradient = ((Math.round(shellOpacity() * 255) << 24) | (blue << 16) | (green << 8) | red) >>> 0

    try {
      // State 3 is ACCENT_ENABLE_BLURBEHIND. State 4 (acrylic) is what Windows
      // 10 stalls on while the window is being dragged, so it is deliberately
      // not used here. Flags 2 = draw all borders.
      const policy = { State: 3, Flags: 2, Color: gradient | 0, Animation: 0 }
      const ok = apply(nativeHandle(win), {
        Attribute: 19,
        DataPointer: policy,
        Size: 16
      })
      if (!ok) console.warn('Windows 10 blur rejected by DWM; using transparent fallback')
    } catch (err) {
      console.warn('Windows 10 blur call failed; using transparent fallback:', err)
    }
  }, 80)
}

/**
 * Pick the strongest desktop-blending mode the host supports.
 *
 * Windows 11 exposes compositor materials by build: acrylic (live blur of
 * whatever is behind the window) landed in 22H2 / build 22621, mica (a static
 * wallpaper tint) in 21H2 / build 22000. Windows 10 has no supported API, so it
 * falls back to a transparent window that applyWindows10Acrylic then blurs via
 * a direct DWM call. Linux is the same deal; whether it actually blurs is up to
 * the compositor.
 */
function resolveBackdrop(): BackdropMode {
  if (process.platform === 'darwin') return 'vibrancy'
  if (process.platform !== 'win32') return 'transparent'
  const build = Number(release().split('.')[2])
  if (!Number.isFinite(build)) return 'transparent'
  if (build >= 22621) return 'acrylic'
  if (build >= 22000) return 'mica'
  return 'transparent'
}

const backdrop = resolveBackdrop()

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 560,
    show: false,
    // Any opaque fill defeats the material, vibrancy, and transparency alike.
    backgroundColor: backdrop === 'none' ? chromeColor() : '#00000000',
    titleBarStyle: 'hidden',
    roundedCorners: true,
    ...(backdrop === 'acrylic' || backdrop === 'mica' ? { backgroundMaterial: backdrop } : {}),
    ...(backdrop === 'vibrancy'
      ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
      : {}),
    // thickFrame stays at its default true so Windows keeps the resize border
    // and snap behaviour on this frameless, transparent window.
    ...(backdrop === 'transparent' ? { transparent: true } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  applyWindows10Acrylic()

  win.once('ready-to-show', () => win?.show())
  nativeTheme.on('updated', () => {
    if (backdrop === 'none') win?.setBackgroundColor(chromeColor())
  })
  win.on('maximize', pushWindowMaximized)
  win.on('unmaximize', pushWindowMaximized)
  // Aero-snap / taskbar / keyboard restores don't always pair with the button
  // path: re-push the settled state after moves and resizes so a missed event
  // can't leave the renderer's caption icon stuck. Trailing-debounced because
  // these fire continuously during a drag.
  win.on('moved', scheduleWindowMaximized)
  win.on('resized', scheduleWindowMaximized)
  // Frameless windows don't get native Aero-snap: the web drag-region moves
  // the window, but DWM only watches real captions, so dragging to the top
  // edge never maximizes. Emulate that one gesture — while the window is
  // being moved with the cursor pressed against the top edge of its display,
  // maximize, matching the native drag-to-top behaviour. Win32 only: other
  // platforms keep their own window-manager gestures.
  if (process.platform === 'win32') {
    win.on('move', () => {
      if (!win || win.isDestroyed() || win.isMaximized()) return
      try {
        const cursor = screen.getCursorScreenPoint()
        const display = screen.getDisplayNearestPoint(cursor)
        const withinX = cursor.x >= display.bounds.x && cursor.x < display.bounds.x + display.bounds.width
        if (withinX && cursor.y <= display.bounds.y + 2) win.maximize()
      } catch {
        // A failed snap leaves the window where the drag put it.
      }
    })
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('closed', () => {
    win = null
    lastMaximized = null
    if (maximizedPushTimer !== null) {
      clearTimeout(maximizedPushTimer)
      maximizedPushTimer = null
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  wireClient()

  ipcMain.handle('myagent:connect', () => ensureConnected())

  ipcMain.handle('myagent:rpc', async (_e, method: string, params?: unknown): Promise<RpcResult> => {
    try {
      const result = await rpc.call(method, params)
      return { ok: true, result }
    } catch (err) {
      const e = err as { code?: number; message?: string; data?: unknown }
      return {
        ok: false,
        error: { code: e.code ?? -32603, message: e.message ?? String(err), data: e.data }
      }
    }
  })

  ipcMain.handle('myagent:pickFolder', async () => {
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose a project folder'
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  ipcMain.handle('myagent:setTheme', (_e, theme: 'light' | 'dark') => {
    appTheme = theme
    if (backdrop === 'none') win?.setBackgroundColor(chromeColor())
    applyWindows10Acrylic()
  })
  ipcMain.handle('myagent:setTransparency', (_e, enabled: boolean, value: number) => {
    // The toggle and the slider travel separately: a zero slider with the
    // toggle on is Solid, not "off", and must not be inferred from the value.
    transparencyEnabled = enabled !== false && Number.isFinite(value) && value > 0
    transparency = transparencyEnabled ? Math.min(100, Math.max(0, value)) : 0
    applyWindows10Acrylic()
  })

  ipcMain.handle('myagent:backdrop', (): BackdropMode => backdrop)

  // Every git handler funnels through one wrapper so a failed command comes
  // back as { ok: false } with git's own stderr instead of an unhandled reject.
  const gitHandle = <A extends unknown[], T>(
    channel: string,
    fn: (...args: A) => Promise<T>
  ): void => {
    ipcMain.handle(channel, async (_e, ...args: A): Promise<RpcResult<T>> => {
      try {
        return { ok: true, result: await fn(...args) }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: { code: -32001, message } }
      }
    })
  }

  gitHandle('myagent:git:status', (cwd: string) => git.status(cwd))
  gitHandle('myagent:git:diff', (cwd: string, path?: string, staged?: boolean) =>
    git.diff(cwd, path, staged)
  )
  gitHandle('myagent:git:branches', (cwd: string) => git.branches(cwd))
  gitHandle('myagent:git:log', (cwd: string, limit?: number) => git.log(cwd, limit))
  gitHandle('myagent:git:stage', (cwd: string, paths: string[]) => git.stage(cwd, paths))
  gitHandle('myagent:git:unstage', (cwd: string, paths: string[]) => git.unstage(cwd, paths))
  gitHandle('myagent:git:discard', (cwd: string, paths: string[]) => git.discard(cwd, paths))
  gitHandle('myagent:git:commit', (cwd: string, message: string, amend?: boolean) =>
    git.commit(cwd, message, amend)
  )
  gitHandle('myagent:git:push', (cwd: string) => git.push(cwd))
  gitHandle('myagent:git:pull', (cwd: string) => git.pull(cwd))
  gitHandle('myagent:git:fetch', (cwd: string) => git.fetch(cwd))
  gitHandle('myagent:git:checkout', (cwd: string, branch: string) => git.checkout(cwd, branch))
  gitHandle('myagent:git:createBranch', (cwd: string, name: string) => git.createBranch(cwd, name))
  gitHandle('myagent:git:init', (cwd: string) => git.init(cwd))

  // GitHub rides the same wrapper as git: gh's own stderr is the message the
  // window shows when it has to fall back to demo data.
  gitHandle('myagent:github:status', (cwd: string) => gh.status(cwd))
  gitHandle('myagent:github:pulls', (cwd: string, filter: PullFilter, state: PullStateFilter) =>
    gh.pulls(cwd, filter, state)
  )
  gitHandle('myagent:github:pull', (cwd: string, number: number) => gh.pull(cwd, number))
  gitHandle('myagent:github:diff', (cwd: string, number: number) => gh.diff(cwd, number))
  gitHandle('myagent:github:comment', (cwd: string, number: number, body: string) =>
    gh.comment(cwd, number, body)
  )

  // Same failure shape as git: an unreadable project comes back as { ok: false }.
  gitHandle('myagent:files:search', (cwd: string, query: string) => files.search(cwd, query))

  ipcMain.handle('myagent:window:minimize', () => win?.minimize())
  ipcMain.handle('myagent:window:toggleMaximize', () => {
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('myagent:window:close', () => win?.close())
  ipcMain.handle('myagent:window:isMaximized', () => win?.isMaximized() ?? false)

  // Reveal a session's project folder in an external app. 'explorer' opens
  // Windows File Explorer at the folder; 'vscode' launches VS Code (falls
  // back to Explorer when the `code` CLI is not on PATH). Path is validated
  // against the fs so a stale/removed project fails closed.
  ipcMain.handle('myagent:openWith', async (_e, target: string, dir: string) => {
    try {
      if (typeof dir !== 'string' || !dir) return false
      const st = await fs.promises.stat(dir).catch(() => null)
      if (!st?.isDirectory()) return false
      if (target === 'vscode') {
        const launched = await new Promise<boolean>((resolve) => {
          const exe = process.platform === 'win32' ? 'code.cmd' : 'code'
          // windowsHide: with shell:true Node spawns cmd.exe (a console app),
          // which would flash a console window from this console-less parent.
          execFile(
            exe,
            ['-n', dir],
            { shell: process.platform === 'win32', windowsHide: true },
            (err) => resolve(!err)
          )
        })
        if (launched) return true
      }
      if (target === 'explorer') {
        const err = await shell.openPath(dir)
        return err.length === 0
      }
      return false
    } catch {
      return false
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  rpc.close()
  server?.stop()
  server = null
})
