import type { ReactNode } from "react";
import RequireSession from "../components/require-session";

/**
 * A signed-out visit to /health goes to the sign-in form, which comes back here. Called, not rendered as JSX, so the
 * layout itself redirects (tests/pages-auth.test.ts calls each layout as a function).
 */
export default function HealthLayout({ children }: { children: ReactNode }) {
  return RequireSession({ children, path: "/health" });
}
