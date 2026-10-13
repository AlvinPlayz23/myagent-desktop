import { useEffect, useState } from 'react'
import type { SessionContext } from '../../../shared/protocol'
import { api, ApiError } from '../api'
import { cn } from '../util'
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card'
import { Alert02, Loading03 } from './ui/icons'

const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

function ContextRing({ fraction, large = false }: { fraction: number | null; large?: boolean }): JSX.Element {
  const circumference = 2 * Math.PI * 15
  return (
    <svg viewBox="0 0 36 36" className={large ? 'size-16 shrink-0' : 'size-5 shrink-0'} aria-hidden>
      <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle
        cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, fraction ?? 0)))}
        transform="rotate(-90 18 18)"
      />
    </svg>
  )
}

const GRID_COLS = 30
const GRID_CELLS = GRID_COLS * 8

function ContextCard({ snapshot, limit, percent, remaining, color, canCompact, compacting, onCompact }: {
  snapshot: SessionContext
  limit: number | null
  percent: number | null
  remaining: number | null
  color: string
  canCompact: boolean
  compacting: boolean
  onCompact: () => void
}): JSX.Element {
  // The backend reports only a total, so the per-category split is estimated
  // (~4 characters per token) and conversation takes whatever remains.
  const total = snapshot.estimatedTokens
  const system = Math.min(total, Math.round((snapshot.systemPrompt?.length ?? 0) / 4))
  const tools = Math.min(total - system, Math.round((snapshot.tools ?? []).reduce((sum, t) => sum + t.name.length + t.description.length, 0) / 4))
  const conversation = Math.max(0, total - system - tools)
  const rows = [
    { label: 'System prompt', value: system, dot: 'bg-foreground' },
    { label: 'Tools', value: tools, dot: 'bg-foreground/50' },
    { label: 'Conversation', value: conversation, dot: 'bg-primary' }
  ]
  const perCell = limit ? limit / GRID_CELLS : 0
  const [active, setActive] = useState<string | null>(null)
  const cells: (typeof rows[number] | undefined)[] = []
  if (perCell > 0) {
    for (const row of rows) {
      const count = row.value > 0 ? Math.max(1, Math.round(row.value / perCell)) : 0
      for (let i = 0; i < count && cells.length < GRID_CELLS; i++) cells.push(row)
    }
  }
  return (
    <div>
      <div className="px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-ui-sm font-medium text-foreground">Context window</span>
          <span className="max-w-[60%] truncate rounded-md bg-hover px-2 py-1 font-mono text-ui-xs text-muted-foreground" title={snapshot.model}>{snapshot.model}</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <div className="text-ui-xl font-semibold tabular-nums text-foreground">
            {compactNumber.format(total)}
            <span className="ml-2 text-ui-sm font-normal text-muted-foreground">of {limit ? compactNumber.format(limit) : 'unknown'} tokens</span>
          </div>
          {percent !== null && <span className={cn('text-ui-sm font-medium tabular-nums', color)}>{percent}%</span>}
        </div>
        <div
          className="mt-3 grid gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))` }}
          role="img"
          aria-label={`${percent ?? 0}% of the context window used`}
        >
          {Array.from({ length: GRID_CELLS }, (_, i) => (
            <span
              key={i}
              className={cn(
                'aspect-square rounded-[2px] transition-[opacity,filter] duration-200 ease-out',
                cells[i]?.dot ?? 'bg-foreground/10',
                active !== null && cells[i]?.label !== active && 'opacity-25 blur-[1.5px]'
              )}
            />
          ))}
        </div>
        <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 text-ui-sm text-foreground">
              <span
                tabIndex={0}
                onMouseEnter={() => setActive(row.label)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(row.label)}
                onBlur={() => setActive(null)}
                className="-mx-2 flex cursor-default items-center gap-3 rounded-md px-2 py-1 outline-none transition-colors hover:bg-hover focus-visible:bg-hover"
              >
                <span className={cn('size-2 rounded-[2px]', row.dot)} />
                {row.label}
              </span>
              <span className="font-medium tabular-nums">{compactNumber.format(row.value)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-hover/50 px-4 py-3 text-ui-sm text-muted-foreground">
        <span className="tabular-nums">{remaining !== null ? `${compactNumber.format(remaining)} left` : 'Capacity unknown'}</span>
        <button
          type="button"
          onClick={onCompact}
          disabled={!canCompact}
          className="rounded-md px-2 py-1 font-medium text-foreground outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          {compacting ? 'Compacting…' : 'Compact'}
        </button>
      </div>
    </div>
  )
}

export default function ContextViewer({
  sessionId, running, revision, model
}: {
  sessionId: string
  running: boolean
  revision: number
  model?: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<SessionContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [compacting, setCompacting] = useState(false)

  useEffect(() => {
    let cancelled = false
    let pending = false
    const fetchContext = async (): Promise<void> => {
      if (pending) return
      pending = true
      try {
        const data = await api.sessionContext(sessionId, open)
        if (!cancelled) {
          if (!data || !Number.isFinite(data.estimatedTokens)) throw new Error('The backend did not return a context snapshot.')
          setSnapshot(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError && err.code === -32601
            ? 'This server does not support the context viewer yet. Update the myagent backend to enable it.'
            : err instanceof Error ? err.message : 'Could not load context.')
        }
      } finally {
        pending = false
        if (!cancelled) setLoading(false)
      }
    }
    setLoading(true)
    // Coalesce message updates; streaming text does not change revision.
    const timer = window.setTimeout(() => void fetchContext(), 200)
    const interval = running || open ? window.setInterval(() => void fetchContext(), 10000) : undefined
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [sessionId, open, running, revision, model, refresh])

  const limit = snapshot?.modelContextWindow || snapshot?.harnessContextWindow || null
  const fraction = snapshot && limit ? snapshot.estimatedTokens / limit : null
  const percent = fraction === null ? null : Math.round(fraction * 100)
  const color = fraction !== null && fraction >= 0.95 ? 'text-destructive-foreground'
    : fraction !== null && fraction >= 0.7 ? 'text-warning-foreground' : 'text-primary'
  const remaining = snapshot && limit ? Math.max(0, limit - snapshot.estimatedTokens) : null

  const compact = async (): Promise<void> => {
    setCompacting(true)
    try {
      await api.compact(sessionId)
      setRefresh((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compact context.')
    } finally {
      setCompacting(false)
    }
  }

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        delay={150}
        closeDelay={200}
        render={
          <button
            type="button"
            aria-label="Session context window"
            className={cn('grid size-8 shrink-0 place-items-center rounded-full outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring', error ? 'text-muted-foreground' : color)}
          />
        }
      >
        <ContextRing fraction={fraction} />
      </HoverCardTrigger>
      <HoverCardContent align="end" sideOffset={8} className="w-[340px] overflow-hidden p-0">
        {snapshot ? (
          <ContextCard
            snapshot={snapshot}
            limit={limit}
            percent={percent}
            remaining={remaining}
            color={color}
            canCompact={!error && !running && !compacting}
            compacting={compacting}
            onCompact={() => void compact()}
          />
        ) : (
          <p role={error ? 'alert' : 'status'} className="m-0 flex items-start gap-2 p-4 text-ui-sm text-muted-foreground">
            {error ? <Alert02 size={16} className="shrink-0 text-destructive-foreground" /> : <Loading03 size={14} className="animate-spin" />}
            {error ?? 'Loading context…'}
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}
