export type ThemePreference = 'system' | 'dark' | 'light'
export type MessageSize = 'compact' | 'default' | 'large'
export type ToolActivityDisplay = 'expanded' | 'compact' | 'hidden'

export interface Preferences {
  theme: ThemePreference
  messageSize: MessageSize
  reducedMotion: boolean
  autoScroll: boolean
  sendOnEnter: boolean
  toolActivityDisplay: ToolActivityDisplay
  /** Whether the desktop material should be visible through the app shell. */
  transparencyEnabled: boolean
  /** 0 is more opaque; 100 lets more of the desktop material show through. */
  transparency: number
  /** Display name shown in the window's titlebar strip. */
  appName: string
}

const KEY = 'myagent.desktop.preferences'
const DEFAULT_APP_NAME = 'myagent'
const APP_NAME_MAX = 32

export const defaults: Preferences = {
  theme: 'system',
  messageSize: 'default',
  reducedMotion: false,
  autoScroll: true,
  sendOnEnter: true,
  toolActivityDisplay: 'compact',
  transparencyEnabled: true,
  transparency: 50,
  appName: DEFAULT_APP_NAME
}

/** Keep the visual preference safe when localStorage contains old or invalid data. */
export function normalizeTransparency(value: number | undefined | null): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value as number))) : defaults.transparency
}

/** Normalize the app title; empty/whitespace falls back to default. */
export function normalizeAppName(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim().slice(0, APP_NAME_MAX)
  return trimmed || DEFAULT_APP_NAME
}

export function loadPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Preferences>
    return {
      ...defaults,
      ...stored,
      toolActivityDisplay: stored.toolActivityDisplay === 'expanded' || stored.toolActivityDisplay === 'hidden' ? stored.toolActivityDisplay : 'compact',
      transparencyEnabled: stored.transparencyEnabled !== false,
      transparency: normalizeTransparency(stored.transparency),
      appName: normalizeAppName(stored.appName ?? defaults.appName)
    }
  } catch {
    return defaults
  }
}

export function savePreferences(preferences: Preferences): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({ ...preferences, appName: normalizeAppName(preferences.appName) })
  )
}

export function applyTheme(theme: ThemePreference): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  document.documentElement.classList.toggle('dark', dark)
  void window.myagent.setTheme(dark ? 'dark' : 'light')
}
