# Visual foundations: color, dark mode, typography, materials, motion, layout, images

When to read this: before choosing any color, font size, background/material, animation, spacing/safe-area behaviour, or image asset format/scale in an Apple-platform UI (SwiftUI/UIKit) or a web UI that must look Apple-native. Covers iOS/iPadOS/macOS in depth; tvOS/visionOS/watchOS briefly. Source: Apple HIG pages listed in the final `Sources` line, rewritten and condensed. Note: the HIG page for Color publishes system-color RGB values only as images, and Layout publishes iPhone/iPad/Watch screen dimensions only as images; neither is available here (see "Gaps").

---

## Color

Rules:
- Use one color for one meaning. Do not use the brand/tint color for both "tappable" and plain decoration (for example, tinted non-interactive text next to tinted buttons).
- Prefer system colors (`Color.red`, `.blue`, `UIColor.label`, ...). They already carry light, dark and Increase Contrast variants and adapt to vibrancy/accessibility settings.
- Never hard-code system color values. The published values are for design reference only and change between OS releases. Apply them via APIs (`Color`, `UIColor`, `NSColor`).
- Custom colors need: a light variant, a dark variant, and an increased-contrast variant of each (a clearly stronger differentiation). Do this even if the app ships in one appearance, so Liquid Glass can adapt.
- Dynamic system colors are defined by purpose, not appearance. Do not repurpose them: no separator color as text color, no secondary label color as a background.
- Do not rely on color alone for meaning, interactivity or state. Pair with text labels or glyph shapes (color-blind users). Check contrast for icons and text.
- Check cultural meaning of colors (red is danger in some cultures, positive in others).
- Test in bright sunlight (colors look darker and muted) and dim light (colors look bright and saturated); test on real devices, True Tone, P3 vs sRGB profiles, and on varied TVs for tvOS.
- Artwork and translucency shift nearby colors (Maps switches from light scheme in map mode to dark in satellite mode); adjust neighbors for continuity.
- If people pick colors, use the system `ColorPicker`.
- Color management: attach a color profile to every image; sRGB is correct on most displays; use wide color (Display P3, 16 bits per channel, PNG) for richer content on compatible displays; supply sRGB/P3-specific asset-catalog variants where similar P3 colors blur or P3 gradients clip on sRGB.

Numbers:
- Adaptive system color families (SwiftUI): red, orange, yellow, green, mint, teal, cyan, blue, indigo, purple, pink, brown. Each has Default light/dark and Increased-contrast light/dark values (not reproduced by Apple in text).
- iOS/iPadOS gray ramp (UIKit): `systemGray`, `systemGray2`, `systemGray3`, `systemGray4`, `systemGray5`, `systemGray6` (SwiftUI `.gray` equals `systemGray`).
- visionOS system colors use the default dark values.

### System colors by role (iOS, iPadOS)

Backgrounds: two sets, each with primary/secondary/tertiary.
| Use | Set | APIs |
|---|---|---|
| Normal views | system | `systemBackground`, `secondarySystemBackground`, `tertiarySystemBackground` |
| Grouped table/list views | grouped | `systemGroupedBackground`, `secondarySystemGroupedBackground`, `tertiarySystemGroupedBackground` |
- Primary = overall view; secondary = grouping content within it; tertiary = grouping within secondary elements.

Foreground:
| Color | Use | UIKit |
|---|---|---|
| Label | primary text | `label` |
| Secondary label | secondary text | `secondaryLabel` |
| Tertiary label | tertiary text | `tertiaryLabel` |
| Quaternary label | quaternary text | `quaternaryLabel` |
| Placeholder | placeholder text in controls/text views | `placeholderText` |
| Separator | divider letting content show through | `separator` |
| Opaque separator | divider that hides underlying content | `opaqueSeparator` |
| Link | link text | `link` |

