#!/usr/bin/env bash
set -euo pipefail

location="${1:-westeurope}"

if [[ ! "$location" =~ ^[a-z0-9-]+$ ]]; then
  echo "Invalid Azure location." >&2
  exit 1
fi

for command_name in az docker; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

az bicep version >/dev/null
az account show --output none

echo "Azure CLI and Bicep are ready."
echo "Docker is ready."
echo "Azure account is authenticated."
echo "Target location: $location"
echo "No Azure resources were created."
