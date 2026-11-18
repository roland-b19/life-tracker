#!/usr/bin/env bash
# Runs the database migrations as a manual Container Apps job inside the private network.
# Called by azure-deploy.sh; can be rerun alone: DATABASE_URL=... ./scripts/azure-migrate.sh <env> <location> <image-digest>
set -euo pipefail

environment="${1:-}"
location="${2:-}"
image_digest="${3:-}"

if [[ ! "$environment" =~ ^[a-z0-9-]{1,12}$ || ! "$location" =~ ^[a-z0-9-]+$ || ! "$image_digest" =~ ^sha256:[0-9a-f]{64}$ || -z "${DATABASE_URL:-}" ]]; then
  echo "Usage: DATABASE_URL=... $0 <environment> <location> <image-digest>" >&2
  exit 1
fi

resource_group="life-tracker-$environment"
loc_suffix=$(echo "$location" | cut -c1-2)
acr_login_server="lifetracker${environment}${loc_suffix}acr.azurecr.io"
acr_image="$acr_login_server/life-tracker"

echo "Running database migrations via containerapp job..."
container_env_name=$(az containerapp env list --resource-group "$resource_group" --query "[0].name" -o tsv)
container_env_id=$(az containerapp env show --name "$container_env_name" --resource-group "$resource_group" --query id -o tsv)
workload_identity_id=$(az identity show --name "life-tracker-$environment-identity" --resource-group "$resource_group" --query id -o tsv)
migrate_b64=$(base64 < scripts/db-init.cjs | tr -d '\n')
# Same name as postgresName in infra/main.bicep.
db_host="lifetracker${environment}pg.postgres.database.azure.com"

job_yaml_file=$(mktemp)
trap 'rm -f "$job_yaml_file"' EXIT
cat << YAML > "$job_yaml_file"
location: $location
name: lt-migrate-$environment
identity:
  type: UserAssigned
  userAssignedIdentities:
    "$workload_identity_id": {}
properties:
  environmentId: $container_env_id
  configuration:
    triggerType: Manual
    replicaTimeout: 120
    replicaRetryLimit: 1
    manualTriggerConfig:
      parallelism: 1
      replicaCompletionCount: 1
    secrets:
      - name: db-admin-password
        value: "${DB_ADMIN_PASSWORD}"
      - name: database-url
        value: "${DATABASE_URL}"
    registries:
      - server: $acr_login_server
        identity: $workload_identity_id
  template:
    containers:
      - name: lt-migrate-$environment
        image: $acr_image@$image_digest
        command:
          - node
        args:
          - -e
          - "eval(Buffer.from(process.env.MIGRATE_B64,'base64').toString('utf8'))"
        env:
          - name: DB_ADMIN_PASSWORD
            secretRef: db-admin-password
          - name: DATABASE_URL
            secretRef: database-url
          - name: DB_HOST
            value: "${db_host}"
          - name: MIGRATE_B64
            value: "${migrate_b64}"
        resources:
          cpu: 0.25
          memory: 0.5Gi
YAML

# Recreate rather than update: a job whose first revision failed cannot be updated into a working one.
az containerapp job delete --name "lt-migrate-$environment" --resource-group "$resource_group" --yes --output none 2>/dev/null || true
az containerapp job create \
  --name "lt-migrate-$environment" \
  --resource-group "$resource_group" \
  --yaml "$job_yaml_file" \
  --output none
rm -f "$job_yaml_file"

job_exec_name=$(az containerapp job start \
  --name "lt-migrate-$environment" \
  --resource-group "$resource_group" \
  --query name -o tsv)

echo "Waiting for migration job to complete ($job_exec_name)..."
for i in $(seq 1 30); do
  job_status=$(az containerapp job execution show \
    --name "lt-migrate-$environment" \
    --resource-group "$resource_group" \
    --job-execution-name "$job_exec_name" \
    --query "properties.status" -o tsv 2>/dev/null || echo "Unknown")
  echo "  Migration status: $job_status"
  if [[ "$job_status" == "Succeeded" ]]; then
    echo "Migrations completed successfully."
    # The job holds the database secrets; it is not needed once the tables exist.
    az containerapp job delete --name "lt-migrate-$environment" --resource-group "$resource_group" --yes --output none
    break
  elif [[ "$job_status" == "Failed" ]]; then
    echo "FATAL: Database migration job failed." >&2
    echo "Run: ./scripts/azure-teardown.sh $environment DELETE" >&2
    exit 1
  fi
  sleep 5
done
if [[ "${job_status:-}" != "Succeeded" ]]; then
  echo "FATAL: Database migration job did not finish in time (last status: ${job_status:-none})." >&2
  exit 1
fi

