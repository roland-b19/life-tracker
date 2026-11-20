import "next-auth";

declare module "next-auth" {
  interface Session {
    /** This device's `user_sessions` row (D-041). */
    sid?: string;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
