# Patterns 2: accounts, notifications, help, sharing, drag and drop, workouts, haptics, media and files

When to read this: you are handling sign-in/account deletion, notifications, tips/tooltips, sharing and collaboration, drag and drop, fitness UI, haptics, or the short topics: ratings prompts, file management, printing, full screen, multitasking, live viewing, audio, video. Part 1 (`patterns-1.md`) covers data entry, charts, feedback, loading, search, settings, undo/redo, modality.

## Managing accounts

Rules:
- Require an account only if core functionality needs it. Otherwise let people use the app without one. If required, consider Sign in with Apple.
- Explain the benefits of an account and how to sign up, briefly and friendly, in the sign-in view.
- Delay sign-in as long as possible (shopping app: browse freely, sign in at purchase).
- [iOS, iPadOS, macOS, visionOS] Without Sign in with Apple, prefer passkeys (user enters only a user name). If you keep passwords, add two-factor authentication (iCloud Keychain verification codes).
- Name the real authentication method on buttons ("Sign In with Face ID", not "Sign In"); mention only methods available on the current device (check `LABiometryType`).
- Do not add an app-specific opt-in setting for biometrics; people enable it at system level.
- Never call account authentication a "passcode" (that is the device unlock code).
- Account deletion: if people can create an account in the app, they must be able to delete it (not just deactivate). Provide an in-app way to start it; if impossible, a direct, easy-to-find link to the web page (not buried in Privacy Policy or Terms). Follow regional law (right to be forgotten); if law requires keeping data (e.g. health records), explain what is retained and the process.
- Keep the in-app and web deletion flows equally simple.
- Consider scheduled deletion (with an immediate option too); say when deletion will complete and notify when done.
- With in-app purchases: explain that auto-renewable subscription billing through Apple continues until cancelled even after account deletion, and that people must cancel or request a refund; link to how to manage subscriptions. Applies even if the subscription was not bought in your app.
- Sign in with Apple users: revoke tokens when the account is deleted (token revocation).
- [tvOS] Ask for minimum info (remote input). Prefer sign-in via another device (associated domains). For shared accounts, avoid asking for the profile every time (tvOS 16+: share credentials, store profile data per user; `kSecUseUserIndependentKeychain`). For more than a little data, send people to a website on another device; for email, use the email keyboard screen with recent addresses.
- [tvOS] TV provider apps: use TV Provider Authentication; hide sign-out when signed in at system level, otherwise direct people to Settings > TV Provider; never tell them to sign out via Settings > Privacy.
- [watchOS] Use iCloud Keychain sync for autofill of names and passwords and preserving settings.
- Related: Onboarding, Sign in with Apple, `Authentication Services`.

## Managing notifications

Rules:
- You must get permission before sending any notification. People can change it in system settings and silence everything.
- Support Focus and delivery scheduling. People choose which contacts and apps break through a Focus, and can get alerts in a scheduled summary. The notification is still available immediately in the list even when the alert is delayed.
- Classify notification type: communication notifications (calls, messages; adopt SiriKit intents, `INSendMessageIntent`, `UNNotificationContentProviding`) vs noncommunication. Every noncommunication notification needs an interruption level (`UNNotificationInterruptionLevel`).
- Be honest about urgency; people can turn you off. Do not inflate levels.
- Time Sensitive only for things relevant now or within the next hour. The first time one arrives the system explains it and lets people disable it, and re-asks periodically.
- Never use Time Sensitive for marketing. Never send marketing/promotional notifications without explicit opt-in: show an alert/modal/other UI describing what you will send with a clear opt in/out.
- Provide an in-app settings screen so people can change notification choices (see Settings).
- [watchOS] iPhone notification settings apply to the Watch by default; per-notification options (Mute 1 Hour, Turn off Time Sensitive) appear on swipe left.

Numbers (interruption levels):

