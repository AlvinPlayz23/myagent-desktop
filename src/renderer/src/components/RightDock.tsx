import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cn } from '../util'
import {
  Cancel01,
  File01,
  Folder01,
  GitBranch01,
  Plus,
  Robot01,
  type IconComponent
} from './ui/icons'

export type DockTabKind = 'file' | 'files' | 'git' | 'subagents'

export interface DockTab {
  id: string
  kind: DockTabKind
  label: string
  path?: string
  cwd?: string
}

const MIN_WIDTH = 320
const MAX_WIDTH = 680
const DEFAULT_WIDTH = 420
const WIDTH_KEY = 'myagent.desktop.dockWidth'

function loadWidth(): number {
  try {
    const stored = Number(localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(stored) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, stored)) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

const ADD_ITEMS: { kind: 'files' | 'git' | 'subagents'; label: string; Icon: IconComponent }[] = [
  { kind: 'files', label: 'Files', Icon: Folder01 },
  { kind: 'git', label: 'Git', Icon: GitBranch01 },
  { kind: 'subagents', label: 'Subagents', Icon: Robot01 }
]

function tabIcon(kind: DockTabKind): IconComponent {
  if (kind === 'git') return GitBranch01
  if (kind === 'subagents') return Robot01
  if (kind === 'files') return Folder01
  return File01
}

function DockTabButton({
  tab,
  active,
  onActivate,
  onClose
}: {
  tab: DockTab
  active: boolean
  onActivate(): void
  onClose(): void
}): JSX.Element {
  const Icon = tabIcon(tab.kind)
  return (
    <div
      className={cn(
        'group flex h-7 max-w-[190px] shrink-0 items-center rounded-md transition-colors',
        active ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        title={tab.path ?? tab.label}
        onClick={onActivate}
        className="flex min-w-0 items-center gap-1.5 py-1 pl-2 pr-1 text-ui-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon size={13} strokeWidth={1.7} className="shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{tab.label}</span>
      </button>
      <button
        type="button"
        title={`Close ${tab.label}`}
        aria-label={`Close ${tab.label}`}
        onClick={onClose}
        className={cn(
          'mr-1 grid size-5 shrink-0 place-items-center rounded-sm transition-opacity hover:bg-hover',
          active ? 'opacity-70' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        )}
      >
        <Cancel01 size={11} strokeWidth={2} />
      </button>
    </div>
  )
}

interface Props {
  tabs: DockTab[]
  activeId: string
  onActivate(id: string): void
  onClose(id: string): void
  onAdd(kind: 'files' | 'git' | 'subagents'): void
  children: ReactNode
}

export default function RightDock({
  tabs,
  activeId,
  onActivate,
  onClose,
  onAdd,
  children
}: Props): JSX.Element {
  const [width, setWidth] = useState(loadWidth)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    let latest = startWidth
    const move = (next: PointerEvent): void => {
      latest = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + startX - next.clientX))
      setWidth(latest)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try {
        localStorage.setItem(WIDTH_KEY, String(latest))
      } catch {
        // Storage can be unavailable; the in-memory width still works.
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <aside
      aria-label="Right panel"
      style={{ width }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-l border-border-seam bg-background"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={beginResize}
        className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize transition-colors hover:bg-border-seam"
      />

      <div className="flex h-9 shrink-0 items-center border-b border-border-seam">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
          {tabs.map((tab) => (
            <DockTabButton
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
              onActivate={() => onActivate(tab.id)}
              onClose={() => onClose(tab.id)}
            />
          ))}
        </div>
        <div ref={menuRef} className="relative shrink-0 px-1">
          <button
            type="button"
            title="Add panel tab"
            aria-label="Add panel tab"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className={cn(
              'grid size-7 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              menuOpen ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
            )}
          >
            <Plus size={14} strokeWidth={2} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-1 top-8 z-50 w-48 overflow-hidden rounded-lg border border-popover-border bg-menu p-1 shadow-[var(--shadow-pop)]"
            >
              {ADD_ITEMS.map((item) => {
                const Icon = item.Icon
                const open = tabs.some((tab) => tab.kind === item.kind)
                return (
                  <button
                    key={item.kind}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAdd(item.kind)
                      setMenuOpen(false)
                    }}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ui-sm text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
                  >
                    <Icon size={14} strokeWidth={1.7} className="shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {open && <span className="shrink-0 text-ui-xs text-foreground-subtlest">Open</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </aside>
  )
}
