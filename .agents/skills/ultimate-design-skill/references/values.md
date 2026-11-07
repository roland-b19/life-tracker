# Exact values

Every number the Wishlist uses, read from `app/globals.css` and `app/components/`. Use the token or class, never a copy of the number. If you must change a value, change it here and in the code in the same commit.

## Contents
- Tokens
- Global
- Type
- Layout
- Card
- Press
- Buttons
- Row icon buttons and streak
- Fields
- Sort select
- Segmented control
- Badges and tags
- Lists, bands, wash
- Empty note
- Wishlist row columns
- Summary amount
- Modal
- Toast
- Page and list motion timings
- Charts and AnimatedNumber
- Links
- Navigation
- Sign-in and sign-out
- Viewport and gestures
- Accessibility media queries

## Tokens (`:root`, `color-scheme: dark`)

**Surfaces**

| Token | Value | Use |
|---|---|---|
| `--background` | `#000000` | page |
| `--bg-radial` | two faint white radials (.04 and .02) | page glow |
| `--surface` | `rgba(28,28,30,.78)` | glass card |
| `--surface-solid` | `#1c1c1e` | solid card, colour-mix base |
| `--surface-secondary` | `rgba(58,58,60,.8)` | segmented track, sort select |
| `--surface-modal` | `#242426` | modal card |

**Text, accent and status**

| Token | Value | Use |
|---|---|---|
| `--text` | `#ebebf0` | primary text |
| `--secondary` | `#a1a1a8` | muted text (`.muted`) |
| `--tint` | `#86b4ea` | Storm accent |
| `--tint-hover` | `#9bc2ef` | hover on solid tint buttons |
| `--on-tint` | `#0b1b30` | text on solid tint |
| `--tint-subtle` | `rgba(134,180,234,.24)` | tinted button and badge fill |
| `--success` / `--success-subtle` | `#8fd4a3` / `.22` | streak, success badges |
| `--warning` / `--warning-subtle` | `#ebc673` / `.22` | mid range |
| `--danger` / `--danger-subtle` | `#ef8f8f` / `.22` | high range, `.danger`, `.error` |

**Lines** (transparent or used only for contrast)

