import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight } from './ui/icons'
import ThinkingState from './ThinkingState'
import { cn, duration } from '../util'

// Tallest the reasoning viewport grows before it starts scrolling instead, and
// the depth of the soft fade that signals there is more text out of view.
const MAX_HEIGHT = 180
const FADE = 16

// A reasoning block, in two phases.
//
//   live    a shimmering "Thinking" label over the reasoning as it streams,
//           held open and scrolled to the tail behind top/bottom fades
//   settled folds to a "Thought for Ns" summary the user can reopen
//
// Rendered inline while an assistant message streams (MessageView) and, once
// finalized, as a foldable work item inside ToolGroup.
export default function Thinking({
  text,
  live = false,
  durationMs
}: {
  text: string
  live?: boolean
  /** Absent for history loaded from disk — reasoning spans are not persisted. */
  durationMs?: number
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [fade, setFade] = useState({ top: false, bottom: false })
  const viewport = useRef<HTMLDivElement>(null)

  // While the model is still reasoning the block is always open; once it
  // settles it folds to the summary and the user owns the toggle.
  const expanded = live || open
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0)

  // Deltas change both the scroll position and the content height, so following
  // the tail and re-measuring the fades have to happen together, before paint.
  useLayoutEffect(() => {
    const el = viewport.current
    if (!el || !expanded) return
    if (live) el.scrollTop = el.scrollHeight
    const top = el.scrollTop > 1
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setFade((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
  }, [text, live, expanded])

  const onScroll = (): void => {
    const el = viewport.current
    if (!el) return
    setFade({
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1
    })
  }

  const mask =
    fade.top || fade.bottom
      ? `linear-gradient(to bottom, transparent 0, #000 ${fade.top ? FADE : 0}px, #000 calc(100% - ${
          fade.bottom ? FADE : 0
        }px), transparent 100%)`
      : undefined

  return (
    <div className="flex flex-col font-sans [animation:rise_0.32s_cubic-bezier(0.22,1,0.36,1)]">
      <button
        type="button"
        className={cn(
          'flex min-h-5 items-center gap-1.5 self-start rounded-md px-1.5 py-0.5 text-left transition-colors',
          live ? 'cursor-default' : 'hover:bg-hover/60'
        )}
        aria-expanded={expanded}
        aria-label={live ? 'Model is reasoning' : 'Toggle reasoning'}
        disabled={live}
        onClick={live ? undefined : () => setOpen((value) => !value)}
      >
        {live ? (
          <ThinkingState />
        ) : (
          <>
            <span className="text-[13px] font-medium leading-[18px] text-muted-foreground/70">
              <span className="text-muted-foreground">Thought</span>
              {durationMs === undefined ? '' : ` for ${duration(durationMs)}`}
            </span>
            <ChevronRight
              size={12}
              strokeWidth={1.8}
              className={cn(
                'shrink-0 text-muted-foreground/70 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                open && 'rotate-90'
              )}
            />
          </>
        )}
      </button>

      {paragraphs.length > 0 && (
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            expanded ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              ref={viewport}
              className="no-scrollbar mt-1.5 overflow-y-auto pl-1.5"
              style={{ maxHeight: MAX_HEIGHT, WebkitMaskImage: mask, maskImage: mask }}
              onScroll={onScroll}
            >
              <div className="flex flex-col gap-2">
                {paragraphs.map((paragraph, i) => (
                  <p
                    key={i}
                    className="m-0 whitespace-pre-wrap text-[13px] font-[425] leading-5 tracking-[-0.005em] text-muted-foreground [animation:rise_0.42s_cubic-bezier(0.22,1,0.36,1)]"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