| Level | Meaning | Overrides scheduled delivery | Breaks through Focus | Overrides Ring/Silent switch |
|---|---|---|---|---|
| Passive | read at leisure (restaurant recommendation) | No | No | No |
| Active (default) | useful on arrival (score update) | No | No | No |
| Time Sensitive | directly affects the person, needs immediate attention (security issue, package delivery) | Yes | Yes | No |
| Critical | urgent health/safety (government, health, home apps) | Yes | Yes | Yes |

- Critical needs a special entitlement and is extremely rare.

## Offering help

Rules:
- Match help to the task: inline description for 1-2 step tasks, a tutorial for complex or multistep ones. Tie help to what the person is doing now and make it easy to dismiss or skip.
- Keep language and imagery consistent with the platform and input device (no "click" on iPhone, no "tap a menu" on Mac, no controller images for the Siri Remote). Make help inclusive.
- Do not explain standard components; describe what a specific action does in your app. For unique controls or unusual input, prefer animation/graphics over long text.
- Tips (TipKit): small transient view explaining a feature.
  - Choose type: popover tip to preserve content flow; inline tip to keep surrounding info visible. Inline can be annotation-style (points at a UI element) or hint-style (not tied to a UI element).
  - Only for simple features: more than three actions is too complicated for a tip.
  - One or two sentences, direct and action-oriented, no promotional or off-topic content.
  - Use parameter-based or event-based eligibility rules so people who already used the feature do not see the tip. Set a frequency, e.g. once every 24 hours.
  - Include the glyph people associate with the feature (prefer filled variant, e.g. star for favorites), but do not duplicate an image that the tip points at directly.
  - Add a button to go to settings or a setup flow / learn more.
- [macOS, visionOS] Tooltips (help tags; macOS on pointer hover, also iPhone/iPad apps on Mac; visionOS on gaze or pointer; SwiftUI `help(_:)`):
  - Describe only the hovered control and the action it triggers, starting with a verb ("Restore default settings"). Do not repeat the control name.
  - Sentence case; fragments without articles; no ending punctuation unless required by app style.
  - Context-sensitive text per control state is fine.
  - If a control needs a lot of text, simplify the UI instead.

Numbers:
- Tooltip length: 60 to 75 characters max (localization changes length).
- Tip frequency example: once per 24 hours.
- Tip complexity limit: at most three actions.

## Collaboration and sharing

Rules:
- Put the Share button where it is easy to reach, such as the toolbar. iOS 16 share sheet and iPadOS 16 / macOS 13 sharing popover include file-sharing method and permission setup for new collaborations. SwiftUI: `ShareLink` opens the system share sheet.
- Customize the share sheet/popover only for the sharing types you support. "Send copy": CloudKit, pass file plus collaboration object; iCloud Drive supports it by default; custom collaboration, include the file or a plain-text version in the collaboration object. Custom collaboration infrastructure needs universal link support.
- Write short permission summaries ("Only invited people can edit", "Everyone can make changes"); the system shows them in a button that reveals sharing options.
- Offer few, grouped, glanceable custom options: who can access, edit vs read only, whether collaborators can add people.
- Show the Collaboration button as soon as collaboration starts, next to Share. The popover has three sections: collaborators plus Messages/FaceTime buttons (top), your custom items (middle), manage button (bottom). Keep custom items to the essentials (Notes shows latest updates and more-info/activity buttons).
- Optionally rename the manage button (default "Manage Shared File"). CloudKit sharing supplies the management view; otherwise build your own.
- Consider posting events (content change, membership change, mention) to Messages with a universal link (`SWHighlightEvent`).
- SharePlay covers real-time shared activities (separate page).
- [visionOS] Shared Space screen sharing streams the current window by default; the stream pauses while someone is in a Full Space.
- [watchOS] Use `ShareLink`. Not available on tvOS.
- Related: activity views; Shared with You framework.

## Drag and drop

