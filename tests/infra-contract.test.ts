import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bicep = readFileSync("infra/main.bicep", "utf8");
const deployScript = readFileSync("scripts/azure-deploy.sh", "utf8");
const migrateScript = readFileSync("scripts/azure-migrate.sh", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");
const rootPackage = readFileSync("package.json", "utf8");

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
    expect(bicep).toContain("4633458b-17de-408a-b874-0445c86b69e6");
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
    // Key Vault Secrets User is granted per secret, never on the whole vault: three for the web app, two for the worker.
    expect(bicep.match(/scope: \w+Secret\b/g)).toHaveLength(5);
    expect(bicep).not.toMatch(/guid\(keyVault\.id[^\n]*kv-secrets-user/);
    expect(bicep).toContain("acrPullRole");
    expect(bicep).toContain("registryPrivateDnsGroup");
    expect(bicep).toContain("vaultPrivateDnsGroup");
  });

  it("configures diagnostic settings, budget alerts and flexible postgres SKU", () => {
    expect(bicep).toContain("param postgresSku string = 'Standard_B1ms'");
    expect(bicep).toContain("resource postgresDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview'");
    expect(bicep).toContain("resource vaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview'");
    expect(bicep).toContain("resource registryDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview'");
    expect(bicep).toContain("resource budget 'Microsoft.Consumption/budgets@2023-05-01'");
    expect(bicep).toContain("output acrLoginServer string = registry.properties.loginServer");
  });
});

