---
name: ultimate-design-skill
description: The Life Tracker house design system, distilled from the Wishlist page the user signed off as "completely done, everything is perfect". Every principle, value, timing and rejected idea from that work, so any page, list, form, button, toast, modal, animation, chart or sign-in/sign-out screen matches it exactly. Use whenever you design, build, restyle or review any UI in this project (pages, lists, rows, cards, buttons, fields, selects, segmented controls, badges, spacing, fonts, colours, motion, add/edit/delete flows, Undo, toasts, modals, page transitions, empty states), or when the user says "like the wishlist", "same as wishlist", "consistent", "polish", "animation", "design".
---

# Ultimate design skill (Life Tracker house style)

Agent-neutral. Lives in `.agents/skills/ultimate-design-skill/`. The **source of truth is the Wishlist page** (`app/wishlist/wishlist-client.tsx`, its CSS in `app/globals.css`, the shared parts in `app/components/`). When this skill and the Wishlist code disagree, the code wins: fix this skill.

It sits on top of the `apple-design` skill (HIG rules, accessibility) and below the user's own words: **user's words > this skill > apple-design > your taste**.

## How to use

1. Read this file completely before any UI change. It is the rulebook.
2. Exact values (tokens, sizes, radii, paddings, timings): `references/values.md`.
3. Lists, add/edit/delete, Undo, motion code: `references/motion-and-crud.md`. Copy the Wishlist pattern, never reinvent it.
4. Reuse the house parts; never build a second version of them:
   - `Modal`, `useAfterClose` (`app/components/modal.tsx`);
   - `useToast` (`toast.tsx`);
   - `AutoHeight`, `useListMotion` (`list-motion.tsx`);
   - `Segmented` (`segmented.tsx`);
   - `AnimatedNumber` (`animated-number.tsx`);
   - icons (`icons.tsx`);
   - charts (`charts.tsx`);
   - the date picker;
   - `Navigation`.
5. Finish with the checklist at the end, and check the screen in a real browser at 375px and desktop width.

## 1. The taste in one paragraph

Professional, minimalist and dynamic: it should feel like a native Apple app on a phone.

- **Colour:** moody black and grey (Graphite) with a calm blue accent (Storm). Colours are subtle; the motion is evident but never showy.
- **Depth:** nothing has a border or a shadow. Depth comes only from the surface fill and the glass blur.
- **Feedback:** every change on screen is animated in order. Add, delete and an edit that moves a row share one animation: the wash fades out first (100ms, wash lists), the rows below glide to make or close space (240ms), the row itself fades (out where it stands, or in after the glide), and the wash comes back last.
- **Stability:** nothing jumps, nothing shifts, nothing gets stuck, nothing lags.
- **Consistency:** every page uses the same parts with the same numbers. "Consistency across all pages" is a requirement, not a nicety.

## 2. Principles (each one came from user feedback)

**Look**
- **Dark only.** The app has one dark appearance and no light theme. This deliberately departs from the HIG's "follow the system appearance"; the user chose it.
- **Subtle colour.** Fills are low-alpha tints of their own colour (`--tint-subtle`, `--success-subtle`, ...), never solid bright blocks. A tinted button is tint text on `--tint-subtle`.
- **One accent.** The steel blue `--tint` is the only accent, and status colours mean status only. Two exceptions are data the user asked to colour: the Wishlist price ranges (low grey, medium `--warning`, high `--danger`, as `-subtle` badges) and the muscle map's groups (`app/gym/muscle-groups.ts`), shown on the model and as a dot on each group chip. The chip itself stays neutral and turns `--tint-subtle` when selected. A muscle group named in a list row is a neutral `badge-rest`.
- **Subtle but legible.** The `-subtle` fills (.22–.24 alpha) were raised because fainter ones blended into the dark theme. Never go lower.
- **Highlights are grey and smooth.** Every hover, focus or open fill change transitions with `--fade`; nothing snaps. The row wash is neutral grey (white at .03), not a variation of the accent. The user first asked for accent-coloured rows, then for grey highlights everywhere.
- **Hover is a subtle derivative of the element's own colour.**
  - A tinted control hovers to `--tint-highlight`.
  - A grey one hovers to `--highlight-fill`.
  - A quiet one hovers to `--highlight`.
  - A field hovers to its own fill mixed with 5% white.
  - Never a different hue, never a glow, never a scale or pulse.
  - Hover rules live only inside `@media (hover: hover)`, so touch never keeps a hover state ("buttons do not stay active").
