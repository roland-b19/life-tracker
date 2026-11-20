const HERE = "http://here.invalid";

/**
 * Where to go after sign-in: `next` when it is a path on this site, else Tasks. Resolved the way a browser would (it
 * drops tabs and newlines and reads `\` as `/`), so `//evil.com`, `/\evil.com` and `/<tab>/evil.com` all go to Tasks.
 */
export function afterSignIn(next: string | string[] | undefined): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/todos";
  try {
    const url = new URL(next, HERE);
    return url.origin === HERE ? url.pathname + url.search + url.hash : "/todos";
  } catch {
    return "/todos";
  }
}
