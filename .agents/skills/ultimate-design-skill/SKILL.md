---
name: ultimate-design-skill
description: The Life Tracker house design system, distilled from the Wishlist page the user signed off as "completely done, everything is perfect". Every principle, value and rejected idea from that work, so any page, list, form, button, toast, modal, chart or sign-in/sign-out screen matches it exactly. Use whenever you design, build, restyle or review any UI in this project (pages, lists, rows, cards, buttons, fields, selects, segmented controls, badges, spacing, fonts, colours, add/edit/delete flows, Undo, toasts, modals, empty states), or when the user says "like the wishlist", "same as wishlist", "consistent", "polish", "design".
---

# Ultimate design skill (Life Tracker house style)

Agent-neutral. Lives in `.agents/skills/ultimate-design-skill/`. The **source of truth is the Wishlist page** (`app/wishlist/wishlist-client.tsx`, its CSS in `app/globals.css`, the shared parts in `app/components/`). When this skill and the Wishlist code disagree, the code wins: fix this skill.

It sits on top of the `apple-design` skill (HIG rules, accessibility) and below the user's own words: **user's words > this skill > apple-design > your taste**.

## How to use

1. Read this file completely before any UI change. It is the rulebook.
2. Exact values (tokens, sizes, radii, paddings): `references/values.md`.
3. Lists, add/edit/delete and the Undo of every action: `references/lists-and-crud.md`. Copy the Wishlist pattern, never reinvent it.
4. Reuse the house parts; never build a second version of them:
   - `Modal` (`app/components/modal.tsx`);
   - `useToast` (`toast.tsx`);
   - `ListBox`, `useMore`, `useDragSort` (`lists.tsx`);
   - `Segmented` (`segmented.tsx`);
   - icons (`icons.tsx`);
   - charts (`charts.tsx`);
   - the date picker;
   - `Navigation`.
5. Finish with the checklist at the end, and check the screen in a real browser at 375px and desktop width.

## 1. The taste in one paragraph

Professional, minimalist and dynamic: it should feel like a native Apple app on a phone.

