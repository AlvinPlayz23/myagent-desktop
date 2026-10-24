import { Suspense, lazy } from 'react'

// react-markdown + remark-gfm are ~370 KB of parser that only matter once a
// message has *settled* — the streaming path deliberately renders plain
// pre-wrapped text (see MessageView). Loading that parser at boot meant every
// cold start paid for it before the home screen could paint. Deferring it to
// the first finalized message keeps it off the startup path entirely.
const Markdown = lazy(() => import('./Markdown'))

/**
 * Drop-in replacement for `Markdown` that loads the parser on demand.
 *
 * The fallback is the same `whitespace-pre-wrap` node the streaming path
 * renders, so the hand-off to parsed markdown is a reflow of identical text —
 * no blank frame, no layout jump, no spinner.
 */
export default function LazyMarkdown({ text }: { text: string }): JSX.Element {
  return (
    <Suspense fallback={<div className="chat-markdown whitespace-pre-wrap">{text}</div>}>
      <Markdown text={text} />
    </Suspense>
  )
}
