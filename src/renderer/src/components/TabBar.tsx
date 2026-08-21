import { memo } from 'react'
import { cn } from '../util'
import type { SessionMeta } from '../../../shared/protocol'
import type { ChatState } from '../state'

interface TabProps {
  label: string
  active: boolean
  running: boolean
  onSelect(): void
  onClose(e: React.MouseEvent): void
}

function Tab({ label, active, running, onSelect, onClose }: TabProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={label}
      className={cn(
        'group relative flex h-7 min-w-0 max-w-[180px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-left text-[12px] font-medium transition-colors select-none',
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
    >
      {running && (
        <span className="size-1.5 shrink-0 rounded-full bg-success" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        role="button"
        aria-label="Close tab"
        onClick={onClose}
        className={cn(
          'grid size-4 shrink-0 place-items-center rounded-sm transition-colors',
          active
            ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
            : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
          <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    </button>
  )
}

interface Props {
  tabOrder: string[]
  chats: Record<string, ChatState>
  sessions: SessionMeta[]
  activeId: string | null
  runningIds: Set<string>
  appName: string
  onSelect(id: string): void
  onClose(id: string): void
}

function TabBar({
  tabOrder,
  chats,
  sessions,
  activeId,
  runningIds,
  appName,
  onSelect,
  onClose,
}: Props): JSX.Element {
  function labelFor(id: string): string {
    const s = sessions.find((s) => s.id === id)
    if (s?.title) return s.title
    if (s?.preview) return s.preview
    const c = chats[id]
    if (c) return c.cwd.split(/[\\/]/).pop() ?? id
    return id.slice(0, 8)
  }

  return (
    <div className="drag-region flex h-9 shrink-0 items-center gap-1 px-2">
      {tabOrder.map((id) => (
        <Tab
          key={id}
          label={labelFor(id)}
          active={id === activeId}
          running={runningIds.has(id)}
          onSelect={() => onSelect(id)}
          onClose={(e) => { e.stopPropagation(); onClose(id) }}
        />
      ))}
    </div>
  )
}

// chats changes identity on every streaming event; only the cwd of each
// tabbed session is read (label fallback), so compare just that instead of
// the map itself. With stable runningIds this keeps the tab strip idle while
// a background or foreground session streams.
export default memo(
  TabBar,
  (prev, next) =>
    prev.activeId === next.activeId &&
    prev.appName === next.appName &&
    prev.runningIds === next.runningIds &&
    prev.sessions === next.sessions &&
    prev.tabOrder.length === next.tabOrder.length &&
    prev.tabOrder.every((id, i) => id === next.tabOrder[i]) &&
    prev.tabOrder.every((id) => prev.chats[id]?.cwd === next.chats[id]?.cwd)
)
