import type { ChecksStatus, PullState, ReviewDecision } from '../../../shared/protocol'

// Small pure helpers shared by the git window's screens: the copy a chip shows,
// how a count reads in a narrow column, and who an avatar belongs to.

/** "just now" / "19h ago" / "2d ago" — the metadata column in the list. */
export function relLabel(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, (Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/**
 * Diff counts in a fixed-width slot: a 3,400-line PR and a 12-line one have to
 * line up in a list, so thousands collapse to one decimal.
 */
export function compactCount(value: number): string {
  if (value < 1000) return String(value)
  const thousands = value / 1000
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}k`
}

/** Initials for the letter-avatar fallback. */
export function initials(login: string): string {
  const clean = login.replace(/\[bot\]$/i, '')
  const parts = clean.split(/[-_.\s]+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  return clean.slice(0, 2).toUpperCase()
}

/**
 * A stable tint per author, drawn only from theme tokens so every named theme
 * keeps working. Avatars are letter discs rather than remote images: no
 * network round-trip, nothing to load, and no external origin in the renderer.
 */
const AVATAR_TOKENS = ['--brand', '--info', '--success', '--warning', '--busy', '--destructive']

export function avatarTone(login: string): { backgroundColor: string; color: string } {
  let hash = 0
  for (let i = 0; i < login.length; i++) hash = (hash * 31 + login.charCodeAt(i)) % 997
  const token = AVATAR_TOKENS[hash % AVATAR_TOKENS.length] ?? '--brand'
  return {
    backgroundColor: `color-mix(in srgb, var(${token}) 18%, transparent)`,
    color: `var(${token})`
  }
}

export interface ChecksCopy {
  label: string
  tone: string
}

/**
 * CI chip copy. `detail` is the head commit's short sha, as GitHub shows it.
 *
 * Checks that are still running get an empty label on purpose: nothing has been
 * decided, so there is nothing to tell the reader, and a row of "CI running"
 * chips is noise that reads identically to a real status. Callers render
 * nothing when the label is empty.
 */
export function checksCopy(checks: ChecksStatus, detail?: string): ChecksCopy {
  const suffix = detail ? ` · ${detail}` : ''
  switch (checks) {
    case 'failing':
      return { label: `CI failing${suffix}`, tone: 'text-destructive' }
    case 'pending':
      return { label: '', tone: '' }
    case 'passing':
      return { label: `CI passed${suffix}`, tone: 'text-success' }
    case 'skipped':
      return { label: `CI skipped${suffix}`, tone: 'text-foreground-subtle' }
    default:
      return { label: `No checks reported${suffix}`, tone: 'text-foreground-subtle' }
  }
}

export function decisionCopy(decision: ReviewDecision): string {
  switch (decision) {
    case 'APPROVED':
      return 'Approved'
    case 'CHANGES_REQUESTED':
      return 'Changes requested'
    case 'REVIEW_REQUIRED':
      return 'Review required'
    default:
      return ''
  }
}

/**
 * One PR is "needs attention" when something is waiting on a human: a failing
 * build, a conflict, a requested change, or a review the viewer owes. A merged
 * or closed PR waits on nobody, whatever state its checks were left in.
 */
export function needsAttention(pull: {
  state: PullState
  checks: ChecksStatus
  conflicts: boolean
  reviewDecision: ReviewDecision
  reviewRequested: boolean
}): boolean {
  if (pull.state !== 'OPEN') return false
  return (
    pull.checks === 'failing' ||
    pull.conflicts ||
    pull.reviewDecision === 'CHANGES_REQUESTED' ||
    pull.reviewRequested
  )
}

/** File icon bucket for the diff viewer's tree. */
export function fileBucket(path: string): string {
  const name = path.split('/').pop() ?? path
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1) : ''
}
