import type { RunIndicatorStyle } from '../preferences'

/** Live-run glyph: a 3x3 dot-matrix wave, or a plain busy-coloured dot. */
export default function RunIndicator({ variant }: { variant: RunIndicatorStyle }): JSX.Element {
  if (variant === 'color') {
    return <span className="size-[7px] rounded-full bg-[color:var(--busy)]" aria-hidden />
  }
  return (
    <span className="grid grid-cols-3 gap-[1.5px]" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className="size-[3px] rounded-full bg-[color:var(--busy)] [animation:work-pulse_1.2s_ease-in-out_infinite]"
          style={{ animationDelay: `${((i % 3) + Math.floor(i / 3)) * 0.12}s` }}
        />
      ))}
    </span>
  )
}
