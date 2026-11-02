---
name: apple-design
description: Apple-level UI/UX design guidance distilled from Apple's complete Human Interface Guidelines (all 158 pages: foundations, patterns, components, inputs, technologies, Liquid Glass). Use whenever you design, build, review or restyle any user interface or user-facing text, choose colors, fonts, spacing, icons, navigation, charts, notifications, widgets or onboarding, integrate Apple technologies (HealthKit, Sign in with Apple, iCloud, Siri, AI features), or when the user says "Apple design", "HIG", "make it look/feel native", "professional UI". Works for native SwiftUI and for web or cross-platform apps that must feel like Apple software.
---

# Apple design (HIG) skill

Agent-neutral. Lives in `.agents/skills/apple-design/`. Source: Apple's public Human Interface Guidelines, fetched 2026-11-02 and rewritten (not copied) into compact, checkable rules with exact numbers. Each reference ends with a `Sources` line naming the HIG pages; the full page is at `https://developer.apple.com/design/human-interface-guidelines/<slug>`.

## How to use

1. Before any UI work, read the references that match the task (table below). References are long (up to 43 KB): list sections with `grep -n '^## ' <file>` and read each needed section completely, not just a heading. Do not rely on memory of Apple's design: the guidance changed with Liquid Glass.
2. Say the target platform(s) first (iPhone, iPad, Mac, web). For web, PWA or cross-platform targets read `implementation-mapping.md` first (pt becomes CSS px, SF fonts and SF Symbols cannot be shipped, no HealthKit/haptics on the web) and then the HIG references for the rules themselves. Untagged rules apply everywhere; `[iOS]`, `[iPadOS]`, `[macOS]`, `[watchOS]`, `[tvOS]`, `[visionOS]` tags are platform-specific.
3. Use the system component before building a custom one; when you must go custom, copy the system behaviour (states, accessibility, Dynamic Type, Dark Mode, Reduce Motion).
4. Before finishing, run the checklist at the end of `references/accessibility.md` and the quality gate in `references/implementation-mapping.md`.
5. If a rule here conflicts with the HIG page, the page wins; open it and fix the reference.

## Which reference to read

| Task | Read |
|---|---|
| Starting a design, platform choice, brand, launch screen, onboarding | `principles-and-platforms.md` |
| Copy, labels, error messages, inclusive language, localisation, RTL, privacy prompts | `writing-inclusion-privacy.md` |
| Color, Dark Mode, typography, materials/Liquid Glass, motion, layout, safe areas, images | `foundations-visual.md` |
| Accessibility, VoiceOver, contrast, hit targets, reduce motion | `accessibility.md` |
| SF Symbols, icons, app icon | `icons-symbols-appicon.md` |
| Navigation (tab bar, sidebar, split view), lists, sheets, alerts, popovers, scroll views, windows, search field | `components-structure.md` |
| Buttons, toolbars, menus, toggles, pickers, text fields, keyboards, sliders, progress, gauges, charts | `components-actions-input.md` |
| Charts as a pattern, entering data, feedback, loading, search, settings, undo, modality | `patterns-1.md` |
| Accounts and sign-in, notification etiquette, help and tips, sharing, drag and drop, haptics, workouts, ratings prompts, file management, printing, full screen, multitasking, audio/video | `patterns-2.md` |
| Widgets, Live Activities, notifications, Controls, App Shortcuts, status bars | `system-experiences.md` |
| Gestures, hardware keyboard shortcuts, pointer, Apple Pencil, focus | `inputs.md` |
| HealthKit, Sign in with Apple, iCloud, AI/ML features, Siri, Maps, Apple Pay, in-app purchase, Mac Catalyst, others | `technologies.md` |
| Design assets, fonts, SF Symbols app, Icon Composer, UI kits, licences | `resources.md` |
| Turning rules into SwiftUI / web code, web or cross-platform apps, PWA | `implementation-mapping.md` |

## Non-negotiables (summary; details and exceptions in the references)

- System first: system components, system colors, system fonts (text styles), SF Symbols. No hard-coded colors or fixed font sizes.
- Hit targets at least 44 x 44 pt (60 x 60 pt in visionOS). Custom buttons need a press state.
- Default body size 17 pt on iOS/iPadOS (minimum 11 pt). Support Dynamic Type at every size including accessibility sizes; no truncation of important text.
- Follow the system appearance (Light/Dark); no in-app theme switch. Every custom color has light, dark and increased-contrast variants. Text contrast at least 4.5:1 (aim 7:1 for small text).
- Never convey meaning by color alone.
- Web/cross-platform: the same rules apply with CSS equivalents (system font stack, `rem` sizes, `prefers-color-scheme`, `prefers-reduced-motion`, `prefers-contrast`, 44 CSS px targets, safe-area insets); see `implementation-mapping.md`.
- Honor Reduce Motion, Reduce Transparency, Increase Contrast, Bold Text, VoiceOver, Voice Control.
- Liquid Glass is for the controls/navigation layer floating above content (tab bars, sidebars, toolbars); do not use it in the content layer (cards, lists), do not stack many custom glass controls, use tint sparingly.
- Onboarding and setup: ship defaults that work for most people, ideally no setup before use. Permissions: purpose string is one specific sentence in sentence case; a pre-alert screen has a single "Continue" button, never "Allow".
- Alerts: not for common undoable actions (offer undo instead); only for uncommon, irreversible destructive ones, with Cancel included, destructive style only on the destructive button, and Cancel never the default.
- Writing: plain language, no jargon, no cute labels; errors sit next to the problem, do not blame, say how to fix it; button labels are verb-first in title-style capitalisation.
- Fast data entry is a design goal: prefill sensible defaults, use the right keyboard type, avoid unnecessary modals (see `patterns-1.md`, entering data).

## Gaps to know about

The HIG publishes some values only as images (system color RGB values, per-device screen sizes, some haptics tables, app icon grid). They are not in the references. Use the system APIs and Apple's design resources (`resources.md`) for those.

## Refreshing the references

Apple updates the HIG often. To re-fetch (needs python3, network):

```bash
OUT=$(mktemp -d)
curl -sL -o "$OUT/index.json" "https://developer.apple.com/tutorials/data/index/design--human-interface-guidelines"
mkdir -p "$OUT/raw" "$OUT/md"
python3 -I .agents/skills/apple-design/scripts/fetch_hig.py "$OUT"
python3 -I .agents/skills/apple-design/scripts/to_md.py "$OUT"
# Markdown per page is now in $OUT/md/<slug>.md; diff against the references and update them.
```

Re-write changed pages in your own words (the text is Apple's copyright; do not paste it), keep exact numbers, update the date above and the `Sources` lines.
