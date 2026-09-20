import { useEffect, useState } from 'react'
import { Copy01, Square } from './ui/icons'

function MinimizeGlyph(): JSX.Element {
  return <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5.5h8" /></svg>
}

function CloseGlyph(): JSX.Element {
  return <svg viewBox="0 0 10 10" aria-hidden="true"><path d="m1.5 1.5 7 7m0-7-7 7" /></svg>
}

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
        <MinimizeGlyph />
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
        <CloseGlyph />
      </button>
    </div>
  )
}
