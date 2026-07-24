# Myagent Desktop

Desktop control plane for the [myagent](../) coding agent. An Electron app that
wraps the Go agent's WebSocket JSON-RPC server in a graphical chat interface
with session management, model selection, and provider configuration.

---

## TL;DR

```bash
cd desktop
pnpm install
pnpm dev
```

The app starts a local `myagent serve` instance, connects over WebSocket, and
presents a multi-project chat UI.

---

## Prerequisites

- **Node.js** and **pnpm**
- **Go toolchain** (for the `myagent` binary the desktop app spawns)
- A configured provider with an API key (first-run setup walks through this)

The desktop app needs the `myagent` binary on `PATH`. The easiest way is to
build it from the repository root first:

```bash
cd ..
go build -o ./myagent.exe .
```

Or install it into your `GOPATH`:

```bash
go install .
```

---

## Setup

```bash
cd desktop
pnpm install
```

No other install steps are required. The app spawns `myagent serve` on launch,
connects over WebSocket, and exposes a graphical interface for chatting with the
agent.

---

## Scripts

| Command           | Purpose                                    |
| ----------------- | ------------------------------------------ |
| `pnpm dev`        | Start the Electron dev server              |
| `pnpm build`      | Build the production app                   |
| `pnpm preview`    | Preview the production build locally       |
| `pnpm typecheck`  | Run TypeScript type checking               |

### Dev tools

| Script               | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `scripts/smoke.mjs`  | Minimal WebSocket smoke test             |
| `scripts/screenshot.ps1` | Capture a screenshot of the running app |
| `scripts/focus-shot.ps1` | Capture a focused window screenshot   |
| `scripts/probe-css.mjs` | Inspect computed CSS values at runtime |

---

## Project layout

```
desktop/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # Window, IPC, server lifecycle, reconnection
│   │   ├── server.ts      # Spawns `myagent serve`
│   │   └── rpc.ts         # WebSocket JSON-RPC client
│   ├── preload/           # Context bridge for renderer
│   │   └── index.ts
│   ├── renderer/          # React UI
│   │   ├── src/
│   │   │   ├── api.ts             # Typed RPC wrapper exposed via preload
│   │   │   ├── App.tsx            # Root layout and session/state wiring
│   │   │   ├── state.ts           # Reducer managing all session/UI state
│   │   │   ├── preferences.ts     # Desktop-only preferences (theme, density)
│   │   │   ├── sessionPreferences.ts # Per-session preferences (titles, archive)
│   │   │   ├── commands.ts        # Slash-command registry
│   │   │   ├── styles.css         # Design tokens and base styles
│   │   │   ├── util.ts            # Shared helpers
│   │   │   ├── main.tsx           # Entry point, theme bootstrap
│   │   │   └── components/
│   │   │       ├── App.tsx
│   │   │       ├── Chat.tsx           # Message list
│   │   │       ├── ChatHeader.tsx     # Model indicator, compact button
│   │   │       ├── Composer.tsx       # Message input + model picker
│   │   │       ├── CommandModal.tsx   # Command help sheet
│   │   │       ├── Home.tsx           # Empty-state / new-session screen
│   │   │       ├── Markdown.tsx       # Markdown renderer
│   │   │       ├── MessageView.tsx    # Single message rendering
│   │   │       ├── ProviderManager.tsx # Full provider configuration UI
│   │   │       ├── Settings.tsx       # Settings shell and section pages
│   │   │       ├── Sidebar.tsx        # Session and project list
│   │   │       ├── StatusBar.tsx      # Connection status footer
│   │   │       ├── ToolCard.tsx       # Tool execution display
│   │   │       ├── TurnSummary.tsx    # Summary line after a turn
│   │   │       ├── WindowControls.tsx # Caption controls
│   │   │       └── ui/
│   │   │           ├── Button.tsx
│   │   │           └── icons.tsx      # Icon barrel exports
│   │   │   └── debug-panel/           # LLM request/retry timeline
│   │   └── index.html
│   └── shared/
│       └── protocol.ts   # Wire types mirroring the Go server's protocol
├── out/                   # Built output (committed for convenience)
├── ref/                   # Reference material
├── scripts/               # Dev/test helpers
├── electron.vite.config.ts
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── SETTINGS.md            # Settings roadmap and design notes
```

---

## Architecture

The desktop app is a thin transport and UI layer. All agent logic, tool
execution, session persistence, and retry handling live in the Go server.

