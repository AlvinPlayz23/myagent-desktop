// Loads the built renderer in a hidden window and prints resolved theme colors.
import { app, BrowserWindow } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadFile(join(root, 'out', 'renderer', 'index.html'))
  await new Promise((r) => setTimeout(r, 1500))
  const out = await win.webContents.executeJavaScript(`(() => {
    document.documentElement.classList.add('dark')
    const cs = getComputedStyle(document.documentElement)
    const vars = ['--background','--card','--popover','--primary','--muted','--accent','--border','--foreground','--muted-foreground','--app-chrome-background','--color-neutral-950','--color-white','--color-black']
    const o = {}
    for (const v of vars) o[v] = cs.getPropertyValue(v).trim()
    const main = document.querySelector('main')
    o['main.bg'] = main ? getComputedStyle(main).backgroundColor : '(no main)'
    o['body.bg'] = getComputedStyle(document.body).backgroundColor
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--card)'
    document.body.appendChild(probe)
    o['card.resolved'] = getComputedStyle(probe).backgroundColor
    probe.style.backgroundColor = 'var(--background)'
    o['background.resolved'] = getComputedStyle(probe).backgroundColor
    return o
  })()`)
  console.log(JSON.stringify(out, null, 2))
  app.quit()
})
