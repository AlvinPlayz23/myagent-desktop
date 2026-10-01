import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Runs the renderer alone in a browser (no Electron, no backend) for UI work
 * and visual review: `npm exec -- vite --config scripts/renderer-preview.vite.config.mts`.
 * The Electron preload bridge is replaced by scripts/renderer-preview-mock.js.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Served as a real file: the page's CSP (script-src 'self') blocks inline scripts.
const MOCK_URL = '/__renderer-preview-mock.js'
const mockBridge = (): Plugin => ({
  name: 'renderer-preview-mock-bridge',
  configureServer(server) {
    server.middlewares.use(MOCK_URL, (_req, res) => {
      res.setHeader('Content-Type', 'text/javascript')
      res.end(readFileSync(resolve(root, 'scripts/renderer-preview-mock.js'), 'utf8'))
    })
  },
  transformIndexHtml: () => [{ tag: 'script', attrs: { src: MOCK_URL }, injectTo: 'head-prepend' }]
})

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  plugins: [react(), tailwindcss(), mockBridge()],
  resolve: { alias: { '@': resolve(root, 'src/renderer/src') } },
  server: { host: '0.0.0.0', port: 5173, strictPort: false, fs: { strict: false } }
})
