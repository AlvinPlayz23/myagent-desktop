// A bare shimmering label: the agent is working but has produced nothing to
// show yet. Used both as the transcript's waiting indicator and as the header
// of a reasoning block while it streams (see Thinking.tsx).
export default function ThinkingState({ label = 'Thinking' }: { label?: string }): JSX.Element {
  return (
    <span className="shimmer-text select-none text-[13px] font-medium leading-[18px]">{label}</span>
  )
}
