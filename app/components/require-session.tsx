import type { ReactNode } from "react";
import { requirePageUser } from "@/server/auth";

/**
 * Layout of every signed-in route: an anonymous visitor gets a real 307 to /signin before any page markup streams.
 * Each page still calls requirePageUser() itself, because a layout does not render again on client navigation.
 * `path` is the route's own path: on a full load this layout redirects before the page runs, so it names the `next`.
 */
export default async function RequireSession({ children, path }: { children: ReactNode; path?: string }) {
  await requirePageUser(path);
  return children;
}
