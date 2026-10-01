import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, CodeSimple, Folder01 } from './ui/icons'
import { api } from '../api'
import { BLOOM_FAST, bloomDown } from '../motion'

type Target = 'explorer' | 'vscode'

const TARGETS: { id: Target; label: string; Icon: typeof Folder01 }[] = [
  { id: 'explorer', label: 'File Explorer', Icon: Folder01 },
  { id: 'vscode', label: 'VS Code', Icon: CodeSimple }
]

// "Open" pill for the tab strip: reveals the active session's project folder
// in an external app. It lives in the title bar left of the frameless
// window's caption controls (3 x 46px = 138px, fixed top-right) — App.tsx
// offsets it by right-[148px] so it never covers minimize/maximize/close.
export default function OpenWith({ cwd, disabled }: { cwd: string; disabled?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<Target | null>(null)
  const [failed, setFailed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const failTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [open])

  const pick = async (target: Target): Promise<void> => {
    setOpen(false)
    setBusy(target)
    try {
      const ok = await api.openWith(target, cwd)
      // The main process returns false when the folder is gone or the target
      // app is unavailable — surface that instead of failing silently.
      if (!ok) {
        setFailed(true)
        if (failTimer.current !== null) window.clearTimeout(failTimer.current)
        failTimer.current = window.setTimeout(() => setFailed(false), 2600)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={rootRef} className="no-drag relative">
      <button
        type="button"
        aria-label="Open project folder"
        aria-expanded={open}
        disabled={disabled}
        title={cwd}
        onClick={() => setOpen((v) => !v)}
        className={
          'flex h-7 items-center gap-1.5 rounded-full border border-border bg-card/70 pl-2.5 pr-2 text-ui-sm font-medium text-foreground shadow-sm transition-colors hover:bg-card disabled:pointer-events-none disabled:opacity-40 ' +
          (open ? 'bg-selected' : '')
        }
      >
        <span className="truncate">Open</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="grid place-items-center text-muted-foreground">
          <ChevronDown size={12} strokeWidth={2} />
        </motion.span>
      </button>

      <AnimatePresence>
        {failed && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-9 z-50 whitespace-nowrap rounded-lg border border-popover-border bg-menu px-2.5 py-1 text-ui-sm text-muted-foreground shadow-md"
          >
            Couldn't open — folder missing or app not installed
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={bloomDown}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={BLOOM_FAST}
            className="absolute right-0 top-9 z-50 w-[190px] overflow-hidden rounded-lg border border-popover-border bg-menu py-1 shadow-md"
          >
            {TARGETS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-ui-caption text-foreground transition-colors hover:bg-hover"
                onClick={() => void pick(id)}
              >
                <Icon size={14} strokeWidth={1.8} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {busy === id && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
