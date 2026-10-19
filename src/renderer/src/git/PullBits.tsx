import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BubbleChatIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
  StarIcon
} from '@hugeicons/core-free-icons'
import type { ChecksStatus, PullState, ReviewDecision } from '../../../shared/protocol'
import {
  Alert02,
  AlertCircle,
  Check,
  CheckmarkCircle02,
  Copy01,
  Delete02,
  File01,
  FileAdd,
  FileEdit,
  MinusSign
} from '../components/ui/icons'
import { avatarTone, checksCopy, compactCount, decisionCopy, initials } from './format'
import { cn } from '../util'

// The small, repeated pieces of the source-control window: author avatars, the
// PR state glyph, the CI/conflict chips, and the diff stat pair. They live here
// so the list, the diff viewer and the about page can never drift apart.

/**
 * Letter avatar. Authors are drawn from theme tokens rather than fetched from
 * GitHub: the renderer stays offline-clean, and every named theme keeps working.
 */
export function Avatar({ login, size = 18 }: { login: string; size?: number }): JSX.Element {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold leading-none"
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.44)), ...avatarTone(login) }}
      title={login}
      aria-hidden
    >
      {initials(login)}
    </span>
  )
}

/**
 * The PR's state at a glance: green open, brand merged, red closed, dim draft.
 * Closed and open used to share one glyph, which made a closed row look open
 * until you read its title — the exact confusion a state filter must not have.
 */
export function PullGlyph({
  state,
  isDraft,
  size = 16
}: {
  state: PullState
  isDraft: boolean
  size?: number
}): JSX.Element {
  const merged = state === 'MERGED'
  const closed = state === 'CLOSED'
  const glyph = merged
    ? GitMergeIcon
    : closed
      ? GitPullRequestClosedIcon
      : isDraft
        ? GitPullRequestDraftIcon
        : GitPullRequestIcon
  const tone = merged ? 'text-brand' : closed ? 'text-destructive' : isDraft ? 'text-foreground-subtlest' : 'text-success'
  return <HugeiconsIcon icon={glyph} size={size} strokeWidth={1.75} aria-hidden className={cn('shrink-0', tone)} />
}

function ChecksGlyph({ checks }: { checks: ChecksStatus }): JSX.Element {
  if (checks === 'failing') return <AlertCircle size={12} strokeWidth={1.9} className="shrink-0" />
  if (checks === 'passing') return <CheckmarkCircle02 size={12} strokeWidth={1.9} className="shrink-0" />
  return <MinusSign size={12} strokeWidth={1.9} className="shrink-0" />
}

/**
 * CI state and mergeability in one slot: they are the two things that decide
 * whether a PR can land, so a row never has to be read twice to find out.
 */
export function ChecksChip({
  checks,
  detail,
  conflicts
}: {
  checks: ChecksStatus
  detail?: string
  conflicts: boolean
}): JSX.Element | null {
  const copy = checksCopy(checks, detail)
  // A still-running check has nothing to report, so the slot stays empty unless
  // the merge conflict beside it needs the room.
  if (!copy.label && !conflicts) return null
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {copy.label && (
        <span className={cn('inline-flex min-w-0 items-center gap-1 text-ui-xs', copy.tone)}>
          <ChecksGlyph checks={checks} />
          <span className="truncate">{copy.label}</span>
        </span>
      )}
      {conflicts && (
        <span className="inline-flex shrink-0 items-center gap-1 text-ui-xs font-medium text-destructive">
          <Alert02 size={11} strokeWidth={2} className="shrink-0" />
          Merge conflicts
        </span>
      )}
    </span>
  )
}

export type FileChangeStatus = 'added' | 'deleted' | 'renamed' | 'modified'

