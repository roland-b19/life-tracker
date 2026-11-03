#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
location="${2:-belgiumcentral}"
image_digest="${3:-}"

if [[ ! "$environment" =~ ^[a-z0-9-]{1,12}$ || ! "$location" =~ ^[a-z0-9-]+$ || ! "$image_digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Usage: $0 <environment> <location> <image-digest (sha256:<64 lowercase hex characters>)>" >&2
  exit 1
fi

if [[ "${DEPLOY_APPROVED:-}" != "YES" || "${COST_GATE_APPROVED:-}" != "YES" ]]; then
  echo "Refusing deployment. Set DEPLOY_APPROVED=YES and COST_GATE_APPROVED=YES after explicit approval." >&2
  exit 1
fi

for command_name in az docker; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

az bicep build --file infra/main.bicep --stdout >/dev/null
az account show --output none

for required_var in DB_ADMIN_PASSWORD DATABASE_URL NEXTAUTH_SECRET AUTH_AZURE_CLIENT_SECRET AUTH_AZURE_TENANT_ID AUTH_AZURE_CLIENT_ID AUTH_ISSUER NEXTAUTH_URL; do
  if [[ -z "${!required_var:-}" ]]; then
    echo "Missing required deployment environment variable: $required_var" >&2
    exit 1
  fi
done

db_admin_login="${DB_ADMIN_LOGIN:-ltadmin}"
postgres_sku="${POSTGRES_SKU:-Standard_B1ms}"
owner_email="${OWNER_EMAIL:-$(az account show --query user.name -o tsv)}"
resource_group="life-tracker-$environment"

echo "Ensuring resource group exists with required tags: $resource_group"
az group create \
  --name "$resource_group" \
  --location "$location" \
  --tags project=life-tracker env="$environment" owner="$owner_email" \
  --output none

echo "Running what-if preview for $resource_group in $location..."
az deployment group what-if \
  --resource-group "$resource_group" \
  --template-file infra/main.bicep \
  --parameters \
    environment="$environment" \
    owner="$owner_email" \
    imageDigest="$image_digest" \
    dbAdminLogin="$db_admin_login" \
    dbAdminPassword="$DB_ADMIN_PASSWORD" \
    databaseUrl="$DATABASE_URL" \
    nextAuthSecret="$NEXTAUTH_SECRET" \
    authAzureClientSecret="$AUTH_AZURE_CLIENT_SECRET" \
    nextAuthUrl="$NEXTAUTH_URL" \
    authAzureTenantId="$AUTH_AZURE_TENANT_ID" \
    authAzureClientId="$AUTH_AZURE_CLIENT_ID" \
    authIssuer="$AUTH_ISSUER" \
    postgresSku="$postgres_sku"

if [[ "${CONFIRM_DEPLOY:-}" != "YES" ]]; then
  echo "What-if preview complete. Set CONFIRM_DEPLOY=YES to proceed with live deployment."
  exit 0
fi

echo "Deploying infrastructure to $resource_group..."
if ! az deployment group create \
  --name main \
  --resource-group "$resource_group" \
  --template-file infra/main.bicep \
  --parameters \
    environment="$environment" \
    owner="$owner_email" \
    imageDigest="$image_digest" \
    dbAdminLogin="$db_admin_login" \
    dbAdminPassword="$DB_ADMIN_PASSWORD" \
    databaseUrl="$DATABASE_URL" \
    nextAuthSecret="$NEXTAUTH_SECRET" \
    authAzureClientSecret="$AUTH_AZURE_CLIENT_SECRET" \
    nextAuthUrl="$NEXTAUTH_URL" \
    authAzureTenantId="$AUTH_AZURE_TENANT_ID" \
    authAzureClientId="$AUTH_AZURE_CLIENT_ID" \
    authIssuer="$AUTH_ISSUER" \
    postgresSku="$postgres_sku" \
  --output none; then
  echo "Deployment failed! Run teardown immediately to prevent stray resources:" >&2
  echo "./scripts/azure-teardown.sh $environment DELETE" >&2
  exit 1
fi

echo "Deployment succeeded. Non-secret outputs:"
deployment_outputs=$(az deployment group show \
  --name main \
  --resource-group "$resource_group" \
  --query "{resourceGroup:properties.outputs.resourceGroupName.value, appUrl:properties.outputs.containerAppUrl.value, postgresServer:properties.outputs.postgresServerName.value, acrLoginServer:properties.outputs.acrLoginServer.value}" \
  -o json)
echo "$deployment_outputs"

acr_login_server=$(echo "$deployment_outputs" | grep -o '"acrLoginServer": *"[^"]*"' | cut -d'"' -f4)
acr_name="${acr_login_server%%.*}"
app_url=$(echo "$deployment_outputs" | grep -o '"appUrl": *"[^"]*"' | cut -d'"' -f4)

# ── Step: Push image to ACR ────────────────────────────────────────────────
# shortcut: ACR public access is enabled briefly for the bootstrap push then
# disabled immediately; a dedicated self-hosted runner inside the VNet would
# eliminate this window. Acceptable for a course ephemeral deployment.
echo "Temporarily enabling ACR public access for image push..."
az acr update --name "$acr_name" --public-network-enabled true --output none

echo "Logging in to ACR: $acr_login_server"
az acr login --name "$acr_name" --output none
acr_image="$acr_login_server/life-tracker"
echo "Tagging and pushing image $acr_image@$image_digest"
docker build -t "$acr_image:deploy" .
docker push "$acr_image:deploy"
pushed_digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$acr_image:deploy" | cut -d@ -f2)
echo "Image pushed with digest: $pushed_digest"

echo "Re-disabling ACR public access..."
az acr update --name "$acr_name" --public-network-enabled false --output none

# Verify digest matches the one passed to Bicep (immutable guarantee)
if [[ "$pushed_digest" != "$image_digest" ]]; then
  echo "FATAL: pushed digest ($pushed_digest) does not match expected ($image_digest)" >&2
  echo "Run: ./scripts/azure-teardown.sh $environment DELETE" >&2
  exit 1
fi

# ── Step: Update Entra redirect URIs ────────────────────────────────────────
echo "Updating Entra app redirect URIs for: $app_url"
az ad app update \
  --id "$AUTH_AZURE_CLIENT_ID" \
  --web-redirect-uris "${app_url}/api/auth/callback/azure-ad" "http://localhost:3000/api/auth/callback/azure-ad" \
  --output none

# ── Step: Run database migrations via az container job ──────────────────────
echo "Running database migrations..."
container_env_name=$(az containerapp env list --resource-group "$resource_group" --query "[0].name" -o tsv)
az containerapp job create \
  --name "lt-migrate-$environment" \
  --resource-group "$resource_group" \
  --environment "$container_env_name" \
  --trigger-type Manual \
  --replica-timeout 120 \
  --image "$acr_image@$image_digest" \
  --registry-server "$acr_login_server" \
  --cpu 0.25 --memory 0.5Gi \
  --env-vars DATABASE_URL=secretref:database-url \
  --secrets "database-url=$DATABASE_URL" \
  --command "node" \
  --args "node_modules/.bin/drizzle-kit" "migrate" \
  --output none 2>/dev/null || true

az containerapp job start \
  --name "lt-migrate-$environment" \
  --resource-group "$resource_group" \
  --output none

echo "Waiting for migration job to complete..."
for i in $(seq 1 30); do
  job_status=$(az containerapp job execution list \
    --name "lt-migrate-$environment" \
    --resource-group "$resource_group" \
    --query "[0].properties.status" -o tsv 2>/dev/null || echo "Unknown")
  echo "  Migration status: $job_status"
  if [[ "$job_status" == "Succeeded" ]]; then
    echo "Migrations completed successfully."
    break
  elif [[ "$job_status" == "Failed" ]]; then
    echo "FATAL: Database migration job failed." >&2
    echo "Run: ./scripts/azure-teardown.sh $environment DELETE" >&2
    exit 1
  fi
  sleep 10
done

echo ""
echo "Deployment complete."
echo "  App URL:  $app_url"
echo "  ACR:      $acr_login_server"
echo ""
echo "Next steps:"
echo "  1. Update NEXTAUTH_URL in .env.azure to: $app_url"
echo "  2. Run end-to-end smoke tests (health, Entra login, authorization)"
echo "  3. Run teardown after validation: ./scripts/azure-teardown.sh $environment DELETE"
