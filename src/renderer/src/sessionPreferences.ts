export interface SessionPreference {
  archived?: boolean
}

export type SessionPreferences = Record<string, SessionPreference>

const KEY = 'myagent.desktop.session-preferences'

export function loadSessionPreferences(): SessionPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return value && typeof value === 'object' ? value as SessionPreferences : {}
  } catch {
    return {}
  }
}

export function saveSessionPreferences(preferences: SessionPreferences): void {
  localStorage.setItem(KEY, JSON.stringify(preferences))
}

