# Sidebar Collapse Animation / Hover-Morph Issue — Technical Documentation

## Executive Summary

**Original problem — RESOLVED.** The sidebar's width collapse/expand did not spring-animate with
Framer Motion (`animate={{ width }}` and `useSpring` both *snapped*), even though opacity/filter
child animations worked. This was resolved by reverting to **native CSS width transitions** with a
spring-like cubic-bezier and asymmetric (collapse ≠ expand) timing.

**Current open problem — UNRESOLVED.** On **collapse** there are two remaining visual defects:

1. A **grey highlight rectangle "grows"/morphs** around the **Collapse toggle** and **New Chat**
   buttons while the sidebar width shrinks — visible **only when hovering** (i.e. when toggling by
   *clicking*; not via the `Ctrl+B` shortcut). Attempts to remove it (focus-outline removal,
   suppressing hover mid-transition via a `settling` state) have **not** resolved it.
2. On **`Ctrl+B` collapse**:
   - the **New Chat text** blurs/fades out *before* the width transition begins (this part now works,
     as intended);
   - but the always-mounted **New Chat icon** then **"clips in"** abruptly once the panel narrows —
     it pops/re-centers and is briefly clipped by `overflow-hidden` instead of animating with the
     width.

**Status**: Open — Issue 1 (hover morph) and Issue 2 (icon clip-in) both under investigation.

---

## Environment

- Motion (Framer Motion v12): `^12.42.2`
- React: `^18.3.1`
- Electron: `^33.2.0`
- Vite: `^5.4.11`
- Tailwind CSS v4: `^4.3.3`
- OS: Windows (Electron/Chromium renderer)

---

## History

### Original (Worked) — CSS width transition
```tsx
<aside className={cn(
  'flex shrink-0 flex-col overflow-hidden transition-[width] ease-[cubic-bezier(0.32,0.72,0,1)]',
  collapsed ? 'w-14 duration-[170ms]' : 'w-[260px] duration-[230ms]'
)}>
```
Width animated smoothly via the browser's native transition engine.

### Attempt 1 — `animate={{ width }}` (FAILED: snap)
```tsx
<motion.aside animate={{ width: collapsed ? 56 : 260 }}
  transition={{ type: 'spring', bounce: 0.18, duration: 0.6 }}
  className="flex shrink-0 flex-col overflow-hidden">
```
Width snapped. Blur/opacity child animations still worked.

### Attempt 2 — `useMotionValue` + `useSpring` (FAILED: snap)
```tsx
const widthMV = useMotionValue(collapsed ? 56 : 260)
const springWidth = useSpring(widthMV, { bounce: 0.2, duration: 0.6 })
useEffect(() => { widthMV.set(collapsed ? 56 : 260) }, [collapsed, widthMV])
// <motion.aside style={{ width: springWidth }} ...>
```
Width still snapped. Note: `spring.mjs`/`spring-value.mjs` in `motion-dom` (12.42.2) confirm
`{ bounce, duration }` and `{ stiffness, damping }` are both **valid** spring configs, so the
failure was not an API/config problem.

### Conclusion (why Motion width snaps here)
`width` is a **layout** property that forces the sibling `flex-1` main panel to reflow in lockstep.
In this Electron/Chromium renderer, JS-driven per-frame mutation of it gets its intermediate
layout/paint frames optimized away (snap), while compositor-only properties (`opacity`, `filter`)
animate fine. The CSS transition engine drives width reliably frame-by-frame.

---

## Current Implementation (`Sidebar.tsx`)

Width is now CSS-driven, asymmetric, with the collapse staggered after content clears:

```tsx
<aside className={cn(
  'flex shrink-0 flex-col overflow-hidden transition-[width]',
  collapsed
    ? 'w-14 duration-[170ms] delay-[80ms] ease-[cubic-bezier(0.32,0.72,0,1)]'      // dismiss
    : 'w-[260px] duration-[280ms] ease-[cubic-bezier(0.34,1.4,0.64,1)]'             // settle (spring overshoot)
)}>
```

