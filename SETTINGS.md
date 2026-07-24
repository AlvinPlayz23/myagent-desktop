# Myagent Desktop settings

## Purpose

Settings should make Myagent Desktop feel like an agent control center: users
should be able to decide how the app behaves, how the agent works, which model
it uses, and what it is allowed to do. It should not become an unstructured
collection of visual toggles.

The proposed navigation is:

```text
General
Appearance
Agent
Models
Tools & permissions
Connections
Keyboard shortcuts
Advanced
About
```

Session management is deliberately not a top-level settings section. It
belongs in the main workspace and session UI.

## General

Controls the application while it is in use.

- Keep the computer awake while an agent is running.
- Notify when a task completes or fails.
- Open to the last project or to Home on launch.
- Choose a default project folder.
- Choose task detail: concise, standard, or verbose.
- Choose a timestamp format: system, 12-hour, or 24-hour.
- Toggle word wrapping for messages and tool output.

## Appearance

Controls visual density and the desktop chrome.

- Theme: system, dark, or light.
- Reduce motion.
- Sidebar display name.
- Interface scale: 90%, 100%, or 110%.
- Sidebar density: comfortable or compact.
- Sidebar project grouping: repository, path, or separate.
- Number of recent chats shown per project.
- Conversation width: focused or wide.
- Code font size.
- Optional activity indicator or avatar style.

The existing theme, reduced-motion, sidebar-name, and message-size preferences
belong here. Message reading size may remain in Chat presentation controls if
the product later separates Appearance from conversation readability.

## Agent

Controls how the coding agent communicates and manages a task.

- Default response detail: concise, standard, or thorough.
- Global custom instructions for new tasks.
- Preview the project instructions that will apply to the current workspace.
- Context compaction: automatic, ask first, or manual only.
- Reasoning display: expanded, collapsed, or hidden.
- Tool activity display: detailed, summary, or quiet.
- Follow-up behavior while busy: steer immediately, queue, or ask each time.
- Default task mode: build, explain, or review.

The desktop already displays reasoning and tool activity, supports queued
follow-ups and steering, and exposes manual compaction. Persisted preferences
and a small amount of renderer wiring can cover several items; compaction and
task modes require agent-service support.

## Models

Provides a deliberate home for model selection rather than treating it as only
a composer dropdown.

- Select the default provider and model.
- Favorite frequently used models.
- Hide unused models and set model ordering.
- Add a custom model identifier.
- Set per-provider model defaults.
- Show capability badges: tools, vision, reasoning, and local.
- Refresh discovered models.
- Optionally configure a fallback model after repeated provider failures.

The current desktop reads configured providers and models, and supports a
per-session model selection in the composer. It needs secure server or IPC
operations before it can safely create or edit provider configuration.

## Tools & permissions

This is a first-class safety surface, not an advanced afterthought. The agent
can execute tools with the local user's privileges.

- Approval mode: ask for every action, approve safe reads, approve within the
  workspace, or full access.
- Network access: ask, allow, or block.
- Allowed workspace folders.
- Command allowlist and blocklist.
- Require confirmation for destructive commands.
- Show full commands before execution.
- Limit visible tool-output size.
- Enable or disable individual tools such as shell, file writes, and search.

Most of this requires protocol and backend changes. A UI-only toggle must
never imply enforcement that the agent service does not provide.

## Connections

Manages external systems used by the desktop and agent.

- Provider API connections and model discovery.
- Status for local backends such as Ollama, LM Studio, and vLLM.
- Test a provider connection.
- Show endpoint, configuration path, and retry status without exposing secret
  values by default.
- Future integrations: source control, MCP servers, browser connection, and
  collaboration services.

Keep provider/model configuration distinct from general external connections.

## Keyboard shortcuts

Start with a discoverable, read-only shortcuts reference. Custom remapping can
follow once shortcut conflicts and persistence are designed.

- Open settings.
- Start a new task.
- Focus the composer.
- Stop the agent.
- Toggle the sidebar.
- Open the model picker.
- Queue a follow-up.
- Compact context.
- Toggle the debug panel.
- Search conversations or projects.

## Advanced

Holds technical controls that should not clutter everyday usage.

- Retry policy: enabled state, maximum attempts, initial delay, and maximum
  delay.
- Open the LLM debug panel by default.
- Stream assistant output.
- Log level and diagnostic export.
- Reconnect to or restart the local server.
- Show the active binary, config, and session-storage paths.
- Reset desktop-only preferences.

The Go agent already has configurable retry settings. The desktop already has
reconnect handling and an LLM debug panel, making these practical candidates.

## About

Provides operational information and support actions.

- Desktop version.
- Myagent server version.
- Provider and server connection state.
- Copy diagnostics.
- Open documentation and licenses.
- Check for updates when an update mechanism exists.

## Suggested delivery order

1. General and Appearance: desktop-only preferences with immediate value.
2. Agent: reasoning, tool-activity, follow-up, and compaction presentation.
3. Models: favorites, hidden models, ordering, and default selection.
4. Tools & permissions: backend enforcement and clear approval UX.
5. Connections and Advanced: provider management, diagnostics, and retries.
6. Keyboard shortcuts and About refinements.

## Implementation boundary

Persist purely visual and interaction preferences in the desktop preference
store. Route settings that affect agent behavior, provider credentials,
permissions, tool execution, or retries through a server-authoritative API.
Secrets must remain in the main process or agent configuration and must never
be exposed to the renderer.
