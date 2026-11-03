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
if ! az group show --name "$resource_group" --output none 2>/dev/null; then
  echo "Resource group is already absent: $resource_group"
  exit 0
fi

az group delete --name "$resource_group" --yes --no-wait
az group wait --name "$resource_group" --deleted --timeout 1800

if az group show --name "$resource_group" --output none 2>/dev/null; then
  echo "Resource group still exists after teardown: $resource_group" >&2
  exit 1
fi

echo "Resource group deleted and verified absent: $resource_group"
