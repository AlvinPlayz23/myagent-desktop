# myagent-desktop Design System

Portable design rules for this renderer. When editing UI, follow this file
before inventing new visual choices. Ported and trimmed from ZCode's
`DESIGN.md` to the subset this app actually ships.

## Highest-priority constraints

**1. Typography uses the `text-ui-*` scale.** All interface text uses one of
`text-ui-2xs`, `text-ui-xs`, `text-ui-sm`, `text-ui-caption`, `text-ui-base`,
`text-ui-lg`, `text-ui-xl`.

- Never hard-code `text-[13px]`, `text-[11.5px]`, etc.
- Never use Tailwind's built-in `text-xs`/`text-sm`/`text-base`/`text-lg`/
  `text-xl`/`text-2xl` for interface chrome.
- Only intrinsic content — markdown code, diffs, terminal output — keeps its
  own numeric font sizing. Its surrounding labels and controls still use
  `text-ui-*`.
- Interface scaling changes only `--ui-font-size`. Never set the root `html`
  font-size: that scales padding, radii and icons too.

Enforced by `npm run lint:design`.

**2. Use semantic tokens, not raw colors.** No `bg-black/32`,
`text-white/60`, or one-off hex in ordinary UI. Use the tokens below.

**3. Radius follows nesting, not importance.** See Radius.

## Color tokens

### Anchors and themes

Every surface, line and text tier is derived from three anchors per theme and
mode: `--canvas` (page), `--ink` (text) and `--brand` (accent). Surfaces mix
`--ink` into `--canvas` (`color-mix(in srgb, …)` on hex anchors; never oklch +
`none` inside a mix on Electron 33). The step scale `--s1…--s4`, `--line`,
`--rail-s`, `--card-lift` and `--menu-lift` set how strong each mix is and
differ between light and dark.

Named themes (`THEMES` in `preferences.ts`) swap the anchors only, through
`<html data-theme="…">`; light/dark remains the `.dark` class, so each theme
ships both modes: Neutral (default), Nord, Catppuccin, Gruvbox, Solarized,
Dracula. To add one, add a `:root[data-theme='x']` / `:root.dark[data-theme='x']`
pair in `styles.css` and an entry in `THEMES`. Theme switches suppress
transitions for one frame (`applyTheme`) so the swap snaps instead of smearing.

`--success`, `--warning`, `--destructive` and the diff pair are the state
fills. Their `-foreground` tokens are the readable *text* hue of that state
(for text on its tinted wash), not an on-fill colour; solid fills use
`text-white`.

### Surfaces (layered)

| Token             | Role                                            |
| ----------------- | ----------------------------------------------- |
| `--background`    | Page / chat panel root                          |
| `--background-alt`| Alternate page region for soft separation       |
| `--shell`         | Window backdrop behind the sidebar              |
| `--surface`       | Low-elevation container                         |
| `--surface-hover` | Hover for a low-elevation container             |
| `--card`          | Standard content card                           |
| `--card-selected` | Selected / active card                          |
| `--popover`       | Dialog / popover / floating panel               |
| `--menu`          | Dropdown / context menu surface                 |
| `--menu-hover`    | Hover for a menu item                           |
| `--input`         | Form-control stroke and off-state fill (`border-input`) |
| `--input-focused` | Focused editable field background               |

Do not reuse `--header`/`--panel`/`--sidebar` as generic card colors. Never mix
`bg-background`, `bg-card` and `bg-surface` without a clear layering reason.

### Text

| Token                  | Role                                     |
| ---------------------- | ---------------------------------------- |
| `--foreground`         | Main reading text                        |
| `--foreground-subtle`  | Secondary text, metadata, descriptions   |
| `--foreground-subtlest`| Placeholders, very weak metadata         |
| `--foreground-inverse` | Text on a dark/branded/state-colored fill|

### Borders and inputs

`--border`, `--input-border`, `--input-border-hover`,
`--input-border-focused`, `--popover-border`.

### Semantic feedback

`--success`, `--warning`, `--destructive`, `--info`, each with a
`-foreground` pair. `--busy` marks "a run is live."

Diff uses its own family — never borrow success/destructive for diffs:
`--diff-added`, `--diff-added-foreground`, `--diff-removed`,
`--diff-removed-foreground`.

The modal/menu scrim is `--overlay` (exposed as `bg-overlay`). Do not write
`bg-black/NN` for a scrim.

### Rules

- Prefer text hierarchy to create density before adding borders or colors.
- Keep brand (`--brand`) sparse; never a full-surface fill.
- Use semantic colors only for real semantic state.

## Typography

`--ui-font-size` defaults to `13.5px` and drives the whole scale.

