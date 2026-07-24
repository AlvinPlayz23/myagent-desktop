import type { ChatState, ConnState } from '../state'
import { cn } from '../util'

interface Props {
  conn: ConnState
  detail?: string
  version?: string
  chat: ChatState | null
}

const LABEL: Record<ConnState, string> = {
  starting: 'starting server…',
  connected: 'connected',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected'
}

const DOT: Record<ConnState, string> = {
  starting: 'bg-warning',
  connected: 'bg-success',
  reconnecting: 'bg-warning [animation:blink_1s_steps(1)_infinite]',
  disconnected: 'bg-destructive'
}

export default function StatusBar({ conn, detail, version, chat }: Props): JSX.Element {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-2.5 border-t border-border px-4 text-[11px] text-muted-foreground">
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT[conn])} />
      <span title={detail}>
        {LABEL[conn]}
        {version ? ` · serve ${version}` : ''}
      </span>
      <span className="flex-1" />
      {chat && (
        <>
          {chat.running && <span className="font-medium text-primary">running</span>}
          <span className="font-mono" title="context size (last request total tokens)">
            {chat.lastTokens > 0 ? `${(chat.lastTokens / 1000).toFixed(1)}k tok` : '—'}
          </span>
          <span className="font-mono" title="cumulative cost this session">
            ${chat.cost.toFixed(4)}
          </span>
        </>
      )}
    </footer>
  )
}