| Token | Value |
|---|---|
| `--separator` | `#38383a` (chart tracks, gridlines, baselines and empty bars; never between rows) |
| `--card-border` | `#48484a` (the desktop sidebar's right edge) |
| `--edge` | `transparent` (every 1px border) |

**Highlights**

| Token | Value | Use |
|---|---|---|
| `--highlight` | `rgba(255,255,255,.05)` | quiet hover |
| `--highlight-fill` | `rgba(255,255,255,.2)` | grey control hover |
| `--tint-highlight` | `rgba(134,180,234,.34)` | tinted control hover |

**Motion**

| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(0.32, 0.72, 0, 1)` |
| `--dur` | `420ms` |
| `--quick` | `180ms` |
| `--fade` | `240ms ease` |
| `--lift` | `320ms var(--ease)` |
| `--glass-blur` | `blur(28px) saturate(160%)` |
| `--press` | `0.92` (set per element by `app/providers.tsx`) |

## Global

- Scrollbars hidden everywhere.
- Touch behaviour:
  - `touch-action: manipulation`;
  - `-webkit-tap-highlight-color: transparent`;
  - `overscroll-behavior: none`;
  - `-webkit-touch-callout: none`.
- Buttons and links: `user-select: none` and no callout. The body sets `-webkit-touch-callout: none`; `p`, `h1`–`h3`, `span`, `label`, `input` and `textarea` turn selection and the callout back on.
- Body:
  - font `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace`;
  - 1.0625rem, line-height 1.5;
  - antialiased;
  - the slashed zero is kept.
- Number classes (`.number-tabular`, values, badges with prices) use `font-variant-numeric: tabular-nums`.

## Type

| Element | Size | Notes |
|---|---|---|
| `.app-title` (page title) | 2rem | weight 700, letter-spacing -0.025em, 1.75rem at ≤640px. In `header.page-head` (flex, `align-items: flex-end`, margin-bottom 1.5rem), rendered by the navigation with the page name. |
| h1 | 1.85rem | 2.15rem at ≥768px |
| h2 | 1.3rem | |
| h3 | 1.1rem | |
| `.section-title` | 1.15rem | weight 700, letter-spacing -0.01em |
| `.metric-label` | | line-height 1.2, letter-spacing -0.015em, `text-wrap: balance` |
| buttons | | weight 700 (small 600), letter-spacing -0.01em |
| labels | .9rem | weight 600 |
| `.error` | .875rem | danger colour, margin `.75rem 0 0` (0 inside the sign-in form, whose stack gap spaces it) |

## Layout

**`main`**
- Width `min(100% - 1.5rem, 82rem)`, padding-top `1rem + safe-area`.
- At ≥640px: `100% - 2.5rem`, padding-top 1.5rem.
- At ≥1024px: `100% - 4rem` with max 84rem, padding-top 2rem.
- Safe-area insets on every side.
- Bottom padding `6rem + safe-area` on mobile, for the tab bar; `3rem` on desktop, where the sidebar shows.

**Grid**
- `.dashboard-grid`: gap 1.25rem.
- At ≥992px: columns `1.6fr 1fr`, gap 1.5rem, `align-items: start`.
- `.dashboard-grid-even`: `1fr 1fr`.

**Section head**
- `.section-head`: flex, wrap, `space-between`, gap .75rem, margin-bottom 1rem.
- Before a list it uses margin-bottom `card-pad - .5rem`: `.section-head:has(+ .entries, + .auto-height > .entries)`.
- `.head-actions`: flex, gap .75rem.
- With two children, `.section-head .head-actions` becomes a grid `1fr 1fr`; each child is width 100% and centred. This gives equal-width header buttons.
- `.section-head > button`: `white-space: nowrap`.

**Shared page classes** (reuse these before writing new ones)
- `.card-sub`: the muted .875rem line under a section title (with `muted`).
- `.icon-title`: a section title with an 18px icon before it, gap .4rem.
- `.metric-big number-tabular`: a card's main number, 1.75rem weight 700, counting up with `AnimatedNumber`; the unit or target follows in `.macro-target` (.78rem, `--secondary`).
- `.progress-track` / `.progress-fill`: a .45rem bar under a metric, `--separator` track, `--tint` fill (`.over`: `--danger`), width eases over `--dur` × 1.5.
- `.tap-buttons`: quick-amount buttons under a progress bar ("+250 ml"), flex, gap .5rem, margin-top 1rem; each a `.secondary tap-btn` at the `.btn-sm` size.
- `.form-pair`: two fields side by side, gap 1rem.
- `.group-label`: a small group heading inside a card, .75rem weight 700, uppercase, `--secondary`.
- `.toggle-label`: a checkbox with its label, gap .55rem, at least 44px tall, .9375rem weight 500.
- `.workout-exercise-card`: a plain group inside the Gym session card (no fill, no radius, 1.5rem between groups).
- `.push-toggle-card`: a `.surface` row (flex, space-between, .875rem) with a `BellIcon` 16 label and a `btn-sm tint` action (Task reminders / Enable). It is last in the aside, so its late arrival shifts nothing.

**Forms**
- `.form-actions`: flex, gap .75rem, each button `flex: 1`. An inline sub-form inside a modal (the Gym "New exercise" box) uses the same `.form-actions` with `btn-sm` buttons, and its `.form-pair` keeps the 1rem gap.
- `.form-stack`: grid, gap 1rem, margin-bottom 1.25rem.

## Card (`.surface`)

- `--card-pad` 1.35rem (1.6rem at ≥768px).
- Radius 1.15rem, background `--surface`, `backdrop-filter: var(--glass-blur)`, `1px solid var(--edge)`.
- Entrance `rise`: from `translateY(14px)` and opacity 0, `var(--dur) var(--ease) backwards`.
- Delays: child 2 = 40ms, 3 = 80ms, 4+ = 120ms.

## Press

`app/providers.tsx` sets `--press` on each pressable element on pointerover and focusin:

```
max(0.92, 1 - 8 / width)
```

That is about 4px a side, so a wide card barely moves and a small button presses visibly.

- `--press` is measured for `.surface`, `.split-day-card`, `.macro-card`, `.routine-row`, `.side-user`, `.nav-link`, `.month-nav-btn`, buttons and fields.
- Only these press: `:active` scale applies to buttons, `.nav-link`, `.delete-icon-btn` and `.picker-cell`, transitioned with `--lift`.
- Cards and fields never press. The active segment and chart bars opt out with `transform: none`.
- Tab-bar items never transform: scaling a glyph over a backdrop-filter leaves it blurry. The More tab is a `button`, so `button.tab-item:active` sets `transform: none` against the global press.

## Buttons

**Base `button`**
- min-height 2.75rem, padding .65rem 1.25rem, radius .85rem.
- `--on-tint` text on `--tint`; weight 700, letter-spacing -0.01em.
- inline-flex, centred, gap .5rem.
- Transitions: background `--fade`, transform `--lift`, opacity `--quick`.
- `:disabled`: opacity .45, `cursor: not-allowed`.
- `:focus-visible`: `outline: 2px solid var(--tint); outline-offset: 2px`. Fields get no outline; they change their fill instead.

**Variants**

| Variant | Look | Use |
|---|---|---|
| `.secondary` | text colour on `rgba(255,255,255,.06)` | the neutral grey button: Cancel, and non-primary choices next to a primary one (picker Today, water amounts, Move options, chat chips); never a form's submit |
| `.danger` | danger text on a transparent background | |
| `.btn-sm` | min-height 2.25rem, padding .35rem .85rem, .875rem, weight 600, radius .7rem | |
| `.chat-chip` | a `.secondary` chip: min-height 2.25rem, padding .3rem .85rem, .8125rem, radius .7rem | the "Add again" quick-add chips, in a `.chat-suggestions` row (flex-wrap, gap .5rem, margin-bottom 1rem) |
| `.btn-sm.tint` | tint text on `--tint-subtle` | the default header action (Add, Show all, Sign out) |

**Hover** (only inside `@media (hover: hover)`)

| Element | Hover fill |
|---|---|
| plain button | `--tint-hover` |
| `.secondary`, non-tint `.btn-sm`, idle weekday buttons, `.month-nav-btn` | `--highlight-fill` |
| `.btn-sm.tint`, `.delete-icon-btn` | `--tint-highlight` |
| `.danger`, idle muscle chips, idle tab items | `--highlight` |
| `.split-day-card` (not selected) | `color-mix(in srgb, var(--surface-solid), white 6%)` |

## Row icon buttons and streak

**`.delete-icon-btn`** (edit and delete)
- 44×44, radius .85rem, tint colour on `--tint-subtle`.
- Hover `--tint-highlight`. Presses with `scale(var(--press))`. Disabled opacity .35.
- Icons are 17px; the header plus icon is 14px.

**Spacing**
- `.item-actions` and `.row-actions` gap .75rem, the same as the header gap.

**Hit area (compact controls)**
- `button.btn-sm`, `.toast-action-btn`, `.toast-close-btn`, `.month-nav-btn`, `.tap-btn` and `.chat-chip` are `position: relative` with `::before { content: ""; position: absolute; inset: min(0px, (100% - 44px) / 2); }`.
- The visual size stays; the target grows to 44pt. Picker cells are left out on purpose, and so is `.muscle-chip` (padding .35rem .75rem, .85rem, in a wrapping row with a .4rem gap), whose grown targets would overlap the next row.

**`.streak`**
- A 44px slot, success colour, weight 700, .9375rem, with a fire icon.
- Order in the row: check circle (Tasks), name, streak, then the icon buttons (Tasks: Move, Edit, Delete; elsewhere Edit, Delete). Move is `MoveIcon` 17 in a `.delete-icon-btn.edit`.

## Fields

- `input, select, textarea, button` all take `font: inherit`, so typed text is the house monospace at body size (16px or more, so iOS never zooms on focus). The user asked for typed text in the same font as the rest of the form.
- `input, select, textarea`:
  - min-height 2.75rem, padding .65rem .95rem, radius .85rem;
  - background `rgba(28,28,30,.85)`, `1px solid var(--edge)`.
- Hover: `color-mix(in srgb, <fill>, white 5%)`. Focus: 8%.
  - Use `background-color` only, so the select chevron image survives.
- `select`:
  - SVG chevron, stroke `#a1a9b2`, width 1.8;
  - placed at `right 1rem center`, size .75rem;
  - padding-right 2.6rem.
- `label`: grid, gap .35rem, weight 600, .9rem. `.field` has the same layout for the date picker; `.date-field` looks like an input: the same 5% hover and 8% fill when open or focused, and no focus ring. A `fieldset` legend (the Tasks weekday picker) uses the same type: weight 600, .9rem, primary colour, never a lighter secondary caption.
- Checkbox: 1.25rem, `accent-color: var(--tint)`.
- No placeholders.

**Date picker pop-up (`.picker-pop`)**
- 19rem wide (max `100vw - 2rem`), padding .75rem, gap .5rem, radius 1.1rem, `--surface-modal`, `--edge` border.
- Opens .6rem under its button, centred, with `picker-in`: `calc(var(--dur) + 60ms)` `--ease`, from opacity 0, scale .94 and -6px, origin top centre.
- The month button shows `--highlight` while open. Month button and day cells hover `--highlight` inside `@media (hover: hover)`.
- Day cells press with `scale(var(--press))` and stay under 44pt on purpose (a dense grid).
- `.picker-grid` gap .15rem; days in 7 columns, months in 3 (gap .35rem).
- Day cell (`.picker-cell`): min-height 2.35rem, fully round, .9375rem weight 500, transparent; transitions `background-color var(--fade), color var(--fade), transform var(--lift)`.
  - today: `--tint` text, weight 700;
  - selected (`aria-pressed`): solid `--tint`, `--on-tint` text, weight 700;
  - disabled: opacity .3;
  - marked: a .25rem dot centred .3rem from the bottom.
- Month cells: min-height 2.75rem, radius .8rem.
- Weekday header: .6875rem, weight 600, letter-spacing .02em, secondary.
- Inside a form the picker opens in place (`.date-field` trigger, `labelledBy` the field's caption, `disabled` while saving). A disabled `.date-field` stays at full opacity, like the disabled inputs beside it.

**Date stepper (`.month-selector`)**
- `.month-nav-btn`: 2.25rem square, radius .7rem, `--surface-secondary` with an `--edge` border; disabled .35. It holds `ChevronLeftIcon` / `ChevronRightIcon` 17, never a `‹ ›` glyph.
- `.month-label-btn`: min-height 2.25rem, padding .25rem .75rem, transparent, .9375rem weight 600, no wrap. It opens the picker; when it cannot, it stays at full opacity.
- In a `.toolbar.dash` the stepper wears the segmented container: padding .25rem, gap .25rem, `--surface-secondary`, `--edge` border, radius .95rem; its arrows are borderless and transparent.

## Sort select (`select.sort-select`)

**Size and text**
- Auto width, min-height 2.25rem.
- Padding `.35rem 2.4rem .35rem .85rem`, so the text is centred against the chevron with `text-align-last: center`.
- .875rem, weight 600, radius .7rem.

**Fill**
- Background `--surface-secondary`; chevron at `right .8rem center`.
- Hover: 5% white mix. `:open`: 8% white mix over `--surface-secondary`. Focus keeps the background.

**Focus ring only when opened from the keyboard**

```tsx
onPointerDown={(e) => (e.currentTarget.dataset.pointer = "")}
onKeyDown={(e) => { if (e.key !== "Escape") delete e.currentTarget.dataset.pointer; }}
onBlur={(e) => delete e.currentTarget.dataset.pointer}
```

The CSS hides the outline on `[data-pointer]`.

## Segmented control (`Segmented`)

**Track**
- Grid `repeat(var(--n), minmax(0, 1fr))`.
- `--seg-gap` .25rem, padding .25rem.
- `--surface-secondary`, radius .95rem.

**Thumb**
- `::before`, tint fill, radius .7rem.
- Moves with `translateX(calc(var(--i) * (100% + var(--seg-gap))))` over `var(--dur) var(--ease)`.

**Buttons**
- min-height 2.25rem, padding .3rem .85rem, .9375rem, weight 600, secondary colour.
- Radius .7rem, the thumb's, so the idle hover fill has the thumb's shape.
- Idle hover: `--highlight` fill with text colour.
- Active: `--on-tint` text, no press.

**Dense mode**
- Used for more than 4 options, or on screens ≤30rem.
- Padding-inline .1rem, .8125rem.

**Semantics and labels**
- `role="tablist"` and `aria-selected`.
- Labels must fit in monospace at 375px.

## Badges and tags

- `.badge`:
  - inline-flex, gap .35rem, padding .25rem .65rem, radius .6rem, `1px solid var(--edge)` (every variant);
  - .75rem, weight 700, uppercase, letter-spacing .04em;
  - fill is the status `-subtle` token, text is the status colour.
- `badge-info` is tint. The ranges are `badge-rest` (low), `badge-warning` (medium) and `badge-danger` (high).
- `badge-rest` is neutral grey, not a status colour: `rgba(161,161,168,.2)` with `#c7c7cc` text.
- Price badge: tabular, `white-space: nowrap`, `justify-content: center`. In the Wishlist grid, price and range badges stretch to their shared column, so every price badge has the same width (the widest price), with centred text.
- `.badge-row` gap .4rem.
- Other badges: `.badge-success` (success on `--success-subtle`), `.badge-reminder` and `.badge-repeat` (tint on `--tint-subtle`, .75rem), `.badge-carried` (warning on `--warning-subtle`: a carried-over task, an AI-estimated meal, both things to check).
- A value with no goal behind it (the weight trend in kg/week) is `badge-rest`, never green or warning: colour would judge it.
- No coloured left stripe or outline marks a card's state (the deload card once had one); the title says it.
- `.progress-fill`: tint, radius 1rem, width transition `calc(var(--dur) * 1.5)` `--ease`; `.over` turns it danger.

## Lists, bands, wash

**`.entries`**
- Grid, gap .25rem, margin-top `card-pad - .5rem`. Only `.wishlist-entries` adds column-gap .75rem for the subgrid columns of its rows.
- Rows (`.entry-row`) have padding .5rem 0 and `justify-content: space-between`.
- Names wrap with `overflow-wrap: anywhere` (`.item-name`), so a long word never overflows.
- `.surface > .entries:last-child` and `.surface > .auto-height:last-child` get margin-bottom -.5rem. This goes on the clip box, so the last row is not clipped while the height animates.

**Bands**
- On every list row:
  - `--band-out: .75rem`;
  - `margin-inline: calc(-1 * var(--band-out))`, `padding-inline: var(--band-out)`;
  - radius .75rem;
  - transitions: `background-color var(--fade), transform var(--lift)`.
- Even rows: `rgba(255,255,255,.03)`.
- In a card: `--band-out: calc(var(--card-pad) + 1px - .5rem)` (1px for the clear border). A row ending in an icon button gets `padding-inline-end: .5rem`.
- `.auto-height` around a list takes the same `--band-out` margin and padding, so the band is not clipped.

**Wash list** (`<AutoHeight wash>`, which sets `data-wash`)
- `--band-out: calc((var(--card-pad) + 1px) / 2)`: the band sits halfway between the card edge and the text.
- A row with trailing buttons: `padding-inline-end: var(--band-out)`. The buttons then keep the same inset from the band as the text, so they line up under the header's Add button.
- Rows are transparent. The even wash applies only on `:not([data-settling])` lists and to rows `:not([data-entering])`.

**Row heights** (`--row-h`)
- Default 3.75rem: a row with 44px buttons plus .5rem above and below (Tasks, Food, weight).
- Wishlist: 5.9rem when narrow, 3.75rem at a ≥34rem container.
- Muscle map list (`.muscle-entries`): 4.1875rem (a two-part row, 67px).
- A list whose row height differs from 3.75rem sets its own, so the card never jumps when its only row comes or goes.

**`.todo-list`** is the same grid as `.entries`: gap .25rem, margin-top `card-pad - .5rem`, and 0 right after a `.section-head` (which then supplies `card-pad - .5rem`).

**Task row parts**
- `.todo-row`: gap .75rem, padding .5rem 0.
- Check circle (`.todo-checkbox-btn`): 1.45rem, round, 1.5px `--secondary` border; checked is solid `--tint` with `--on-tint` `CheckIcon` 12 (stroke 3). Its target is `::after { inset: -.7rem }`. A read-only circle (`.static`) has no target, and an unchecked one is at opacity .5.
- `.todo-title`: .95rem weight 500, wraps; done is line-through in secondary.
- `.readonly-note`: .8125rem secondary with `LockIcon` 13, gap .4rem, margin-bottom .25rem.
- `.week-strip`: 7 columns, gap .35rem, margin-bottom 1rem; its `.weekday-btn` padding .5rem 0, .8125rem.
- `.weekday-btn` idle: `--surface-secondary` with text colour, weight 600, min-height 2.75rem, radius .85rem. In the form, `.weekday-options` is 7 columns, gap .35rem.
- Move task options: full-width `.secondary` buttons in a grid, gap .5rem.
- Food Assistant chat: `.chat-log` is a `--surface-secondary` box (padding 1rem, radius .9rem, max-height 26rem, scrolls inside, collapses when empty). Bubbles: padding .65rem .9rem, .9375rem, line-height 1.4, radius 1.1rem with a .3rem tail corner; the assistant's on `--surface`, the user's on solid `--tint` with `--on-tint` text. Each message enters with the card `rise`, `backwards`. The typing bubble is italic secondary. A logged meal is a `.chat-tool` tag (tint on `--tint-subtle`, radius .5rem, .8125rem). `.chat-form`: the input and Send in a row, gap .75rem, margin-top 1rem.

## Empty note

- `.empty-note`: centred, secondary colour, .9375rem, padding `1.5rem 0` outside a list; right after a segmented control, padding-bottom .5rem.
- Inside a list: `display: grid; place-items: center; min-height: var(--row-h, 3.75rem); padding: .5rem 0`.
- Always `key={`empty-${filter}`}` and `ref={rowRef("empty")}`. A reused note would keep `fadeAll`'s faded state. When two lists on one screen share a `useListMotion`, give each empty note its own id (`past:empty`, `cat:empty`).
- Loading list: a plain `<div className="entries">` with two `.skeleton.skeleton-row` (2.75rem high, margin-bottom .5rem, radius .5rem; a gradient of white .04/.09/.04 at 400% width, `skeletonShimmer` 1.4s ease infinite), replaced by the `AutoHeight` list once loaded. The title's total stays hidden until then.

## Wishlist row columns

**Narrow**
- Areas `"name name name" "price range link"`, row-gap .4rem between the name line and the tags.
- Actions sit in the name area with `justify-self: end`.
- The name gets `padding-inline-end: calc(88px + 1.5rem)`, so it never runs under the buttons.

**Wide**
- A container query at 34rem (on `.auto-height:has(> .wishlist-entries)`, `container-type: inline-size`) puts the row on one line.
- Rows are a subgrid with columns `fit-content(40%) auto auto minmax(0,1fr) auto`.
- Narrow, `.wishlist-entries` has columns `auto auto minmax(0, 1fr)` (`auto minmax(0, 1fr)` without a range badge), so price, range and link start at the same place on every row.
- `.item-actions .btn-sm` keeps 44px min-height and radius .85rem.
- `.item-meta` is `display: contents`. Tags and link start on the left.
- Tags carry `data-slide`, so they glide when the shared column widths change.
- Price and range badges fill their column: all have the same width, with centred text. Link and plain text use `justify-self: start`.
- Without the range column (any tab but All), the narrow layout is `"name name" "price link"` and the wide layout is `fit-content(40%) auto minmax(0,1fr) auto`.

## Summary amount

- `.item-total`: 2rem, weight 700, tint, centred, line-height 1. The currency unit is in a `.muted` span.
- Its section head is centred, with margin-bottom `card-pad`.

## Modal

**Backdrop**
- `rgba(0,0,0,.4)`, `blur(28px) saturate(180%)`, height 100dvh, padding 1rem at every width, `touch-action: none`.
- Fades in with `modalFadeIn var(--dur)`.

**Card**
- max-width 36rem (the Modal's `maxWidth` prop; it overrides the CSS 34rem), `--surface-modal`, radius 1.25rem.
- The body scrolls inside the card only as an overflow fallback; forms are kept short enough not to scroll.
- Opens with `modalScaleUp` from scale .98 and `translateY(8px)`.

**Closing**
- `.closing` plays the open in reverse.
- `CLOSE_MS` 420; `FADED_MS` 280, after which `onExited` fires.

**Page behind**
- Blurred, never scaled.
- The body is pinned (`position: fixed`, with the scroll restored after), for iOS.
- The backdrop follows `visualViewport` (height, plus an `offsetTop` transform), so the keyboard never zooms or pushes it.

**Parts**
- Header padding 1.25rem 1.5rem .85rem; title 1.25rem, weight 600; body padding 1.5rem.
- Close button: a 1.75rem circle, `rgba(255,255,255,.12)`, secondary colour, hover `--highlight-fill`. Its `::before` with inset -.5rem makes the 44pt target. Close icon 13px, `aria-label` "Close modal".
- At ≤640px: header padding 1rem 1.25rem .75rem, body padding 1.25rem.

**Behaviour**
- Escape and a tap on the backdrop close it.
- `role="dialog"`, `aria-modal="true"`, labelled by `#modal-title`.
- While closing it is `inert`, so nothing in it can be clicked twice.
- Portaled to `body`.

## Toast

**Container**
- Fixed at bottom `1.5rem + safe-area` and right 1.5rem; a column with `align-items: flex-end`, gap .5rem.
- On a phone: centred, left and right 1rem, bottom 5.5rem (above the tab bar).

**Item**
- `rgba(28,28,30,.95)` with blur 20px, radius .95rem, padding .75rem 1.15rem, gap .75rem.
- Only as wide as its content.
- Enters with `toastSlideIn`: 12px up and scale .97.

**Parts**
- Message: .875rem, weight 500. A success toast has the check icon (14px, success colour).
- The container is `aria-live="polite"`. The close button is labelled "Dismiss notification" and uses a 13px icon.
- `.toast-actions` gap .5rem.
- Action: tint text on `--tint-subtle`, .8125rem, weight 600, padding .35rem .65rem, radius .7rem, min 36px high and 44px wide. Hover `--tint-highlight`.
- Close: transparent, 36px square, padding .25rem, radius .7rem, hover `--highlight-fill`.
- The success check icon has margin-right .4rem.
- Entrance: `toastSlideIn var(--dur) var(--ease) forwards`.

**Timing**
- Lasts 5s.
- Mouse hover or focus pauses it. Leaving resumes its remaining time, but never less than 1500ms (`LINGER`).
- No exit animation: it is removed at once. Tapping the action also dismisses it.
- Touch never pins it.

**Look**
- No shadow.

## Page and list motion timings

**Page**

| What | Value |
|---|---|
| Page exit (`page-out`) | 120ms ease-in, to opacity 0 and scale .985 |
| Page enter (`page-in`) | 260ms `--ease`, 40ms delay, from `translateY(8px)` |
| View-transition root | 300ms |
| Card rise | 420ms `--ease`, 14px, delays 0/40/80/120ms |

**Rows**

| What | Value |
|---|---|
| Row `row-in` | 260ms `--ease` `backwards`, from opacity 0 and scale .97 |
| Row stagger | `calc(min(sibling-index() - 1, 10) * 30ms)`, with the JS `stagger()` fallback |
| `row-in` inside `.auto-height` | 180ms |

**`AutoHeight`**
- RESIZE is 180ms `cubic-bezier(.2,0,0,1)`.
- Skipped when the change is under 1.5px, under reduced motion, or while `[data-row-motion]` is present.
- Each row's entrance is delayed until the height uncovers its bottom, 1px early.

**`useListMotion`**

| Name | Value | What it does |
|---|---|---|
| FADE | 160ms `--ease`, forwards | a leaving row, to opacity 0 and scale .97 |
| SWITCH | 120ms | `fadeAll` |
| SPACE | 260ms with SPACE_EASE `cubic-bezier(.4,0,.2,1)` | a row's space opening or closing |
| FADE_IN | 180ms | starts after SPACE; after 120ms when the row is the list's only row |
| DUR | 420ms | FLIP `reorder` |

**Wash and modal**
- WASH is 240ms (`--fade`), the wait before rows move in a wash list.
- Modal: opens over `--dur`, closes with `CLOSE_MS` 420 and `FADED_MS` 280.

**Sign-out and number**
- Sign-out fade: 320ms `--ease`, fill `forwards`, opacity and `blur(2px)`.
- AnimatedNumber: 600ms ease-out cubic, from 0 on entry.

**Reduced motion**
- Every duration becomes 0.01ms and the view transitions 0s.
- `useListMotion` and `AutoHeight` skip their animations.

## Charts and AnimatedNumber

- Bars: tint at .55 opacity, radius 4px on the top corners.
- Bars grow with `bar-grow` (scaleY from 0) over `--dur`, staggered across 0–84ms from first to last bar.
- A clickable bar (`onSelect`) hovers to opacity .9 (inside `@media (hover: hover)`); a plain bar has no hover change, only its `title`. A highlighted bar (`.hl`) is 1; an empty bar is `--separator`.
- Bar height moves over `--dur`; opacity and colour (hover, highlight) fade over `--fade`.
- Bar tips (`data-tip`) fade in over 120ms on hover or focus and slide from left- to right-aligned across the chart, so they never leave it.
- `ProgressRing` fills from 0 over 900ms when it first appears, then eases between shares (up or down) on ticks and view changes; do not key it by the view. It is 132px with a 12px stroke: `--separator` track, `--tint` fill with round caps, centre text 1.75rem weight 800, letter-spacing -.02em.
- `.dash-hero`: a centred column, gap 1rem, padding-block .25rem: the ring with its caption below.
- `.stat-row`: 3 equal columns (`.two`: 2), gap .75rem, margin-bottom 1.25rem. `.stat-tile`: padding .75rem .9rem, radius .85rem, `--surface-secondary`, gap .15rem; the number 1.35rem weight 700, the caption .75rem secondary.
- `.chart-controls`: the chart's `Segmented` groups side by side (`flex: 1` each), gap .75rem, margin-bottom .75rem.
- `.move-hint`: the one help line in a dialog, `.muted`, .875rem, margin 0 0 .25rem.
- `.toolbar.dash`: one column, gap .75rem (1.6fr 1fr, gap 1.5rem from 992px); a `.toolbar-group` holds segmented controls at `flex: 1`, gap .75rem.
- Bar gap by count: 4px, 2px above 20 bars, 1px above 45.
- Bar height: at least 2%; an empty bar is a 3px stub.
- Bar tip bubble: padding .4rem .6rem, radius .6rem, .75rem text, line-height 1.35, `--surface-modal`, `white-space: pre` (tip on one line, title on the next).
- `BarChart` has `role="img"` (or `group` when bars are buttons) and an `aria-label` summary.
- `LineChart`: `role="img"` with an `aria-label`; dots r 3.5 with an SVG `<title>` `label: value`; axis first label, `lo – hi`, last label. No entry animation. With fewer than 2 points it renders nothing and a `.chart-note` (muted .875rem, centred, `min-height: calc(140px + 1.375rem)`, the chart's height) takes its place: "Not enough weigh-ins in the last 30 days."
- `HBars`: a `<ul>` of label (wraps, never cut off), track and text value. The track is `--separator` and fully rounded. No role and no animation.
- `AnimatedNumber` counts from 0 on mount and eases to each new value.

## Links

- A URL (`https?://...`) or a bare domain (`x.y/...`) becomes:

  ```tsx
  <a target="_blank" rel="noopener noreferrer" class="item-link">
  ```

  - It shows `host ↗` and the full value as its `title`.
  - Tint, weight 600, .875rem, with an ellipsis.
- Any other value is `.item-link-text` in the secondary colour.

## Navigation

**Tab bar (below 1024px)**
- Fixed: left and right .75rem, bottom `.5rem + safe-area`, padding .25rem, radius 1.5rem.
- Glass: `rgba(28,28,30,.72)`, `blur(28px) saturate(160%)`.
- The first 4 links plus More. Items are at least 3.25rem high, radius 1.25rem, .6875rem weight 600 labels, with 1.4rem icons; colour and background fade with `--fade`, never a transform.
- More opens a menu (`--surface-modal`, radius 1.25rem, bottom `5.25rem + safe-area`) with `modalScaleUp` from the bottom right, over a scrim with an 8px blur. It closes on Escape and on a backdrop tap, at once, with no exit animation; so does the date picker pop-up. The menu is `role="dialog"` and its links set `aria-current="page"` like the sidebar and tab bar.

**Sidebar (≥1024px)**
- Fixed, 248px wide, padding 1.5rem 1rem, gap .375rem.
- Glass: `--surface-solid` at 55%, `blur(28px) saturate(160%)`, right edge `1px solid var(--card-border)`.
- `main` gets margin-left `248px + 2rem`. From 1480px the content is centred, max `84rem + 248px`.
- `.nav-link`: min-height 2.75rem, padding 0 .75rem, gap .75rem, radius .75rem, .9375rem, weight 500, secondary colour, 1.25rem icons.
- `.nav-link` hover is `--surface-secondary`; the active link is tint text on `--tint-subtle`, with `aria-current="page"`.

## Sign-in and sign-out

**Sign-in**
- `.signin-page`: flex, centred, min-height 85vh.
- `.signin` max-width 26rem: a normal `.surface` card.
- `.signin-brand`:
  - flex, gap .5rem;
  - .75rem, weight 700, letter-spacing .08em, uppercase, tint;
  - a static green dot.
- `.signin-form` margin-top 1.25rem.
- `button.signin-continue:disabled`: opacity 1, `cursor: progress`.

**Sign-out**
- The button is `btn-sm tint signout-btn`. In the sidebar account card it spans the card; in the phone More menu it sits on the same line as the user name (`.more-user`, `flex: none`).
- The handler:
  1. fades `main > *` (opacity and blur 2px, 320ms);
  2. waits for `Promise.all([signOut({ redirect: false }), ...fades])`;
  3. then calls `router.push("/signin")` and `router.refresh()`.
  - On error it cancels the fades and shows the warning toast `Failed to sign out`.

## Viewport and gestures

- `layout.tsx`: `maximumScale: 1`, `userScalable: false`, `viewportFit: "cover"`, `themeColor: "#000000"`, `colorScheme: "dark"`; `appleWebApp.statusBarStyle: "black-translucent"`.
- `app/providers.tsx` blocks `gesturestart`, so iOS cannot pinch-zoom.

## Accessibility media queries

| Query | Effect |
|---|---|
| `prefers-contrast: more` | `--edge`, `--separator` and `--card-border` become `--text` |
| `prefers-reduced-transparency: reduce` | `--surface` becomes `--surface-solid`, `--surface-secondary` `#3a3a3c`, `--surface-modal` `#242426`; the sidebar, tab bar and More menu turn solid; no backdrop blur on them, the scrim or the modal backdrop |
| `prefers-reduced-motion: reduce` | animation and transition durations become .01ms; view transitions 0s; the `.skeleton` shimmer stops (a static placeholder) |

Sources: `app/globals.css`, `app/providers.tsx`, `app/components/{list-motion,modal,toast,segmented,animated-number,charts,navigation}.tsx`, `app/template.tsx`, `app/layout.tsx`, `app/signin/page.tsx`.
