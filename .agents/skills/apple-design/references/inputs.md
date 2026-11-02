# Inputs: gestures, keyboard, pointer, pencil, focus, hardware buttons

When to read this: any time you decide how people operate the UI beyond a plain tap: swipe/drag/long-press actions, custom gestures, keyboard shortcuts and Full Keyboard Access (iPad, Mac, web with hardware keyboard), mouse/trackpad hover and pointer behavior, Apple Pencil and handwriting, focus rings and keyboard navigation, plus short notes on Action button, Camera Control, Digital Crown, motion sensors, game controls, visionOS eyes, tvOS remotes. Core principle across all pages: every action must be reachable in more than one way, and standard inputs must keep their standard meaning.

---

## Gestures

Rules:
- Always provide a non-gesture path to every action (voice, keyboard, Switch Control, visible button). Never assume a given gesture is usable.
- Keep standard gestures meaning what the system says. Do not give tap/swipe an app-unique action; do not invent a new gesture for a standard action (activate a button, scroll a long view).
- Respond immediately while the gesture is in progress: feedback must let people predict the result and show how far to move to complete it (direct manipulation).
- When a gesture is unavailable (locked object, disabled button), show it clearly; otherwise people think the app froze or they did it wrong. Disabled state must look distinct from enabled.
- Custom gestures: only for specialised, frequent tasks that no standard gesture covers (games, drawing). A custom gesture must be discoverable, easy to perform, distinct from other gestures, and never the only way to do an important action. Teach it in-app; if you cannot describe it in simple words and a simple graphic, it is too hard.
- Shortcut gestures supplement, never replace, the visible control. Example: keep the Back button in the top toolbar even if you also support an edge swipe to go back.
- Do not collide with system-UI gestures (watchOS edge swipe, visionOS palm-roll overlays, iOS/iPadOS edge and system gestures). Only games/immersive experiences may defer system gestures, and only in specific circumstances.
- (note) For iOS apps this means: no custom horizontal pan starting at the screen's left edge (system back swipe), none from the bottom edge (Home/app switcher), none from the top edge (Notification/Control Center); design swipe actions inside rows, not on the screen margin.
- [iOS/iPadOS] Allow simultaneous recognition of multiple gestures only when it helps; mostly useful in games (joystick plus fire button operated together).
- [iOS/iPadOS] For Pencil plus touch interplay see the Apple Pencil section.

Standard gestures (all platforms unless noted):

| Gesture | Platforms | Expected action |
|---|---|---|
| Tap | iOS, iPadOS, macOS, tvOS, visionOS, watchOS | Activate control, select item |
| Swipe | all | Reveal actions/controls, dismiss views, scroll |
| Drag | all | Move a UI element |
| Touch (or pinch) and hold | all | Reveal extra controls/functionality (context menu) |
| Double tap | all | Zoom in; zoom out if already zoomed; open item on touch Mac; primary action on Apple Watch Series 9+/Ultra 2+ |
| Zoom (pinch) | all but watchOS | Zoom/magnify |
| Rotate | all but watchOS | Rotate selected item |

Additional iOS/iPadOS system gestures people expect:

| Gesture | Action |
|---|---|
| Three-finger swipe left / right | Undo / redo |
| Three-finger pinch in / out | Copy / paste selected text |
| Four-finger swipe [iPadOS only] | Switch apps |
| Shake | Undo / redo |

### macOS (touch and trackpad)
Rules:
- [macOS] Touch is secondary to keyboard + pointer. Keep layout and control size identical when touch is supported; people switch inputs constantly.
- [macOS] Enlarge tap targets, not the visible controls (hit area may extend beyond bounds). System controls already do this.
- [macOS] For small/dense controls consider a temporary larger variant shown on tap, kept a short time after the finger lifts. System steppers, sliders, dials do this automatically.
- [macOS] Every function must be reachable by keyboard + pointer; conversely offer touch equivalents for pointer-only actions (modifier-drag, hover-reveal menus).
- [macOS] Reuse gestures already known from iPhone/iPad or trackpad/Magic Mouse; test against macOS system gestures. Custom gestures must work for both touch and trackpad; use modifier keys where needed so all touch inputs can perform them.

