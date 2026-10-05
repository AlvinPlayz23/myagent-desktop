import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { AlertCircle, Loading03 } from './ui/icons'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { api } from '../api'
import { BLOOM, bloomIn } from '../motion'
import { toolIcon } from '../toolMeta'
import type { SessionTool } from '../../../shared/protocol'

interface Props {
  sessionId: string
  onClose(): void
  /** Called with the deny list the server actually stored, once a save succeeds. */
  onSaved(disabled: string[]): void
}

/**
 * /tools — pick which tools the model may use.
 *
 * The tool SET is server-owned: `session.tools` reports the registry, which can
 * include plugin-provided tools, and each tool's description comes from the
 * model's own tool definition. Nothing here hardcodes a tool list; only the
 * icons are local (see toolMeta.ts), and they fall back to a generic glyph.
 *
 * Toggles are STAGED locally and published on Save. That mirrors the TUI's
 * /tools picker, which edits a pending deny set and only writes when the panel
 * closes, and it means a half-finished edit never reaches the model's system
 * prompt. Cancelling discards the staging.
 *
 * There is no scope chooser here. On the serve path `session.setTools`
 * persists to config.json and applies to the live session at once; the TUI's
 * session-vs-global choice needs a session-state store the server does not have.
 */
export default function ToolsModal({ sessionId, onClose, onSaved }: Props): JSX.Element {
  const [catalog, setCatalog] = useState<SessionTool[] | null>(null)
  const [disabled, setDisabled] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [sel, setSel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // The server's list at open time, so Save can tell a real edit from a no-op.
  const [original, setOriginal] = useState<string[]>([])
  const panelRef = useRef<HTMLElement>(null)
  // Guards the keydown effect from re-subscribing on every toggle: the handler
  // reads the staged set through a ref instead of closing over it.
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  useEffect(() => {
    let live = true
    api
      .sessionTools(sessionId)
      .then((result) => {
        if (!live) return
        setCatalog(result.tools)
        setDisabled(new Set(result.disabled))
        setOriginal([...result.disabled].sort())
        setRunning(result.running)
      })
      .catch((err: unknown) => {
        if (live) setLoadError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      live = false
    }
  }, [sessionId])

  const busy = saving || (catalog !== null && running)
  const total = catalog?.length ?? 0
  const enabledCount = catalog === null ? 0 : catalog.filter((tool) => !disabled.has(tool.name)).length

  // Sorted so the persisted deny list is deterministic regardless of the order
  // the user toggled things in — the same reason the TUI sorts.
  const pending = useCallback(() => Array.from(disabledRef.current).sort(), [])

  // Both sides are sorted, so a plain join compares them. Saves a pointless
  // RPC and a config.json rewrite when the user opens /tools and saves as-is.
  const dirty = useMemo(
    () => Array.from(disabled).sort().join(',') !== original.join(','),
    [disabled, original]
  )

  const toggle = useCallback((name: string) => {
    setDisabled((current) => {
      const next = new Set(current)
      if (!next.delete(name)) next.add(name)
      return next
    })
  }, [])

  const save = useCallback(async () => {
    // Nothing staged differently — close instead of rewriting config.json.
    if (!dirty) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await api.setTools(sessionId, pending())
      onSaved(result.disabled)
      onClose()
    } catch (err) {
      // A run that started while the modal was open is the common case; the
      // staged toggles are kept so the user can retry after stopping it.
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [dirty, onClose, onSaved, pending, sessionId])

  const move = useCallback(
    (delta: number) => {
      if (total === 0) return
      setSel((current) => ((current + delta) % total + total) % total)
    },
    [total]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !saving) {
        onClose()
        return
      }
      if (catalog === null || busy) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        move(1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        move(-1)
      } else if (event.key === ' ') {
        // Space toggles (as in the TUI picker); Enter saves. Binding Enter to
        // toggle instead would leave a keyboard-only user no way to commit.
        const tool = catalog[sel]
        if (!tool) return
        event.preventDefault()
        toggle(tool.name)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, catalog, move, onClose, save, saving, sel, toggle])

  // Move focus into the dialog on mount. Without this the composer textarea
  // keeps focus and its own React key handler keeps receiving ArrowUp/Down,
  // Space and Enter — silently moving the caret and typing spaces behind an
  // open modal. It also gives the dialog a real focus target for a11y.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const rows = useMemo(() => catalog ?? [], [catalog])

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-overlay p-5 backdrop-blur-[2px]"
      onMouseDown={() => !saving && onClose()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tools-modal-title"
        tabIndex={-1}
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-popover-border bg-popover text-popover-foreground shadow-lg focus:outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        variants={bloomIn}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={BLOOM}
      >
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h2 id="tools-modal-title" className="m-0 text-ui-lg font-semibold text-foreground">
            Tools
          </h2>
          <p className="mb-0 mt-1 text-ui-sm text-muted-foreground">
            Choose which tools the model can use. Saved for every session.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loadError && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-3 text-ui-sm text-destructive-foreground">
              <AlertCircle size={15} strokeWidth={1.8} className="mt-0.5 shrink-0" />
              <span className="min-w-0">{loadError}</span>
            </div>
          )}

          {catalog === null && !loadError && (
            <div className="flex items-center justify-center gap-2 px-3 py-8 text-ui-sm text-muted-foreground">
              <Loading03 size={14} strokeWidth={1.8} className="shrink-0 animate-spin" />
              Loading tools…
            </div>
          )}

          {catalog !== null && rows.length === 0 && (
            <p className="px-3 py-8 text-center text-ui-sm text-muted-foreground">
              No tools available for this session.
            </p>
          )}

          {rows.map((tool, index) => {
            const Icon = toolIcon(tool.name)
            const off = disabled.has(tool.name)
            return (
              <button
                key={tool.name}
                type="button"
                // Pointer and keyboard drive the SAME cursor, so clicking a row
                // moves the highlight there instead of toggling row 4 while the
                // focus ring stays parked on row 0 — where the next Space would
                // toggle something else entirely.
                onMouseEnter={() => setSel(index)}
                onClick={() => {
                  setSel(index)
                  toggle(tool.name)
                }}
                // The row is the hit target; the checkbox is decorative so it
                // must not swallow the click or add a second tab stop.
                aria-pressed={!off}
                className={
                  'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ' +
                  (index === sel ? 'bg-selected' : 'hover:bg-hover')
                }
              >
                <Icon
                  size={15}
                  strokeWidth={1.6}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-ui-caption text-foreground">
                    {tool.name}
                  </span>
                  <span className="mt-0.5 block truncate text-ui-sm text-muted-foreground">
                    {tool.description}
                  </span>
                </span>
                <Checkbox
                  checked={!off}
                  // Decorative only: the row button owns the interaction and
                  // exposes aria-pressed. `disabled` is deliberately NOT set —
                  // the primitive dims disabled boxes to 64% opacity, which
                  // would make every ENABLED tool look unavailable.
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                  className="mt-0.5"
                />
              </button>
            )
          })}
        </div>

        <div className="shrink-0 border-t border-border px-5 py-3">
          {running && (
            <p className="mb-2 mt-0 flex items-center gap-1.5 text-ui-sm text-muted-foreground">
              <Loading03 size={13} strokeWidth={1.8} className="shrink-0 animate-spin" />
              Stop the run to change tools.
            </p>
          )}
          {error && <p className="mb-2 mt-0 text-ui-sm text-destructive-foreground">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <span className="text-ui-sm text-muted-foreground">
              {enabledCount} of {total} enabled
            </span>
            <span className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              {/* Disabled until something actually changed, so the button does
                  not promise a save that would be a no-op. */}
              <Button
                size="sm"
                onClick={() => void save()}
                loading={saving}
                disabled={busy || !dirty || catalog === null || rows.length === 0}
              >
                Save
              </Button>
            </span>
          </div>
        </div>
      </motion.section>
    </motion.div>
  )
}
