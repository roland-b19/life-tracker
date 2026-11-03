import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bicep = readFileSync("infra/main.bicep", "utf8");
const deployScript = readFileSync("scripts/azure-deploy.sh", "utf8");

describe("Azure infrastructure contract", () => {
  it("uses a private-access ACR SKU and disables admin access", () => {
    expect(bicep).toContain("name: 'Premium'");
    expect(bicep).toContain("publicNetworkAccess: 'Disabled'");
    expect(bicep).toContain("adminUserEnabled: false");
    expect(bicep).toContain("groupIds: [\n            'registry'");
  });

  it("requires an immutable image digest and never constructs a tag reference", () => {
    expect(bicep).toContain("param imageDigest string");
    expect(bicep).toContain("@minLength(71)");
    expect(bicep).toContain("@maxLength(71)");
    expect(bicep).toContain("@${imageDigest}");
    expect(bicep).not.toContain(":${imageTag}");
    expect(deployScript).toContain(
      'image_digest" =~ ^sha256:[0-9a-f]{64}$',
    );
    expect(deployScript).not.toContain("image_tag");
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

  it("grants private registry and Key Vault access before starting the app", () => {
    expect(bicep).toContain(
      "resource workloadIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31'",
    );
    expect(bicep).toContain("type: 'UserAssigned'");
    expect(bicep).toContain("identity: workloadIdentity.id");
    expect(bicep).toContain("keyVaultSecretsUserRole");
    expect(bicep).toContain("acrPullRole");
  });

  it("configures diagnostic settings, budget alerts and flexible postgres SKU", () => {
    expect(bicep).toContain("param postgresSku string = 'Standard_B1ms'");
    expect(bicep).toContain("resource postgresDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview'");
    expect(bicep).toContain("resource vaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview'");
    expect(bicep).toContain("resource registryDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview'");
    expect(bicep).toContain("resource budget 'Microsoft.Consumption/budgets@2023-05-01'");
  });
});