### macOS dynamic colors (AppKit `NSColor`)
- Text: `labelColor`, `secondaryLabelColor`, `tertiaryLabelColor`, `quaternaryLabelColor` (watermark text), `textColor` (document text), `placeholderTextColor`, `linkColor`, `headerTextColor` (table header cell), `controlTextColor`, `disabledControlTextColor` (unavailable control), `selectedControlTextColor`, `selectedMenuItemTextColor`, `selectedTextColor`, `alternateSelectedControlTextColor` (text on selected list/table surface), `windowFrameTextColor` (title bar), `unemphasizedSelectedTextColor` (non-key window).
- Backgrounds: `windowBackgroundColor`, `controlBackgroundColor` (large elements like browser/table), `textBackgroundColor`, `underPageBackgroundColor` (behind document), `alternatingContentBackgroundColors` (zebra rows/columns), `selectedContentBackgroundColor` (key window), `unemphasizedSelectedContentBackgroundColor` (non-key), `selectedTextBackgroundColor`, `unemphasizedSelectedTextBackgroundColor`.
- Controls: `controlColor` (surface), `selectedControlColor`, `controlAccentColor` (user accent from System Settings), `currentControlTint`.
- Other: `separatorColor`, `gridColor`, `findHighlightColor`, `highlightColor` (virtual light source), `shadowColor` (virtual shadow), `keyboardFocusIndicatorColor` (focus ring).
- [macOS] App accent color (macOS 11+) tints buttons, selection highlight and sidebar icons, applied only when the user's System Settings accent is Multicolor; any other user choice overrides yours. Exception: sidebar icons with an explicitly fixed color keep it.

### Liquid Glass color (newest design)
Rules:
- Liquid Glass has no inherent color; it picks up the content behind it. You may tint it (stained-glass look) to emphasize one control such as a primary CTA; the system does this for prominent buttons.
- Toolbars/tab bars (small elements) adapt between light and dark based on content beneath; their symbols/text are monochrome by default (darker on light content, lighter on dark). Large elements like sidebars look more opaque for legibility.
- Use color on glass sparingly, only for things that earn emphasis (status indicators, primary actions). To emphasize a primary action, color the background, not the symbol/text (system example: accent-colored Done button). Do not color the backgrounds of several controls.
- With colorful or rich-content backgrounds, keep toolbars/tab bars monochrome or pick an accent with strong differentiation. With mostly monochrome content, the brand color as app accent works well.
- Avoid overlap of similar colors between content layer and controls. Scrolling colorful content under controls is fine, but the resting state (for example top of a scroll view) must stay legible.

