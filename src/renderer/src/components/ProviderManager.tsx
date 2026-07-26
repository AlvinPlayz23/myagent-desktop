import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import type { ProviderEntry, ProviderInput, ProvidersInfo } from '../../../shared/protocol'
import { cn } from '../util'

const blank: ProviderInput = { name: '', baseUrl: '', model: '', apiKey: '', builtin: false }

const fieldClass =
  'mt-1.5 block h-9 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-input'

const railAddClass =
  'relative flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors'

// One pill glides between the provider rows and the add buttons below them.
function RailPill(): JSX.Element {
  return (
    <motion.span
      layoutId="provider-rail-pill"
      className="absolute inset-0 rounded-lg bg-selected"
      transition={{ type: 'spring', stiffness: 620, damping: 48 }}
    />
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
  const [selected, setSelected] = useState<string | null>(providers.providers[0]?.name ?? null)
  const [form, setForm] = useState<ProviderInput>(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discovered, setDiscovered] = useState<string[]>([])
  const current = useMemo(() => providers.providers.find((item) => item.name === selected), [providers, selected])

  useEffect(() => {
    if (!current) return
    setDiscovered(current.models)
    setForm({ name: current.name, baseUrl: current.baseUrl ?? '', model: current.models[0] ?? '', apiKey: '', builtin: current.source === 'auth' })
  }, [current])

  const edit = (provider: ProviderEntry): void => {
    setSelected(provider.name)
    setDiscovered(provider.models)
    setError(null)
    setForm({ name: provider.name, baseUrl: provider.baseUrl ?? '', model: provider.models[0] ?? '', apiKey: '', builtin: provider.source === 'auth' })
  }
  const add = (builtin = false): void => {
    setSelected(null); setDiscovered([]); setError(null); setForm({ ...blank, builtin })
  }
  const update = (patch: Partial<ProviderInput>): void => setForm((current) => ({ ...current, ...patch }))
  const save = async (): Promise<void> => {
    setBusy(true); setError(null)
    try { await onSave(form); setSelected(form.name); setDiscovered([]) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  const discover = async (): Promise<void> => {
    if (!form.name) return
    setBusy(true); setError(null)
    try {
      const models = await onDiscover(form.name, form.apiKey)
      setDiscovered(models)
      if (!form.model && models[0]) update({ model: models[0] })
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }

  const addingCustom = selected === null && !form.builtin
  const addingCatalog = selected === null && form.builtin
  const hasCatalog = Boolean(providers.available && providers.available.length > 0)
  const isDefault = (provider: ProviderEntry): boolean => providers.defaultModel.startsWith(`${provider.name}/`)

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <aside className="w-52 shrink-0 overflow-y-auto border-r border-border px-3 py-16">
        <div className="px-2 pb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Providers</div>
        <div className="space-y-1">
          {providers.providers.length === 0 && (
            <p className="m-0 px-2.5 py-2 text-[11.5px] leading-snug text-muted-foreground">No providers yet.</p>
          )}
          {providers.providers.map((provider) => {
            const active = selected === provider.name
            return (
              <button
                key={provider.name}
                type="button"
                onClick={() => edit(provider)}
                className={cn(
                  'relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground'
                )}
              >
                {active && <RailPill />}
                <span className="relative min-w-0 flex-1 truncate">{provider.name}</span>
                {isDefault(provider) && (
                  <span className="relative size-1.5 shrink-0 rounded-full bg-foreground/70" title="Default provider" />
                )}
              </button>
            )
          })}
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => add(false)}
            className={cn(railAddClass, addingCustom ? 'text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground')}
          >
            {addingCustom && <RailPill />}
            <span className="relative">+ Custom endpoint</span>
          </button>
          {hasCatalog && (
            <button
              type="button"
              onClick={() => add(true)}
              className={cn(railAddClass, addingCatalog ? 'text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground')}
            >
              {addingCatalog && <RailPill />}
              <span className="relative">+ Catalog provider</span>
            </button>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto px-7 py-14 sm:px-12">
        <div className="max-w-md">
          <h1 className="m-0 text-[24px] font-semibold tracking-tight text-foreground">Providers</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">Manage the model services and credentials used by Myagent.</p>

          <div className="mt-9 flex items-baseline gap-2.5">
            <h2 className="settings-heading mb-0">
              {selected ? `Configure ${selected}` : form.builtin ? 'Add catalog provider' : 'Add custom endpoint'}
            </h2>
            {current && isDefault(current) && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">default</span>
            )}
          </div>
          <p className="mb-0 mt-2 text-[11.5px] text-muted-foreground">Keys are write-only and are never displayed after saving.</p>

          <div className="mt-5">
            {form.builtin && !selected && (
              <label className="mb-4 block text-[12px] font-medium text-foreground">
                Provider
                <select
                  value={form.name}
                  onChange={(event) => {
                    const option = providers.available?.find((item) => item.name === event.target.value)
                    update({ name: option?.name ?? '', baseUrl: option?.baseUrl ?? '' })
                  }}
                  className={fieldClass}
                >
                  <option value="">Select provider…</option>
                  {providers.available?.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}
                </select>
              </label>
            )}
            {!form.builtin && (
              <label className="mb-4 block text-[12px] font-medium text-foreground">
                Name
                <input
                  value={form.name}
                  disabled={Boolean(selected)}
                  onChange={(event) => update({ name: event.target.value })}
                  className={cn(fieldClass, 'disabled:opacity-60')}
                  placeholder="my-provider"
                />
              </label>
            )}
            <label className="mb-4 block text-[12px] font-medium text-foreground">
              Base URL
              <input
                value={form.baseUrl}
                onChange={(event) => update({ baseUrl: event.target.value })}
                className={cn(fieldClass, 'font-mono')}
                placeholder="https://api.example.com/v1"
              />
            </label>
            <label className="mb-4 block text-[12px] font-medium text-foreground">
              API key <span className="font-normal text-muted-foreground">(leave blank to keep the saved key)</span>
              <input
                type="password"
                value={form.apiKey}
                onChange={(event) => update({ apiKey: event.target.value })}
                className={fieldClass}
                autoComplete="off"
              />
            </label>
            <label className="block text-[12px] font-medium text-foreground">
              Default model
              <input
                list="provider-models"
                value={form.model}
                onChange={(event) => update({ model: event.target.value })}
                className={cn(fieldClass, 'font-mono')}
                placeholder="model-id"
              />
              <datalist id="provider-models">
                {[...new Set([...discovered, ...(current?.models ?? [])])].map((model) => <option key={model} value={model} />)}
              </datalist>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-full bg-foreground px-3.5 py-1.5 text-[11.5px] font-medium text-background transition-opacity disabled:opacity-50"
              onClick={save}
              disabled={busy}
            >
              Save provider
            </button>
            <button
              type="button"
              className="rounded-full border border-border px-3.5 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-50"
              onClick={discover}
              disabled={busy || !form.name || !form.baseUrl}
            >
              Discover models
            </button>
            {current && (
              <button
                type="button"
                className="rounded-full border border-border px-3.5 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-50"
                onClick={async () => {
                  setBusy(true)
                  try { await onDefault(current.name, form.model || current.models[0] || '') } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
                }}
                disabled={busy || !form.model}
              >
                Make default
              </button>
            )}
            <span className="flex-1" />
            {current && (
              <button
                type="button"
                className="rounded-full px-3.5 py-1.5 text-[11.5px] text-destructive-foreground transition-colors hover:bg-destructive/10 disabled:opacity-50"
                onClick={async () => {
                  if (!window.confirm(`Remove ${current.name}?`)) return
                  setBusy(true)
                  try { await onDelete(current.name); add(false) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
                }}
                disabled={busy}
              >
                Remove
              </button>
            )}
          </div>
          {error && <p className="mt-4 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-[11.5px] text-destructive-foreground">{error}</p>}
        </div>
      </div>
    </div>
  )
}
