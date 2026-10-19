import { useEffect, useRef, useState } from 'react'
import type { PullRequestDetail } from '../../../shared/protocol'
import { Alert02, ArrowUp02, Loading03 } from '../components/ui/icons'
import { Kbd, KbdGroup } from '../components/ui/kbd'
import Markdown from '../components/Markdown'
import { cn } from '../util'
import { postComment } from './api'
import { Avatar } from './PullBits'
import { relLabel } from './format'

// The conversation page: what people said, in order, with the description as
// the opening entry — the same reading order GitHub uses, so a reviewer never
// has to bounce to another page to find out what the PR is for.

interface Props {
  cwd: string
  number: number
  data: PullRequestDetail
  /** True while the window is showing fixtures instead of live GitHub data. */
  demo: boolean
  onPosted(): void
}

function Entry({
  author,
  timestamp,
  action,
  body
}: {
  author: string
  timestamp: string
  action: string
  body: string
}): JSX.Element {
  return (
    <article className="flex gap-3">
      <Avatar login={author} size={24} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-ui-caption font-medium text-foreground">{author}</span>
          <span className="shrink-0 text-ui-xs text-foreground-subtlest">{action}</span>
          <span className="shrink-0 text-ui-xs text-foreground-subtlest">{relLabel(timestamp)}</span>
        </div>
        <div className="mt-1.5">
          <Markdown text={body} />
        </div>
      </div>
    </article>
  )
}

export default function PullConversation({ cwd, number, data, demo, onPosted }: Props): JSX.Element {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  // The composer grows with its content instead of scrolling a one-line slot.
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [body])

  const canSend = !demo && !sending && body.trim().length > 0

  const submit = async (): Promise<void> => {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      await postComment(cwd, number, body)
      setBody('')
      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-5">
          {data.body.trim() ? (
            <Entry author={data.author} timestamp={data.createdAt} action="opened this pull request" body={data.body} />
          ) : (
            <p className="text-ui-sm text-foreground-subtlest">No description was provided.</p>
          )}

          {data.comments.length > 0 && (
            <div className="flex flex-col gap-6">
              {data.comments.map((comment) => (
                <Entry
                  key={comment.id}
                  author={comment.author}
                  timestamp={comment.createdAt}
                  action={comment.kind === 'review' ? 'reviewed' : 'commented'}
                  body={comment.body}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 px-6 py-3">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-xl border border-input bg-card shadow-sm transition-[border-color,box-shadow] duration-[var(--duration-quick)] focus-within:border-input-border-focused focus-within:ring-2 focus-within:ring-ring/20">
            <textarea
              ref={composerRef}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void submit()
                }
              }}
              rows={1}
              disabled={demo || sending}
              placeholder={demo ? 'Commenting needs the GitHub CLI — this window is showing demo data.' : 'Write a comment… Type @ to mention someone'}
              aria-label="Write a comment"
              className="block max-h-52 min-h-[42px] w-full resize-none rounded-t-xl bg-transparent px-3.5 py-3 text-ui-caption leading-relaxed text-foreground outline-none placeholder:text-foreground-subtlest disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
              {error ? (
                <span className="flex min-w-0 items-center gap-1.5 text-ui-xs text-destructive">
                  <Alert02 size={12} strokeWidth={2} className="shrink-0" />
                  <span className="truncate" title={error}>
                    {error}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-ui-xs text-foreground-subtlest">
                  <KbdGroup>
                    <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>
                  </KbdGroup>
                  <span>to comment</span>
                </span>
              )}
              <button
                type="button"
                title="Comment"
                aria-label="Comment"
                disabled={!canSend}
                onClick={() => void submit()}
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground outline-none transition-opacity duration-[var(--duration-instant)]',
                  'hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35'
                )}
              >
                {sending ? <Loading03 size={13} className="animate-spin" /> : <ArrowUp02 size={13} strokeWidth={2} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
