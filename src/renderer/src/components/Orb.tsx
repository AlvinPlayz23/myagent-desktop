import type { CSSProperties } from 'react'
import styles from './Orb.module.css'
import type { OrbVariant } from '../preferences'

const STAGE = 28
const DEFAULT_SIZE = 20
const N = 3
const PITCH = 6
const MID = 1

/** Clockwise walk of the lattice perimeter: the track the orbit patterns run on. */
const RING: [number, number][] = [
  [0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]
]
const RING_INDEX = new Map(RING.map(([x, y], i) => [`${x},${y}`, i]))

/**
 * Per-cell animation-delay in ms. Negative delays seed a cell partway into its
 * cycle, which is what turns eight identical animations into one travelling comet.
 */
function cellDelay(variant: OrbVariant, x: number, y: number): number {
  const dx = x - MID
  const dy = y - MID
  switch (variant) {
    case 'S1':
      return Math.hypot(dx, dy) * 700 - (dx === 0 && dy === 0 ? 180 : 0)
    case 'S2':
      return ((x + y) / (2 * (N - 1))) * 1500
    case 'S3': {
      const i = RING_INDEX.get(`${x},${y}`)
      return i === undefined ? 0 : -(((RING.length - i) % RING.length) / RING.length) * 1700
    }
    case 'S4':
      return (x / (N - 1)) * 1100
    case 'S5': {
      const i = RING_INDEX.get(`${x},${y}`)
      return i === undefined ? 0 : -(((i * 3) % RING.length) / RING.length) * 1700
    }
  }
}

export interface OrbProps {
  variant?: OrbVariant
  size?: number
  className?: string
}

export default function Orb({ variant = 'S1', size = DEFAULT_SIZE, className }: OrbProps): JSX.Element {
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
          // The orbit patterns leave the centre dot out of the choreography.
          const still = (variant === 'S3' || variant === 'S5') && !RING_INDEX.has(`${x},${y}`)
          return (
            <span
              key={`${x},${y}`}
              className={styles.cell}
              data-still={still ? '' : undefined}
              style={{
                left: x * PITCH,
                top: y * PITCH,
                animationDelay: `${cellDelay(variant, x, y)}ms`
              }}
            />
          )
        })}
      </span>
    </span>
  )
}
