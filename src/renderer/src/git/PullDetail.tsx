import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { LinkSquare02Icon } from '@hugeicons/core-free-icons'
import type { PullRequestDetail } from '../../../shared/protocol'
import { Alert02, ArrowLeft01, Loading03 } from '../components/ui/icons'
import { cn } from '../util'
import { loadPull, loadPullDiff, type Probe } from './api'
import { Avatar, ChecksChip, DiffStat, IconButton, Note, PullGlyph } from './PullBits'
import { relLabel } from './format'
import PullConversation from './PullConversation'
import PullAbout from './PullAbout'
import PullFiles from './PullFiles'

// One pull request, three pages. The header stays put while the page changes so
// the branch, the CI state and the diff size are always in view — they are what
// every one of the three pages is read in the light of.

interface Props {
  cwd: string
  number: number
  probe: Probe | null
  onBack(): void
}

type Tab = 'conversation' | 'files' | 'about'

export default function PullDetail({ cwd, number, probe, onBack }: Props): JSX.Element {
  const [data, setData] = useState<PullRequestDetail | null>(null)
  const [demo, setDemo] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('conversation')
  const [patch, setPatch] = useState<{ loaded: boolean; loading: boolean; text: string | null }>({
    loaded: false,
    loading: false,
    text: null
  })

  useEffect(() => {
    if (!probe) return
    let alive = true
    setLoading(true)
    loadPull(cwd, number, probe)
      .then((loaded) => {
        if (!alive) return
        setData(loaded.data)
        setDemo(loaded.demo)
        setNote(loaded.data === null ? loaded.reason : loaded.demo ? loaded.reason : null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [cwd, number, probe])

  // The patch is fetched when the Files page is first opened: a large PR costs a
  // multi-megabyte subprocess, and most visits never scroll the diff.
  useEffect(() => {
    if (tab !== 'files' || patch.loaded || patch.loading || !probe) return
    let alive = true
    setPatch((current) => ({ ...current, loading: true }))
    loadPullDiff(cwd, number, probe)
      .then((loaded) => {
        if (!alive) return
        setPatch({ loaded: true, loading: false, text: loaded.data })
        if (loaded.demo && loaded.reason) setNote(loaded.reason)
      })
      .catch(() => {
        if (alive) setPatch({ loaded: true, loading: false, text: null })
      })
    return () => {
      alive = false
    }
  }, [tab, patch.loaded, patch.loading, probe, cwd, number])

  const onCommentPosted = useCallback(() => {
    if (!probe) return
    loadPull(cwd, number, probe).then((loaded) => {
      if (loaded.data) setData(loaded.data)
    })
  }, [cwd, number, probe])

  const files = data?.files ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/60 px-4 pt-3">
        <div className="flex items-center gap-2">
          <IconButton title="Back to pull requests" onClick={onBack}>
            <ArrowLeft01 size={14} strokeWidth={1.9} />
          </IconButton>
          <PullGlyph state={data?.state ?? 'OPEN'} isDraft={data?.isDraft ?? false} size={15} />
          <span className="min-w-0 flex-1 truncate text-ui-base font-medium text-foreground">
            {data ? data.title : `Pull request #${number}`}
          </span>
          <span className="shrink-0 font-mono text-ui-xs text-foreground-subtlest">#{number}</span>
          {data?.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              title="Open on GitHub"
              aria-label="Open on GitHub"
              className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={1.8} aria-hidden />
            </a>
          )}
          {loading && <Loading03 size={13} className="shrink-0 animate-spin text-muted-foreground" />}
        </div>

        {data && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-9">
            <span className="inline-flex min-w-0 items-center gap-1 font-mono text-ui-xs text-foreground-subtle">
              <span className="truncate">{data.headRefName}</span>
              <span className="shrink-0 text-foreground-subtlest">←</span>
              <span className="truncate">{data.baseRefName}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <Avatar login={data.author} size={16} />
              <span className="text-ui-xs text-foreground-subtle">{data.author}</span>
            </span>
            <ChecksChip checks={data.checks} detail={data.checksDetail} conflicts={data.conflicts} />
            <DiffStat additions={data.additions} deletions={data.deletions} />
            <span className="text-ui-xs text-foreground-subtlest">{relLabel(data.updatedAt)}</span>
          </div>
        )}

        <div role="tablist" aria-label="Pull request pages" className="mt-2 flex items-center gap-1">
          {(
            [
              { value: 'conversation' as const, label: 'Conversation', count: data?.comments.length },
              { value: 'files' as const, label: 'Files changed', count: data?.changedFiles },
              { value: 'about' as const, label: 'About' }
            ]
          ).map((entry) => {
            const active = entry.value === tab
            return (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(entry.value)}
                className={cn(
                  'relative flex h-9 items-center gap-1.5 px-2 outline-none transition-colors duration-[var(--duration-instant)] focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="text-ui-caption font-medium">{entry.label}</span>
                {entry.count !== undefined && entry.count > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-px font-mono text-ui-xs tabular-nums text-foreground-subtle">
                    {entry.count}
                  </span>
                )}
                {active && (
                  <motion.span
                    layoutId="git-pull-tab"
                    className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {note && (
        <div className="shrink-0 px-4 pt-3">
          <Note tone="warning" icon={<Alert02 size={13} strokeWidth={2} />}>
            {note}
          </Note>
        </div>
      )}

      {!data && loading && (
        <div className="flex flex-1 items-center justify-center gap-2 text-ui-sm text-foreground-subtle">
          <Loading03 size={14} className="animate-spin" />
          Loading pull request…
        </div>
      )}

      {!data && !loading && (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-ui-sm text-foreground-subtle">
          This pull request could not be loaded.
        </div>
      )}

      {data && tab === 'conversation' && (
        <PullConversation cwd={cwd} data={data} demo={demo} number={number} onPosted={onCommentPosted} />
      )}
      {data && tab === 'files' && (
        <PullFiles
          data={data}
          patch={patch.text}
          loading={patch.loading || !patch.loaded}
          files={files}
        />
      )}
      {data && tab === 'about' && <PullAbout data={data} onOpenFiles={() => setTab('files')} />}
    </div>
  )
}
