import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkspaceFileContent } from '../../../shared/protocol'
import { api } from '../api'
import { FileNavigationProvider } from '../fileNavigation'
import Markdown from './Markdown'
import { AlertCircle, Check, Copy01, File01, Folder01, Loading03, Refresh01 } from './ui/icons'

const MAX_RENDERED_LINES = 6000

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function languageOf(path: string): string {
  const name = path.split('/').pop() ?? path
  if (!name.includes('.')) return 'TEXT'
  return (name.split('.').pop() ?? 'TEXT').toUpperCase()
}

function Action({ title, onClick, children }: { title: string; onClick(): void; children: JSX.Element }): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  )
}

interface Props {
  cwd: string
  path: string
  name: string
  onOpenFile(path: string, cwd: string): void
}

export default function FilePreview({ cwd, path, name, onOpenFile }: Props): JSX.Element {
  const [content, setContent] = useState<WorkspaceFileContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [raw, setRaw] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    setContent(null)
    api
      .readFile(cwd, path)
      .then((next) => {
        if (alive) {
          setContent(next)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Could not read file')
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [cwd, path, refresh])

  const isMarkdown = /\.(md|mdx|markdown)$/i.test(path)
  const openLinkedFile = useCallback((linked: string) => onOpenFile(linked, cwd), [onOpenFile, cwd])

  const reveal = (): void => {
    void api.revealFile(cwd, path).catch(() => {})
  }
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard access can be denied by the OS.
    }
  }

  const lines = useMemo(() => (content?.kind === 'text' ? content.content.split(/\r?\n/) : []), [content])
  const shown = lines.slice(0, MAX_RENDERED_LINES)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border-seam px-2">
        <File01 size={14} strokeWidth={1.7} className="shrink-0 text-foreground-subtlest" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground" title={path}>
          {name}
        </span>
        <span className="hidden min-w-0 max-w-[45%] truncate font-mono text-ui-xs text-foreground-subtlest md:block">
          {path}
        </span>
        {isMarkdown && (
          <button
            type="button"
            onClick={() => setRaw((value) => !value)}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-ui-xs font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            {raw ? 'Preview' : 'Raw'}
          </button>
        )}
        <Action title="Copy path" onClick={() => void copy()}>
          {copied ? <Check size={13} strokeWidth={1.8} /> : <Copy01 size={13} strokeWidth={1.8} />}
        </Action>
        <Action title="Reveal in file manager" onClick={reveal}>
          <Folder01 size={13} strokeWidth={1.8} />
        </Action>
        <Action title="Refresh file" onClick={() => setRefresh((value) => value + 1)}>
          <Refresh01 size={13} strokeWidth={1.8} />
        </Action>
      </div>

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-ui-sm text-foreground-subtlest">
          <Loading03 size={14} strokeWidth={1.8} className="animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertCircle size={20} strokeWidth={1.5} className="text-destructive-foreground" />
          <p className="m-0 max-w-sm text-ui-sm leading-relaxed text-foreground-subtle">{error}</p>
          <button
            type="button"
            onClick={reveal}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-ui-sm text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
          >
            <Folder01 size={13} strokeWidth={1.8} />
            Reveal in file manager
          </button>
        </div>
      ) : content?.kind === 'image' ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-background p-6">
          <img src={content.dataUrl} alt={name} className="max-h-full max-w-full object-contain" />
        </div>
      ) : content?.kind === 'binary' || content?.kind === 'too-large' ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <File01 size={20} strokeWidth={1.5} className="text-foreground-subtlest" />
          <p className="m-0 max-w-sm text-ui-sm leading-relaxed text-foreground-subtle">
            {content.kind === 'binary'
              ? `Binary file (${formatBytes(content.size)}).`
              : `Too large to preview (${formatBytes(content.size)}).`}
          </p>
          <button
            type="button"
            onClick={reveal}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-ui-sm text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
          >
            <Folder01 size={13} strokeWidth={1.8} />
            Reveal in file manager
          </button>
        </div>
      ) : content?.kind === 'text' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {isMarkdown && !raw ? (
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <div className="chat-markdown text-ui-base">
                <FileNavigationProvider value={openLinkedFile}>
                  <Markdown text={content.content} />
                </FileNavigationProvider>
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto bg-background">
              <div className="file-code min-w-max py-2 font-mono">
                {shown.map((line, index) => (
                  <div key={index} className="flex">
                    <span className="sticky left-0 z-10 w-10 shrink-0 select-none border-r border-border/60 bg-background pr-2 text-right tabular-nums text-foreground-subtlest">
                      {index + 1}
                    </span>
                    <span className="whitespace-pre pl-3 pr-6 text-foreground">{line || ' '}</span>
                  </div>
                ))}
              </div>
              {lines.length > shown.length && (
                <div className="px-3 py-2 text-ui-sm text-foreground-subtlest">
                  Showing the first {shown.length.toLocaleString()} of {lines.length.toLocaleString()} lines.
                </div>
              )}
            </div>
          )}
          <div className="flex h-6 shrink-0 items-center justify-between border-t border-border-seam px-2 font-mono text-ui-xs text-foreground-subtlest">
            <span>{languageOf(path)}</span>
            <span>
              {lines.length.toLocaleString()} lines · {formatBytes(content.size)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