macOS trackpad vs touch display:

| Action | Trackpad | Touch display |
|---|---|---|
| Select | Primary click | Tap |
| Open | Double click | Double tap |
| Scroll | Two fingers up/down | One finger up/down |
| Zoom | Pinch | Pinch |
| Rotate | Two fingers around each other | Two fingers around each other |
| Context menu | Secondary click | Touch and hold |
| Drag | Click and drag | Touch and hold, then drag |

### watchOS double tap
Rules:
- [watchOS] watchOS 11+: double tap (pinch twice) scrolls lists/scroll views and advances vertical tab views. Where a view has a primary action (toggle/button; also widgets and Live Activities in the Smart Stack), double tap highlights then runs it. In notifications it acts on the first non-destructive action.
- [watchOS] Pick the most-used button as the primary action in a non-scrolling view (e.g. play/pause). Do not set a primary action in views with lists, scroll views or vertical tabs; it breaks default double-tap navigation. APIs: `handGestureShortcut(_:isEnabled:)`, `primaryAction`.

### visionOS
Rules:
- [visionOS] Two families: indirect (look at target, pinch finger+thumb to select, works at any distance, preferred for UI) and direct (touch the object; best within reach, infrequent use because arms tire). Every standard component supports both.
- [visionOS] Direct gestures: touch = select; touch and hold = context menu; touch and drag = move; double touch = preview file / select word; swipe = reveal/dismiss/scroll; two-hand pinch-drag apart/together = zoom; two-hand circular = rotate.
- [visionOS] Support standard gestures everywhere (tap first). Reserve direct and custom gestures for close-up or game-specific interaction.
- [visionOS] Do not require specific body positions or movements; offer alternatives.
- [visionOS] Custom gestures need a Full Space and hand-tracking permission (ARKit). Test ergonomics (no long raised arms, no rapid repetition); avoid complex multi-finger/two-hand gestures without a simpler alternative; do not tie a gesture to one specific hand.
- [visionOS] visionOS 2+: looking at the palm opens Home/Control Center overlays. Do not anchor content to hands/wrists; keep hand-anchored game content outside the Home-indicator zone. Avoid custom gestures with a rolling hand/wrist/forearm motion (reserved). Immersive apps in a Full Space may require a tap before the Home indicator appears (`persistentSystemOverlays(_:)`); visionOS 1 apps defer by default. The visionOS 1 "look up for Control Center" remains as an accessibility option.

Avoid:
- Familiar gesture with an app-unique meaning; unique gesture for a standard action.
- Gesture as the sole route to an important action.
- Silent no-op when a gesture is unavailable.

Sources: gestures

---

## Keyboards

Rules:
- Support Full Keyboard Access (iOS, iPadOS, macOS, visionOS): navigate and activate windows, menus, controls and system features by keyboard only. Test it via Settings > Accessibility. APIs: `isFullKeyboardAccessEnabled`.
- [iPadOS] The system supports keyboard navigation in text fields, text views and sidebars; use the focus APIs for collection views and custom views. Do NOT add your own keyboard navigation to controls (buttons, segmented controls, switches); Full Keyboard Access covers activating controls, reaching all components and gesture-like actions such as drag and drop.
- Respect standard shortcuts. Do not repurpose one for an unrelated action; only redefine when the action makes no sense in your app (e.g. no text editing, so Command-I can be Get Info instead of Italic). For a unique, frequent action, make a new custom shortcut.
- Define custom shortcuts only for the most frequent app-specific commands; too many makes the app look hard to learn.
- Use modifiers as people expect: Command-drag moves items as a group; Shift-drag-resize keeps aspect ratio; holding an arrow key nudges the selection by the smallest app-defined unit until released.
- Modifier choice: Command = main modifier; Shift = secondary, to complement a related shortcut; Option = sparingly for less common/power commands; Control = avoid (system uses it for focus moves, screenshots, etc.).
- If several modifiers: order is Control, Option, Shift, Command.
- Do not add Shift when the key's upper character is the intended one: Command-Slash (Hide Status Bar), Command-Question mark (Help), not Shift-Command-Slash.
- Do not make a new shortcut by adding a modifier to an existing one for an unrelated command (Shift-Command-Z must stay redo).
- Languages: some keyboards need modifiers to type characters (French Option-5 gives `{`). Command is generally safe; avoid extra modifiers on non-alphanumeric keys that are not on all keyboards; if you need a non-Command modifier, use it only with letters.
- Let the system localize and mirror shortcuts (RTL).
- [visionOS] Holding Command shows a shortcut overlay grouped by menu category (File, Edit, View), flat list, only commands that have shortcuts. Write descriptive titles because submenu context is missing (`discoverabilityTitle`). Connecting a keyboard shows a virtual keyboard overlay with completions.
- [watchOS] Physical keyboards not supported.
- Games: shortcuts are key bindings, usually single key; see Game controls below.

