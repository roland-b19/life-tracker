# Components: navigation, content and layout, presentation

When to read this: before building app-level navigation (tab bar, sidebar, split view), lists/tables/collections, search, scrolling containers, or anything that interrupts the user (sheet, alert, action sheet, popover, window). Rules are rewritten from Apple's HIG; platform tags appear only where a rule is platform-specific. "Liquid Glass" = the current Apple design language (floating, translucent control layer above content).

---

# Navigation

## Tab bars

When to use: top-level sections of the app. Not for actions (use a toolbar).

Rules:
- Use a tab bar for navigation only. Controls acting on the current view belong in a toolbar.
- Keep the tab bar visible while moving between sections; hiding it makes people lose their place. Exception: a modal covering it.
- Use as few tabs as the hierarchy needs; fewer is easier. For a complex structure, use a sidebar or a tab bar that converts to a sidebar.
- Avoid overflow: when width cannot fit all tabs, the trailing tab becomes "More" [iOS][iPadOS] and hidden tabs become hard to find.
- Never disable or hide a tab, even if its section is empty. Show the empty section with an explanation of why there is no content.
- Give every tab a label, one word where possible. Use SF Symbols for icons; prefer filled symbols. Compact width: icon above label; regular width: icon and label side by side.
- Badge (red oval, white number or exclamation point) only for critical new/updated info; overuse dilutes it.
- Do not give tab labels a color similar to the colorful content layer behind. With vivid content, prefer a monochrome tab bar or an accent color with clear contrast (Liquid Glass color).
- [iOS] The tab bar floats above content on a Liquid Glass background; content shows through. With an attached bottom accessory (Music's MiniPlayer) the bar can minimize on scroll-down and move the accessory inline; tapping a tab or scrolling to top restores it (TabBarMinimizeBehavior, UITabBarController.MinimizeBehavior).
- [iOS] A dedicated search tab can sit at the trailing end (see Search fields).
- [iPadOS] The tab bar sits near the top. Choose fixed (tabBarOnly) or convertible to a sidebar (sidebarAdaptable). Prefer a tab bar for navigation; allow customization when there are many sections (TabViewCustomization, UITab.Placement); default list of five or fewer to stay consistent between compact and regular sizes.
- [iPadOS] For a sidebar that can never become a tab bar, use a navigation split view, not a tab view.
- [macOS] No additional considerations. [watchOS] Not supported.
- [tvOS] Bar 68 pt tall, top edge 46 pt from screen top (fixed); translucent, selected tab opaque. Menu button returns focus to it. Live-viewing apps order tabs: live, recorded, other.
- [visionOS] Always vertical, floats fixed at the window's leading side; expands when looked at. Provide a symbol plus a short label for each tab. A sidebar inside a tab is fine for deep hierarchy, but sidebar selection must not change the active tab.

Numbers:
- tvOS tab bar height 68 pt, top offset 46 pt.
- Default customizable tab list: five or fewer.

Avoid: action buttons in a tab bar, hidden/disabled tabs, relying on the More tab, badges on non-critical items.

## Sidebars

When to use: navigation between areas of the app or top-level collections (folders, playlists), on the leading side. Needs lots of space; a tab bar is more compact.

Rules:
- Prefer a tab bar first on iPhone/iPad; the convertible sidebar-style tab view gives both (button switches between them, adapts to rotation and window resizing). You choose which appears at launch.
- [iOS][iPadOS] Sidebar-only: NavigationSplitView (primary pane) or UISplitViewController. UIKit non-SwiftUI appearance: UICollectionLayoutListConfiguration.Appearance.sidebar.
- Sidebars float above content in the Liquid Glass layer (iOS, iPadOS, macOS). Extend rich content beneath it by letting it scroll horizontally or with a background extension effect (backgroundExtensionEffect(), mirrors adjacent content under the sidebar).
- Let people customize sidebar contents and order when possible.
- Group with disclosure controls when there is a lot of content.
- Show at most two hierarchy levels. Deeper data: use a split view with a content list between sidebar and detail. Keep group titles short.
- Use SF Symbols; if custom, make a custom symbol rather than a bitmap.
- Sidebar icons use the app accent color by default. [macOS] People can change the system accent color and expect sidebar icons to follow it. Use fixed colors sparingly and with purpose (Mail's yellow VIP icon).
- Let people hide/show it with the platform gesture: iPadOS edge swipe; macOS toolbar button or View menu Show/Hide Sidebar. Do not hide by default (discoverability).
- [macOS] Row height, text and glyph size depend on small/medium/large sidebar size (settable in code, user-changeable in General settings). Consider auto-collapsing when the window shrinks. No critical info or actions at the bottom (windows are often moved so the bottom edge is hidden).
- [visionOS] Window usually expands to fit a sidebar; use inside a tab for secondary navigation, with the tab-selection caveat above.
- [tvOS] No additional considerations. [watchOS] Not supported.

Numbers: max two levels of hierarchy.

## Split views

When to use: several adjacent panes showing multiple hierarchy levels (sidebar, content list, detail), or supplementary panes (Keynote navigator, notes, inspector).

Rules:
- Persistently highlight the current selection in every pane leading to the detail view.
- Consider drag and drop between panes.
- [iOS] Use split views only in regular (not compact) environments; on iPhone portrait the panes would wrap or truncate.
- [iPadOS] Two or three vertical panes. Windows resize fluidly: design for narrow, compact, and intermediate widths and keep logical navigation between panes (NavigationSplitView, UISplitViewController).
- [macOS] Panes can be vertical, horizontal, or both, with draggable dividers (VSplitView, HSplitView). Set sensible min/max pane sizes so the divider never vanishes. Allow hiding a pane (e.g. to focus on editing) and provide several ways to reveal it (toolbar button, menu command with shortcut). Prefer the thin divider (1 pt); use thicker (NSSplitView.DividerStyle) only when strong lines on both sides make it hard to see.
- [tvOS] Good for filtering (filter in primary, results in secondary). Default 1/3 primary and 2/3 secondary; half-and-half available. One title above the whole split view, not per pane; center it if the secondary pane is a collection, put it above the primary pane if the secondary is one main view.
- [visionOS] Prefer a split view over a new window for supplementary info; use a sheet for a small required task.
- [watchOS] Shows either the list or a detail as a full-screen view. On launch show the most relevant detail (location, time, recent actions). Multiple detail pages: put them in a vertical tab view so the Digital Crown pages through them.

Numbers: macOS thin divider 1 pt; tvOS 33/67 default split or 50/50.

## Tab views

Scope: [macOS] tabbed pane control (NSTabView). Not supported on iOS, iPadOS, tvOS, visionOS; use a segmented control there for similar function. [watchOS] shown as page controls (TabView).

Rules:
- Use only for closely related content; panes are mutually exclusive and self-contained, so controls in a pane affect only that pane.
- Label each tab with a noun or short noun phrase, title-style capitalization.
- Do not switch tabs with a pop-up button (two clicks, choices hidden) unless there are too many panes.
- No more than six tabs; beyond that use pop-up button menu options.
- The tabbed control is at the top edge of the content area; it may be hidden when switching programmatically (then border can be none, bezel, or line).
- Inset a tab view with window-body margin on all sides; edge-to-edge is unusual.

Numbers: max 6 tabs.

---

# Content and layout

## Lists and tables

When to use: data in rows (one or many columns); hierarchy navigation (Settings), options, sortable multicolumn data.

Rules:
- Prefer text in lists/tables. For items of widely varying size or many images, use a collection.
- Allow editing/reordering when sensible. [iOS][iPadOS] People must enter edit mode before selecting rows.
- Selection feedback depends on purpose. Navigation table: keep the selected row persistently highlighted. Options table: brief highlight then a checkmark.
- Keep row text short to limit truncation and wrapping. For long text, list titles only and show content in a detail view. When truncating narrow text, a middle ellipsis keeps both start and end recognizable.
- Multicolumn tables: noun or short noun phrase headings, title-style capitalization, no ending punctuation. Single-column without a heading: add a label or header for context.
- Pick a style fitting data and platform: grouped style in iOS/iPadOS (headers, footers, extra space between groups), elliptical in watchOS (items roll off a curved surface), bordered with alternating rows in macOS (ListStyle). Pick a row style for your content (UIListContentConfiguration in iOS, iPadOS, tvOS).
- [iOS][iPadOS][visionOS] Info button (detail disclosure button) only reveals more info about a row; for drill-down navigation use the disclosure indicator accessory (UITableViewCell.AccessoryType.disclosureIndicator).
- [iOS][iPadOS][visionOS] No alphabetical index on a table whose rows have trailing controls such as disclosure indicators; both sit on the trailing side and get confused.
- [macOS] Click a column heading to sort; click again to reverse. Allow column resizing. Alternating row colors help wide tables. Use an outline view (not a table) for hierarchies.
- [tvOS] Focused rows grow slightly and may get rounded corners; check adjacent images and do not add your own corner masks.
- [watchOS] Limit rows; show the most relevant items plus a way to see more. Keep detail views short if you want vertical page-based swiping between details (scrolling details break it).

Avoid: long multi-line rows, a trailing index next to row controls, info button used for navigation.

## Collections

When to use: ordered sets of mostly image-based content in a row or grid (UICollectionView, NSCollectionView). Not supported in watchOS.

Rules:
- Use the standard row or grid layout; custom layouts confuse and draw attention to themselves.
- Use a table instead for text.
- Make items easy to hit: enough padding so focus or hover effects are visible and items do not overlap.
- Defaults: tap to select, touch and hold to edit, swipe to scroll. Add custom gestures only if needed.
- Animate insert, delete and reorder (standard or custom).
- [iOS][iPadOS] Be careful with dynamic layout changes: keep them understandable, avoid changing layout while people interact unless caused by an explicit action.

## Outline views

Scope: [macOS] only. Table-like view with disclosure triangles for hierarchical data (Finder).

Rules:
- Hierarchy appears in the first column only; other columns hold attributes.
- Use a plain table if the data is not hierarchical.
- Always give headings in multicolumn outlines (noun phrases, title case, no trailing colon); single-column: add a label.
- Sortable by heading; clicking the primary heading sorts at each level; clicking again reverses.
- Resizable columns; Option-click on a triangle expands all descendants; remember expansion state between sessions.
- Alternating rows for multicolumn; single-click to edit a cell, double-click can open; middle-ellipsis truncation; offer a toolbar search field for long outlines.

## Column views

Scope: [macOS] only (browser; Finder column view). For iPadOS/visionOS hierarchy use a split view.

Rules:
- Use for deep hierarchies navigated back and forth, when sorting is not needed.
- One column per level; root in the first column; parent items marked with a triangle; selecting a parent fills the next column.
- Show info/preview of the selected leaf item (Finder: creation/modification date, type, size).
- Let people resize columns.

## Boxes

Scope: grouping related content (not tvOS/watchOS).

Rules:
- Keep a box small relative to its container; a huge box stops communicating grouping.
- Group inside a box with padding and alignment, not nested boxes.
- Optional short title (sentence-style capitalization, no ending punctuation; in a macOS settings pane append a colon). Helps VoiceOver users.
- [iOS][iPadOS] Defaults to secondary and tertiary background colors. [macOS] Title shown above the box.

## Labels

Scope: static, selectable-but-not-editable text. SwiftUI: Label and Text.

Rules:
- Use a label for a small amount of non-editable text; a text field for small editable text; a text view for long text.
- Prefer system fonts; Dynamic Type is supported by default. Keep custom styling legible.
- Use the four system label colors for hierarchy:

| Role | Use | iOS/iPadOS/tvOS/visionOS | macOS |
|---|---|---|---|
| Label | primary info | label | labelColor |
| Secondary | subheading, supplemental | secondaryLabel | secondaryLabelColor |
| Tertiary | unavailable item/behavior | tertiaryLabel | tertiaryLabelColor |
| Quaternary | watermark | quaternaryLabel | quaternaryLabelColor |

- Make useful text selectable (error message, location, IP address).
- [macOS] Uneditable text via NSTextField.isEditable.
- [watchOS] Use system date and timer text components (auto-fit, auto-update), good in complications.

## Lockups

Scope: [tvOS] only. Content view plus header and footer scaling together on focus. Kinds: cards, caption buttons (tilt with swipe direction), monograms (circular photo plus name; prefer photo over initials), posters.

Rules:
- Leave space between lockups since focus enlarges them; keep sizes uniform within a row/group. APIs: TVLockupView, TVCardView, TVCaptionButtonView, TVMonogramContentView, TVPosterView.

## Disclosure controls

Rules:
- Hide details until relevant; put the most-used controls at the top, advanced ones hidden by default.
- Disclosure triangle: points inward from the leading edge when collapsed, down when expanded. Give it a descriptive label (e.g. "Advanced Options"). (NSButton.BezelStyle.disclosure)
- Disclosure button: points down when collapsed, up when expanded; place it next to the content it controls; at most one per view. (NSButton.BezelStyle.pushDisclosure)
- [iOS][iPadOS][visionOS] Use SwiftUI DisclosureGroup. Not supported in tvOS/watchOS.

## Search fields

When to use: search a collection of content by entered terms. A search field shows a Search icon, Clear button and placeholder; can use a scope bar and tokens.

Rules (all platforms):
- Placeholder text states what can be searched.
- Search as the user types, if feasible, refining continuously.
- Offer suggestions: recent searches before typing, predictive suggestions while typing.
- Put the most relevant results first; consider categorizing. Let people filter results (scope bar).
- Scope bar: filter among clearly defined categories (Mail iPhone: all mailboxes vs current). Default to the broader scope and let people narrow.
- Tokens: visual capsules for a term, selectable and editable as one unit; filter later terms (a contact in Mail, photos in Messages). Pair tokens with suggestions so people discover them. Related macOS component: Token fields.

[iOS] Three entry points: tab in tab bar, toolbar (bottom or top), inline.
- Search as a tab (stays available across sections). Two styles:
  - Standard tab: uniform with other tabs; opens a search landing page (suggestions, categories, discovery; Apple TV genres). Choose for rich content apps.
  - Button appearance: separate button; tap focuses the field and shows the keyboard at once, returns to the previous tab on exit. Choose for fast, transient search.
- Toolbar search: bottom toolbar as an expanded field or a button (animates into a field above the keyboard); top toolbar (navigation bar) as a button that animates into a field above the keyboard or at the top if no room at bottom.
  - Prefer bottom if there is room (Settings: only item; Mail and Notes: alongside other controls).
  - Prefer top when covering the bottom would hurt a primary function or there is no bottom toolbar (Wallet's pass stack).
- Inline field: next to the content it searches, when location defines scope or the app has several search fields (Music library filter). At top, put it above the list and consider pinning it to the top toolbar while scrolling.

[iPadOS][macOS] Behavior is similar; keep the experience consistent across both.
- Trailing side of the toolbar for common uses, especially split-view apps searching across columns (Mail, Notes, Voice Memos) and when results appear in the detail view (Freeform).
- Top of the sidebar when filtering sidebar content or navigation (Settings).
- As an item in the sidebar or tab bar for a dedicated discovery area (Music, TV). Focus the field immediately on arrival, except on iPad with only the virtual keyboard, where it would cover the view.
- Plan for resizing: the field resizes fluidly; in compact iPad views put search where contextually useful (Notes and Mail place it above the content list column).

[tvOS] Keyboard screen with results beneath (UISearchController); give popular, contextual, recent suggestions. [watchOS] Field opens full-screen text input until Cancel or Search.

---

# Presentation

## Sheets

When to use: a scoped task closely tied to current context (attach a file, choose a save location, supply a needed value) that finishes before returning to the parent view.

Anatomy:
- macOS, tvOS, visionOS, watchOS: always modal. [iOS][iPadOS] modal or nonmodal; a nonmodal sheet lets people act on the parent without dismissing (Notes text formatting).
- Buttons: Cancel/Close dismisses without saving; Done dismisses after completing or explicitly saving; Back goes to a previous step or parent view and is not for dismissing.

Rules:
- For long or complex flows use something else: full-screen modal (UIModalPresentationStyle.fullScreen) for video/photo/camera or multistep editing in iOS/iPadOS; new window or full-screen mode in macOS; Full Space in visionOS.
- One sheet at a time from the main interface. If a sheet needs another sheet, close the first, show the second, optionally re-show the first afterwards.
- Supplementary items affecting the main task: nonmodal sheet (iOS/iPadOS), panel (macOS), split view (visionOS).
- Never rely on Done alone: pair Done with Cancel or Back so people can leave without confirming. Do not show Cancel, Done and Back together.
- [iOS][iPadOS] Single-view sheet: Cancel on the leading edge of the top toolbar, Done on the trailing edge. Multi-step flows may vary per step.
- [iOS][iPadOS] Detents (resting heights): large (fully expanded, supported automatically) and medium (about half height); custom detents allowed. Only medium prevents full expansion. Use medium on iPhone for progressive disclosure (share sheet); skip it when content needs full height (Messages/Mail compose). API: detents.
- [iOS][iPadOS] Resizable sheets get a grabber (tap cycles detents, works with VoiceOver; prefersGrabberVisible).
- [iOS][iPadOS] Support swipe-down to dismiss. If there are unsaved changes, confirm with an action sheet.
- [iPadOS] Prefer page or form sheet presentation styles (default size, centered over dimmed background).
- [macOS] Card-like, rounded, floating over a dimmed parent. Use a sensible default size (support resizing when it helps). Opening brings the parent window forward (plus its modeless document panels), but people must be able to bring other app windows forward without dismissing the sheet. For repeated input-and-observe work (find/replace) use a panel.
- [visionOS] Floats in front of the parent, dimming it. Do not emerge from the bottom edge; center in the field of view. Default size should not cover most of the window; allow resizing.
- [watchOS] Full-screen view sliding over content, semitransparent with blurred, desaturated material. Only when you need a custom title or custom content; otherwise alert or action sheet. Keep brief and occasional, not for navigation. If you replace the default label use an SF Symbol; avoid text in the top-leading corner that looks like a page/app title, since people then will not know how to dismiss it.

## Alerts

When to use: critical information needed now: a problem, a warning before data loss, a confirmation of a purchase or other important user-initiated action.

Rules:
- Use sparingly. Each alert interrupts; show only essential information with useful actions.
- Do not use an alert for information alone; show it in context instead (Mail's connection indicator).
- No alerts for common, undoable actions, even destructive ones (deleting an email). Do alert for uncommon destructive actions that cannot be undone.
- No alert at app launch. Show cached/placeholder data with a non-intrusive explanation (e.g. offline label).
- Content: title, optional message, up to three buttons. Text field [iOS][iPadOS][macOS][visionOS] only when input is needed to resolve the situation (e.g. secure password field). Icon and accessory view [macOS][visionOS]. Suppression checkbox and Help button [macOS].
- Copy is direct, neutral, approachable; do not be oblique or accusatory, do not mask severity.
- Title says what happened, where and why, succinctly. Never "Error" or "Error 329347 occurred". Keep to two lines max. A full-sentence title uses sentence-style capitalization and ending punctuation; a fragment uses title-style and no punctuation.
- Add a message only if it adds value: short, complete sentences, sentence case. Do not explain what buttons do; if you must, say "choose" and cite the exact button title without quotes.
- Button titles: one or two words, verbs related to the text ("View All", "Reply", "Ignore"), title-style capitalization, no period. Use "OK" only in purely informational alerts; avoid Yes/No. Always "Cancel" for cancelling. Prefer specific titles ("Erase", "Delete", "Convert", "Clear") over OK.
- Button placement: the likeliest/default button on the trailing side of a row or at the top of a stack; Cancel on the leading side of a row or bottom of a stack.
- Destructive style only for a destructive action the person did not deliberately choose. When the alert merely confirms a deliberate choice (Empty Trash), do not mark that button destructive (Return should confirm it quickly).
- With a destructive action, include Cancel. Do not make Cancel the default. To force reading, make no button default. A lone default button should be "Done", not "Cancel".
- Provide alternative cancel routes: Esc or Command-Period on an attached keyboard (iOS, iPadOS, macOS, visionOS); Home Screen exit (iOS, iPadOS); Menu on the remote (tvOS).
- [iOS][iPadOS] Use an action sheet, not an alert, to offer choices about an intentional action (cancelling a Mail draft: delete, save, keep editing). Avoid alerts that scroll: short titles, message only when needed (large text sizes can force scrolling).
- [macOS] Shows the app icon by default (can supply another). Accessory view via accessoryView; repeating alerts can be suppressible. Use caution symbol (exclamationmark.triangle) sparingly, only when attention is truly needed (possible unexpected data loss), not for save or empty-trash style overwrite/remove.
- [visionOS] In the Shared Space the alert appears in front of the window, slightly forward on z, stays anchored if the window moves; in a Full Space it is centered in the field of view. Accessory view: max height 154 pt, corner radius 16 pt.
- [tvOS][watchOS] No additional considerations.

Numbers: up to 3 buttons; title at most 2 lines; visionOS accessory view 154 pt max height, 16 pt radius.

## Action sheets

When to use: modal choices related to an action the person started. SwiftUI: confirmationDialog (all platforms); UIKit: UIAlertController.Style.actionSheet (iOS, iPadOS, tvOS). Not supported in visionOS; no additional notes for macOS/tvOS.

Rules:
- Use an action sheet, not an alert, for choices tied to an intentional action. An alert is for unexpected problems or changes.
- Use sparingly.
- Title short enough for one line. Message only if needed.
- Include Cancel when the action may destroy data; place it at the bottom (upper-left on watchOS). SwiftUI confirmation dialogs add Cancel automatically.
- Destructive choices use the destructive style and sit at the top, where they are most noticeable.
- [iOS][iPadOS] Use an action sheet, not a menu, for choices following an action (a menu is what people expect when they ask to reveal one). Avoid scrolling: more buttons cost time and risk accidental taps.
- [watchOS] Title, optional message, Cancel plus buttons. Styles: Default, Destructive, Cancel. At most four buttons including Cancel (three extra choices).

Numbers: watchOS max 4 buttons.

## Popovers

When to use: transient view anchored to a control or area, for a small amount of info or a few related tasks (change an event's date); disappears after interaction.

Rules:
- Limit to a few related tasks; use when sidebars/panels would take too much space.
- Arrow points directly at the triggering element; the popover should not cover it or essential content.
- Close button (Cancel/Done) only for clarity, e.g. save vs discard. Otherwise it closes on outside click/tap or on item selection. If multiple selections are allowed, stay open until explicit dismissal or outside tap.
- Always save work when a nonmodal popover auto-closes; discard only on explicit Cancel.
- One popover at a time; never a cascade. Close the open one before showing another; nothing may appear above a popover except an alert.
- Let people switch from one popover to another in one click/tap (several bar buttons each opening one).
- Size to content plus arrow; animate size changes between condensed/expanded states.
- Do not use for warnings (easily missed or dismissed); use an alert. Do not write "popover" in help text; name the task instead.
- [iOS][iPadOS] Avoid in compact views; use a full-screen modal such as a sheet. Reserve popovers for wide layouts based on size class.
- [macOS] Can be detachable, becoming a panel when dragged; keep the detached panel looking nearly the same.
- [visionOS] No additional considerations. [tvOS][watchOS] Not supported.

## Panels

Scope: [macOS] only. A floating, supplementary window above other windows for controls/info about the active window or selection; can use a dark translucent HUD style. On other platforms present supplementary content in a modal view.

Rules:
- Use for quick access to relevant controls or inspector functionality (updates with selection). An Info window that keeps fixed content is a regular window, not a panel.
- Prefer simple adjustment controls (sliders, steppers) over typing or item selection.
- Short noun title (title-style capitalization): "Fonts", "Colors", "Inspector". It needs a title bar so it can be moved. In menus use "Show Fonts" (no word "panel").
- Bring all panels forward when the app becomes active; hide them when it is inactive. Keep panels out of the Window menu's document list. Usually no minimize button.
- HUD: prefer standard panels; use a HUD only in media-oriented apps, when a standard panel would hide essential content, or when it needs no controls (most system controls do not match HUD appearance; disclosure triangle is the exception). Keep one panel style across modes (full screen vs not), little color, small size, and do not cover what it adjusts. API: hudWindow.

## Windows

Scope: [iPadOS][macOS][visionOS]. Not supported in iOS, tvOS, watchOS. Primary window = main navigation and content; auxiliary window = one task or area, no navigation elsewhere, usually with a close button.

Rules:
- Adapt fluidly to any size (multitasking, multiwindow); see Layout and Multitasking.
- Open a new window only when it helps multitasking or context (Mail compose). Do not open windows by default; excessive windows add clutter. Offer "open in new window" via context menu or File menu (OpenWindowAction).
- Do not build custom window frames or controls; imperfect imitations feel broken.
- Call them "windows" in UI copy, not "scenes".
- [iPadOS] User picks in Multitasking & Gestures settings: Full screen (app switcher) or Windowed (freely resizable, size/placement remembered). Windowed controls sit at the toolbar's leading edge; move leading toolbar buttons inward. Consider a gesture (pinch) to open content in a new window (UIWindowScene.ActivationInteraction). Single-file viewing: QLPreviewSceneActivationConfiguration (needs multi-window support).
- [macOS] Window = frame (title/toolbar, controls; rarely a bottom bar) + body. States: main (frontmost; one per app), key (receives input; one on screen; sometimes a panel), inactive. Appearances differ (key shows color in close/minimize/zoom; inactive is gray and without vibrancy). System components update automatically; custom windows must follow system appearances for each state. Avoid critical content in a bottom bar (window may be moved off-screen at the bottom); use only for a little info tied to contents (Finder status bar); for more, use an inspector on the trailing side of a split view.
- [visionOS] Styles: default window (glass background, close button, window bar, resize controls; optional Share button, tab bar, toolbar, ornaments; dynamic scale), plain (no glass), volumetric (volume; 2D/3D from any angle; close button and window bar turn toward the viewer).
  - Window: keep the glass background; default 1280x720 pt, placed about 2 m away; initial shape suits content; set min and max sizes; minimal 3D depth (clipped beyond the surface; deeper content goes in a volume).
  - Volume: for rich 3D; dynamic scaling generally (fixed is default, fits real-world products); 2D content must read from multiple angles (attachments); keep the baseplate glow unless content is full bleed; at most one extra ornament, not on the toolbar/tab bar edge.

Numbers: visionOS window default 1280x720 pt, about 2 m in front.

## Scroll views

When to use: content larger than its view, moved horizontally or vertically. The scroll view itself has no appearance; a translucent indicator appears when scrolling (shows position near beginning/middle/end in iOS, iPadOS, macOS, visionOS, watchOS).

Rules:
- Support default scroll gestures and keyboard shortcuts. Custom scrolling must keep the elastic indicator behavior.
- Hint at scrollability: show partial content at the edge since indicators are not always visible.
- Do not nest scroll views of the same orientation. Horizontal inside vertical (or vice versa) is fine.
- Page-by-page scrolling when useful: define a page (usually view height/width) and subtract an overlap unit (a line of text, a row of glyphs, part of a picture) to maintain context (PagingScrollTargetBehavior).
- Scroll automatically only to restore context, and only as far as needed: revealing a new selection or insertion point, when typing begins where it is not visible, when the pointer drags past the edge during selection, or when someone scrolled away before acting on a selection (e.g. if part of a selection is visible, do not scroll all of it in).
- If zoom is supported, set sensible min and max scale.
- Scroll edge effects [iOS][iPadOS][macOS] (Liquid Glass): visual separation between floating bars and the content behind them. They are not decorative, do not darken or block like overlays; they keep controls distinct. Rules:
  - Prefer the automatic style (more opaque for top toolbars with many controls, text outside Liquid Glass controls, pinned table headers); if you choose soft, test legibility everywhere. Hard style is available.
  - Use only when a scroll view sits behind floating interface elements.
  - One effect per view; in split views on iPad/Mac each pane may have one, but keep their heights consistent.
  - Custom bars may need it added manually. APIs: ScrollEdgeEffectStyle, UIScrollEdgeEffect.Style, NSScrollEdgeEffectStyle.
- [iOS][iPadOS] With a page-by-page scroll view consider a page control (Weather); do not also show the scroll indicator on the same axis.
- [macOS] Indicator is a "scroll bar". In tight panels use small or mini scroll bars, same size for all controls in the panel.
- [tvOS] No scroll indicators; the system scrolls to keep focus visible.
- [visionOS] Small fixed indicator (trailing edge centered vertically, bottom edge centered horizontally), slightly thicker than iOS, so widen tight margins. Look-and-drag on it gives a jog-bar speed control. Look to Scroll (eyes only) is opt-in per view (ScrollInputKind): use for reading/browsing views, not dense or control-heavy lists; be consistent across similar views; full-width/height views or clear boundaries; remove parallax and scroll-driven effects first.
- [watchOS] Prefer vertical scrolling with the Digital Crown. For page-by-page use vertical tab views (page indicator near the crown; expands into a scroll indicator when a page is long). Prefer single-screen-height pages; put variable-height pages after fixed-height ones.

## Page controls

When to use: show position in a flat, ordered list of pages (dots; solid dot is current). Not for hierarchical or nonsequential relationships (use sidebar or split view). Not supported in macOS.

Rules:
- Center horizontally near the bottom of the view or window.
- Keep to about 10 dots or fewer; beyond that use a different arrangement such as a grid.
- Custom indicator images (preferredIndicatorImage, setIndicatorImage(_:forPage:)): only when it adds meaning (bookmark.fill for bookmark pages; location.fill for Weather's current location). Simple shapes only: no negative space, text or inner lines. At most two distinct indicator images. Do not color them; let the system color for contrast.
- [iOS][iPadOS] The control highlights the current dot and shrinks outer dots when more pages exist. Tap the leading/trailing side of the current dot for next/previous; scrub by dragging (iPadOS pointer can target a dot). Animate transitions for taps only, not while scrubbing (lag and flashes).
- [iOS][iPadOS] Background styles (backgroundStyle): Automatic (background only during interaction; when not the primary navigation), Prominent (always; when it is the primary navigation), Minimal (never; position only). Do not support scrubbing with Minimal.
- [tvOS] Use for full-screen pages that are peers; extra controls make focus hard to manage.
- [visionOS] Indicates pages but is not interactive.
- [watchOS] Bottom of screen for horizontal pagination, or beside the Digital Crown for vertical tab views (indicator shows position within a page and among pages). Prefer vertical pagination with distinct purposeful pages over horizontal paging or deep hierarchies; one screen height per page.

Numbers: about 10 dots max; at most 2 indicator image types.

## Image views

Rules:
- Use an image view when the sole purpose is showing an image. Normally non-interactive; for a tappable image, configure a system button with the image instead of adding button behavior.
- For icons, prefer SF Symbols or interface icons (template images with tintable pixels) over an image view; they pick up accent colors.
- Formats: PNG, JPEG, PDF, etc.
- Text over images: ensure strong contrast and use a shadow or background layer.
- Animated sequences: use one consistent size for all frames, prescaled to the view, for performance.
- [macOS] Editable image: image well (copy, paste, drag, Delete to clear). Clickable image: image button.
- [tvOS] Layered images with transparency create depth. [visionOS] 2D, stereoscopic and spatial photos; RealityKit: ImagePresentationComponent. [watchOS] Prefer SwiftUI animation; WatchKit via WKImageAnimatable.

## Text views

Rules:
- Use for long, editable or specially formatted multiline text; otherwise a label or text field.
- Leading alignment and system label color by default; scrolls when content overflows.
- Keep it legible: adopt Dynamic Type, test with accessibility options such as Bold Text.
- Make useful text selectable (error text, serial number, IP address).
- [iOS][iPadOS][visionOS] An editable view shows a keyboard on selection; [iOS][iPadOS] choose the keyboard type matching the content.
- [tvOS] Use text fields for editable text (input is minimal there).

## Web views

Rules:
- Support forward/back navigation (not default) with controls when people may visit multiple pages.
- Do not build a browser with a web view; brief in-context web access is fine, Safari is for browsing.
- [tvOS][watchOS] Not supported.

## Path controls

Scope: [macOS] only. Shows the path of a selected file or folder (two styles).

Rules:
- Use it in the window body (Finder's path bar is at the bottom of the body), not in toolbars or status bars.

## Token fields

Scope: [macOS] only. Text field converting entered text into tokens (Mail recipients). Tokens can be selected, dragged to reorder or move between fields; may suggest completions; may carry a context menu.

Rules:
- Add a context menu to tokens with options or info.
- Text becomes a token on comma by default; add other triggers (Return) when useful.
- Suggestions appear immediately by default; adjust the delay if it distracts typing.
- Tokens also represent search terms (see Search fields).

---

Sources: tab-bars, sidebars, split-views, tab-views, lists-and-tables, collections, outline-views, column-views, boxes, labels, lockups, disclosure-controls, search-fields, token-fields, path-controls, image-views, text-views, web-views, sheets, alerts, action-sheets, popovers, panels, windows, scroll-views, page-controls (https://developer.apple.com/design/human-interface-guidelines/<slug>)
