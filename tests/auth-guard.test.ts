import { afterEach, describe, expect, it, vi } from "vitest";

describe("development authentication guard", () => {
  const env = process.env as Record<string, string | undefined>;

  afterEach(() => {
    vi.resetModules();
    delete env.AUTH_DEV;
    delete env.NODE_ENV;
    delete env.NEXTAUTH_SECRET;
    delete env.AUTH_AZURE_TENANT_ID;
    delete env.AUTH_AZURE_CLIENT_ID;
    delete env.AUTH_AZURE_CLIENT_SECRET;
    delete env.AUTH_ISSUER;
    delete env.AUTH_AZURE_WELLKNOWN;
  });

  it("uses the External ID metadata URL only when AUTH_AZURE_WELLKNOWN is set", async () => {
    env.AUTH_DEV = "false";
    env.NODE_ENV = "production";
    env.DATABASE_URL = "postgresql://unused";
    env.NEXTAUTH_SECRET = "test-secret";
    env.AUTH_AZURE_TENANT_ID = "tenant";
    env.AUTH_AZURE_CLIENT_ID = "client";
    env.AUTH_AZURE_CLIENT_SECRET = "client-secret";
    env.AUTH_ISSUER = "https://tenant.ciamlogin.com/tenant/v2.0";

    const workforce = (await import("@/auth")).authOptions.providers[0];
    expect(workforce.options?.wellKnown).toBeUndefined();
    expect((workforce as { wellKnown?: string }).wellKnown).toContain("https://login.microsoftonline.com/tenant/");

    vi.resetModules();
    const ciam = "https://contoso.ciamlogin.com/tenant/v2.0/.well-known/openid-configuration";
    env.AUTH_AZURE_WELLKNOWN = ciam;
    // next-auth merges provider.options over the provider defaults, so this replaces the workforce URL.
    expect((await import("@/auth")).authOptions.providers[0].options?.wellKnown).toBe(ciam);
  });

  it("refuses development authentication in production", async () => {
    env.AUTH_DEV = "true";
    env.NODE_ENV = "production";
    env.DATABASE_URL = "postgresql://unused";
    await expect(import("@/auth")).rejects.toThrow("AUTH_DEV must not be enabled in production.");
  });

  it("refuses production authentication without OIDC configuration", async () => {
    env.AUTH_DEV = "false";
    env.NODE_ENV = "production";
    env.DATABASE_URL = "postgresql://unused";
    env.NEXTAUTH_SECRET = "test-secret";
    await expect(import("@/auth")).rejects.toThrow(
      "Production authentication requires AUTH_AZURE_TENANT_ID",
    );
  });

  it("refuses production authentication without the session signing secret", async () => {
    env.AUTH_DEV = "false";
    env.NODE_ENV = "production";
    env.DATABASE_URL = "postgresql://unused";
    env.AUTH_AZURE_TENANT_ID = "tenant";
    env.AUTH_AZURE_CLIENT_ID = "client";
    env.AUTH_AZURE_CLIENT_SECRET = "client-secret";
    env.AUTH_ISSUER = "https://issuer.example.com";
    await expect(import("@/auth")).rejects.toThrow(
      "Production authentication requires NEXTAUTH_SECRET.",
    );
  });
});