Standard shortcuts people expect (macOS-centric; many apply on iPad hardware keyboards):

| Area | Shortcuts |
|---|---|
| Edit | Cmd-Z undo; Shift-Cmd-Z redo; Cmd-X cut; Cmd-C copy; Cmd-V paste; Shift-Cmd-V paste as; Option-Shift-Cmd-V paste and match style; Cmd-A select all; Shift-Cmd-A deselect |
| Text style | Cmd-B bold; Cmd-I italic (or Info window in non-text apps); Cmd-U underline; Cmd-T Fonts window; Shift-Cmd-C Colors window; Cmd-[ / ] left/right align; Cmd-| center; Cmd-- shrink selection; Shift-Cmd-= grow selection |
| Style copy | Option-Cmd-C copy style; Option-Cmd-V apply style; Control-Cmd-C copy formatting; Control-Cmd-V apply formatting |
| Find | Cmd-F find; Cmd-G next; Shift-Cmd-G previous; Cmd-E use selection for find; Option-Cmd-F jump to search field; Cmd-J scroll to selection; Cmd-; find misspelling; Cmd-: Spelling window |
| Files | Cmd-N new; Cmd-O open; Cmd-S save; Shift-Cmd-S duplicate / Save As; Cmd-P print; Shift-Cmd-P page setup |
| Windows/app | Cmd-W close window; Shift-Cmd-W close file+windows; Option-Cmd-W close all; Cmd-M minimize; Option-Cmd-M minimize all; Cmd-H hide app; Option-Cmd-H hide others; Cmd-Q quit; Cmd-` next window; Shift-Cmd-` previous window; Cmd-, settings; Cmd-? Help; Option-Cmd-T toggle toolbar; Control-Cmd-F full screen; Option-Cmd-I inspector |
| Cancel | Esc cancel action; Cmd-. cancel operation |
| Focus movement | Tab / Shift-Tab next/previous control; Control-Tab / Control-Shift-Tab next/previous group (dialog) or table; Control-arrows move focus between cells/values; Control-F2 menu bar; Control-F3 Dock; Control-F4 active window; Control-F5 toolbar; Control-F6 panel; Control-F1 toggle Full Keyboard Access |
| Selection extend | Shift-arrow one character/line; Option-Shift-arrow word/paragraph; Shift-Cmd-arrow to line or document boundary |
| System | Cmd-Space Spotlight; Cmd-Tab / Shift-Cmd-Tab app switch; Option-Cmd-Esc Force Quit; Shift-Cmd-3 / 4 screenshot (add Control = to clipboard); Option-Cmd-8 zoom on/off; Option-Cmd-D Dock; Option-Cmd-+ / - screen zoom; Control-Cmd-D dictionary lookup; Cmd-F5 VoiceOver; Control-Space / Control-Option-Space switch input source |

Numbers:
- Modifier order: Control, Option, Shift, Command.
- Game single-key bindings, see Game controls.

Avoid:
- Control as a custom modifier.
- Shortcuts that need a modifier on a symbol missing from some layouts.
- Many custom shortcuts; reusing a standard one for a different meaning.
- Adding your own keyboard navigation to buttons/switches on iPadOS.

Sources: keyboards

---

## Pointing devices

