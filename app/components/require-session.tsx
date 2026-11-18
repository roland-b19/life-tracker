import type { ReactNode } from "react";
import { requirePageUser } from "@/server/auth";

/**
 * Layout of every signed-in route: an anonymous visitor gets a real 307 to /signin before any page markup streams.
 * Each page still calls requirePageUser() itself, because a layout does not render again on client navigation.
 */
export default async function RequireSession({ children }: { children: ReactNode }) {
  await requirePageUser();
  return children;
}
