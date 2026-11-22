import type { ReactNode } from "react";
import RequireSession from "../components/require-session";

// Called, not rendered as <RequireSession>, so the redirect happens in this layout itself (tests/pages-auth.test.ts calls it).
export default function GymLayout({ children }: { children: ReactNode }) {
  return RequireSession({ children, path: "/gym" });
}
