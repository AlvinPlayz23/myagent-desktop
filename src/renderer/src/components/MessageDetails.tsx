import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { Message } from '../../../shared/protocol'

// A small always-open card showing the finished answer's model, token count,
// cost, and (when known) latency. `react-use-measure` is replaced by the local
// hook below — it is one ResizeObserver, and pulling a dependency in for that
// is not worth it.
const SPRING = {
  type: 'spring',
  stiffness: 200,
  damping: 22,
  mass: 1.2
} as const

// The width is fixed because the box animates to it; deriving it from content
// would mean animating to a target that itself moves.
const WIDTH_OPEN = 300

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`
}

function formatLatency(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

// `offsetHeight` rather than the observer's contentRect: the measured element
// carries padding, and the outer box animates to a height that has to include
// it or the card clips its own last row.
function useMeasuredHeight<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => setHeight(el.offsetHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, height]
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="text-[11.5px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[14px] tracking-tight text-foreground">{value}</div>
    </div>
  )
}

export default function MessageDetails({
  msg,
  durationMs
}: {
  msg: Message
  durationMs?: number
}): JSX.Element | null {
  const [ref, height] = useMeasuredHeight<HTMLDivElement>()

  const usage = msg.usage
  if (!usage) return null

  return (
    <motion.div
      initial={{ borderRadius: 16 }}
      animate={{
        width: WIDTH_OPEN,
        height: height > 0 ? height : 'auto',
        borderRadius: 16
      }}
      transition={{
        height: SPRING,
        width: SPRING,
        borderRadius: SPRING
      }}
      className="overflow-hidden bg-hover"
    >
      <div ref={ref} className="px-3.5 py-2">
        <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-4">
          <div className="col-span-2">
            <Field label="Model" value={msg.model || 'unknown'} />
          </div>
          <Field label="Tokens" value={formatTokens(usage.totalTokens)} />
          <Field label="Cost" value={`$${usage.cost.total.toFixed(4)}`} />
          {durationMs !== undefined && (
            <Field label="Latency" value={formatLatency(durationMs)} />
          )}
        </div>
      </div>
    </motion.div>
  )
}
