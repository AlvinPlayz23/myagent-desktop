import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import type { DiffBlock, DiffLine, ToolDiff } from '../diff'
import { cn } from '../util'

// GitHub-style unified diff: line-number gutter, red/green rows, collapsed
// context separators, per-block headers for multi-edit calls.
//
// Rows ride the dedicated diff tokens rather than success/destructive. A diff
// line is a change, not a system state, and borrowing the semantic pair made
// "added" read as "healthy". --diff-* is a solid color with inverse text, so
// the row is a tint of it rather than a low-opacity wash that muddies the code.

const MAX_LINES = 20

function lineClasses(kind: DiffLine['kind']): string {
  switch (kind) {
    case 'add':
      return 'bg-diff-added/12 text-diff-added-foreground'
    case 'del':
      return 'bg-diff-removed/12 text-diff-removed-foreground'
    default:
      return 'text-muted-foreground'
  }
}

function gutterClasses(kind: DiffLine['kind']): string {
  switch (kind) {
    case 'add':
      return 'bg-diff-added/20 text-diff-added-foreground/70'
    case 'del':
      return 'bg-diff-removed/20 text-diff-removed-foreground/70'
    default:
      return 'text-foreground-subtlest'
  }
}

function marker(kind: DiffLine['kind']): string {
  if (kind === 'add') return '+'
  if (kind === 'del') return '-'
  return ' '
}

function Row({ line, compact }: { line: DiffLine; compact?: boolean }): JSX.Element {
  if (line.kind === 'skip') {
    return (
      <div className="flex bg-info/8 text-ui-xs text-foreground-subtlest">
        <span className={cn('shrink-0 select-none border-r border-border/40 bg-muted/40', compact ? 'w-[44px]' : 'w-[68px]')} />
        <span className="px-2 py-0.5 italic">⋯ {line.text}</span>
      </div>
    )
  }
  return (
    <div className={cn('flex', lineClasses(line.kind))}>
      <span
        className={cn(
          'flex shrink-0 select-none border-r border-border/40 text-ui-xs leading-[1.7]',
          compact ? 'w-[44px]' : 'w-[68px]',
          gutterClasses(line.kind)
        )}
      >
        <span className="w-1/2 pr-1 text-right">{line.oldNo ?? ''}</span>
        <span className="w-1/2 pr-1 text-right">{line.newNo ?? ''}</span>
      </span>
      <span className="select-none pl-1.5 pr-1 opacity-70">{marker(line.kind)}</span>
      <span className={cn('min-w-0 flex-1 pr-2', compact ? 'whitespace-pre' : 'whitespace-pre-wrap break-all')}>{line.text || ' '}</span>
    </div>
  )
}

function Block({
  block,
  budget,
  compact
}: {
  block: DiffBlock
  budget: number
  compact?: boolean
}): JSX.Element {
  const lines = budget >= block.lines.length ? block.lines : block.lines.slice(0, budget)
  return (
    <div>
      {block.header && (
        <div className="border-b border-border/40 bg-muted/50 px-2 py-0.5 text-ui-xs font-medium text-muted-foreground">
          {block.header}
        </div>
      )}
      {lines.map((line, i) => (
        <Row key={i} line={line} compact={compact} />
      ))}
    </div>
  )
}

/** `compact` is for narrow hosts (the git panel): slim gutter, no wrapping, horizontal scroll. */
export default function DiffView({ diff, compact }: { diff: ToolDiff; compact?: boolean }): JSX.Element {
  const [full, setFull] = useState(false)
  const total = diff.blocks.reduce((n, b) => n + b.lines.length, 0)
  const truncated = !full && total > MAX_LINES

  // Distribute the visible-line budget across blocks in order. The
  // first MAX_LINES stay mounted; the remainder lives in the
  // collapsible t-acc panel so "show more" grows via grid-rows.
  let budget = MAX_LINES
  const rendered = diff.blocks.map((block, i) => {
    if (budget <= 0) return null
    const el = <Block key={i} block={block} budget={budget} compact={compact} />
    budget -= block.lines.length
    return el
  })
  let skip = MAX_LINES
  const rest = diff.blocks.flatMap((block, i) => {
    if (skip >= block.lines.length) {
      skip -= block.lines.length
      return []
    }
    const el = <Block key={i} block={{ ...block, lines: block.lines.slice(skip) }} budget={Infinity} compact={compact} />
    skip = 0
    return [el]
  })

  return (
    <div className="t-acc overflow-hidden rounded-md border border-border/60" data-open={String(full)}>
      <div className={cn('overflow-auto font-mono leading-[1.7]', compact ? 'max-h-[360px] text-ui-xs' : 'max-h-[420px] text-ui-sm')}>
        <div className={cn(compact && 'w-max min-w-full')}>{rendered}</div>
      </div>
      <div className="t-acc-panel">
        <div className="t-acc-panel-inner">
          <div className={cn('overflow-auto font-mono leading-[1.7]', compact ? 'max-h-[360px] text-ui-xs' : 'max-h-[420px] text-ui-sm')}>
            <div className={cn(compact && 'w-max min-w-full')}>{rest}</div>
          </div>
        </div>
      </div>
      {truncated && (
        <button
          className="t-acc-head block w-full border-t border-border/60 bg-muted/40 px-2 py-1 text-left text-ui-xs text-muted-foreground transition-colors hover:bg-hover/60 hover:text-foreground"
          aria-expanded={full}
          onClick={() => setFull(true)}
        >
          <span className="inline-flex items-center gap-1.5">
            show {total - MAX_LINES} more lines
            <span className="t-acc-chevron" aria-hidden>
              <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={1.75} aria-hidden />
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
