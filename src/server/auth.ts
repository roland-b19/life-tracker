import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(): Promise<string> {
  const session = await getServerSession(authOptions);
  const userId = (session as Session | null)?.user?.id;
  if (!userId) {
    throw new UnauthorizedError();
  }
  return userId;
}
