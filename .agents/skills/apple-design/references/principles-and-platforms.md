# Principles, platforms, branding, launching, onboarding

When to read this: at the start of any design decision (which principle applies, which platform traits to respect), before choosing how the app launches, how first-run onboarding works, and how much brand to express. iOS, iPadOS and macOS sections are detailed; watchOS, tvOS, visionOS, games and iPhone Duo are short.

## Design principles

Eight lenses for weighing trade-offs. They are tools, not a checklist.

Rules:
- Purpose: state what the product is for and judge every screen against it. Focus on the few features that matter most and make those excellent. Do not re-create existing solutions; define what is different.
- Agency: get people straight to the task or content. Do not lock people into flows or modes; if a guided flow is unavoidable, make it skippable and escapable.
- Agency: make every action reversible or recoverable (undo, back, restore). Recovering from a mistake must not cost time or work.
- Responsibility: be transparent about what the app does and why. Give a clear reason with every permission request. Collect only the data the product needs, protect it, and anticipate misuse.
- Familiarity: reuse concepts people know from the real world and other software. Once a behavior or look is set for an element, apply it everywhere. Give clear feedback: show when controls are available, signal content changes, use system patterns for alerts and choices.
- Flexibility: design for everyone and treat accessibility as a day-one priority. Keep content and controls in predictable positions across platforms and configurations, and use natural animation for transitions. Support several inputs (touch, keyboard, voice, pointer). Give each supported platform equal care.
- Simplicity: include only what is necessary, but simple is not minimal. Use the fewest words that carry the meaning. Establish clear hierarchy so people know where they are and what comes next.
- Craft: every detail signals care (visuals, animation, wording, audio). Prototype early, iterate, discard what fails, test in real-world conditions. Keep updating after shipping (new platform capabilities, current patterns).
- Delight: decide which emotion the product should evoke (energize, calm, thrill) and let it shape the design. Use error messages and small interactions to show character. Delight is the sum of freedom, safety, familiarity and flexibility.

Avoid:
- Mistaking delight for decoration: do not let flourish get in the way of the core task.
- Treating onboarding, modes or fixed flows as the default way to use the product.

Note (Liquid Glass): this page was reintroduced in the June 2026 revision; it has no glass-specific rules.

## Designing for iOS

Rules:
- [iOS] Show few on-screen controls; keep secondary actions and details discoverable with minimal interaction.
- [iOS] Adapt to orientation (portrait and landscape), Dark Mode and Dynamic Type; let people pick their configuration.
- [iOS] Place reachable controls in the middle or bottom of the screen (one- or two-handed use). Support swipe-to-go-back and swipe actions on list rows.
- [iOS] With permission, use platform data and capabilities instead of asking people to type: payments, biometric authentication, location.
- [iOS] Integrate system features: widgets, Home Screen quick actions, Spotlight, Shortcuts, activity views (share sheet).

Numbers:
- Viewing distance: no more than about 1 to 2 feet.
- Usage is bursty: sessions from 1 to 2 minutes (check, track, message) up to an hour or more; many apps open at once with frequent switching.
- Inputs: Multi-Touch, virtual keyboard, voice, gyroscope, accelerometer; spatial interactions possible.

## Designing for iPadOS

Rules:
- [iPadOS] Use the large display to elevate content; minimize modal interfaces and full-screen transitions. Put controls where they are reachable but not in the way.
- [iPadOS] Choose content size and density from viewing distance and input mode (touch vs pointer vs Pencil).
- [iPadOS] Support Multi-Touch, hardware keyboard, trackpad/pointer and Apple Pencil, and consider interactions that combine them.
- [iPadOS] Adapt to orientation, multitasking modes (several apps on screen), Dark Mode and Dynamic Type, and keep working when the app runs on macOS.
- [iPadOS] Integrate multitasking, widgets and drag and drop (inter-app).

Numbers:
- Viewing distance: typically within about 3 feet; the device may be held, on a surface or on a stand.

## Designing for macOS

Rules:
- [macOS] Use large displays to show more content with fewer nesting levels and less modality, while keeping a comfortable information density.
- [macOS] Let people resize, hide, show and move windows; support full-screen mode.
- [macOS] Expose every command through the menu bar; handle keyboard shortcuts and keyboard-only workflows.
- [macOS] Support high-precision input for pixel-accurate selection and edits.
- [macOS] Support trackpad gestures and touch displays: use larger tap targets and controls that expand on touch, but keep control size and density unchanged so the layout stays optimized for keyboard and pointer. Touch is for brief, intentional interactions, not sustained work (note: guidance added October 28, 2026).
- [macOS] Allow personalization: customizable toolbars, window configurations, color and font choices.
- [macOS] Support smooth transitions between active and inactive app states; integrate the menu bar, file management, full screen and Dock menus.

