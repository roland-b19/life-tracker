# Icons, SF Symbols and App Icons

When to read this: when choosing or drawing interface icons, picking SF Symbols (rendering mode, weight, scale, variant, animation), making custom symbols, or producing the app icon (layers, Liquid Glass, Icon Composer, appearances, sizes). Pages are ordered Icons, SF Symbols, App icons.

## Icons

Rules:
- Interface icons (glyphs) are simple shapes in black and clear; the system tints the black areas. Use SF Symbols as-is, customized, or draw your own.
- Express one concept with a highly simplified, familiar metaphor directly tied to the action or content. Too much detail makes it unreadable.
- Keep all icons in the app consistent: size, level of detail, stroke weight, perspective. Adjust dimensions of heavy or light icons so they look equal.
- Match icon weight to adjacent text weight unless you want to emphasize one.
- Optical alignment: asymmetric icons (e.g. download, heavier at the bottom) look off when geometrically centered. Nudge slightly and bake the offset into asset padding, then center the asset geometrically. Adjustments are tiny but visible.
- Do not ship a selected-state variant for icons in standard toolbars, tab bars and buttons; the system renders selection.
- Inclusive imagery: gender-neutral figures; avoid metaphors that fail across cultures or languages.
- Text in an icon only when essential (e.g. text formatting). Localize any characters. To suggest a passage of text, draw an abstract representation and provide a flipped version for right-to-left.
- Custom icons: vector (PDF or SVG); the system scales for high-resolution, no @2x/@3x needed. PNG (for shaded or textured art) does not scale, so supply multiple versions. Alternative: make a custom SF Symbol with a scale matching adjacent text.
- Give custom icons an accessibility label (alternative text) for VoiceOver.
- Do not draw Apple hardware replicas (they date quickly); use Apple Design Resources images or the SF Symbols for Apple products.

### Standard icons (SF Symbol names for common actions)
Use these names for consistency across Apple platforms. Blank in the source table means no name given: Save, Close, Folder, Find and Replace, Find Next, Find Previous, Use Selection for Find, Export, User, Profile.

| Group | Action: symbol |
|---|---|
| Editing | Cut: `scissors`; Copy: `document.on.document`; Paste: `document.on.clipboard`; Done: `checkmark`; Cancel: `xmark`; Delete: `trash`; Undo: `arrow.uturn.backward`; Redo: `arrow.uturn.forward`; Compose: `square.and.pencil`; Duplicate: `plus.square.on.square`; Rename: `pencil`; Move to: `folder`; Attach: `paperclip`; Add: `plus`; More: `ellipsis` |
| Selection | Select: `checkmark.circle`; Deselect: `xmark`; Delete: `trash` |
| Text formatting | Superscript: `textformat.superscript`; Subscript: `textformat.subscript`; Bold: `bold`; Italic: `italic`; Underline: `underline`; Align Left: `text.alignleft`; Center: `text.aligncenter`; Justified: `text.justify`; Align Right: `text.alignright` |
| Search | Search: `magnifyingglass`; Find: `text.page.badge.magnifyingglass`; Filter: `line.3.horizontal.decrease` |
| Sharing | Share: `square.and.arrow.up`; Print: `printer` |
| Accounts | Account: `person.crop.circle` |
| Ratings | Dislike: `hand.thumbsdown`; Like: `hand.thumbsup` |
| Layer ordering | Bring to Front: `square.3.layers.3d.top.filled`; Send to Back: `square.3.layers.3d.bottom.filled`; Bring Forward: `square.2.layers.3d.top.filled`; Send Backward: `square.2.layers.3d.bottom.filled` |
| Other | Alarm: `alarm`; Archive: `archivebox`; Calendar: `calendar` |

