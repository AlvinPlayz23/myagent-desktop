import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert02Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import type { ProviderEntry, ProviderInput, ProvidersInfo } from '../../../shared/protocol'
import { Add01, AiBrain01, ArrowLeft01, ChevronRight, Delete02, View, ViewOff } from './ui/icons'
import { Button } from './ui/button'
import ProviderLogo from './ProviderLogo'
import { SettingsHeader, SETTINGS_PAGE_CLASS } from './SettingsKit'
import { cn } from '../util'
import { EASE_OUT } from '../motion'

const blank: ProviderInput = { name: '', baseUrl: '', model: '', apiKey: '', builtin: false }

const isBuiltinEntry = (entry: ProviderEntry): boolean =>
  entry.origin != null ? entry.origin === 'builtin' : entry.source === 'auth'

const fieldClass =
  'block h-9 w-full rounded-lg border border-input bg-background px-3 text-ui-base text-foreground outline-none transition-colors duration-[var(--duration-instant)] placeholder:text-foreground-subtlest hover:border-input-border-hover focus-visible:border-input-border-hover focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

const panel = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.1 } }
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' }): JSX.Element {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-ui-xs font-medium',
        tone === 'brand' ? 'bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-brand' : 'bg-muted text-foreground-subtle'
      )}
    >
      {children}
    </span>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: React.ReactNode
  children: (id: string, describedBy: string | undefined) => React.ReactNode
}): JSX.Element {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ui-caption font-medium text-foreground">
        {label}
      </label>
      {children(id, hintId)}
      {hint && (
        <p id={hintId} className="text-pretty text-ui-sm text-foreground-subtle">
          {hint}
        </p>
      )}
    </div>
  )
}

