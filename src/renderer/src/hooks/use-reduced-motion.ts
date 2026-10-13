import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Whether motion should be suppressed: the OS preference, the app's own
 * "Reduce UI motion" setting (Settings → Appearance), or both.
 *
 * App.tsx mirrors that setting onto `<html class="reduce-motion">`, which the
 * stylesheet already reads as a media query of its own. Observing the class
 * here keeps the two sources in sync without threading preferences down the
 * component tree — the same signal EffortSlider.tsx reads by hand.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(QUERY).matches || document.documentElement.classList.contains('reduce-motion')
}

/**
 * Reactive form of `prefersReducedMotion`. Resubscribes on both sources, so
 * toggling the setting in Settings swaps out any reduced-motion fallback at
 * once instead of waiting for a reload.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)

  useEffect(() => {
    const sync = (): void => setReduced(prefersReducedMotion())
    sync()
    const query = window.matchMedia(QUERY)
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    query.addEventListener('change', sync)
    return () => {
      observer.disconnect()
      query.removeEventListener('change', sync)
    }
  }, [])

  return reduced
}
