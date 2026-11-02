# System experiences: widgets, Live Activities, notifications, controls, App Shortcuts, snippets, status bars (+ watch/tv extras)

When to read this: you are designing anything that lives outside the app's own screens: Home Screen / Lock Screen / StandBy widgets, Live Activities and the Dynamic Island, push or local notifications (content, actions, badges, interruption levels), Control Center / Lock Screen / Action button controls, App Shortcuts and Siri snippets, or the status bar. For apps with reminders and glanceable data the highest-value pages are Notifications and Widgets. Watch complications, watch faces and tvOS Top Shelf are kept short at the end.

Sections: Widgets, Live Activities, Notifications, Managing notifications (interruption levels, from a neighbouring page), Controls, App Shortcuts, Snippets, Status bars, Complications, Watch faces, Top Shelf.

---

## Widgets

Rules:
- Pick one simple idea tied to the app's main purpose; show timely content plus a relevant action or deep link. A widget that only mirrors the app icon adds no value and gets removed.
- Prefer information that changes during the day; static widgets lose their prominent slot. Widgets refresh periodically, not continuously: choose an update cadence that matches how often the data changes and when people look (hourly is fine for fast-moving data). If people may look more often than you update, print a "last updated" text.
- Let the system refresh dates and times (relative/auto-updating date text) so you save update budget. Show real content fast; do not hide stale data behind placeholders.
- Animate data changes with standard or custom SwiftUI animations, max 2 seconds.
- Offer multiple sizes only where each adds value. Small = one piece of information; larger sizes add layers of info/actions. Never just stretch a small widget's content to fill a larger one. One well-fitted size beats all sizes.
- Balance density: not so sparse it feels pointless, not so dense it stops being glanceable. If too dense, move to a larger size or replace text with graphics.
- Show only what relates to the widget's purpose; larger sizes widen the range of the same subject (Calendar widgets stay about events at every size).
- Brand: use brand colors, typefaces, stylized glyphs. A logo is rarely needed; if content comes from several sources, a small logo at top-right is enough.
- Choose auto-content vs user-configurable: let people configure when the useful data differs per person (e.g. which stocks); otherwise show recent content automatically.
- Do not mimic your widget's look inside the app with a non-widget element (people expect it to behave like a widget).
- If signed-in state adds value, say so in the widget ("Sign in to view ...").
- Interactivity: tapping anywhere outside buttons/toggles launches the app. Buttons/toggles allowed for simple, content-related actions (e.g. check off a reminder); keep complex work in the app. Deep link to the exact related screen, not the app root. Keep targets large enough to hit with confidence; avoid app-like layouts. Inline accessory widgets have exactly one tap target.
- Margins: standard widget margin is 16 pt; tighter 11 pt is acceptable for grouped content (graphics, buttons, background shapes). Margins are smaller on the Mac desktop and on the Lock Screen (including StandBy). Use ContainerRelativeShape so inner shapes match the widget's corner radius. Design at large size and let the system scale down (iOS resizes for small devices; iPadOS renders at large size then scales for the Home Screen). Build in SwiftUI for flexibility; the spec tables are guidance only.
- Text: system font, text styles, SF Symbols. A custom font is OK sparingly (often custom for large text, SF Pro for small). Never rasterize text (breaks scaling and VoiceOver). Widgets support Dynamic Type sizes from Large to AX5 on iOS/iPadOS/visionOS.
- Color: enhance, do not compete with content. Never encode meaning by color alone (monochrome/tinted modes exist; watchOS may invert). You can set colors in the asset catalog for the editing-mode UI the system generates.
- Full-color images: in tinted/clear appearances the system desaturates them by default. You can force full color, but that makes the widget look out of place; reserve it for media (album art) and keep such images smaller than the widget.
- Gallery: design a realistic preview (simulated data is fine if real data is slow). Placeholder = static UI plus semi-opaque shapes standing in for dynamic content (bars of varying width for text lines, circles/squares for glyphs/images). Description: one sentence starting with an action verb ("Keep track of your upcoming events"), no "This widget shows...", sentence case. Group all sizes under one widget with one description. Optionally color the gallery Add button.
- Offer a Live Activity (not a widget) for real-time, time-limited tracking; develop both together and share code/design.

