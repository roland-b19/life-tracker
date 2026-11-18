import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "UnauthorizedError";
  }
}

async function currentUser() {
  const user = (await getServerSession(authOptions))?.user;
  return user?.id ? { id: user.id, name: user.name ?? "User" } : null;
}

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
 * `RequireSession`: a layout does not render again on client navigation, so it cannot be the only guard.
 */
export async function requirePageUser(): Promise<{ id: string; name: string }> {
  const user = await currentUser();
  if (!user) redirect("/signin");
  return user;
}
