import { ComputerTerminal, File01, FileEdit, FileAdd, Wrench01, type IconComponent } from './components/ui/icons'

// Presentation metadata for tool names, shared by the tool timeline (ToolCard)
// and the /tools selector (ToolsModal) so a tool's icon and past-tense label
// are defined once.
//
// The tool SET is not listed here — it is server-owned. `session.tools` reports
// the registry, which can include plugin-provided tools this file has never
// heard of. Every lookup below therefore falls back rather than assuming a
// fixed set, and `session.tools`'s own description is the source of truth for
// what a tool does.

/** Icon for a tool name. Unknown names (plugins) get the generic wrench. */
export const TOOL_ICONS: Record<string, IconComponent> = {
  bash: ComputerTerminal,
  read: File01,
  edit: FileEdit,
  write: FileAdd
}

export function toolIcon(name: string): IconComponent {
  return TOOL_ICONS[name] ?? Wrench01
}

/** Settled past-tense label: "Ran command", "Read file". */
export const TOOL_LABELS: Record<string, string> = {
  bash: 'Ran command',
  read: 'Read file',
  edit: 'Edited file',
  write: 'Wrote file'
}

/** Present-continuous label while a run is streaming: "Running command". */
export const TOOL_RUNNING_LABELS: Record<string, string> = {
  bash: 'Running command',
  read: 'Reading file',
  edit: 'Editing file',
  write: 'Writing file'
}
