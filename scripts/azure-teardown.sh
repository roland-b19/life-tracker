#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
confirmation="${2:-}"

if [[ ! "$environment" =~ ^[a-z0-9-]{1,24}$ ]]; then
  echo "Usage: $0 <environment> DELETE" >&2
  exit 1
fi

if [[ "$confirmation" != "DELETE" ]]; then
  echo "Refusing to delete resources. Pass the literal DELETE as the second argument." >&2
  exit 1
fi

resource_group="life-tracker-$environment"
az group delete --name "$resource_group" --yes --no-wait
echo "Deletion requested for resource group: $resource_group"
