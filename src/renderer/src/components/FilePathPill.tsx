import { File01 } from './ui/icons'
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { useFileNavigation } from '../fileNavigation'

const EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc',
  'md', 'mdx', 'markdown', 'css', 'scss', 'sass', 'less',
  'html', 'htm', 'py', 'go', 'rs', 'java', 'kt', 'kts', 'rb', 'php',
  'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'cs', 'swift',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'sql', 'graphql', 'gql', 'vue', 'svelte', 'astro', 'xml',
  'txt', 'log', 'csv', 'tsv', 'png', 'jpg', 'jpeg', 'gif', 'webp',
  'svg', 'pdf', 'lock', 'mod', 'sum'
])

const KNOWN_FILES = new Set([
  'Dockerfile', 'Containerfile', 'Makefile', 'Procfile', 'Rakefile', 'Gemfile',
  'LICENSE', 'LICENCE', 'CODEOWNERS', '.gitignore', '.dockerignore', '.editorconfig',
  '.npmrc', '.nvmrc', '.prettierrc', '.eslintrc', '.env'
])

/**
 * Recognise a path offered by the model in inline code or a markdown link.
 * Deliberately conservative: a scheme, whitespace, punctuation or a codish
 * shape disqualifies the value so ordinary code spans never turn into pills.
 */
export function normalizeInlinePath(raw: string): string | null {
  const text = raw.trim()
  if (!text || text.length > 400) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^mailto:/i.test(text)) return null
  if (/[\s"'`<>(){}[\]]/.test(text)) return null
  const withoutLines = text.replace(/:\d+(?::\d+)?$/, '')
  if (!withoutLines) return null
  const normalized = withoutLines.replace(/\\/g, '/').replace(/^\.\//, '')
  const name = normalized.split('/').pop() ?? ''
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  if (!KNOWN_FILES.has(name) && !EXTENSIONS.has(ext)) return null
  return withoutLines
}

export function FilePathPill({ path, label }: { path: string; label?: string }): JSX.Element {
  const openFile = useFileNavigation()
  const text = label ?? path
  if (!openFile) return <code>{text}</code>

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`Open ${path}`}
              className="file-pill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                openFile(path)
              }}
            >
              <File01 size={11} strokeWidth={1.7} className="shrink-0 opacity-70" aria-hidden />
              <span className="file-pill-label">{text}</span>
            </button>
          }
        />
        <TooltipPopup side="top" sideOffset={6} className="max-w-[420px]">
          <span className="block break-all font-mono">{path}</span>
          <span className="block pt-0.5 text-ui-xs opacity-60">Click to open</span>
        </TooltipPopup>
      </Tooltip>
    </TooltipProvider>
  )
}
