import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { GitPullRequestIcon, Sorting01Icon, StarIcon, UserCheck01Icon } from '@hugeicons/core-free-icons'
import type { PullFilter, PullRequestSummary, PullState, PullStateFilter } from '../../../shared/protocol'
import { ChevronDown, ChevronRight, Loading03, Search01 } from '../components/ui/icons'
import { Avatar, ChecksChip, CommentCount, DiffStat, PullGlyph, ReviewChip, StarButton } from './PullBits'
import { needsAttention, relLabel } from './format'
import { cn } from '../util'

// The pull request list: three buckets (Authored / Reviewing / All), a search
// box, and two section groups. "Needs attention" is deliberately first and
// open: a PR whose checks failed or that is waiting on your review is the
// reason a person opens this window at all, and the rest is a reading list.

const FILTERS: { value: PullFilter; label: string }[] = [
  { value: 'authored', label: 'Authored' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'all', label: 'All' }
]

type Sort = 'updated' | 'largest' | 'comments'

// Merged is its own choice rather than a subset of closed: a merged PR is a
// finished piece of work, a closed one is usually a rejected or abandoned idea,
// and people look for one without the other.
const STATES: { value: PullStateFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'Any state' }
]

const SORTS: { value: Sort; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'largest', label: 'Largest diff' },
  { value: 'comments', label: 'Most comments' }
]

/**
 * `gh --state closed` means "not open", so merged pull requests belong in that
 * bucket and dropping them would hide real results. An open row, however, never
 * belongs in a closed or merged view — that is the one case this refuses, and it
 * refuses it here rather than trusting the query.
 */
function stateMatches(filter: PullStateFilter, value: PullState): boolean {
  if (filter === 'all') return true
  if (filter === 'open') return value === 'OPEN'
  if (filter === 'merged') return value === 'MERGED'
  return value !== 'OPEN'
}

interface Props {
  pulls: PullRequestSummary[]
  loading: boolean
  filter: PullFilter
  onFilter(filter: PullFilter): void
  stateFilter: PullStateFilter
  onStateFilter(state: PullStateFilter): void
  stars: Set<number>
  onToggleStar(number: number): void
  onOpen(number: number): void
  /** The authenticated login, when one is known. */
  viewer: string | null
}

function SectionHeader({
  title,
  count,
  open,
  onToggle
}: {
  title: string
  count: number
  open: boolean
  onToggle(): void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="group flex h-8 w-full items-center gap-1.5 rounded-md px-3 text-left outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRight
        size={12}
        className={cn('shrink-0 text-foreground-subtlest transition-transform duration-150', open && 'rotate-90')}
      />
      <span className="text-ui-caption font-medium text-foreground-subtle">{title}</span>
      <span className="text-ui-caption tabular-nums text-foreground-subtlest">{count}</span>
    </button>
  )
}

function Row({
  pull,
  starred,
  onToggleStar,
  onOpen
}: {
  pull: PullRequestSummary
  starred: boolean
  onToggleStar(): void
  onOpen(): void
}): JSX.Element {
  const label = `#${pull.number} ${pull.title}`
  return (
    <div className="group flex items-start gap-2.5 border-b border-border/40 px-3 py-2.5 transition-colors duration-[var(--duration-instant)] last:border-b-0 hover:bg-hover">
      <span className="mt-1">
        <PullGlyph state={pull.state} isDraft={pull.isDraft} />
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 truncate text-ui-base font-medium text-foreground">{pull.title}</span>
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <Avatar login={pull.author} />
            <span className="text-ui-xs text-foreground-subtle">{pull.author}</span>
          </span>
          <span className="shrink-0 font-mono text-ui-xs text-foreground-subtlest">#{pull.number}</span>
          {/* Draft rides the metadata line, not the title row: on the title row it
              sat against the timestamp column and read as "Draft 29d ago". */}
          {pull.isDraft && (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-ui-xs text-foreground-subtle">
              Draft
            </span>
          )}
          <span className="shrink-0 truncate font-mono text-ui-xs text-foreground-subtlest">{pull.headRefName}</span>
          <ChecksChip checks={pull.checks} detail={pull.checksDetail} conflicts={pull.conflicts} />
          <ReviewChip decision={pull.reviewDecision} reviewRequested={pull.reviewRequested} />
          <CommentCount count={pull.commentCount} />
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1.5 pl-2">
        <div className="flex items-center gap-1.5">
          <span className="text-ui-xs tabular-nums text-foreground-subtlest">
            {pull.state === 'MERGED' ? 'Merged ' : pull.state === 'CLOSED' ? 'Closed ' : ''}
            {relLabel(pull.updatedAt)}
          </span>
          <StarButton active={starred} onToggle={onToggleStar} label={label} />
        </div>
        <DiffStat additions={pull.additions} deletions={pull.deletions} />
      </div>
    </div>
  )
}