Appearances and rendering modes (the system picks the mode; design for all three):
- Appearances on iPhone/iPad/HomeView Home Screen: light, dark, clear, tinted. Light/dark = full color. Clear = desaturated + translucent + Liquid Glass material. Tinted = desaturated, then the user's tint color applied.
- Full-color mode: system family widgets, colors untouched. Support light and dark: light backgrounds in light, dark backgrounds in dark, use semantic system colors or asset-catalog color variants.
- Accented mode (system family widgets on all platforms; Apple Watch accessory widgets): system removes the background and replaces it with a tint effect (tinted) or a Liquid Glass background (clear), and splits views into an accent group and a primary group, each rendered in one solid color. iPhone/iPad/Mac: both groups white; watchOS: primary white, accent in the watch-face color. API: widgetAccentable(_:). Group components deliberately.
- Vibrant mode: Lock Screen on iPhone/iPad, iPhone StandBy in low light (red tint), Mac desktop. Text/images/gauges are desaturated and tinted to suit the background. Pixel opacity controls how strong the blurred material is; pixel brightness controls vibrancy (brighter gray = more contrast). Render content at full opacity; white/light gray for the most important, darker grays for secondary; use opaque grayscale values, not white at partial opacity; check contrast in grayscale.
- Where each mode occurs: iPhone full-color = Home Screen, Today View, StandBy and CarPlay (background removed); accented = Home Screen, Today View; vibrant = Lock Screen, StandBy Night Mode. iPad full-color/accented = Home Screen, Today View; vibrant = Lock Screen. Watch: full-color and accented in Smart Stack and complications, no vibrant. Mac: full-color on desktop and Notification Center, vibrant on desktop, no accented. Vision Pro: full-color and accented only.

