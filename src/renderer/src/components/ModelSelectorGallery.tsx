import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import type { ProvidersInfo } from '../../../shared/protocol'
import { cn } from '../util'
import { BLOOM_FAST, bloomUp } from '../motion'
import ProviderLogo from './ProviderLogo'

export function ModelIcon({ model, className }: { model: string; className?: string }): JSX.Element {
  const icons: Record<string, string> = {
    "Composer 2.5": "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695268/cursor-ai-code-icon_j4vnux.svg",
    "Gemini 3.5 Flash": "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695268/google-gemini-icon_l6kk5q.svg",
    "GPT 5.5": "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695269/openai-icon_zozuib.svg",
    "Opus 4.8": "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695268/Claude_AI_symbol_yqfzlc.svg",
    "GLM 5.2": "https://res.cloudinary.com/drhx7imeb/image/upload/v1781695269/z-ai-icon_xi4xvo.svg"
  }

  const filters: Record<string, string> = {
    "GPT 5.5": "dark:invert",
  }

  const src = icons[model]
  if (!src) {
    const providerName = model.includes('/') ? model.split('/', 1)[0] : 'openai'
    return <ProviderLogo providerId={providerName} size={14} className={className} />
  }

  return (
    <img
      src={src}
      alt={model}
      className={cn("object-contain", filters[model], className)}
    />
  )
}

function QuickSearchIcon({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 14L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export interface GalleryMenuProps {
  align: 'left' | 'right'
  providers: ProvidersInfo
  activeProvider: string | null
  onSelectProvider(name: string): void
  visibleModels: string[]
  model?: string
  onPick(ref: string): void
  modelQuery: string
  onQueryChange(value: string): void
  onPickFirst(): void
  emptyHint: string
}

export default function ModelSelectorGallery({
  align,
  providers,
  activeProvider,
  onSelectProvider,
  visibleModels,
  model,
  onPick,
  modelQuery,
  onQueryChange,
  onPickFirst,
  emptyHint
}: GalleryMenuProps): JSX.Element {
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.classList.remove('is-shown')
    void el.offsetHeight
    const id = requestAnimationFrame(() => el.classList.add('is-shown'))
    return () => cancelAnimationFrame(id)
  }, [activeProvider])
  return (
    <motion.div
      style={{ transformOrigin: align === 'right' ? 'bottom right' : 'bottom left' }}
      className={cn(
        'absolute bottom-full z-50 mb-2.5 w-[380px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-lg',
        align === 'right' ? 'right-0' : 'left-0'
      )}
      variants={bloomUp}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={BLOOM_FAST}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex gap-1 p-1">
        {/* Provider rail */}
        <div className="no-scrollbar flex max-h-[260px] w-[52px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden rounded-xl bg-muted/60 p-1.5">
          {providers.providers.map((p) => {
            const active = p.name === activeProvider
            return (
              <button
                key={p.name}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectProvider(p.name)
                }}
                title={p.name}
                aria-label={`Provider ${p.name}`}
                aria-pressed={active}
                className={cn(
                  't-gallery-rail-btn grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground outline-none',
                  active ? 'bg-background text-foreground shadow-sm' : 'hover:bg-background/60 hover:text-foreground'
                )}
              >
                <ProviderLogo providerId={p.name} size={18} />
              </button>
            )
          })}
        </div>

        {/* Model list */}
        <div className="min-w-0 flex-1 px-1.5 pb-1.5 pt-1">
          <div className="flex h-8 items-center justify-between gap-2 px-1.5">
            <span className="text-xs font-medium text-muted-foreground select-none">Models</span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                searchRef.current?.focus()
              }}
              className="flex cursor-text items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Quick search models"
            >
              <input
                ref={searchRef}
                autoFocus
                value={modelQuery}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onPickFirst()
                  }
                  if (e.key === 'Escape' && modelQuery) {
                    e.stopPropagation()
                    onQueryChange('')
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                placeholder="Quick Search"
                aria-label="Quick search models"
                className="h-7 w-28 bg-transparent text-right text-xs text-foreground outline-none placeholder:text-muted-foreground focus:text-left"
              />
              <QuickSearchIcon size={14} />
            </button>
          </div>

          <div ref={listRef} className="t-stagger flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {visibleModels.length > 0 ? (
              visibleModels.map((modelID, idx) => {
                const ref = `${activeProvider}/${modelID}`
                const active = ref === model
                return (
                  <button
                    key={modelID}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onPick(ref)
                    }}
                    style={{ transitionDelay: `calc(var(--stagger-stagger) * ${Math.min(idx, 8)})` }}
                    className={cn(
                      't-gallery-row t-stagger-line flex h-9 w-full shrink-0 items-center gap-2 rounded-xl px-2.5 text-left outline-none',
                      active ? 'bg-muted/70' : 'hover:bg-muted/40'
                    )}
                    aria-pressed={active}
                  >
                    <ModelIcon model={modelID} className="size-4 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                      {modelID}
                    </span>
                    <span
                      className="t-gallery-radio grid size-4 shrink-0 place-items-center rounded-full border border-border bg-transparent"
                      role="presentation"
                      data-active={active}
                    >
                      <span className="t-gallery-dot size-1.5 rounded-full" />
                    </span>
                  </button>
                )
              })
            ) : (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground/70">{emptyHint}</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
