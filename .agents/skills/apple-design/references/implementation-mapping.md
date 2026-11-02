# Implementation mapping: from HIG rules to code

When to read this: when you are about to turn HIG guidance into code, especially if the target is not a pure native SwiftUI app (a web app/PWA, or a cross-platform framework). This file is NOT Apple guidance: it is the project's own translation layer, written from general platform knowledge. Everything in the other references is Apple guidance; verify any claim here against current docs before relying on it for a release.

## 1. Choose the target first (decision lives in `docs/decisions.md`)

| Target | Fidelity to the HIG | Notes |
|---|---|---|
| Native SwiftUI (iOS/iPadOS, optionally macOS) | Highest. System components give Liquid Glass, Dynamic Type, Dark Mode, accessibility, haptics for free | Only way to use HealthKit, widgets, Live Activities, Siri/App Shortcuts, Sign in with Apple native sheet, rich haptics |
| Web app / PWA | Medium. You re-implement the look; no native controls | No HealthKit, no haptics API on iOS Safari, Web Push on iOS only for installed home-screen web apps (verify current support) |
| Cross-platform (React Native, Flutter, Capacitor, ...) | Medium to low unless you build native views per platform | Flutter's Cupertino widgets and React Native's native components approximate iOS; Liquid Glass and system materials usually need native modules |

Consequence for this project: the Health module (Apple Health / Apple Fitness data) needs a native iOS client, or a user-driven export/import path. A pure web app cannot read HealthKit. Decide this before choosing the stack.

## 2. HIG concept to SwiftUI

| HIG concept | SwiftUI |
|---|---|
| Tab bar | `TabView` with `Tab` |
| Navigation stack / sidebar-detail | `NavigationStack`, `NavigationSplitView` |
| List / grouped list / table | `List`, `Form`, `Table` |
| Sheet / popover / alert / confirmation | `.sheet`, `.popover`, `.alert`, `.confirmationDialog` |
| Toolbar, menus, context menus | `.toolbar`, `Menu`, `.contextMenu` |
| Search | `.searchable` |
| Pickers, toggles, steppers, sliders | `Picker`, `Toggle`, `Stepper`, `Slider`, `DatePicker` |
| Text styles (Dynamic Type) | `.font(.body)`, `.title`, `.headline`, ... never fixed sizes |
| Semantic colors | `Color.primary`, `.secondary`, `Color(.systemBackground)`, asset-catalog color sets |
| Materials / Liquid Glass | `.background(.regularMaterial)`, `glassEffect` (newest OS; check availability) |
| SF Symbols | `Image(systemName:)`, `Label` |
| Charts | Swift Charts (`Chart`) |
| Haptics | `.sensoryFeedback`, `UIFeedbackGenerator` |
| Widgets / Live Activities | WidgetKit, ActivityKit |
| Health data | HealthKit (native only) |

Rule of thumb: use the system component first; build custom only if no system component fits, and then copy the system component's behaviour (press state, accessibility label, Dynamic Type, Dark Mode, Reduce Motion).

## 3. HIG concept to web (HTML/CSS)

- **Font.** `font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;` gives SF on Apple devices and the native UI font elsewhere. Do not self-host SF fonts on the web (licensing: see `resources.md`).
- **Type scale.** Use the iOS text-style table in `foundations-visual.md` as the scale (body 17 pt maps to 17 CSS px at default). Size in `rem` so browser text-size settings work; Safari also exposes `font: -apple-system-body` for Dynamic Type (verify before depending on it). Support zoom to 200% without loss of content.
- **Color.** Define semantic tokens as CSS custom properties on `:root` (`--label`, `--secondary-label`, `--background`, `--grouped-background`, `--separator`, `--tint`, ...), override under `@media (prefers-color-scheme: dark)`, and under `@media (prefers-contrast: more)`. Set `color-scheme: light dark`. Follow the system appearance; do not add an in-app light/dark switch (HIG Dark Mode rule). Contrast at least 4.5:1, aim for 7:1 for small text.
- **Safe areas.** Add `viewport-fit=cover` to the viewport meta tag and pad with `env(safe-area-inset-top|right|bottom|left)` so content clears the notch, Dynamic Island and home indicator.
- **Hit targets.** At least 44 x 44 CSS px for anything tappable (HIG: 44 x 44 pt). Spacing between targets so they do not feel cramped.
- **Motion.** Wrap non-essential animation in `@media (prefers-reduced-motion: no-preference)`; under reduce, use fades or nothing. Prefer spring-like easing (CSS `linear()` easing or the Web Animations API); keep durations short and interruptible.
- **Materials.** `backdrop-filter: blur(...) saturate(...)` with a translucent background approximates Apple materials. It does not reproduce Liquid Glass. Use it sparingly for bars and sheets, always provide an opaque fallback for `prefers-reduced-transparency` and for browsers without support.
- **Icons.** SF Symbols cannot be shipped in a web app (licence). Use an open icon set with a similar weight/size system, matched to the text weight; keep one stroke weight; label icon-only buttons (`aria-label`).
- **Forms.** Use real inputs with correct `type`, `inputmode`, `autocomplete`, and labels so iOS shows the right keyboard and autofill (HIG: entering data, text fields, virtual keyboards).
- **Navigation.** Bottom tab bar for 3 to 5 top-level sections on phones; sidebar on wide screens (HIG: tab bars, sidebars). Back navigation must preserve scroll and state; support swipe-back where possible.
- **PWA.** Web manifest, `apple-touch-icon` (180 x 180 px), standalone display mode. Notifications on iOS require the web app to be installed to the Home Screen (verify current iOS support).
- **Accessibility.** Semantic HTML, focus order, visible focus rings, ARIA only where HTML cannot express the role, labels for every control, no color-only state (see `accessibility.md`).

## 4. Charts and dashboards (this project is chart-heavy)

Follow `components-actions-input.md` (Charts section) and `patterns-1.md` (charting-data) for the rules. Implementation: Swift Charts on native; on web use a library that renders accessible SVG (add text alternatives / data tables for each chart). Keep axes, units and goals explicit; one story per chart.

## 5. Quality gate before calling UI "done"

Run the checklist at the end of `accessibility.md`, then check: Dark Mode, Increase Contrast, Reduce Motion, Reduce Transparency, largest Dynamic Type size, smallest and largest supported screen, landscape/iPad multitasking widths, offline/empty/error/loading states, undo for destructive actions.