- **No borders, no shadows, no separator lines** anywhere.
  - Cards, fields, toasts and modals use `1px solid var(--edge)`, which is transparent, so the layout keeps its pixel.
  - `prefers-contrast: more` turns `--edge` into a visible line.
  - Lists separate rows with alternating faint bands, never lines.
  - Three exceptions draw a line: the desktop sidebar edge (`--card-border`), chart gridlines and baselines (`--separator`), and the task check circle's 1.5px `--secondary` outline.
- **No row hover highlight.** Rows are bands: every even row gets `rgba(255,255,255,.03)` and nothing changes on hover.
- **Radius scales with size.** About 0.31× the control height:
  - 2.75rem button → .85rem;
  - 2.25rem small button → .7rem;
  - card → 1.15rem;
  - modal → 1.25rem;
  - badge → .6rem;
  - row band → .75rem.
- **Buttons are rounded squares**, never circles or pills (the toast close was squared for this). The signed-off exceptions are round by nature, not buttons in a row: the modal's close (a small grey circle, the "more subtle x" the user asked for), the task check circle, the date picker's day cells and the muscle-map group chips.
- **Monospace everywhere** (`ui-monospace, "SF Mono", ...`), with the slashed zero kept on purpose. Numbers are tabular.
- **No placeholders** in fields. Labels say everything.
- **No example notes, no credits, no "Life tracker" title on pages.** The app name appears only in the navigation (the sidebar brand, the More menu, the fallback title of an unknown route) and on the sign-in brand line. The one allowed help line is a `.muted.move-hint` at the top of a dialog, stating a consequence the user cannot see: Move task (only for a daily task: its streak starts over), Edit category (its items move along, an existing name merges the two).
- **Icons are inline stroke SVGs** with round caps. No emoji. Icons never tremble: no transform on hover.

**Layout**
- **Equal spacing.**
  - Spacing above a list equals spacing below it.
  - The gap between the band and the card edge equals the gap between the band and the title.
  - The gap between a row's trailing button and its band edge equals the gap between the band and the card edge.
  - Gaps between tags equal gaps between row buttons, and those equal the header gap (.75rem). The .4rem `.badge-row` gap is only for small badges that belong to a name (Tasks weekdays, reminder), not for tags beside buttons. Those badges sit on the name's line and wrap only when the line is full, never on a line of their own.
- **Everything is centred against its object.**
  - Text is vertically centred in its row.
  - Row buttons are centred on the row, never on its first or last line. On a phone a Wishlist row has its own column for the actions: Edit above Delete, centred on the whole item (name, tags and link), at the card's right edge.
  - Sort text is centred against its chevron (`text-align-last: center`).
  - The add button is centred in its header slot.
  - Toast buttons are centred in the toast. The action is at least 44×36 and the close button 36px square; both reach 44pt through `::before`.
- **Header buttons are equal width.** Two controls in a section header split it `1fr 1fr`.
- **Nothing shifts.**
  - A control that appears later is always rendered and hidden with `visibility: hidden` (muscle map "Show all").
  - An empty list keeps one row's height (`--row-h`). One exception: a Gym exercise's set list collapses to nothing until its first set, since the target line above already says what to log.
  - Cards never jump.
- **One line where it fits.** On a wide card a Wishlist row is one line: name, price, range, link, actions. On a phone it wraps to name, then price and range, then the link on its own line, with the actions in their own column. Tags and link start on the left. Price badges share one column width on every row, on a phone too (see the next rules).
- **A total sits next to its title**, muted and tabular: `Items 12`, `Tasks 4`, `Meals 3`, `Shopping list 7`, `Categories 5`, `History 20`. A list still loading shows no total yet.
- **Counts and totals follow the filter.** The count next to the title and the summary amount always show the active filter, not the whole list.
- **Never repeat what every row says.** A tag that would be identical on every visible row is hidden: the range badge appears only in the All tab.
- **Tags line up in columns.** On a wide row each tag kind has its own shared column, so tags line up under one another.
  - Price and range badges stretch to their column's width, so all have the same width, with centred text.
  - The link starts on the left.
