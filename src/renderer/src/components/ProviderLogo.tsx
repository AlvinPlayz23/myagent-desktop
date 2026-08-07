import { useEffect, useState } from 'react'
import { cn } from '../util'

// ----------------------------------------------------------------------
// Provider brand fallback dots (legacy color-keyed identifiers)
// ----------------------------------------------------------------------
const PROVIDER_DOT: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d97706',
  ollama: '#6366f1',
  openrouter: '#ec4899',
  lmstudio: '#14b8a6',
  vllm: '#8b5cf6',
  aihubmix: '#0ea5e9',
  zenmux: '#f59e0b'
}

function dotColor(name: string): string {
  return PROVIDER_DOT[name] ?? '#9ca3af'
}

/**
 * Small colored circle used as a lightweight provider indicator and as the
 * graceful fallback when a provider has no models.dev logo (custom endpoints,
 * offline, or an unresolved provider ID).
 */
export function ProviderDot({ name, size = 8, className }: { name: string; size?: number; className?: string }): JSX.Element {
  return (
    <span
      className={cn('shrink-0 rounded-full inline-block', className)}
      style={{ width: size, height: size, backgroundColor: dotColor(name) }}
      aria-hidden
    />
  )
}

interface ProviderLogoProps {
  /** Provider ID, which models.dev uses for `/logos/{provider}.svg`. */
  providerId: string
  size?: number
  className?: string
  /** Render `/logos/labs/{provider}.svg` (lab logos) instead of the top-level logo. */
  lab?: boolean
}

/**
 * Renders a provider's official SVG logo from models.dev
 * (`https://models.dev/logos/{provider}.svg`, or `/logos/labs/{lab}.svg` for
 * labs). Falls back to a colored `ProviderDot` when the provider has no logo,
 * fails to load, or the app is offline.
 */
export default function ProviderLogo({
  providerId,
  size = 16,
  className,
  lab = false
}: ProviderLogoProps): JSX.Element {
  const [failed, setFailed] = useState(false)
  const id = providerId.trim()

  // Reset the error state when switching to a different provider so a provider
  // that previously had no logo doesn't suppress a valid one downstream.
  useEffect(() => {
    setFailed(false)
  }, [id])

  if (!id) {
    return <ProviderDot name="" size={size} className={className} />
  }

  if (failed) {
    return <ProviderDot name={id} size={size} className={className} />
  }

  const src = lab
    ? `https://models.dev/logos/labs/${encodeURIComponent(id)}.svg`
    : `https://models.dev/logos/${encodeURIComponent(id)}.svg`

  return (
    <img
      src={src}
      alt={id}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={cn('shrink-0 object-contain', className)}
    />
  )
}
