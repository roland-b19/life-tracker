// The Appearance choice (D-024, D-047), kept per device. Not a client module, so the root layout (a server component)
// can put the script in <head>; the Appearance card in Settings keeps the same key through `useDeviceState`, and
// `ShellListeners` applies a change. `fadeTheme` runs only in the browser (`ShellListeners` and the system-scheme
// listener in app/providers.tsx).

/** `"auto"`, `"light"` or `"dark"` as JSON, as `useDeviceState` keeps it; no key is Auto. */
export const THEME_STORAGE = "lt-theme";

/**
 * Runs in <head> before the first paint: sets `data-theme` on <html>, which `app/globals.css` maps to `color-scheme`. A
 * value kept before D-047 (`light` or `dark`, not JSON) is rewritten as JSON; anything else unreadable means Auto.
 */
export const themeScript = `try{var k="${THEME_STORAGE}",t=localStorage.getItem(k);if(t==="light"||t==="dark")localStorage.setItem(k,JSON.stringify(t));else t=t&&JSON.parse(t);if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

let fadeEnd: ReturnType<typeof setTimeout> | undefined;

/**
 * Call right before the mode changes (or as the system scheme changes): the colors then fade into the other mode for
 * half a second instead of switching at once (the `[data-theme-fade]` rule in app/globals.css). Skipped with reduced
 * motion.
 */
export function fadeTheme() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.documentElement;
  root.dataset.themeFade = "";
  clearTimeout(fadeEnd);
  fadeEnd = setTimeout(() => delete root.dataset.themeFade, 600);
}
