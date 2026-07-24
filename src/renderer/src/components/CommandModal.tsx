import { useEffect } from 'react'
import { commands } from '../commands'

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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-5 backdrop-blur-[2px]" onMouseDown={onClose}>
      <section className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-elevated shadow-2xl [animation:pop_0.18s_ease]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="border-b border-border px-5 py-4">
          <h2 className="m-0 text-[15px] font-semibold text-foreground">Commands</h2>
          <p className="mb-0 mt-1 text-[12px] text-muted-foreground">Type / in the composer to search and run a command.</p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {commands.map((command) => (
            <div key={command.name} className="flex items-center gap-4 rounded-xl px-3 py-3">
              <code className="w-44 shrink-0 font-mono text-[12px] text-foreground">{command.usage}</code>
              <span className="text-[12px] text-muted-foreground">{command.description}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
