// The Appearance choice (D-024), kept per device. Not a client module, so the root layout (a server component) can
// put the script in <head>; the Appearance card in Settings reads and writes the same key.

/** `light` or `dark`; Auto (follow the system) is no key at all. */
export const THEME_STORAGE = "lt-theme";

/** Runs in <head> before the first paint: sets `data-theme` on <html>, which `app/globals.css` maps to `color-scheme`. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_STORAGE}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
