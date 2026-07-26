import { app, shell, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron'
import { join } from 'path'
import { startServer, SpawnedServer } from './server'
import { RpcClient } from './rpc'
import type { AgentEvent, RpcResult, ServerPush } from '../shared/protocol'

let win: BrowserWindow | null = null
let server: SpawnedServer | null = null
const rpc = new RpcClient()
let hello: { name: string; version: string; protocol: number } | null = null
let connecting: Promise<RpcResult<{ name: string; version: string }>> | null = null
let appTheme: 'light' | 'dark' | null = null

function push(p: ServerPush): void {
  win?.webContents.send('myagent:push', p)
}

function pushWindowMaximized(): void {
  win?.webContents.send('myagent:window:maximized', win.isMaximized())
}

function wireClient(): void {
  rpc.onNotification = ({ method, params }) => {
    if (method === 'server.hello') {
      hello = params as typeof hello
      push({ kind: 'hello', ...(hello as NonNullable<typeof hello>) })
    } else if (method === 'session.event') {
      const p = params as { sessionId: string; event: AgentEvent }
      push({ kind: 'event', sessionId: p.sessionId, event: p.event })
    } else if (method === 'session.done') {
      const p = params as { sessionId: string; error?: string }
      push({ kind: 'done', sessionId: p.sessionId, error: p.error })
    }
  }
  rpc.onClose = (reason) => {
    push({ kind: 'status', state: 'disconnected', detail: reason })
    attemptReconnect()
  }
}

let reconnectTries = 0
async function attemptReconnect(): Promise<void> {
  if (!server || rpc.connected) return
  while (server && !rpc.connected && reconnectTries < 5) {
    reconnectTries++
    push({ kind: 'status', state: 'reconnecting', detail: `attempt ${reconnectTries}` })
    await new Promise((r) => setTimeout(r, 500 * reconnectTries))
    try {
      await rpc.connect(server.url)
      reconnectTries = 0
      push({ kind: 'status', state: 'connected' })
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
    push({ kind: 'status', state: 'disconnected', detail: 'server unreachable' })
  }
}

async function ensureConnected(): Promise<RpcResult<{ name: string; version: string }>> {
  if (rpc.connected) {
    // A reloaded renderer boots in 'starting' and only learns state from
    // pushes; re-emit what it missed while the connection stayed up.
    push({ kind: 'status', state: 'connected' })
    if (hello) push({ kind: 'hello', ...hello })
    return { ok: true, result: { name: hello?.name ?? 'myagent', version: hello?.version ?? '' } }
  }
  if (connecting) return connecting
  connecting = (async (): Promise<RpcResult<{ name: string; version: string }>> => {
    try {
      push({ kind: 'status', state: 'starting' })
      if (!server) server = await startServer()
      await rpc.connect(server.url)
      reconnectTries = 0
      push({ kind: 'status', state: 'connected' })
      return { ok: true, result: { name: 'myagent', version: hello?.version ?? '' } }
    } catch (err) {
      server?.stop()
      server = null
      const message = err instanceof Error ? err.message : String(err)
      push({ kind: 'status', state: 'disconnected', detail: message })
      return { ok: false, error: { code: -32000, message } }
    } finally {
      connecting = null
    }
  })()
  return connecting
}

// Native titlebar overlay + pre-paint window background for both themes, kept
// close to the renderer surface colors so load doesn't flash a mismatched fill.
function chromeColors(): { color: string; symbolColor: string } {
  const dark = appTheme === 'dark' || (appTheme === null && nativeTheme.shouldUseDarkColors)
  return dark
    ? { color: '#0a0a0a', symbolColor: '#a1a1a1' }
    : { color: '#f5f5f5', symbolColor: '#525252' }
}

function createWindow(): void {
  const chrome = chromeColors()
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 560,
    show: false,
    backgroundColor: chrome.color,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win?.show())
  nativeTheme.on('updated', () => {
    win?.setBackgroundColor(chromeColors().color)
  })
  win.on('maximize', pushWindowMaximized)
  win.on('unmaximize', pushWindowMaximized)
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('closed', () => {
    win = null
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
    const chrome = chromeColors()
    win?.setBackgroundColor(chrome.color)
  })

  ipcMain.handle('myagent:window:minimize', () => win?.minimize())
  ipcMain.handle('myagent:window:toggleMaximize', () => {
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('myagent:window:close', () => win?.close())
  ipcMain.handle('myagent:window:isMaximized', () => win?.isMaximized() ?? false)

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