describe("Azure reminder pipeline contract", () => {
  it("keeps the queue storage account off the public internet and key-less", () => {
    expect(bicep).toContain("resource storage 'Microsoft.Storage/storageAccounts@2023-05-01'");
    expect(bicep).toContain("allowSharedKeyAccess: false");
    expect(bicep).toContain("allowBlobPublicAccess: false");
    expect(bicep).toContain("publicNetworkAccess: 'Disabled'");
    expect(bicep).toContain("defaultAction: 'Deny'");
    expect(bicep).toContain("minimumTlsVersion: 'TLS1_2'");
    expect(bicep).toContain("groupIds: [\n            'queue'");
    expect(bicep).toContain("privatelink.queue.${az.environment().suffixes.storage}");
    expect(bicep).toContain("storagePrivateDnsGroup");
  });

  it("gives the worker its own identity with queue roles on the queue only, and no storage key", () => {
    expect(bicep).toContain("resource workerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31'");
    expect(bicep).toContain("c6a89b2d-59bc-44d0-9896-0f6e12d7b80a"); // Storage Queue Data Message Sender
    expect(bicep).toContain("8a0f0c08-91a1-4084-bc3d-661d67233fed"); // Storage Queue Data Message Processor
    expect(bicep.match(/scope: reminderQueue/g)).toHaveLength(2);
    expect(bicep).not.toContain("storage.listKeys");
  });

  it("runs the enqueue and send jobs from the worker image, by digest, with secrets from Key Vault", () => {
    expect(bicep).toContain("param workerImageDigest string");
    expect(bicep).toContain("life-tracker-worker@${workerImageDigest}");
    expect(bicep).toContain("resource enqueueJob 'Microsoft.App/jobs@2023-05-01'");
    expect(bicep).toContain("resource sendJob 'Microsoft.App/jobs@2023-05-01'");
    expect(bicep.match(/triggerType: 'Schedule'/g)).toHaveLength(2);
    expect(bicep).toContain("'send.mjs'");
    // The enqueue job delivers what it queued in the same run, so a reminder lands within seconds of its minute (not a minute later).
    expect(bicep).toContain("node enqueue.mjs; enqueue_exit=$?; node send.mjs && exit $enqueue_exit");
    expect(bicep).toContain("secretRef: 'vapid-private-key'");
    expect(bicep).toContain("name: 'vapid-private-key'");
    expect(bicep).toMatch(/@secure\(\)\n@minLength\(1\)\n@description\('VAPID private key[^\n]*\nparam vapidPrivateKey string/);
    // The web app never touches the queue or the push key.
    const webApp = bicep.slice(bicep.indexOf("resource containerApp "), bicep.indexOf("// Key Vault Secrets User on each secret"));
    expect(webApp).not.toMatch(/QUEUE_|VAPID/);
  });

  it("monitors the app and the pipeline: alerts to an action group, saved queries, queue diagnostics", () => {
    for (const resource of [
      "resource alertGroup 'Microsoft.Insights/actionGroups@2023-01-01'",
      "resource webServerErrorsAlert 'Microsoft.Insights/metricAlerts@2018-03-01'",
      "resource webRestartsAlert 'Microsoft.Insights/metricAlerts@2018-03-01'",
      "resource queueBacklogAlert 'Microsoft.Insights/metricAlerts@2018-03-01'",
      "resource queueDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview'",
    ]) {
      expect(bicep).toContain(resource);
    }
    expect(bicep.match(/Microsoft\.OperationalInsights\/workspaces\/savedSearches@2020-08-01/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("deploys the worker and the push flag from the script, without printing secrets", () => {
    expect(deployScript).toContain("VAPID_PRIVATE_KEY");
    expect(deployScript).toContain('docker build --platform linux/amd64 -t "$acr_worker_image:deploy" worker');
    expect(deployScript).toContain('workerImageDigest="$worker_image_digest"');
    expect(deployScript).toContain("--build-arg NEXT_PUBLIC_PUSH_ENABLED=true");
    expect(deployScript).not.toMatch(/echo[^\n]*VAPID_PRIVATE_KEY/);
    expect(dockerfile).toContain("ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=");
    expect(dockerfile).toContain("ARG NEXT_PUBLIC_PUSH_ENABLED=false"); // off unless the Azure deploy asks for it
  });

  it("keeps the worker's dependencies out of the web app (and so out of the Vercel build)", () => {
    for (const dependency of ["web-push", "@azure/storage-queue", "@azure/identity"]) expect(rootPackage).not.toContain(dependency);
    expect(readFileSync("worker/package.json", "utf8")).toContain("@azure/storage-queue");
  });

  it("imports web-push as a namespace: version 4 is ESM with named exports and no default export", () => {
    // The worker's dependencies are not installed here, so this guards the import statically; a default import
    // passes lint, typecheck and every test, and then fails the job at start-up.
    const send = readFileSync("worker/send.mjs", "utf8");
    expect(send).toContain('import * as webpush from "web-push";');
    expect(send).not.toMatch(/import\s+webpush\s+from/);
    expect(JSON.parse(readFileSync("worker/package.json", "utf8")).dependencies["web-push"]).toMatch(/^\^?4\./);
  });

  it("runs migrations from their own script, with the identity attached to the job", () => {
    expect(deployScript).toContain('./scripts/azure-migrate.sh "$environment"');
    expect(migrateScript).toContain('az identity show --name "life-tracker-$environment-identity"');
    expect(migrateScript).toContain("userAssignedIdentities:");
  });

  it("builds the Azure schema from the Drizzle migrations only, so it cannot drift from the code", () => {
    const dbInit = readFileSync("scripts/db-init.cjs", "utf8");
    expect(dbInit).toContain("drizzle-orm/node-postgres/migrator");
    expect(dbInit).not.toMatch(/CREATE TABLE|GRANT SELECT/); // 2026-11-16: a hand-kept copy of the schema left the live Gym, Food and export pages broken
    expect(dockerfile).toContain("COPY --chown=nextjs:nodejs drizzle ./drizzle");
    expect(dockerfile).toContain("/app/node_modules/drizzle-orm ./node_modules/drizzle-orm");
    expect(readFileSync(".dockerignore", "utf8").split("\n")).not.toContain("drizzle");
  });

  it("has no default Azure database host: the migrate script derives it from the bicep name and passes it in", () => {
    expect(bicep).toContain("var postgresName = replace('${suffix}-pg', '-', '')"); // lifetracker<env>pg
    expect(migrateScript).toContain('db_host="lifetracker${environment}pg.postgres.database.azure.com"');
    expect(migrateScript).toContain("name: DB_HOST");
    expect(readFileSync("scripts/db-init.cjs", "utf8")).not.toContain("postgres.database.azure.com");
  });

  it("ships public/ in the image: the service worker, manifest, icons and 3D models are served from it", () => {
    expect(dockerfile).toContain("/app/public ./public");
    expect(readFileSync(".dockerignore", "utf8").split("\n")).not.toContain("public");
  });

  it("keeps the database secrets of the migration job out of plain env values", () => {
    expect(migrateScript).toContain("secretRef: db-admin-password");
    expect(migrateScript).toContain("secretRef: database-url");
  });
});
