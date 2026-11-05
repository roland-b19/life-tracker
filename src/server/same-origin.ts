// CSRF guard for cookie-authenticated JSON routes. `request.url` carries the address the server
// is bound to (HOSTNAME=0.0.0.0 in the container), so compare with the Host the client really used.
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0]?.trim();
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