Numbers:
- Interaction length: minutes to several hours; multiple apps open; extra displays possible (including iPad via Sidecar).
- Inputs: keyboard and pointer primarily; also trackpad, touch display, Siri, Voice Control, game controller.

## Designing for watchOS

Rules:
- [watchOS] Single-screen, glanceable interactions with one or two gestures; sessions often under a minute.
- [watchOS] Keep navigation hierarchy shallow; use the Digital Crown for vertical scrolling and switching screens.
- [watchOS] Put key data in complications (visible on every wrist raise, tap opens the app) and notifications (important actions without opening the app); both are used more than the app itself.
- [watchOS] Use on-device data to anticipate needs. Use background color for supporting information and materials for hierarchy.
- [watchOS] The app must work independently; complications and notifications are complemented by extra detail in the app. Support Always On and the Action button.

## Designing for tvOS

Rules:
- [tvOS] Design for viewing from 8 feet or more: edge-to-edge artwork, legible from across the room, subtle animation, rich audio.
- [tvOS] Embrace the focus system (it highlights and expands the focused item) and Siri Remote gestures.
- [tvOS] Multiuser: make sign-in easy and infrequent, handle shared sign-in, switch profiles when the viewer changes.
- [tvOS] Integrate the TV app, SharePlay, Top Shelf, TV provider accounts; support picture-in-picture.

## Designing for visionOS

Rules:
- [visionOS] Launch into the Shared Space by default; use a Full Space only for moments that need it. For each key moment pick the minimum immersion that fits (window, in-between, fully immersive).
- [visionOS] Use standard windows (planes in space) for UI-centric tasks; the system scales them dynamically by distance.
- [visionOS] Comfort: place content in the field of view relative to the head; avoid jarring, fast or frame-less motion; support indirect gestures (eyes to target, tap with hands resting); keep direct-touch content near and brief; do not make people move much in full immersion.
- [visionOS] Primary input is eyes plus indirect gesture; direct touch is secondary. Use SharePlay for shared activities (spatial Personas).
- [visionOS] Safety: not for use while driving or near hazards; device is for ages 13 and up.

## Designing for games

Rules:
- Let people play right after install: keep the initial download to 30 minutes or less, fetch the rest in the background. Choose defaults from the device (resolution, accessories, accessibility settings).
- Teach through a playable tutorial; offer a written tutorial only as optional reference. Defer permission requests to the moment the feature needs them; ask for ratings only after quality play time.
- Keep text legible and buttons tappable per the tables; use resolution-independent or vector assets; respect safe areas; make in-game menus adapt to aspect ratios such as 16:10, 19.5:9 and 4:3 (relative constraints, not fixed layouts).
- Support each platform's default input and add alternatives to a game controller (not every player can use one). Offer on-screen touch controls on iPhone and iPad. Do not rely on color alone; provide subtitles; let players customize type size, control mapping, motion intensity and sound balance. Avoid stereotypes.
- Adopt Game Center, GameSave (cross-device resume), Core Haptics, Spatial Audio.

Numbers:

| Platform | Default text | Min text | Default button | Min button |
|---|---|---|---|---|
| iOS, iPadOS | 17 pt | 11 pt | 44x44 pt | 28x28 pt |
| macOS | 13 pt | 10 pt | 28x28 pt | 20x20 pt |
| tvOS | 29 pt | 23 pt | 66x66 pt | 56x56 pt |
| visionOS | 17 pt | 12 pt | 60x60 pt | 28x28 pt |
| watchOS | 16 pt | 12 pt | 44x44 pt | 28x28 pt |

- Default input: iOS touch (+ controller); iPadOS touch (+ controller, keyboard, mouse, trackpad, Pencil); macOS keyboard/mouse/trackpad (+ controller, touch); tvOS remote (+ controller, keyboard, mouse, trackpad); visionOS eyes and hands per the prose (the source table says Touch) (+ controller, keyboard, mouse, trackpad, spatial controller); watchOS touch only (no controllers).

## Designing for iPhone Duo

New dual-display iPhone form factor (page dated September 9, 2026). Still iPhone: iOS rules apply. Low priority for this project.

