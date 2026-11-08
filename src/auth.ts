import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import type { NextAuthOptions } from "next-auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/db/schema";

if (process.env.AUTH_DEV === "true" && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_DEV must not be enabled in production.");
}

if (process.env.NODE_ENV === "production" && !process.env.NEXTAUTH_SECRET) {
  throw new Error("Production authentication requires NEXTAUTH_SECRET.");
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

function getProductionProvider() {
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const tenantId = process.env.AUTH_AZURE_TENANT_ID ?? (isBuild ? "build-tenant" : undefined);
  const clientId = process.env.AUTH_AZURE_CLIENT_ID ?? (isBuild ? "build-client" : undefined);
  const clientSecret =
    process.env.AUTH_AZURE_CLIENT_SECRET ?? (isBuild ? "build-client-secret" : undefined);
  const issuer = process.env.AUTH_ISSUER ?? (isBuild ? "https://build.example.com/v2.0" : undefined);

  if (!tenantId || !clientId || !clientSecret || !issuer) {
    throw new Error(
      "Production authentication requires AUTH_AZURE_TENANT_ID, AUTH_AZURE_CLIENT_ID, AUTH_AZURE_CLIENT_SECRET and AUTH_ISSUER.",
    );
  }

  return AzureADProvider({
    clientId,
    clientSecret,
    tenantId,
    authorization: { params: { scope: "openid profile email" } },
    issuer,
    // External ID (CIAM) tenants publish metadata on <subdomain>.ciamlogin.com, not login.microsoftonline.com.
    ...(process.env.AUTH_AZURE_WELLKNOWN ? { wellKnown: process.env.AUTH_AZURE_WELLKNOWN } : {}),
  });
}

const providers =
  process.env.AUTH_DEV === "true" ? devProvider : [getProductionProvider()];

const isProduction = process.env.NODE_ENV === "production";

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt", maxAge: 4 * 60 * 60, updateAge: 15 * 60 },
  cookies: isProduction
    ? {
        sessionToken: {
          name: "__Host-next-auth.session-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: true,
          },
        },
      }
    : undefined,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true;

      const issuer = process.env.AUTH_ISSUER;
      const subject = account?.providerAccountId;
      if (!issuer || !subject) return false;

      const [localUser] = await db
        .insert(users)
        .values({ issuer, subject })
        .onConflictDoNothing()
        .returning({ id: users.id });

      if (localUser) {
        user.id = localUser.id;
        return true;
      }

      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.issuer, issuer), eq(users.subject, subject)))
        .limit(1);
      if (!existingUser) return false;
      user.id = existingUser.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        const [existingUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, token.userId))
          .limit(1);

        if (existingUser) {
          session.user.id = existingUser.id;
        } else {
          session.user.id = undefined as unknown as string;
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
