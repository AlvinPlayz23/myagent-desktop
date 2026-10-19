import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkBadge01Icon, GitCompareIcon } from '@hugeicons/core-free-icons'
import type { PullRequestDetail } from '../../../shared/protocol'
import { Alert02, GitCommitHorizontal } from '../components/ui/icons'
import Markdown from '../components/Markdown'
import { cn } from '../util'
import { Avatar, ChecksChip, DiffStat, FileChangeGlyph, ReviewChip, Stat } from './PullBits'
import { relLabel } from './format'

// The about page: everything a reviewer checks before opening the diff — what
// the PR claims to do, which branches it moves between, how big it is, who
// touched it, and what CI thinks. The description is here and on the
// conversation page on purpose: one reads as the opening message, the other as
// the summary you come back to.

const FILE_PREVIEW_LIMIT = 14

function Panel({
  title,
  action,
  children
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
      <header className="flex h-9 items-center gap-2 border-b border-border/60 bg-surface px-3">
        <h2 className="min-w-0 flex-1 truncate text-ui-caption font-medium text-foreground">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 border-b border-border/40 px-3 py-2.5 last:border-b-0">
      <span className="text-ui-xs font-medium text-foreground-subtlest">{label}</span>
      <div className="min-w-0 text-ui-caption text-foreground">{children}</div>
    </div>
  )
}

