import { useEffect, useMemo, useState } from 'react'
import type { ProviderEntry, ProviderInput, ProvidersInfo } from '../../../shared/protocol'

const blank: ProviderInput = { name: '', baseUrl: '', model: '', apiKey: '', builtin: false }

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

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
        <aside className="w-52 shrink-0 border-r border-border p-3">
          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Providers</div>
          <div className="space-y-1">
            {providers.providers.map((provider) => <button key={provider.name} type="button" onClick={() => edit(provider)} className={`w-full rounded-lg px-2.5 py-2 text-left text-[12px] ${selected === provider.name ? 'bg-selected text-foreground' : 'text-muted-foreground hover:bg-hover'}`}>{provider.name}</button>)}
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <button type="button" className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] text-muted-foreground hover:bg-hover hover:text-foreground" onClick={() => add(false)}>+ Custom endpoint</button>
            {providers.available && providers.available.length > 0 && <button type="button" className="w-full rounded-lg px-2.5 py-2 text-left text-[12px] text-muted-foreground hover:bg-hover hover:text-foreground" onClick={() => add(true)}>+ Catalog provider</button>}
          </div>
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mb-6"><h2 className="m-0 text-[16px] font-semibold text-foreground">{selected ? `Configure ${selected}` : form.builtin ? 'Add catalog provider' : 'Add custom provider'}</h2><p className="mb-0 mt-1 text-[12px] text-muted-foreground">Keys are write-only and are never displayed after saving.</p></div>
          {form.builtin && !selected && <label className="mb-4 block text-[12px] font-medium text-foreground">Provider<select value={form.name} onChange={(event) => { const option = providers.available?.find((item) => item.name === event.target.value); update({ name: option?.name ?? '', baseUrl: option?.baseUrl ?? '' }) }} className="mt-1.5 block h-9 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground"><option value="">Select provider…</option>{providers.available?.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}</select></label>}
          {!form.builtin && <label className="mb-4 block text-[12px] font-medium text-foreground">Name<input value={form.name} disabled={Boolean(selected)} onChange={(event) => update({ name: event.target.value })} className="mt-1.5 block h-9 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground disabled:opacity-60" placeholder="my-provider" /></label>}
          <label className="mb-4 block text-[12px] font-medium text-foreground">Base URL<input value={form.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} className="mt-1.5 block h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[12px] text-foreground" placeholder="https://api.example.com/v1" /></label>
          <label className="mb-4 block text-[12px] font-medium text-foreground">API key <span className="font-normal text-muted-foreground">(leave blank to keep the saved key)</span><input type="password" value={form.apiKey} onChange={(event) => update({ apiKey: event.target.value })} className="mt-1.5 block h-9 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground" autoComplete="off" /></label>
          <label className="block text-[12px] font-medium text-foreground">Default model<input list="provider-models" value={form.model} onChange={(event) => update({ model: event.target.value })} className="mt-1.5 block h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[12px] text-foreground" placeholder="model-id" /><datalist id="provider-models">{[...new Set([...discovered, ...(current?.models ?? [])])].map((model) => <option key={model} value={model} />)}</datalist></label>
          <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" className="rounded-full border border-border px-3 py-1.5 text-[11.5px] text-muted-foreground hover:bg-hover hover:text-foreground disabled:opacity-50" onClick={discover} disabled={busy || !form.name || !form.baseUrl}>Discover models</button><button type="button" className="rounded-full bg-foreground px-3 py-1.5 text-[11.5px] font-medium text-background disabled:opacity-50" onClick={save} disabled={busy}>Save provider</button>{current && <button type="button" className="rounded-full px-3 py-1.5 text-[11.5px] text-muted-foreground hover:bg-hover hover:text-foreground disabled:opacity-50" onClick={async () => { setBusy(true); try { await onDefault(current.name, form.model || current.models[0] || '') } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) } }} disabled={busy || !form.model}>Make default</button>}{current && <button type="button" className="rounded-full px-3 py-1.5 text-[11.5px] text-destructive-foreground hover:bg-destructive/10 disabled:opacity-50" onClick={async () => { if (!window.confirm(`Remove ${current.name}?`)) return; setBusy(true); try { await onDelete(current.name); add(false) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) } }} disabled={busy}>Remove</button>}</div>
          {error && <p className="mt-4 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2 text-[11.5px] text-destructive-foreground">{error}</p>}
        </div>
    </div>
  )
}
