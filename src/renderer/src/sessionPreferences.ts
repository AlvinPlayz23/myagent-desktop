export interface SessionPreference {
  title?: string
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

export function sessionTitle(id: string, fallback: string, preferences: SessionPreferences): string {
  return preferences[id]?.title?.trim() || fallback
}
