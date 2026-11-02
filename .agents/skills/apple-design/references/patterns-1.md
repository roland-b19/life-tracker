# Patterns 1: data entry, charts, feedback, loading, search, settings, undo, modality

When to read this: you are designing how data goes in or out of a screen (charts, forms, validation), how the app reports status (feedback, loading), how people find things, configure the app, reverse mistakes, or you are about to present a modal. Part 2 (`patterns-2.md`) covers accounts, notifications, help, sharing, drag and drop, workouts, haptics and the short media/file topics.

## Charting data

Rules:
- Chart only when you want to highlight something about a dataset (trend over time, current state of a changing quantity, comparison across categories). If people only need the raw data, give a list or table they can scroll, search and sort.
- Keep a chart simple; reveal extra detail on demand (levels of detail, subsets of data). Do not pack in all the data. For interactive charts, consider shipping progressively richer versions.
- Prefer common chart types (bar, line) so people already know how to read them. If a chart is novel, teach it (Activity rings animate one by one to show what each ring means).
- Look at the data at several levels (totals/averages, subsets, individual points) and surface useful details from each.
- Add descriptive text: title, subtitle, annotations, and a short headline summary above the chart (example: Weather's "Chance of light rain in the next hour"). A headline never replaces accessibility labels.
- Size a chart to its job: big enough for readable labels/annotations and for the interactivity you support; small for glanceable snapshots or previews of a larger chart elsewhere.
- Be consistent across charts with a similar purpose: same type and style unless you must highlight a real difference.
- When several charts show the same dataset (e.g. a small trend chart that expands to a full chart, as in Health Trends), keep the chart type, colors, marks, annotations, layout and text the same across versions.
- Every chart must be accessible: provide accessibility labels describing values and components, plus accessibility elements so people can interact with it. (Swift Charts: see "Enhancing the accessibility of a chart".)
- Implementation: Swift Charts. Chart components are on the Charts page (separate component reference).

## Entering data

Rules:
- Minimise typing: pre-gather what you can from the system (settings) or via permissions (location, calendar) instead of asking.
- Support every available input method so people pick what suits them.
- Say clearly what is needed: placeholder prompt (example "username@company.com") or a short label ("Email"). Prefill sensible defaults.
- Sensitive input: use a secure field (SwiftUI `SecureField`) that shows a filled dot per character. [tvOS] digit entry can be obscured via `isSecureDigitEntry`. [visionOS] the system text field shows secure input only to the wearer (blurred in AirPlay).
- Never prepopulate a password field. Make people type it or use biometric / keychain auth (see Managing accounts in part 2).
- Offer choices instead of free text whenever you can: picker, menu, or other selection control.
- Accept drag-and-drop and paste as input.
- Validate dynamically, as values are entered, and flag a problem immediately; do not make people fix errors after a long form. For numbers use a number formatter (accepts only numeric input and can format decimals, percent, currency).
- Make required data obvious: enable Next/Continue only after the required fields are filled.
- [macOS] Use an expansion tooltip to show the full text of a clipped/truncated field when the pointer rests on it (works for iOS/iPadOS apps on Mac too).

Related components: text fields, virtual keyboards, keyboards (separate component references).

## Feedback

Rules:
- Feedback tells people status, success/failure, warnings about consequences, and chances to correct mistakes. Match the delivery to the importance: passive/inline for status, interrupting for possible data loss.
- Make feedback accessible by combining channels (color, text, sound, haptics) so it works when the phone is muted, the screen is not watched, or VoiceOver is used.
- Prefer status shown inline near the thing it describes (example: Mail shows last update and unread count in the mailbox toolbar) over making people go looking.
- Use alerts only for critical, ideally actionable, information. Overuse destroys their impact.
- Warn before a task that causes unexpected and irreversible data loss. Do not warn when the loss is the expected result of the action (Finder does not warn on every file trash).
- Confirm completion only for significant tasks (Apple Pay success); people expect success, so mostly tell them when something fails.
- When a command cannot run, say so and explain why (Maps: cannot give directions from and to the same place).
- [watchOS] Avoid indeterminate progress indicators; they imply the person must keep watching. Reassure them they will get a notification when the process completes.
- Haptics and sound as feedback: see Playing haptics (part 2) and Playing audio.

## Loading

Rules:
- Show something immediately: placeholder text, graphics or animation, replaced as real content arrives. A blank wait reads as a bug.
- Let people do other things while content loads in the background.
- For unavoidably long loads, show something interesting (hints, tips, new features) and estimate remaining time well enough that the filler is neither too short nor repeated.
- Download large assets in the background (Background Assets framework: right after install, during updates, or other quiet times) to improve install and launch time.
- Show progress when loading takes more than a moment or two: determinate indicator when duration is known, indeterminate when not (see Progress indicators in the components reference).
- Games may use a custom loading view with custom animation matching the game's style.
- [watchOS] Avoid loading indicators where possible; show content immediately. If it needs a second or two, a loading indicator beats a blank screen.

## Searching

Rules:
- Use a search field for in-app search. If search is important, give it a primary position: a field in the bottom toolbar (Notes) or a dedicated search tab in tab-bar apps (Photos, Apple TV).
- Make all content findable from one clearly identified place. Local search is still fine in distinct sections, where it acts as a filter of the current view (iOS Music).
- Show the current scope: descriptive placeholder, scope bar, or title (Mail always names the mailbox being searched).
- Offer scoping/filtering (scope bars, tokens) when attributes such as date, size, type matter.
- Help people type less: recent searches before typing, predictive suggestions, completions, corrections while typing (`searchSuggestions(_:)`).
- Respect privacy: do not display search history where others may see it; if shown, offer a way to clear it.
- Systemwide search (iOS, iPadOS, macOS): index app content in Spotlight with descriptive metadata (Core Spotlight) so content can be found without opening the app. Custom file types: supply a Spotlight File Importer (`CSImportExtension`) and a Quick Look generator.
- You can add a button that starts a Spotlight search from the current selection and show the results in a custom view.
- Prefer system open/save panels; they include a search field covering the whole system.
- Also support find within an open document/page/window (iOS, iPadOS, macOS).
- Changelog note: page revised June 8, 2026 (terminology and best practices).

## Settings

Rules:
- Ship defaults that work best for most people; ideally no setup is needed before use. Detect instead of asking (connected controller, Dark Mode).
- Minimise the number of settings; too many make the app less approachable and settings hard to find.
- Do not duplicate system-wide settings (accessibility, scrolling, authentication method, appearance) in your own settings; it implies your copy affects other apps or that system settings do not apply to you.
- Make settings reachable the expected way: Command-Comma (,) on a hardware keyboard; Esc in games.
- Put only general, rarely changed options in the app settings area (account options, window configuration, game-saving behavior, keyboard mapping), because opening it interrupts the task.
- Put task-specific options (show/hide parts of a view, reorder, filter a list) in the screen they affect, not in settings.
- System Settings app: add only the most rarely changed options; consider a button in your UI that opens it directly.
- [macOS] Settings item lives in the App menu (File menu for document-level options). Do not add a settings button to the window toolbar.
- [macOS] Settings window: toolbar with buttons for panes that is non-customizable, stays visible and always marks the active pane; dim the minimize and maximize buttons; window title = current pane name (or "App Name Settings" if single pane); reopen at the last-viewed pane.
- [watchOS] No app settings in the system Settings app. Put a few essential options at the bottom of the main view or in a More menu.
- Related: Onboarding; SwiftUI `Settings`, `UserDefaults`.

## Undo and redo

Rules:
- Let people predict what undo/redo will do: name the result in the label. macOS menu items like "Undo Typing", "Redo Bold".
- Show the result of each undo/redo; if the affected area is offscreen, scroll to it or highlight it so people do not think nothing happened and repeat the command.
- Allow unlimited-feeling multi-step undo; people expect to undo everything since opening or saving a document.
- Consider batch revert: undo a group of related incremental changes (one property) at once, and/or "revert all changes since open/save".
- Provide dedicated undo/redo buttons only when needed; people already know system gestures. If you add them, use the standard system symbols and place them in a toolbar.
- [iOS, iPadOS] Do not redefine standard gestures: shake the iPhone, three-finger swipe.
- [iOS, iPadOS] The undo alert title is auto-prefixed "Undo " or "Redo " (with trailing space); supply one or two words after it ("Undo Name", "Redo Address Change").
- [macOS] Put Undo and Redo at the top of the Edit menu; support Command-Z and Shift-Command-Z.
- Not supported on tvOS and watchOS. Implementation: `UndoManager`.

## Modality

Rules:
- Use a modal presentation only when there is a clear benefit: critical information, confirm/modify a recent action, a distinct narrowly scoped task, or focus/immersion.
- Keep modal tasks simple, short and streamlined. Do not build an app inside the modal: if subviews are unavoidable, give a single path and avoid buttons that could be mistaken for the dismiss button.
- Always give an obvious dismiss: [iOS, iPadOS, watchOS] button in the top toolbar or swipe down; [macOS, tvOS] button in the main content view.
- Protect work: if closing (button or gesture) could lose user content, confirm and offer a way out, e.g. an action sheet with a save option (iOS).
- Title the modal with its task name, optionally with guidance text, so people keep their place.
- Full-screen modal style suits in-depth content or complex multistep tasks (media, camera, markup, photo editing). Nonmodal full screen is covered in Going full screen (part 2).
- Never show more than one modal at once: let people dismiss one before presenting another. An alert may appear over any modal, but never show two alerts at once.
- Component choice: alerts (all platforms), sheets and popovers for tasks on iOS/iPadOS/macOS, separate windows on iPadOS/macOS/visionOS, activity views, confirmation dialogs / action sheets.
- Implementation: SwiftUI presentation modifiers, `UIModalPresentationStyle`, AppKit modal windows and panels.

Sources: charting-data, entering-data, feedback, loading, searching, settings, undo-and-redo, modality (full pages: https://developer.apple.com/design/human-interface-guidelines/<slug>)
