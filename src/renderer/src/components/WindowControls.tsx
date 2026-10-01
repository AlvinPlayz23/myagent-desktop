import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, MinusSignIcon } from '@hugeicons/core-free-icons'
import { Copy01, Square } from './ui/icons'

export default function WindowControls(): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.myagent.windowMaximized().then(setMaximized).catch(() => {})
    const off = window.myagent.onWindowMaximized(setMaximized)
    // The toggle IPC resolves before DWM settles, so its return value can be
    // stale — the pushed event is the source of truth. Re-sync on focus in
    // case an event was ever missed while the window was away.
    const onFocus = (): void => {
      window.myagent.windowMaximized().then(setMaximized).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return (
    <div className="window-controls no-drag">
      <button
        className="window-control"
        type="button"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => window.myagent.minimizeWindow().catch(() => {})}
      >
        <HugeiconsIcon icon={MinusSignIcon} size={14} strokeWidth={1.5} className="window-control-hugeicon" aria-hidden="true" />
      </button>
      <button
        className="window-control"
        type="button"
        aria-label={maximized ? 'Restore down' : 'Maximize'}
        title={maximized ? 'Restore down' : 'Maximize'}
        onClick={() => window.myagent.toggleMaximizeWindow().catch(() => {})}
      >
        {maximized ? (
          <Copy01 size={12} strokeWidth={1.8} className="window-control-hugeicon" aria-hidden="true" />
        ) : (
          <Square size={12} strokeWidth={1.8} className="window-control-hugeicon" aria-hidden="true" />
        )}
      </button>
      <button
        className="window-control window-control-close"
        type="button"
        aria-label="Close"
        title="Close"
        onClick={() => window.myagent.closeWindow().catch(() => {})}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} className="window-control-hugeicon" aria-hidden="true" />
      </button>
    </div>
  )
}
