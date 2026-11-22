import type { ReactNode } from "react";
import RequireSession from "../components/require-session";

/**
 * A signed-out visit to /settings goes to the sign-in form, which comes back here. Called, not rendered as JSX, so the
 * layout itself redirects (tests/pages-auth.test.ts calls each layout as a function).
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return RequireSession({ children, path: "/settings" });
}