- **Value first, details muted.** The main value comes first. Dates and other secondary data are muted (`--secondary`), with a clear gap: a muted detail after its value on the same line is 1.25rem away, baseline-aligned (`.weight-main`).
- **Full-width selectors.** A `Segmented` control spans the full card width, with centred labels. The one exception is the muscle map's Front/Back switch: a 10rem control laid over the 3D model.
- **One card level.** Never nest a card in a card. Only the outer box is a `.surface` and gets the entrance; inner groups are plain bands or rows. Gym Training days are the exception: seven selectable `--surface-solid` cards inside the split card.
- **The list goes first.** The list the user works in is the main (first) column; a card that supports it (a summary, or the Categories that manage its groups) goes in the aside (second column); on a phone, where the columns stack, a summary card goes above the list (`summary-first`). Categories are added, renamed and deleted in their own card, never inside the list they group.
- **No sticky panels.** Cards and panels scroll with the page. Only the sidebar and tab bar are fixed.
- **Forms align.** All fields share one column and one width. A checkbox is centred on its label text.

**Mobile**
- **Native app on a phone.**
  - No zoom: no pinch, no input zoom, `maximumScale: 1`.
  - No scrollbars, no rubber-band overscroll, no tap highlight, no long-press callout.
  - Text is selectable only where it is text.
  - Respect safe-area insets. The tab bar has room under it.
  - No Next.js dev indicator (the "N" button): `devIndicators: false` in `next.config.ts` stays.
  - It installs to the Home Screen as a standalone app, so it never shows browser chrome: `public/manifest.json` (`display: standalone`, `orientation: portrait`, black `#000000` theme and background) and `appleWebApp.capable: true` in `app/layout.tsx` stay.

**Forms and overlays**
- **Forms are modals, never bottom sheets.** Centred on a desktop and on a phone; on a phone it eases up to the top while the keyboard is open (so the keyboard never makes iOS pan the page).
  - The page behind blurs and is never scaled.
  - The keyboard never zooms or pushes the form.
  - The form closes exactly like it opens (the reverse animation).
  - A form is short enough that it does not scroll while the user types. The modal body's own scroll is only a fallback for unusually long content.
  - Any list change from the form starts only after the form has finished closing.
- **Toasts are only as wide as their content.**
  - Hovering or focusing a toast keeps it. Leaving resumes its remaining time, but never less than 1.5s.
  - Touch never pins it.
  - Only a success toast carries the check icon.
  - A toast has no exit animation: it disappears at once. Tapping its action also dismisses it.
- **Forms guard themselves.**
  - Fields disable while saving (`disabled={busy}` on every input and select, inline Gym set fields and sign-in included). Save stays disabled until the required fields are filled, the inline Gym "Log set" included (until reps are entered). No modal form autofocuses a field; the sign-in Username is the one field that does. Sign-in is the exception: Continue is only disabled while busy (it keeps its colour), and an empty Username is caught by `required`.
  - Numeric fields use `inputMode="decimal"`, or `"numeric"` for whole numbers (calories, reps, minutes, water, steps).
  - Validate only what the data needs. An optional free-text field accepts any text: the Wishlist link may be just a store name, so it has no URL check.
  - A list of named things refuses a duplicate name (ignoring case) with an inline form error: `"X" is already on this list.` (Tasks; food categories and Gym exercises say `"X" already exists.`).
  - Errors inside an open form show inline (`.error` with `role="alert"`, last in `.form-stack`), using the server's message when there is one. Every form has one: validation, duplicates and save failures all go there, and the form stays open. Clear it when the form opens and on each submit.
  - Warning toasts are only for actions without an open form: list actions and quick taps (+250 ml). Water and steps keep their form open while saving, like every form.
  - A one-off action outside a form (enabling task reminders) reports through a toast too: `Reminders enabled`, `Failed to enable reminders (notifications are blocked)`. Never a status line of text under a card.
  - A failed first load of a page's data is a warning toast too: `Failed to load tasks`, `Failed to load weigh-ins`. No inline error text on the page. The one exception is the muscle map's stage, which would otherwise be blank: `Loading model...` while the model loads, and `3D view is not available here. Use the muscle buttons instead.` if WebGL or the model fails.
- **Date pickers have limits.** Future days only where the user can plan ahead (tasks: up to 7 days), never on logs such as weight. Pass `marked` so days with planned items show a dot: only future days with one-off items, and never in a view where every day has items (Daily).

