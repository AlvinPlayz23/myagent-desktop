import { useState } from 'react'
import { motion } from 'motion/react'
import { Archive01, ArchiveRestore, Check, ComputerTerminal, Globe02, Keyboard01, Message01, Settings01 } from './ui/icons'
import type { ConnState } from '../state'
import { normalizeAppName, type Preferences, type ThemePreference, type MessageSize, type ToolActivityDisplay } from '../preferences'
import type { ProviderInput, ProvidersInfo, SessionMeta } from '../../../shared/protocol'
import { cn } from '../util'
import { shortcuts, shortcutCategories, formatCombo } from '../shortcuts'
import ProviderManager from './ProviderManager'

interface Props {
  preferences: Preferences
  onChange(patch: Partial<Preferences>): void
  conn: ConnState
  detail?: string
  serverVersion?: string
  onReconnect(): void
  archivedSessions: SessionMeta[]
  onOpenArchived(id: string): void
  onRestore(id: string): void
  providers: ProvidersInfo
  onSaveProvider(input: ProviderInput): Promise<void>
  onDeleteProvider(name: string): Promise<void>
  onDefaultProvider(name: string, model: string): Promise<void>
  onDiscoverProvider(name: string, apiKey: string): Promise<string[]>
}

const themes: Array<{ value: ThemePreference; title: string; detail: string }> = [
  { value: 'system', title: 'System', detail: 'Follow your operating system' },
  { value: 'dark', title: 'Dark', detail: 'Use the dark desktop theme' },
  { value: 'light', title: 'Light', detail: 'Use the light desktop theme' }
]

const sizes: Array<{ value: MessageSize; title: string; detail: string }> = [
  { value: 'compact', title: 'Compact', detail: 'More conversation in view' },
  { value: 'default', title: 'Default', detail: 'Balanced reading size' },
  { value: 'large', title: 'Large', detail: 'More comfortable reading' }
]

const toolDisplays: Array<{ value: ToolActivityDisplay; title: string; detail: string }> = [
  { value: 'expanded', title: 'Expanded', detail: 'Every tool call as its own card' },
  { value: 'compact', title: 'Compact', detail: 'Tools inline while running; fold behind “Worked for …” when done' },
  { value: 'hidden', title: 'Hidden', detail: 'Quiet chat; only failures show' }
]

function Choice<T extends string>({ value, current, title, detail, onSelect }: {
  value: T
  current: T
  title: string
  detail: string
  onSelect(value: T): void
}): JSX.Element {
  const selected = value === current
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'flex min-h-16 flex-1 items-start gap-3 rounded-xl border p-3 text-left transition-colors',
        selected ? 'border-input bg-selected' : 'border-border bg-subtle hover:bg-hover'
      )}
    >
      <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', selected ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground')}>
        {selected && <Check size={10} strokeWidth={2.4} />}
      </span>
      <span>
        <span className="block text-[12.5px] font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}

function Toggle({ checked, title, detail, onChange }: { checked: boolean; title: string; detail: string; onChange(value: boolean): void }): JSX.Element {
  return (
    <button type="button" className="flex w-full items-center justify-between gap-5 py-3 text-left" onClick={() => onChange(!checked)}>
      <span>
        <span className="block text-[13px] font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{detail}</span>
      </span>
      <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-foreground' : 'bg-input')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
    </button>
  )
}

