import { memo, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Alert02, Loading03 } from './ui/icons'
import type { ToolRun } from '../state'
import { buildToolDiff } from '../diff'
import DiffView from './DiffView'
import { cn } from '../util'
import { disclosure } from '../motion'
import { TOOL_LABELS, TOOL_RUNNING_LABELS, toolIcon, toolSummary } from '../toolMeta'

function summaryOf(run: ToolRun): string {
  return toolSummary(run.args)
}

function resultText(run: ToolRun): string {
  const res = run.partial ?? run.result
  if (!res || !Array.isArray(res.content)) return ''
  return res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
}

const MAX_PREVIEW = 5000

function ToolCard({ run }: { run: ToolRun }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const Icon = toolIcon(run.name)
  const text = resultText(run)
  // GitHub-style diff for edit/write, derived from the tool-call args. A
  // failed run falls back to the error text — the change never applied.
  const diff = useMemo(
    () => (run.status === 'error' ? null : buildToolDiff(run)),
    [run.name, run.args, run.status]
  )
  const isDiff = useMemo(() => !diff && /^(\+|-|@@)/m.test(text) && /^@@/m.test(text), [text, diff])
  const shown = full || text.length <= MAX_PREVIEW ? text : text.slice(0, MAX_PREVIEW)

  return (
    <div className="tool-row my-0 flex flex-col text-ui-base transcript-rise">
      <button
        className="-mx-1.5 flex min-h-8 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="relative grid size-4 shrink-0 place-items-center">
          <Icon
            size={16}
            strokeWidth={1.5}
            className={cn(run.status === 'error' ? 'text-destructive-foreground' : 'text-foreground-subtle')}
          />
        </span>
        <span
          className={cn(
            'shrink-0',
            run.status === 'running' ? 'font-medium text-foreground' : 'text-foreground-subtle'
          )}
        >
          {(run.status === 'running' ? TOOL_RUNNING_LABELS[run.name] : TOOL_LABELS[run.name]) ?? run.name}
        </span>
        {run.status === 'running' && <Loading03 size={13} strokeWidth={1.75} className="shrink-0 animate-spin text-foreground-subtle" aria-label="Running" />}
        {run.status === 'error' && (
          <span className="flex shrink-0 items-center gap-1 text-ui-sm text-destructive-foreground">
            <Alert02 size={13} strokeWidth={1.75} aria-hidden />
            Failed
          </span>
        )}
        {diff && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-ui-xs tabular-nums">
            {diff.additions > 0 && <span className="text-diff-added-foreground">+{diff.additions}</span>}
            {diff.deletions > 0 && <span className="text-diff-removed-foreground">−{diff.deletions}</span>}
          </span>
        )}
        <span className="ml-auto flex min-w-0 items-center gap-1.5">
          {summaryOf(run) && (
            <span className="min-w-0 max-w-[26rem] truncate rounded-md bg-muted px-2 py-0.5 font-mono text-ui-sm text-foreground-subtle">
              {summaryOf(run)}
            </span>
          )}
          <ChevronRight
            size={13}
            strokeWidth={1.75}
            className={cn(
              'shrink-0 text-foreground-subtlest transition-transform duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)]',
              open && 'rotate-90'
            )}
            aria-hidden
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {(open || (run.status === 'running' && run.partial)) && (
          <motion.div
            variants={disclosure}
            initial="initial"
            animate="animate"
            exit="exit"
            className="ml-6 overflow-hidden"
          >
            <div className="py-1 font-mono text-ui-sm">
              {run.name === 'bash' && typeof run.args.command === 'string' && (
                <div className="mb-1.5 whitespace-pre-wrap break-all rounded-md bg-surface px-2.5 py-1.5 text-foreground">
                  <span className="font-bold text-foreground">$</span> {run.args.command}
                </div>
              )}
              {diff ? (
                <DiffView diff={diff} />
              ) : text ? (
                <pre className="m-0 max-h-[360px] overflow-auto whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                  {isDiff
                    ? shown.split('\n').map((line, i) => (
                        <span
                          key={i}
                          className={cn(
                            'block rounded-sm px-1 py-0.2',
                            line.startsWith('+') && 'bg-diff-added/15 text-diff-added-foreground font-medium',
                            line.startsWith('-') && 'bg-diff-removed/15 text-diff-removed-foreground font-medium',
                            line.startsWith('@@') && 'text-foreground font-semibold opacity-90 my-0.5'
                          )}
                        >
                          {line}
                        </span>
                      ))
                    : shown}
                </pre>
              ) : (
                <div className="italic text-foreground-subtlest">
                  {run.status === 'running' ? 'running…' : 'no output'}
                </div>
              )}
              {text.length > MAX_PREVIEW && !full && (
                <button
                  className="mt-1 block font-mono text-ui-sm text-foreground underline-offset-2 hover:underline"
                  onClick={() => setFull(true)}
                >
                  show {(text.length - MAX_PREVIEW).toLocaleString()} more chars
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default memo(ToolCard)