Rules:
- [iOS] Build layouts to resize: size classes (compact width on the outer display, regular width on the inner), layout margins, safe area insets. No fixed widths or display-specific dependencies. Do not design one layout per pose.
- [iOS] Keep functionality and state identical across displays and poses; the larger inner display may show one extra hierarchy level (for example list plus detail).
- [iOS] Toolbars, tab bars and navigation controls move to the side on the outer display and in landscape on the inner display; inner portrait keeps horizontal bars. Standard components do this automatically; do not override default bar placement.
- [iOS] Reserved regions: outer camera (always, expands into the Dynamic Island), inner camera (only when active), folding region (when partially open). Use `ReservedRegion` (SwiftUI) / `UIView.ReservedRegion` (UIKit) for custom components. Use an even column count in grids; avoid drastic layout changes when folding.
- [iOS] Toolbar placement order on the vertical axis: Back/Close first, then prominent actions such as Done. Group items with `ToolbarItemGroup` / `UIBarButtonItemGroup` (no manual spacing); set overflow priority with `ToolbarItemVisibilityPriority`; give every item a title plus symbol; prefer symbols over text; use the system overflow menu and reserve the ellipsis symbol for overflow only.
- [iOS] Compression: navigation-focused views keep the tab bar and overflow toolbar items (default); task-focused views minimize the tab bar (`ToolbarVerticalCompressionBehavior`).
- [iOS] Arrangement views (`ArrangementView`, `UIArrangementViewController`): split arrangement divides primary and secondary views (horizontal when wider than tall); overlay arrangement stacks them and separates them across a partial fold. Keep navigation containers outside them.
- [iOS] Games: fill the screen in every pose; prefer changing aspect ratio over letterboxing; keep text and control sizes constant.

## Branding

Rules:
- Express brand through voice and tone of all written text.
- Use the accent/brand color sparingly: primary actions and status indicators (unread badge, selected tab icon). Too much dilutes impact. Newer option (Liquid Glass): move brand color into the content layer, which scrolls beneath glass controls and is picked up dynamically (page revised September 9, 2026).
- A custom font is fine if legible at all sizes and it supports bold text and Dynamic Type. Best pattern: custom font for headlines and subheadings, system fonts for body and captions.
- Brand through familiar components. When customizing, keep size, placement and behavior platform-appropriate. Use standard patterns, symbols, navigation and modality conventions even in a stylized UI.
- Branding defers to content: no space spent on pure brand assets; do not show the logo throughout unless needed for context.
- Do not use the launch screen for branding (use a welcome or onboarding screen instead).
- Do not put Apple trademarks in the app name or images; follow Apple's trademark guidelines.

Avoid:
- Brand color on every control; logos on every screen; branded launch screens.

## Launching

Rules:
- Launch instantly; people do not want to wait more than a couple of seconds.
- Restore the previous state on restart in as much detail as possible (scroll position, window state and location).
- [iOS] [iPadOS] [tvOS] Provide a launch screen (system shows it immediately and swaps it for the first screen). macOS, visionOS and watchOS do not require one.
- Launch screen: nearly identical to the first screen of the app (a solid-color first screen means a solid-color launch screen); match device orientation and appearance mode; no text (it will not be localized); no logo, ad, splash-screen or About look unless it is a fixed part of the first screen. Its only job is to make the app feel fast.
- Splash screen, if you must have one: show it at the start of onboarding, or right after launch if there is no onboarding; keep it brief.
- [iOS] [iPadOS] Launch in the current device orientation if both are supported; if only one is supported, launch in it. A landscape-only UI must work for both landscape directions.
- [tvOS] The launch screen is static (unlike layered images elsewhere). Live-viewing apps may auto-start playback after a few seconds of inactivity.
- [visionOS] Even a fully immersive app should launch in the Shared Space, with a control to enter the Full Space.

## Onboarding

Rules:
- Prefer none: let people understand by using the app. If needed, make it fast, fun and optional. It starts after launching completes, never as part of launch.
- Teach through interactivity (let people safely try the action) rather than static slides.
- Prefer context-specific tips shown near the relevant UI (TipKit) over a single up-front flow.
- A mandatory prerequisite flow must be brief and not require memorizing. Do not try to teach too much.
- A separate tutorial should be optional; if skipped, do not show it again on later launches, but keep it findable (help, account or settings).
- Teach the app's experience only; do not teach the system or device.
- Do not make people wait for large downloads: bundle enough content to start immediately.
- Keep licensing and legal text out of onboarding (the App Store shows it); if unavoidable, integrate it unobtrusively.
- Postpone nonessential setup and customization; ship sensible defaults.
- Permissions: if the app cannot function without private data, request during onboarding and explain the benefit; otherwise ask when the person first uses the feature that needs it.
- Ask for ratings or purchases only after people have engaged with the app.

Sources: design-principles, designing-for-ios, designing-for-ipados, designing-for-macos, designing-for-watchos, designing-for-tvos, designing-for-visionos, designing-for-games, designing-for-iphone-duo, branding, launching, onboarding
(URLs: https://developer.apple.com/design/human-interface-guidelines/<slug>)
