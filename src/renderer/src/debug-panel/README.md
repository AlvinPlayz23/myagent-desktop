# LLM debug panel

A DevTools-Network-tab-style drawer that visualizes how requests go through
the LLM provider connection for the active chat session: one row per agent
turn, showing model/provider, timing, retries, token usage, and errors.

## How it works

This module is entirely client-side and reuses the `AgentEvent` stream
already flowing over the WebSocket JSON-RPC protocol (see
`../../../shared/protocol.ts` and `myagent serve`'s `session.event`
notifications) — no backend or protocol changes were made for this feature.

`useLlmTrace.ts` subscribes to `api.onPush` **independently** of the app's
main reducer (`../state.ts`); it does not read from or write to `ChatState`.
It reduces the event sequence into one `LlmTurn` per LLM call by relying on
how `internal/agent/loop.go` (`runLoop` / `streamAssistant`) emits events:

- Every LLM call is preceded by exactly one `turn_start` — 1:1 with a single
  `streamAssistant` invocation (which may span multiple HTTP attempts via
  the Go `retryProvider`).
- Any `retry` events for that call land between its `turn_start` and the
  eventual `message_start` — retries happen pre-stream, before any SSE data
  arrives.
- `message_start` (role `assistant`) marks first-byte time. It's guaranteed
  to fire exactly once per turn, either from a real stream start or
  synthesized from the final message if the stream never started.
- `message_end` (role `assistant`) is the terminal event: model, provider,
  token usage/cost, stop reason, and error message all come from here.

Because a session only ever runs one turn at a time, the hook can safely key
off `current[current.length - 1]` when applying `retry` / `message_start` /
`message_end` updates — no turn IDs need to be threaded through the wire
protocol.

## Known limitation: timing is approximate

All timestamps in the panel are **event-arrival times in the renderer**, not
server-side timestamps from the Go provider. They include WebSocket/IPC
transport latency (typically sub-millisecond to a few ms locally, but not
guaranteed). The waterfall also can't distinguish "attempt duration" from
"backoff delay" within a single retry gap, because the Go retry wrapper
(`internal/llm/retry.go`) only emits one event per retry (announcing the
upcoming attempt) — there's no separate "backoff finished" event. The panel
labels these combined spans honestly (e.g. "attempt 2/10 failed, retrying")
rather than fabricating a precise split.

If exact server-side timing, HTTP status codes, or raw request/response
payload inspection is wanted later, that requires backend instrumentation in
`internal/llm` (`openai.go`, `retry.go`) plus new fields on
`types.AgentEvent` / `AssistantMessageEvent` and the WS protocol — deliberately
out of scope here so this feature could ship as a small, self-contained,
easily-removable addition.

## Removal

This feature touches exactly two files outside this folder, both marked
with `debug-panel:` comments (`grep -r "debug-panel:" desktop/src` finds
them):

1. `../components/ChatHeader.tsx` — the toggle button and `onToggleDebug`
   prop.
2. `../App.tsx` — the `debugOpen` state, the prop wired into `ChatHeader`,
   and the `<DebugPanel>` render call.

To remove the feature entirely: delete this `debug-panel/` folder, then
remove those marked lines from the two files above. No other code
(`state.ts`, `api.ts`, `protocol.ts`, or any Go code) is affected.
