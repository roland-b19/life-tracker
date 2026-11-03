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

loc_suffix=$(echo "$location" | cut -c1-2)
acr_name="lifetracker${environment}${loc_suffix}acr"
run_suffix=$(date +%s | tail -c 5)
kv_name="lt${environment}${loc_suffix}kv${run_suffix}"
acr_login_server="${acr_name}.azurecr.io"
acr_image="$acr_login_server/life-tracker"

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
    postgresSku="$postgres_sku" \
    registryName="$acr_name" \
    keyVaultName="$kv_name"

if [[ "${CONFIRM_DEPLOY:-}" != "YES" ]]; then
  echo "What-if preview complete. Set CONFIRM_DEPLOY=YES to proceed with live deployment."
  exit 0
fi

# ── Step: Bootstrap ACR and push container image ─────────────────────────────
# shortcut: ACR is bootstrapped and public access used briefly for image push;
# Bicep will lock it down with private endpoint and publicNetworkAccess=Disabled.
echo "Ensuring ACR exists for container image push: $acr_name"
if ! az acr show --name "$acr_name" --resource-group "$resource_group" --output none 2>/dev/null; then
  az acr create \
    --name "$acr_name" \
    --resource-group "$resource_group" \
    --location "$location" \
    --sku Premium \
    --tags project=life-tracker env="$environment" owner="$owner_email" \
    --output none
fi

echo "Authenticating to ACR: $acr_login_server"
auth_ok=false
for attempt in $(seq 1 6); do
  if token=$(az acr login --name "$acr_name" --expose-token --output tsv --query accessToken 2>/dev/null); then
    if echo "$token" | docker login "$acr_login_server" --username 00000000-0000-0000-0000-000000000000 --password-stdin >/dev/null 2>&1; then
      echo "Successfully authenticated to ACR via token."
      auth_ok=true
      break
    fi
  fi
  echo "Waiting for ACR endpoint DNS propagation (attempt $attempt/6)..."
  sleep 5
done

if [[ "$auth_ok" != "true" ]]; then
  echo "FATAL: Failed to authenticate to ACR $acr_name after 6 attempts." >&2
  exit 1
fi

echo "Tagging and pushing image $acr_image@$image_digest"
if docker image inspect "$image_digest" >/dev/null 2>&1; then
  docker tag "$image_digest" "$acr_image:deploy"
else
  docker build --platform linux/amd64 -t "$acr_image:deploy" .
fi
docker push "$acr_image:deploy"
pushed_digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$acr_image:deploy" | cut -d@ -f2)
echo "Image pushed with digest: $pushed_digest"

# Verify digest matches the one passed to Bicep (immutable guarantee)
if [[ "$pushed_digest" != "$image_digest" ]]; then
  echo "FATAL: pushed digest ($pushed_digest) does not match expected ($image_digest)" >&2
  echo "Run: ./scripts/azure-teardown.sh $environment DELETE" >&2
  exit 1
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
    registryName="$acr_name" \
    keyVaultName="$kv_name" \
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

app_url=$(echo "$deployment_outputs" | grep -o '"appUrl": *"[^"]*"' | cut -d'"' -f4)

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