The expanded label/panel exits are **opacity-only** (no `filter: blur`) and near-instant, so nothing
smears while the width moves; entries keep the blur, isolated behind a 0.08s delay. The scroll
parent is `overflow-y-auto overflow-x-hidden` so its scrollable extent isn't re-derived each frame.

*(The full source is authoritative; the snippets here summarize the relevant parts.)*

---

## Open Issue 1 — Collapsing hover-highlight rectangle "morph"

### Symptom
When toggling back/forth by **clicking** (cursor still hovering), a **grey highlight rectangle
appears and grows around the Collapse toggle and the New Chat button** while the sidebar width is
shrinking, which reads as broken. This does **not** happen when collapsing via the `Ctrl+B`
shortcut (nothing is hovered). The rect is the buttons' normal `hover:` background
(`hover:bg-selected` on the toggle, `hover:bg-hover` on New Chat).

### Why it only shows on click
`Ctrl+B` changes `collapsed` with no pointer over the controls, so no `:hover` → no highlight.
Clicking the toggle keeps the cursor over it (and focus lands on it), so the `:hover` background
stays visible for the whole width transition — and the affected buttons change geometry, so the
rect visibly grows/shrinks/slides with the panel.

### Evidence / reproduction
1. Move the pointer onto the Collapse toggle (grey `bg-selected` rect appears — normal).
2. Click it to collapse while still hovering → the rect "morphs" as the button goes
   `size-8 → w-full h-9` / recenters and the aside narrows.
3. Repeat via `Ctrl+B` → no rect at all.

### Attempted fixes (all still fail per reporter)
1. **Remove default focus ring** — added `outline-none focus-visible:ring-2 focus-visible:ring-ring`
   to the toggle and New Chat. Ruled out the Chromium default focus outline as the culprit.
2. **Near-instant label exit** — `CollapseLabel` exit is now `{ duration: 0.02, ease: 'easeIn' }`
   (opacity only) so text clears before the width moves.
3. **`settling` hover suppression** — a `useState`/`setTimeout` set to `true` whenever `collapsed`
   changes, disabling `hover:*` on the two buttons for ~300ms:
   ```tsx
   const [settling, setSettling] = useState(false)
   useEffect(() => {
     setSettling(true)
     const t = window.setTimeout(() => setSettling(false), 300)
     return () => window.clearTimeout(t)
   }, [collapsed])
   // toggle:  !settling && 'hover:bg-selected hover:text-foreground'
   // newchat: !settling && 'hover:bg-hover'
   ```

Despite all three, the morphing rectangle is **still reported**. This points away from focus and
toward something that is *not* stopped by temporarily dropping the `hover:` class.

### Root-cause hypotheses (to verify)
- **H1 — `transition-colors` on the button still animates a background change even as the class is
  removed/added while the *aside's* width transition runs**, so a highlight is perceivable
  independent of the `:hover` class being present.
- **H2 — The highlight is not the button background but the `:focus-visible` ring / active inner
  shadow on the just-clicked button** persisting through the layout shift (need DevTools
  `:focus-visible` inspection at mid-transition).
- **H3 — A compositor artifact**: the button changes size (`w-full ↔ fixed`) *and* the parent
  width animates simultaneously; the browser paints the hover layer at both extents, smearing a
  rect. Could be checked by making the collapsed buttons a *fixed* size so no re-shaping occurs
  during the transition (untested).

### Next steps for Issue 1
- In DevTools, force `:hover`/`:focus-visible` during a manual collapse and watch the *computed*
  background/box-shadow/outline on the toggle + New Chat frame by frame.
- Try H3: give both buttons a **constant size in both states** (e.g. always `size-8`/`size-9`) so
  the rect can't reshape; verify whether the morph disappears even when width still animates.
