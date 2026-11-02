# Apple public design resources (inventory)

Read 2026-11-02 from developer.apple.com (JS-rendered; text via page-to-text fetch and `/tutorials/data/design/human-interface-guidelines/*.json`). UNVERIFIED = not confirmed in a source. Versions change every WWDC; re-check https://developer.apple.com/design/resources/.

## 1. Where things live

- HIG: https://developer.apple.com/design/human-interface-guidelines/ ; resources: /design/resources/ ; what's new (dated changelog): /design/whats-new/  ; fonts: /fonts/ ; SF Symbols: /sf-symbols/ ; Icon Composer: /icon-composer/ ; license terms: /support/terms/ (on developer.apple.com).

HIG top-level sections (https://developer.apple.com/design/get-started/): getting-started, foundations, patterns, components, inputs, technologies, under `/design/human-interface-guidelines/<section>`. Useful pages: `/typography`, `/color`, `/layout`, `/materials`, `/app-icons`, `/sf-symbols`, `/accessibility`, `/design-principles`.

## 2. Fonts (https://developer.apple.com/fonts/)

All downloads are DMGs at `https://devimages-cdn.apple.com/design/resources/download/<file>`.

| Font | File | What it is (per fonts page) |
|---|---|---|
| SF Pro | SF-Pro.dmg | System sans for iOS, iPadOS, macOS, tvOS, visionOS (HIG typography). 9 weights, variable optical sizes, 4 widths, rounded variant, Latin/Greek/Cyrillic, 150+ languages |
| SF Compact | SF-Compact.dmg | System font of watchOS; small sizes, narrow columns; rounded variant |
| SF Mono | SF-Mono.dmg | Monospaced, 6 weights, used in Xcode; Latin/Greek/Cyrillic |
| New York (NY) | NY.dmg | Serif companion to SF, 6 weights, variable optical sizes |
| SF Arabic / Armenian / Georgian / Hebrew | SF-Arabic.dmg etc. | Script extensions designed to pair with SF Pro |

**License (from the fonts page; quotes are Apple's):**
- Two agreements are shown: San Francisco Font License (EA1370, 2/24/2016) "for iOS, OS X and tvOS application uses only", and San Francisco Compact Font License (EA1371) "for Apple watchOS uses only". The page does not say which license covers SF Mono, New York or the script fonts: UNVERIFIED.
- Scope: font "is to be used solely for creating mock-ups of user interfaces to be used in software products running on Apple's iOS, OS X or tvOS".
- Only for registered Apple Developers (or as Apple permits in writing).
- Forbidden: mock-ups for software on "any non-Apple operating system"; "You may not embed the Apple Font in any software programs or other products"; using it to create "documentation, artwork, website content or any other work product"; making it available over a network for multi-computer use; reverse engineering or derivative works; separating components and redistributing.
- HIG typography says: "don't embed system fonts in your app or game"; use the system API constants instead. https://developer.apple.com/design/human-interface-guidelines/typography

**When to use:** designers installing fonts locally to mock up Apple-platform UI (Figma/Sketch). An engineer or coding agent building native Apple apps should not bundle the files; call the system font API (SwiftUI, UIKit, AppKit, Core Text; links on the fonts page). Never ship them in web/Android builds or commit them here.

## 3. SF Symbols (https://developer.apple.com/sf-symbols/)

- App: `SF-Symbols-27.dmg?2` (https://devimages-cdn.apple.com/design/resources/download/SF-Symbols-27.dmg?2). Requires macOS Sonoma or later.
- 7,000+ symbols, 9 weights, 3 scales, 20+ scripts, 4 rendering modes (monochrome, hierarchical, palette, multicolor) plus optional gradient; Draw On/Off, Bounce, Wiggle, Rotate, Breathe, Magic Replace animations; export for custom symbols.
- What's-new log says "SF Symbols 8 beta" on 2026-06-08 (https://developer.apple.com/design/whats-new/); the download page file is named 27: version naming UNVERIFIED.
- Terms: the page itself states none and links to /support/terms/. The HIG tells you to read the SF Symbols terms, which prohibit using symbols (or confusingly similar images) in app icons, logos or other trademarked uses. It also says SF Symbols "includes copyrighted symbols that depict Apple products and features" and "Don't design replicas of Apple products". https://developer.apple.com/design/human-interface-guidelines/sf-symbols
- Web/Android use: not stated on the pages. The full SF Symbols license is inside the download; it was NOT read. Treat as UNVERIFIED and assume Apple platforms only. Use an open icon set (e.g. Lucide, Material Symbols) on the web.
- Use: Apple-platform code uses `Image(systemName:)`; the app browses names and exports custom-symbol templates.
- Videos: /videos/play/wwdc2025/337/ (SF Symbols 7), /wwdc2024/10188/ (SF Symbols 6).

## 4. Icon Composer (https://developer.apple.com/icon-composer/)

- Builds layered Liquid Glass app icons for iPhone, iPad, Mac, Apple Watch; Default/Dark/Mono appearances in one file; refraction, specular highlights, translucency; syncs with Xcode; exports flattened icon for marketing.
- Requirements conflict: the icon-composer page says macOS Tahoe 26.4 or later; the resources page says macOS Sequoia or later. Check the download page.
- Download: https://developer.apple.com/download/all/?q=Icon%20Composer. "Icon Composer 2 beta" announced 2026-06-08 (whats-new).
- HIG app-icons: iOS/iPadOS/macOS/watchOS accept either flat bitmap (PNG) or layered Icon Composer files; tvOS/visionOS use image stacks in Xcode; prefer vector layers; "Don't use replicas of Apple hardware products". https://developer.apple.com/design/human-interface-guidelines/app-icons
- Videos: https://developer.apple.com/videos/play/wwdc2025/220/ and /361/.
- Use: app icon for an iOS build; not needed for a web app.

## 5. Design templates and UI kits (resources page)

Figma/Sketch links are on https://developer.apple.com/design/resources/ . Current as read:

| Kit | Formats |
|---|---|
| UI Kit iOS 27 and iPadOS 27; macOS 27 | Figma Community, Sketch (shared links) |
| UI Kit watchOS 26; visionOS 26 | Figma, Sketch |
| UI Kit tvOS 18; visionOS 2 | Sketch library (`sketch://add-library?...`); visionOS 2 also Figma |
| App Icon Template (iOS, iPadOS, watchOS 27) | Figma, Sketch, Photoshop/Illustrator DMG |
| tvOS 18 design and production templates; visionOS 2 templates | Sketch DMG; tvOS production also Photoshop |
| Technology templates (App Clips, Apple Pay, Live Activities, Messages, Siri/App Shortcuts, Tap to Pay, TipKit, Wallet, Sign in with Apple buttons) and glyph DMGs (AirPlay, ARKit, Health, HomeKit, Game Center, Siri, Sign in with Apple logo) | Figma/Sketch; PNG/PDF/SVG |
| Parallax Previewer (tvOS/visionOS) | macOS app, itunespartner.apple.com/assets/downloads/Parallax%20Previewer.dmg |

- Liquid Glass materials appear in the iOS/macOS 26+ kits; the page lists no standalone "Liquid Glass materials" download: UNVERIFIED beyond that. Concept lives in HIG Materials: Liquid Glass is a functional layer for controls and navigation floating above content; "Don't use Liquid Glass in the content layer"; standard materials for content-layer elements. https://developer.apple.com/design/human-interface-guidelines/materials
- Per-kit license: the resources page "does not state any further license terms for individual resources"; general terms at /support/terms/. Sketch kits need Sketch installed.
- Use: designers; an agent reads these only to learn token values/sizes. Prefer HIG text and system APIs as the source of truth.

## 6. Product bezels and marketing artwork

- Bezels (Photoshop + PNG DMGs, `Bezel-*.dmg`) for current iPhone, iPad, Mac, Studio Display, Apple Watch and Apple TV models, plus a Keynote live-video bezel; latest additions 2026-09-18. https://developer.apple.com/design/resources/#product-bezels
- Rules (Marketing Resources and Identity Guidelines, https://developer.apple.com/app-store/marketing/guidelines/): use bezels unmodified; no reflections/shadows/crop/tilt; no 3D renderings or illustrations of Apple products; show the app as it really runs, full status bar, no blank screen, fictional data; never the standalone Apple logo; badges unmodified, minimum 40 px onscreen, clear space 1/4 height; one badge per layout.
- License: artwork use needs agreeing to the App Store Marketing Artwork License Agreement: limited, non-exclusive, non-transferable, only for your apps on the App Store while in the Apple Developer Program; Apple can terminate on 10 days' notice. Same URL.
- Badges/logos hub (Apple Pay, Wallet, Health, CarPlay, Swift, etc.): https://developer.apple.com/licensing-trademarks/ ; trademark rules: https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html
- Use: only when producing App Store/marketing screenshots; irrelevant to course-phase web code.

## 7. Using the system font legally in a web app (non-Apple build)

Facts:
- Fonts license forbids using the downloaded SF fonts for non-Apple-OS mock-ups, embedding them in products, and "website content". https://developer.apple.com/fonts/
- WebKit's blog says `-apple-system` is the supported way to request the system font in Safari (iOS/OS X) and that other mechanisms "are not guaranteed to behave as you might expect"; on other platforms the browser falls back to the next item in the `font-family` list. Published 2015-07-27. https://webkit.org/blog/3709/using-the-system-font-in-web-content/ . The article does not mention `system-ui` (so `system-ui` support was not confirmed from Apple sources).
- Not Apple-sourced, general knowledge (UNVERIFIED here): `system-ui` is the CSS Fonts Level 4 generic family, and `BlinkMacSystemFont` is the Chrome-on-Mac equivalent.

Recommendation (inference, not an Apple statement): reference the OS font by name only, never self-host SF. This resolves to SF on Apple devices because the user's own device supplies it, and to Roboto/Segoe UI elsewhere:

```css
font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; /* mono; ui-monospace: UNVERIFIED in Apple sources */
```

Do not add `@font-face` pointing at SF Pro / New York files. If a brand typeface is needed, use an openly licensed font (e.g. Inter, via its own license).

## 8. Other Apple design documentation (links)

- Design tips ("UI Design Dos and Don'ts", legacy iOS HIG paths, looks old): https://developer.apple.com/design/tips/ (44x44 pt hit targets, 11 pt min text, @2x/@3x assets)
- Design videos index (WWDC14-26, Tech Talks, Meet with Apple): https://developer.apple.com/videos/design/
  - Key sessions: Meet Liquid Glass /videos/play/wwdc2025/219/; Get to know the new design system /wwdc2025/356/; Design foundations from idea to interface /wwdc2025/359/; Create icons with Icon Composer /wwdc2025/361/; Principles of great design /wwdc2026/250/; The details of UI typography /wwdc2020/10175/; Principles of inclusive app design /wwdc2025/316/ (all under https://developer.apple.com)
- Apple Design Awards (2026 winners; archives /2025/, /2024/): https://developer.apple.com/design/awards/ . Six categories: Delight and Fun, Inclusivity, Innovation, Interaction, Social Impact, Visuals and Graphics.
- Accessibility (developer hub, APIs, Accessibility Nutrition Labels for App Store): https://developer.apple.com/accessibility/ and https://developer.apple.com/documentation/accessibility ; HIG: https://developer.apple.com/design/human-interface-guidelines/accessibility (mentions larger text, at least 200 percent enlargement ideal, Accessibility Nutrition Labels, auditing with an inspector tool; the tool name was elided in the extraction).
- Pass Designer beta (Wallet passes, macOS 27+): https://developer.apple.com/pass-designer/ ; Reality Composer Pro: https://developer.apple.com/reality-composer-pro/

## 9. Guidance for agents

- Web app: apply HIG principles, use the CSS in section 7 and a non-Apple icon set; no Apple font, SF Symbols, bezel or badge files in the repo. Native Apple app: system font via API, `Image(systemName:)`, Icon Composer. Cite the HIG URL for each rule.
