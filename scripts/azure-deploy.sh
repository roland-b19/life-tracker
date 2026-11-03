#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
location="${2:-westeurope}"
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

resource_group="life-tracker-$environment"
echo "Deployment is intentionally not automated until the environment-specific"
echo "subscription, owner, registry image and secret injection commands are"
echo "approved and wired. No resources were created."
echo "Validated resource group name: $resource_group"
echo "Validated location: $location"
echo "Validated image digest: $image_digest"