| Token             | Formula              | Default |
| ----------------- | -------------------- | ------: |
| `text-ui-xl`      | `--ui-font-size + 4` |  17.5px |
| `text-ui-lg`      | `--ui-font-size + 2` |  15.5px |
| `text-ui-base`    | `--ui-font-size`     |  13.5px |
| `text-ui-caption` | `--ui-font-size - 1` |  12.5px |
| `text-ui-sm`      | `--ui-font-size - 2` |  11.5px |
| `text-ui-xs`      | `--ui-font-size - 4` |   9.5px |
| `text-ui-2xs`     | `--ui-font-size - 5` |   8.5px |

Role guidance:

- `text-ui-xl` — first-level reading headings (markdown h1).
- `text-ui-lg` — second-level headings (h2), empty-state titles.
- `text-ui-base` — body copy, buttons, section titles, settings rows.
- `text-ui-caption` — supporting copy one step below body.
- `text-ui-sm` — secondary copy, helper text, tooltips, inline code, chips.
- `text-ui-xs` — badges, counters, keyboard shortcut labels, very weak metadata.

Use `font-mono` for paths, commands, code, hashes, model ids and other
technical data. `cn()` is configured to treat `text-ui-*` as font sizes, so
`cn('text-ui-base', 'text-foreground-subtle')` keeps both.

## Spacing

Base unit `4px`. Rhythm: `4` tight icon/text, `8` compact control padding,
`12` dense rows, `16` standard card/panel padding, `20`–`24` dialog interiors.
Add `min-w-0` where text must truncate, `min-h-0` where a nested region scrolls.

## Radius

Radius follows the nesting of visible rounded containers.

- The first rounded container is `rounded-xl`; nesting steps down
  `rounded-xl` → `rounded-lg` → `rounded-md` → `rounded-sm` (minimum).
- Basic controls (buttons, inputs, textarea, select triggers) default to
  `rounded-lg`, stepping down with the nearest rounded parent.
- Dropdown menus, context menus, select panels: `rounded-lg` shell with
  `rounded-md` items.
- Ordinary container cards: `rounded-xl`. Dialogs: `rounded-2xl`.
- `rounded-full` only for deliberate pills/circles.
- No arbitrary radius values, no bare `rounded`.

## Motion

Use the shared tokens in `styles.css` (durations `--duration-*`, easings
`--ease-*`, distances `--distance-*`). Keep transitions fast: local feedback
inside ~120ms, whole surfaces inside ~220ms. Favor opacity/transform. No
animated `filter`/blur and no static `will-change` in a class rule outside
`components/ui/`. Enforced by `npm run lint:motion`.

## Elevation

Declare elevation once. Floating surfaces (menus, popovers, the tab overflow
list) use `--shadow-pop` (a 1px ring plus layered soft shadows); cards that
need lift use `--shadow-card`. Do not stack a border under a wide blur. Flat
content cards use `.surface-card` (hairline border, no lift).

## Icons

Hugeicons only (`@hugeicons/react` + `@hugeicons/core-free-icons`), outline
variant, `currentColor`, stroke 1.5 beside regular text and 1.75–2 on small or
filled controls. Shared glyphs live in `components/ui/icons.tsx`. No inline
icon SVGs and no other icon library.

## Session tabs

`TabBar.tsx` is a real `tablist`: roving tabindex, ←/→/Home/End move focus,
Enter/Space select, Delete/Backspace and middle-click close. The leading glyph
is the session status (message icon, spinner in `--busy` while running) and
swaps with the close button on hover/focus. Tabs shrink from 200px to 116px,
then move into the `+N` overflow menu; capacity is measured from the strip's
width. The active pill slides between tabs with a shared `layoutId`.

## Settings

`Settings.tsx` is a dialog on `--shell` with an inset `--background` page.
Every page uses `SettingsHeader` and the shared `SETTINGS_PAGE_CLASS` column
from `SettingsKit.tsx`; groups are one bordered `divide-y` container under a
sentence-case caption. Toggles use the `Switch` primitive. Providers is a
list of rows (one button each) that opens a labelled form; destructive
actions confirm inline, with focus on the safe choice.

## Effort slider

`EffortSlider.tsx` (+ `.module.css`) is the reasoning-effort control in the
Composer's popover. The shell outline grows a label shoulder while dragging;
geometry is ported unchanged from the supplied component. Stops and value are
props, the level is committed on release (immediately for keys), and colours
come from `--ink` and `--brand` so every theme works. The popover stops
mouse-down propagation so the Composer does not steal focus from the slider.

## Tool timeline

A settled run folds to one row: `Worked for 38s and made 3 tool calls`, with a
right chevron that turns down when open. No leading icon. The row text,
reasoning rows, tool icons and message text all share one left edge (rows pull
themselves left by their own padding). Folded sections open with the shared
`disclosure` variants in `motion.ts`: height drives layout so content below
glides, opacity trails height in and leads it out.

## Components

Reuse the primitives in `src/renderer/src/components/ui/` before inventing
variants: `button-group`, `hover-card`, `scroll-fade-viewport`,
`flip-metric-value`, `resizable`, `kbd`, `spinner`, and the Base UI set.
