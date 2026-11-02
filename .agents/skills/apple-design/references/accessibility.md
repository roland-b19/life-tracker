# Accessibility and VoiceOver

When to read this: before building any screen, and again as a final checklist before shipping. Covers vision, hearing, mobility, speech and cognitive accessibility, plus VoiceOver (labels, grouping, order, rotor). Platform-specific numbers are in tables; the closing checklist condenses everything.

## Accessibility

Rules:
- An accessible UI is intuitive (familiar, consistent interactions), perceivable (never one sensory channel only) and adaptable (follows system accessibility settings, lets people personalize).
- Audit with Accessibility Inspector. Declare supported features in App Store Connect via Accessibility Nutrition Labels.

### Vision
- Support text enlargement of at least 200% (140% on watchOS), by Dynamic Type or custom UI. (Dynamic Type details live in the Typography page.)
- For custom type styles use the platform defaults below; with a thin custom font weight go larger than these sizes.
- Meet WCAG AA contrast (Accessibility Inspector uses it). If the default palette does not meet it, provide a higher-contrast scheme when Increase Contrast is on. Check both light and dark appearances.
- Prefer system-defined colors: they carry accessible variants that adapt to Increase Contrast and light/dark.
- Never convey state or meaning by color alone (red-green and blue-orange pairs are the worst). Add shapes or icons. Consider letting people customize chart colors.
- Describe the UI and content for VoiceOver (see VoiceOver below).

Numbers:

| Platform | Default text size | Minimum text size |
|---|---|---|
| iOS, iPadOS | 17 pt | 11 pt |
| macOS | 13 pt | 10 pt |
| tvOS | 29 pt | 23 pt |
| visionOS | 17 pt | 12 pt |
| watchOS | 16 pt | 12 pt |

| Text size | Weight | Min contrast ratio |
|---|---|---|
| Up to 17 pt | all | 4.5:1 |
| 18 pt | all | 3:1 |
| any | bold | 3:1 |

- Contrast standards named: WCAG and APCA.

### Hearing
- Never put dialogue or crucial info in audio only. Offer, as appropriate, with customizable visual presentation: captions (text equivalent of audio, synced), subtitles (onscreen dialogue in preferred language), audio descriptions (spoken narration of visual-only info, placed in natural pauses), transcripts (full text of audio and visual content; good for podcasts and audiobooks).
- Pair audio cues (success chime, error sound, game feedback) with matching haptics. iOS and iPadOS also offer Music Haptics and Audio graphs.
- Pair audio cues with visual cues, especially for off-screen events in games and spatial apps; when audio guides to an action, add a visual pointer.

### Mobility
- Meet the minimum control sizes below; aim for the default.
- Spacing matters as much as size: about 12 pt padding around elements with a bezel, about 24 pt around elements without a bezel (measured from visible edges).
- Use the simplest gesture for frequent actions; avoid custom multifinger and multihand gestures.
- Always offer an on-screen alternative to a gesture (e.g. swipe-to-dismiss also gets a button).
- Label elements so Voice Control works; support Siri and Shortcuts (Action button, Home Screen, Control Center triggers).
- Test with VoiceOver, AssistiveTouch, Full Keyboard Access, Pointer Control, Switch Control.

Numbers:

| Platform | Default control size | Minimum control size |
|---|---|---|
| iOS, iPadOS | 44x44 pt | 28x28 pt |
| macOS | 28x28 pt | 20x20 pt |
| tvOS | 66x66 pt | 56x56 pt |
| visionOS | 60x60 pt | 28x28 pt |
| watchOS | 44x44 pt | 28x28 pt |

### Speech
- Everything must work with the keyboard alone (Full Keyboard Access). Do not override system-defined keyboard shortcuts, including the accessibility ones.
- Support Switch Control (external hardware, game controllers, sounds like a click or pop): select, tap, type, draw must be reachable.