Rules:
- Mouse and trackpad gestures must behave as everywhere else in the system (e.g. Swipe between pages works the same for documents, web pages, images). Do not redefine system-wide trackpad gestures (Dock, Mission Control); users can customise them.
- Keep behavior the same across touch, eyes, pointer and keyboard. Same modifier = same result (Option-drag duplicates the same way with pointer as with touch).
- Let the pointer reveal and hide auto-minimizing controls (iPadOS Safari toolbar on hover; video playback controls).
- [iPadOS] The pointer adds to touch, never replaces it. Distinguish pointer from finger only when it adds value (e.g. a scrubber where the pointer can click a precise seek point, both can drag the playhead).
- [iPadOS] Custom views that need drag-to-select (rubber band) must implement it (`UIBandSelectionInteraction`); standard non-list collection views support it by default.
- [iPadOS] Pointer shape: default arrow; I-beam over text areas automatically; use system shapes for standard buttons and text fields. Keep custom shapes simple and instantly understandable; no instructional text on the pointer; consider annotations with useful data (X/Y over a graph, width/height while resizing an image).
- [iPadOS] Content effects (pointer over an element):
  - Highlight: Liquid Glass shape materializes between pointer and control. Use for a group of controls inside a Liquid Glass container. Default on bar buttons, tab bars, segmented controls, edit menus.
  - Lift: element scales up with shadow below and soft specular highlight on top. Use for a standalone Liquid Glass control or a small element with an opaque background. Default on standalone Liquid Glass controls, app icons, Control Center buttons.
  - Hover: custom scale/tint/shadow, does not change the pointer shape. Use for large elements.
- [iPadOS] Custom hover: scale only when neighbours will not be crowded (not for table rows; use tint only there). Never use shadow without scale (an unscaled element does not look raised).
- [iPadOS] Prefer system effects for custom elements that act like standard ones (a custom toolbar without highlight feels broken). Use effects consistently (same drawing-area pointer everywhere). No decorative effects.
- [iPadOS] Pointer accessories (`UIPointerAccessory`): small secondary indicators (resize arrows). Use simple images; use the accessory transition to signal a state change (`plus` becomes `circle.slash` when add is unavailable).
- [iPadOS] Bar buttons: make hit regions contiguous so the highlight does not flicker off between adjacent buttons.
- [visionOS] Attached pointer: system moves focus to the element under the pointer after the user looks and moves it; pointer context follows gaze between windows; the pointer hides during gestures and reappears where the user is looking. No app work needed.
- tvOS, watchOS: not supported.

Numbers:
- iPadOS hit-region padding: about 12 pt around elements with a bezel; about 24 pt around the visible edge for elements without a bezel.

macOS clicks and gestures (users can toggle most and change secondary-click regions): primary click = select/activate; secondary click = context menu; scroll; smart zoom (web page/PDF); swipe between pages; swipe between full-screen apps; Mission Control (two-finger double-tap on mouse, 3/4-finger swipe up on trackpad); lookup/data detectors (force click or three-finger tap); tap to click; force click (Quick Look/lookup, variable pressure for e.g. variable-speed media controls); pinch zoom; two-finger rotate; Notification Center (edge swipe on trackpad); App Exposé (3/4-finger swipe down); Apps (thumb + three-finger pinch); Show Desktop (thumb + three-finger spread).

macOS pointer styles (AppKit name / SwiftUI name): arrow (`arrow` / default); open and closed hand for repositioning content (`openHand` / `grabIdle`, `closedHand` / `grabActive`); pointing hand over links (`pointingHand` / `link`); I-beam over text (`iBeam` / `horizontalText`; vertical `iBeamCursorForVerticalLayout` / `verticalText`); crosshair for precise rectangle selection (`crosshair` / `rectSelection`); drag copy with Option (`dragCopy`); drag link/alias with Option+Command (`dragLink`); disappearing item (`disappearingItem`); not allowed (`operationNotAllowed`); context menu with Control (`contextualMenu`); zoom in/out (`zoomIn`, `zoomOut`); column/row resize (`columnResize(directions:)`, `rowResize(directions:)`); window/frame resize in 8 directions, with one-direction variants at min/max limits (`frameResize(position:directions:)`).

