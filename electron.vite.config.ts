import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

/**
 * Vendor bucketing for the renderer bundle.
 *
 * Deliberately coarse. Splitting per npm package produced 102 chunks, which
 * then cost 102 file opens on a cold start — worse than the single bundle it
 * replaced, and fatal on Windows where each open may hit a virus scanner.
 * Four intent-based buckets keep the vendor code cacheable across app edits
 * without turning startup into a scatter-read.
 */
function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
  if (/node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'vendor-motion'
  if (/node_modules[\\/](@base-ui|@floating-ui|@hugeicons|clsx|tailwind-merge|class-variance-authority)[\\/]/.test(id))
    return 'vendor-ui'
  if (/node_modules[\\/](react-markdown|remark-|micromark|mdast-|hast-|unified|vfile|property-information|bail|trough|is-plain-obj|decode-named-character-reference|character-entities|devlop|zwitch|longest-streak|ccount|escape-string-regexp|markdown-table|trim-lines|unist-|html-url-attributes|comma-separated-tokens|space-separated-tokens|stringify-entities|character-reference-invalid|parse-entities)/.test(id))
    return 'vendor-markdown'
  return 'vendor-misc'
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    build: {
      // Electron 33 ships Chromium 130, so the renderer needs none of Vite's
      // default downlevelling: emitting native arrow shorthand, class fields
      // and optional chaining is both smaller and cheaper to parse at boot.
      target: 'chrome130',
      rollupOptions: {
        output: {
          manualChunks: vendorChunk
        }
      }
    }
  }
})