### Cognitive
- Keep actions simple and consistent; prefer system gestures and behaviors over custom ones.
- Minimize timer-based auto-dismissing views and controls; dismiss on explicit action.
- Games: consider difficulty accommodations (looser success criteria, adjustable reaction time, control assistance).
- Do not autoplay audio or video without discoverable start/stop controls; consider a global opt-out for autoplay (isVideoAutoplayEnabled, animated images).
- Video: respond to the Dim Flashing Lights setting.
- Reduce Motion: when on, reduce automatic and repetitive animation (zooming, scaling, peripheral motion). Tactics: tighten springs to cut bounce; track animation directly to the gesture; do not animate z-axis depth changes; replace x/y/z transitions with fades; do not animate into or out of blurs.
- Assistive Access (iOS, iPadOS): when on, keep only core functionality, drop noncritical workflows and UI, split multistep flows to one interaction per screen, and ask confirmation twice before hard-to-recover actions such as deleting a file.

Avoid:
- Fast-moving or blinking animation in excess (distraction, dizziness, epileptic episodes).

### Platform considerations
- [visionOS] Prioritize comfort: keep elements in the field of view; prefer horizontal over vertical layouts (neck strain); do not demand attention in different places in quick succession; slow and soften animation, especially in the periphery; gentle camera and video motion; never move the world without user control; do not anchor content to the head (feels confining, blocks Pointer Control); minimize large or repetitive gestures. Features to expect: head and hand Pointer Control, Zoom.
- No extra considerations for iOS, iPadOS, macOS, tvOS, watchOS.

## VoiceOver

Rules:
- Give every key interface element a descriptive alternative label (not visible). System controls get generic labels; improve them. Label every custom element. Keep labels current as UI and content change. (SwiftUI: accessibility modifiers.)
- Describe meaningful images, only what the image itself conveys (nearby captions are already read).
- Charts and infographics: give a concise description of what they convey, and make any interactions available to VoiceOver users through the accessibility APIs' custom-element representations.
- Exclude purely decorative images (accessibilityHidden(_:), accessibilityElement, isAccessibilityElement).
- Give each screen a unique, succinct title (the first thing read on arrival) and accurate section headings.
- Make visual-only relationships explicit: grouping, order, links. VoiceOver follows reading order of the active language and locale (US English: top-to-bottom, left-to-right). Group an image with its caption so they are read together, otherwise all images are read before captions (shouldGroupAccessibilityChildren).
- Announce visible content or layout changes (AccessibilityNotification), otherwise the user's mental map goes stale.
- Support the rotor where possible: expose headings, links and other content types (AccessibilityRotorEntry in SwiftUI, UIAccessibilityCustomRotor in UIKit, NSAccessibilityCustomRotor in AppKit). The rotor also opens the braille keyboard.
- [visionOS] With VoiceOver on, apps with custom gestures receive no hand input by default; users can opt out with Direct Gesture mode. Do not make custom gestures the only path.
- Also works in Unity apps via Apple's Unity plug-ins.

## Final checklist
- [ ] Text scales to at least 200% (140% watchOS); layouts reflow, nothing truncates critically.
- [ ] Custom text no smaller than platform minimum (iOS/iPadOS 11, macOS 10, tvOS 23, visionOS 12, watchOS 12 pt); defaults 17/13/29/17/16 pt; thin fonts sized up.
- [ ] Contrast: 4.5:1 up to 17 pt, 3:1 at 18 pt or bold; checked in light, dark and Increase Contrast.
- [ ] System colors used; no meaning by color alone (icon or shape added).
- [ ] Hit targets at least default (44x44 iOS/iPadOS/watchOS, 28 macOS, 66 tvOS, 60 visionOS), never below minimum; padding 12 pt (bezeled) or 24 pt (bezel-less).
- [ ] Every gesture has a visible-control alternative; no custom multifinger gestures for frequent actions.
- [ ] Full keyboard operation; system shortcuts not overridden; Switch Control and Voice Control labels present.
- [ ] Audio paired with haptics and visual cues; captions, subtitles, audio descriptions or transcripts for media.
- [ ] No autoplay without controls; Dim Flashing Lights honored; no timer-only auto-dismiss.
- [ ] Reduce Motion honored (fades instead of x/y/z transitions, no blur transitions, tighter springs, gesture-tracked animation).
- [ ] VoiceOver: labels on all key and custom elements, decorative images hidden, meaningful images and charts described, unique titles, headings, correct grouping and order, change announcements, rotor entries.
- [ ] Destructive actions: double confirmation under Assistive Access.
- [ ] [visionOS] Comfort rules applied; no head-anchored content.

Sources: accessibility, voiceover
