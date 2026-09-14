import { useState } from 'react'
import type { DiffBlock, DiffLine, ToolDiff } from '../diff'
import { cn } from '../util'

// GitHub-style unified diff: line-number gutter, red/green rows, collapsed
// context separators, per-block headers for multi-edit calls.

const MAX_LINES = 20

function lineClasses(kind: DiffLine['kind']): string {
  switch (kind) {
    case 'add':
      return 'bg-success/12 text-success-foreground'
    case 'del':
      return 'bg-destructive/12 text-destructive-foreground'
    default:
      return 'text-muted-foreground'
  }
}

function gutterClasses(kind: DiffLine['kind']): string {
  switch (kind) {
    case 'add':
      return 'bg-success/18 text-success-foreground/70'
    case 'del':
      return 'bg-destructive/18 text-destructive-foreground/70'
    default:
      return 'text-muted-foreground/50'
  }
}

function marker(kind: DiffLine['kind']): string {
  if (kind === 'add') return '+'
  if (kind === 'del') return '-'
  return ' '
}

function Row({ line }: { line: DiffLine }): JSX.Element {
  if (line.kind === 'skip') {
    return (
      <div className="flex bg-info/8 text-[10.5px] text-muted-foreground/70">
        <span className="w-[68px] shrink-0 select-none border-r border-border/40 bg-muted/40" />
        <span className="px-2 py-0.5 italic">⋯ {line.text}</span>
      </div>
    )
  }
  return (
    <div className={cn('flex', lineClasses(line.kind))}>
      <span
        className={cn(
          'flex w-[68px] shrink-0 select-none border-r border-border/40 text-[10px] leading-[1.7]',
          gutterClasses(line.kind)
        )}
      >
        <span className="w-1/2 pr-1 text-right">{line.oldNo ?? ''}</span>
        <span className="w-1/2 pr-1 text-right">{line.newNo ?? ''}</span>
      </span>
      <span className="select-none pl-1.5 pr-1 opacity-70">{marker(line.kind)}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-2">{line.text || ' '}</span>
    </div>
  )
}

function Block({
  block,
  budget
}: {
  block: DiffBlock
  budget: number
}): JSX.Element {
  const lines = budget >= block.lines.length ? block.lines : block.lines.slice(0, budget)
  return (
    <div>
      {block.header && (
        <div className="border-b border-border/40 bg-muted/50 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
          {block.header}
        </div>
      )}
      {lines.map((line, i) => (
        <Row key={i} line={line} />
      ))}
    </div>
  )
}

export default function DiffView({ diff }: { diff: ToolDiff }): JSX.Element {
  const [full, setFull] = useState(false)
  const total = diff.blocks.reduce((n, b) => n + b.lines.length, 0)
  const truncated = !full && total > MAX_LINES

  // Distribute the visible-line budget across blocks in order. The
  // first MAX_LINES stay mounted; the remainder lives in the
  // collapsible t-acc panel so "show more" grows via grid-rows.
  let budget = MAX_LINES
  const rendered = diff.blocks.map((block, i) => {
    if (budget <= 0) return null
    const el = <Block key={i} block={block} budget={budget} />
    budget -= block.lines.length
    return el
  })
  let skip = MAX_LINES
  const rest = diff.blocks.flatMap((block, i) => {
    if (skip >= block.lines.length) {
      skip -= block.lines.length
      return []
    }
    const el = <Block key={i} block={{ ...block, lines: block.lines.slice(skip) }} budget={Infinity} />
    skip = 0
    return [el]
  })

  return (
    <div className="t-acc overflow-hidden rounded-md border border-border/60" data-open={String(full)}>
      <div className="max-h-[420px] overflow-auto font-mono text-[11px] leading-[1.7]">
        {rendered}
      </div>
      <div className="t-acc-panel">
        <div className="t-acc-panel-inner">
          <div className="max-h-[420px] overflow-auto font-mono text-[11px] leading-[1.7]">
            {rest}
          </div>
        </div>
      </div>
      {truncated && (
        <button
          className="t-acc-head block w-full border-t border-border/60 bg-muted/40 px-2 py-1 text-left text-[10.5px] text-muted-foreground transition-colors hover:bg-hover/60 hover:text-foreground"
          aria-expanded={full}
          onClick={() => setFull(true)}
        >
          <span className="inline-flex items-center gap-1.5">
            show {total - MAX_LINES} more lines
            <span className="t-acc-chevron" aria-hidden>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
