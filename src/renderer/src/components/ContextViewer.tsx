import { useEffect, useState } from 'react'
import type { Message, SessionContext } from '../../../shared/protocol'
import { api, ApiError } from '../api'
import { cn } from '../util'
import { Button } from './ui/button'
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from './ui/dialog'
import { Alert02, Loading03 } from './ui/icons'

const number = new Intl.NumberFormat()
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

function messageText(message: Message): string {
  return (message.content ?? []).map((block) => {
    if (block.type === 'image') return '[Image attachment]'
    if (block.type === 'thinking') return block.redacted ? '[Redacted reasoning]' : block.thinking ?? ''
    if (block.type === 'toolCall') return `${block.name ?? 'Tool'}\n${JSON.stringify(block.arguments ?? {}, null, 2)}`
    return block.text ?? ''
  }).join('\n\n')
}

function ContextMessage({ message, index }: { message: Message; index: number }): JSX.Element {
  const text = messageText(message)
  const limit = 12000
  const label = message.source === 'subagent_completion' ? 'Subagent report'
    : message.role === 'toolResult' ? `Tool result · ${message.toolName ?? 'tool'}`
    : message.role === 'assistant' ? 'Assistant' : 'User'
  return (
    <details className="rounded-xl border border-border">
      <summary className="cursor-pointer px-3 py-2.5 text-ui-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="mr-2 font-mono text-ui-xs text-foreground-subtlest">{index + 1}</span>
        {label}
        <span className="ml-2 text-foreground-subtlest">{compactNumber.format(text.length)} chars</span>
      </summary>
      <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-border px-3 py-3 font-mono text-ui-xs leading-relaxed text-foreground-subtle">
        {text.slice(0, limit) || '(No text content)'}
        {text.length > limit && '\n\n[Preview truncated at 12,000 characters; the full message remains in context.]'}
      </pre>
    </details>
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
  const [compactNotice, setCompactNotice] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

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
          setUpdatedAt(new Date())
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
  const messages = snapshot?.messages ?? []
  const remaining = snapshot && limit ? Math.max(0, limit - snapshot.estimatedTokens) : null
  const images = messages.reduce((sum, message) => sum + (message.content ?? []).filter((b) => b.type === 'image').length, 0)

  const compact = async (): Promise<void> => {
    setCompacting(true)
    setCompactNotice(null)
    try {
      await api.compact(sessionId)
      setCompactNotice('Compaction requested. The snapshot will refresh as the session updates.')
      setRefresh((value) => value + 1)
    } catch (err) {
      setCompactNotice(err instanceof Error ? err.message : 'Could not compact context.')
    } finally {
      setCompacting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label="View session context"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={error ?? (snapshot ? `Estimated context: ${number.format(snapshot.estimatedTokens)} tokens` : 'Session context')}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => setOpen(true)}
        className={cn('grid size-8 shrink-0 place-items-center rounded-full outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring', error ? 'text-muted-foreground' : color)}
      >
        <ContextRing fraction={fraction} />
      </button>
      <DialogPopup className="max-h-[85vh] max-w-2xl" bottomStickOnMobile={false}>
        <div className="shrink-0 border-b border-border px-5 py-5">
          <DialogTitle>Session context</DialogTitle>
          <DialogDescription className="mt-2">
            What this session sends to the model—not the full transcript history.
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && !snapshot && <p role="status" className="flex items-center gap-2 text-ui-sm text-muted-foreground"><Loading03 size={14} className="animate-spin" />Loading context…</p>}
          {error && <p role="alert" className="flex items-start gap-2 text-ui-sm text-destructive-foreground"><Alert02 size={16} className="shrink-0" />{error}</p>}
          {snapshot && (
            <>
              <div className="flex items-center gap-4 rounded-2xl bg-muted px-4 py-4">
                <span className={color}><ContextRing fraction={fraction} large /></span>
                <div className="min-w-0">
                  <div className="text-ui-xl font-semibold text-foreground">
                    ~{compactNumber.format(snapshot.estimatedTokens)}
                    <span className="ml-2 text-ui-sm font-normal text-muted-foreground">/ {limit ? compactNumber.format(limit) : 'unknown'} tokens</span>
                  </div>
                  <p className="mb-0 mt-1 text-ui-sm text-muted-foreground">
                    {percent !== null ? `~${percent}% used` : 'Capacity unknown'} · {snapshot.modelContextWindow ? 'Model context limit' : 'Harness limit; model capacity unknown'}
                  </p>
                  <p className="mb-0 mt-1 truncate text-ui-xs text-foreground-subtlest" title={snapshot.model}>{snapshot.model}</p>
                  {remaining !== null && <p className="mb-0 mt-1 text-ui-xs text-foreground-subtlest">~{compactNumber.format(remaining)} tokens remaining</p>}
                </div>
              </div>
              <p className="mb-1 mt-3 text-ui-xs leading-relaxed text-muted-foreground">
                {snapshot.estimateSource === 'usage-and-estimate' ? 'Based on provider usage plus estimates for newer messages.' : 'Estimated from message content; provider usage is not available.'}
                {' '}Not an exact tokenizer count. System instructions, tools and provider formatting may differ from the estimate.
              </p>
              <p className="mb-4 mt-1 text-ui-xs text-foreground-subtlest">
                {snapshot.compactionEnabled ? `Auto-compaction above ~${compactNumber.format(snapshot.compactionThreshold)} tokens` : 'Auto-compaction disabled'}
                {updatedAt && ` · Updated ${updatedAt.toLocaleTimeString()}`}
              </p>
              {snapshot.modelContextWindow && snapshot.compactionEnabled && snapshot.compactionThreshold > snapshot.modelContextWindow && (
                <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-ui-xs text-warning-foreground">
                  The harness compaction threshold exceeds this model’s context limit. Compact earlier to avoid reaching model capacity.
                </p>
              )}
              {snapshot.hasCompaction && <p className="rounded-lg border border-border bg-muted px-3 py-2 text-ui-sm text-foreground-subtle">Older history has been summarized. Only the retained context appears below.</p>}
              <details className="mb-2 rounded-xl border border-border">
                <summary className="cursor-pointer px-3 py-2.5 text-ui-sm text-foreground">System instructions</summary>
                <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-border px-3 py-3 font-mono text-ui-xs leading-relaxed text-foreground-subtle">{snapshot.systemPrompt || '(No system instructions)'}</pre>
              </details>
              <details className="mb-4 rounded-xl border border-border">
                <summary className="cursor-pointer px-3 py-2.5 text-ui-sm text-foreground">Available tools <span className="ml-2 text-foreground-subtlest">{snapshot.tools?.length ?? 0}</span></summary>
                <div className="max-h-64 overflow-auto border-t border-border px-3 py-2">
                  {(snapshot.tools ?? []).map((tool) => <div key={tool.name} className="py-2"><div className="text-ui-sm font-medium text-foreground">{tool.name}</div><p className="mb-0 mt-1 whitespace-pre-wrap break-words text-ui-xs text-muted-foreground">{tool.description}</p></div>)}
                  {!snapshot.tools?.length && <p className="text-ui-xs text-muted-foreground">No tools enabled.</p>}
                </div>
              </details>
              <h3 className="mb-2 mt-0 text-ui-sm font-medium text-foreground">Active messages <span className="ml-2 text-foreground-subtlest">{messages.length}{images ? ` · ${images} image attachments` : ''}</span></h3>
              <div className="flex flex-col gap-2">{messages.map((message, index) => <ContextMessage key={index} message={message} index={index} />)}</div>
              {!messages.length && !loading && <p className="text-ui-sm text-muted-foreground">No conversation messages yet.</p>}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>Refresh</Button>
          <Button onClick={() => void compact()} disabled={!snapshot || !!error || running || compacting || !messages.length}>
            {compacting ? 'Requesting…' : running ? 'Session running' : 'Compact now'}
          </Button>
        </div>
        {compactNotice && <p role="status" className="m-0 shrink-0 px-5 pb-3 text-ui-xs text-muted-foreground">{compactNotice}</p>}
      </DialogPopup>
    </Dialog>
  )
}
