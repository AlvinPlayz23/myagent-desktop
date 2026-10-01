import Orb from './Orb'

/** Live agent activity indicator used when a run has not produced visible output yet. */
export default function Working(): JSX.Element {
  return (
    <span
      className="inline-flex select-none items-center gap-1.5 text-ui-caption font-medium leading-[18px] text-muted-foreground"
      role="status"
      aria-label="Working"
    >
      <Orb size={20} className="text-muted-foreground" />
      <span className="shimmer-text">Working</span>
    </span>
  )
}
