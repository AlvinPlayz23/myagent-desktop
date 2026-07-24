import { contextBridge, ipcRenderer } from 'electron'
import type { MyagentApi, ServerPush } from '../shared/protocol'

const api: MyagentApi = {
  connect: () => ipcRenderer.invoke('myagent:connect'),
  rpc: (method, params) => ipcRenderer.invoke('myagent:rpc', method, params),
  pickFolder: () => ipcRenderer.invoke('myagent:pickFolder'),
  setTheme: (theme) => ipcRenderer.invoke('myagent:setTheme', theme),
  minimizeWindow: () => ipcRenderer.invoke('myagent:window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('myagent:window:toggleMaximize'),
  closeWindow: () => ipcRenderer.invoke('myagent:window:close'),
  windowMaximized: () => ipcRenderer.invoke('myagent:window:isMaximized'),
  onWindowMaximized: (cb: (maximized: boolean) => void) => {
    const listener = (_e: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('myagent:window:maximized', listener)
    return () => ipcRenderer.removeListener('myagent:window:maximized', listener)
  },
  onPush: (cb: (push: ServerPush) => void) => {
    const listener = (_e: unknown, push: ServerPush): void => cb(push)
    ipcRenderer.on('myagent:push', listener)
    return () => ipcRenderer.removeListener('myagent:push', listener)
  }
}

contextBridge.exposeInMainWorld('myagent', api)
