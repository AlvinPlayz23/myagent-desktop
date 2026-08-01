import { app, shell, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron'
import { join } from 'path'
import { release } from 'os'
import { spawn } from 'child_process'
import { startServer, SpawnedServer } from './server'
import { RpcClient } from './rpc'
import type { AgentEvent, BackdropMode, RpcResult, ServerPush } from '../shared/protocol'

let win: BrowserWindow | null = null
let server: SpawnedServer | null = null
const rpc = new RpcClient()
let hello: { name: string; version: string; protocol: number } | null = null
let connecting: Promise<RpcResult<{ name: string; version: string }>> | null = null
let appTheme: 'light' | 'dark' | null = null
let transparency = 50

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

// Pre-paint window background for both themes, kept close to the renderer
// surface colors so load doesn't flash a mismatched fill. Only consulted when
// the window is opaque — every other backdrop mode needs a zero-alpha fill.
function chromeColor(): string {
  const dark = appTheme === 'dark' || (appTheme === null && nativeTheme.shouldUseDarkColors)
  return dark ? '#141414' : '#f5f5f5'
}

function shellOpacity(): number {
  return 0.94 - Math.min(100, Math.max(0, transparency)) / 100 * 0.56
}

let acrylicRefresh: ReturnType<typeof setTimeout> | null = null

function applyWindows10Acrylic(): void {
  // Electron has no Windows 10 material API. Apply DWM's acrylic composition
  // attribute through PowerShell's built-in C# compiler instead of shipping a
  // native Node addon (which would require Visual Studio build tools).
  if (!win || process.platform !== 'win32' || backdrop !== 'transparent') return
  if (acrylicRefresh) clearTimeout(acrylicRefresh)
  acrylicRefresh = setTimeout(() => {
    acrylicRefresh = null
    if (!win || win.isDestroyed()) return

    const dark = appTheme === 'dark' || (appTheme === null && nativeTheme.shouldUseDarkColors)
    const red = dark ? 32 : 240
    const green = dark ? 32 : 236
    const blue = dark ? 32 : 228
    // AccentPolicy expects ABGR, not CSS RGBA.
    const gradient = ((Math.round(shellOpacity() * 255) << 24) | (blue << 16) | (green << 8) | red) >>> 0
    const hwnd = win.getNativeWindowHandle().readBigUInt64LE(0).toString()
    const script = `
$source = @'
using System;
using System.Runtime.InteropServices;
public static class MyagentWin10Acrylic {
  [StructLayout(LayoutKind.Sequential)] public struct AccentPolicy { public int State, Flags, Color, Animation; }
  [StructLayout(LayoutKind.Sequential)] public struct Data { public int Attribute; public IntPtr DataPointer; public int Size; }
  [DllImport("user32.dll")] static extern int SetWindowCompositionAttribute(IntPtr hwnd, ref Data data);
  public static void Apply(long hwnd, uint color) {
    var policy = new AccentPolicy { State = 4, Flags = 2, Color = unchecked((int)color), Animation = 0 };
    var pointer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(AccentPolicy)));
    try {
      Marshal.StructureToPtr(policy, pointer, false);
      var data = new Data { Attribute = 19, DataPointer = pointer, Size = Marshal.SizeOf(typeof(AccentPolicy)) };
      SetWindowCompositionAttribute(new IntPtr(hwnd), ref data);
    } finally { Marshal.FreeHGlobal(pointer); }
  }
}
'@
Add-Type -TypeDefinition $source
[MyagentWin10Acrylic]::Apply(${hwnd}, [uint32]${gradient})
`
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      stdio: 'ignore'
    })
    child.once('error', (err) => console.warn('Windows 10 acrylic unavailable; using transparent fallback:', err))
  }, 80)
}

/**
 * Pick the strongest desktop-blending mode the host supports.
 *
 * Windows 11 exposes compositor materials by build: acrylic (live blur of
 * whatever is behind the window) landed in 22H2 / build 22621, mica (a static
 * wallpaper tint) in 21H2 / build 22000. Windows 10 has no supported API, so it
 * falls back to a plain see-through window — the desktop shows through the
 * sidebar unblurred, which needs no native addon and doesn't lag on drag.
 * Linux is the same deal; whether it actually blurs is up to the compositor.
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
    if (backdrop === 'none') win?.setBackgroundColor(chromeColor())
    applyWindows10Acrylic()
  })
  ipcMain.handle('myagent:setTransparency', (_e, value: number) => {
    transparency = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50
    applyWindows10Acrylic()
  })

  ipcMain.handle('myagent:backdrop', (): BackdropMode => backdrop)

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
