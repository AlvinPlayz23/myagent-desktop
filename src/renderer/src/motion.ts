import type { Transition, Variants } from 'motion/react'

// Shared motion vocabulary.
//
// The Home screen resolves out of a soft blur rather than sliding (see the
// `bloom` keyframe in styles.css): the window is translucent, so translating a
// surface across the desktop showing through it reads as a smear. Everything
// that appears over that same translucent shell — menus, modals, a session
// opening — now shares that character instead of each inventing its own pop.

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
/**
 * Mirror of EASE_OUT for things leaving. EASE_OUT front-loads its distance —
 * great for an entrance, wrong for an exit, where it collapses most of the way
 * instantly and then crawls, reading as a snap rather than a close.
 */
export const EASE_IN: [number, number, number, number] = [0.64, 0, 0.78, 0]

/** Small attached surfaces: dropdowns, context menus, command palettes. */
export const BLOOM_FAST: Transition = { duration: 0.2, ease: EASE_OUT }
/** Full-panel surfaces: modals, a session or view coming in. */
export const BLOOM: Transition = { duration: 0.34, ease: EASE_OUT }

/**
 * Blur-resolve entrance. `origin` is not set here — give the element an
 * `origin-*` class so it grows from whatever edge its trigger sits on.
 *
 * Exit stays shorter than enter and uses a smaller blur: a dismissed surface
 * should get out of the way, not perform on the way out.
 */
export function bloom(distance = 6, blur = 8): Variants {
  return {
    initial: { opacity: 0, y: distance, scale: 0.97, filter: `blur(${blur}px)` },
    animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, y: distance * 0.6, scale: 0.985, filter: `blur(${blur * 0.5}px)` }
  }
}

/** Bloom for a surface anchored below its trigger (drops downward). */
export const bloomDown = bloom(-6, 8)
/** Bloom for a surface anchored above its trigger (rises upward). */
export const bloomUp = bloom(6, 8)
/** Bloom in place — no directional offset. For modals and full-panel swaps. */
export const bloomIn = bloom(0, 10)

/**
 * Panel-swap bloom: entering a session, or moving between chat / settings /
 * home. Used under `AnimatePresence mode="wait"`, where the outgoing surface
 * must finish before the incoming one starts — so the exit is deliberately
 * much shorter than the entrance, or a session switch would cost most of a
 * second before anything appears.
 */
export const bloomPanel: Variants = {
  initial: { opacity: 0, scale: 0.985, filter: 'blur(10px)' },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.34, ease: EASE_OUT }
  },
  exit: {
    opacity: 0,
    scale: 0.995,
    filter: 'blur(5px)',
    transition: { duration: 0.11, ease: 'easeOut' }
  }
}