function SkeletonRow(): JSX.Element {
  return (
    <div className="flex items-start gap-2.5 border-b border-border/40 px-3 py-2.5 last:border-b-0">
      <span className="mt-1 size-4 shrink-0 rounded-sm bg-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="h-3 w-1/2 animate-pulse rounded-full bg-muted" />
        <span className="h-2.5 w-1/3 animate-pulse rounded-full bg-muted" />
      </div>
      <span className="h-2.5 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
    </div>
  )
}

export default function PullList({
  pulls,
  loading,
  filter,
  onFilter,
  stateFilter,
  onStateFilter,
  stars,
  onToggleStar,
  onOpen,
  viewer
}: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [needsYou, setNeedsYou] = useState(false)
  const [starredOnly, setStarredOnly] = useState(false)
  const [sort, setSort] = useState<Sort>('updated')
  const [sortOpen, setSortOpen] = useState(false)
  const [stateOpen, setStateOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleSection = (id: string): void =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = pulls.filter((pull) => {
      if (!stateMatches(stateFilter, pull.state)) return false
      if (needsYou && !pull.reviewRequested) return false
      if (starredOnly && !stars.has(pull.number)) return false
      if (!needle) return true
      return `${pull.number} ${pull.title} ${pull.author} ${pull.headRefName} ${pull.baseRefName}`
        .toLowerCase()
        .includes(needle)
    })
    const sorted = [...filtered]
    if (sort === 'largest') sorted.sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    else if (sort === 'comments') sorted.sort((a, b) => b.commentCount - a.commentCount)
    else sorted.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    return sorted
  }, [pulls, query, needsYou, starredOnly, stars, sort, stateFilter])

  // "Needs attention" only means something while the working set is open PRs:
  // a merged PR does not owe anyone a review.
  const workingSet = stateFilter === 'open'
  const attention = workingSet ? visible.filter(needsAttention) : []
  const rest = workingSet ? visible.filter((pull) => !needsAttention(pull)) : visible
  const restTitle = workingSet
    ? 'Waiting'
    : stateFilter === 'merged'
      ? 'Merged'
      : stateFilter === 'closed'
        ? 'Closed'
        : 'Pull requests'

  const renderRows = (rows: PullRequestSummary[]): JSX.Element[] =>
    rows.map((pull) => (
      <Row
        key={pull.number}
        pull={pull}
        starred={stars.has(pull.number)}
        onToggleStar={() => onToggleStar(pull.number)}
        onOpen={() => onOpen(pull.number)}
      />
    ))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/60 px-4 pb-3 pt-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-ui-xl font-semibold tracking-tight text-foreground">Pull requests</h1>
          {(!loading || pulls.length > 0) && (
            <span className="text-ui-caption tabular-nums text-foreground-subtle">{pulls.length}</span>
          )}
          {loading && <Loading03 size={13} className="ml-1 animate-spin text-muted-foreground" />}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div role="tablist" aria-label="Pull request bucket" className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {FILTERS.map((entry) => {
              const active = entry.value === filter
              return (
                <button
                  key={entry.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onFilter(entry.value)}
                  className={cn(
                    'h-7 rounded-md px-3 text-ui-caption font-medium outline-none transition-colors duration-[var(--duration-instant)]',
                    'focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {entry.label}
                </button>
              )
            })}
          </div>

          <div className="relative min-w-0 flex-1">
            <Search01 size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtlest" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pull requests"
              aria-label="Search pull requests"
              className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-2.5 text-ui-caption text-foreground outline-none transition-colors duration-[var(--duration-instant)] placeholder:text-foreground-subtlest focus:border-input-border-focused focus:ring-2 focus:ring-ring/20"
            />
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setStateOpen((value) => !value)}
              aria-expanded={stateOpen}
              aria-haspopup="menu"
              title="Filter by state"
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-ui-caption outline-none transition-colors duration-[var(--duration-instant)] focus-visible:ring-2 focus-visible:ring-ring',
                stateFilter === 'open'
                  ? 'border-border text-muted-foreground hover:bg-hover hover:text-foreground'
                  : 'border-brand/40 bg-brand/10 text-brand'
              )}
            >
              {STATES.find((entry) => entry.value === stateFilter)?.label ?? 'Open'}
              <ChevronDown size={11} aria-hidden />
            </button>
            {stateOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close state menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setStateOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-9 z-50 w-[160px] overflow-hidden rounded-lg border border-popover-border bg-menu p-1 shadow-[var(--shadow-pop)]"
                >
                  {STATES.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={entry.value === stateFilter}
                      onClick={() => {
                        onStateFilter(entry.value)
                        setStateOpen(false)
                      }}
                      className={cn(
                        'flex h-8 w-full items-center rounded-md px-2.5 text-left text-ui-caption transition-colors duration-[var(--duration-instant)]',
                        entry.value === stateFilter
                          ? 'bg-selected text-foreground'
                          : 'text-muted-foreground hover:bg-menu-hover hover:text-foreground'
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setSortOpen((value) => !value)}
              aria-expanded={sortOpen}
              aria-haspopup="menu"
              title={`Sort: ${SORTS.find((entry) => entry.value === sort)?.label ?? ''}`}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-ui-caption text-muted-foreground outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeiconsIcon icon={Sorting01Icon} size={13} strokeWidth={1.8} aria-hidden />
              <ChevronDown size={11} aria-hidden />
            </button>
            {sortOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close sort menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setSortOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-9 z-50 w-[180px] overflow-hidden rounded-lg border border-popover-border bg-menu p-1 shadow-[var(--shadow-pop)]"
                >
                  {SORTS.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={entry.value === sort}
                      onClick={() => {
                        setSort(entry.value)
                        setSortOpen(false)
                      }}
                      className={cn(
                        'flex h-8 w-full items-center rounded-md px-2.5 text-left text-ui-caption transition-colors duration-[var(--duration-instant)]',
                        entry.value === sort ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-menu-hover hover:text-foreground'
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={needsYou}
            onClick={() => setNeedsYou((value) => !value)}
            className={cn(
              'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-ui-xs font-medium outline-none transition-colors duration-[var(--duration-instant)] focus-visible:ring-2 focus-visible:ring-ring',
              needsYou ? 'border-brand/40 bg-brand/10 text-brand' : 'border-border text-foreground-subtle hover:bg-hover'
            )}
          >
            <HugeiconsIcon icon={UserCheck01Icon} size={12} strokeWidth={1.9} aria-hidden />
            {viewer ? `Needs you · ${viewer}` : 'Needs you'}
          </button>
          <button
            type="button"
            aria-pressed={starredOnly}
            onClick={() => setStarredOnly((value) => !value)}
            className={cn(
              'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-ui-xs font-medium outline-none transition-colors duration-[var(--duration-instant)] focus-visible:ring-2 focus-visible:ring-ring',
              starredOnly ? 'border-warning/40 bg-warning/10 text-warning-foreground' : 'border-border text-foreground-subtle hover:bg-hover'
            )}
          >
            <HugeiconsIcon icon={StarIcon} size={12} strokeWidth={1.9} aria-hidden />
            Starred
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {loading && pulls.length === 0 ? (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-6 py-16 text-center">
            <HugeiconsIcon icon={GitPullRequestIcon} size={20} strokeWidth={1.6} className="text-foreground-subtlest" aria-hidden />
            <p className="text-ui-sm text-foreground-subtle">
              {stateFilter === 'merged'
                ? 'No merged pull requests match this view.'
                : stateFilter === 'closed'
                  ? 'No closed pull requests match this view.'
                  : 'No pull requests match this view.'}
            </p>
            <p className="text-ui-xs text-foreground-subtlest">Try another bucket or state, or clear the search and filters.</p>
          </div>
        ) : (
          <>
            {attention.length > 0 && (
              <div>
                <SectionHeader
                  title="Needs attention"
                  count={attention.length}
                  open={!collapsed.has('attention')}
                  onToggle={() => toggleSection('attention')}
                />
                {!collapsed.has('attention') && (
                  <div className="mx-2 overflow-hidden rounded-xl border border-border/60">{renderRows(attention)}</div>
                )}
              </div>
            )}
            {rest.length > 0 && (
              <div className={attention.length > 0 ? 'mt-3' : undefined}>
                <SectionHeader
                  title={restTitle}
                  count={rest.length}
                  open={!collapsed.has('rest')}
                  onToggle={() => toggleSection('rest')}
                />
                {!collapsed.has('rest') && (
                  <div className="mx-2 overflow-hidden rounded-xl border border-border/60">{renderRows(rest)}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