Platform notes:
- [iOS/iPadOS] Lock Screen widgets (accessory) follow complication principles: three styles, inline text above the clock, circular and rectangular below the clock. Give useful information; do not treat them as a launcher. Design them in tandem with watch complications. Always-On display renders them at reduced luminance: use gray levels with enough contrast.
- [iPhone] StandBy shows two small system widgets side by side, scaled up. Supporting StandBy also covers CarPlay (same small widget, background removed, scaled to the Widgets screen grid). Mark the background as removable. Use large, glanceable text, rearrange/scale text instead of using rich images or color for meaning. Low light = monochrome red tint.
- [Apple HomeView] Small family only, same look as iPhone. Modular face holds up to 4 widgets (can come from different household members' iPhones; one Modular face per household); each member has their own Home Screen.
- [visionOS] Widgets are persistent 3D objects on surfaces with real-world scale; users can scale 75 to 125 percent. Two distance thresholds: simplified (far: fewer details, bigger type, no buttons/toggles) and default (near: more detail, smaller type); keep shared elements across both. Mounting styles: elevated (default; works on horizontal and vertical; tilts back and casts a shadow on desks; flush like a picture frame on walls) and recessed (vertical only; cut-out depth effect; good for ambient content like weather). Declare via supportedMountingStyles(_:). Test every system frame width (you cannot adapt to it). Treatment: paper (print-like, responds to ambient light) vs glass (foreground stays bright, background layered; for information-rich widgets). Test all tint palettes and lighting. No system-wide light/dark.
- [watchOS] Smart Stack widgets use a black background by default; a meaningful colored background helps (Stocks: red/green). Supply relevance (RelevanceKit: location, workout) so the system shows or elevates the widget.
- No extra rules for macOS; not supported in tvOS.

Numbers:
- Margins: 16 pt standard, 11 pt tight. Minimum text size 11 pt. Dynamic Type Large to AX5. Animation max 2 s.
- System family sizes by context: small = iPhone Home/Today/StandBy/CarPlay/HomeView, iPad Home/Today/Lock, Mac desktop and Notification Center, Vision surfaces. Medium and large = iPhone/iPad Home and Today, Mac, Vision. Extra large = iPad, Mac, Vision (not iPhone). Extra large portrait = Vision only.
- Accessory: circular (iPhone/iPad Lock Screen; watch complication and Smart Stack), corner (watch complication only), inline (iPhone/iPad Lock Screen; watch complication), rectangular (Lock Screen; watch complication and Smart Stack).
- iPhone system widget sizes (pt), by portrait screen: 
| Screen | Small | Medium | Large | Circular | Rectangular | Inline |
| 430x932 / 428x926 | 170x170 | 364x170 | 364x382 | 76x76 | 172x76 | 257x26 |
| 414x896 | 169x169 | 360x169 | 360x379 | 76x76 | 160x72 | 248x26 |
| 414x736 | 159x159 | 348x157 | 348x357 | 76x76 | 170x76 | 248x26 |
| 393x852 / 390x844 | 158x158 | 338x158 | 338x354 | 72x72 | 160x72 | 234x26 |
| 375x812 / 360x780 | 155x155 | 329x155 | 329x345 | 72x72 | 157x72 | 225x26 |
| 375x667 | 148x148 | 321x148 | 321x324 | 68x68 | 153x68 | 225x26 |
| 320x568 | 141x141 | 292x141 | 292x311 | n/a | n/a | n/a |
- iPad (pt, Canvas = design size, Device = rendered) for the common screens; Extra large is available on iPad:
| Screen | Small | Medium | Large | Extra large |
| 768x1024 and 744x1133 Canvas | 141x141 | 305.5x141 | 305.5x305.5 | 634.5x305.5 |
| same, Device | 120x120 | 260x120 | 260x260 | 540x260 |
| 810x1080 Canvas | 146x146 | 320.5x146 | 320.5x320.5 | 669x320.5 |
| 820x1180 and 834x1194 Canvas | 155x155 | 342x155 | 342x342 | 715.5x342 |
| 834x1112 Canvas | 150x150 | 327.5x150 | 327.5x327.5 | 682x327.5 |
| 1024x1366 Canvas | 170x170 | 378.5x170 | 378.5x378.5 | 795x378.5 |
| 1024x1366 Device | 160x160 | 356x160 | 356x356 | 748x356 |
Larger iPads (954x1373, 970x1389: 162 small, 350x162 medium, 350x350 large, 726x350 XL; 1192x1590: 188 small, 412x188, 412x412, 860x412) have Canvas = Device. Full table (incl. Device values for 810/820/834 screens) in the source page.
- visionOS (pt; mm at 100%): small 158x158 (268x268), medium 338x158 (574x268), large 338x354 (574x600), XL 450x338 (763x574), XL portrait 338x450 (574x763).
- watchOS Smart Stack widget (pt): 40mm 152x69.5; 41mm 165x72.5; 42mm 176x72.5; 44mm 173x76.5; 45mm 184x80.5; 46mm 194x80.5; 49mm Ultra 3/4 198x81.5; Ultra 1/2 191x81.5.

Avoid: app-icon clones, tiny text (<11 pt), rasterized text, color-only meaning, stretched small content in big sizes, full-color images in tinted/clear modes, app-like crowded layouts, claiming real-time updates.

(note) Widgets cannot run arbitrary code on tap; plan every interaction as a deep link or an App Intent button/toggle, and drive freshness with WidgetKit timelines.

---

## Live Activities

Rules:
- Use only for tasks/events with a defined start and end, short to medium duration, not over 8 hours (delivery, match, workout, timer). Not for ads or promotions.
- Show only what is needed at a glance; detail lives in the app on tap. Tapping must deep link to the related screen; both compact leading and trailing views link to the same screen.
- Avoid sensitive information (visible on Lock Screen, Always-On). Show an innocuous summary or redact, and let users configure it.
- Match the app's look in light and dark. If you use a logo mark, show it without a container and never the entire app icon. Text: large and heavy (medium weight or more), small text sparingly.
- Do not add elements to the app that draw attention to the Dynamic Island.
- Start at expected moments (after an order, a request, a match start) and give an in-app switch to turn the activity off (e.g. unfollow); otherwise people disable Live Activities in Settings. Offer an App Shortcut that starts it (e.g. for the Action button).
- Update only when content actually changes. Alerts (screen lights up, default notification sound, expanded Dynamic Island or a banner on non-Island devices) only for essential updates; do not send push notifications for the same updates alongside.
- Prefer one Live Activity that rotates through several events over many separate ones.
- End it immediately when the task ends and set a custom dismissal time. Ended activities vanish at once from Dynamic Island and CarPlay; on Lock Screen, Mac menu bar and watchOS Smart Stack they stay up to 4 hours. Typical dismissal 15 to 30 minutes (e.g. ride summary for 30 min).
- Interactivity: only simple, direct, once-or-pause/resume actions (music, workouts, recording); prefer a single control to avoid mis-taps; offer a response button when an update invites one (contact driver).
- Animate: system or custom animations up to 2 s, content-replace transition by default, numeric transitions for scores, fade timers. No animation on Always-On reduced luminance. Animate layout changes by moving existing elements; avoid overlap; for lists, animate only the moving item and fade the others.
- Layout: adapt to screen sizes; use ContainerRelativeShape for corner radius; keep margins even and concentric to the outer rounded edge; separate content blocks with inset container shapes or thick lines; never draw content to the edge of the Island. Change height dynamically (shrink when there is less to show, grow as detail arrives).
- Start designing from the iPhone version, then add custom layouts for StandBy, CarPlay, Apple Watch.

Presentations (all four are required):
- Compact: Dynamic Island with one active activity; leading + trailing pieces either side of the TrueDepth camera. Show essential, up-to-date data; make both halves read as one piece of information with consistent color/type; keep content narrow and snug against the camera (no padding), similar sizes on both sides (shortened units, less precise data); do not obscure key status bar info.
- Minimal: with several activities, up to three appear (one attached, others detached, circular or oval). Prefer live data over a static logo (Timer shows remaining time). Tap opens the app; touch and hold expands.
- Expanded: appears on touch and hold of compact/minimal. Keep element placement consistent with compact/minimal so it expands predictably; wrap content tightly around the camera.
- Lock Screen: banner at the bottom of the Lock Screen; layout similar to expanded; also the banner shown on devices without Dynamic Island when alerting. Do not copy notification layouts. Standard layout margin 14 pt. Default background is light in light mode, dark in dark mode; custom background color/image allowed here only (not in compact/minimal/expanded; the Island background is always black opaque); pick a color that works in both modes, or one per appearance; verify on Always-On reduced luminance. The system generates the dismiss button from your colors; verify it, override with activitySystemActionForegroundColor(_:). Use bold colors in the Island to express brand; tint the key line (shown around the Island on dark backgrounds) to match your content.
- Limited width (e.g. Island in landscape): fit compact and minimal in a 28 pt diameter circle with an abbreviation or graphic; if both sides cannot be made to fit, provide the leading view only and leave trailing empty (system hides it). API: isDynamicIslandLimitedInWidth.
- StandBy: shows the minimal presentation; on tap becomes the Lock Screen presentation scaled 2x full screen (custom background extends to the whole screen). Check assets at larger scale, consider a custom layout, prefer the default background (blends with the bezel, scales larger), use standard margins and do not extend graphics to the screen edge (gets cut off), verify Night Mode red tint contrast.
- [CarPlay] The system merges compact leading+trailing into one layout on the CarPlay Dashboard; interactive elements are disabled there, so prefer timely content over buttons. Custom larger layout: declare ActivityFamily.small. The same custom layout serves CarPlay and Apple Watch.
- [macOS] Active activities appear in the menu bar of a paired Mac (compact, minimal, expanded); clicking launches iPhone Mirroring.
- [watchOS] Appears at the top of the Smart Stack, defaulting to the combined compact leading+trailing view. Tapping opens the watchOS app if present, else a full-screen view with a button to open on iPhone. A custom watch layout can show more and add buttons/toggles (but see CarPlay). Prioritize progress (ETA), interactive controls (timer/stopwatch), significant updates (scores).
- Not supported in tvOS or visionOS.

Numbers (pt):
| Screen (portrait) | Compact each side | Minimal (width range x height) | Expanded (width x height range) | Lock Screen | Limited width |
| 430x932 | 62.33x36.67 | 36.67-45 x 36.67 | 408x84-160 | 408x84-160 | 28x28 |
| 393x852 | 52.33x36.67 | 36.67-45 x 36.67 | 371x84-160 | 371x84-160 | 28x28 |
- iPad Lock Screen: 1366x1024 screen -> 500x84-160; 1194x834, 1012x834, 1080x810, 1024x768 -> 425x84-160.
- CarPlay sizes: 240x78, 240x100, 170x78. Test in the CarPlay simulator with Smart Display Zoom: Widescreen 1920x720, Portrait 900x1200, Standard 800x480.
- Watch Smart Stack sizes are identical to the watchOS widget table above.
- Margins 14 pt (Lock Screen); max animation 2 s; duration under 8 hours; Lock Screen/Mac/Watch linger up to 4 hours after end.

Avoid: duplicating notification layouts, sensitive data on Lock Screen, too many alerts, long-lived or open-ended activities, stuffing controls, unexpected auto-start with no off switch.

---

## Notifications

Rules:
- Get permission before sending anything. Be concise and valuable; one notification per event (do not repeat when ignored, it floods Notification Center and gets the app muted).
- Do not tell people to do tasks in the app; if a simple task makes sense, provide a notification action instead.
- Errors are shown with an alert (see alerts), not a notification.
- Foreground behavior: notifications do not show while the app is frontmost, but your app still receives the data. Surface it quietly (bump a badge, insert into the visible list) like Mail does.
- No sensitive, personal, or confidential content: you cannot know who is looking.
- Styles: banner/view on Lock Screen, Home Screen, HomeView or desktop; app-icon badge; Notification Center item. Communication notifications (calls, messages) use contact images/avatars and group names instead of the app icon.
- Title: shows at the top where it is most visible; keep short (especially on Apple Watch); useful headline, event name, or subject. If the title would only be generic ("New Document"), omit it and the system shows the app name. Title-style capitalization, no ending punctuation. For communication notifications the sender's name is the title.
- Body: complete sentences, sentence case, proper punctuation; do not truncate yourself (the system truncates).
- Hidden previews: when users hide previews, only the app icon and the title "Notification" show. Provide a generic body that gives enough context without details ("Friend request", "New comment", "Reminder", "Shipment"), sentence case. API: hiddenPreviewsBodyPlaceholder.
- Do not include your app name or icon (system adds a large app icon at the leading edge; communication notifications badge the contact image with a small app icon).
- Sound: optional supplement; short, distinctive, professionally produced (custom) or a system sound. Never the only carrier of important information. You cannot set vibration programmatically. API: UNNotificationSound.
- Actions: up to 4 buttons in the detail view for tasks without opening the app (e.g. Snooze). Label = short title-case verb phrase describing the result, no app name, short for localization. Do not add an action that just opens the app (tapping the notification already does). Prefer nondestructive; mark destructive actions as such (system styles them distinctly) and give context. Give each action a simple SF Symbols interface icon (shown trailing of the title).
- Badges: a filled oval with a number on the app icon = count of unread notifications only. Do not use for unrelated numbers (weather, dates, prices, scores). Never make badges the only channel for important info (users can disable them). Keep the count current: clear it as soon as notifications are read; setting it to zero removes related notifications from Notification Center. Never fake a badge in custom UI.
- [watchOS] Two stages: short look (shown on wrist raise, gone on lowering; do not use as the only channel; keep discreet, no sensitive info in title) and long look (scrollable via swipe or Digital Crown; dismiss by tap or lowering wrist). Custom long look can be static (message + static text/images; required minimum, bundled in advance, used when offline/iPhone unreachable) or dynamic (full notification content; preferred in addition). You can customize the content area but not the structure: sash on top, Dismiss button at the bottom under all custom buttons. Sash can be colored or blurred (blurred suits a top photo). Content background is transparent by default; to match system notifications use white at 18% opacity. Up to 4 custom actions; types shared with the iPhone app's registered actionable types. Animations via SwiftUI, SpriteKit, SceneKit.
- [watchOS] Double tap on supported watches runs the first nondestructive action: order actions so the most common one is first (e.g. parking: extend 5 min, 15 min, 1 hour with the common choice first).
- No additional rules for iOS, iPadOS, macOS, tvOS, visionOS.

Numbers: up to 4 notification action buttons; watch long-look background white at 18% opacity.

Avoid: duplicate/reminder-spam notifications, instructions telling users what to do, errors as notifications, app name/icon inside content, badges for non-notification data, sensitive content in titles.

(note) Grouping and timing are not covered on this HIG page. From platform knowledge: set a thread identifier (UNNotificationContent.threadIdentifier) so related notifications stack into one group (e.g. per section such as Gym or Money), set summaryArgument for grouped summaries, and for scheduled reminders use calendar/time-interval triggers with actions to complete or snooze. Respect interruption levels below when choosing timing.

---

## Managing notifications

(Covered by the `managing-notifications` slug; included because it defines interruption levels. Check `Sources`.)

Rules:
- Ask for permission before any notification; people can change it in system settings, and the app should offer its own in-app notification settings screen (see Settings) to change the choice.
- Users control delivery with Focus (filters by activity: sleep, work, reading, driving; they choose which people/apps break through) and scheduled delivery (immediate vs a summary at chosen times). Even if a Focus delays the alert, the notification is available immediately.
- Declare the type: direct communication (calls/messages) uses communication notifications (SiriKit intents such as INSendMessageIntent; the system uses the sender to decide delivery); everything else is noncommunication and must carry a system interruption level.
- Interruption levels:
| Level | Meaning | Overrides scheduled delivery | Breaks through Focus | Overrides Ring/Silent switch |
| Passive | read at leisure (a restaurant recommendation) | No | No | No |
| Active (default) | useful on arrival (a team's score update) | No | No | No |
| Time Sensitive | needs attention now (security issue, package delivery) | Yes | Yes | No |
| Critical | urgent health/safety; rare, needs an entitlement (government agencies, health/home apps) | Yes | Yes | Yes |
- Represent urgency honestly; abuse leads to users disabling notifications. Use Time Sensitive only for things happening now or within an hour. The first Time Sensitive notification from an app triggers a system explanation with an off option, and the system re-asks periodically. API: UNNotificationInterruptionLevel.
- Marketing/promotional notifications require explicit opt-in (alert, modal view or similar describing the content with a clear opt in/out). Never use Time Sensitive for marketing.
- [watchOS] Phone notification settings apply to the watch by default; swiping left on a watch notification gives per-notification options (Mute 1 Hour, Turn off Time Sensitive).

(note) Reminders such as "take medication today" or "your appointment starts in 1 hour" qualify as Time Sensitive only if truly imminent; routine nudges (log your meal, weekly review) should be Passive or Active.

---

## Controls

Rules:
- A control is a button (perform an action, open a part of the app, or launch a camera experience on a locked device) or a toggle (two states), reachable from Control Center, the Lock Screen, and the Action button. Users add them via Control Center edit mode, Lock Screen customization, and the Action button settings.
- Anatomy: symbol, title, optional value (state). Control Center shows symbol, plus title and value at larger sizes; Lock Screen shows the symbol only; Action button press-and-hold shows the symbol and value in the Dynamic Island.
- Offer controls only for actions with high benefit without opening the app (e.g. start a Live Activity from a control).
- Update controls when the user acts, when an action finishes, and remotely via push; show in-progress state.
- Symbol must stand alone (title/value may not display). For toggles give both on and off symbols (door.garage.open / door.garage.closed). Animate toggle transitions; for actions with duration, animate continuously until done (SymbolEffect).
- Tint: pick a brand tint; it colors the toggle symbol in the on state and the symbol/value in the Dynamic Island for Action button use.
- If the control needs configuration (e.g. which light), prompt on first add (promptsForUserConfiguration()); it can be changed later.
- Provide verb-based Action button hint text: controlWidgetActionHint(_:).
- If title or value vary, provide placeholder info for the gallery and Action button picker.
- Locked device: optionally redact title/value (and show the symbol in its off state) to hide personal or security data. Require authentication for security-affecting actions (door locks, starting a car): IntentAuthenticationPolicy.
- Locked camera (iOS 18+): a control can open your camera experience from the locked state (LockedCameraCapture). Reuse the same camera UI as the app for continuity; anything beyond capture needs unlock. Explain to users how to add the control.
- Supported on iOS, iPadOS, macOS; not watchOS, tvOS, visionOS.

---

## App Shortcuts

Rules:
- App Shortcuts surface key functions or content via Siri, Spotlight, the Shortcuts app, the Action button (iPhone/Watch), and Apple Pencil squeeze. They are available right after install (before first launch) and may reflect user choices later. Built with App Intents. Max 10 App Shortcuts per app. App Intents actions also let users build custom shortcuts in the Shortcuts app.
- For common domains, consider adopting app schemas (Apple Intelligence / Siri) instead of individual App Shortcuts; use App Shortcuts for unique features or custom content outside the schemas.
- Offer shortcuts for the most common and important tasks, ideally completed without leaving context; opening the app is OK for multistep tasks.
- At most one optional parameter, with predictable, familiar values (e.g. "Start [morning, daily, sleep] meditation"). If info is missing, ask a clarifying question with a sensible default (last used or time-of-day) and a short alternative list. Keep spoken phrases simple; if it is awkward aloud, drop a parameter or ask in a later step.
- Make them discoverable in-app with occasional tips (SiriTipUIView).
- Responses: Siri dialogue, snippets (static info, confirmations), Live Activities (continuous info like timers; LiveActivityIntent). Put all critical information in the full dialogue text for audio-only devices (AirPods, HomePod).
- Phrases: brief, memorable, include the app name (creatively allowed), with natural variants (Keynote: "Create a Keynote", "Add a new presentation in Keynote").
- Copy: "App Shortcuts" and "Shortcuts" in title case, Shortcuts always plural; individual user shortcuts in lowercase.
- [iOS/iPadOS] Appear in Spotlight (Top Hit, Shortcuts area); each has an SF Symbol or a preview image of the linked item. Order by importance (sets initial order in Spotlight and Shortcuts); system re-ranks by usage.
- [macOS] App Shortcuts not supported, but App Intents actions work in Shortcuts on Mac. Not supported in tvOS.

Numbers: max 10 App Shortcuts per app.

---

## Snippets

Rules:
- Compact result views shown after an action via Siri, Spotlight or Shortcuts. Two types: confirmation (confirm or cancel, may include options) and result (information only). An intent showing a snippet always shows a result; confirmation is optional.
- Parts: dialogue (spoken, shown above the custom view by default), custom view (may contain buttons), system buttons (confirmation: secondary Cancel + primary with custom label; result: single Done).
- Check contrast in light and dark against the system background; keep consistent margins.
- Keep content short; custom view height at most 400 pt; account for larger text sizes. Deep link to the app for more detail.
- Primary button label should name the outcome (Order, not OK or Proceed); default is Continue.
- Do not rely on dialogue text visually; the custom view should convey the purpose (omit dialogue from the visual part).
- Supported on iOS, iPadOS, macOS; not tvOS, visionOS, watchOS.

Numbers: 400 pt maximum custom view height.

---

## Status bars

Rules:
- [iOS/iPadOS] The status bar (time, carrier, battery) is transparent by default; content shows through. Do not leave interactive-looking controls behind it; keep it readable. Prefer a scroll edge effect (blurred view behind the status bar): ScrollEdgeEffectStyle / UIScrollEdgeEffect.
- Hide it temporarily only for full-screen media (Photos hides it with other chrome). Do not hide it permanently; offer a discoverable gesture (a single tap) to bring it back.
- Style API: UIStatusBarStyle, preferredStatusBarStyle. Not supported in macOS, tvOS, visionOS, watchOS.

---

## Complications [watchOS]

Rules:
- Show essential, dynamic data glanceable on wrist raise; static ones tend to get dropped. WidgetKit is the way for watchOS 9+ (migrate from ClockKit; ClockKit data source only for older OS). Families: circular, corner, inline, rectangular (plus legacy templates).
- Support all families; if no useful data, use an image (app icon) so the app can still launch. Offer several complications per family with different deep links (e.g. one per triathlon leg), enabling shareable watch faces.
- Privacy: Always-On display can expose data; avoid sensitive info.
- Data comes as a timeline of dated entries; updates per day and stored entries are limited, so pick time points deliberately (meeting info an hour before; forecast at the forecast time).
- Gauges: closed style for percent-of-whole (battery); open style for arbitrary min/max (speed); segmented style for app-defined ranges with fast changes (Noise).
- Tinted mode: system makes text, gauges, images one color and desaturates full-color images unless you give tinted versions; do not rely on color alone. Use line widths of at least 2 pt. Provide static placeholder images per layout (sizes vary per layout).
- Rectangular layout may also show in the Smart Stack (watchOS 10+): give it a meaningful background, relevance intents, or a custom Smart Stack layout.
- Layouts: circular text curved along the bezel fills nearly 180 degrees before truncating; extra-large circular for the X-Large face. Default SwiftUI text: rounded; circular medium weight 12/12.5/13/14.5 pt (40/41/44/45-49mm); extra-large circular medium 34.5/36.5/36.5/41 pt; corner semibold 10/10.5/11/12 pt; rectangular medium 16.5/17.5/18/19.5 pt.
- Key image sizes, regular circular (40/41/44/45-49mm): image 42/44.5/47/50 pt; closed gauge 27/28.5/31/32; open gauge 11/11.5/12/13. Corner circular image 32/34/36/38. Rectangular large image without title 162x69, 171.5x73, 184x78, 193x82 pt; with title 150x47, 159x50, 171x54, 178.5x56 (4 pt corner radius). Extra-large circular image 120/127/132/143. Full tables (stack, utilitarian, legacy circular small/modular/extra large templates) in the source.
- Not supported on iOS, iPadOS, macOS, tvOS, visionOS.

---

## Watch faces [watchOS]

Rules:
- People pick and customize faces and can share them (watchOS 7+); you can share a configured face from your app, site, Messages, Mail or social. Feature several of your complications; you may set accent color, images, styles. If the app is missing, the system prompts to install.
- Show a preview of each shared face (get it via the iOS Watch app by emailing the face to yourself; bezel can be swapped for a hardware bezel from Apple Design Resources).
- Target all watches: Series 4+ faces include California, Chronograph Pro, Gradient, Infograph, Infograph Modular, Meridian, Modular Compact, Solar Dial; Explorer needs Series 3 with cellular+. Offer an alternate configuration on faces available on Series 3 and earlier, label supported devices, and answer an incompatibility error by offering the alternative, not an error message.

---

## Top Shelf [tvOS]

Rules:
- Top Shelf is the area on the Apple TV Home Screen above the Dock showing featured content; support full-screen previews when possible. Use new, featured, recommended or resumable content; personalize; no ads; prices only on interest; avoid already purchased/watched content.
- Prefer dynamic layered images; supply at least one static fallback image 2320x720 pt (@1x 2320x720 px, @2x 4640x1440 px); it is not focusable, so do not imply interactivity.
- Layouts: carousel actions (title, optional subtitle; two buttons: primary play + More Info), carousel details (adds metadata; title of the current content, optional "Featured on My App" line), sectioned content row (focusable; fill the full screen width, at least one label), scrolling inset banner (3 to 8 images; text must be inside the image and in the accessibility label; auto-scrolls, wraps).
- Row image sizes (pt; actual / focused-safe / unfocused): poster 2:3 = 404x608 / 380x570 / 333x570; square = 608x608 / 570x570 / 500x500; 16:9 = 908x512 / 852x479 / 782x440. Mixed heights scale up to the tallest. Banner = 1940x692 / 1740x620 / 1740x560 (@2x double).

---

Sources: widgets, live-activities, notifications, managing-notifications (interruption levels only), controls, app-shortcuts, snippets, status-bars, complications, watch-faces, top-shelf. Public URL pattern: https://developer.apple.com/design/human-interface-guidelines/<slug>