- **Colour:** moody black and grey (Graphite) with a calm blue accent (Storm). Colours are subtle.
- **Depth:** nothing has a border or a shadow. Depth comes only from the surface fill and the glass blur.
- **No motion, with two exceptions:** there are no animations or transitions anywhere (the user's call, 2026-11-11) except the Tasks progress ring fill (it also fades out when it returns to 0%), the Wishlist estimated-total count-up and the Nutrition numbers (macro totals and goals count up on change, the user's call of 2026-11-12) (the user's call, 2026-11-11, later the same day). Everything else appears, changes and disappears instantly: rows, modals, toasts, charts, other numbers, hover and press states, page changes.
- **Feedback:** every change is shown at once and every change can be undone: each toast of an action that modifies something has an Undo button.
- **Stability:** nothing shifts, nothing gets stuck, nothing lags.
- **Consistency:** every page uses the same parts with the same numbers. "Consistency across all pages" is a requirement, not a nicety.

## 2. Principles (each one came from user feedback)

**Look**
- **Dark only.** The app has one dark appearance and no light theme. This deliberately departs from the HIG's "follow the system appearance"; the user chose it.
- **Subtle colour.** Fills are low-alpha tints of their own colour (`--tint-subtle`, `--success-subtle`, ...), never solid bright blocks. A tinted button is tint text on `--tint-subtle`.
- **One accent.** The steel blue `--tint` is the only accent, and status colours mean status only. Two exceptions are data the user asked to colour: the Wishlist price ranges (low grey, medium `--warning`, high `--danger`, as `-subtle` badges) and the muscle map's groups (`app/gym/muscle-groups.ts`), shown on the model and as a dot on each group chip. The chip itself stays neutral and turns `--tint-subtle` when selected. A muscle group named in a list row is a neutral `badge-rest`. There are 14 groups (Back and Obliques are one group each).
- **Subtle but legible.** The `-subtle` fills (.22–.24 alpha) were raised because fainter ones blended into the dark theme. Never go lower.
- **Highlights are grey.** Every hover, focus or open fill change is a subtle grey step, applied at once. The row wash is neutral grey (white at .03), not a variation of the accent. The user first asked for accent-coloured rows, then for grey highlights everywhere.
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
- **No example notes, no credits, no "Life tracker" title on pages.** The app name appears only in the navigation (the sidebar brand, the More menu, the fallback title of an unknown route) and on the sign-in brand line. The one allowed help line is a `.muted.move-hint` at the top of a dialog, stating a consequence the user cannot see: Edit category (its items move along, an existing name merges the two).
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
- **A total sits next to its title**, muted and tabular: `Items 12`, `Tasks 4`, `Meals 3`, `Shopping list 7`, `Categories 5`. A list still loading shows no total yet.
- **Counts and totals follow the filter.** The count next to the title and the summary amount always show the active filter, not the whole list.
- **Never repeat what every row says.** A tag that would be identical on every visible row is hidden: the range badge appears only in the All tab.
- **Tags line up in columns.** On a wide row each tag kind has its own shared column, so tags line up under one another.
  - Price and range badges stretch to their column's width, so all have the same width, with centred text.
  - The link starts on the left.
- **Value first, details muted.** The main value comes first. Dates and other secondary data are muted (`--secondary`), with a clear gap: a muted detail after its value on the same line is 1.25rem away, baseline-aligned (`.weight-main`).
- **Full-width selectors.** A `Segmented` control spans the full card width, with centred labels. The one exception is the muscle map's Front/Back switch: it sits in the strip under the model between the Move button (2.75rem, touch only) and Go back (6.5rem), at the same height.
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
  - It installs to the Home Screen as a standalone app, so it never shows browser chrome: `public/manifest.json` (`display: standalone`, no `orientation`, so the screen turns freely; black `#000000` theme and background) and `appleWebApp.capable: true` in `app/layout.tsx` stay.

**Forms and overlays**
- **Forms are modals, never bottom sheets.** Centred on a desktop and on a phone; on a phone it moves to the top while the keyboard is open (so the keyboard never makes iOS pan the page).
  - The page behind blurs and is never scaled.
  - The keyboard never zooms or pushes the form.
  - The form opens and closes at once.
  - A form is short enough that it does not scroll while the user types. The modal body's own scroll is only a fallback for unusually long content.
- **Toasts are only as wide as their content.**
  - Hovering or focusing a toast keeps it. Leaving resumes its remaining time, but never less than 1.5s.
  - Touch never pins it.
  - Only a success toast carries the check icon.
  - A toast appears and disappears at once. Tapping its action also dismisses it.
- **Forms guard themselves.**
  - Fields disable while saving (`disabled={busy}` on every input and select, inline Gym set fields and sign-in included). Save stays disabled until the required fields are filled, the inline Gym "Log set" included (until reps are entered). No modal form autofocuses a field; the sign-in Username is the one field that does. Sign-in is the exception: Continue is only disabled while busy (it keeps its colour), and an empty Username is caught by `required`.
  - Numeric fields use `inputMode="decimal"`, or `"numeric"` for whole numbers (calories, reps, minutes, water, steps).
  - Validate only what the data needs. An optional free-text field accepts any text: the Wishlist link may be just a store name, so it has no URL check.
  - A list of named things refuses a duplicate name (ignoring case) with an inline form error: `"X" is already on this list.` (Tasks; food categories and Gym exercises say `"X" already exists.`).
  - Errors inside an open form show inline (`.error` with `role="alert"`, last in `.form-stack`), using the server's message when there is one. Every form has one: validation, duplicates and save failures all go there, and the form stays open. Clear it when the form opens and on each submit.
  - Warning toasts are only for actions without an open form: list actions and quick taps (+250 ml). Water and steps keep their form open while saving, like every form.
  - A one-off action outside a form (enabling task reminders) reports through a toast too: `Reminders enabled`, `Failed to enable reminders (notifications are blocked)`. Never a status line of text under a card.
  - A failed first load of a page's data is a warning toast too: `Failed to load tasks`, `Failed to load weigh-ins`. No inline error text on the page. The one exception is the muscle map's stage, which would otherwise be blank: `Loading model...` while the model loads, and `3D view is not available here. Use the muscle buttons instead.` if WebGL or the model fails.
- **Date pickers have limits.** None on Tasks (neither tab has a date picker or a day stepper), and never on logs such as weight.

**Behaviour**
- **Undo on every action that modifies something.** The toast of a create, edit, delete, toggle, clear, quick tap or setting shows an Undo button, and Undo restores the previous state:
  - create → delete it (`Added "X"`);
  - delete → restore it with the same data, id and timestamps (`Removed "X"`); nothing about the row may differ afterwards (completion time, bought state, flags, order);
  - edit → write the old values back (`Saved "X"`);
  - toggle → toggle back: ticking a task or a shopping item, reopening a task;
  - quick tap and set value → the previous amount (`Added 250 ml`, `Water set to 2000 ml`, `"X" is now 2 kg`, `Saved nutrition goals`);
  - clear → bring them back (`Cleared 3 bought items`);
  - category delete or rename → a real revert: the items that moved go back to their old category (a category deleted with items has them restored to it; a rename that merged two categories un-merges);
  - a secret the browser never sees back (Claude token): Undo sends the previous encrypted value to a restore action that validates it;
  - starting a workout is undone only while it has no sets (otherwise a warning points to Cancel workout); a custom exercise is removed only if no routine or set uses it.
  - Only a change with no user action behind it (a background carry-over of tasks) has no toast.
  - Undo puts the screen back first and writes after, like the delete. The exception is a log entry or list item the server re-inserts under its old id and time (meals, gym sets, weigh-ins): it comes back when the server answers. Pages that refetch after a write (Tasks, Gym days) write the old values first and show them with the refresh.
  - Every Undo has a failure path: if writing the old values back fails, the screen shows what the database holds and a warning says `Failed to undo`, `Failed to undo the edit` or `Failed to restore item`.
  - A new server action behind an Undo ships an authorization test (owner allowed, other user denied, anonymous denied) and a test that the restored row equals the original.
  - Health is Today only (since 2026-11-12): Water, Weight and Steps are edited for today through their card's Edit; there is no date entry, no history list, no Past foods and no meals list. Shopping lists every item (no More).
- **Optimistic and honest.**
  - Nothing waits on the network: the row leaves at once and the toast shows at once. Quick taps (tick, +250 ml) update the screen at once too.
  - If the server fails, the screen is put back to match the database and a warning toast says what failed.
- **Instant.**
  - Page and tab changes, view switches, adds, deletes and Undo show at once. Nothing animates.
- **Dates:** d.m.y everywhere. Always use the house date picker, never the native one. A time of day (a task reminder) is the one native field: `<input type="time">`, labelled "Reminder (optional)".
- **Links in data open.** A URL or domain becomes an external link showing the host + " ↗"; anything else is plain secondary text.
- **Derive, don't ask.** A value that follows from data the user already entered is computed and gets no picker. The Wishlist range comes from the price (`< 250` low, `250-750` medium, `750+` high); there is no manual priority.
- **Newest first by default.** A list starts sorted by creation time, latest on top. Other orders (price) are options in the sort select. Tasks are the exception: open tasks first, then done ones, the most recently completed on top.
- **Everything the user created is editable.** Every row the user made has Edit and Delete: items, tasks, categories, shopping items, water, steps, weights, split days. Log entries the user did not ask to edit (meals, logged sets) are delete-only: log again to correct.
- **Tasks have no date logic.** Neither tab has a day stepper or date picker, and a task is only ever added for today. The Daily tab is today's list; the Today tab is today's one-off tasks, and an unfinished one from an earlier day carries over to today (the only date logic, done on the server). There is no Move (daily to today or back): delete and add again. An edit, delete or category change applies to the task itself; a delete removes it for good (only the per-day counts for the charts stay, `todo_day_stats`), and Undo puts it back from the screen's copy. There are no streaks: a daily task is ticked for today only, so every day starts open. Water and Steps accept a new entry for today or yesterday only (their older history is read-only; chart and History still show it). Health's Today tab has a day stepper under the section tabs (full width, past and today only); a past day hides every add, edit, delete and tap button and says "Past days are read-only". Its writes, and the Assistant's, always go to today.
- **Unrelated controls stay still.** An action on a row never animates anything else. For example, the date arrows do not move when a task is ticked.
- **Charts and numbers are drawn at once** at their value: bars, `ProgressRing`, stat tiles and macro numbers never grow, count up or ease.
- **Show progress visually.** Wherever something is tracked over time, the page gets a dashboard card (`ProgressRing` and/or `BarChart` with a period selector), not only numbers.
- **An empty set counts as complete:** 0 of 0 shows 100%.
- **A fraction is plain text** with the real numbers: "X of Y".
- **Macro cards keep a fixed layout.** The target sits on its own row under the number (`/ 3350 kcal`), so a change never moves a line break or the card.
- **Gym set form.** Reps, Unit, Value and Extra sit on one row (4 columns, values centred, labels short because a phone is narrow), on a grey `--surface-secondary` fill; the four columns are equal; "Log set" is the last control of an exercise (after the True failure, Partial reps and Good form switches) at full width; one exercise is one item of a wash list (alternating bands, list gaps, no extra space between exercises) and folds with the shared arrow, a column of its own centred on the title block; the bottom actions (Finish workout, Exit, Cancel) are one centred column as wide as the widest; the target line has no RIR text (the "True failure (0 RIR)" checkbox stays); "Last time" lists its sets one per row.
- **Muscle map move button (touch only).** Always grey, 2.75rem square (a faint lighter fill while held, never tinted; override the global button `min-height`). Press and hold it and slide the same finger to turn the model; a drag on the model itself scrolls the page (`touch-action: pan-y` on the canvas AND its wrapper, since the effective value is the intersection of the ancestors; OrbitControls off on a coarse pointer). The Tasks dashboard sits above its list on a phone (`summary-first`) and its empty Progress card keeps the ring's height, so changing day never moves the page.
- **Stat tiles.** A tile with no value yet shows an em dash `—`. A unit sits beside its number in the tile (`2775 ml`, a `.macro-target`), never in the caption below it. Tiles sit in one `.stat-row` that wraps: equal widths, and in a narrow card the last tile takes a full row. Several badges side by side go in a `.badge-group`.
- **Bar charts (`BarChart` in `charts.tsx`):**
  - when the chart covers days, tapping a bar opens that day (bars are buttons through `onSelect`);
  - have a labelled value axis (0, half, max);
  - show the exact value on bar hover (`title`, or a `data-tip` bubble when bars are buttons);
  - pick their period with a `Segmented` (7D/30D/90D; weight also 180D/360D).
- **`LineChart`** (weight, water and steps trends) is a line only, with no dots (the user's call). Its axis shows the first label, `lo – hi` and the last label.
- **`HBars`** is a plain list: label, track, value as text. No role, because the values are already readable.
- **Selection is a fill, never a border.** A selected card or chip gets `--tint-subtle` (split day cards, muscle chips). A selected toggle (a picker day, a `.weekday-btn`, the `Segmented` thumb) is solid `--tint` with `--on-tint` text. No coloured outline or left stripe, and "today" gets no extra border.
- **Small controls still have 44pt targets.** Compact buttons keep their look and get an invisible `::before` with `inset: min(0px, (100% - 44px) / 2)`. Dense picker grids and the muscle-map group chips are the exceptions, so a tap never lands on a neighbour.

## 3. No animations or transitions

The user's call (2026-11-11), superseding every earlier motion rule: **nothing in the app animates**, with exactly two exceptions the user brought back (same day):

- the Tasks Progress ring (`ProgressRing` in `app/components/charts.tsx`): the fill and the percentage ease from 0 to the value in 900 ms (`useAnimatedNumber(p, 0, 900)`);
- the Wishlist estimated total (`AnimatedNumber` in `app/wishlist/wishlist-client.tsx`): it counts up from 0 on entry and eases between values.

Both live in `app/components/animated-number.tsx`, which jumps straight to the value under `prefers-reduced-motion`. Nothing else uses it: the Tasks stat tiles, every other number, chart and list stay instant. Do not add a third animation without the user asking for it.

- No CSS `transition`, `animation` or `@keyframes`; no view or page transitions; no smooth scrolling.
- No JS-driven motion either, apart from the two exceptions above: no list enter, leave, move or fade, no height tweens, no modal or toast fade, no drag-sort glide, no chart or camera tween, no other counting numbers (WAAPI, `requestAnimationFrame` and timers included).
- Elements appear, disappear and change instantly: rows, modals, toasts, hover and press states, selected tabs, chart values, page changes.
- Hover fills still apply, at once, with no transition. A press changes nothing: no scale, no pulse (the user's call, 2026-11-12).
- Feedback comes from the toast and its Undo, not from motion.
- `prefers-reduced-motion` needs no handling beyond the two exceptions, which already honour it. If a new feature seems to need an animation, show the end state instead and tell the user.

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
        <ListBox wash className="entries ...">            (list)
          empty-note  |  rows
    <div className="dashboard-aside"> summary card
  <Modal> form: .form-stack labels, .error, .form-actions (Cancel secondary | Save)
```

- **Row markup:** `div.entry-row` containing:
  - the name (`strong`);
  - meta badges;
  - `.item-actions` with two `.delete-icon-btn` (`PencilIcon` 17, `TrashIcon` 17), with `aria-label` "Edit X"/"Delete X" and `title` "Edit"/"Delete". Reorder buttons use `ArrowUpIcon` / `ArrowDownIcon` 17 ("Move X up" / "Move X down"), never text arrows.
  - A card-level Edit in a section head is the icon-only `.delete-icon-btn.edit` (`PencilIcon` 17, `aria-label` naming the target: "Edit nutrition goals", "Edit water and goal") when it stands alone (Health Nutrition, Water and Steps). Beside another header button it is a `btn-sm tint` with `PencilIcon` 14 and "Edit", so the pair splits `1fr 1fr` like the Wishlist's sort and Add (Gym day card). The Gym day card keeps its `btn-sm tint` Edit on a rest day, where Start is hidden, so the header keeps one shape between days.
- **Header add button:** `button.btn-sm.tint` with `<PlusIcon size={14} />` and the label "Add item".
- **Navigation entry:** a new page adds itself to `navLinks` and its title to `getPageTitle()` in `app/components/navigation.tsx`, with an inline 24×24 stroke icon (strokeWidth 2, round caps and joins). The first four links are tabs on a phone; the rest go to More. A route without a title shows "Life Tracker".
- **State and handlers:** copy them from `references/lists-and-crud.md`:
  - `replace`, `openForm`;
  - `handleSubmit` (add and edit, each with Undo);
  - `putBack`, `dropRow`, `handleRemove`.

## 5. Copy (UI text)

- Toast messages:
  - `Added "X"`, with details in parentheses when useful;
  - `Saved "X"`;
  - `Removed "X"`;
  - `Renamed "X" to "Y"`; `Started "Push day"`, `Finished the workout`;
  - failures: `Failed to remove item`, `Failed to restore item`, `Failed to undo`, `Failed to undo the edit`.
  - every one of these toasts, except a failure, carries an Undo button.
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
- An empty note says exactly what is empty in the view shown: "Nothing planned for today." (Today tab), "No daily tasks yet." (Daily tab). An empty list always shows its note, so it never collapses.
- Long names wrap onto as many lines as they need. They are never cut off in a row.

## 6. Rejected: never do these again

Each of these was tried or proposed and the user removed it.

**Visual effects**
- Pulsing, scaling or "lift" on hover; any pulsing dot. The sign-in dot is static.
- Box shadows of any kind, including toasts, modals and cards.
- Visible borders and separator lines between rows.
- A blue page background (light blue, dark steel blue, Storm's blue-tinted greys). The user wanted the base black and grey (Graphite); blue is only the accent.
- A gradient mask over a list, or a shimmer. The `.skeleton` placeholder while data loads is static.
- **Any animation or transition** (rows, modals, toasts, charts, numbers, page changes, hover, camera) other than the Tasks progress ring, the Wishlist total count-up and the Nutrition number count-up. All the rest was removed on 2026-11-11.

**Layout and content**
- Scaling the page behind a modal. Blur it only.
- Bottom sheets.
- Placeholders in fields.
- Example or help notes, credits, and a "Life tracker" title on each page. The sign-in card has no "Local development session..." line either.
- A floating action button, or a command menu (⌘K) with shortcut hints. The add button sits in the card's title row.
- Hiding content on a phone. The aside cards stack under the main column, so phone and desktop have the same features.

**Features**
- A "buy" button and the green "bought" animation.
- Meal types (Breakfast, Lunch, Dinner, Snack) on Food, a "Recent workouts" tab on Gym, and adding shopping items from recipes: the shopping list is filled by hand only.

**Interaction and speed**
- A modifying action without an Undo in its toast (2026-11-11: every one has it, add and task done included).
- A "delete" of a category that cannot be undone: it reverts the moved items.
- A zero without the slash. It was tried; the user kept the slashed zero.
- Accent-coloured row stripes. They were replaced by the neutral grey wash.
- Hover highlight on rows. It was added, then removed.
- Price tags only as wide as their text. Asked at 13:32 on 2026-11-06, then reversed at 14:01: tags of one kind share one width.
- A focus ring after picking a sort option with mouse or touch. It appears only for keyboard use.

## 7. Checklist ("done" for every screen)

**Look**
- [ ] Only house parts and house classes. No new colours, radii, shadows or borders. Selection is a `--tint-subtle` fill, never a border.
- [ ] Monospace, tabular numbers, no placeholders, d.m.y dates via the date picker.
- [ ] Header controls are equal width. The total sits next to the title. The add button has a 14px plus.
- [ ] Rows are bands with no hover. Trailing buttons are 44×44, with an inset equal to the band-to-card gap.
- [ ] The empty note keeps one row's height. No layout shift when controls appear.

**Behaviour**
- [ ] No `transition`, `animation`, `@keyframes`, view transition, smooth scroll or JS tween anywhere, except the Tasks progress ring and the Wishlist total (`animated-number.tsx`).
- [ ] Every action that modifies something has an Undo button in its toast, and Undo restores the previous state. Server failures restore the screen and show a warning.
- [ ] A new server action has an authorization test (owner allowed, other user denied).

**Accessibility**
- [ ] Every hover rule is inside `@media (hover: hover)`. A press changes nothing (no scale).
- [ ] Focus ring: 2px tint, offset 2px, keyboard only. Targets are at least 44pt (`::before` with `inset: min(0px, (100% - 44px) / 2)` on small controls; picker grids excepted).
- [ ] `aria-label` on icon buttons, `aria-labelledby` on sections, `role=tablist` on segmented controls.
- [ ] Works with reduced transparency and increased contrast.

**Browser**
- [ ] Checked at 375px (no horizontal overflow, labels fit) and on desktop.
- [ ] Checked in Safari terms: no reliance on `sibling-index()` alone.

Sources: `app/wishlist/wishlist-client.tsx`, `app/globals.css`, `app/providers.tsx`, `app/components/{lists,modal,toast,segmented,charts,navigation}.tsx`, `app/layout.tsx`, and the user's design feedback from 2026-11-04 to 2026-11-06 (recorded in `docs/decisions.md`).
