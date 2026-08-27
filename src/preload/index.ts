import { contextBridge, ipcRenderer } from 'electron'
import type { MyagentApi, ServerPush } from '../shared/protocol'

const api: MyagentApi = {
  connect: () => ipcRenderer.invoke('myagent:connect'),
  rpc: (method, params) => ipcRenderer.invoke('myagent:rpc', method, params),
  pickFolder: () => ipcRenderer.invoke('myagent:pickFolder'),
  setTheme: (theme) => ipcRenderer.invoke('myagent:setTheme', theme),
  setTransparency: (enabled, value) => ipcRenderer.invoke('myagent:setTransparency', enabled, value),
  backdrop: () => ipcRenderer.invoke('myagent:backdrop'),
  minimizeWindow: () => ipcRenderer.invoke('myagent:window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('myagent:window:toggleMaximize'),
  closeWindow: () => ipcRenderer.invoke('myagent:window:close'),
  windowMaximized: () => ipcRenderer.invoke('myagent:window:isMaximized'),
  openWith: (target, dir) => ipcRenderer.invoke('myagent:openWith', target, dir),
  onWindowMaximized: (cb: (maximized: boolean) => void) => {
    const listener = (_e: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('myagent:window:maximized', listener)
    return () => ipcRenderer.removeListener('myagent:window:maximized', listener)
  },
  onPush: (cb: (push: ServerPush) => void) => {
    const listener = (_e: unknown, push: ServerPush): void => cb(push)
    ipcRenderer.on('myagent:push', listener)
    return () => ipcRenderer.removeListener('myagent:push', listener)
  },
  git: {
    status: (cwd) => ipcRenderer.invoke('myagent:git:status', cwd),
    diff: (cwd, path, staged) => ipcRenderer.invoke('myagent:git:diff', cwd, path, staged),
    branches: (cwd) => ipcRenderer.invoke('myagent:git:branches', cwd),
    log: (cwd, limit) => ipcRenderer.invoke('myagent:git:log', cwd, limit),
    stage: (cwd, paths) => ipcRenderer.invoke('myagent:git:stage', cwd, paths),
    unstage: (cwd, paths) => ipcRenderer.invoke('myagent:git:unstage', cwd, paths),
    discard: (cwd, paths) => ipcRenderer.invoke('myagent:git:discard', cwd, paths),
    commit: (cwd, message, amend) => ipcRenderer.invoke('myagent:git:commit', cwd, message, amend),
    push: (cwd) => ipcRenderer.invoke('myagent:git:push', cwd),
    pull: (cwd) => ipcRenderer.invoke('myagent:git:pull', cwd),
    fetch: (cwd) => ipcRenderer.invoke('myagent:git:fetch', cwd),
    checkout: (cwd, branch) => ipcRenderer.invoke('myagent:git:checkout', cwd, branch),
    createBranch: (cwd, name) => ipcRenderer.invoke('myagent:git:createBranch', cwd, name),
    init: (cwd) => ipcRenderer.invoke('myagent:git:init', cwd)
  }
}

contextBridge.exposeInMainWorld('myagent', api)