### Platform considerations
- [macOS] Document icons: a custom document type may have an icon (paper with folded top-right corner). If you supply none, macOS composites your app icon plus the file extension. You supply any mix of background fill, center image and text; the system layers, positions and masks them into the folded-corner shape.
  - Keep designs simple, few distinct colors; it displays as small as 16x16 px. Simplify small sizes (fewer, thicker lines aligned to the reduced pixel grid; drop fine lines at 16x16).
  - Keep important content out of the top-right corner of the background fill (masked, covered by the white fold).
  - A single expressive background with no center image is fine (Xcode, TextEdit do this).
  - Center image is half the size of the document canvas (32x32 px document icon uses a 16x16 px center image). Keep a margin of about 10% of the canvas; content should fill about 80% (205x205 px inside a 256x256 canvas).
  - A short descriptive term can replace the file extension (e.g. "scene" for scn); it is auto-scaled and auto-capitalized, so keep it short.
  - Not applicable on iOS, iPadOS, tvOS, visionOS, watchOS.

Numbers (macOS document icon assets):
- Background fill: 512x512 @1x / 1024x1024 @2x; 256 / 512; 128 / 256; 32 / 64; 16 / 32 (px).
- Center image: 256 / 512; 128 / 256; 32 / 64; 16 / 32 (px). (No 512 center image.)

## SF Symbols

Rules:
- Thousands of symbols aligned with the San Francisco font across all weights and sizes. Use them in toolbars, tab bars, context menus and inline with text.
- Availability depends on OS version: symbols and features new in a given year are not on older OS versions. Check the target.
- License: never use symbols, or confusingly similar images, in app icons, logos or any trademark use.

### Rendering modes
- Four modes: monochrome, hierarchical, palette, multicolor. Symbol paths are organized into layers (e.g. `cloud.sun.rain.fill`: primary = cloud, secondary = sun and rays, tertiary = raindrops).
- Monochrome: one color on all layers.
- Hierarchical: one color, different opacity per layer level.
- Palette: two or more colors, one per layer. With two colors on a three-level symbol, secondary and tertiary share the second color.
- Multicolor: intrinsic colors for meaning (`leaf` green, `trash.slash` red); some layers accept other colors.
- Use system-provided colors so symbols adapt to accessibility settings, vibrancy and Dark Mode (SwiftUI renderingMode(_:)).
- Check legibility of the chosen mode in every context (size, background contrast). The automatic setting gives the symbol's preferred mode but still verify.
- Gradients (SF Symbols 7+): smooth linear gradient from one source color; works in all rendering modes, system and custom colors, and custom symbols; any size, best when large.

### Variable color
- Use it to show a changing quantity (capacity, strength, volume) across layers as a value passes thresholds between 0 and 100%; works in every rendering mode. At zero no layers are colored; otherwise a layer colors at thresholds derived from the number of nonzero states.
- Layers can opt out (e.g. the speaker body of `speaker.wave.3`). Any number of layers may support it.
- Use it for change only, never for depth; use Hierarchical mode for depth and foreground/background.

### Weights and scales
- Nine weights, ultralight to black, each matching a San Francisco weight; match symbol weight to adjacent text.
- Three scales: small, medium (default), large, defined relative to the cap height of San Francisco. Change scale to adjust emphasis against text without breaking weight matching at the same point size (imageScale(_:) SwiftUI, UIImage.SymbolScale UIKit, NSImage.SymbolConfiguration AppKit).

### Design variants
- Outline (most common, text-like), fill (most symbols), slash (unavailable item or action), enclosed in circle, square or rectangle; enclosed and slash often combine with outline or fill.
- Fill suits emphasis: iOS tab bars, swipe actions, selected state under an accent color. Outline suits toolbars, lists and beside text. Enclosing shapes improve legibility at small sizes.
- Often the container picks the variant (iOS tab bar prefers fill, toolbar takes outline), so you need not specify it.
- Language and script variants (Latin, Arabic, Hebrew, Hindi, Thai, Chinese, Japanese, Korean, Cyrillic, Devanagari, several Indic numeral systems) swap automatically with device language.