### Touch support for hidden controls [macOS, touch Macs]
Rules:
- [macOS] Hover-revealed controls need a touch route. Only for essential controls; skip static info (tooltips) and anything touch can already do another way (a carousel scrolls by swipe, so no need to reveal arrow buttons). Do not keep hidden controls permanently visible just for touch.
- [macOS] Reveal a hidden control when the user taps its general area; show only controls relevant to the current content; hide again when done or after a few seconds of no use.
- [macOS] Keep the current selection when revealing a control and when tapping it (it may act on the selection).
- [macOS] Put essential hidden controls in a context menu (touch and hold opens it); keep the menu short.
- [macOS] Sidebar: tapping a section header or row reveals its hidden controls and also does the click action (expand/collapse, select). Tapping where a hidden control sits reveals it without activating; a second tap activates. Keep revealed controls visible until touch leaves the sidebar or a pointer is used again.
- [macOS] Tabbed window: tap anywhere in the window reveals the selected tab's close button; it stays until pointer use resumes; if the selected tab is closed by touch, show the close button on the newly selected tab.

Avoid:
- Decorative pointer effects, instructional text on the pointer, spacing gaps between bar-button hit regions, hover previews or actions that only work with a pointer.

Sources: pointing-devices

---

## Apple Pencil and Scribble

[iPadOS only. Not supported on iOS, macOS, tvOS, visionOS, watchOS.]

Rules:
- Behave like a real marking tool: support what people naturally try (e.g. writing in margins).
- Let people choose finger or Pencil at any time; every control in a Pencil-marking app must respond to Pencil too, otherwise it feels broken or the Pencil seems out of battery. (Scribble itself accepts Pencil only.)
- A mark must start the instant the Pencil touches: no tool button or mode switch first.
- Use tilt (altitude), force (pressure), orientation (azimuth) and barrel roll to shape strokes. Map pressure to continuous properties (opacity, brush size); keep it simple.
- Marks must appear to directly and immediately affect the content under the tip. No disconnected remote effects.
- Design for left- and right-handers: keep controls out of areas a hand may cover, or let people reposition them.

Hover (Pencil above the screen):
- Use hover only to preview what the mark will be (size, colour of the current tool). Do not constantly change the preview as height varies. Preview mid-range values for dynamic properties (max pressure would cover the canvas, min would be invisible).
- Never trigger an action on hover, especially destructive ones.
- You may use hover to show a contextual menu near the tip (tool sizes) after a squeeze or modifier key.
- Prefer hover previews for Pencil only, not for mouse/trackpad.

Double tap (Pencil models that support it):
- Default: toggle current tool and eraser; users can change to previous tool, show/hide colour picker, or nothing. Honour these settings where meaningful. If they do not fit (e.g. 3D mesh tool raise/lower) you may use the gesture for a mode change.
- Custom double-tap behavior: add a control to choose it, make the active mode obvious, discoverable, off by default.
- Never use double tap for actions that modify content or lose data; accidental double taps happen. Prefer easily undone actions.

Squeeze (Apple Pencil Pro):
- Users may map it to an App Shortcut instead of your behavior. Works only while iPad screen is on and the Pencil is not touching the screen, so the result may be off the user's visual focus.
- Treat as a single, quick, discrete action (not hold, not rapid repeats). Show the result promptly; if it reveals UI (contextual menu), place it near the Pencil tip. Non-destructive and easily undone.

Barrel roll (Apple Pencil Pro): use only to modify the mark itself (e.g. rotate highlighter angle); never for navigation or showing controls.

Scribble:
- Works by default in all standard text components (fields, views, search, editable web content) except password fields; no tap or mode needed. For custom text fields, do not require tap/select first.
- Offer it wherever text entry is natural, even without a field (Reminders: write below the last item). API: `UIIndirectScribbleInteraction`; for existing custom fields `UIScribbleInteraction`.
- Do not distract while writing: no autocompletion text overlay, hide placeholder as soon as writing begins.
- Field must stay still while writing: no move/resize/autoscroll mid-write (delay until a pause). Autoscrolling also corrupts Pencil text selection.
- Give enough room: enlarge small fields before writing starts or on a pause, never during.