export default function Settings({ preferences, onChange, conn, detail, serverVersion, onReconnect, archivedSessions, onOpenArchived, onRestore, providers, onSaveProvider, onDeleteProvider, onDefaultProvider, onDiscoverProvider }: Props): JSX.Element {
  const [section, setSection] = useState<'appearance' | 'chat' | 'providers' | 'archive' | 'shortcuts' | 'about'>('appearance')
  const nav = [
    { id: 'appearance' as const, label: 'Appearance', icon: Settings01 },
    { id: 'chat' as const, label: 'Chat', icon: Message01 },
    { id: 'providers' as const, label: 'Providers', icon: Globe02 },
    { id: 'archive' as const, label: 'Archive', icon: Archive01 },
    { id: 'shortcuts' as const, label: 'Shortcuts', icon: Keyboard01 },
    { id: 'about' as const, label: 'About', icon: ComputerTerminal }
  ]

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-44 shrink-0 border-r border-border px-3 py-16">
        <div className="px-2 pb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Settings</div>
        <div className="space-y-1">
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setSection(id)} className={cn('relative flex h-9 w-full items-center rounded-lg px-2.5 text-left text-[12.5px] transition-colors', section === id ? 'text-foreground' : 'text-muted-foreground hover:bg-hover hover:text-foreground')}>
              {section === id && (
                <motion.span
                  layoutId="settings-nav-pill"
                  className="absolute inset-0 rounded-lg bg-selected"
                  transition={{ type: 'spring', stiffness: 620, damping: 48 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon size={15} strokeWidth={1.8} />
                {label}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <div className={cn('min-w-0 flex-1', section === 'providers' ? 'flex min-h-0 overflow-hidden' : 'overflow-y-auto px-7 py-14 sm:px-12')}>
        {section === 'providers' ? (
          <motion.div
            key="providers"
            className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <ProviderManager providers={providers} onSave={onSaveProvider} onDelete={onDeleteProvider} onDefault={onDefaultProvider} onDiscover={onDiscoverProvider} />
          </motion.div>
        ) : <motion.div
          key={section}
          className="mx-auto max-w-2xl"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
          {section === 'appearance' && <>
            <h1 className="m-0 text-[24px] font-semibold tracking-tight text-foreground">Appearance</h1>
            <p className="mt-2 text-[13px] text-muted-foreground">Tune how Myagent Desktop looks and moves.</p>
            <section className="mt-9"><h2 className="settings-heading">Theme</h2><div className="grid gap-2 sm:grid-cols-3">{themes.map((item) => <Choice key={item.value} {...item} current={preferences.theme} onSelect={(theme) => onChange({ theme })} />)}</div></section>
            <section className="settings-card mt-8 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-[13px] font-medium text-foreground">Window transparency</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">Let more of the desktop material show through the sidebar.</span>
                </span>
                <output className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{preferences.transparency}%</output>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground">Solid</span>
                <input
                  aria-label="Window transparency"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={preferences.transparency}
                  onChange={(event) => onChange({ transparency: Number(event.target.value) })}
                  className="transparency-slider min-w-0 flex-1"
                />
                <span className="text-[10px] text-muted-foreground">Clear</span>
              </div>
            </section>
            <section className="settings-card mt-8"><Toggle checked={preferences.reducedMotion} title="Reduce motion" detail="Minimize interface animation and transitions." onChange={(reducedMotion) => onChange({ reducedMotion })} /></section>
            <section className="mt-8">
              <h2 className="settings-heading mb-3">Title</h2>
              <label className="settings-card flex min-h-16 items-center justify-between gap-5 py-3.5">
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-foreground">App title</span>
                  <span className="mt-1 block text-[11.5px] leading-snug text-muted-foreground">Shown in the title bar at the top of the window.</span>
                </span>
                <input
                  type="text"
                  value={preferences.appName}
                  maxLength={32}
                  placeholder="myagent"
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => onChange({ appName: e.target.value })}
                  onBlur={(e) => onChange({ appName: normalizeAppName(e.target.value) })}
                  className="h-9 w-[11.5rem] shrink-0 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-input sm:w-52"
                />
              </label>
            </section>
          </>}
          {section === 'chat' && <>
            <h1 className="m-0 text-[24px] font-semibold tracking-tight text-foreground">Chat</h1>
            <p className="mt-2 text-[13px] text-muted-foreground">Control reading density and composer behavior.</p>
            <section className="mt-9"><h2 className="settings-heading">Message size</h2><div className="grid gap-2 sm:grid-cols-3">{sizes.map((item) => <Choice key={item.value} {...item} current={preferences.messageSize} onSelect={(messageSize) => onChange({ messageSize })} />)}</div></section>
            <section className="mt-8"><h2 className="settings-heading">Tool activity</h2><div className="grid gap-2 sm:grid-cols-3">{toolDisplays.map((item) => <Choice key={item.value} {...item} current={preferences.toolActivityDisplay} onSelect={(toolActivityDisplay) => onChange({ toolActivityDisplay })} />)}</div></section>
            <section className="settings-card mt-8 divide-y divide-border"><Toggle checked={preferences.autoScroll} title="Keep chat pinned to latest" detail="Follow streaming responses while you are at the bottom of a conversation." onChange={(autoScroll) => onChange({ autoScroll })} /><Toggle checked={preferences.sendOnEnter} title="Enter sends messages" detail="Use Shift+Enter for a new line when enabled." onChange={(sendOnEnter) => onChange({ sendOnEnter })} /></section>
          </>}
          {section === 'archive' && <>
            <h1 className="m-0 text-[24px] font-semibold tracking-tight text-foreground">Archive</h1>
            <p className="mt-2 text-[13px] text-muted-foreground">Archived chats stay on this device and can be restored whenever you need them.</p>
            {archivedSessions.length === 0 ? (
              <div className="settings-card mt-9 py-8 text-center text-[12.5px] text-muted-foreground">No archived sessions.</div>
            ) : (
              <div className="settings-card mt-9 divide-y divide-border">
                {archivedSessions.map((session) => (
                  <div key={session.id} className="flex items-center gap-4 py-3">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenArchived(session.id)}>
                      <span className="block truncate text-[13px] font-medium text-foreground">{session.title || session.preview || `${session.messageCount} messages`}</span>
                      <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">{session.cwd}</span>
                    </button>
                    <button type="button" onClick={() => onRestore(session.id)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-selected hover:text-foreground">
                      <ArchiveRestore size={13} strokeWidth={1.8} /> Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>}
          {section === 'shortcuts' && <>
            <h1 className="m-0 text-[24px] font-semibold tracking-tight text-foreground">Keyboard shortcuts</h1>
            <p className="mt-2 text-[13px] text-muted-foreground">Move around Myagent Desktop without reaching for the mouse.</p>
            {shortcutCategories.map((category) => (
              <section key={category} className="mt-8">
                <h2 className="settings-heading">{category}</h2>
                <div className="settings-card divide-y divide-border">
                  {shortcuts.filter((s) => s.category === category).map((s) => (
                    <div key={s.id} className="settings-row">
                      <span>{s.description}</span>
                      <kbd className="shortcut-key">{formatCombo(s.combo)}</kbd>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>}
          {section === 'about' && <>
            <h1 className="m-0 text-[24px] font-semibold tracking-tight text-foreground">About</h1>
            <p className="mt-2 text-[13px] text-muted-foreground">Desktop connection and runtime details.</p>
            <section className="settings-card mt-9 divide-y divide-border"><div className="settings-row"><span>Connection</span><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', conn === 'connected' ? 'bg-selected text-foreground' : 'bg-hover text-muted-foreground')}>{conn}</span></div><div className="settings-row"><span>Myagent server</span><code>{serverVersion ? `serve ${serverVersion}` : 'detecting...'}</code></div><div className="settings-row"><span>Desktop</span><code>0.1.0</code></div></section>
            {detail && <p className="mt-3 text-[11.5px] text-muted-foreground">{detail}</p>}
            <button type="button" onClick={onReconnect} className="mt-6 rounded-full border border-border px-4 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-selected">Reconnect server</button>
          </>}
        </motion.div>}
      </div>
    </div>
  )
}