Rules:
- Support drag and drop widely; system text fields and text views include it. Always offer an alternative path (menu commands for copy/move; accessibility APIs `accessibilityDragSourceDescriptors` and `accessibilityDropPointDescriptors` on iOS/iPadOS).
- Defaults: same container = move; different container = copy; across apps = always copy. Change defaults only if the alternative is less likely to cause frustration or data loss.
- Support multi-item drag where sensible. [iPadOS] People can add items to an in-progress drag without releasing; accept multiple simultaneous drops. [macOS] items from several apps can be gathered.
- Prefer allowing undo of a drop; if it cannot be undone, confirm first (Finder asks before dropping into a write-only folder) or provide a reversal (Photos lets you cancel sharing).
- Offer several representations of dragged content, highest to lowest fidelity (vector PDF, then lossless PNG with transparency, then JPEG; or native chart object then image).
- Consider spring loading: dragging over buttons or segmented controls activates them (Calendar: drag an event over Day/Week/Month/Year). iPad on hover; Mac with force click on Magic Trackpad.
- Feedback while dragging:
  - Show a translucent drag image once the selection moves about 3 points; keep it until drop.
  - Optionally adapt the drag image to preview the result (e.g. photo expands to its default size in the document); use flocking to group multiple items. Do not change it constantly or radically.
  - Highlight or show an insertion point only over destinations that accept the content, only while hovering. Otherwise show nothing or a not-allowed image (SF Symbol `circle.slash`). Cue one destination at a time.
  - On invalid or failed drop: return the item to its source, or scale up and fade out.
- Accepting drops:
  - Autoscroll scrolling containers while dragging (stop when the drag leaves the container).
  - Pick the richest representation you can handle; extract only the relevant parts (Mail shows only name and email of a dropped contact).
  - With a hardware keyboard, check Option at drop time: held forces a copy within the same container; released = move.
  - For slow transfers show progress and/or a placeholder at the drop point; if the drop triggers a task (e.g. print) show it started and progress.
  - Dropped text keeps its style if both sides support the same styles; otherwise adopt the destination's style.
  - After the drop keep the dropped content selected in the destination. Same container: moved content leaves the origin; copied content loses selection at the origin. Different container: deselect in the source.
- [macOS] Allow dragging to Finder in a format the app can reopen (Calendar gives `.ics`; text can become a clipping, unrelated to the Clipboard).
- [macOS] Allow dragging selected content out of an inactive window without activating it, and dragging unselected items without disturbing its background selection.
- [macOS] Optionally show a badge (small filled oval with count) for multi-item drags, updating it if only a subset is accepted; change the pointer (copy, drag link, disappearing item, not allowed); let select-and-drag be a single motion.
- [visionOS] People pinch-and-hold and drag in any direction including z. Launch a handler window/scene when content is dropped in empty space (`NSUserActivity`; URL opens Safari).
- Input methods: iOS/iPadOS touch, pointer, Full Keyboard Access; Universal Control between Mac and iPad; Mac pointer, Full Keyboard Access, VoiceOver, touch display.
- Not supported on tvOS or watchOS.

Numbers:
- Drag image appears after about 3 pt of movement.

## Workouts

Rules (mainly watchOS, but applies to iOS/iPadOS fitness UI; not supported on macOS, tvOS, visionOS):
- [watchOS] Use workout sessions; during a session the app stays visible between wrist raises, so show the metrics people care about (elapsed or remaining time, calories, distance) and relevant controls (lap, interval markers).
- Show only relevant info during a workout: no workout list or other app areas. The source shows a typical page arrangement (as in Workout) only as an image.
- Make an active workout recognizable at a glance, e.g. a metrics page with live-updating values and a distinct layout.
- Controls (pause, resume, stop) easy to find and tap, with clear feedback when a session starts or stops.
- When sensor data is unavailable (e.g. water blocks heart rate in swimming), explain what is still tracked, in wording similar to the system Workout app (calories, laps, distance via accelerometer; GPS only for freestyle distance).
- Finish with a summary screen confirming completion and showing recorded data; consider adding Activity rings.
- Discard extremely short sessions (ends seconds after start) automatically, or ask whether to record.
- For moving users use large fonts, high contrast, and put key info where it is easiest to read.
- Use Activity rings only for their documented purpose (Apple-designed view with Activity app colors/meanings).
- Frameworks: WorkoutKit, HealthKit.

## Playing haptics

