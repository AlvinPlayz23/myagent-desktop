export type CommandName = 'help' | 'compact' | 'clear'

export interface DesktopCommand {
  name: CommandName
  slash: string
  usage: string
  description: string
  aliases?: string[]
}

export const commands: DesktopCommand[] = [
  { name: 'help', slash: '/help', usage: '/help', description: 'Show available commands and shortcuts' },
  { name: 'compact', slash: '/compact', usage: '/compact', description: 'Summarize older conversation context now' },
  { name: 'clear', slash: '/clear', usage: '/clear', description: 'Clear the visible transcript' }
]

export type ParsedCommand = { command: DesktopCommand; argument: string } | { error: string }

export function commandMatches(value: string): DesktopCommand[] {
  const trimmed = value.trimStart().toLowerCase()
  if (!trimmed.startsWith('/') || /\s/.test(trimmed)) return []
  return commands.filter((command) => [command.slash, ...(command.aliases ?? [])].some((slash) => slash.startsWith(trimmed)))
}

export function parseCommand(value: string): ParsedCommand | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return null
  const [slash, ...rest] = trimmed.split(/\s+/)
  const command = commands.find((item) => item.slash === slash || item.aliases?.includes(slash))
  if (!command) return { error: `Unknown command: ${slash}. Try /help.` }
  const argument = rest.join(' ').trim()
  if (argument) return { error: `Usage: ${command.usage}` }
  return { command, argument }
}