- Try removing `transition-colors` from the two buttons to rule out H1.

---

## Open Issue 2 — New Chat icon "clips in" on collapse

### Observation (Ctrl+B)
On a `Ctrl+B` collapse:
1. The **New Chat text** blurs/fades out *before* the width transition starts — this is correct and
   desired.
2. When the panel has narrowed, the always-mounted **New Chat icon** **clips in** abruptly — it pops
   into its collapsed/centered spot and is briefly cut by `overflow-hidden`, rather than moving
   smoothly with the width.

### Why the text is fine but the icon is not
- The **text** is a `<CollapseLabel>` (`motion.span`) wrapped in `AnimatePresence`, so it exits via an
  animated opacity fade (near-instant now) and unmounts — it never fights the shrinking width.
- The **icon** (`<Square/>`/`<SquarePenIcon/>` inside a `size-[14px]` span) is **always mounted** in
  both states. In the expanded button it is left-aligned (`gap-2.5 px-3 text-left`); in the collapsed
  button it is `justify-center`. Because `collapsed` flips on the same render that starts the width
  transition, the icon **re-centers instantly** (flex `justify-center`) while the width is still
  animating, and `overflow-hidden` on the aside clips it as it slips toward center → the "clip in".

### Root-cause hypothesis
The icon's *position change* (left → center) is a discrete layout re-flow that is **not** transitioned,
unlike the text's opacity. The width transition and the icon recenter therefore run on different
timings, so the icon visually jumps/clips instead of gliding.

### Possible fixes (untested)
- Delay the recenter until the width has finished: keep the button `text-left`-positioned (icon
  pinned near the left edge) for the duration of the collapse, then switch to `justify-center` once
  `settling` clears — so the icon stays put under the clip while the panel narrows, then centers
  after it settles.
- Wrap the icon position in a transition (e.g. `transition-[justify-content]` won't interpolate;
  instead animate the icon's `translateX` via Motion to ~ (collapsed center - left offset) over the
  same 170ms).
- Accept the instant recenter but hide the icon until the width settles, then fade it in centered.

---

## Files Modified (current state)

- `src/renderer/src/components/Sidebar.tsx`:
  - `<aside>` width: CSS `transition-[width]`, asymmetric curves + 80ms collapse delay (no Motion).
  - `CollapseLabel`: exit is opacity-only `0.02s`; entry keeps blur `0.18s` with `0.08s` delay.
  - Expanded content panel: exit opacity-only `0.08s`; entry blur `0.2s` with `0.08s` delay.
  - Scroll parent: `overflow-y-auto overflow-x-hidden`.
  - Toggle + New Chat buttons: `outline-none focus-visible:ring-2 focus-visible:ring-ring`;
    hover gated by `!settling`; toggle recentered to right edge when expanded.
  - Added `settling` state (suppresses hover during the ~300ms width transition).
- `src/renderer/src/App.tsx`: unchanged (drives `collapsed` via button or `Ctrl+B`).

---

## Recommended Next Steps

1. **Issue 1 (hover morph):** DevTools-verify whether the rectangle is background vs ring vs a
   compositor smear; test fixed-size buttons in both states (H3) and/or remove `transition-colors`
   (H1).
2. **Issue 2 (icon clip-in):** Decouple the icon recenter from the collapse — pin it during width
   transition, recenter/fade after `settling` clears (single targeted change).
3. Confirm both fixes by toggling via **click** (hover case) and **`Ctrl+B`** (no-hover case).
4. Remember cold reload (`Ctrl+Shift+R` or restart `npm run dev`) after hook/state changes —
   Vite hot-reload can leave stale output.

---

**Last Updated**: 2026-08-06 (rewritten to reflect resolved width issue + current open Issue 1 & Issue 2)
**Status**: Open — Issue 1 (hover morph) and Issue 2 (icon clip-in) under investigation