function keyStatus(provider: ProviderEntry): JSX.Element {
  const saved = provider.hasApiKey
  return (
    <span className={cn('flex items-center gap-1 text-ui-sm', saved ? 'text-foreground-subtle' : 'text-warning-foreground')}>
      <HugeiconsIcon icon={saved ? CheckmarkCircle02Icon : Alert02Icon} size={13} strokeWidth={1.75} aria-hidden />
      {saved ? 'Key saved' : 'No key'}
    </span>
  )
}

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
  const [busy, setBusy] = useState<null | 'save' | 'discover' | 'default' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)
  const [discovered, setDiscovered] = useState<string[]>([])
  const [configOpen, setConfigOpen] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const confirmRef = useRef<HTMLDivElement>(null)

  const current = useMemo(() => providers.providers.find((item) => item.name === selected), [providers, selected])
  const defaultModelOf = (provider: ProviderEntry): string =>
    providers.defaultModel.startsWith(`${provider.name}/`)
      ? providers.defaultModel.slice(provider.name.length + 1)
      : provider.models[0] ?? ''
  const currentModel = current ? defaultModelOf(current) : ''

  useEffect(() => {
    if (!current) return
    setDiscovered(current.models)
    setForm({ name: current.name, baseUrl: current.baseUrl ?? '', model: currentModel, apiKey: '', builtin: isBuiltinEntry(current) })
  }, [current, currentModel])

  // Land on the safe choice so Enter or Space cannot remove by accident.
  useEffect(() => {
    if (confirmRemove) confirmRef.current?.querySelector('button')?.focus()
  }, [confirmRemove])

  const reset = (): void => {
    setError(null)
    setConfirmRemove(false)
    setShowKey(false)
  }

  const openConfig = (provider: ProviderEntry): void => {
    reset()
    setSelected(provider.name)
    setDiscovered(provider.models)
    setForm({ name: provider.name, baseUrl: provider.baseUrl ?? '', model: defaultModelOf(provider), apiKey: '', builtin: isBuiltinEntry(provider) })
    setConfigOpen(true)
  }

  const add = (builtin: boolean): void => {
    reset()
    setSelected(null)
    setDiscovered([])
    setForm({ ...blank, builtin })
    setConfigOpen(true)
  }

  const back = (): void => {
    reset()
    setConfigOpen(false)
  }

  const update = (patch: Partial<ProviderInput>): void => setForm((value) => ({ ...value, ...patch }))
  const fail = (err: unknown): void => setError(err instanceof Error ? err.message : String(err))

  const save = async (): Promise<void> => {
    setBusy('save')
    setError(null)
    try {
      await onSave(form)
      setSelected(form.name)
      setDiscovered([])
      setConfigOpen(false)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const discover = async (): Promise<void> => {
    if (!form.name) return
    setBusy('discover')
    setError(null)
    try {
      const models = await onDiscover(form.name, form.apiKey)
      setDiscovered(models)
      if (!form.model && models[0]) update({ model: models[0] })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const makeDefault = async (): Promise<void> => {
    if (!current) return
    setBusy('default')
    setError(null)
    try {
      await onDefault(current.name, form.model || current.models[0] || '')
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const remove = async (): Promise<void> => {
    if (!current) return
    setBusy('delete')
    try {
      await onDelete(current.name)
      back()
    } catch (err) {
      fail(err)
      setConfirmRemove(false)
    } finally {
      setBusy(null)
    }
  }

  const hasCatalog = Boolean(providers.available && providers.available.length > 0)
  const isDefault = (provider: ProviderEntry): boolean => providers.defaultModel.startsWith(`${provider.name}/`)
  const modelDetail = (current?.modelDetails ?? []).find((m) => m.id === form.model)
  const reasoningNote =
    modelDetail == null || !modelDetail.reasoningKnown
      ? 'Reasoning support is unknown for this model.'
      : modelDetail.reasoning
        ? `Supports reasoning${modelDetail.supportedEfforts?.length ? `: ${modelDetail.supportedEfforts.join(', ')}` : ''}.`
        : 'Does not support reasoning.'
  const modelChoices = [...new Set([...discovered, ...(current?.models ?? [])])]
  const title = selected ?? (form.name || (form.builtin ? 'Add catalog provider' : 'Add custom endpoint'))
  const anyBusy = busy !== null

  return (
    <div className={SETTINGS_PAGE_CLASS}>
      <AnimatePresence mode="popLayout" initial={false}>
        {!configOpen ? (
          <motion.div key="list" {...panel} className="flex flex-col gap-8">
            <SettingsHeader
              title="Providers"
              description="Connect model providers and custom endpoints. Keys stay on this device."
              action={
                <>
                  {hasCatalog && (
                    <Button variant="outline" size="sm" onClick={() => add(true)}>
                      From catalog
                    </Button>
                  )}
                  <Button size="sm" onClick={() => add(false)}>
                    <Add01 size={14} strokeWidth={1.75} aria-hidden />
                    Custom endpoint
                  </Button>
                </>
              }
            />

            {providers.providers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
                <AiBrain01 size={22} strokeWidth={1.5} className="text-foreground-subtle" aria-hidden />
                <div>
                  <p className="m-0 text-ui-base font-medium text-foreground">No providers yet</p>
                  <p className="mt-1 text-ui-sm text-foreground-subtle">Add a provider to start sessions with its models.</p>
                </div>
                <Button size="sm" onClick={() => add(hasCatalog)}>
                  {hasCatalog ? 'Add from catalog' : 'Add custom endpoint'}
                </Button>
              </div>
            ) : (
              <section className="flex flex-col gap-2">
                <h2 className="px-0.5 text-ui-caption font-medium text-foreground-subtle">
                  {providers.providers.length} {providers.providers.length === 1 ? 'provider' : 'providers'}
                </h2>
                <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-xl border border-border p-0">
                  {providers.providers.map((provider) => (
                    <li key={provider.name}>
                      <button
                        type="button"
                        onClick={() => openConfig(provider)}
                        className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <ProviderLogo providerId={provider.name} size={32} className="shrink-0 rounded-lg bg-background p-1 ring-1 ring-border" />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-ui-base font-medium text-foreground">{provider.name}</span>
                            {isDefault(provider) && <Chip tone="brand">Default</Chip>}
                            {provider.origin && (
                              <Chip>{provider.origin === 'builtin_override' ? 'Override' : provider.origin === 'builtin' ? 'Built in' : 'Custom'}</Chip>
                            )}
                          </span>
                          <span className="truncate font-mono text-ui-sm text-foreground-subtle">{provider.baseUrl || 'Default endpoint'}</span>
                        </span>
                        <span className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
                          <span className="text-ui-sm tabular-nums text-foreground">
                            {provider.models.length} {provider.models.length === 1 ? 'model' : 'models'}
                          </span>
                          {keyStatus(provider)}
                        </span>
                        <ChevronRight size={14} strokeWidth={1.75} className="shrink-0 text-foreground-subtlest transition-transform duration-[var(--duration-quick)] group-hover:translate-x-0.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </motion.div>
        ) : (
          <motion.form
            key="config"
            {...panel}
            className="flex flex-col gap-8"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <SettingsHeader
              leading={
                <Button type="button" variant="ghost" size="sm" onClick={back} className="-ml-2.5 self-start text-foreground-subtle hover:text-foreground">
                  <ArrowLeft01 size={14} strokeWidth={1.75} aria-hidden />
                  Providers
                </Button>
              }
              title={
                <span className="flex items-center gap-2.5">
                  {selected && <ProviderLogo providerId={selected} size={24} className="shrink-0 rounded-md bg-background p-0.5 ring-1 ring-border" />}
                  <span className="truncate">{title}</span>
                  {current && isDefault(current) && <Chip tone="brand">Default</Chip>}
                </span>
              }
              description={
                selected
                  ? 'Update the endpoint, key and default model.'
                  : form.builtin
                    ? 'Pick a supported provider and add its key.'
                    : 'Point at any OpenAI-compatible endpoint.'
              }
              action={
                current &&
                !isDefault(current) && (
                  <Button type="button" variant="outline" size="sm" loading={busy === 'default'} disabled={anyBusy || !form.model} onClick={makeDefault}>
                    Make default
                  </Button>
                )
              }
            />

            <section className="flex flex-col gap-2">
              <h2 className="px-0.5 text-ui-caption font-medium text-foreground-subtle">Connection</h2>
              <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
                {form.builtin && !selected && (
                  <Field label="Provider">
                    {(id) => (
                      <select
                        id={id}
                        value={form.name}
                        onChange={(event) => {
                          const option = providers.available?.find((item) => item.name === event.target.value)
                          update({ name: option?.name ?? '', baseUrl: option?.baseUrl ?? '' })
                        }}
                        className={fieldClass}
                      >
                        <option value="">Choose a provider…</option>
                        {providers.available?.map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                )}

                {!form.builtin && (
                  <Field label="Name" hint={selected ? 'The name is fixed once a provider is saved.' : 'Used in the model picker, for example openrouter or local-ollama.'}>
                    {(id, hint) => (
                      <input
                        id={id}
                        aria-describedby={hint}
                        value={form.name}
                        disabled={Boolean(selected)}
                        onChange={(event) => update({ name: event.target.value })}
                        className={fieldClass}
                        placeholder="openrouter"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    )}
                  </Field>
                )}

                <Field label="Base URL">
                  {(id) => (
                    <input
                      id={id}
                      type="url"
                      inputMode="url"
                      value={form.baseUrl}
                      onChange={(event) => update({ baseUrl: event.target.value })}
                      className={cn(fieldClass, 'font-mono text-ui-sm')}
                      placeholder="https://api.example.com/v1"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}
                </Field>

                <Field label="API key" hint={selected ? 'Leave blank to keep the saved key.' : undefined}>
                  {(id, hint) => (
                    <div className="relative">
                      <input
                        id={id}
                        aria-describedby={hint}
                        type={showKey ? 'text' : 'password'}
                        value={form.apiKey}
                        onChange={(event) => update({ apiKey: event.target.value })}
                        className={cn(fieldClass, 'pr-10 font-mono text-ui-sm')}
                        placeholder={current?.hasApiKey ? '••••••••••••' : 'sk-…'}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        aria-label={showKey ? 'Hide API key' : 'Show API key'}
                        aria-pressed={showKey}
                        onClick={() => setShowKey((value) => !value)}
                        className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-foreground-subtle outline-none transition-colors duration-[var(--duration-instant)] hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showKey ? <ViewOff size={15} strokeWidth={1.5} aria-hidden /> : <View size={15} strokeWidth={1.5} aria-hidden />}
                      </button>
                    </div>
                  )}
                </Field>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="px-0.5 text-ui-caption font-medium text-foreground-subtle">Default model</h2>
              <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
                <Field label="Model ID" hint={form.model && modelDetail ? reasoningNote : undefined}>
                  {(id, hint) => (
                    <div className="flex gap-2">
                      <input
                        id={id}
                        aria-describedby={hint}
                        list="provider-models"
                        value={form.model}
                        onChange={(event) => update({ model: event.target.value })}
                        className={cn(fieldClass, 'min-w-0 flex-1 font-mono text-ui-sm')}
                        placeholder="gpt-4o"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <Button type="button" variant="outline" loading={busy === 'discover'} disabled={anyBusy || !form.name || !form.baseUrl} onClick={discover}>
                        Find models
                      </Button>
                      <datalist id="provider-models">
                        {modelChoices.map((model) => (
                          <option key={model} value={model} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </Field>

                {modelChoices.length > 0 && (
                  <div role="group" aria-label="Available models" className="flex flex-wrap gap-1.5">
                    {modelChoices.slice(0, 12).map((model) => (
                      <button
                        key={model}
                        type="button"
                        aria-pressed={form.model === model}
                        onClick={() => update({ model })}
                        className={cn(
                          'h-7 max-w-full cursor-pointer truncate rounded-md px-2.5 font-mono text-ui-sm outline-none transition-colors duration-[var(--duration-instant)] focus-visible:ring-2 focus-visible:ring-ring',
                          form.model === model ? 'bg-selected font-medium text-foreground' : 'bg-muted text-foreground-subtle hover:bg-hover hover:text-foreground'
                        )}
                      >
                        {model}
                      </button>
                    ))}
                    {modelChoices.length > 12 && (
                      <span className="grid h-7 place-items-center px-1 text-ui-sm text-foreground-subtle">+{modelChoices.length - 12} more in the list above</span>
                    )}
                  </div>
                )}
              </div>
            </section>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-border bg-[color-mix(in_srgb,var(--destructive)_8%,transparent)] px-3.5 py-3 text-ui-sm text-destructive-foreground">
                <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 break-words">{error}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button type="submit" loading={busy === 'save'} disabled={anyBusy || !form.name || !form.baseUrl}>
                Save provider
              </Button>
              <Button type="button" variant="ghost" onClick={back} disabled={busy === 'save'}>
                Cancel
              </Button>
            </div>

            {current && (
              <section className="border-t border-border pt-6">
                <div className="flex items-center gap-4 rounded-xl border border-border p-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="m-0 text-ui-base font-medium text-foreground">Remove provider</h3>
                    <p className="mt-0.5 text-pretty text-ui-sm text-foreground-subtle">
                      {confirmRemove ? `Remove ${current.name} and its saved key? This can’t be undone.` : 'Deletes this endpoint and its saved key from this device.'}
                    </p>
                  </div>
                  {confirmRemove ? (
                    <div ref={confirmRef} className="flex shrink-0 items-center gap-2" role="group" aria-label={`Confirm removing ${current.name}`}>
                      <Button type="button" variant="outline" size="sm" disabled={busy === 'delete'} onClick={() => setConfirmRemove(false)}>
                        Keep
                      </Button>
                      <Button type="button" variant="destructive" size="sm" loading={busy === 'delete'} onClick={remove}>
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="destructive-outline" size="sm" disabled={anyBusy} onClick={() => setConfirmRemove(true)}>
                      <Delete02 size={14} strokeWidth={1.5} aria-hidden />
                      Remove
                    </Button>
                  )}
                </div>
              </section>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}