/** File row glyph, colored the way the source-control panel colors its badges. */
export function FileChangeGlyph({ status }: { status: FileChangeStatus }): JSX.Element {
  if (status === 'added') return <FileAdd size={12} strokeWidth={1.8} className="shrink-0 text-success" />
  if (status === 'deleted') return <Delete02 size={12} strokeWidth={1.8} className="shrink-0 text-destructive" />
  if (status === 'renamed') return <FileEdit size={12} strokeWidth={1.8} className="shrink-0 text-brand" />
  return <File01 size={12} strokeWidth={1.8} className="shrink-0 text-warning" />
}

/** `+3.4k -78`, in the diff tokens so it never reads as success/failure state. */
export function DiffStat({
  additions,
  deletions,
  className
}: {
  additions: number
  deletions: number
  className?: string
}): JSX.Element {
  return (
    <span className={cn('shrink-0 whitespace-nowrap font-mono text-ui-xs tabular-nums', className)}>
      <span className="text-diff-added-foreground">+{compactCount(additions)}</span>{' '}
      <span className="text-diff-removed-foreground">-{compactCount(deletions)}</span>
    </span>
  )
}

/** Review verdict and "your turn" marker, text-only so the row stays quiet. */
export function ReviewChip({
  decision,
  reviewRequested
}: {
  decision: ReviewDecision
  reviewRequested: boolean
}): JSX.Element | null {
  const label = decisionCopy(decision)
  if (!label && !reviewRequested) return null
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {label && (
        <span
          className={cn(
            'truncate text-ui-xs',
            decision === 'CHANGES_REQUESTED'
              ? 'text-destructive'
              : decision === 'APPROVED'
                ? 'text-success'
                : 'text-foreground-subtle'
          )}
        >
          {label}
        </span>
      )}
      {reviewRequested && <span className="shrink-0 text-ui-xs text-brand">Your review requested</span>}
    </span>
  )
}

export function CommentCount({ count }: { count: number }): JSX.Element | null {
  if (count <= 0) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-ui-xs text-foreground-subtle">
      <HugeiconsIcon icon={BubbleChatIcon} size={11} strokeWidth={1.9} aria-hidden />
      {count}
    </span>
  )
}

export function StarButton({
  active,
  onToggle,
  label
}: {
  active: boolean
  onToggle(): void
  label: string
}): JSX.Element {
  return (
    <button
      type="button"
      title={active ? `${label} — remove star` : `${label} — star`}
      aria-label={active ? `Unstar ${label}` : `Star ${label}`}
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-md outline-none transition-colors duration-[var(--duration-instant)]',
        'focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'text-warning' : 'text-foreground-subtlest hover:bg-hover hover:text-foreground-subtle'
      )}
    >
      <HugeiconsIcon icon={StarIcon} size={13} strokeWidth={1.8} fill={active ? 'currentColor' : 'none'} aria-hidden />
    </button>
  )
}

/** Square icon button shared by every git-window header. */
export function IconButton({
  title,
  onClick,
  active,
  disabled,
  children,
  className
}: {
  title: string
  onClick(): void
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-lg outline-none transition-colors duration-[var(--duration-instant)]',
        'focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
        active ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}

/** Clipboard affordance shared by the diff cards and the commit list. */
export function CopyButton({ text, label }: { text: string; label: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title={label}
      aria-label={`${label}: ${text}`}
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          })
          .catch(() => {})
      }}
      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? <Check size={12} strokeWidth={1.9} /> : <Copy01 size={12} strokeWidth={1.9} />}
    </button>
  )
}

/** Two-line list/heading primitive: a semibold value over a quiet label. */
export function Stat({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="truncate text-ui-caption font-medium text-foreground">{value}</div>
      <div className="truncate text-ui-xs text-foreground-subtlest">{label}</div>
    </div>
  )
}

/** Inline message row used for load failures and empty states alike. */
export function Note({
  tone = 'muted',
  icon,
  children
}: {
  tone?: 'muted' | 'warning'
  icon?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-ui-sm',
        tone === 'warning'
          ? 'border-warning/25 bg-warning/5 text-warning-foreground'
          : 'border-border bg-surface text-foreground-subtle'
      )}
    >
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1 text-pretty">{children}</div>
    </div>
  )
}