export default function PullAbout({
  data,
  onOpenFiles
}: {
  data: PullRequestDetail
  onOpenFiles(): void
}): JSX.Element {
  const preview = data.files.slice(0, FILE_PREVIEW_LIMIT)
  const hidden = data.files.length - preview.length
  const reviewable = data.reviewDecision !== '' || data.reviewRequested || data.conflicts || data.checks !== 'none'

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-5">
          {reviewable && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-surface px-3 py-2.5">
              <ReviewChip decision={data.reviewDecision} reviewRequested={data.reviewRequested} />
              <ChecksChip checks={data.checks} detail={data.checksDetail} conflicts={data.conflicts} />
              {data.reviewDecision === 'APPROVED' && (
                <span className="inline-flex items-center gap-1 text-ui-xs text-success">
                  <HugeiconsIcon icon={CheckmarkBadge01Icon} size={12} strokeWidth={1.9} aria-hidden />
                  Ready to merge
                </span>
              )}
            </div>
          )}

          <Panel title="Description">
            <div className="p-3.5">
              {data.body.trim() ? (
                <Markdown text={data.body} />
              ) : (
                <p className="text-ui-sm text-foreground-subtlest">No description was provided.</p>
              )}
            </div>
          </Panel>

          <Panel title={`Commits (${data.commits.length})`}>
            {data.commits.length === 0 ? (
              <p className="px-3.5 py-3 text-ui-sm text-foreground-subtlest">No commits in this pull request.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {data.commits.map((commit) => (
                  <li key={commit.oid} className="flex items-start gap-2.5 px-3.5 py-2.5">
                    <span className="mt-0.5 text-foreground-subtlest">
                      <GitCommitHorizontal size={13} strokeWidth={1.7} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ui-caption text-foreground" title={commit.messageHeadline}>
                        {commit.messageHeadline}
                      </p>
                      {commit.messageBody.trim() && (
                        <p className="mt-0.5 line-clamp-2 text-ui-xs text-foreground-subtlest">{commit.messageBody}</p>
                      )}
                      <p className="mt-1 flex items-center gap-2 text-ui-xs text-foreground-subtlest">
                        <Avatar login={commit.author} size={14} />
                        <span className="truncate">{commit.author}</span>
                        <span className="shrink-0 font-mono">{commit.shortOid}</span>
                        <span className="shrink-0">{relLabel(commit.date)}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={`Files changed (${data.changedFiles})`}
            action={
              <button
                type="button"
                onClick={onOpenFiles}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-ui-xs font-medium text-muted-foreground outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HugeiconsIcon icon={GitCompareIcon} size={12} strokeWidth={1.8} aria-hidden />
                View diff
              </button>
            }
          >
            {data.files.length === 0 ? (
              <p className="px-3.5 py-3 text-ui-sm text-foreground-subtlest">No changed files reported.</p>
            ) : (
              <>
                <ul className="divide-y divide-border/40">
                  {preview.map((file) => (
                    <li key={file.path}>
                      <button
                        type="button"
                        onClick={onOpenFiles}
                        title={file.path}
                        className="flex w-full items-center gap-2 px-3.5 py-1.5 text-left outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <FileChangeGlyph status={file.oldPath ? 'renamed' : 'modified'} />
                        <span className="min-w-0 flex-1 truncate font-mono text-ui-xs text-foreground">{file.path}</span>
                        <DiffStat additions={file.additions} deletions={file.deletions} />
                      </button>
                    </li>
                  ))}
                </ul>
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={onOpenFiles}
                    className="w-full border-t border-border/40 px-3.5 py-2 text-left text-ui-xs text-muted-foreground outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    + {hidden} more file{hidden === 1 ? '' : 's'}
                  </button>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>

      <aside aria-label="Pull request metadata" className="w-[292px] shrink-0 overflow-y-auto border-l border-border/60">
        <div className="p-4">
          <div className="flex items-center gap-2.5">
            <Avatar login={data.author} size={30} />
            <div className="min-w-0">
              <div className="truncate text-ui-caption font-medium text-foreground">{data.author}</div>
              <div className="truncate text-ui-xs text-foreground-subtlest">
                opened {relLabel(data.createdAt)} · {data.state.toLowerCase()}
              </div>
            </div>
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-surface p-2.5">
            <Stat label="Files" value={data.changedFiles} />
            <Stat
              label="Added"
              value={<span className="text-diff-added-foreground">+{data.additions.toLocaleString()}</span>}
            />
            <Stat
              label="Removed"
              value={<span className="text-diff-removed-foreground">-{data.deletions.toLocaleString()}</span>}
            />
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
            <MetaRow label="Branches">
              <span className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-ui-xs">
                <span className="break-all text-foreground">{data.headRefName}</span>
                <span className="shrink-0 text-foreground-subtlest">←</span>
                <span className="break-all">{data.baseRefName}</span>
              </span>
            </MetaRow>
            {data.headRepo && (
              <MetaRow label="Head repository">
                <span className="break-all font-mono text-ui-xs">{data.headRepo}</span>
              </MetaRow>
            )}
            <MetaRow label="Checks">
              <ChecksChip checks={data.checks} detail={data.checksDetail} conflicts={data.conflicts} />
              {data.checks === 'pending' && <span className="text-foreground-subtlest">No result yet</span>}
            </MetaRow>
            <MetaRow label="Review">
              {data.reviewDecision || data.reviewRequested ? (
                <ReviewChip decision={data.reviewDecision} reviewRequested={data.reviewRequested} />
              ) : (
                <span className="text-foreground-subtlest">Not reviewed yet</span>
              )}
            </MetaRow>
            <MetaRow label="Comments">
              <span className="tabular-nums">{data.commentCount}</span>
            </MetaRow>
            <MetaRow label="Updated">
              <span>{relLabel(data.updatedAt)}</span>
            </MetaRow>
          </div>

          {data.labels.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.labels.map((label) => (
                <span
                  key={label.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-ui-xs text-foreground-subtle"
                >
                  {/* GitHub owns these colors, so the swatch is data, not theme. */}
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color ? `#${label.color}` : 'var(--foreground-subtlest)' }}
                    aria-hidden
                  />
                  {label.name}
                </span>
              ))}
            </div>
          )}

          {data.conflicts && (
            <p className={cn('mt-3 flex items-start gap-1.5 text-ui-xs text-destructive')}>
              <Alert02 size={12} strokeWidth={2} className="mt-px shrink-0" />
              This branch has conflicts that must be resolved before merging.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
