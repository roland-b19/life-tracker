import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { isSessionLive } from "@/server/sessions";

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "UnauthorizedError";
  }
}

/** The signed-in user, once per request: a token counts only while its device's session row exists (D-041). */
const currentUser = cache(async () => {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const sid = session?.sid;
  if (!user?.id || !sid) return null;
  if (!(await isSessionLive(sid, user.id))) return null;
  return { id: user.id, name: user.name ?? "User" };
});

/** For server actions: the signed-in user's id, or a rejection. */
export async function requireUser(): Promise<string> {
  const user = await currentUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user.id;
}

/**
 * For pages and layouts: the signed-in user, or a redirect to /signin. Every page calls this itself, even under
 * `RequireSession`: a layout does not render again on client navigation, so it cannot be the only guard. `path` is the
 * page's own route: the sign-in form goes back to it afterwards.
 */
export async function requirePageUser(path?: string): Promise<{ id: string; name: string }> {
  const user = await currentUser();
  if (!user) redirect(path ? `/signin?next=${encodeURIComponent(path)}` : "/signin");
  return user;
}
