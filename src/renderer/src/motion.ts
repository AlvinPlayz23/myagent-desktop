import type { Transition, Variants } from 'motion/react'

// Shared motion vocabulary.
//
// Everything that appears over the translucent shell — menus, modals, a session
// opening, the landing screen — fades in on opacity + transform only, and never
// travels far enough to read as a slide across the desktop showing through the
// window. Blur is deliberately *not* part of that vocabulary: an animated
// `filter` is re-rasterized on every frame and cannot be composited, which
// inside a translucent window is the most expensive thing the renderer can be
// asked to do. `bloom()` still takes a blur argument for the one-off case where
// a small element genuinely earns it.

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
/**
 * Mirror of EASE_OUT for things leaving. EASE_OUT front-loads its distance —
 * great for an entrance, wrong for an exit, where it collapses most of the way
 * instantly and then crawls, reading as a snap rather than a close.
 */
export const EASE_IN: [number, number, number, number] = [0.64, 0, 0.78, 0]

/**
 * Small attached surfaces: dropdowns, context menus, command palettes.
 * Token mapping: dropdown open → var(--dropdown-open-dur) (140ms),
 * close → var(--dropdown-close-dur) (110ms). Kept as numbers because
 * motion/react needs numeric durations; the values track the tokens.
 */
export const BLOOM_FAST: Transition = { duration: 0.14, ease: EASE_OUT }
/**
 * Full-panel surfaces: modals, a session or view coming in.
 * Token mapping: modal open → var(--modal-open-dur) (180ms),
 * panel open → var(--panel-open-dur) (220ms). See styles.css.
 */
export const BLOOM: Transition = { duration: 0.2, ease: EASE_OUT }

/**
 * Bloom entrance. `origin` is not set here — give the element an
 * `origin-*` class so it grows from whatever edge its trigger sits on.
 *
 * `blur` defaults to 0 for the reason in the header: an animated `filter`
 * cannot be composited. Pass a number only for a one-off celebration on a
 * small element — never for anything the user opens repeatedly.
 *
 * Exit is shorter and shallower than enter: a dismissed surface should get out
 * of the way, not perform on the way out.
 */
export function bloom(distance = 4, blur = 0): Variants {
  // Rule 1 in scripts/check-motion.mjs forbids filter/blur in variants. This
  // builder is the one deliberate opt-out: every shipped call site passes 0,
  // and the argument documents what a future one-off celebration must cost.
  // motion:allow-blur
  const blurAt = (value: number): { filter?: string } =>
    blur > 0 ? { filter: `blur(${value}px)` } : {}
  return {
    initial: { opacity: 0, y: distance, scale: 0.98, ...blurAt(blur) },
    animate: { opacity: 1, y: 0, scale: 1, ...blurAt(0) },
    exit: {
      opacity: 0,
      y: distance * 0.6,
      scale: 0.99,
      ...blurAt(blur * 0.5),
      transition: { duration: 0.1, ease: EASE_IN }
    }
  }
}

// All three pass blur = 0. These are the app's most-used popovers — the
// composer model picker, tab overflow, sidebar menus, git panel, modals — so
// bloom()'s blur argument is their opt-in escape hatch, not their default.
/** Bloom for a surface anchored below its trigger (drops downward). */
export const bloomDown = bloom(-6, 0)
/** Bloom for a surface anchored above its trigger (rises upward). */
export const bloomUp = bloom(6, 0)
/** Bloom in place — no directional offset. For modals and full-panel swaps. */
export const bloomIn = bloom(0, 0)

/**
 * Panel-swap fade: entering a session, or moving between chat / settings /
 * home. Runs under `AnimatePresence mode="popLayout"`, which lifts the outgoing
 * surface out of flow so both halves play at once — the incoming surface is
 * laid out and visible on the first frame, and the outgoing one simply fades
 * off the top of it. That is what makes a tab click feel immediate instead of
 * costing an exit plus an entrance in sequence.
 *
 * Keep the exit shorter than the entrance so the handoff reads as the new view
 * arriving rather than the old one leaving. Blur and scale are deliberately
 * absent: a full-height surface is the worst possible place to pay for an
 * animated filter, and scaling a panel inside a translucent window makes the
 * whole app look like it is breathing.
 */
export const bloomPanel: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: EASE_IN } }
}

/**
 * Disclosure (a folded section opening in place). Height drives the layout so
 * content below glides instead of jumping; opacity trails the height on the way
 * in and leads it on the way out, so text never shows through a half-open clip.
 */
export const disclosure: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: 'auto',
    opacity: 1,
    transition: {
      height: { duration: 0.22, ease: EASE_OUT },
      opacity: { duration: 0.16, delay: 0.04, ease: 'easeOut' }
    }
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: 0.18, ease: EASE_OUT },
      opacity: { duration: 0.1, ease: 'easeOut' }
    }
  }
}