### Animations
- Work on all symbols, rendering modes, weights, scales, and custom symbols; playback can be once or indefinite until a condition; speed and reverse are configurable (Symbols framework, SymbolEffect).
- Appear / Disappear: gradual in/out.
- Bounce: brief elastic scale up or down, plays once; signals an action occurred or is needed.
- Scale: persistent size change until reset; for selection emphasis or tap feedback.
- Pulse: opacity variation, only layers annotated to pulse (or all); ongoing activity.
- Variable color: layers vary opacity incrementally, cumulative (changes persist through the cycle) or iterative (one layer at a time); for progress, playback, connecting, broadcasting; can autoreverse and hide inactive layers. Open loop = linear layers with unjoined ends; closed loop = complete shape (e.g. circular progress), playing seamlessly.
- Replace: between any symbols, all weights and modes. Configurations: down-up (state change), up-up (state change with forward progression), off-up (outgoing hides at once, emphasizes next state or action).
- Magic Replace: smart transition between related shapes (slashes draw on/off, badges appear/disappear independently). New default replace; unrelated symbols fall back to down-up (fallback direction customizable).
- Wiggle: back-and-forth along an axis; highlights a change or call to action, or reinforces direction.
- Breathe: opacity and size change, living quality; ongoing activity such as recording. Unlike pulse, which changes opacity only.
- Rotate: whole symbol or parts (e.g. desk fan By Layer spins blades only); shows work in progress.
- Draw On / Draw Off (SF Symbols 7+): draws along guide points on or off screen; all layers at once, staggered or one by one; for progress such as a download or directional arrows.
- Use animation judiciously and only with a clear purpose; each type implies a meaning, check it will not confuse; match the app's tone. (note) Honor Reduce Motion for continuous effects (see accessibility.md).

### Custom symbols
- Start from an exported template of a similar symbol; edit in a vector tool. Match system symbols in detail, optical weight, alignment, position and perspective. Make them simple, recognizable, inclusive, directly related to the action.
- Annotate each layer with a color or hierarchy level (primary, secondary, tertiary) so rendering modes work; choose the mode per instance in the app.
- Symbols that depict Apple products or features are copyrighted: display only, never customize (the SF Symbols app badges them with an Info icon; the inspector shows the restrictions). Do not design Apple product replicas.
- Negative side margins help optical horizontal alignment when a badge widens the symbol (e.g. stacked folder symbols). Use the naming pattern from the app, e.g. `left-margin-Regular-M`.
- For layer animation, annotate layers in the SF Symbols app. Z-order sets the order colors apply in variable color, front-to-back or back-to-front; layer groups move together.
- Test every animation preset on custom symbols. Draw whole shapes instead of cutouts (e.g. for a `person.2.fill`-like symbol draw the full left person plus an offset path of the right person, annotated as an erase layer) so animations behave.
- Do not bake common variants (enclosures, badges) into the custom symbol; use the SF Symbols component library to generate them consistently.
- Provide alternative text labels for custom symbols.

## App icons

Rules:
- The icon is shown on the Home Screen, search results, notifications, Settings and share sheets; keep identity consistent on every platform you support.

### Layers and Liquid Glass
- [iOS, iPadOS, macOS, watchOS] One background layer plus one or more foreground layers. The system adds Liquid Glass attributes (specular highlights, refraction, translucency) that scale with icon size, stay consistent across platforms and may differ between system versions.
- [tvOS] Two to five layers; on focus the icon lifts and sways with parallax, so layer separation and transparency give depth.
- [visionOS] Background layer plus one or two layers on top; a 3D object that expands subtly when viewed; system adds inter-layer shadows and uses the alpha of upper layers for an embossed look.
- Draw foreground layers in your design tool. [iOS, iPadOS, macOS, watchOS] Import into Icon Composer (in Xcode, also on the Apple Developer site): set the background, place layers, apply specular and refraction effects, annotate default, dark and mono variants, preview across system versions, export to Xcode. [tvOS, visionOS] Add layers directly to an image stack in Xcode; preview parallax with Parallax Previewer and Parallax Exporter plug-in from Apple Design Resources.
- Foreground edges: clearly defined, no soft or feathered edges (they degrade system highlights and shadows).
- Vary opacity across foreground layers for depth (as the Photos icon does). Import fully opaque layers and set transparency in Icon Composer so you can preview interaction with system effects.
- Background: solid color or gradient (Icon Composer supports both, so custom background images are rarely needed); the gradient must respond well to system lighting. If you import one, it must be full-bleed and opaque.
- Prefer vector (SVG or PDF) layers; outline artwork and convert text to outlines. Use PNG (lossless) for mesh gradients and raster art.

