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
  /** Display name shown at the top of the sidebar. */
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
  appName: DEFAULT_APP_NAME
}

/** Normalize a sidebar brand name; empty/whitespace falls back to default. */
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
