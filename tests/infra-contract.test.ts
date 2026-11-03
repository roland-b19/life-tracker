import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bicep = readFileSync("infra/main.bicep", "utf8");

describe("Azure infrastructure contract", () => {
  it("uses a private-access ACR SKU and disables admin access", () => {
    expect(bicep).toContain("name: 'Premium'");
    expect(bicep).toContain("publicNetworkAccess: 'Disabled'");
    expect(bicep).toContain("adminUserEnabled: false");
    expect(bicep).toContain("groupIds: [\n            'registry'");
  });

  it("requires and injects production runtime configuration from Key Vault", () => {
    for (const parameter of [
      "param databaseUrl string",
      "param nextAuthSecret string",
      "param authAzureClientSecret string",
      "param nextAuthUrl string",
      "param authAzureTenantId string",
      "param authAzureClientId string",
      "param authIssuer string",
    ]) {
      expect(bicep).toContain(parameter);
    }

    expect(bicep).toContain("name: 'database-url'");
    expect(bicep).toContain("name: 'nextauth-secret'");
    expect(bicep).toContain("name: 'auth-azure-client-secret'");
    expect(bicep).toContain("name: 'AUTH_DEV'\n              value: 'false'");
    expect(bicep).toContain("roleDefinitionId");
    expect(bicep).toContain("4633458b-17de-408a-b874-0445c86e6e6");
    expect(bicep).toContain("secretRef: 'database-url'");
    expect(bicep).toContain("secretRef: 'nextauth-secret'");
    expect(bicep).toContain("secretRef: 'auth-azure-client-secret'");
  });
});
