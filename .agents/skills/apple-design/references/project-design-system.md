# Life Tracker design system (Ember)

Project-specific layer on top of the HIG rules. Chosen by the user on 2026-11-04 from the design options artifact ("Life Tracker Design Options"). Implemented in `app/globals.css` and `app/components/navigation.tsx`. When this file and a generic HIG reference disagree, this file wins for Life Tracker, and the deviation is listed below on purpose.

## Decisions

| Area | Choice |
|---|---|
| Palette | **Ember**: dark, warm graphite with a terracotta accent. Dark only. |
| Font | **SF Pro** through the system stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui`). No web font files. Tabular figures for every number (weights, money, macros). |
| Motion | **Apple spring**: 420 ms, `cubic-bezier(0.32, 0.72, 0, 1)`, small overshoot on controls only. |
| Scrollbars | **Never visible**, on any element (`scrollbar-width: none` and `::-webkit-scrollbar { display: none }`). Content stays scrollable. |
| Navigation | Desktop (1024 px and up): fixed translucent sidebar, 248 px. Below that: floating blurred tab bar with 4 primary modules plus **More** (popover with the rest, the user and Sign out). |
| Modals | Centered over a blurred, dimmed backdrop. Never bottom sheets. No shadows anywhere: depth comes from border, blur and translucency. |

## Tokens (CSS custom properties on `:root`)

| Token | Value | Use |
|---|---|---|
| `--background` | `#1f1c1b` | page |
| `--surface-solid` | `#292524` | cards (translucent `--surface` on top of blur) |
| `--surface-secondary` | `#332e2c` at 65% | raised controls, inputs |
| `--card-border` | `#463f3b` | card and control borders |
| `--separator` | `#3a3431` | hairlines |
| `--text` | `#f3eeea` | primary text (contrast above 12:1 on `--background`) |
| `--secondary` | `#b3a8a1` | secondary text (above 7:1) |
| `--tint` / `--tint-hover` | `#e8946a` / `#f0a984` | the single accent: primary buttons, active tab, links |
| `--on-tint` | `#1f120a` | text and icons on the accent (never white) |
| `--success` `--warning` `--danger` | `#8fd19e` `#efc56f` `#f08a8a` | status, always paired with an icon or text, never color alone |
| `--dur` `--ease` `--pop` `--press` | 420 ms, spring ease, overshoot ease, 0.96 | all motion |

Rules:
- Use tokens, never raw hex or `rgba` for UI colors in components. A tinted status background is `rgba(<token rgb>, 0.12 to 0.15)`.
- One accent only. No extra hues (no purple, no blue); differentiate with weight, icon and position.
- Cards entering the page use the `rise` animation (14 px up, 70 ms stagger). Buttons and nav items shrink to `scale(var(--press))` while pressed. Cards tint their border on hover. Animate `transform` and `opacity` only, never longer than 500 ms.
- `prefers-reduced-motion` turns every transition and animation into an instant change (already global in `globals.css`; keep it).

## Deliberate deviations from the generic HIG references

- **Dark only, no light mode and no in-app switch.** The generic rule says to follow the system appearance. The user chose a single moody dark identity; the viewport declares `colorScheme: "dark"`. Contrast must therefore be checked against Ember only. If a light theme is ever added, it is a new decision in `docs/decisions.md`.
- **Liquid Glass is approximated** with `backdrop-filter: blur(28px) saturate(160%)` on the sidebar, tab bar, popover and modals only. Cards use a lighter translucent surface; do not add glass to list rows.
- **SF Symbols cannot be shipped on the web.** Icons are inline stroke SVGs (1.75 px stroke, round caps) in the style of SF Symbols. Do not use emoji as UI icons. Emoji that the user types into data (for example a category name) are content and stay as they are.

## Layout checklist (every screen)

1. Works at 390 px (tab bar, 16 px gutters, content clears the bar: `main` has 6 rem bottom padding) and at 1280 px and 1920 px (sidebar plus content, centered max width at 1480 px and up).
2. Hit targets at least 44 x 44 CSS px, including tab items and icon buttons.
3. No horizontal page scroll at any width; no visible scrollbar.
4. Tab bar and sidebar expose `aria-current="page"`; More is a menu button with `aria-expanded` and closes on Escape and on backdrop tap.
5. Focus ring visible on every interactive element (accent outline, 2 px offset).
6. The accessibility checklist in `accessibility.md` passes.

Sources: the user's validated artifact (palette, font, motion, navigation); HIG pages Color, Typography, Motion, Tab bars, Sidebars, Materials, Accessibility.
