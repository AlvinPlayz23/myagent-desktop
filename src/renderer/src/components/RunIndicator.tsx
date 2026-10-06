import type { RunIndicatorStyle } from '../preferences'
import Orb from './Orb'

/** Live-run glyph: one of the Orb patterns, or a plain busy-coloured dot. */
export default function RunIndicator({ variant }: { variant: RunIndicatorStyle }): JSX.Element {
  if (variant === 'color') {
    return <span className="size-[7px] rounded-full bg-[color:var(--busy)]" aria-hidden />
  }
  return <Orb variant={variant} size={16} className="text-[color:var(--busy)]" />
}
