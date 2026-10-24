import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import type { ProvidersInfo, ReasoningEffort } from '../../../shared/protocol'
import type { EffortSelectorVariant, ModelSelectorVariant } from '../preferences'
import { cn } from '../util'
import { BLOOM_FAST, bloomUp } from '../motion'
import { ChevronRight, Rotate01, Tick01 } from './ui/icons'
import JellyRadio from './ui/JellyRadio'
import EffortSlider from './EffortSlider'
import ProviderLogo from './ProviderLogo'
import { ModelIcon } from './ModelSelectorGallery'
import { composerModelPicker } from '../shortcuts'

// ----------------------------------------------------------------------
// Model + effort, behind one control
// ----------------------------------------------------------------------
// The composer used to show two chips side by side: a model dropdown and an
// effort picker. They describe one choice ("how this turn is answered"), so
// they now share a single trigger. Clicking it opens a small menu with a Model
// row, an Effort row and a reset action; the Model/Effort rows open their
// picker as a submenu beside the menu rather than replacing it, so both stay
// one click apart.

const EFFORTS: { label: string; value: ReasoningEffort }[] = [
  { label: 'Default', value: '' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'XHigh', value: 'xhigh' },
  { label: 'Max', value: 'max' }
]

type Panel = 'root' | 'model' | 'effort'

type HoverStyle = { opacity: number; transform: string; transition: string }
const HOVER_HIDDEN: HoverStyle = { opacity: 0, transform: 'translateY(0px) scale(0.95)', transition: 'none' }

export interface ModelEffortPickerProps {
  model?: string
  providers: ProvidersInfo
  effort?: ReasoningEffort
  onModel(provider: string, model: string): void
  onSetEffort?(effort: ReasoningEffort): void
  /** Live-refreshes a provider's model list from its /v1/models endpoint. */
  onDiscoverModels?(name: string): void
  /** Model list presentation: provider footer cycler, or the gallery rail. */
  modelSelectorVariant?: ModelSelectorVariant
  /** Effort submenu presentation: slider rail (default) or JellyRadio chips. */
  effortSelectorVariant?: EffortSelectorVariant
  /** Which trigger edge the menu hangs from. */
  align?: 'left' | 'right'
  /** Backend rejects model/effort writes while a turn is running (ErrBusy). */
  disabled?: boolean
}