Custom drawing (PencilKit):
- Provides low-latency drawing, canvas, tool picker and ink palette. Colours auto-adapt to Dark Mode; disable that when drawing over fixed content (PDF, photo) so markup stays visible.
- In compact environments the tool picker has no undo/redo: add toolbar buttons and/or support the 3-finger undo/redo gesture. Frameworks: PencilKit, PaperKit.

Avoid: hover-triggered actions, double-tap or squeeze for destructive/content-changing actions, mode switches before marking, controls that ignore Pencil, moving or autocompleting fields while handwriting.

Sources: apple-pencil-and-scribble

---

## Focus and selection

Rules:
- Focus = visual confirmation of the target of the next interaction (remote, controller, keyboard). Often focusing also selects, except where selection would cause a context shift (tvOS: focus moves freely, press to select/open).
- Use system focus effects; custom focus effects only if unavoidable.
- Do not move focus without user input. Exception: with discrete directional input (keyboard, remote, controller) when the focused item disappears, move focus to a nearby remaining item. With other inputs, just hide the focus indicator.
- Match platform conventions for reaching items:
  - [iPadOS, macOS] Full keyboard access reaches controls, so support focus only for content elements (list items, text fields, search fields), not buttons/sliders/toggles.
  - [tvOS] Everything must be reachable by directional focus (swipe, arrow keys): make every element focusable.
- Indicate focus consistently: [iPadOS, macOS] focused list item = white text on accent-colour highlight; unfocused = standard text on gray highlight (UICollectionView / NSTableView). Use a focus ring for text and search fields; use a full-row highlight for lists and collections (a ring is acceptable for cell-filling items such as photos).
- Not supported in iOS or watchOS.

### iPadOS (15+)
- Focus groups = areas (sidebar, grid, list). Tab moves between groups in reading order (leading to trailing, top to bottom); arrow keys move within a group (directional, like tvOS).
- Indicators: halo effect (focus ring; customisable outline; for custom views and fully opaque content in cells; shape inferred from item, refine to rounded corners or Bezier paths, adjust position when clipped/occluded, e.g. keep badge above halo; `UIFocusHaloEffect`) or highlighted appearance (accent-coloured text, automatic on selected collection-view cells with content configurations; not a focus effect).
- Fix traversal order by grouping: to move down a vertical stack before moving trailing, make the stack one focus group (`focusGroupIdentifier`). Raise an item's priority so it receives focus first when its group is focused (`UIFocusGroupPriority`).

### tvOS
- [tvOS] In full-screen content, gestures act on the content, not on focus (no focus shown).
- [tvOS] Do not show a pointer; navigate by focus. Free pointer only in gameplay; if needed, make it highly visible and integrated.
- [tvOS] Items have up to five visually distinct states: unfocused (less prominent), focused (elevation, illumination, animation; focused size is larger so supply larger assets and leave room), pressed/chosen (instant feedback, e.g. brief colour inversion and animation), selected (already chosen/activated, e.g. heart filled vs empty), unavailable (inactive look).

### visionOS
- [visionOS] Same focus system for keyboards/controllers. Gaze uses the separate hover effect, not a focus effect (see Eyes).

Sources: focus-and-selection

---

## Action button

Rules:
- [iOS, watchOS (Ultra)] Offer a few essential actions as App Shortcuts (e.g. "Start Egg Timer"). Do not offer an "open app" shortcut; the system already provides it.
- Labels: title-style capitalization, start with a verb, present tense, no articles or prepositions, max 3 words ("Start Race", not "Started Race" or "Start the Race"). They show in Settings.
- Do not duplicate the Settings guidance the system displays.
- [iOS] Let the action run without leaving context: Live Activities, custom snippets (Set Timer prompts a duration and starts a Live Activity, no Clock launch).
- [watchOS] First press can start a workout, dive or drop a waypoint. Secondary presses should continue the primary task (mark segment, next modality); be sparing with more than one secondary function. Do not use later presses to stop the activity (stopping goes in the UI). Side + Action button together = pause, except in diving apps where pausing can be dangerous.
- Not supported on iPadOS, macOS, tvOS, visionOS.

Sources: action-button

---

## Camera Control

