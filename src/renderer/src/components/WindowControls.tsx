import { useEffect, useState } from 'react'

function MinimizeGlyph(): JSX.Element {
  return <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5.5h8" /></svg>
}

function MaximizeGlyph(): JSX.Element {
  return <svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" /></svg>
}

function RestoreGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M3.5 1.5h5v5M6.5 3.5h-5v5h5" />
    </svg>
  )
}

function CloseGlyph(): JSX.Element {
  return <svg viewBox="0 0 10 10" aria-hidden="true"><path d="m1.5 1.5 7 7m0-7-7 7" /></svg>
}

export default function WindowControls(): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.myagent.windowMaximized().then(setMaximized).catch(() => {})
    return window.myagent.onWindowMaximized(setMaximized)
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
        onClick={() => window.myagent.toggleMaximizeWindow().then(setMaximized).catch(() => {})}
      >
        {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
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
