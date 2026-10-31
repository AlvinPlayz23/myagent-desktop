import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceDirEntry } from '../../../shared/protocol'
import { api } from '../api'
import { baseName, cn } from '../util'
import { ChevronRight, File01, Folder01, Loading03, Refresh01 } from './ui/icons'

interface Props {
  cwd: string | null
  activePath?: string
  onOpenFile(path: string, cwd: string): void
}

/** One lazy directory level. Children only mount once their folder opens. */
function DirList({
  cwd,
  rel,
  depth,
  refresh,
  activePath,
  onOpenFile
}: {
  cwd: string
  rel: string
  depth: number
  refresh: number
  activePath?: string
  onOpenFile(path: string): void
}): JSX.Element | null {
  const [entries, setEntries] = useState<WorkspaceDirEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setEntries(null)
    setError(null)
    api
      .listFiles(cwd, rel || undefined)
      .then((next) => {
        if (alive) setEntries(next)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Could not read folder')
      })
    return () => {
      alive = false
    }
  }, [cwd, rel, refresh])

  if (error) {
    return <div className="px-3 py-2 text-ui-sm text-destructive-foreground">{error}</div>
  }
  if (!entries) {
    return (
      <div className="flex h-7 items-center gap-2 px-3 text-ui-sm text-foreground-subtlest">
        <Loading03 size={12} strokeWidth={1.8} className="animate-spin" />
        Loading…
      </div>
    )
  }
  if (entries.length === 0) {
    return <div className="px-3 py-1.5 text-ui-sm text-foreground-subtlest">Empty</div>
  }

  return (
    <>
      {entries.map((entry) =>
        entry.kind === 'dir' ? (
          <DirRow
            key={entry.path}
            cwd={cwd}
            entry={entry}
            depth={depth}
            refresh={refresh}
            activePath={activePath}
            onOpenFile={onOpenFile}
          />
        ) : (
          <button
            key={entry.path}
            type="button"
            title={entry.path}
            onClick={() => onOpenFile(entry.path)}
            className={cn(
              'flex h-7 w-full min-w-0 items-center gap-1.5 pr-2 text-left text-ui-sm transition-colors',
              activePath === entry.path
                ? 'bg-selected text-foreground'
                : 'text-foreground-subtle hover:bg-hover hover:text-foreground'
            )}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <span className="size-3 shrink-0" aria-hidden />
            <File01 size={14} strokeWidth={1.6} className="shrink-0 text-foreground-subtlest" aria-hidden />
            <span className="min-w-0 truncate">{entry.name}</span>
          </button>
        )
      )}
    </>
  )
}

function DirRow({
  cwd,
  entry,
  depth,
  refresh,
  activePath,
  onOpenFile
}: {
  cwd: string
  entry: WorkspaceDirEntry
  depth: number
  refresh: number
  activePath?: string
  onOpenFile(path: string): void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        title={entry.path}
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 w-full min-w-0 items-center gap-1.5 pr-2 text-left text-ui-sm text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <ChevronRight
          size={12}
          strokeWidth={1.8}
          className={cn(
            'shrink-0 text-foreground-subtlest transition-transform duration-150',
            open && 'rotate-90'
          )}
          aria-hidden
        />
        <Folder01 size={14} strokeWidth={1.6} className="shrink-0 text-foreground-subtlest" aria-hidden />
        <span className="min-w-0 truncate">{entry.name}</span>
      </button>
      {open && (
        <DirList
          cwd={cwd}
          rel={entry.path}
          depth={depth + 1}
          refresh={refresh}
          activePath={activePath}
          onOpenFile={onOpenFile}
        />
      )}
    </div>
  )
}

export default function FileTree({ cwd, activePath, onOpenFile }: Props): JSX.Element {
  const [refresh, setRefresh] = useState(0)
  const openFile = useCallback(
    (path: string) => {
      if (cwd) onOpenFile(path, cwd)
    },
    [cwd, onOpenFile]
  )

  if (!cwd) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Folder01 size={18} strokeWidth={1.5} className="text-foreground-subtlest" />
        <p className="m-0 text-ui-sm text-foreground-subtlest">Open a session to browse its project files.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border-seam px-2">
        <Folder01 size={14} strokeWidth={1.7} className="shrink-0 text-foreground-subtlest" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground">{baseName(cwd)}</span>
        <button
          type="button"
          title="Refresh files"
          aria-label="Refresh files"
          onClick={() => setRefresh((value) => value + 1)}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Refresh01 size={13} strokeWidth={1.8} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        <DirList
          cwd={cwd}
          rel=""
          depth={0}
          refresh={refresh}
          activePath={activePath}
          onOpenFile={openFile}
        />
      </div>
    </div>
  )
}