Platform:
- [tvOS] Use a limited palette coordinated with the logo. Never indicate focus by color alone; use subtle scaling and animation.
- [visionOS] Use color sparingly on glass (surroundings show through). Prefer color on bold text and large areas; thin text and small areas get lost. In fully immersive scenes, balance brightness; avoid a bright, flashing or moving object on near-black.
- [watchOS] Use background color only when it carries meaning (for example, Activity rings backgrounds match ring colors); avoid full-screen color in long-lived screens (workout, audio). Graphic complications may be shown tinted (single color from the wearer's choice) instead of full color.

Avoid: same color with two meanings; semantic colors used outside their purpose; color-only status; shipping colors without dark/high-contrast variants.

---

## Dark Mode

Rules:
- Respect the system appearance. Do not add an app-specific light/dark setting (it makes users change two settings and looks broken). Auto mode can switch while the app is running, so support live changes.
- Both modes must look good. Exception (rare): a permanently dark UI for immersive media viewing, so chrome recedes.
- Test legibility in Dark Mode with Increase Contrast and Reduce Transparency on, separately and together. Increase Contrast in Dark Mode can reduce contrast between dark text and dark background.
- Dark palette = dimmer backgrounds, brighter foregrounds. Not a pure inversion: some colors invert, some do not.
- Use semantic/adaptive colors (`label`, `separator`, `labelColor`, `controlColor`). For custom colors, add a Color Set to the Xcode asset catalog with bright and dim variants. No fixed colors that do not adapt.
- Contrast: never below 4.5:1; aim for 7:1 for custom foreground/background, especially small text.
- Soften white backgrounds in content images: slightly darken so they do not glow in dark surroundings.
- Icons/images: use SF Symbols (auto-adapt). Make separate light/dark icon variants when needed (for example, a full-moon icon needing a subtle outline on light only; an oil-drop icon needing a thin border on dark). Combine variants into one named image in an asset catalog; reuse a single asset if it works in both.
- Text: use system label colors (primary/secondary/tertiary/quaternary). Prefer system text views/fields; they handle vibrancy and contrast automatically.
- [iOS][iPadOS] Two background levels: base (dimmer, recedes) and elevated (brighter, advances). The system switches automatically to elevated for popovers, modal sheets, side-by-side multitasking apps and multiple windows. Use system backgrounds; custom backgrounds break this separation.
- [macOS] With graphite accent, windows pick up desktop tint. Give custom component backgrounds some transparency to harmonize, only on components with a visible background/bezel and only in neutral (non-colored) state; do not add transparency to colored states (color would fluctuate).
- Dark Mode is not supported on visionOS or watchOS (visionOS glass adapts to what is behind it); tvOS has no extra rules.

---

## Typography

Rules:
- Use system text styles (Large Title ... Caption 2) with SF/NY so Dynamic Type and Bold Text work. Modify with symbolic traits (bold, leading), not by hard-coding sizes.
- Avoid Ultralight, Thin and Light weights; prefer Regular, Medium, Semibold, Bold. A thin custom font needs larger sizes.
- Limit the number of typefaces. Build hierarchy with weight, size and color. Preserve relative hierarchy at all text sizes.
- Under larger text, prioritize important content; not everything must grow (tab titles, transient hit-damage numbers need not).
- System fonts: San Francisco (SF Pro, SF Compact, SF Arabic/Armenian/Georgian/Hebrew, SF Mono; rounded variants of Pro/Compact and the scripts) and New York (NY, serif). Variable fonts with dynamic optical sizes (Text and Display merged continuously); weights Ultralight to Black; SF has Condensed/Expanded widths. SF Symbols match text weights.
- Do not embed system fonts; use `Font.Design` (`.default` for system, `.serif` for New York).
- Leading: loose for wide columns/long passages; tight for height-constrained rows (for example list rows); with 3+ lines avoid tight leading. SwiftUI `leading(_:)`.
- In mockups, adjust tracking by size (in running apps the system does it automatically).
- Custom fonts: must stay legible at the minimums below, and must implement Dynamic Type and Bold Text behaviour themselves.
- Dynamic Type (iOS, iPadOS, tvOS, visionOS, watchOS; not macOS): layout must adapt to every size including the accessibility sizes. Test with Settings > Accessibility > Display & Text Size > Larger Text > Larger Accessibility Sizes.
  - Scale meaningful icons with text (SF Symbols do it automatically).
  - Minimize truncation; at the largest accessibility size show as much useful text as at the largest standard size. No truncation in scroll regions unless a detail view exists. Allow multiple lines (`numberOfLines = 0`).
  - At large sizes, stack horizontally adjacent items (text above glyph/timestamp); reduce column counts (`isAccessibilityCategory`).
  - Keep primary elements at the top regardless of size.
- [iOS][iPadOS] SF Pro system; NY available.
- [macOS] SF Pro; NY only for Mac Catalyst; no Dynamic Type. Use dynamic system font variants to match controls: `controlContentFont(ofSize:)`, `labelFont`, `menuFont`, `menuBarFont`, `messageFont`, `paletteFont`, `titleBarFont`, `toolTipsFont`, `userFont` (document text), `userFixedPitchFont` (monospaced document text), `boldSystemFont`, `systemFont`.
- [tvOS] SF Pro; NY available.
- [visionOS] SF Pro; NY needs explicit styles. Bolder body and title styles, plus Extra Large Title 1 and 2 for editorial layouts. Prefer 2D text, white text by default for contrast on glass, bold text when not on a background and no shadows, billboard text on 3D labels so it faces the wearer (rotate about the y-axis).
- [watchOS] SF Compact; complications use SF Compact Rounded; NY available.

Numbers: default and minimum sizes
| Platform | Default | Minimum |
|---|---|---|
| iOS, iPadOS | 17 pt | 11 pt |
| macOS | 13 pt | 10 pt |
| tvOS | 29 pt | 23 pt |
| visionOS | 17 pt | 12 pt |
| watchOS | 16 pt | 12 pt |

Emphasized variant: SwiftUI `bold()`, UIKit `traitBold`. Emphasized weight may be medium, semibold, bold or heavy (see "Emph." columns).

### iOS/iPadOS built-in text styles at default size (Large)
| Style | Weight | Size pt | Leading pt | Emph. |
|---|---|---|---|---|
| Large Title | Regular | 34 | 41 | Bold |
| Title 1 | Regular | 28 | 34 | Bold |
| Title 2 | Regular | 22 | 28 | Bold |
| Title 3 | Regular | 20 | 25 | Semibold |
| Headline | Semibold | 17 | 22 | Semibold |
| Body | Regular | 17 | 22 | Semibold |
| Callout | Regular | 16 | 21 | Semibold |
| Subhead | Regular | 15 | 20 | Semibold |
| Footnote | Regular | 13 | 18 | Semibold |
| Caption 1 | Regular | 12 | 16 | Semibold |
| Caption 2 | Regular | 11 | 13 | Semibold |

### iOS/iPadOS across Dynamic Type sizes (size / leading, pt)
Weights and emphasized weights are identical to the table above at every size (Headline is Semibold, Title 3 emph. Semibold, others as above).
| Style | xSmall | Small | Medium | Large* | xLarge | xxLarge | xxxLarge | AX1 | AX2 | AX3 | AX4 | AX5 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Large Title | 31/38 | 32/39 | 33/40 | 34/41 | 36/43 | 38/46 | 40/48 | 44/52 | 48/57 | 52/61 | 56/66 | 60/70 |
| Title 1 | 25/31 | 26/32 | 27/33 | 28/34 | 30/37 | 32/39 | 34/41 | 38/46 | 43/51 | 48/57 | 53/62 | 58/68 |
| Title 2 | 19/24 | 20/25 | 21/26 | 22/28 | 24/30 | 26/32 | 28/34 | 34/41 | 39/47 | 44/52 | 50/59 | 56/66 |
| Title 3 | 17/22 | 18/23 | 19/24 | 20/25 | 22/28 | 24/30 | 26/32 | 31/38 | 37/44 | 43/51 | 49/58 | 55/65 |
| Headline | 14/19 | 15/20 | 16/21 | 17/22 | 19/24 | 21/26 | 23/29 | 28/34 | 33/40 | 40/48 | 47/56 | 53/62 |
| Body | 14/19 | 15/20 | 16/21 | 17/22 | 19/24 | 21/26 | 23/29 | 28/34 | 33/40 | 40/48 | 47/56 | 53/62 |
| Callout | 13/18 | 14/19 | 15/20 | 16/21 | 18/23 | 20/25 | 22/28 | 26/32 | 32/39 | 38/46 | 44/52 | 51/60 |
| Subhead | 12/16 | 13/18 | 14/19 | 15/20 | 17/22 | 19/24 | 21/28 | 25/31 | 30/37 | 36/43 | 42/50 | 49/58 |
| Footnote | 12/16 | 12/16 | 12/16 | 13/18 | 15/20 | 17/22 | 19/24 | 23/29 | 27/33 | 33/40 | 38/46 | 44/52 |
| Caption 1 | 11/13 | 11/13 | 11/13 | 12/16 | 14/19 | 16/21 | 18/23 | 22/28 | 26/32 | 32/39 | 37/44 | 43/51 |
| Caption 2 | 11/13 | 11/13 | 11/13 | 11/13 | 13/18 | 15/20 | 17/22 | 20/25 | 24/30 | 29/35 | 34/41 | 40/48 |
*Large is the default. AX1-AX5 are the larger accessibility sizes.

### macOS built-in text styles (no Dynamic Type)
| Style | Weight | Size pt | Line height pt | Emph. |
|---|---|---|---|---|
| Large Title | Regular | 26 | 32 | Bold |
| Title 1 | Regular | 22 | 26 | Bold |
| Title 2 | Regular | 17 | 22 | Bold |
| Title 3 | Regular | 15 | 20 | Semibold |
| Headline | Bold | 13 | 16 | Heavy |
| Body | Regular | 13 | 16 | Semibold |
| Callout | Regular | 12 | 15 | Semibold |
| Subheadline | Regular | 11 | 14 | Semibold |
| Footnote | Regular | 10 | 13 | Semibold |
| Caption 1 | Regular | 10 | 13 | Medium |
| Caption 2 | Medium | 10 | 13 | Semibold |

### tvOS built-in text styles
| Style | Weight | Size pt | Leading pt | Emph. |
|---|---|---|---|---|
| Title 1 | Medium | 76 | 96 | Bold |
| Title 2 | Medium | 57 | 66 | Bold |
| Title 3 | Medium | 48 | 56 | Bold |
| Headline | Medium | 38 | 46 | Bold |
| Subtitle 1 | Regular | 38 | 46 | Medium |
| Callout | Medium | 31 | 38 | Bold |
| Body | Medium | 29 | 36 | Bold |
| Caption 1 | Medium | 25 | 32 | Bold |
| Caption 2 | Medium | 23 | 30 | Bold |

### watchOS built-in styles (size / leading, pt)
Weights: Large Title Regular (emph. Bold); Title 1-3 Regular (emph. Semibold); Headline Semibold; Body, Captions, Footnotes Regular (emph. Semibold). Sizes by Dynamic Type setting (the default per case size is marked):
| Style | xSmall | Small (38mm default) | Large (40/41/42mm default) | xLarge (44/45/49mm default) | xxLarge | xxxLarge | AX1 | AX2 | AX3 |
|---|---|---|---|---|---|---|---|---|---|
| Large Title | 30/32.5 | 32/34.5 | 36/38.5 | 40/42.5 | 41/43.5 | 42/44.5 | 44/46.5 | 45/47.5 | 46/48.5 |
| Title 1 | 28/30.5 | 30/32.5 | 34/36.5 | 38/40.5 | 39/41.5 | 40/42.5 | 42/44.5 | 43/46 | 44/47 |
| Title 2 | 24/26.5 | 26/28.5 | 28/30.5 | 30/32.5 | 31/33.5 | 32/34.5 | 34/41 | 35/37.5 | 36/38.5 |
| Title 3 | 17/19.5 | 18/20.5 | 19/21.5 | 20/22.5 | 21/23.5 | 22/24.5 | 24/26.5 | 25/27.5 | 26/28.5 |
| Headline | 14/16.5 | 15/17.5 | 16/18.5 | 17/19.5 | 18/20.5 | 19/21.5 | 21/23.5 | 22/24.5 | 23/25.5 |
| Body | 14/16.5 | 15/17.5 | 16/18.5 | 17/19.5 | 18/20.5 | 19/21.5 | 21/23.5 | 22/24.5 | 23/25.5 |
| Caption 1 | 13/15.5 | 14/16.5 | 15/17.5 | 16/18.5 | 17/19.5 | 18/20.5 | 18/20.5 | 19/21.5 | 20/22.5 |
| Caption 2 | 12/14.5 | 13/15.5 | 14/16.5 | 15/17.5 | 16/18.5 | 17/19.5 | 17/19.5 | 18/20.5 | 19/21.5 |
| Footnote 1 | 11/13.5 | 12/14.5 | 13/15.5 | 14/16.5 | 15/17.5 | 16/18.5 | 16/18.5 | 17/19.5 | 18/20.5 |
| Footnote 2 | 10/12.5 | 11/13.5 | 12/14.5 | 13/15.5 | 14/16.5 | 15/17.5 | 15/17.5 | 16/17.5 | 17/19.5 |
(Some AX cells look irregular in Apple's source, e.g. Title 2 AX1 is 34/41; reproduced as published.)

### SF Pro tracking (iOS, iPadOS, visionOS), size: 1/1000 em / points
Useful for web `letter-spacing` (tracking in em = value/1000).
6: +41/+0.24 | 7: +34/+0.23 | 8: +26/+0.21 | 9: +19/+0.17 | 10: +12/+0.12 | 11: +6/+0.06 | 12: 0/0 | 13: -6/-0.08 | 14: -11/-0.15 | 15: -16/-0.23 | 16: -20/-0.31 | 17: -26/-0.43 | 18: -25/-0.44 | 19: -24/-0.45 | 20: -23/-0.45 | 21: -18/-0.36 | 22: -12/-0.26 | 23: -4/-0.10 | 24: +3/+0.07 | 25: +6/+0.15 | 26: +8/+0.22 | 27: +11/+0.29 | 28: +14/+0.38 | 29: +14/+0.40 | 30: +14/+0.40 | 31: +13/+0.39 | 32: +13/+0.41 | 33: +12/+0.40 | 34: +12/+0.40 | 35: +11/+0.38 | 36: +10/+0.37 | 37: +10/+0.36 | 38: +10/+0.37 | 39: +10/+0.38 | 40: +10/+0.37 | 41: +9/+0.36 | 42: +9/+0.37 | 43: +9/+0.38 | 44: +8/+0.37 | 45: +8/+0.35 | 46: +8/+0.36 | 47: +8/+0.37 | 48: +8/+0.35 | 49: +7/+0.33 | 50: +7/+0.34 | 51: +7/+0.35 | 52: +6/+0.33 | 53: +6/+0.31 | 54: +6/+0.32 | 56: +6/+0.30 | 58: +5/+0.28 | 60: +4/+0.26 | 62: +4/+0.24 | 64: +4/+0.22 | 66: +3/+0.19 | 68: +2/+0.17 | 70: +2/+0.14 | 72: +2/+0.14 | 76: +1/+0.07 | 80-96: 0.
Other tables exist on the page for SF Pro Rounded, New York, SF Compact (+Rounded), macOS and tvOS (macOS/tvOS tracking mirrors the SF Pro curve with minor rounding differences). Tracking crosses zero near 12 pt, is tightest around 17-20 pt, and loosens again above ~24 pt, reaching 0 at 80 pt+.

Avoid: light weights at small sizes; many typefaces; fixed-size text; shrinking all text equally when users enlarge text; truncation at accessibility sizes; shadows on visionOS text with no background.

---

## Materials

Rules:
- Two material families: Liquid Glass (controls and navigation layer) and standard materials (content layer).
- Liquid Glass forms a functional layer floating above content (tab bars, sidebars, toolbars). Content scrolls and peeks through it. Do not use Liquid Glass inside the content layer; use standard materials for app backgrounds and content. Exception: transient interactive controls such as sliders and toggles take on a glass look while being activated.
- Use custom Liquid Glass effects sparingly: only the most important functional elements. Standard system components already adopt it. SwiftUI: `glassEffect(_:in:)`; UIKit/AppKit via the visual-effect views; see "Adopting Liquid Glass".
- Two glass variants (appearance can change with system look preference and Reduce Transparency / Increase Contrast):
  - Regular: blurs and adjusts luminosity of what is behind; most system components use it. Use it where legibility might suffer or with much text (alerts, sidebars, popovers). Scroll edge effects add blur and lower the opacity of content under bars.
  - Clear: highly translucent; use only over visually rich media backgrounds (photos, video) to keep content prominent.
- Clear-glass dimming: if underlying content is bright, add a dark dimming layer at 35% opacity. Not needed over dark content or when AVKit playback controls already dim.
- Standard materials: choose by semantic purpose, not by the color it appears to give (system settings change appearance). Use system vibrant colors on top of any material so contrast holds. Thicker (more opaque) = better contrast for fine text; thinner (more translucent) = better context retention.
- [iOS][iPadOS] Four standard materials: ultra-thin, thin, regular (default), thick. Vibrancy styles (UIKit `UIVibrancyEffectStyle`): labels `.label` (default), `.secondaryLabel`, `.tertiaryLabel`, `.quaternaryLabel`; fills `.fill` (default), `.secondaryFill`, `.tertiaryFill`; separators have one style. Names indicate contrast: default is highest. Avoid quaternary on thin and ultraThin.
- [macOS] Several purpose-specific materials plus vibrant versions of all system colors (`NSVisualEffectView.Material`). Decide where custom views use vibrancy, and pick a blending mode: behind window or within window (`NSVisualEffectView.BlendingMode`).
- [tvOS] Liquid Glass appears in navigation, Top Shelf, Control Center; image views and buttons adopt glass when focused. Standard materials:
| Material | Recommended for |
|---|---|
| ultraThin | Full-screen views needing a light scheme |
| thin | Overlays partially obscuring content, light scheme |
| regular | Overlays partially obscuring content |
| thick | Overlays partially obscuring content, dark scheme |
- [visionOS] Windows use the fixed, system-defined "glass" (adapts to luminance of surroundings; no Dark Mode). Prefer translucency over opaque fills in windows. Thin = interactive elements and selected items; regular = visual separation (sidebar, grouped table); thick = a dark element distinct on top of a regular area. Vibrancy values: `label` for standard text, `secondaryLabel` for footnotes and subtitles, `tertiaryLabel` for inactive elements where high legibility is not needed.
- [watchOS] Keep default material backgrounds on full-screen modal sheets; do not remove or replace them.

Avoid: glass on content cards/lists; stacking many custom glass controls; choosing materials by color.

---

## Motion

Rules:
- Add motion only with purpose; excessive animation distracts and can cause discomfort.
- Make motion optional: never the only carrier of information. Supplement with haptics and audio. Honor Reduce Motion (note: system accessibility setting).
- Feedback motion should be realistic and follow gestures: if a view slides in from the top, it should not dismiss to the side.
- Keep feedback brief and precise. Avoid animating frequent interactions (the system already animates standard elements). Never make people wait for an animation to finish before acting; let them cancel/interrupt it.
- Consider animated SF Symbols (SF Symbols 5+).
- Liquid Glass motion reacts more strongly to direct touch and more subtly to trackpad input; system components adjust motion for accessibility settings and input method.
- Games: target a consistent 30-60 fps, good defaults per platform, and let players trade fidelity for performance or battery (for example, power modes when plugged in).
- [watchOS] Prefer SwiftUI animation. All layout/appearance animations have built-in ease-in/out that cannot be disabled or customized.
- [visionOS] Avoid motion at the edges of the field of view (if unavoidable, match the brightness of other content). For large moving objects, raise translucency or lower contrast, and keep moved windows fairly small. Use fade-out, move, fade-in when relocating an object. Do not rotate a virtual world (use instant direction change under a quick fade). Provide a stationary frame of reference. Avoid sustained oscillation, particularly near 0.2 Hz; keep amplitude low and content translucent if needed.

---

## Layout

Rules:
- Visual hierarchy: put the most important content at top and leading side (reading order; support RTL by using system components). Align for scanning, indent for subordination, group related items with spacing, containers or separators, and use progressive disclosure (disclosure triangles, menus, nested views, scrollable sections).
- Liquid Glass era: differentiate controls from content with the glass material and a scroll edge effect (see Scroll views), not solid or semi-opaque colored bars under controls. Extend full-screen background content under sidebars, toolbars and tab bars. If a sidebar/inspector would cover important parts of a scaled background image, use the background extension effect (mirrors and blurs the image under adjacent components): `backgroundExtensionEffect()` / `UIBackgroundExtensionView`.
- Adaptability: handle compact/regular size classes, screen sizes, orientation and aspect ratios, Dynamic Island, external displays, Display Zoom, resizable windows on iPad and Mac, text size changes, and localization (LTR/RTL, date/number formats, font variation, text length). Use SwiftUI or Auto Layout. Respect safe areas, margins and layout guides. Even landscape-only apps must resize well.
- Text size changes: stack horizontal items vertically, let rows grow, allow multi-line text.
- Test with the largest and smallest layouts, multiple devices, size classes, locales and text sizes; check iPad resize and iPhone Mirroring on Mac.
- Background art: scale to fill (no aspect-ratio change) when the display shape changes; windows can be very wide-short or tall-narrow.
- Size classes (iOS, iPadOS): two per axis, compact or regular (horizontal: narrow/wide; vertical: short/tall), set by device, window configuration and multitasking state (full screen, Slide Over, iPhone Mirroring on Mac). Decide layout from size classes, not device type (idiom) or orientation. Consider every combination, not just compact-portrait. Do not change functionality across size classes; change how much is visible (for example tab bar becomes sidebar, overflow items exposed). Keep the layout recognizable for the platform when resizing. APIs: `UserInterfaceSizeClass`, `UITraitChangeObservable`.
- Layout guides: predefined guides give standard margins and a readable text width (`UILayoutGuide`, `NSLayoutGuide`). Safe area = region not covered by hardware features (Dynamic Island, rounded corners) or by bars (toolbar, tab bar, status bar); always keep content and controls inside it (`SafeAreaRegions`).
- [macOS] Do not put controls or key information at the bottom of a window (it may be dragged below the screen). Avoid content behind the camera housing at the top (`NSPrefersDisplaySafeAreaCompatibilityMode`).
- [tvOS] Inset primary content 60 pt from top and bottom and 80 pt from the sides. Leave room for focused elements that scale up. Use consistent spacing; extra vertical space for titled rows; keep partially visible offscreen content symmetric left/right.
- [visionOS] Support resizing; keep content horizontally centered at large sizes. Min/max sizes are for layout integrity, not for blocking resize. Use 3D in windows sparingly (inset). Put supplemental content in an adjacent window (`defaultWindowPlacement(_:)`), not an ornament (ornaments are for toolbars and playback controls). Keep button centers at least 60 pt apart.
- [watchOS] At most three glyph buttons or two text buttons in a row; full-width text buttons are usually better. Support autorotation for content people show others (QR codes, images): `isAutorotating`.

Numbers: tvOS grids (unfocused content width; horizontal spacing 40 pt and minimum vertical spacing 100 pt in every case)
| Columns | Unfocused width |
|---|---|
| 2 | 860 pt |
| 3 | 560 pt |
| 4 | 410 pt |
| 5 | 320 pt |
| 6 | 260 pt |
| 7 | 217 pt |
| 8 | 184 pt |
| 9 | 160 pt |

Gaps: the page's per-device screen-size specifications (iPhone 14-17 family, iPad, Apple Watch) and iOS margin values are supplied as images/downloads and are not in the text. (note) Read safe-area insets and `layoutMargins` from the system at runtime rather than hard-coding values; on the web use `env(safe-area-inset-*)`.

---

## Images

Rules:
- A point is an abstract unit; on 2D displays it maps to a device-dependent number of pixels (scale factor), on visionOS it is an angle.
- Provide high-res bitmaps for every supported device; name them `@1x`/`@2x`/`@3x` in the asset catalog. Design at the lowest resolution and scale up; keep vector control points on whole values so they align to the raster grid at 2x and 3x.
- Include a color profile in each image; test on real devices for pixelation, stretching, compression.
- [tvOS] Layered images (2 to 5 layers) drive the parallax focus effect (elevate, sway, shine; dims when idle). Required for the app icon, strongly encouraged for other focusable images including Top Shelf. Keep text in the foreground layer, background layer fully opaque (error otherwise), layering subtle, a safe zone around foreground content (cropping on focus), preview in Xcode/Parallax Previewer/Photoshop Parallax Exporter and on a real TV. Runtime layered images (`.lcr`, made with `layerutil`) are for server delivery, not embedding. Use standard views and focus APIs for automatic parallax.
- [visionOS] Prefer vector art for 2D images; rasters must be higher than @2x to look sharp up close, but resolutions over about @6x hurt size and performance; apply high-quality filtering above @2x. App icon: 2 to 3 layers. Spatial photos: stereo HEIC with spatial metadata (iPhone 15 Pro or later, Vision Pro); text over them uses the feathered glass background effect (`GlassBackgroundEffect`); show spatial photos/scenes in standalone views, not inline (otherwise generous spacing); a spatial scene takes several seconds to generate and should be used for specific moments, large and centered, with minimal UI when immersive.
- [watchOS] Avoid transparency to keep files small, except for template images (complication images, menu and interface icons) where transparency marks where color is applied. Autoscaling PDF: design at 40/42 mm at 2x and WatchKit scales it.

Numbers:
| Platform | Scale factors |
|---|---|
| iPadOS, watchOS | @2x |
| iOS | @2x and @3x |
| visionOS | @2x or higher |
| macOS, tvOS | @1x and @2x |

| Image type | Format |
|---|---|
| Bitmap/raster | De-interlaced PNG |
| PNG not needing 24-bit color | 8-bit palette |
| Photos | JPEG (optimized) or HEIC |
| Stereo/spatial photos | Stereo HEIC |
| Flat icons, interface icons, flat art needing sharp scaling | PDF or SVG |

watchOS autoscaling PDF scale by screen: 38mm 90%, 40mm 100%, 41mm 106%, 42mm 100%, 44mm 110%, 45mm 119%, 49mm 119%.

---

## Spatial layout (visionOS, brief)

Rules:
- [visionOS] Keep important content centered in the field of view (the system does not expose the FOV). Anchor content in space, not to the wearer's head.
- Use small amounts of depth even in windows; use depth for hierarchy and not on text or small elements; change depth sparingly (eyes must refocus).
- Two scales: dynamic (default; windows scale up with distance so they look constant) and fixed (objects keep real-world scale; use sparingly, for noninteractive items). A point is an angle on visionOS.
- Avoid many windows. Prefer indirect gestures (direct for near objects, brief use). The Digital Crown recenters content (no app work). Allow use with little movement. Anchor large immersive content to a horizontal floor plane.
- Numbers: interactive component centers at least 60 pt apart, with at least 16 pt between regular-size buttons; do not let controls overlap other interactive elements.
- Not applicable to iOS, iPadOS, macOS, tvOS or watchOS.

---

## Immersive experiences (visionOS, brief)

Rules:
- [visionOS] Apps run in the Shared Space (alongside others) or a Full Space (alone). Prefer launching in the Shared Space or in `mixed` immersion; let people opt in to more immersion with a clear enter/exit control (state whether exit returns or quits).
- Styles: dimmed or tinted passthrough (subtle tints; `SurroundingsEffect`); `mixed` (blends with passthrough, no boundary; system fades nearby content near physical objects; do not obscure too much passthrough); `progressive` (partial custom environment; Digital Crown adjusts immersion over default range 120 to 360 degrees; portrait or landscape); `full` (360-degree environment replaces passthrough).
- `progressive` and `full` define a boundary about 1.5 m from the initial head position: the experience fades as the head nears it and is replaced by the app icon beyond it. Avoid those styles if users may need to move beyond it; do not require movement.
- Reserve immersion for meaningful moments. Use subtle cues (dimming, tint, motion, scale, Spatial Audio) to direct attention.
- Virtual hands: match the real hand's position and gestures, avoid oversized hands, fade out on tracking loss and fade in on recovery.
- Environments: minimize distracting detail and motion; expansive (not claustrophobic); a ground plane mesh; subtle animation; Spatial Audio without heavy looping, lowered or stopped if other audio plays; prefer lit meshes with shaders over a flat 360 image; vary assets; make interactive objects obviously near.

---

Sources: color, dark-mode, typography, materials, motion, layout, images, spatial-layout, immersive-experiences (https://developer.apple.com/design/human-interface-guidelines/<slug>).