Rules:
- [iPhone 16 / 16 Pro only] Light press opens your camera experience and an overlay from the bezel; light double press shows the controls; slide the finger to adjust. Controls are sliders (range, e.g. contrast) or pickers (discrete options, e.g. grid on/off); system standard controls for zoom and exposure are available.
- Represent each control with an SF Symbol (no custom symbols; symbols do not show state; see the Camera & Photos group in the SF Symbols app). Keep names short (they follow Dynamic Type). Add units to slider values (EV, %, `localizedValueFormat`). Define prominent values (frequent or evenly spaced, e.g. zoom steps) for snapping (`prominentValues`).
- Keep UI clear of the overlay area in portrait and landscape; maximise the viewfinder; do not duplicate overlay controls on screen when the overlay shows.
- Enable/disable controls per camera mode; you cannot add or remove controls at runtime. Put common controls in the middle; the system remembers the last used control.
- Offer a locked camera capture extension so the button can launch your camera from the lock screen, Home Screen or other apps.
- Not supported on iPadOS, macOS, watchOS, tvOS, visionOS.

Sources: camera-control

---

## Digital Crown

Rules:
- [visionOS] System use only: volume, immersion level, recenter, Accessibility settings, exit to Home View.
- [watchOS] Apps cannot respond to crown presses (reserved for Home Screen etc.); turning is available. From watchOS 10 it is the primary navigation: Smart Stack widgets, Home Screen scroll, vertical tab paging, list and variable-height page scrolling. Anchor navigation to it and back it up with touch.
- [watchOS] Where navigation is not needed, use it to inspect data (World Clock advances time of day).
- [watchOS] Always give visual feedback to crown turns (pickers change value; update UI when tracking turns directly, `WKCrownDelegate`). Match change speed to turn speed; do not change values so fast that selection is hard.
- [watchOS] Use the default haptic detents (linear by default; tables add detents per row). Turn detents off when they clash with your animation; use linear detents for tables with very different row heights.
- Not supported on iOS, iPadOS, macOS, tvOS.

Sources: digital-crown

---

## Gyroscope and accelerometer

Rules:
- [iOS, iPadOS, watchOS; tvOS only gyro from Siri Remote] Use motion data only for a tangible benefit (fitness feedback, gameplay); do not collect it just to have it.
- You must supply a purpose string; the system shows it in a permission prompt on first access.
- Outside active gameplay, do not drive UI directly by tilt/motion: hard to reproduce, physically difficult for some, drains battery.
- Framework: Core Motion.

Sources: gyro-and-accelerometer

---

## Nearby interactions

Rules:
- Needs Ultra Wideband devices and the Nearby Interaction framework; the user grants permission; identifiers are random and last only for the session.
- Base the idea on a physical-world analogy (bring devices together to move audio to HomePod mini). Let feedback sharpen with proximity (AirTag search: arrow becomes a pulsing circle), keep it continuous, mix visual, audio and haptic (visual when looking at the screen; audio/haptic when interacting with the environment).
- Never make it the only way to do a task.
- Device use: prefer portrait (landscape lowers distance/direction accuracy); hint at it with implicit visual feedback rather than saying "hold in portrait". Direction requires the peer to be within the sensor's field of view (like the iPhone 11+ Ultra Wide camera); outside it you may only get distance. Large objects, people or animals in between reduce accuracy/availability: mention it in onboarding.
- [iOS] distance and direction. [watchOS] distance only; app must be in foreground. Not supported on macOS, tvOS, visionOS.

Sources: nearby-interactions

---

## Game controls

