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
az deployment group show \
  --name main \
  --resource-group "$resource_group" \
  --query "{resourceGroup:properties.outputs.resourceGroupName.value, appUrl:properties.outputs.containerAppUrl.value, postgresServer:properties.outputs.postgresServerName.value}" \
  -o json