Rules:
- Use system haptic patterns only for their documented meaning; if it does not fit, use a generic pattern or a custom one.
- Be consistent: each haptic must map to one cause. Do not use the same pattern for failure and success.
- Haptics complement visual and audio feedback; match their intensity and sharpness with the animation; sync with sound where relevant (Delivering Rich App Experiences with Haptics).
- Do not overuse; ideal haptics are ones people barely notice but would miss. Test with users.
- Prefer short haptics for discrete events. Long-running haptics belong mostly to game flow; in apps they dilute feedback (and feel unpleasant on Apple Pencil Pro).
- Make haptics optional (let people turn them off) and keep the app fully usable without them.
- Mind side effects: vibration must not disrupt camera, gyroscope or microphone use.
- [iOS] Standard controls (toggles, sliders, pickers) already play system haptics on supported iPhones. Use feedback generators (`UIFeedbackGenerator`) for three categories: notification (outcome of a task, e.g. depositing a check, unlocking a vehicle), impact (physical metaphor, e.g. view snapping into place, heavy collision), selection (while values of a UI element change).
- [macOS] Magic Trackpad patterns for drag or force click (`NSHapticFeedbackPerformer`): Alignment (dragged item aligns; scaled to dimension; hits min/max of a scrubber), Level change (discrete pressure levels, e.g. fast-forward speed), Generic (fallback).
- [watchOS] Apple Watch Series 4+ gives Digital Crown haptic detents (linear by default; tables give detents as items scroll in); watchOS defines a set of haptic types with specific meanings (`WKHapticType`).
- Custom haptics (Core Haptics; mostly games): two building blocks, transient events (brief taps/impulses, like the Flashlight button) and continuous events (sustained vibration, like the lasers message effect). Each has adjustable intensity (strength) and sharpness (soft/rounded/organic vs crisp/precise/mechanical). Vary by context (stronger landing from a tree than from a jump in place). Can be combined with audio.
- Other devices: game controllers (iPadOS, macOS, tvOS, visionOS), Apple Pencil Pro, some trackpads on certain iPads.
- (note) The source page lists impact/selection/notification categories but its style tables (light/medium/heavy, success/warning/error) are images not present in the text; check the live page for exact style names.

## Ratings and reviews
- Ask only after demonstrated engagement (finished a level or significant task). Not at first launch or during onboarding.
- Never interrupt a task; pick natural breaks. Space requests at least a week or two apart.
- Prefer the system prompt (`RequestReviewAction`; iOS, iPadOS, macOS): one tap to rate or dismiss, user can opt out of all prompts; the system caps display at 3 times per app per 365 days.
- Resetting the summary rating on a new version gives a current-version score but fewer ratings overall.

## File management
- Autosave: avoid explicit save; save periodically while editing and on close/app switch. Hide file extensions by default with an option to show.
- [iPadOS, macOS] Provide New/Open as menu commands (iPadOS shows them in the Command-key shortcut overlay; macOS File menu) plus an Add (+) button regardless.
- Custom file browsers must follow the Files/Finder mental model; open on the most relevant location but allow browsing everything.
- Quick Look: use a viewer to preview files you cannot open; implement a generator for custom file types so Finder, Files and Spotlight can preview them.
- [iOS 18, iPadOS 18] Document launcher (`DocumentGroupLaunchScene`): title card with app name and two buttons (primary usually creates a document, e.g. Numbers "Start Writing"; secondary offers options, e.g. "Choose a Template"), background plus accessory images, and a file-browser sheet. Keep the background simple and clearly distinct from accessories and card; keep name and buttons visible across sizes/orientations; animate sparingly (gentle breathe/sway).
- [iOS, iPadOS] File provider extension: list only context-appropriate documents (PDF editor loads it, list PDFs; optionally dates, sizes, local/remote); let people choose a destination when exporting/moving; no custom top toolbar (host modal already has one).
- [macOS] Use the default file browser unless you have an important reason. Open panel can offer Open Recent, filters, multi-select and a custom Open button title (e.g. Insert). Save panel: new documents titled "Untitled", changeable name/format/location, optional accessory view. Finder Sync extension for sync badges, contextual menu items, toolbar buttons.
- [macOS] If autosave is off ("Ask to keep changes when closing documents"): prompt on close/quit/logout/restart, and show unsaved state with a dot on the close button and in the Window menu; do not show the dot when autosave is on. "Edited" may be appended to the title; remove it once saved.
- tvOS and watchOS provide no document-browsing interface; visionOS (Files app) has no extra considerations.

