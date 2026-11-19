// The Appearance choice (D-024), kept per device. Not a client module, so the root layout (a server component) can
// put the script in <head>; the Appearance card in Settings reads and writes the same key. `fadeTheme` runs only in the
// browser (the Appearance card and the system-scheme listener in app/providers.tsx).

/** `light` or `dark`; Auto (follow the system) is no key at all. */
export const THEME_STORAGE = "lt-theme";

/** Runs in <head> before the first paint: sets `data-theme` on <html>, which `app/globals.css` maps to `color-scheme`. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_STORAGE}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

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
