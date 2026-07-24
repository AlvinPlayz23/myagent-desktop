// Right-side drawer visualizing the LLM provider connection: one row per
// agent turn, expandable into a request timeline. See ./README.md.
import { useState } from 'react'
import { useLlmTrace } from './useLlmTrace'
import type { LlmTurn } from './types'
import { cn } from '../util'
import { ChevronRight, Alert02, Loading03 } from '../components/ui/icons'

interface Props {
  sessionId: string
  open: boolean
  onClose: () => void
}

const STATUS_DOT: Record<LlmTurn['status'], string> = {
  pending: 'bg-warning',
  retrying: 'bg-warning [animation:blink_1s_steps(1)_infinite]',
  streaming: 'bg-primary animate-pulse',
  done: 'bg-success',
  error: 'bg-destructive',
  aborted: 'bg-muted-foreground'
}

const STATUS_LABEL: Record<LlmTurn['status'], string> = {
  pending: 'queued…',
  retrying: 'retrying…',
  streaming: 'streaming…',
  done: 'done',
  error: 'error',
  aborted: 'aborted'
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k tok` : `${n} tok`
}

function elapsed(turn: LlmTurn, now: number): number {
  return (turn.endedAt ?? now) - turn.startedAt
}

interface Segment {
  label: string
  ms: number
  ok: boolean
}

// Builds an honest (not over-precise) waterfall from the timestamps we
// actually have: turn_start, each retry announcement, first-byte, and end.
// A segment that ends in a retry marker spans "attempt + backoff + detect
// failure" combined — the client can't see attempt/backoff as separate
// events, so they aren't drawn as separate bars. See README's "known
// limitation" section.
function buildSegments(turn: LlmTurn): Segment[] {
  const markers: { t: number; label: string; ok: boolean }[] = [{ t: turn.startedAt, label: 'start', ok: true }]
  turn.retries.forEach((r) => {
    markers.push({ t: r.at, label: `attempt ${r.attempt - 1}/${r.maxAttempts} failed, retrying`, ok: false })
  })
  if (turn.ttfbAt) {
    markers.push({ t: turn.ttfbAt, label: 'first byte', ok: true })
  } else if (turn.endedAt) {
    markers.push({ t: turn.endedAt, label: 'final attempt failed', ok: false })
  }

  const segments: Segment[] = []
  for (let i = 1; i < markers.length; i++) {
    segments.push({ label: markers[i].label, ms: markers[i].t - markers[i - 1].t, ok: markers[i].ok })
  }
  if (turn.ttfbAt && turn.endedAt) {
    segments.push({ label: 'streaming', ms: turn.endedAt - turn.ttfbAt, ok: turn.status !== 'error' })
  }
  return segments
}

function Waterfall({ turn }: { turn: LlmTurn }): JSX.Element {
  const segments = buildSegments(turn)
  const max = Math.max(1, ...segments.map((s) => s.ms))
  return (
    <div className="flex flex-col gap-1">
      {segments.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className={cn('w-40 shrink-0 truncate', s.ok ? 'text-muted-foreground' : 'text-destructive-foreground')}>
            {s.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted/60">
            <span
              className={cn('block h-full rounded-full', s.ok ? 'bg-primary/70' : 'bg-destructive/70')}
              style={{ width: `${Math.max(4, (s.ms / max) * 100)}%` }}
            />
          </span>
          <span className="w-12 shrink-0 text-right font-mono text-muted-foreground">{formatMs(s.ms)}</span>
        </div>
      ))}
    </div>
  )
}

function TurnRow({ turn, expanded, onToggle }: { turn: LlmTurn; expanded: boolean; onToggle: () => void }): JSX.Element {
  const now = Date.now()
  return (
    <div className="border-b border-border/60 px-3 py-2 text-[12px]">
      <button
        className="group flex w-full items-center gap-2 rounded-md py-0.5 text-left transition-colors hover:bg-hover/60"
        onClick={onToggle}
      >
        <ChevronRight
          size={12}
          className={cn('shrink-0 text-muted-foreground/70 transition-transform', expanded && 'rotate-90')}
        />
        <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[turn.status])} />
        <span className="shrink-0 font-mono font-medium text-foreground">#{turn.id}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {turn.model ?? 'model unknown'}
        </span>
        {turn.status === 'streaming' && <Loading03 size={12} strokeWidth={1.8} className="animate-spin text-primary" />}
        {(turn.status === 'error' || turn.status === 'aborted') && (
          <Alert02 size={12} strokeWidth={1.8} className="text-destructive" />
        )}
      </button>

      <div className="ml-[18px] mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{STATUS_LABEL[turn.status]}</span>
        <span>·</span>
        <span className="font-mono">{formatMs(elapsed(turn, now))}</span>
        {turn.retries.length > 0 && (
          <>
            <span>·</span>
            <span>retried {turn.retries.length}x</span>
          </>
        )}
        {turn.usage && (
          <>
            <span>·</span>
            <span className="font-mono">{formatTokens(turn.usage.totalTokens)}</span>
            <span>·</span>
            <span className="font-mono">${turn.usage.cost.total.toFixed(4)}</span>
          </>
        )}
      </div>

      {expanded && (
        <div className="ml-[18px] mt-2 flex flex-col gap-2 rounded-md border border-border/60 bg-subtle/60 p-2.5">
          <Waterfall turn={turn} />
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 border-t border-border/50 pt-2 text-[11px]">
            <span className="text-muted-foreground">provider</span>
            <span className="truncate font-mono">{turn.provider ?? '—'}</span>
            <span className="text-muted-foreground">stop reason</span>
            <span className="truncate font-mono">{turn.stopReason ?? '—'}</span>
            {turn.retries.length > 0 && (
              <>
                <span className="text-muted-foreground">retries</span>
                <span className="font-mono">
                  {turn.retries.length} / {turn.retries[turn.retries.length - 1]?.maxAttempts ?? '?'} max attempts
                </span>
              </>
            )}
            {turn.errorMessage && (
              <>
                <span className="text-muted-foreground">error</span>
                <span className="break-words text-destructive-foreground">{turn.errorMessage}</span>
              </>
            )}
            {turn.usage && (
              <>
                <span className="text-muted-foreground">usage</span>
                <span className="font-mono">
                  in {turn.usage.input} · out {turn.usage.output} · cache-read {turn.usage.cacheRead}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DebugPanel({ sessionId, open, onClose }: Props): JSX.Element {
  const turns = useLlmTrace(sessionId)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const ordered = [...turns].reverse()

  return (
    <aside
      className={cn(
        // no-drag: the frameless-titlebar drag overlay (see App.tsx) overlaps
        // this panel's top strip; without this its buttons aren't clickable.
        'no-drag absolute right-0 top-0 z-10 flex h-full w-[380px] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-200',
        open ? 'translate-x-0' : 'translate-x-full'
      )}
      aria-hidden={!open}
    >
      {/* Close control lives on the LEFT: the top-right corner is occupied by
          the native window controls (minimize/maximize/close). */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <button
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-hover/60 hover:text-foreground"
          onClick={onClose}
          aria-label="Close debug panel"
          title="Close debug panel"
        >
          ×
        </button>
        <span className="text-[13px] font-medium text-foreground">LLM Debug</span>
        <span className="text-[11px] text-muted-foreground">
          {turns.length} turn{turns.length === 1 ? '' : 's'}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ordered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
            No LLM turns yet — send a prompt to see requests here.
          </div>
        ) : (
          ordered.map((turn) => (
            <TurnRow
              key={turn.id}
              turn={turn}
              expanded={expandedId === turn.id}
              onToggle={() => setExpandedId((id) => (id === turn.id ? null : turn.id))}
            />
          ))
        )}
      </div>
    </aside>
  )
}