## Printing
- Make printing discoverable: [macOS] Print in the File menu (optionally an add-able toolbar button); [iOS, iPadOS] toolbar button opening an action sheet.
- Dim/remove Print when nothing is printable or no printer is available.
- Show page range, copies, two-sided when the printer supports them, via the system view.
- [macOS] Custom print panel category named after the app for app-specific options (Keynote: presenter notes, backgrounds, skipped slides). Page setup dialog for page size/orientation/scaling per document; do not reimplement system options (orientation, reverse order). Show dependencies between options (double-sided disables transparencies); hide advanced options behind a disclosure labeled "Advanced Options"; optionally preview effects; store settings at least until the document closes.
- Not on tvOS, watchOS.

## Going full screen
- Offer for games, media (video, slideshows), in-depth tasks. Never resize the window programmatically; tweak layout subtly only.
- Keep essential controls accessible (media controls persistent or easy to reveal). Hidden toolbars and navigation: restore with a familiar gesture (tap, swipe down, cursor to top). Keep controls visible where navigation requires them.
- [iPadOS, macOS] Non-game apps: let people reveal the Dock. Games may defer the first bottom-edge swipe (`preferredScreenEdgesDeferringSystemGestures`) or hide the Dock (`hideDock` AppKit).
- Pause on switching away (game, slideshow) and resume when back. Let the user decide when to exit; do not exit automatically after a movie or game ends.
- [iOS, iPadOS] Home indicator auto-hides and reappears with a bottom-edge interaction (one swipe to exit); if accidental exits occur, you may require two swipes.
- [macOS] Use the system full-screen (`toggleFullScreen(_:)`) so camera housing (notch) is handled; user enters via the Enter Full Screen button, View menu or Control-Command-F; no custom window-mode menu. In games, a custom toggle is fine; do not change the display mode when going full screen.
- Not supported on tvOS, visionOS, watchOS (apps already fill the screen or use immersive spaces).

## Multitasking
- Every app (except some games, visionOS Full Space apps) must work with multitasking; always be ready to save and restore context.
- Pause activities that need attention (games, media) when switching away; resume seamlessly.
- Audio interruptions: primary ones (music, podcasts, audiobooks) pause indefinitely; short ones (GPS prompts) lower volume or pause then resume.
- Finish user-started background tasks (downloads, video processing). Notify on completion only for important or time-sensitive tasks.
- [iPadOS] Windowed or full-screen apps, multiple windows per app, resizable windows with tiling controls. Apps are not told which multitasking configuration is in use: adapt to any size (see Layout, Windows). PiP for video and FaceTime everywhere. [iOS] PiP with another app.
- [macOS] Multitasking is the default; windows get layered shadows and state visuals.
- [visionOS] Only one active window in the Shared Space; do not alter window edge appearance (feathered mask), do not pause video when the user looks away, expect audio ducking for non-Now Playing apps. Closing the window of the Now Playing app pauses audio.
- Not supported in watchOS.

## Live-viewing apps
- Put live content first and make playback one tap or zero (Watch Now button that vanishes and starts full-screen playback).
- Make live content visibly live (Live row with badge/symbol/sash) and consider showing progress of in-progress content.
- Keep action order consistent (Watch, Start Over, Record, Favorite); show other airing times.
- Content footer for browsing channels during playback: subtle darkened treatment, badge/tint on the current item, same categories as the EPG, symmetric invoke and dismiss gestures.
- Give instant feedback on channel change; audio follows the live context and stops when leaving the live tab.
- EPG: highlight the current program, channel and time with easy return to playback; easy paging/jumping; My Channels or Favorites; familiar categories (Movies, TV Shows, Kids, Sports, Popular); browse while content continues in PiP or background.
- Cloud DVR: start/stop recording from the info panel; record a future program from a detail view (this program or all future episodes); fine-grained rules (new episodes only, specific teams); play/delete from details; manage storage, ideally automatic (overwrite oldest or already viewed).

