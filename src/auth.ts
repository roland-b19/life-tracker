import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { db } from "@/server/db";
import { users } from "@/db/schema";

if (process.env.AUTH_DEV === "true" && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_DEV must not be enabled in production.");
}

const devProvider =
  process.env.AUTH_DEV === "true"
    ? [
        CredentialsProvider({
          name: "Development user",
          credentials: {
            name: { label: "User name", type: "text" },
          },
          async authorize(credentials) {
            const name = credentials?.name;
            if (typeof name !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(name)) {
              return null;
            }

            const [user] = await db
              .insert(users)
              .values({ issuer: "dev", subject: name })
              .onConflictDoUpdate({
                target: [users.issuer, users.subject],
                set: { subject: name },
              })
              .returning({ id: users.id });
            return user ? { id: user.id, name } : null;
          },
        }),
      ]
    : [];

export const authOptions: NextAuthOptions = {
  providers: devProvider,
  session: { strategy: "jwt", maxAge: 4 * 60 * 60, updateAge: 15 * 60 },
  cookies: {
    sessionToken: {
      name: "__Host-next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