### Formats
- [iOS, iPadOS, macOS, watchOS] Either a nonlayered bitmap (PNG) or a layered Icon Composer file. Prefer Icon Composer for control over Liquid Glass per element and color per appearance.
- A bitmap gets auto-segmented into background plus foreground (two layers) so dark and tinted variants work with a consistent background. Auto Liquid Glass is applied only to large, simple foreground shapes, not to text, thin lines or small complex elements; use a layered file to control this.

### Shape
- [iOS, iPadOS, macOS] Square canvas; the system rounds corners to match device and UI curvature. [tvOS] Rectangular with concentric edges. [visionOS, watchOS] Square canvas, circular mask.
- Supply square (tvOS: rectangular) unmasked layers; the system masks all edges. Pre-masked layers break specular highlights and give jagged edges.
- Keep primary content centered to survive corner or circular masking, most of all on visionOS and watchOS. Use the grids in the app icon production templates (Apple Design Resources).

### Design
- Simple: one core concept, minimal shapes, simple solid or gradient background; no need to fill the canvas. Fine detail looks busy under system shadows and highlights and disappears when small.
- Same design on all platforms the app supports.
- Consider filled, overlapping shapes, with transparency and blur, for depth.
- Text only if essential to experience or brand (not localizable or accessible, often too small). A mnemonic first letter is OK; avoid action words ("Watch", "Play") and context terms ("New", "For visionOS"). [tvOS] Put text above other layers so parallax does not crop it.
- Prefer illustrations to photos; do not replicate UI components or use screenshots. Avoid very thin lines and sharp corners.
- No Apple hardware replicas.

### Visual effects
- Do not paint specular highlights, inter-layer drop shadows, bevels, blurs or glows; the system applies dynamic ones and static ones conflict. If you add any, test in Icon Composer, a simulated device in Device Hub, or a physical device.
- Group layers (in Icon Composer or your design tool) to apply effects per group; Icon Composer exposes extra Liquid Glass options for groups (specular highlights, refraction, translucency).

### Appearances
- [iOS, iPadOS, macOS] Users pick default, dark, clear or tinted Home Screen icons. Provide variants or let the system generate missing ones.
- Keep core features identical across appearances; do not swap elements per variant.
- Dark, clear and tinted are progressively more subdued; they must still be visible, legible and recognizable and sit well beside system icons and widgets. Keep the palette; base dark on the light icon with complementary colors, avoid excessively bright images; colored backgrounds give the most contrast in dark icons.
- Alternate app icons (user-selectable in settings): [iOS, iPadOS, tvOS, and compatible apps on visionOS]. Keep each closely tied to the content and not mistakable for another app. [iOS, iPadOS] Each alternate needs its own dark, clear and tinted variants. All icons are subject to App Review Guidelines.

### Platform considerations
- [tvOS] Keep a safe zone: focus scaling and motion crop edges, more for foreground layers than background; safe zone varies with image size, layer depth and motion.
- [visionOS] Do not draw a shape in the background layer meant to look like a hole or concave area; system shadow and highlights make it pop out.
- [watchOS] Do not use a black background; lighten it so the icon does not merge with the display.

Numbers:

| Platform | Layout shape | Final shape | Layout size | Style | Appearances |
|---|---|---|---|---|---|
| iOS, iPadOS, macOS | Square | Rounded rectangle | 1024x1024 px | Layered | Default, dark, clear light, clear dark, tinted light, tinted dark |
| tvOS | Landscape rectangle | Rounded rectangle | 800x480 px | Layered (parallax) | N/A |
| visionOS | Square | Circular | 1024x1024 px | Layered (3D) | N/A |
| watchOS | Square | Circular | 1088x1088 px | Layered | N/A |

- System auto-generates smaller sizes (Settings, notifications).
- Color spaces: sRGB (color), Gray Gamma 2.2 (grayscale), Display P3 (wide-gamut; iOS, iPadOS, macOS, tvOS, watchOS only, not visionOS).
- The page gives no corner radius or safe-area grid numbers; use the production templates in Apple Design Resources.

Sources: icons, sf-symbols, app-icons