## Playing audio
- Respect silent switch, system volume and headphones: sound is rerouted on connect without interruption; playback pauses immediately on disconnect. When silent, play only what the user explicitly started (media, alarms, audio/video messages).
- Adjust only your own relative levels, never overall volume. Allow rerouting (AirPlay, Bluetooth). Use the system volume view (`MPVolumeView`).
- Pick the right `AVAudioSession.Category`:

| Category | Use | Silence switch | Mixes | Background |
|---|---|---|---|---|
| Solo ambient | non-essential, silences other audio | respects | no | no |
| Ambient | non-essential, lets other audio play | respects | yes | no |
| Playback | essential (audiobook, language app) | ignores | maybe | yes |
| Record | recording (voice notes) | ignores | no | records in background |
| Play and record | simultaneous (calls, messaging) | ignores | maybe | yes |

- Respond to remote audio controls (Control Center, headphones) only when actively playing, in an audio context, or connected via Bluetooth/AirPlay; do not repurpose controls; ignore unsupported ones. Custom player controls only for commands the system lacks.
- Signal when your temporary audio ends (`notifyOthersOnDeactivation`); handle interruptions: resumable (phone call) vs nonresumable (new playlist); media apps check `shouldResume`, games can resume without checking.
- [iOS, iPadOS] Short sounds and vibrations via Audio Services. [macOS] notification sounds mix by default. [tvOS] system plays audio only on user initiation. [visionOS] Spatial Audio, prefer playing sound, sound for custom elements, fixed vs tracked sound; never convey important info by sound alone. [watchOS] 64 kbps HE-AAC, Now Playing view.

## Playing video
- Use the system player (AVKit) so behavior is familiar; a custom player must mimic it. Show video at its original aspect ratio with no baked-in letterbox or pillarbox padding (breaks scaling and PiP).
- Default modes: wide video (2:1 to 2.40:1) uses aspect-fill (`resizeAspectFill`); standard (4:3, 16:9, up to 2:1) and ultrawide (above 2.40:1) use aspect-fit (`resizeAspect`).
- Support expected inputs: Space plays/pauses on all platforms with a keyboard; Siri Remote gestures. Provide extra metadata via `externalMetadata` without obscuring playback.
- Avoid mixed audio when switching between PiP/full screen and other audio sources (`silenceSecondaryAudioHintNotification`).
- TV app integration: show your own black screen immediately; play at once (no splash, detail screens or resume prompts); resume at previous end time; switch profile as requested (ask if none); loading screen only if loading takes over 2 seconds (black, centered spinner, minimal branding); on exit show the detail view with a resume option (or menu/main menu) and prepare it early.
- [tvOS] Keep overlays small, brief, translucent SDR (image retention); interactive overlays pause playback after a minimum 0.5 s delay with a clear dismiss. Add transport controls or content tabs only for useful actions.
- [visionOS] Let the user start playback; small resizable window; surroundings visible; no immersive autostart; thumbnails 160 px wide for scrubbing; do not occlude controls; do not fill a window with the inline player; RealityKit player for splash/transitions.
- [watchOS] Clips max 30 s; H.264 High Profile, 160 kbps at up to 30 fps; full-screen 208x260 px portrait, 16:9 320x180 px landscape; audio 64 kbps HE-AAC; no scaling; poster image should represent the clip and not look like a control.

Sources: managing-accounts, managing-notifications, offering-help, collaboration-and-sharing, drag-and-drop, workouts, playing-haptics, ratings-and-reviews, file-management, printing, going-full-screen, multitasking, live-viewing-apps, playing-audio, playing-video (full pages: https://developer.apple.com/design/human-interface-guidelines/<slug>)