Rules (touch, iOS/iPadOS; Touch Controller framework):
- Show virtual controls only if they help (many actions or movement); prefer in-game gestures (tap objects to select) over overlaid buttons. Show/hide controls by context; hide movement control until touched.
- Place buttons within safe areas, clear of Home indicator and Dynamic Island; frequent buttons near thumbs outside the circular zones used for move/camera; secondary controls (menus) at the top.
- Always visible and tactile press state (glow visible past the finger, plus sound and haptics). Use meaningful symbols (weapon icon for attack), not A/X/R1 labels.
- Merge multi-button combos into one control using double tap / touch-and-hold variants (walk/sprint in one control).
- Movement on the left side, camera on the right; use large input areas; floating virtual thumbstick appearing where the thumb lands for movement; direct touch panning (no stick) for the camera.
- Always support the platform's default input as a fallback even if controllers are supported. Controller-required games (tvOS, visionOS) get a "Game Controller Required" badge: detect presence and prompt gracefully (`GCRequiresControllerUserInteraction`). Auto-detect controllers (Game Controller framework); show the connected controller's actual labels/glyphs, prefer SF Symbols over text; support multiple controllers with per-player glyphs.
- Keyboard: prefer single-key bindings (I inventory, M map, Space main action); test comfort on an Apple keyboard (Command sits next to Space, remap Control to Command); keep related actions on nearby keys (number keys for inventory); let players rebind.
- [visionOS] Spatial controllers (e.g. PS VR2 Sense) should mirror hand input: look and press trigger (indirect) or reach and press trigger (direct).

Numbers:
- Frequent virtual controls at least 44x44 pt; less important (menus) at least 28x28 pt.

Controller buttons in UI (outside gameplay): A = activate; B = cancel/back; left/right shoulder = navigate left/right section; thumbsticks and D-pad = move selection; Menu = settings/pause; Home/logo reserved by system; X, Y, triggers = unassigned.

Sources: game-controls

---

## Eyes

Rules:
- [visionOS only] Gaze highlights interactive items (system hover effect); the app is told nothing about gaze until a tap, for privacy. Tab bars expand on gaze; buttons may show tooltips.
- Always offer other input methods (accessibility features). Place content in comfortable view: avoid requiring rapid eye shifts over a wide area or many depth levels; place reading content at least 1 m away.
- Use standard components so hover feedback is consistent.
- Make items easy to target: reduce motion and noise (movement in peripheral vision pulls the eyes; do not reveal content next to the item being looked at); avoid full-field repeating patterns.
- Spacing: at least 16 pt margin around each interactive item, or centers at least 60 pt apart.
- Rounded shapes are easier to target; multi-part components need one containing shape for the highlight. Use subtle cues (centered placement, gentle motion, contrast) to attract gaze to the likely next item.
- Custom hover effects: run out-of-process, so they cannot trigger code or know when someone looks. Define two states (hover and normal). Use sparingly for special moments. Delay: none (default; subtle, invites interaction like a slider knob), short (tab bar expansion), long (extra info like tooltips). Keep at least one primary view unchanged between states. Test on a real device.

Sources: eyes

---

## Remotes

Rules:
- [tvOS only] Siri Remote: clickpad plus touch surface. Standard gestures: swipe (navigate/scroll; fast then decelerating; edge swipes are faster) and press (activate; press then swipe enters scrubbing).
- Use standard gestures for standard actions outside gameplay; always move focus in the swipe direction; give feedback (resting thumb hints where to swipe down for the info area); custom gestures mainly in games.
- Distinguish press from tap: press is intentional (choose, confirm, game action); taps are for navigation/info. Ignore taps during live video (inadvertent). Positional taps (up/down/left/right) only if intuitive and discoverable.
- Back: open the parent screen (top level = Home Screen; parent follows app hierarchy, not necessarily the previous screen). In active gameplay open a pause menu instead; Back in the menu closes it. Press and hold Back goes Home.
- Play/Pause: toggle playback during media.
- Button map: touch swipe = focus/navigate (game: d-pad); touch press = activate/go deeper (game: primary button); Back = back/exit (game: pause/resume or exit); Play/Pause = playback (game: secondary button, skip intro video).
- EPG remotes: guide/browse button opens your EPG; page up/down navigates the EPG; while content plays, page up/down changes channel. Unsupported EPG: system routes to the default guide app.
- Not supported on iOS, iPadOS, macOS, visionOS, watchOS.

Sources: remotes

---

Sources (all sections): gestures, keyboards, pointing-devices, apple-pencil-and-scribble, focus-and-selection, action-button, camera-control, digital-crown, gyro-and-accelerometer, nearby-interactions, game-controls, eyes, remotes. Full pages at `https://developer.apple.com/design/human-interface-guidelines/<slug>`.