export default function ModelEffortPicker({
  model,
  providers,
  effort = '',
  onModel,
  onSetEffort,
  onDiscoverModels,
  modelSelectorVariant = 'compact',
  effortSelectorVariant = 'slider',
  align = 'left',
  disabled = false
}: ModelEffortPickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>('root')
  const [modelQuery, setModelQuery] = useState('')
  const [activeProvider, setActiveProvider] = useState<string | null>(null)
  const [hoverStyle, setHoverStyle] = useState<HoverStyle>(HOVER_HIDDEN)
  const [effortPreview, setEffortPreview] = useState<number | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const discoveryFired = useRef('')
  const openedRef = useRef(false)
  const initModelRef = useRef<string | undefined>(undefined)

  const activeProviderLabel = model?.includes('/') ? model.split('/', 1)[0] : null
  const shortModel = model?.includes('/') ? model.slice(model.indexOf('/') + 1) : model

  const effortUnsupported = useMemo(() => {
    const entry = providers.providers.find((p) => p.name === activeProviderLabel)
    const detail = entry?.modelDetails?.find((d) => d.id === shortModel)
    return detail != null && detail.reasoningKnown && !detail.reasoning
  }, [providers, activeProviderLabel, shortModel])

  const currentEffort = effortUnsupported ? '' : effort
  const currentEffortLabel = EFFORTS.find((item) => item.value === currentEffort)?.label ?? 'Default'
  const effortIndex = Math.max(0, EFFORTS.findIndex((item) => item.value === currentEffort))
  const effortSlider = effortSelectorVariant !== 'chips'

  const providerList = providers.providers
  // Never render a stale rail: fall back to the current model's provider, then
  // the first provider, without touching state.
  const effectiveActiveProvider =
    activeProvider && providerList.some((p) => p.name === activeProvider)
      ? activeProvider
      : activeProviderLabel && providerList.some((p) => p.name === activeProviderLabel)
        ? activeProviderLabel
        : providerList[0]?.name ?? null
  const provider = providerList.find((entry) => entry.name === effectiveActiveProvider)
  const query = modelQuery.trim().toLowerCase()
  const visibleModels = provider?.models.filter((m) => !query || m.toLowerCase().includes(query)) ?? []
  const galleryEmptyHint =
    provider && provider.models.length > 0 ? `No models match “${modelQuery}”.` : 'No models discovered yet.'
  const isGallery = modelSelectorVariant === 'gallery'

  const defaultRef = providers.defaultModel
  const atDefault = model === defaultRef && (effort ?? '') === ''

  // Global shortcut (mod+m) opens straight to the model submenu.
  useEffect(() => {
    composerModelPicker.current = () => {
      setOpen(true)
      setPanel('model')
    }
    return () => {
      composerModelPicker.current = null
    }
  }, [])

  // Dismiss on outside click / Escape, like every other composer popup. The
  // submenu lives inside `rootRef`, so clicking it never counts as outside.
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Escape backs out of a submenu first, then closes the menu.
      setPanel((current) => {
        if (current !== 'root') return 'root'
        setOpen(false)
        return current
      })
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // A run starting mid-edit must not leave a live-looking panel behind; the
  // backend would reject the write anyway.
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  // Seed the rail/search on a fresh open, or when the model changed under it.
  // A providers refresh (live discovery landing) must not reset either.
  useEffect(() => {
    if (!open) {
      openedRef.current = false
      setPanel('root')
      setModelQuery('')
      setHoverStyle(HOVER_HIDDEN)
      setEffortPreview(null)
      return
    }
    if (panel !== 'model') return
    if (openedRef.current && initModelRef.current === model) return
    openedRef.current = true
    initModelRef.current = model
    const fromModel = model?.includes('/') ? model.split('/', 1)[0] : null
    const initial = fromModel && providerList.some((p) => p.name === fromModel) ? fromModel : providerList[0]?.name ?? null
    setActiveProvider(initial)
    setModelQuery('')
    setHoverStyle(HOVER_HIDDEN)
    if (initial && discoveryFired.current !== initial) {
      discoveryFired.current = initial
      onDiscoverModels?.(initial)
    }
  }, [open, panel, model, providerList, onDiscoverModels])

  const pickModel = (ref: string): void => {
    const index = ref.indexOf('/')
    if (index <= 0 || index === ref.length - 1) return
    onModel(ref.slice(0, index), ref.slice(index + 1))
    setOpen(false)
  }

  const cycleProvider = (step: number): void => {
    if (providerList.length === 0) return
    const at = Math.max(0, providerList.findIndex((p) => p.name === effectiveActiveProvider))
    setActiveProvider(providerList[(at + step + providerList.length) % providerList.length].name)
    setHoverStyle(HOVER_HIDDEN)
  }

  const selectProvider = (name: string): void => {
    setActiveProvider(name)
    setHoverStyle(HOVER_HIDDEN)
    if (discoveryFired.current !== name) {
      discoveryFired.current = name
      onDiscoverModels?.(name)
    }
  }

  const pickFirstVisible = (): void => {
    if (visibleModels.length > 0 && provider) pickModel(`${provider.name}/${visibleModels[0]}`)
  }

  const setEffortAt = (index: number): void => {
    const next = EFFORTS[Math.max(0, Math.min(EFFORTS.length - 1, index))]
    if (!next || next.value === currentEffort) return
    onSetEffort?.(next.value)
  }

  const resetToDefault = (): void => {
    if (defaultRef && defaultRef !== model) {
      const divider = defaultRef.indexOf('/')
      if (divider > 0 && divider < defaultRef.length - 1) {
        onModel(defaultRef.slice(0, divider), defaultRef.slice(divider + 1))
      }
    }
    if (effort && onSetEffort) onSetEffort('')
    setOpen(false)
  }

  const hoverTo = (idx: number): void =>
    setHoverStyle((prev) => ({
      opacity: 1,
      transform: `translateY(${idx * 34}px) scale(1)`,
      transition: prev.opacity === 0 ? 'opacity 0.15s ease-out' : `transform 0.14s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.1s ease`
    }))

  const modelRows = visibleModels.map((modelID, idx) => {
    const ref = `${provider!.name}/${modelID}`
    const active = ref === model
    return (
      <button
        key={modelID}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => hoverTo(idx)}
        onClick={(e) => {
          e.stopPropagation()
          pickModel(ref)
        }}
        className="group relative flex h-8 w-full shrink-0 items-center justify-between rounded-xl px-2.5 text-left text-ui-sm font-medium text-muted-foreground outline-none active:scale-[0.98]"
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <ModelIcon model={modelID} className="size-3.5 shrink-0 opacity-85 transition-opacity group-hover:opacity-100" />
          <span className="truncate">{modelID}</span>
        </span>
        {active && <Tick01 size={12} className="ml-2 shrink-0 text-muted-foreground" />}
      </button>
    )
  })

  const providerCycler = (
    <div className="mx-1 mt-1 flex items-center justify-between gap-1 border-t border-border px-0.5 pb-0.5 pt-1">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation()
          cycleProvider(-1)
        }}
        disabled={providerList.length <= 1}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        aria-label="Previous provider"
      >
        <ChevronRight size={14} className="rotate-180" />
      </button>
      <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-ui-sm font-semibold text-foreground">
        {effectiveActiveProvider && <ProviderLogo providerId={effectiveActiveProvider} size={14} />}
        <span className="truncate">{effectiveActiveProvider ?? 'provider'}</span>
      </span>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation()
          cycleProvider(1)
        }}
        disabled={providerList.length <= 1}
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        aria-label="Next provider"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  )

  const providerRail = (
    <div className="no-scrollbar flex max-h-[260px] w-[44px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden rounded-xl bg-muted/60 p-1.5">
      {providerList.map((p) => {
        const active = p.name === effectiveActiveProvider
        return (
          <button
            key={p.name}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation()
              selectProvider(p.name)
            }}
            title={p.name}
            aria-label={`Provider ${p.name}`}
            aria-pressed={active}
            className={cn(
              't-gallery-rail-btn grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground outline-none',
              active ? 'bg-background text-foreground shadow-sm' : 'hover:bg-background/60 hover:text-foreground'
            )}
          >
            <ProviderLogo providerId={p.name} size={16} />
          </button>
        )
      })}
    </div>
  )

  // Every column of the popup is height-constrained by the popup itself, so
  // hovering between Model and Effort (or a model list that is still arriving)
  // never resizes the surface under the cursor. Long lists scroll instead.
  const modelPanel = (
    <div className={cn('flex h-full gap-1.5', isGallery ? 'w-[300px]' : 'w-[224px]')}>
      {isGallery && providerRail}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-1 flex h-8 shrink-0 items-center gap-2 px-2.5">
          <span className="shrink-0 text-ui-sm font-medium text-muted-foreground select-none">Model</span>
          <div className="relative ml-auto min-w-0 flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              size={12}
              strokeWidth={1.8}
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              autoFocus
              value={modelQuery}
              onChange={(e) => {
                setModelQuery(e.target.value)
                setHoverStyle(HOVER_HIDDEN)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  pickFirstVisible()
                }
                if (e.key === 'Escape' && modelQuery) {
                  e.stopPropagation()
                  setModelQuery('')
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="Search"
              aria-label="Search models"
              className="h-7 w-full rounded-lg border border-border bg-muted/50 pl-7 pr-2 text-ui-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-input focus:ring-1 focus:ring-input"
            />
          </div>
        </div>

        <div
          className="relative min-h-0 flex-1 overflow-y-auto px-0.5 pb-0.5"
          onMouseLeave={() => setHoverStyle((prev) => ({ ...prev, opacity: 0, transition: 'opacity 0.2s ease-in' }))}
        >
          <div className="relative flex flex-col gap-0.5">
            <div style={hoverStyle} className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-8 rounded-xl bg-accent" />
            {modelRows.length > 0 ? (
              modelRows
            ) : (
              <div className="px-3 py-4 text-center text-ui-sm text-foreground-subtlest">{galleryEmptyHint}</div>
            )}
          </div>
        </div>

        {!isGallery && <div className="shrink-0">{providerCycler}</div>}
      </div>
    </div>
  )

  const effortPanel = effortSlider ? (
    <div className="w-[224px]">
      {/* The slider keeps its top strip clear for the label shoulder that rises
          while dragging, so the header sits in that strip instead of adding a
          row above it. It steps aside for the shoulder's own label mid-drag. */}
      <div className="relative">
        <div
          className={cn(
            'absolute inset-x-0 top-0 z-10 flex h-5 items-center gap-2 px-2.5 text-ui-sm transition-opacity duration-100',
            effortPreview == null ? 'opacity-100' : 'opacity-0'
          )}
        >
          <span className="text-muted-foreground">Effort</span>
          <span className="ml-auto font-medium text-foreground">{EFFORTS[effortPreview ?? effortIndex]?.label ?? currentEffortLabel}</span>
        </div>
        <EffortSlider
          stops={EFFORTS.map((item) => item.label)}
          value={effortIndex}
          onChange={setEffortAt}
          onEscape={() => setPanel('root')}
          onPreview={setEffortPreview}
        />
      </div>
      <div className="mt-1 flex justify-between px-2.5 pb-1 text-ui-sm leading-4 text-foreground-subtlest">
        <span>Faster</span>
        <span>Smarter</span>
      </div>
    </div>
  ) : (
    <div className="w-[224px] px-1 py-1">
      <JellyRadio
        ariaLabel="Reasoning effort"
        size="sm"
        gap={6}
        radius={14}
        items={EFFORTS.map(({ label, value }) => ({ value: value || 'default', label }))}
        value={currentEffort || 'default'}
        onChange={(next) => {
          // Deliberately stays open — the user dismisses the menu themselves.
          onSetEffort?.(next === 'default' ? '' : (next as ReasoningEffort))
        }}
      />
    </div>
  )

  const rowClass =
    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ui-caption outline-none transition-colors'

  return (
    <div className="relative min-w-0 shrink" ref={rootRef}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setOpen((v) => !v)
          setPanel('root')
        }}
        disabled={disabled}
        className={cn(
          // Fixed row height, one baseline for every glyph. The model name is
          // the only thing allowed to shrink; the icon, separator, effort and
          // chevron stay put, so the pill's height never changes.
          'chip group h-8 min-w-0 max-w-[190px] items-center gap-1.5 py-0 pl-2 pr-1.5 leading-none',
          open && 'chip-active'
        )}
        title={disabled ? 'Model and effort can be changed between turns' : `${shortModel ?? 'Select model'} · ${currentEffortLabel} effort`}
        aria-label={`Model and reasoning effort. Current: ${shortModel ?? 'none'}, ${currentEffortLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ModelIcon model={shortModel || 'GPT 5.5'} className="size-3.5 shrink-0 opacity-80 transition-opacity group-hover:opacity-100" />
        <span className="min-w-0 truncate text-ui-sm font-medium leading-none text-foreground select-none">
          {shortModel || 'Select Model'}
        </span>
        <span className="shrink-0 text-ui-xs leading-none text-foreground-subtlest" aria-hidden>
          ·
        </span>
        <span className="shrink-0 text-ui-xs font-medium leading-none text-muted-foreground select-none">{currentEffortLabel}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={12}
          strokeWidth={2}
          aria-hidden
          className={cn('shrink-0 opacity-60 transition-transform duration-[var(--duration-quick)]', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <div
            className={cn(
              'absolute bottom-full z-50 mb-2.5 flex items-end gap-1',
              align === 'right' ? 'right-0' : 'left-0'
            )}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* The open picker is its own card, with its own fixed height, so
                switching Model <-> Effort never resizes the rows beside it. */}
            {align === 'right' && panel !== 'root' && (
              <motion.div
                key="picker"
                style={{ transformOrigin: 'bottom right' }}
                className={cn(
                  'overflow-hidden rounded-lg border border-border bg-menu p-2 shadow-md',
                  panel === 'model' && 'h-[272px]'
                )}
                variants={bloomUp}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={BLOOM_FAST}
              >
                {panel === 'model' ? modelPanel : effortPanel}
              </motion.div>
            )}

            <motion.div
              key="rows"
              style={{ transformOrigin: align === 'right' ? 'bottom right' : 'bottom left' }}
              className="w-[214px] shrink-0 rounded-lg border border-border bg-menu p-1 shadow-md"
              variants={bloomUp}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={BLOOM_FAST}
              role="menu"
              aria-label="Model and reasoning effort"
            >
              <button
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setPanel('model')}
                onClick={() => setPanel('model')}
                className={cn(rowClass, panel === 'model' ? 'bg-hover text-foreground' : 'text-foreground hover:bg-hover')}
                aria-expanded={panel === 'model'}
              >
                <span className="shrink-0">Model</span>
                <span className="ml-auto min-w-0 truncate text-ui-sm text-muted-foreground">{shortModel ?? 'None'}</span>
                <ChevronRight size={12} className={cn('shrink-0 text-foreground-subtlest transition-transform duration-[var(--duration-quick)]', panel === 'model' && 'rotate-180')} />
              </button>

              <button
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  if (!effortUnsupported) setPanel('effort')
                }}
                onClick={() => {
                  if (!effortUnsupported) setPanel('effort')
                }}
                disabled={effortUnsupported}
                className={cn(
                  rowClass,
                  effortUnsupported
                    ? 'cursor-default opacity-45'
                    : panel === 'effort'
                      ? 'bg-hover text-foreground'
                      : 'text-foreground hover:bg-hover'
                )}
                title={effortUnsupported ? 'This model does not support reasoning' : undefined}
                aria-expanded={panel === 'effort'}
              >
                <span className="shrink-0">Effort</span>
                <span className="ml-auto min-w-0 truncate text-ui-sm text-muted-foreground">{currentEffortLabel}</span>
                <ChevronRight size={12} className={cn('shrink-0 text-foreground-subtlest transition-transform duration-[var(--duration-quick)]', panel === 'effort' && 'rotate-180')} />
              </button>

              <div className="mx-1 my-1 h-px bg-border" aria-hidden />

              <button
                type="button"
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={resetToDefault}
                disabled={atDefault}
                className={cn(
                  rowClass,
                  atDefault ? 'cursor-default text-foreground-subtlest opacity-50' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
                )}
              >
                <span className="flex-1">Reset to default</span>
                <Rotate01 size={12} className="shrink-0 text-foreground-subtlest" />
              </button>
            </motion.div>

            {align === 'left' && panel !== 'root' && (
              <motion.div
                key="picker"
                style={{ transformOrigin: 'bottom left' }}
                className={cn(
                  'overflow-hidden rounded-lg border border-border bg-menu p-2 shadow-md',
                  panel === 'model' && 'h-[272px]'
                )}
                variants={bloomUp}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={BLOOM_FAST}
              >
                {panel === 'model' ? modelPanel : effortPanel}
              </motion.div>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