```
┌─────────────────┐         WebSocket JSON-RPC          ┌──────────────┐
│  Electron main  │ ───────────────────────────────────► │ myagent serve │
│  (server.ts)    │ ◄─────────────────────────────────── │ (Go binary)   │
└────────┬────────┘    server.hello, session.event,      └──────────────┘
         │             session.done, etc.
         │ IPC
┌────────▼────────┐
│  React renderer  │
│  (chat, sidebar, │
│   settings, etc) │
└──────────────────┘
```

- **Main process** spawns and supervises the Go server, owns the WebSocket
  connection, and bridges events into the renderer via `ipcMain.handle`.
- **Preload** exposes a safe `window.myagent` API with `connect`, `rpc`,
  `pickFolder`, `setTheme`, and window control methods.
- **Renderer** manages all chat UI, session state, model selection, and
  settings. It never has direct access to the filesystem or shell.

---

## Features

- **Multi-project workspace**: Pick folders, organize sessions by project.
- **Streaming chat**: Live token-by-token assistant output with tool activity.
- **Model picker**: Switch models mid-conversation from a searchable provider
  and model list.
- **Provider management**: Add, edit, delete, and set defaults for OpenAI-
  compatible providers with API key storage and model discovery.
- **Session sidebar**: Rename, archive, restore, and resume previous sessions.
- **Steering and follow-ups**: Send mid-turn corrections or queue follow-ups.
- **Context compaction**: Summarize older conversation context to stay within
  model limits.
- **Debug panel**: Inspect the full LLM request and retry timeline.
- **Theme support**: Light, dark, and system theme with reduced-motion option.
- **Reconnection**: Automatic reconnection with session recovery when the
  server disconnects.

---

## Settings

The Settings view (bottom of the sidebar) provides:

| Section        | Purpose                                               |
| -------------- | ----------------------------------------------------- |
| **Appearance** | Theme, reduced motion, sidebar branding               |
| **Chat**       | Message size, auto-scroll, send-on-enter              |
| **Providers**  | Full provider configuration: add, edit, delete, set default, discover models |
| **Archive**    | Restore archived sessions                             |
| **About**      | Server version, connection state, reconnect            |

---

## Server protocol

The desktop app speaks JSON-RPC 2.0 over WebSocket to the Go agent. See
`src/shared/protocol.ts` for the full wire type definitions. Key methods:

| Method             | Direction        | Description                        |
| ------------------ | ---------------- | ---------------------------------- |
| `session.create`   | client → server  | Start a new session                |
| `session.resume`   | client → server  | Resume an existing session         |
| `session.prompt`   | client → server  | Send a user message                |
| `session.steer`    | client → server  | Send a mid-turn correction         |
| `session.followUp` | client → server  | Queue a follow-up message          |
| `session.abort`    | client → server  | Stop the current run               |
| `session.compact`  | client → server  | Trigger manual compaction          |
| `session.setModel` | client → server  | Change the active model            |
| `session.close`    | client → server  | Close a session (file is kept)     |
| `session.list`     | client → server  | List persisted sessions            |
| `provider.list`    | client → server  | Get configured providers           |
| `provider.save`    | client → server  | Add or update a provider           |
| `provider.delete`  | client → server  | Remove a provider                  |
| `provider.setDefault` | client → server | Set default provider and model   |
| `provider.discover`| client → server  | Discover models from a provider    |
| `session.event`    | server → client  | Streaming agent event              |
| `session.done`     | server → client  | Run completed                      |
| `server.hello`     | server → client  | Connection handshake               |

---

## Development

### Build / typecheck

```bash
pnpm install
pnpm typecheck          # TypeScript strict checks
pnpm build              # Production build to out/
pnpm dev                # Electron dev server with hot reload
```

### Adding a new settings section

1. Add a new entry to the `nav` array in `Settings.tsx`.
2. Add a new `section` branch in the content area of `Settings.tsx`.
3. If it needs server data, add the RPC methods to `protocol.ts` and `api.ts`,
   then wire them through `App.tsx` and into `Settings` props.

### Adding a new RPC method

1. Add the Go handler in `internal/server/ws/handlers.go`.
2. Add the TypeScript wire type in `src/shared/protocol.ts`.
3. Add the typed wrapper in `src/renderer/src/api.ts`.
4. Call it from the appropriate React component.

---

## Troubleshooting

**The app shows "server unreachable"**

The Go binary is not on `PATH`. Build it from the repository root with
`go build -o ./myagent.exe .` and ensure it is accessible.

**The app launches but the chat area is empty**

Run `myagent` once in a terminal to complete first-run setup and create
`~/.myagent/config.json`.

**TypeScript errors after pulling new changes**

Run `pnpm install` to update dependencies, then `pnpm typecheck`.

---

## License

See the repository root for license details.
