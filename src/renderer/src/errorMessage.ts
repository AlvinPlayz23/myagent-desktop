export interface ParsedProviderError {
  status?: number
  title: string
  detail?: string
  hint?: string
  raw: string
}

function hintForStatus(status?: number): string | undefined {
  if (status === 401) return 'Check the provider API key in Settings.'
  if (status === 403) return 'Authorization failed for this model. Check the provider API key and permissions.'
  if (status === 429) return 'Rate limited — wait a moment and try again.'
  if (status === 400) return 'The request was rejected. Try rephrasing or a different model.'
  if (status === 404) return 'The model or endpoint was not found. Check the model name.'
  if (status !== undefined && status >= 500) return 'The provider is unavailable — try again shortly.'
  return undefined
}

function pickString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return undefined
}

/** Parse raw backend error text like `403: {"status":403,"title":"Forbidden","detail":"..."}` into display parts. */
export function parseProviderError(raw: string): ParsedProviderError {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { title: 'Something went wrong.', raw }

  let status: number | undefined
  let rest = trimmed

  const prefix = trimmed.match(/^(\d{3})\s*:\s*([\s\S]*)$/)
  if (prefix) {
    status = Number(prefix[1])
    rest = prefix[2].trim()
  }

  // Try JSON body: {"status":403,"title":"Forbidden","detail":"..."}
  if (rest.startsWith('{') && rest.endsWith('}')) {
    try {
      const obj = JSON.parse(rest) as Record<string, unknown>
      const jsonStatus = typeof obj.status === 'number' ? obj.status : typeof obj.code === 'number' ? obj.code : undefined
      const title = pickString(obj.title, obj.error, obj.message) ?? (jsonStatus ? `Request failed (${jsonStatus})` : 'Request failed.')
      const detail = pickString(obj.detail, obj.message !== title ? obj.message : undefined)
      const finalStatus = status ?? jsonStatus
      return { status: finalStatus, title, detail, hint: hintForStatus(finalStatus), raw: trimmed }
    } catch {
      // fall through to plain-text handling
    }
  }

  if (status !== undefined) {
    const title = rest.length > 0 && rest.length <= 120 && !rest.startsWith('{') ? rest : `Request failed (${status})`
    const detail = title === rest ? undefined : rest
    return { status, title, detail, hint: hintForStatus(status), raw: trimmed }
  }

  // Plain text: first sentence as title, remainder as detail.
  const sentence = trimmed.match(/^([^.!?\n]{3,120}[.!?])\s+([\s\S]*)$/)
  if (sentence) return { title: sentence[1].trim(), detail: sentence[2].trim().slice(0, 500), raw: trimmed }
  if (trimmed.length <= 120) return { title: trimmed, raw: trimmed }
  return { title: 'Something went wrong.', detail: trimmed.slice(0, 500), raw: trimmed }
}
