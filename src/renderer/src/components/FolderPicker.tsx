import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { DirListing, WorkspacePlaces } from '../../../shared/protocol'
import { api } from '../api'
import { baseName, cn } from '../util'
import { Button } from './ui/button'
import { AlertCircle, ArrowLeft01, ChevronRight, Folder01, FolderAdd, Loading03 } from './ui/icons'
import { BLOOM, bloomIn } from '../motion'

interface Props {
  /** Folder to open the picker at; the home folder when absent or unreadable. */
  startPath?: string | null
  onClose(): void
  onSelect(path: string): void
}

/**
 * In-app folder picker for adding a project.
 *
 * Replaces the native folder dialog: the OS dialog cannot wear the app's own
 * surface, and it cannot show the tree the way the rest of the window does. Only
 * directory names are read, one level per step, so navigating a deep tree costs
 * a single readdir per navigation rather than a walk of the whole disk.
 */
export default function FolderPicker({ startPath, onClose, onSelect }: Props): JSX.Element {
  const [places, setPlaces] = useState<WorkspacePlaces | null>(null)
  const [listing, setListing] = useState<DirListing | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  // Latest request wins: clicking through folders quickly must not let a slower
  // read overwrite the folder the user is actually looking at.
  const seq = useRef(0)
  const home = useRef<string | null>(null)

  const open = useCallback((path: string) => {
    const run = ++seq.current
    setBusy(true)
    setError(null)
    void api
      .listFolders(path)
      .then((next) => {
        if (run !== seq.current) return
        setListing(next)
      })
      .catch((err: unknown) => {
        if (run !== seq.current) return
        // A remembered project folder may have been deleted since it was added;
        // fall back to home instead of stranding the picker on an empty list.
        if (home.current && path !== home.current) {
          open(home.current)
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (run === seq.current) setBusy(false)
      })
  }, [])

  useEffect(() => {
    let live = true
    void api
      .folderPlaces()
      .then((next) => {
        if (!live) return
        home.current = next.home
        setPlaces(next)
        open(startPath || next.home)
      })
      .catch((err: unknown) => {
        if (!live) return
        setBusy(false)
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      live = false
    }
  }, [open, startPath])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Take focus off the composer: its own key handler would otherwise keep
  // receiving Escape/Enter behind the open dialog.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const current = listing?.path ?? null
  const parent = listing?.parent ?? null
  const confirm = (): void => {
    if (current) onSelect(current)
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-overlay p-5 backdrop-blur-[2px]"
      onMouseDown={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-picker-title"
        tabIndex={-1}
        className="flex h-[420px] max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-popover-border bg-popover text-popover-foreground shadow-lg focus:outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // Enter commits the folder already open, which is what the footer's
          // button does; Escape is handled on the window so it works anywhere.
          if (event.key === 'Enter') {
            event.preventDefault()
            confirm()
          }
        }}
        variants={bloomIn}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={BLOOM}
      >
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h2 id="folder-picker-title" className="m-0 text-ui-lg font-semibold text-foreground">
            Add a project
          </h2>
          <p className="mb-0 mt-1 text-ui-sm text-muted-foreground">
            Choose the folder this project lives in.
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              title="Parent folder"
              aria-label="Parent folder"
              onClick={() => parent && open(parent)}
              disabled={!parent}
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowLeft01 size={14} strokeWidth={1.8} />
            </button>
            <span
              className="min-w-0 flex-1 truncate rounded-lg border border-input bg-subtle px-2.5 py-1.5 font-mono text-ui-sm text-foreground"
              title={current ?? undefined}
            >
              {current ?? '—'}
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {places && (
            <div className="w-32 shrink-0 overflow-y-auto border-r border-border p-1">
              {[{ label: 'Home', path: places.home }, ...places.roots.map((root) => ({ label: root, path: root }))].map(
                (place) => (
                  <button
                    key={place.path}
                    type="button"
                    title={place.path}
                    onClick={() => open(place.path)}
                    className={cn(
                      'flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-ui-sm transition-colors',
                      current === place.path
                        ? 'bg-selected text-foreground'
                        : 'text-foreground-subtle hover:bg-hover hover:text-foreground'
                    )}
                  >
                    <Folder01
                      size={13}
                      strokeWidth={1.7}
                      className="shrink-0 text-foreground-subtlest"
                      aria-hidden
                    />
                    <span className="min-w-0 truncate">{place.label}</span>
                  </button>
                )
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {error && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-ui-sm text-destructive-foreground">
                <AlertCircle size={14} strokeWidth={1.8} className="mt-0.5 shrink-0" />
                <span className="min-w-0">{error}</span>
              </div>
            )}
            {listing === null && busy && !error && (
              <div className="flex items-center gap-2 px-3 py-3 text-ui-sm text-foreground-subtlest">
                <Loading03 size={13} strokeWidth={1.8} className="shrink-0 animate-spin" />
                Loading…
              </div>
            )}
            {listing !== null && listing.dirs.length === 0 && (
              <div className="px-3 py-3 text-ui-sm text-foreground-subtlest">No folders here.</div>
            )}
            {listing?.dirs.map((dir) => (
              <button
                key={dir.path}
                type="button"
                title={dir.path}
                onClick={() => open(dir.path)}
                className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 text-left text-ui-sm text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground"
              >
                <Folder01
                  size={14}
                  strokeWidth={1.6}
                  className="shrink-0 text-foreground-subtlest"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{dir.name}</span>
                <ChevronRight
                  size={12}
                  strokeWidth={1.8}
                  className="shrink-0 text-foreground-subtlest"
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
          <span
            className="min-w-0 truncate font-mono text-ui-sm text-muted-foreground"
            title={current ?? undefined}
          >
            {current ? baseName(current) : ''}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirm} disabled={!current || busy}>
              <FolderAdd size={14} strokeWidth={1.8} />
              Add project
            </Button>
          </span>
        </div>
      </motion.section>
    </motion.div>
  )
}
