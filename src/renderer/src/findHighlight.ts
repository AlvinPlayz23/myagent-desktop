// Text search inside the transcript.
//
// Matching walks the rendered DOM rather than the data model on purpose: the
// user is looking for what is on screen, including code blocks, tool output and
// markdown that the data model no longer has as one string. Highlighting goes
// through the CSS Custom Highlight API so it never mutates React's nodes — a
// wrapped <mark> would be thrown away on the next render, and rebuilding the
// tree mid-stream would break the transcript's scroll anchoring.
//
// Ranges are re-collected when the query changes; they are live Range objects,
// so late layout (a font swap, syntax highlighting) updates their geometry.

const ALL = 'chat-find'
const CURRENT = 'chat-find-current'
/** Long transcripts should stay responsive; nobody steps through 500 matches. */
const MATCH_LIMIT = 500

type HighlightCtor = new (...ranges: Range[]) => unknown
type HighlightRegistry = {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}

function support(): { registry: HighlightRegistry; Highlight: HighlightCtor } | null {
  const host = window as unknown as {
    Highlight?: HighlightCtor
    CSS?: { highlights?: HighlightRegistry }
  }
  if (!host.Highlight || !host.CSS?.highlights) return null
  return { registry: host.CSS.highlights, Highlight: host.Highlight }
}

/** Every case-insensitive occurrence of `query` inside `root`'s text nodes. */
export function collectFindRanges(root: Node, query: string): Range[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return []
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return NodeFilter.FILTER_REJECT
      if (parent.closest('[data-find-skip]')) return NodeFilter.FILTER_REJECT
      return (node as Text).data.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })
  const haystackFor = (text: string): string => text.toLowerCase()
  for (let node = walker.nextNode(); node && ranges.length < MATCH_LIMIT; node = walker.nextNode()) {
    const text = (node as Text).data
    const haystack = haystackFor(text)
    let from = 0
    for (;;) {
      const at = haystack.indexOf(needle, from)
      if (at < 0 || ranges.length >= MATCH_LIMIT) break
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + needle.length)
      ranges.push(range)
      from = at + needle.length
    }
  }
  return ranges
}

/** Paint all matches, with the focused one drawn in the inverted ink color. */
export function paintFind(ranges: Range[], active: number): void {
  const host = support()
  if (!host) return
  host.registry.set(ALL, new host.Highlight(...ranges))
  const current = ranges[active]
  if (current) host.registry.set(CURRENT, new host.Highlight(current))
  else host.registry.delete(CURRENT)
}

export function clearFind(): void {
  const host = support()
  if (!host) return
  host.registry.delete(ALL)
  host.registry.delete(CURRENT)
}
