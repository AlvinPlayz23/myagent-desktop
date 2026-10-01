import { useEffect } from 'react'
import { motion } from 'motion/react'
import { commands } from '../commands'
import { BLOOM, bloomIn } from '../motion'

export default function CommandModal({
  onClose
}: {
  onClose(): void
}): JSX.Element {
  useEffect(() => {
    const close = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

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
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-popover-border bg-popover text-popover-foreground shadow-lg"
        onMouseDown={(event) => event.stopPropagation()}
        variants={bloomIn}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={BLOOM}
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="m-0 text-ui-lg font-semibold text-foreground">Commands</h2>
          <p className="mb-0 mt-1 text-ui-sm text-muted-foreground">Type / in the composer to search and run a command.</p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {commands.map((command) => (
            <div key={command.name} className="flex items-center gap-4 rounded-xl px-3 py-3">
              <code className="w-44 shrink-0 font-mono text-ui-sm text-foreground">{command.usage}</code>
              <span className="text-ui-sm text-muted-foreground">{command.description}</span>
            </div>
          ))}
        </div>
      </motion.section>
    </motion.div>
  )
}
