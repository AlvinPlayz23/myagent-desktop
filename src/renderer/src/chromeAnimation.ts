/**
 * Marks <html> for the duration of a chrome geometry animation.
 *
 * Collapsing the sidebar and opening the git panel both resize a neighbour of
 * the chat panel, and during those frames the sidebar's backdrop-filter and the
 * chat panel's SVG grain have to be re-rasterized on top of an already expensive
 * layout pass. Those two effects dominate the cost — the same reason App.tsx
 * already drops them while the window is being resized — so this turns them off
 * for the duration and lets the geometry tween run on its own.
 *
 * The trade is deliberate: for those few frames the sidebar loses its extra
 * frost and the panel loses its grain, then both come back. Callers pass the
 * animation's own duration so the mask never outlives the motion.
 *
 * Overlapping calls keep the later deadline rather than the last one to land, so
 * a short animation cannot un-mask a longer one that is still running.
 */
const CLASS = 'chrome-animating'
let deadline = 0
let timer: number | null = null

function tick(): void {
  timer = null
  const remaining = deadline - performance.now()
  if (remaining > 8) {
    timer = window.setTimeout(tick, remaining)
    return
  }
  deadline = 0
  document.documentElement.classList.remove(CLASS)
}

export function startChromeAnimation(durationMs = 260): void {
  deadline = Math.max(deadline, performance.now() + durationMs)
  document.documentElement.classList.add(CLASS)
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(tick, durationMs)
}