**Behaviour**
- **Undo exactly where it helps.**
  - Delete has Undo.
  - Edit has Undo.
  - Add has no Undo: a new item is one tap from Delete. Adding onto something that already exists is an edit and has Undo: a water tap (`Added 250 ml`), a shopping item already on the list (`"X" is now 2 kg`), setting water or steps (`Water set to 2000 ml`), a goal (`Saved nutrition goals`, `Water goal set to 3500 ml`).
  - Clearing bought items has Undo (`Cleared 3 bought items`).
  - Moving a task (to another day, into Daily or out of it) has no Undo (`Moved "X" to Tomorrow`, `Moved "X" to Daily`): it is one more Move away.
  - Marking a task done or reopening it has no Undo, and neither does ticking a shopping item: a tick is undone by another tick.
  - Deleting a shopping category (its row's Trash) has no Undo: the server merges its items into Other, so a restore could not tell them apart. Its toast says where the items went: `Removed "X"; its items are in Other`. The row leaves at once while its Shopping group leaves and its items enter Other; a failed delete puts both back.
  - Undo puts the screen back first and writes after, like the delete. The exception is a log entry or list item the server re-creates with a new id (meals, gym sets, weigh-ins, shopping items): it comes back when the server answers. Pages that refetch after a write (Tasks, Gym days) write the old values first and show them with the refresh; on failure only the warning toast shows.
  - Every Undo has a failure path: if writing the old values back fails, the screen keeps the change and a warning says `Failed to undo the edit`.
- **Optimistic and honest.**
  - Nothing waits on the network: the row leaves at once and the toast shows at once. Quick taps (tick, +250 ml) update the screen at once too.
  - If the server fails, the screen is put back to match the database and a warning toast says what failed.
- **Fast.**
  - Page and tab changes feel instant (exit 120ms).
  - View switches fade old rows in 120ms.
  - Nothing animates for its own sake.
  - The resize is always faster than the item's appearance.
- **Dates:** d.m.y everywhere. Always use the house date picker, never the native one. A time of day (a task reminder) is the one native field: `<input type="time">`, labelled "Reminder (optional)".
- **Links in data open.** A URL or domain becomes an external link showing the host + " ↗"; anything else is plain secondary text.
- **Streaks** are green (success colour) with a fire icon, in the row. Row order: check circle (Tasks), name, streak, then the icon buttons (Tasks: Move, Edit, Delete; elsewhere Edit, Delete).
- **Derive, don't ask.** A value that follows from data the user already entered is computed and gets no picker. The Wishlist range comes from the price (`< 250` low, `250-750` medium, `750+` high); there is no manual priority.
- **Newest first by default.** A list starts sorted by creation time, latest on top. Other orders (price) are options in the sort select. Tasks are the exception: open tasks first, then done ones, the most recently completed on top.
- **Everything the user created is editable.** Every row the user made has Edit and Delete: items, tasks, categories, shopping items, water, steps, weights, split days. Log entries the user did not ask to edit (meals, logged sets) are delete-only: log again to correct.
- **Past days are read-only.** Their tasks can be ticked but not edited, moved or deleted (dev builds excepted through `DEV_EDIT_PAST`), and a `.readonly-note` with `LockIcon` 13 says so: "Past days can be ticked, not edited". A future Daily view says "Daily tasks are ticked on the day". Health's Today tab has a day stepper under the section tabs (full width, past and today only); a past day hides every add, edit, delete and tap button and says "Past days are read-only". Its writes, and the Assistant's, always go to today.
- **Unrelated controls stay still.** An action on a row never animates anything else. For example, the date arrows do not move when a task is ticked.
- **Rows build at once.** Rows start building with the page enter. They never wait about a second after the page shows.
- **Charts and numbers animate on entry and on every view change** (day, tab, filter, period). Bars grow from 0 and summary amounts count up from 0, because their wrapper is keyed by the view. `ProgressRing` is the exception: it fills from 0 when it first appears, then eases from the old share to the new one on every view change, down as well as up (100% → 0% animates); it is never keyed by the view (the user's call).
- **Show progress visually.** Wherever something is tracked over time, the page gets a dashboard card (`ProgressRing` and/or `BarChart` with a period selector), not only numbers.
- **An empty set counts as complete:** 0 of 0 shows 100%.
- **A fraction never counts.** "X of Y" is plain text with the real numbers from the first frame, on entry and on change; only the ring beside it fills, so the card never reads "0 of 0" (the user's call).
- **Stat tiles count up.** Every number in a `.stat-tile` is an `AnimatedNumber`, never a plain value beside a counting one. A tile with no value yet shows an em dash `—`. A unit sits beside its number in the tile (`2775 ml`, a `.macro-target`), never in the caption below it. Tiles sit in one `.stat-row` that wraps: equal widths, and in a narrow card the last tile takes a full row. Several badges side by side go in a `.badge-group`.
- **Bar charts (`BarChart` in `charts.tsx`):**
  - when the chart covers days, tapping a bar opens that day (bars are buttons through `onSelect`);
  - replay their grow animation on every view change (day, tab, filter, period);
  - have a labelled value axis (0, half, max);
  - show the exact value on bar hover (`title`, or a `data-tip` bubble when bars are buttons);
  - pick their period with a `Segmented` (7D/30D/90D; weight also 180D/360D);
  - switch equally fast for every period.
- **`LineChart`** (weight, water and steps trends) is a line only, with no dots (the user's call) and no grow animation. Its axis shows the first label, `lo – hi` and the last label.
- **A pie or donut chart** (none today; the Money page that had one is gone) animates like `ProgressRing`, and the hovered or tapped slice comes forward with a subtle animation.
- **`HBars`** is a plain list: label, track, value as text. No role and no animation, because the values are already readable.
- **Selection is a fill, never a border.** A selected card or chip gets `--tint-subtle` (split day cards, muscle chips). A selected toggle (a picker day, a `.weekday-btn`, the `Segmented` thumb) is solid `--tint` with `--on-tint` text. No coloured outline or left stripe, and "today" gets no extra border.
- **Small controls still have 44pt targets.** Compact buttons keep their look and get an invisible `::before` with `inset: min(0px, (100% - 44px) / 2)`. Dense picker grids and the muscle-map group chips are the exceptions, so a tap never lands on a neighbour.

## 3. Motion rules (order matters more than speed)

Shared easing: `--ease` = `cubic-bezier(0.32, 0.72, 0, 1)`, the iOS curve: the "Apple spring" motion the user chose, which settles without overshoot. Never an overshoot or a spring bounce. Full timings are in `references/values.md`.

1. **Page enter/exit.** `template.tsx` wraps every page in `<ViewTransition enter="page-enter" exit="page-exit" default="none">`.
   - Exit: 120ms fade with scale to .985.
   - Enter: 260ms rise of 8px, after a 40ms delay.
   - No blur.
   - The sidebar and tab bar do not animate on page changes, except the tab bar's own thumb (below).
2. **Cards rise in on load.** 14px up and fade, staggered 0/40/80/120ms.
3. **Rows build one after another** on page load only. After that a view switch (Wishlist range or sort, Tasks space, list or day, Gym training-day or muscle-group pick; the user's call, 2026-11-10, applied to every page) fades the old rows out (120ms), then the whole new list in (200ms), and the card resizes at once. In code: `useBuilt()` adds `built` to the list's class after 700ms (globals.css turns the rows' own entrance off), and `swapIn(card)` runs just before the state change that swaps the rows (`list-motion.tsx`). Add, edit, delete, Undo and move keep their own row animations. Wishlist has no More button: it always shows every item.
   - `row-in`: opacity 0 and scale .97, 260ms, 30ms apart, capped at the 11th row.
   - Use `animation-fill-mode: backwards`, never `both`: a held end state pins the transform and breaks `:active` press.
   - Safari lacks `sibling-index()`, so `stagger()` in `list-motion.tsx` sets the same delays from JS.
   - A list that shrinks still builds in sequence.
4. **Deleting a row.** The row fades in place (160ms, scale .97) while the rows below glide up (240ms, `transform` only); in a wash list the wash fades out (100ms) before all of it and the card height follows. Nothing pops at the end. The list's only row has no space to close: it only fades, and the empty note fades in.
5. **Adding a row.**
   - In a wash list the wash fades out first (100ms).
   - The rows below glide down (240ms) and the card grows with them.
   - Then the row fades in (180ms).
   - It is never seen clipped.
   - A list's only row swaps with the empty note, which has the same height, so it only fades.
6. **An edit that moves a row** (sort or filter changes its place) uses the same animation as add and delete: the wash fades out, the row fades out in place, the rows between glide to make space, the row fades in at its new place, the wash comes back. An edit that takes the row out of the current filter leaves like a delete. A row alone in its list only fades, as in 4 and 5.
7. **Wash lists** (Wishlist):
   - The alternating wash fades out first (100ms) and the rows wait for it: remove / make space / place, in that order (the user's sequence, 2026-11-10).
   - Every step is short and subtle, but long enough to read: the glide is 240ms, the fades 160–180ms.
   - It comes back as soon as the last row animation ends (it never waits for React's commit, which on a phone adds a dead pause), fading in over the same 100ms it faded out in, in all four animations (delete, undo, add, move). Only the number of phases differs: delete 1, add and undo 2, move 3.
   - A leaving row sits out the alternation at once (`data-leaving`), so the bands do not flip when it is removed.
   - A row still entering sits out the alternation, so no other row's wash flips meanwhile.
   - The wash shows only after the list has loaded.
8. **View switch** (filter tab, sort, selected group):
   - The control changes at once.
   - The old rows fade together (`fadeAll`, 120ms).
   - Then the new rows build in sequence.
   - Rows sit in a `<Fragment key={filter-sort}>` so they remount and replay.
9. **Height changes** go through `AutoHeight`: 180ms, faster than the rows.
   - Each new row waits until the growing height has uncovered it.
   - Tags and links marked `data-slide` glide to their new column when the column widths change.
10. **Page-level section switch** (Health: Today, Water, Weight, Steps, Shopping, Assistant; on a phone "Shopping" and "Assistant" read "Shop" and "AI"): a full-width `Segmented` in a `.toolbar` above the cards, its `label` naming the sections. It swaps the cards at once (no `fadeAll`), and the new cards enter with the card rise (420ms, 14px, staggered 0/40/80/120ms).
11. **Form close.** The modal reverses its open animation (fade plus scale .98 and 8px). The page blur clears. Only then does the list change (`later()`).
12. **Sign-out.** Every `main > *` fades with opacity plus blur(2px), never scale, over 320ms `--ease` (fill `forwards`, so it stays faded). The sign-out call runs in parallel. The router goes to `/signin` and refreshes only when both are done. On failure the fade is cancelled and a warning toast says `Failed to sign out`.
13. **Sign-in.** The card appears only after the previous page has faded. The Continue button keeps its colour while busy (opacity 1, progress cursor).
14. **Reduced motion.** All durations become 0.01ms and `useListMotion` skips its animations, so changes are immediate. Never remove an animation for everyone to fix reduced motion; gate it.

## 4. Building a list page: the Wishlist recipe

```
<main>
  <Navigation userName=.../>
  <div className="dashboard-grid">                        (1.6fr 1fr at ≥992px)
    <div className="dashboard-main">
      <section className="surface" aria-labelledby=...>   (card)
        <div className="section-head">
          <h2 className="section-title">Items <span className="muted number-tabular">N</span></h2>
          <span className="head-actions below">           (sort select + Add button: equal halves; on a phone its own row under the title)
        <Segmented .../>                                  (filter)
        <AutoHeight wash className="entries ...">         (list)
          empty-note keyed `empty-${filter}`  |  <Fragment key={`${filter}-${sort}`}> rows
    <div className="dashboard-aside"> summary card with AnimatedNumber
  <Modal> form: .form-stack labels, .error, .form-actions (Cancel secondary | Save)
```

- **Row markup:** `div.entry-row` (`ref={rowRef(id)}`) containing:
  - the name (`strong`);
  - meta badges (`data-slide`);
  - `.item-actions` with two `.delete-icon-btn` (`PencilIcon` 17, `TrashIcon` 17), with `aria-label` "Edit X"/"Delete X" and `title` "Edit"/"Delete". A task row puts a Move button first (`MoveIcon` 17, `aria-label` "Move X", `title` "Move"). Reorder buttons use `ArrowUpIcon` / `ArrowDownIcon` 17 ("Move X up" / "Move X down"), never text arrows.
  - A card-level Edit in a section head is the icon-only `.delete-icon-btn.edit` (`PencilIcon` 17, `aria-label` naming the target: "Edit nutrition goals", "Edit water and goal") when it stands alone (Health Nutrition, Water and Steps). Beside another header button it is a `btn-sm tint` with `PencilIcon` 14 and "Edit", so the pair splits `1fr 1fr` like the Wishlist's sort and Add (Gym day card). The Gym day card keeps its `btn-sm tint` Edit on a rest day, where Start is hidden, so the header keeps one shape between days.
- **Header add button:** `button.btn-sm.tint` with `<PlusIcon size={14} />` and the label "Add item".
- **Navigation entry:** a new page adds itself to `navLinks` and its title to `getPageTitle()` in `app/components/navigation.tsx`, with an inline 24×24 stroke icon (strokeWidth 2, round caps and joins). The first four links are tabs on a phone; the rest go to More. A route without a title shows "Life Tracker".
- **State and handlers:** copy them from `references/motion-and-crud.md`:
  - the `latest` ref;
  - `replace`, `switchRange`, `switchSort`, `openForm`;
  - `handleSubmit` with `later`;
  - `putBack`, `dropRow`, `handleRemove`.

## 5. Copy (UI text)

- Toast messages:
  - `Added "X"`, with details in parentheses when useful;
  - `Saved "X"`;
  - `Removed "X"`;
  - `Renamed "X" to "Y"`; `Started "Push day"`, `Finished the workout`;
  - failures: `Failed to remove item`, `Failed to restore item`, `Failed to undo the edit`.
- A warning toast reports a failure, with one exception: a saved set below its rep target says so as a warning (`Added set 3 (below the 8 – 12 target)`), since it is something to look at.
- Failure text is `Failed to <verb> <object>`, with no full stop, using the same verbs as the success toasts: `Failed to add meal`, `Failed to save day`, `Failed to remove set`. Never "Could not ...", never an exclamation mark.
- Form errors without a server message: `Failed to save item`, `Item not found.`
- An entry without a name shows its value, with the date in parentheses: `Added 72 kg (06.11.2026)`, `Saved ...`, `Removed ...`. Gym sets use their number: `Added set 3`, `Removed set 3`.
- Empty notes are one plain sentence: "No items yet.", "No items in this range."
- The modal title is "New item" or "Edit item". The submit label is "Save", "Saving..." while busy. Cancel is "Cancel".
- Validation errors are full sentences that start with "Please": "Please enter an item name.", "Please enter a valid price greater than 0.", "Please keep min reps at or below max reps for X."
- Every form's submit says "Save" ("Saving..." while busy), for a new entry too. The button that opens the form names the object ("Add meal"); the submit does not.
- Field labels are short nouns in sentence case: "Name", not "Meal Name / Description".
- Units go in the label ("Price (RON)"). Optional fields say "(optional)". Fields have no placeholders. The meal form is the one exception: all four numbers (calories, protein, carbs, fat) save 0 when blank, so their labels keep only the unit ("Protein (g)").
- Sentence case for controls and titles ("Newest"). The Wishlist summary title "Estimated Investment" is the one signed-off exception; do not copy it.
- Ranges are short and tight so the filter buttons fit a phone: "< 250", "250-750" (hyphen, no spaces), "750+". The Wishlist sort says "Price ↑" (lowest first) and "Price ↓" (highest first): text arrows, since a native select cannot hold an SVG.
- Money uses `ro-RO` formatting (thousands dot) with no decimals on the Wishlist (whole lei, the user's call), then a muted "RON".
- A busy label ends in three dots: "Saving...", "Signing in...".
- All UI text is English, the Food Assistant included ("Send", "Sending...", "Calculating macros..."). Only the AI's replies follow the language the user writes in.
- `BarChart` and `LineChart` carry a text summary for screen readers (`role="img"`, or `group` for button bars, with an `aria-label`). `HBars` needs none: its values are text.
- Segmented labels must fit in monospace on a phone. Shorten them ("Rate"/"Count") rather than letting them overflow. When the full label matters on a wide screen, give the option a `short` label: it replaces the long one below a 29rem control width, and the long one stays as the `aria-label`.
- An add button names its object: "Add item", "Add task", never a bare "Add".
- No two controls show the same label. If a tab already says "Today", the date selector shows the date. A select next to an "Add exercise" button is labelled "Exercise".
- Show only what carries information. A week view shows day names, not dates.
- An empty note says exactly what is empty in the view shown: "Nothing planned for today.", "Nothing was planned for this day." (a past day), "Nothing planned for this day." (a future one), "No daily tasks yet." (today), "No daily tasks for this day." (another day). Every empty day shows its note, so the list never collapses.
- Long names wrap onto as many lines as they need. They are never cut off in a row.

## 6. Rejected: never do these again

Each of these was tried or proposed and the user removed it.

**Visual effects**
- Pulsing, scaling or "lift" on hover; any pulsing dot. The sign-in dot is static.
- Box shadows of any kind, including toasts, modals and cards.
- Visible borders and separator lines between rows.
- A blue page background (light blue, dark steel blue, Storm's blue-tinted greys). The user wanted the base black and grey (Graphite); blue is only the accent.
- A bottom-to-top gradient mask over a resizing list. It was tried in several variants and removed; the sequential row build replaced it. No shimmer as decoration either. The one allowed shimmer is the `.skeleton` placeholder while data is still loading (weight history).

**Layout and content**
- Scaling the page behind a modal. Blur it only.
- Bottom sheets.
- Placeholders in fields.
- Example or help notes, credits, and a "Life tracker" title on each page. The sign-in card has no "Local development session..." line either.
- A floating action button, or a command menu (⌘K) with shortcut hints. The add button sits in the card's title row.
- Hiding content on a phone. The aside cards stack under the main column, so phone and desktop have the same features.
- A greeting or suggested prompts in the Food Assistant chat. It starts empty, and its only control is the input. The "Past foods" `btn-sm tint` sits in the Meals card head, next to "Add meal".

**Features**
- A "buy" button and the green "bought" animation.
- Meal types (Breakfast, Lunch, Dinner, Snack) on Food, a "Recent workouts" tab on Gym, and adding shopping items from recipes: the shopping list is filled by hand only.

**Interaction and speed**
- Undo on add, on task done or on reopening a task.
- Edit without Undo. It was briefly removed, then the user asked for it back.
- A zero without the slash. It was tried; the user kept the slashed zero.
- Accent-coloured row stripes. They were replaced by the neutral grey wash.
- Hover highlight on rows. It was added, then removed.
- Price tags only as wide as their text. Asked at 13:32 on 2026-11-06, then reversed at 14:01: tags of one kind share one width.
- A focus ring after picking a sort option with mouse or touch. It appears only for keyboard use.
- Doubling motion speed or tripling wash speed: tried and reverted. Keep the timings in `references/values.md`.
- `animation-fill-mode: both` on entrances of anything that later presses or hovers (rows, bars, chat bubbles). Use `backwards`. Overlays that only open and close (modal, More menu, picker, page transition) may keep `both`.
- Filters (blur) on rows during list motion: they repaint the glass card every frame. Rows use opacity and transform only.
- Closing a deleted row's space only after it has faded. It was asked for first, then felt stuck at the end: the space now closes while the row fades.

## 7. Checklist ("done" for every screen)

**Look**
- [ ] Only house parts and house classes. No new colours, radii, shadows or borders. Selection is a `--tint-subtle` fill, never a border.
- [ ] Monospace, tabular numbers, no placeholders, d.m.y dates via the date picker.
- [ ] Header controls are equal width. The total sits next to the title. The add button has a 14px plus.
- [ ] Rows are bands with no hover. Trailing buttons are 44×44, with an inset equal to the band-to-card gap.
- [ ] The empty note keeps one row's height. No layout shift when controls appear.

**Motion**
- [ ] Every add, edit, delete and switch follows the motion order in section 3. No row is ever seen clipped, and nothing pops at the end.
- [ ] Delete and Edit have Undo. Add and task done do not. Server failures restore the screen and show a warning.
- [ ] The form opens and closes symmetrically. List changes start after the close.

**Accessibility**
- [ ] Every hover rule is inside `@media (hover: hover)`. `:active` presses with `scale(var(--press))`.
- [ ] Focus ring: 2px tint, offset 2px, keyboard only. Targets are at least 44pt (`::before` with `inset: min(0px, (100% - 44px) / 2)` on small controls; picker grids excepted).
- [ ] `aria-label` on icon buttons, `aria-labelledby` on sections, `role=tablist` on segmented controls.
- [ ] Works with reduced motion, reduced transparency and increased contrast.

**Browser**
- [ ] Checked at 375px (no horizontal overflow, labels fit) and on desktop.
- [ ] Checked in Safari terms: no reliance on `sibling-index()` alone.

Sources: `app/wishlist/wishlist-client.tsx`, `app/globals.css`, `app/providers.tsx`, `app/components/{list-motion,modal,toast,segmented,animated-number,charts,navigation}.tsx`, `app/template.tsx`, `app/layout.tsx`, and the user's design feedback from 2026-11-04 to 2026-11-06 (recorded in `docs/decisions.md`).
