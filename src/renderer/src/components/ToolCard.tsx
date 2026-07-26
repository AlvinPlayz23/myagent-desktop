import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ComputerTerminal,
  File01,
  FileEdit,
  FileAdd,
  Wrench01,
  ChevronRight,
  Alert02,
  Loading03,
  type IconComponent
} from './ui/icons'
import type { ToolRun } from '../state'
import { buildToolDiff } from '../diff'
import DiffView from './DiffView'
import { cn } from '../util'

const ICONS: Record<string, IconComponent> = {
  bash: ComputerTerminal,
  read: File01,
  edit: FileEdit,
  write: FileAdd
}

function summaryOf(run: ToolRun): string {
  const a = run.args
  const first =
    (a.command as string) ??
    (a.path as string) ??
    (a.file_path as string) ??
    (a.filePath as string) ??
    (a.pattern as string) ??
    ''
  if (first) return String(first)
  const vals = Object.values(a).filter((v) => typeof v === 'string') as string[]
  return vals[0] ?? ''
}

function resultText(run: ToolRun): string {
  const res = run.partial ?? run.result
  if (!res) return ''
  return res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
}

const MAX_PREVIEW = 5000

export default function ToolCard({ run }: { run: ToolRun }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const Icon = ICONS[run.name] ?? Wrench01
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
    <div className="my-0 flex flex-col text-[12px] [animation:rise_0.2s_ease]">
      <button
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-hover/60"
        onClick={() => setOpen(!open)}
      >
        <span className="grid w-3.5 place-items-center shrink-0">
          <ChevronRight
            size={12}
            className={cn('text-muted-foreground/70 transition-transform', open && 'rotate-90')}
          />
        </span>
        <span className="grid w-4 place-items-center shrink-0">
          <Icon
            size={14}
            strokeWidth={1.8}
            className={cn(run.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}
          />
        </span>
        <span className="shrink-0 font-medium text-foreground">{run.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground/90">
          {summaryOf(run)}
        </span>
        {diff && (
          <span className="flex shrink-0 items-center gap-1 font-mono text-[10.5px]">
            {diff.additions > 0 && <span className="text-success-foreground">+{diff.additions}</span>}
            {diff.deletions > 0 && (
              <span className="text-destructive-foreground">−{diff.deletions}</span>
            )}
          </span>
        )}
        <span
          className={cn(
            'ml-auto flex shrink-0 items-center gap-1 text-[11px]',
            run.status === 'running' && 'text-foreground font-medium',
            run.status === 'done' && 'text-success-foreground',
            run.status === 'error' && 'text-destructive-foreground',
            !run.status && 'text-muted-foreground'
          )}
        >
          {run.status === 'running' && (
            <>
              <Loading03 size={12} strokeWidth={1.8} className="animate-spin" />
              <span className="text-[11px] text-muted-foreground">running…</span>
            </>
          )}
          {run.status === 'error' && <Alert02 size={12} strokeWidth={1.8} />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {(open || (run.status === 'running' && run.partial)) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="ml-7 overflow-hidden"
          >
            <div className="mt-1 border-l-2 border-border/50 pl-3 py-1 font-mono text-[11.5px]">
              {run.name === 'bash' && typeof run.args.command === 'string' && (
                <div className="mb-1.5 whitespace-pre-wrap break-all rounded-md bg-muted/60 px-2.5 py-1.5 text-foreground">
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
                            line.startsWith('+') && 'bg-success/15 text-success-foreground font-medium',
                            line.startsWith('-') && 'bg-destructive/15 text-destructive-foreground font-medium',
                            line.startsWith('@@') && 'text-foreground font-semibold opacity-90 my-0.5'
                          )}
                        >
                          {line}
                        </span>
                      ))
                    : shown}
                </pre>
              ) : (
                <div className="italic text-muted-foreground/70">
                  {run.status === 'running' ? 'running…' : 'no output'}
                </div>
              )}
              {text.length > MAX_PREVIEW && !full && (
                <button
                  className="mt-1 block font-mono text-[11px] text-foreground underline-offset-2 hover:underline"
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
