import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import GitHubProvider from "next-auth/providers/github";
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
  });
}

// The free variant signs in with GitHub. The GitHub numeric id is immutable, unlike the login name or email.
const GITHUB_ISSUER = "https://github.com";

function isOwner(githubId: string) {
  const allowed = (process.env.OWNER_ALLOWLIST ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return allowed.includes(githubId);
}

function getGitHubProvider() {
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const clientId = process.env.AUTH_GITHUB_ID ?? (isBuild ? "build-client" : undefined);
  const clientSecret = process.env.AUTH_GITHUB_SECRET ?? (isBuild ? "build-client-secret" : undefined);
  if (!clientId || !clientSecret) {
    throw new Error("GitHub authentication requires AUTH_GITHUB_ID and AUTH_GITHUB_SECRET.");
  }
  if (!isBuild && !process.env.OWNER_ALLOWLIST?.trim()) {
    throw new Error("GitHub authentication requires OWNER_ALLOWLIST (comma-separated GitHub numeric ids).");
  }
  return GitHubProvider({ clientId, clientSecret, authorization: { params: { scope: "read:user" } } });
}

const providerName = process.env.AUTH_PROVIDER ?? "azure-ad";
if (providerName !== "azure-ad" && providerName !== "github") {
  throw new Error('AUTH_PROVIDER must be "azure-ad" or "github".');
}
const useGitHub = providerName === "github";

const providers =
  process.env.AUTH_DEV === "true"
    ? devProvider
    : [useGitHub ? getGitHubProvider() : getProductionProvider()];

const isProduction = process.env.NODE_ENV === "production";

export const authOptions: NextAuthOptions = {
  providers,
  // Our own page also shows the AccessDenied result, instead of NextAuth's default error page.
  pages: { signIn: "/signin", error: "/signin" },
  // Azure: 4 hours. Free variant: 180 days for one personal user; the allowlist is rechecked on every session read.
  session: useGitHub
    ? { strategy: "jwt", maxAge: 180 * 24 * 60 * 60, updateAge: 24 * 60 * 60 }
    : { strategy: "jwt", maxAge: 4 * 60 * 60, updateAge: 15 * 60 },
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

      const isGitHub = account?.provider === "github";
      const issuer = isGitHub ? GITHUB_ISSUER : process.env.AUTH_ISSUER;
      const subject = account?.providerAccountId;
      if (!issuer || !subject) return false;
      // Denied before any users row exists.
      if (isGitHub && !isOwner(subject)) return false;

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
    async jwt({ token, user, account }) {
      if (user?.id) token.userId = user.id;
      if (account?.provider === "github") token.githubId = account.providerAccountId;
      return token;
    },
    // No database lookup: this runs on every page and action. The signed token is trusted for its lifetime.
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        const revoked = typeof token.githubId === "string" && !isOwner(token.githubId);
        session.user.id = revoked ? (undefined as unknown as string) : token.userId;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
