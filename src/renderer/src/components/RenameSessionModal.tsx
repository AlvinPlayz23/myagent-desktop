import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { BLOOM, bloomIn } from '../motion'

interface Props {
  initialTitle: string
  onClose(): void
  onSave(title: string): Promise<void>
}

// RenameSessionModal avoids window.prompt(), which may be disabled or invisible
// in Electron depending on the BrowserWindow configuration.
export default function RenameSessionModal({ initialTitle, onClose, onSave }: Props): JSX.Element {
  const [title, setTitle] = useState(initialTitle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    const value = title.trim()
    if (!value) {
      setError('A session title is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(value)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-5 backdrop-blur-[2px]"
      onMouseDown={() => !saving && onClose()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.form
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={bloomIn}
        transition={BLOOM}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="m-0 text-[15px] font-semibold text-foreground">Rename session</h2>
          <p className="mb-0 mt-1 text-[12px] text-muted-foreground">This title is saved with the session.</p>
        </div>
        <div className="p-5">
          <label className="block text-[12px] font-medium text-foreground" htmlFor="session-title">Session title</label>
          <input
            id="session-title"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 h-10 w-full rounded-lg border border-input bg-subtle px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
            placeholder="Session title"
            disabled={saving}
          />
          {error && <p className="mb-0 mt-2 text-[12px] text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" className="rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-hover hover:text-foreground" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-medium text-background disabled:opacity-50" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </motion.form>
    </motion.div>
  )
}
