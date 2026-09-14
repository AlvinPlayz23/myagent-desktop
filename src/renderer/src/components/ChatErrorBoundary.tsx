import { Component, type ReactNode } from 'react'

// A render crash in one transcript row (e.g. a malformed streamed message)
// must never blank the whole app and force a reload. This boundary catches it
// and renders an inline fallback so the rest of the session stays usable.
// Keyed by session id at the call site so a new session resets the boundary.
export default class ChatErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error('Chat render failed:', error)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="mx-auto flex max-w-3xl flex-col px-5 pb-6 pt-7 sm:px-8">
          <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            <div className="text-[13px] font-semibold text-foreground">Something went wrong showing this transcript.</div>
            <p className="mt-1">The app is still running — your session is safe.</p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-2 rounded-md px-2 py-1 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-hover hover:text-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
