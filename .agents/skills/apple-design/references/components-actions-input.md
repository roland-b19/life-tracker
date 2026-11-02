# Components: actions, selection and input, status, charts

When to read this: before building any tappable control, bar, menu, form field, picker, progress/status indicator or chart (e.g. habit streaks, weight/spend graphs, goal progress in a tracker app). Rules are rewritten from Apple's HIG; platform tags appear only where a rule is platform-specific.

---

# Actions and menus

## Buttons

Rules:
- A button = style + content (symbol, text, or both) + role. Make its purpose instantly clear.
- Leave space around every button so it is visually distinct and easy to hit with finger, pointer, eyes or remote.
- Always give a custom button a press state; without one it feels unresponsive.
- Use a prominent style (accent-colored background) for the most likely action in a view. Keep prominent buttons to one or two per view.
- Distinguish the preferred choice among same-level options by style, not size. Equal-size buttons read as a coherent set; mixed sizes look inconsistent.
- Do not tint button labels a color similar to the content-layer background. If the content layer is bright and colorful, keep button labels in the default monochrome look (Liquid Glass color guidance).
- Pair familiar actions with familiar icons (e.g. `square.and.arrow.up` = share). Use text when a short label is clearer than an icon. Text labels: title-style capitalization, start with a verb ("Add to Cart").
- Roles: normal, primary (default button), cancel, destructive. Primary uses the accent color; destructive uses system red.
- Give the primary role to the button the user most likely picks, and wire it to Return; in sheets, editable views and alerts a primary button lets Return dismiss the view.
- Never give the primary role to a destructive action, even if it is the likely choice: people tap prominent buttons without reading.
- [iOS][iPadOS] For slow actions, configure the button to show an activity indicator, optionally with changed label ("Checkout" -> "Checking out..."); the indicator replaces the button image.
- [macOS] Push button is the standard type (text, symbol, image; can be default; tintable). Use flexible-height push button only for tall/two-line content. Append "..." to the title when the button opens another window/view/app. Consider spring loading (drag items over, force click).
- [macOS] Square (gradient) buttons: symbol-only, placed in or under the view they affect (add/remove rows), never in toolbars or status bars (use toolbar items there); no intro label.
- [macOS] Help button: system circular "?" button; at most one per window; open the topic for the current context (else help top level); lives in a view, never toolbar/status bar; no intro text. Placement: dialog with dismissal buttons: lower corner opposite them, vertically aligned; dialog without them, or settings window/pane: lower-left or lower-right.
- [macOS] Image button: in a view, not window frame; ~10 px padding between image and button edge (edges are the clickable area); avoid the system border; label goes below.
- [macOS][visionOS] A tooltip appears on hover/gaze; short phrase of what the button does.
- [visionOS] Buttons have a visible background; shapes: circle (icon only), rounded rectangle or capsule (text only), capsule (icon + text). Prefer circle/capsule (eyes drift to corners). In a vertical stack of text buttons prefer rounded rectangle; in a horizontal row prefer capsule. Hover effects are not customizable. Do not use white fill + black content (reserved for the toggled state). On a glass window use thin material fill; floating in space use glass material. Use standard controls to get audible feedback (no haptics in visionOS). Avoid small/mini buttons in rows/stacks.
- [watchOS] Inline buttons are capsules with a material background. Prefer full-width buttons for primary actions; if two share a row use equal heights and image or short-title content; keep one- and two-line buttons in a vertical stack the same height. Corner buttons go through a toolbar (Liquid Glass applied); toolbar buttons = navigation to related areas or contextual actions.

Numbers:
- Minimum hit region 44x44 pt; visionOS 60x60 pt.
- [visionOS] Sizes: mini 28, small 32, regular 44, large 52, extra large 64 pt. Keep button centers at least 60 pt apart; for buttons of 60 pt or larger add 4 pt padding around them.
- [macOS] Image button padding about 10 px; one help button per window.

Avoid: multiple prominent buttons per view; different sizes to rank options; primary role on a destructive button; icon-only buttons with obscure symbols; bright label color over bright content.

## Toolbars

