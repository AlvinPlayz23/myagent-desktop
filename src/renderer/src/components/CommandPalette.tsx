import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { SessionMeta } from '../../../shared/protocol'
import { baseName, cn, relTime } from '../util'
import { Folder01, Message01, Search01, Sparkles } from './ui/icons'

/**
 * One runnable action offered by the palette. Sessions and projects are passed
 * separately because they are data, not app actions; everything else (open a
 * panel, compact, stop, open settings) arrives here so App stays the single
 * owner of what the app can do.
 */
export interface PaletteCommand {
  id: string
  label: string
  detail?: string
  hint?: string
  /** Defaults to "Actions". */
  group?: string
  run(): void
}

interface Entry {
  key: string
  group: string
  label: string
  detail?: string
  hint?: string
  icon: ReactNode
  run(): void
}

const GROUP_ORDER = ['Actions', 'Projects', 'Sessions']

// Sessions are the long tail; without a query the palette shows the recent
// slice only, so opening it stays a glance rather than a directory listing.
const SESSION_LIMIT = 30

export default function CommandPalette({
  commands,
  sessions,
  projects,
  runningIds,
  onOpenSession,
  onCompose,
  onAddProject,
  onClose
}: {
  commands: PaletteCommand[]
  sessions: SessionMeta[]
  projects: { cwd: string; name: string }[]
  runningIds: Set<string>
  onOpenSession(id: string): void
  onCompose(cwd: string): void
  onAddProject(): void
  onClose(): void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const entries = useMemo<Entry[]>(() => {
    const actions: Entry[] = commands.map((command) => ({
      key: command.id,
      group: command.group ?? 'Actions',
      label: command.label,
      detail: command.detail,
      hint: command.hint,
      icon: <Sparkles size={15} strokeWidth={1.6} />,
      run: command.run
    }))
    const projectEntries: Entry[] = projects.map((project) => ({
      key: `project:${project.cwd}`,
      group: 'Projects',
      label: project.name,
      detail: project.cwd,
      hint: 'compose',
      icon: <Folder01 size={15} strokeWidth={1.6} />,
      run: () => onCompose(project.cwd)
    }))
    // "Add project…" is an action, but it belongs with the project list it
    // extends rather than in the generic Actions run.
    projectEntries.unshift({
      key: 'add-project',
      group: 'Projects',
      label: 'Add project…',
      detail: 'Choose a folder to work in',
      icon: <Folder01 size={15} strokeWidth={1.6} />,
      run: onAddProject
    })
    const sessionEntries: Entry[] = sessions.slice(0, SESSION_LIMIT).map((session) => ({
      key: `session:${session.id}`,
      group: 'Sessions',
      label: session.title || session.preview || 'Untitled task',
      detail: baseName(session.cwd),
      hint: runningIds.has(session.id) ? 'running' : relTime(session.modified),
      icon: <Message01 size={15} strokeWidth={1.6} />,
      run: () => onOpenSession(session.id)
    }))
    return [...actions, ...projectEntries, ...sessionEntries]
  }, [commands, projects, sessions, runningIds, onCompose, onAddProject, onOpenSession])

  const needle = query.trim().toLowerCase()
  const matched = useMemo(
    () =>
      needle
        ? entries.filter((entry) =>
            `${entry.label} ${entry.detail ?? ''}`.toLowerCase().includes(needle)
          )
        : entries,
    [entries, needle]
  )

  // Grouped rendering plus a flat index: keyboard navigation walks the same
  // order the eye does, across headers that are not focusable.
  const rows = useMemo(() => {
    const out: Array<
      | { kind: 'header'; key: string; label: string }
      | { kind: 'item'; key: string; entry: Entry; index: number }
    > = []
    let index = 0
    for (const group of GROUP_ORDER) {
      const items = matched.filter((entry) => entry.group === group)
      if (items.length === 0) continue
      out.push({ kind: 'header', key: `header:${group}`, label: group })
      for (const entry of items) {
        out.push({ kind: 'item', key: entry.key, entry, index })
        index++
      }
    }
    return out
  }, [matched])

  useEffect(() => {
    setActive(0)
  }, [needle])

  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const total = matched.length
  const runEntry = (entry: Entry | undefined): void => {
    if (!entry) return
    onClose()
    entry.run()
  }
  const step = (delta: number): void => {
    if (total === 0) return
    setActive((current) => (current + delta + total) % total)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runEntry(matched[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="no-drag fixed inset-0 z-[100] flex items-start justify-center bg-overlay px-4 pt-[12vh]"
      onMouseDown={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        initial={{ opacity: 0, y: -6, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className="flex max-h-[min(64vh,520px)] w-[620px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-border bg-shell shadow-[var(--shadow-pop)]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4">
          <Search01 size={15} strokeWidth={1.7} className="shrink-0 text-foreground-subtle" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions, projects and actions"
            aria-label="Search sessions, projects and actions"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-ui-base text-foreground outline-none placeholder:text-foreground-subtlest"
          />
          <kbd className="shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-ui-sm text-foreground-subtlest">
            esc
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {total === 0 ? (
            <p className="px-3 py-8 text-center text-ui-sm text-foreground-subtle">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            rows.map((row) =>
              row.kind === 'header' ? (
                <div
                  key={row.key}
                  className="px-2.5 pb-1 pt-2 text-ui-sm font-medium text-foreground-subtlest"
                >
                  {row.label}
                </div>
              ) : (
                <button
                  key={row.key}
                  ref={(node) => {
                    itemRefs.current[row.index] = node
                  }}
                  type="button"
                  onClick={() => runEntry(row.entry)}
                  onMouseMove={() => setActive(row.index)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left outline-none transition-colors duration-[var(--duration-instant)]',
                    row.index === active
                      ? 'bg-selected text-foreground'
                      : 'text-foreground-subtle hover:bg-hover hover:text-foreground'
                  )}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md text-foreground-subtle">
                    {row.entry.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui-base">{row.entry.label}</span>
                    {row.entry.detail && (
                      <span className="block truncate font-mono text-ui-sm text-foreground-subtlest">
                        {row.entry.detail}
                      </span>
                    )}
                  </span>
                  {row.entry.hint && (
                    <span className="shrink-0 font-mono text-ui-sm text-foreground-subtlest">
                      {row.entry.hint}
                    </span>
                  )}
                </button>
              )
            )
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-1.5 text-ui-sm text-foreground-subtlest">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>{total === 1 ? '1 result' : `${total} results`}</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
