import { memo } from 'react'
import { motion } from 'motion/react'
import type { ChatState, ConnState } from '../state'
import { cn } from '../util'
import { FlipMetricValue } from './ui/flip-metric-value'

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

function StatusBar({ conn, detail, version, chat }: Props): JSX.Element {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-2.5 px-4 text-ui-sm text-muted-foreground">
      <motion.span
        key={conn}
        className={cn('size-1.5 shrink-0 rounded-full', DOT[conn])}
        initial={{ scale: 0.4, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      />
      <span title={detail}>
        {LABEL[conn]}
        {version ? ` · serve ${version}` : ''}
      </span>
      <span className="flex-1" />
      {chat && (
        <>
          {chat.running && (
            <motion.span
              className="font-medium text-primary"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              running
            </motion.span>
          )}
          <span className="flex items-center gap-1 font-mono" title="context size (last request total tokens)">
            <FlipMetricValue value={chat.lastTokens > 0 ? `${(chat.lastTokens / 1000).toFixed(1)}k` : '—'} />
            <span>tok</span>
          </span>
          <span className="font-mono" title="cumulative cost this session">
            $<FlipMetricValue value={chat.cost.toFixed(4)} />
          </span>
        </>
      )}
    </footer>
  )
}

// The active ChatState gets a new identity on every streaming event, but the
// status bar only reads running/lastTokens/cost, which move on message
// boundaries — not per delta. Comparing those fields keeps the footer idle
// while text streams.
export default memo(
  StatusBar,
  (prev, next) =>
    prev.conn === next.conn &&
    prev.detail === next.detail &&
    prev.version === next.version &&
    prev.chat?.running === next.chat?.running &&
    prev.chat?.lastTokens === next.chat?.lastTokens &&
    prev.chat?.cost === next.chat?.cost
)
