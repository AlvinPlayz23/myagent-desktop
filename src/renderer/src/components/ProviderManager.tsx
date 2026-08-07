import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import type { ProviderEntry, ProviderInput, ProvidersInfo } from '../../../shared/protocol'
import { Globe02, Check, Plus, Wrench01, Sparkles } from './ui/icons'
import ProviderLogo from './ProviderLogo'
import { cn } from '../util'

const blank: ProviderInput = { name: '', baseUrl: '', model: '', apiKey: '', builtin: false }

const isBuiltinEntry = (entry: ProviderEntry): boolean =>
  entry.origin != null ? entry.origin === 'builtin' : entry.source === 'auth'

const fieldClass =
  'mt-1.5 block h-9 w-full rounded-xl border border-border bg-background px-3 font-sans text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-input focus:ring-1 focus:ring-ring/30'

export default function ProviderManager({
  providers,
  onSave,
  onDelete,
  onDefault,
  onDiscover
}: {
  providers: ProvidersInfo
  onSave(input: ProviderInput): Promise<void>
  onDelete(name: string): Promise<void>
  onDefault(name: string, model: string): Promise<void>
  onDiscover(name: string, apiKey: string): Promise<string[]>
}): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  const [form, setForm] = useState<ProviderInput>(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discovered, setDiscovered] = useState<string[]>([])
  const [configOpen, setConfigOpen] = useState(false)

  const current = useMemo(() => providers.providers.find((item) => item.name === selected), [providers, selected])
  const currentModel = current
    ? providers.defaultModel.startsWith(`${current.name}/`)
      ? providers.defaultModel.slice(current.name.length + 1)
      : current.models[0] ?? ''
    : ''

  useEffect(() => {
    if (!current) return
    setDiscovered(current.models)
    setForm({ name: current.name, baseUrl: current.baseUrl ?? '', model: currentModel, apiKey: '', builtin: isBuiltinEntry(current) })
  }, [current, currentModel])

  const openConfig = (provider: ProviderEntry): void => {
    setSelected(provider.name)
    setDiscovered(provider.models)
    setError(null)
    const model = providers.defaultModel.startsWith(`${provider.name}/`)
      ? providers.defaultModel.slice(provider.name.length + 1)
      : provider.models[0] ?? ''
    setForm({ name: provider.name, baseUrl: provider.baseUrl ?? '', model, apiKey: '', builtin: isBuiltinEntry(provider) })
    setConfigOpen(true)
  }

  const add = (builtin = false): void => {
    setSelected(null); setDiscovered([]); setError(null); setForm({ ...blank, builtin })
    setConfigOpen(true)
  }

  const back = (): void => {
    setConfigOpen(false)
    setError(null)
  }

  const update = (patch: Partial<ProviderInput>): void => setForm((current) => ({ ...current, ...patch }))

  const save = async (): Promise<void> => {
    setBusy(true); setError(null)
    try {
      await onSave(form)
      setSelected(form.name)
      setDiscovered([])
      setConfigOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const discover = async (): Promise<void> => {
    if (!form.name) return
    setBusy(true); setError(null)
    try {
      const models = await onDiscover(form.name, form.apiKey)
      setDiscovered(models)
      if (!form.model && models[0]) update({ model: models[0] })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const addingCustom = selected === null && !form.builtin && configOpen
  const addingCatalog = selected === null && form.builtin && configOpen
  const hasCatalog = Boolean(providers.available && providers.available.length > 0)
  const isDefault = (provider: ProviderEntry): boolean => providers.defaultModel.startsWith(`${provider.name}/`)
  const modelDetail = (current?.modelDetails ?? []).find((m) => m.id === form.model)
  const reasoningNote =
    modelDetail == null
      ? 'Reasoning: unknown'
      : modelDetail.reasoningKnown
        ? modelDetail.reasoning
          ? `Reasoning: supported${modelDetail.supportedEfforts?.length ? ` · ${modelDetail.supportedEfforts.join(', ')}` : ''}`
          : 'Reasoning: not supported'
        : 'Reasoning: unknown'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6 sm:p-8 overflow-hidden">
      <div>
        <h1 className="m-0 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">AI Providers</h1>
        <p className="mt-1 text-xs text-muted-foreground/80">Configure model providers, custom endpoints, and API credentials.</p>
      </div>

      {/* Sliding panel container */}
      <div className="relative overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {!configOpen ? (
            /* ── Provider List ── */
            <motion.div
              key="list"
              initial={{ x: '-100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between px-1">
                <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                  <span className="inline-block h-px w-3 bg-border" aria-hidden />
                  Configured Providers ({providers.providers.length})
                </h2>

                <div className="flex items-center gap-2">
                  {hasCatalog && (
                    <button
                      type="button"
                      onClick={() => add(true)}
                      className="h-7.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-all outline-none cursor-pointer hover:bg-hover hover:text-foreground"
                    >
                      + Catalog Provider
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => add(false)}
                    className="h-7.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-all outline-none cursor-pointer hover:bg-hover hover:text-foreground"
                  >
                    + Custom Endpoint
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {providers.providers.map((provider) => {
                  const defaultProv = isDefault(provider)
                  return (
                    <div
                      key={provider.name}
                      className="group relative flex cursor-pointer flex-col justify-between rounded-2xl border border-border bg-card/70 p-4 transition-all duration-150 outline-none hover:border-foreground/20 hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <ProviderLogo
                            providerId={provider.name}
                            size={34}
                            className="rounded-lg bg-background ring-1 ring-border/70 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-foreground">{provider.name}</span>
                            <span className="block truncate font-mono text-[10.5px] text-muted-foreground/70">
                              {provider.baseUrl || 'Default Endpoint'}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {defaultProv && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              Default
                            </span>
                          )}
                          {provider.origin && (
                            <span className="rounded-full border border-border/80 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground/80">
                              {provider.origin === 'builtin_override' ? 'override' : provider.origin}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground/80">
                        <span>{provider.models.length} model{provider.models.length === 1 ? '' : 's'} available</span>
                        <button
                          type="button"
                          onClick={() => openConfig(provider)}
                          className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-hover cursor-pointer outline-none"
                        >
                          Configure →
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          ) : (
            /* ── Configuration Panel ── */
            <motion.div
              key="config"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="space-y-4"
            >
              {/* Header with back button */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={back}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground cursor-pointer outline-none"
                  >
                    ← Back
                  </button>
                  <span className="text-border">·</span>
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                    {selected ? `Configure: ${selected}` : form.builtin ? 'Add Catalog Provider' : 'Add Custom Endpoint'}
                  </h2>
                </div>
                {current && isDefault(current) && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Current Default
                  </span>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-xs space-y-4">
                {form.builtin && !selected && (
                  <label className="block text-xs font-semibold text-foreground">
                    Select Catalog Provider
                    <select
                      value={form.name}
                      onChange={(event) => {
                        const option = providers.available?.find((item) => item.name === event.target.value)
                        update({ name: option?.name ?? '', baseUrl: option?.baseUrl ?? '' })
                      }}
                      className={fieldClass}
                    >
                      <option value="">Choose a supported provider…</option>
                      {providers.available?.map((item) => (
                        <option key={item.name} value={item.name}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                )}

                {!form.builtin && (
                  <label className="block text-xs font-semibold text-foreground">
                    Provider Name
                    <input
                      value={form.name}
                      disabled={Boolean(selected)}
                      onChange={(event) => update({ name: event.target.value })}
                      className={cn(fieldClass, 'disabled:opacity-60')}
                      placeholder="e.g. openrouter, lmstudio, local-ollama"
                    />
                  </label>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-foreground">
                    Base URL
                    <input
                      value={form.baseUrl}
                      onChange={(event) => update({ baseUrl: event.target.value })}
                      className={cn(fieldClass, 'font-mono text-[11.5px]')}
                      placeholder="https://api.example.com/v1"
                    />
                  </label>

                  <label className="block text-xs font-semibold text-foreground">
                    API Key <span className="font-normal text-muted-foreground/70">(leave blank to keep saved key)</span>
                    <input
                      type="password"
                      value={form.apiKey}
                      onChange={(event) => update({ apiKey: event.target.value })}
                      className={fieldClass}
                      autoComplete="off"
                    />
                  </label>
                </div>

                <label className="block text-xs font-semibold text-foreground">
                  Default Model ID
                  <input
                    list="provider-models"
                    value={form.model}
                    onChange={(event) => update({ model: event.target.value })}
                    className={cn(fieldClass, 'font-mono text-[11.5px]')}
                    placeholder="e.g. gpt-4o, claude-3-5-sonnet, deepseek-r1"
                  />
                  <datalist id="provider-models">
                    {[...new Set([...discovered, ...(current?.models ?? [])])].map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </label>

                {form.model && modelDetail && (
                  <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 font-mono text-[11px] text-muted-foreground">
                    {reasoningNote}
                  </div>
                )}

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="h-8.5 rounded-xl bg-foreground px-4 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                    onClick={save}
                    disabled={busy}
                  >
                    Save Provider
                  </button>

                  <button
                    type="button"
                    className="h-8.5 rounded-xl border border-border bg-background px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-hover disabled:opacity-50"
                    onClick={discover}
                    disabled={busy || !form.name || !form.baseUrl}
                  >
                    Discover Models
                  </button>

                  {current && (
                    <button
                      type="button"
                      className="h-8.5 rounded-xl border border-border bg-background px-3.5 text-xs font-medium text-foreground transition-colors hover:bg-hover disabled:opacity-50"
                      onClick={async () => {
                        setBusy(true)
                        try {
                          await onDefault(current.name, form.model || current.models[0] || '')
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err))
                        } finally {
                          setBusy(false)
                        }
                      }}
                      disabled={busy || !form.model}
                    >
                      Make Default
                    </button>
                  )}

                  <span className="flex-1" />

                  {current && (
                    <button
                      type="button"
                      className="h-8.5 rounded-xl px-3.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/10 disabled:opacity-50"
                      onClick={async () => {
                        if (!window.confirm(`Remove ${current.name}?`)) return
                        setBusy(true)
                        try {
                          await onDelete(current.name)
                          back()
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err))
                        } finally {
                          setBusy(false)
                        }
                      }}
                      disabled={busy}
                    >
                      Remove Provider
                    </button>
                  )}
                </div>

                {error && (
                  <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-xs text-destructive-foreground">
                    {error}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
