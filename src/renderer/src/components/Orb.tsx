import type { CSSProperties } from 'react'
import styles from './Orb.module.css'

const STAGE = 28
const DEFAULT_SIZE = 20
const N = 3
const PITCH = 6
const MID = 1

function cellDelay(x: number, y: number): number {
  const dx = x - MID
  const dy = y - MID
  return Math.hypot(dx, dy) * 700 - (dx === 0 && dy === 0 ? 180 : 0)
}

export interface OrbProps {
  size?: number
  className?: string
}

export default function Orb({ size = DEFAULT_SIZE, className }: OrbProps): JSX.Element {
  return (
    <span
      className={[styles.root, className].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        '--orb-k': size / STAGE
      } as CSSProperties}
    >
      <span className={styles.lattice}>
        {Array.from({ length: N * N }, (_, index) => {
          const x = index % N
          const y = Math.floor(index / N)
          return (
            <span
              key={`${x},${y}`}
              className={styles.cell}
              style={{
                left: x * PITCH,
                top: y * PITCH,
                animationDelay: `${cellDelay(x, y)}ms`
              }}
            />
          )
        })}
      </span>
    </span>
  )
}