Rules:
- A toolbar holds frequently used commands, navigation and search; it contains view title, navigation controls (back, forward, search field) and actions (buttons, menus). Tab bars are for switching app areas, not toolbars.
- Pick items deliberately to avoid crowding. Decide which items move to overflow as width shrinks. [macOS][iPadOS] The system adds the overflow menu automatically; do not add one manually and avoid layouts that overflow by default.
- Put lower-priority actions in a More menu; keep all actions visible if they fit.
- [iPadOS][macOS] Consider letting people customize the toolbar (apps with many or advanced items, long sessions).
- Liquid Glass: minimize custom toolbar backgrounds and tinted controls; let content layer drive color; use a `ScrollEdgeEffectStyle` if the bar needs separation from content. Do not tint item labels a color similar to the content background; in colorful content keep the monochrome default.
- Prefer standard components in bars: their corner radii are concentric with the bar corners. Custom components must also be concentric.
- Hide toolbars temporarily only for distraction-free modes, contextually, with a reliable way to restore them.
- Titles: give each window a useful title; do not use the app name; under 15 characters; empty is fine if redundant (e.g. Notes with one window).
- Navigation: use the standard Back and Close symbol buttons; do not use text labels "Back"/"Close". A custom version must look and behave the same and be used consistently.
- Actions: support main tasks, most likely/frequent first. Prefer simple recognizable symbols over text (text for things like Edit). Use system symbols without extra borders (the bar section is already the container).
- Use the `.prominent` style for key actions like Done or Submit (separates and tints it); only one primary action, on the trailing side.
- Grouping: three zones. Leading: back/close, sidebar toggle, then title, then optional document menu (Duplicate, Rename, Move, Export); not customizable. Center: common controls (customizable in macOS/iPadOS; collapses to overflow first); title may live here if not leading. Trailing: important items that stay visible at all sizes, inspector buttons, optional search field, More menu, primary action like Done.
- Group by function and frequency; put navigation and critical actions (Done, Close, Save) in their own visually distinct sections. Keep groupings consistent across platforms. Aim for at most three groups.
- Keep text-labeled actions separate from symbol actions and from each other with fixed space (`UIBarButtonItem.SystemItem.fixedSpace`), else labels blur together.
- [iOS] Only the most essential items in the main bar; rest in More. Use a large title (`prefersLargeTitles`): large at scroll top, collapses to standard while scrolling.
- [iPadOS] A toolbar and tab bar can share the top horizontal space.
- [macOS] Toolbar sits in the window frame (below or merged with the title bar); items have no bezel. Every toolbar item must also exist as a menu bar command (toolbar can be hidden/customized); not every menu item needs a toolbar item.
- [visionOS] Use the system toolbar (bottom edge, ornament-like, variable blur). Symbol or text per item; label revealed on gaze. No vertical toolbars (tab bars are vertical). Keep windows from shrinking below toolbar width. Offer contextual controls in modal states and restore standard controls afterwards. Avoid pull-down menus in the toolbar (can cover window controls).
- [watchOS] Toolbar buttons at top corners (`topBarLeading`, `topBarTrailing`) or bottom (`bottomBar`); a scrolling-content button (`primaryAction`) stays hidden until scrolling up; use it for an important but non-primary action (Mail's New Message).

Numbers: title under 15 characters; at most 3 groups.

Avoid: crowded bars, custom bar backgrounds/tints, app name as title, text "Back", bordered symbols, several primary actions.

## Menus

Rules:
- A menu reveals commands, options or states acting on the current selection or context. These label/organization rules apply to every menu type.
- Labels: succinct; actions start with a verb/verb phrase; title-style capitalization; drop articles (a, an, the). Add a symbol only when it clarifies; may show the keyboard shortcut.
- Show unavailable items dimmed and keep the menu itself openable even when all items are unavailable. (Contrast: context menus hide unavailable items.)
- Append "..." when the action needs more input before completing.
- Icons: use sparingly, with purpose; use the system standard icons for common actions (Share, Print, Search); for the most common actions, key features, file locations, devices, visual concepts (rotate, flip) and user content. Skip an icon if none clearly fits. Within a group: icons on all items or none.
- Organization: most important/frequent first; group logically related items with separators (even if they differ in importance, e.g. Paste and Match Style stays with Copy/Cut/Paste); watch length: split into menus or use a submenu; long is fine only for user-generated/dynamic content (history, bookmarks).
- Submenus: use sparingly; consider when a term repeats in more than two items of a group (one "Sort by" item with Date/Score/Time inside); one level only; more than about five items: make it its own menu; keep the submenu item available even if children are unavailable; use a submenu rather than indenting.
- Toggled items: either one item with a changeable label for the current state (Show Map/Hide Map), add a verb if ambiguous (Turn HDR On), or show both items when seeing both helps; use a checkmark for attributes in effect; offer a "Plain"-style item to clear multiple attributes.
- In-game menus: use the platform's default interaction; keep tap targets and fonts legible when scaling to a phone.
- [iOS][iPadOS] Three layouts (`preferredElementSize`): small = row of four symbol-only items above the list; medium = row of three symbol+short-label items above the list; large (default) = plain list. Use medium for three important frequent actions (Notes: Scan, Lock, Pin). Use small only for tightly related groups like Bold/Italic/Underline/Strikethrough, with recognizable symbols.
- [visionOS] Small or large layout; show the menu near the content it controls; breakthrough effect: prefer subtle (automatic picks subtle); prominent only if essential (may cause discomfort); none fully occludes behind 3D content.

Numbers: submenu about 5 items max, 1 level; small layout 4 items, medium 3 items.

## Context menus

Rules:
- Give quick access to actions directly related to an item without cluttering the UI. Hidden by default: revealed by touch-and-hold / pinch-and-hold (iOS, iPadOS, visionOS), Control-click or secondary click (macOS, iPadOS).
- Include only relevant, likely-needed commands; no advanced/rare ones (Mail message menu: reply, move; not edit content or manage mailboxes). Keep it short.
- Support context menus consistently across the app.
- Every context menu command must also be reachable in the main interface (toolbar, menu bar).
- Submenus: one level max, with an intuitive title.
- Hide unavailable items, do not dim them (macOS exception: Cut/Copy/Paste may appear unavailable).
- Put the most frequent items where the eye lands first: people read from the side nearest the touch point; reverse item order when the menu opens above vs below.
- Show keyboard shortcuts in main menus, not in context menus.
- Separators: at most about three groups.
- [iOS][iPadOS][visionOS] Put destructive items (Delete, Remove) last and mark them destructive (red text).
- Usually no title; add one only when it clarifies the effect (e.g. count of selected messages).
- Use the system icons for Copy, Share, Delete etc.
- [iOS][iPadOS] Provide a context menu or an edit menu for an item, not both. May show a preview of the item (prefer a graphical condensed preview; adjust the clipping path/rounded corners so the shape does not jump during the animation). [iPadOS] A context menu on empty space can create a new object (Files: new folder).
- [visionOS] Prefer a context menu over an extra panel/inspector window for frequent functions; keep height at or below window height (window controls sit above/below).

Avoid: showing both context and edit menu; rare commands; context menu as the only access path.

## Pull-down buttons

Rules:
- A pull-down button opens a menu of items or actions tied to the button's purpose (Add -> choose type; Sort -> choose attribute; Back -> choose destination). The menu closes after a pick and the action runs.
- Use a pop-up button instead for mutually exclusive non-command choices.
- Do not put all of a view's primary actions in one pull-down; they must be discoverable.
- List at least three items (one or two: use buttons, toggles or switches). Too many slows scanning.
- Add a menu title only if it adds meaning.
- Mark destructive items (red text). Picking one shows an action sheet (iOS) or popover (iPadOS) to confirm.
- Add an SF Symbol after the label if it adds value.
- [iOS][iPadOS] A More (ellipsis) pull-down is fine for secondary items, but it hurts discoverability; weigh that. A button can also reveal a menu on touch-and-hold (Safari Tabs button). `showsMenuAsPrimaryAction` makes a tap open it.
- Not in tvOS/watchOS; avoid in visionOS toolbars.

## Pop-up buttons

Rules:
- Displays a flat list of mutually exclusive options; after choosing, the button shows the current selection. Use a pull-down for actions, multi-select or submenus.
- Provide a sensible default (the most common choice).
- Let people predict the options without opening it: an intro label or a descriptive button label.
- Good when space is tight and options need not always be visible.
- Optionally include "Custom" for rare extra options, with explanatory text below the list.
- [iPadOS] In a popover or modal, a pop-up button can replace a disclosure indicator for a small well-defined option set (choose inline, no detail view).
- Not supported in tvOS/watchOS. API: SwiftUI `Picker` menu style, UIKit `changesSelectionAsPrimaryAction`.

## Activity views (share sheet)

Rules:
- The share sheet (sheet or popover) lists sharing targets and actions (Copy, Print) for the current item. Open it from the system Share button only; no alternative trigger for the same thing.
- Do not duplicate system actions (no second Print). A similar app-specific action gets a distinct title ("Print Transaction").
- Custom activities: SF Symbol preferred; custom icon centered in about 70x70 px. Title: single verb or brief verb phrase, no company/product name (share activities show the company name under the icon).
- You cannot reorder system activities but can exclude irrelevant ones and choose which custom ones show.
- Share/action extensions: prefer the system composition view for share; for action extensions include your app name and some app UI; keep interaction to a few steps; do not put a modal above the extension (alerts excepted); use an app image/symbol; run long tasks in the background and show status in the main app; notify only on problems, not on completion.
- Supported iOS, iPadOS, visionOS only (macOS has share/action extensions via Share button, context menu, toolbar).

## Edit menus

Rules:
- The system edit menu applies to selected content (text, images, files, contact cards, charts, map locations) with Copy, Select, Translate, Look Up; iOS/iPadOS/visionOS detect data types and add actions (address -> Get directions).
- [iOS] Compact horizontal bar on touch-and-hold or double-tap; chevron expands to a context menu. [iPadOS] Compact for touch, vertical context menu for keyboard/pointer, so support both. [macOS] context menu and Edit menu. [visionOS] pinch-and-hold, bar or context menu.
- Prefer the system edit menu and the standard reveal gestures; no custom interaction.
- Show only relevant commands (no Copy/Cut with no selection; no Paste with empty clipboard); remove or dim irrelevant ones.
- Put custom commands near related system ones (custom format commands after system format commands), few, with short verb labels.
- Let people select and copy non-editable content text (captions, statuses), not control labels.
- Support undo and redo (no confirmation in edit menus).
- Do not duplicate edit commands with other controls. Distinguish Delete (like the Delete key) from Cut (copies to pasteboard first).
- [iOS][iPadOS] You may move the menu to keep it from covering key content; you cannot change its shape or pointer.
- Not in tvOS/watchOS.

## Home Screen quick actions

Rules:
- [iOS][iPadOS] Menu shown on touch-and-hold of the app icon (also lists remove app / edit Home Screen). Each action: title, icon (left or right depending on icon position), optional subtitle; text left-aligned in LTR languages.
- Provide at least one useful action; maximum four total.
- Only compelling high-value tasks. Dynamic quick actions are fine (recent conversations, location, time of day) but changes must be predictable.
- Title: short, states the result ("New Message"); subtitle for context (e.g. unread state); no app name; avoid truncation; localize.
- Icon: SF Symbols preferred; custom icons use the Quick Action Icon Template from Apple Design Resources. No emoji (they are full color; quick-action icons are monochrome and adapt to Dark Mode).
- Not available on macOS, tvOS, visionOS, watchOS.

## Dock menus

- [macOS] Secondary-click on the Dock icon. Label and group items as in Menus. Every custom Dock item must also exist in the menu bar or UI. Prefer high-value items: open/recent windows, and actions useful with no open window (Mail: Get New Mail, Compose). Not supported elsewhere.

## Ornaments

- [visionOS] A control/info plane floating slightly in front of a window, on any edge, moving with the window; toolbars, tab bars and video controls are built from ornaments. Use for frequently needed controls in a consistent place; generally keep it visible (may hide during immersive content such as video/photo); limit the count to protect visual balance; keep width at or under the window width; borderless buttons are fine on its glass background (hover effect applied automatically); prefer system toolbars/tab bars. Not supported elsewhere.

## The menu bar

- [macOS][iPadOS] Standard menu order: AppName, File, Edit, Format, View, app-specific menus (most general to most specific, mirror the app's hierarchy), Window, Help. macOS adds the Apple menu (leading) and menu bar extras (trailing).
- Support the standard menus, their order and standard shortcuts; define custom shortcuts only when needed. Always show the same items; disable rather than hide unavailable ones. Prefer one-word menu titles (title-style if several words). Use system icons.
- App menu: About first (alone in group; short name, 16 characters or fewer, no version), Settings... (app-level only), custom app items after Settings, Services/Hide/Hide Others/Show All (macOS), Quit. Option turns Quit into Quit and Keep Windows.
- Standard menu contents (open the page for full tables): File = New, Open, Open Recent (names not paths, latest first), Close, Save (autosave), Duplicate (prefer over Save As/Export), Rename, Move To, Export As, Print. Edit = Undo/Redo (name the target), Cut, Copy, Paste, Delete (not Erase/Clear), Select All, Find, Spelling, Substitutions, Dictation, Emoji & Symbols. View = show/hide toolbar/sidebar/tab bar (titles reflect state), Customize Toolbar, full screen; provide View even if it only holds full screen. Window = Minimize, Zoom, Bring All to Front, open windows alphabetical; provide it even for one window. Help = app Help plus few extras.
- Dynamic items (modifier-changed, single modifier only) must never be the only path; use them in the menu bar only.
- [iPadOS] Hidden until pointer at top edge or swipe down; centered; no Apple menu, extras, About/Services/visibility items. Do not make the menu bar the only way to reach a function (it is hidden in full screen, and dynamic items need a hardware keyboard). Settings item opens the app's page in iPadOS Settings; link internal prefs in a separate item below it. For tab navigation, add tabs to View with key bindings. Group items into more submenus than on Mac (taller rows).
- [macOS] Menu bar extra: icon for app functionality while the app runs (`MenuBarExtra`).

---

# Selection and input

## Toggles

Rules:
- Choose between two opposing states (on/off). If the task is choosing from a list or other actions, use another component (pop-up button).
- Make clear what the toggle affects (context or label). A button used as a toggle uses a purposeful icon and changes its background by state.
- State difference must be obvious (fill, shape, checkmark/dot); never color alone.
- [iOS][iPadOS] Use the switch style only in a list row (row text is the label). Default green is usually right; if you change it, keep enough contrast against the off appearance. Outside a list use a toggle button (Phone's filter button gets a blue highlight when active); no explanatory label on it, the icon and background states carry meaning (`changesSelectionAsPrimaryAction`).
- [macOS] Switch, checkbox, radio buttons: use in the window body, not toolbar/status bar. Switch for emphasized settings or groups of settings; mini switch in grouped form rows (matches control height; regular for the parent, mini for children); do not replace an existing checkbox with a switch.
- [macOS] Checkbox: empty/check/dash (mixed); title on trailing side; use for hierarchies (align on leading edge, indent), single on/off setting; mixed state when subordinate boxes differ; intro label for a group if unclear, baseline aligned with first box.
- [macOS] Radio buttons: groups of two to five mutually exclusive choices; more than about five: pop-up button; multi-choice: checkboxes; keep horizontal spacing consistent (longest label); avoid mixed state.

## Pickers

Rules:
- Pickers show scrollable lists of values; good for medium-to-long lists. Short list: pull-down button. Very large set: list or table (tables can have an index).
- Make values predictable and ordered (e.g. alphabetical) because most are hidden.
- Show the picker in context (bottom of window or popover); do not switch views for it.
- Date picker minutes default to 60 values; you can use a larger interval if it divides 60 (0/15/30/45).
- [iOS][iPadOS] Date picker styles: compact (button showing value in accent color, opens a modal editor; confirm by tapping outside), inline (time only: wheels; date/time: calendar), wheels (also supports keyboard entry), automatic. Modes: date, time, date and time, countdown timer (hours and minutes up to 23:59; not in inline/compact). Use compact when space is tight. Values depend on locale.
- [macOS] Textual style for tight space and specific entry; graphical style for calendar browsing, ranges, clock face. `NSDatePicker`.
- [watchOS] Wheels style driven by the Digital Crown; longer lists collapse into a navigation link button. [tvOS] SwiftUI `Picker`.

## Segmented controls

Rules:
- A linear set of two or more equal-width segments, each a button. Single choice (macOS: also multiple), or momentary actions (Reply/Reply all/Forward; `isMomentary`).
- Use for closely related choices affecting an object, state or view; keeps grouping at any size and shows selection clearly.
- Do not mix selection segments and action segments in one control.
- Limit segments: about 5 to 7 in wide UI, about 5 on iPhone.
- Keep segment widths and content sizes consistent. Use text or images, not both mixed. Labels: nouns or noun phrases, title-style capitalization; no intro text needed for text labels.
- [iOS][iPadOS] Good for switching between closely related subviews (Calendar's event/reminder). Switching between separate app sections: tab bar.
- [macOS] Intro text or labels below segments when using icons; tooltips per segment; for main-area view switching use a tab view (segmented control is OK in a toolbar or inspector); consider spring loading.
- [tvOS] Prefer a split view for filtering; keep other focusable elements away (segments select on focus). [visionOS] Icon segments show a tooltip on gaze. Not in watchOS.

## Sliders

Rules:
- Horizontal track + thumb between min and max; the filled track runs from min to thumb; optional min/max icons.
- Customize track color, thumb, tint and end icons when it adds meaning (small/large image icons for an image-size slider).
- Min at leading side, max at trailing (horizontal); min at bottom, max at top (vertical).
- For wide ranges pair with a text field and a stepper to show and enter exact values.
- [iOS][iPadOS] Do not use a slider for audio volume; use the volume view (slider plus output route control).
- [macOS] Tick marks aid precision; label min/max at least (periodic labels for nonlinear scales); tooltip with thumb value on hover; live feedback while dragging; intro label with sentence-style capitalization and a colon. Circular sliders for repeating or unbounded values (rotation 0-360, or 1440 degrees = four spins); linear for fixed start/end.
- [visionOS] Prefer horizontal sliders. [watchOS] Discrete steps or continuous bar with +/- buttons by default (custom glyphs allowed). Not in tvOS.

## Steppers

Rules:
- A two-segment increment/decrement control; it shows no value, so put it next to a field showing the value and make clear what it changes.
- Good for small adjustments; pair with a text field when values vary widely (copies to print).
- [macOS] Support Shift-click for larger steps (e.g. 10x the increment).
- Not in watchOS/tvOS.

## Text fields

Rules:
- For small, specific text (name, email). Use a text view for larger text.
- Placeholder hint ("Email") disappears on typing, so also provide a separate label.
- Use secure fields (`SecureField`) for passwords and sensitive data.
- Size the field to the expected input. Space multiple fields evenly, stack vertically with consistent widths where possible; keep a logical focus/tab order.
- Validate when it makes sense: email on moving to another field; username/password before leaving the field. Use number formatters for numeric input (decimals, percent, currency) and do not assume presentation: it varies by locale.
- Line handling: clip by default, or wrap by character/word, or truncate (beginning/middle/end with ellipsis). Expansion tooltip for clipped text (pointer platforms).
- [iOS][iPadOS][tvOS][visionOS] Show the keyboard type that fits the content (numbers, URL, email).
- [iOS][iPadOS] Show a Clear button at the trailing end. Images/buttons in the ends: leading = field purpose, trailing = extra features (e.g. bookmarks).
- [macOS] Combo box when text input is paired with a list of choices.
- [tvOS][watchOS] Minimize text entry; offer options/buttons instead.

## Virtual keyboards

Rules:
- Choose a keyboard type that matches the content (`keyboardType`, `textContentType`; UIKit `UIKeyboardType`, `UITextContentType`); semantic types also improve autocorrect. Virtual keyboards do not support shortcuts.
- Customize the Return key (`submitLabel`, `UIReturnKeyType`) when it clarifies (e.g. Search).
- Custom input view (replaces the system keyboard in your app): only when it clearly helps data entry (Numbers' numeric view); users must understand why; play the standard key click (`playInputClick()`). Users can mute keyboard sounds in Settings > Sounds.
- Custom keyboard extension [iOS][iPadOS][tvOS]: systemwide only; not available in secure text and phone number fields; provide an obvious way to switch keyboards (Globe key convention); do not duplicate system Globe/Emoji and Dictation keys; offer a tutorial in your app, not inside the keyboard.
- [iOS][iPadOS] Use the keyboard layout guide (`UIKeyboardLayoutGuide`) so the keyboard integrates with your layout and key content stays visible. Controls above the keyboard (input accessory view or toolbar placement) must be relevant to the task; apply Liquid Glass to them when other views use it or they look out of place (a standard toolbar adopts it automatically); use standard padding.
- [tvOS] Linear keyboard with Siri Remote, grid with other devices; digit-specific keyboard for digit entry views. [visionOS] Separate movable window; ignore its position in layouts. [watchOS] Keyboard on larger screens, else dictation/Scribble; you cannot change keyboard type but set content type; paired iPhone can be used for input. Not in macOS.

## Color wells

- Tap/click opens a color picker. Prefer the system color picker (familiar, saved colors shared across apps, same on iOS/iPadOS/macOS). [macOS] Active well highlights; supports drag and drop of colors between wells and from the picker. Not in tvOS/watchOS.

## Combo boxes

- [macOS] Text field + pull-down list; custom entries are not added to the list. Default to a meaningful list value (not necessarily first), add an intro label (title-style with colon), keep items no wider than the field, offer relevant choices. Not on other platforms.

## Digit entry views

- [tvOS] Full-screen PIN entry with a digit keyboard. Use secure digit fields (asterisks) for sensitive data; state the purpose in title/prompt. Not elsewhere.

## Image wells

- [macOS] Editable image view: select to copy/paste/delete; drag in an image without selecting. Revert to the default image when cleared if one is required; keep standard Copy/Paste items and shortcuts available. Not elsewhere.

---

# Status and progress

## Progress indicators

Rules:
- Show the app is not stalled during loading or long tasks; transient (only while the operation runs).
- Determinate (known duration; bar fills leading to trailing, circular fills clockwise) vs indeterminate (spinner; macOS also has an indeterminate bar). SwiftUI `ProgressView`.
- Prefer determinate when possible; report advancement accurately and even out pacing (do not show 90 percent in 5 seconds then 5 minutes for the last 10 percent).
- Keep the indicator moving; if the task stalls, say why and what people can do.
- Switch indeterminate bar to determinate when duration becomes known; never switch from the spinner style to the bar style.
- Add a description only if it adds specific context (avoid vague "loading", "authenticating").
- Place it consistently. Offer Cancel when stopping is safe; add Pause too when stopping loses progress (partial download); warn with an alert (confirm cancel or resume) when canceling loses progress.
- [iOS][iPadOS] Refresh control (`UIRefreshControl`): hidden until pull-down on a list; still update content automatically on a schedule; title only if valuable (e.g. last updated time), never "pull to refresh" instructions.
- [macOS] Prefer a spinner for background operations or small spaces (inside a field, next to a button); no label on a spinner.
- [watchOS] White over the scene background by default; set tint color to change.

## Gauges

Rules:
- Shows a value within a range on a circular or linear path. Standard style: indicator at the value; capacity style: fill up to the value. Accessory variants (circular/linear, standard/capacity) mirror watchOS complications and suit iOS Lock Screen widgets.
- Write short labels for the current value and both range ends (VoiceOver reads visible labels).
- A gradient along the path can convey meaning (hot-to-cold).
- [macOS] Level indicator: capacity (discrete or continuous; use continuous for large ranges), rating, relevance (rare). Fill is green by default; change color at meaningful thresholds or use tiered state with several colors. SwiftUI `Gauge`, AppKit `NSLevelIndicator`. Not in tvOS.

## Activity rings

Rules:
- Only for Move, Exercise and Stand progress of one person, with a label/photo/avatar showing whose. Not for any other data, decoration, branding, app icon or marketing, and not as imitation ring elements for other data.
- Never alter appearance: no color changes, filters or opacity; always on black; prefer enclosing in a circle by rounding the container (not a circular mask); keep black visible around the outer ring (thin black stroke if needed, no gradient/shadow/effects); scale sensibly; adapt the surroundings, not the rings.
- Related labels/values use the matching ring colors. Keep an outer margin at least equal to the gap between rings, nothing may overlap it.
- Set other ring-like elements apart with padding, lines, labels, color or scale.
- Do not send notifications that repeat the Activity app's, and do not show rings in notifications.
- [iOS] `HKActivityRingView`: three rings with paired Apple Watch, only the Move ring (approximation from steps and other apps' workouts) without one. [watchOS] always three. Not in macOS/tvOS/visionOS.
- (note) For a life tracker, do not clone these rings for Gym/Health goals; use a custom ring style that is visibly different, or a gauge/progress view.

## Rating indicators

- [macOS] Row of symbols (stars by default) showing a rank; shows whole symbols only (rounded), fixed spacing. Let people change ranks inline in lists; a custom symbol must clearly read as a rating. Not supported on iOS/iPadOS/others (note: build a custom control there). `NSLevelIndicator.Style.rating`.

---

# Charts

## Charts

Rules (anatomy):
- A chart maps series of data values to marks (bar, line, point) in a plot area via scales (value to position/height/color). Context comes from axes (ticks, grid lines), labels, titles, subtitles, annotations, a legend (for non-positional encodings like color/shape) and accessibility labels. Swift Charts is the framework.
- Highlight a few key insights, not everything; state the main message in a title/subtitle (e.g. Weather's precipitation summary).

Rules (marks):
- Bar: compare categories or part-to-whole; for time, best when each bar is a sum (steps per day).
- Line: change over time; slope shows magnitude and trend.
- Point: individual values, relationships between two properties, outliers and clusters.
- Combine types when it adds clarity (line plus points to show both trend and individual values).

Rules (axes):
- Fixed range when min and max are meaningful for all data (battery 0 to 100 percent); dynamic range when values vary widely (Health Steps: top tracks the max in the period).
- Choose the lower bound per mark type and use: zero baseline for bars (heights compare honestly); a non-zero baseline can be better where meaningful differences sit far from zero (heart rate).
- Use familiar tick sequences (0, 5, 10), not odd ones (1, 6, 11).
- Tune grid line and label density to context: if people can inspect points by interaction, use fewer grid lines and lighter labels so the data dominates; too many lines overwhelm, too few prevent estimating.

Rules (layout and hierarchy):
- Data is the most prominent layer; titles, axes, labels support without competing.
- In compact spaces maximize plot width: shorten vertical-axis labels, move units into the title, place long category names inside the plot area if nothing important is hidden.
- Align the chart with surrounding views (leading edge); trailing-side grid labels and a trailing Y axis keep a clean leading edge; anchor stray labels with ticks.

Rules (interaction):
- Allow exploration but never require it to reveal critical info (Stocks: line chart; drag a vertical indicator to read a value).
- Enlarge hit targets when marks are small: make the whole plot area the target and let people scrub across.
- Make interactive charts navigable with keyboard, full keyboard access and Switch Control: define a logical path (e.g. along the X axis via `accessibilityRespondsToUserInteraction(_:)`) and/or let focus move among subsets for large datasets.
- Highlight changes to marks or axes beyond animation (animation alone misses VoiceOver users and people who disable motion): post accessibility notifications (`UIAccessibility.Notification` / `NSAccessibility.Notification`).

Rules (color):
- Never rely on color alone to separate series or convey critical info; add shapes or patterns (Health uses two point shapes for blood pressure's two components).
- Add visible separation between touching colored areas (separators in stacked bars).
- Follow Inclusive color guidance.

Rules (accessibility, required for every chart):
- Support VoiceOver; Swift Charts gives default Audio Graphs (tones for values and trend) and a default accessibility element per mark or mark group. Customize with a chart title and descriptive summary.
- Without Audio Graphs, supply an overview: chart type (bar/line), what each axis represents, upper and lower axis bounds.
- A chart needs labels per important/interactive element, not one label like an image. Choose granularity from purpose: per-bar for exact values (Health Steps), summarized segments for shape (Maps elevation); one summary label for a small chart used as a button that opens a detailed one.
- Labels: include context (date, location) with the value but not what axis names/overview already say; no subjective words ("rapidly", "gradually", "almost"), use actual values; avoid ambiguous formats/abbreviations ("June 6" not "6/6"; "60 minutes" not "60m"); say what series represent, not their colors; refer to axes in a consistent order (e.g. X first).
- Hide visible axis/tick labels from assistive tech (the mark labels and Audio Graphs carry the info).
- [watchOS] Avoid complex chart interaction; show at-a-glance info, leave detail views and exploration to the iPhone version.

(note) Tracker practice following these rules: bar charts for per-day sums (steps, spend, workouts) with a zero baseline; line plus points for trends (weight, sleep); a fixed 0-100 percent axis for goal completion; Health-like dynamic ranges for open-ended totals; a scrubbing plot area with a value readout; text title/subtitle stating the takeaway ("Spent 12 percent less than last month"); every chart with an accessibility summary.

---

Sources: buttons, toolbars, menus, context-menus, pull-down-buttons, pop-up-buttons, activity-views, edit-menus, home-screen-quick-actions, dock-menus, ornaments, the-menu-bar, toggles, pickers, segmented-controls, sliders, steppers, text-fields, virtual-keyboards, color-wells, combo-boxes, digit-entry-views, image-wells, progress-indicators, gauges, activity-rings, rating-indicators, charts. Full pages: https://developer.apple.com/design/human-interface-guidelines/<slug>
