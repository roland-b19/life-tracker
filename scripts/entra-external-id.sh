#!/usr/bin/env bash
# Configure Microsoft Entra External ID (CIAM) sign-in for Life Tracker: email + password and Google.
# Dry run by default (reads only, prints every write). CONFIRM_ENTRA=YES makes the changes.
# Runbook: docs/entra-external-id.md
set -euo pipefail

GRAPH="https://graph.microsoft.com/v1.0"
GRAPH_APP_ID="00000003-0000-0000-c000-000000000000" # Microsoft Graph, same in every tenant
APP_DISPLAY_NAME="${APP_DISPLAY_NAME:-life-tracker}"
USER_FLOW_NAME="${USER_FLOW_NAME:-life-tracker-sign-up-sign-in}"

for command_name in az jq curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

require() {
  for required_var in "$@"; do
    if [[ -z "${!required_var:-}" ]]; then
      echo "Missing required environment variable: $required_var" >&2
      exit 1
    fi
  done
}

confirmed() { [[ "${CONFIRM_ENTRA:-}" == "YES" ]]; }

run() {
  if confirmed; then
    "$@"
  else
    printf 'DRY RUN, would run:'
    printf ' %q' "$@"
    echo
  fi
}

# --- Optional: create the External ID tenant (run while signed in to the subscription's own tenant) ---
if [[ "${ENTRA_CREATE_TENANT:-}" == "YES" ]]; then
  # https://learn.microsoft.com/en-us/azure/templates/microsoft.azureactivedirectory/ciamdirectories
  # Only API version is 2023-05-17-preview. The resource name becomes <name>.onmicrosoft.com.
  require ENTRA_TENANT_SUBDOMAIN ENTRA_TENANT_DISPLAY_NAME
  if [[ ! "$ENTRA_TENANT_SUBDOMAIN" =~ ^[a-zA-Z0-9]{1,26}$ ]]; then
    echo "ENTRA_TENANT_SUBDOMAIN must be 1-26 letters or digits." >&2
    exit 1
  fi
  # Not life-tracker-<env>, so scripts/azure-teardown.sh never deletes the tenant with an iteration.
  identity_rg="${ENTRA_RESOURCE_GROUP:-lt-identity}"
  subscription_id="$(az account show --query id -o tsv)"
  # https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing
  echo "Cost: External ID Basic tier, first 50,000 monthly active users free. SMS/phone OTP and M2M add-ons are paid and not used."
  echo "Creating tenant ${ENTRA_TENANT_SUBDOMAIN}.onmicrosoft.com in resource group $identity_rg (subscription $subscription_id)."
  run az group create --name "$identity_rg" --location "${ENTRA_RG_LOCATION:-westeurope}" \
    --tags project=life-tracker env=identity --output none
  run az rest --method put \
    --url "https://management.azure.com/subscriptions/${subscription_id}/resourceGroups/${identity_rg}/providers/Microsoft.AzureActiveDirectory/ciamDirectories/${ENTRA_TENANT_SUBDOMAIN}?api-version=2023-05-17-preview" \
    --body "$(jq -nc --arg name "$ENTRA_TENANT_DISPLAY_NAME" --arg country "${ENTRA_COUNTRY_CODE:-RO}" --arg location "${ENTRA_DATA_LOCATION:-Europe}" \
      '{location: $location, sku: {name: "Standard", tier: "A0"}, tags: {project: "life-tracker", env: "identity"},
        properties: {createTenantProperties: {displayName: $name, countryCode: $country}}}')"
  echo "Tenant creation is asynchronous. When it finishes: az login --tenant ${ENTRA_TENANT_SUBDOMAIN}.onmicrosoft.com --allow-no-subscriptions"
  echo "Then rerun this script without ENTRA_CREATE_TENANT, with ENTRA_TENANT_ID set to the new tenant ID."
  exit 0
fi

# --- Configure sign-in inside the External ID tenant ---
require ENTRA_TENANT_ID ENTRA_TENANT_SUBDOMAIN NEXTAUTH_URL
NEXTAUTH_URL="${NEXTAUTH_URL%/}"
if [[ ! "$NEXTAUTH_URL" =~ ^(https://[^/]+|http://localhost:[0-9]+)$ ]]; then
  echo "NEXTAUTH_URL must be an https origin (or http://localhost:<port>), without a path." >&2
  exit 1
fi

signed_in_tenant="$(az account show --query tenantId -o tsv)"
if [[ "$signed_in_tenant" != "$ENTRA_TENANT_ID" ]]; then
  echo "az is signed in to tenant $signed_in_tenant, not ENTRA_TENANT_ID. Run: az login --tenant $ENTRA_TENANT_ID --allow-no-subscriptions" >&2
  exit 1
fi

# The metadata URL shape is documented in
# https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-custom-url-domain
wellknown="https://${ENTRA_TENANT_SUBDOMAIN}.ciamlogin.com/${ENTRA_TENANT_ID}/v2.0/.well-known/openid-configuration"
issuer="$(curl -fsS "$wellknown" | jq -r .issuer)"
echo "OIDC metadata: $wellknown"
echo "Issuer: $issuer"

# Read-only preflight. A 403 here means the Azure CLI token lacks IdentityProvider.Read(Write).All or
# EventListener.Read(Write).All; the runbook gives the Graph PowerShell / admin center fallback.
idp_ids="$(az rest --method get --url "$GRAPH/identity/identityProviders" | jq -r '.value[].id')"
flows_json="$(az rest --method get --url "$GRAPH/identity/authenticationEventsFlows")"

# 1. App registration, single tenant.
# https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-register-ciam-app
redirects=("http://localhost:3000/api/auth/callback/azure-ad")
if [[ "$NEXTAUTH_URL" != "http://localhost:3000" ]]; then
  redirects+=("${NEXTAUTH_URL}/api/auth/callback/azure-ad")
fi

app_id="$(az ad app list --filter "displayName eq '${APP_DISPLAY_NAME}'" --query "[0].appId" -o tsv)"
if [[ -z "$app_id" ]]; then
  if confirmed; then
    app_id="$(az ad app create --display-name "$APP_DISPLAY_NAME" --sign-in-audience AzureADMyOrg \
      --web-redirect-uris "${redirects[@]}" --query appId -o tsv)"
  else
    echo "DRY RUN, would create app registration '$APP_DISPLAY_NAME' with redirect URIs: ${redirects[*]}"
  fi
else
  echo "App registration '$APP_DISPLAY_NAME' exists: $app_id"
  run az ad app update --id "$app_id" --web-redirect-uris "${redirects[@]}" --output none
fi

if [[ -n "$app_id" ]]; then
  sp_id="$(az ad sp list --filter "appId eq '${app_id}'" --query "[0].id" -o tsv)"
  if [[ -z "$sp_id" ]]; then
    if confirmed; then
      sp_id="$(az ad sp create --id "$app_id" --query id -o tsv)"
    else
      echo "DRY RUN, would create the service principal for $app_id"
    fi
  fi

  # Delegated openid, profile, email. IDs are read from the tenant's Microsoft Graph service principal.
  graph_sp_json="$(az ad sp show --id "$GRAPH_APP_ID" --query "{id: id, scopes: oauth2PermissionScopes[?value=='openid' || value=='profile' || value=='email'].id}" -o json)"
  graph_sp_id="$(jq -r .id <<<"$graph_sp_json")"
  run az ad app update --id "$app_id" --required-resource-accesses \
    "$(jq -c --arg api "$GRAPH_APP_ID" '[{resourceAppId: $api, resourceAccess: [.scopes[] | {id: ., type: "Scope"}]}]' <<<"$graph_sp_json")" \
    --output none

  # Customers cannot consent for themselves in an external tenant, so an admin grants it once.
  if [[ -n "$sp_id" ]] && [[ "$(az ad app permission list-grants --id "$app_id" --query "length([?resourceId=='${graph_sp_id}'])" -o tsv)" != "0" ]]; then
    echo "Admin consent for Microsoft Graph already granted."
  else
    run az ad app permission grant --id "$app_id" --api "$GRAPH_APP_ID" --scope "openid profile email" --output none
  fi
else
  echo "DRY RUN, would then create its service principal, add openid/profile/email and grant admin consent."
fi

# 2. Google as a social identity provider (id Google-OAUTH).
# https://learn.microsoft.com/en-us/graph/api/identitycontainer-post-identityproviders?view=graph-rest-1.0
# https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers
if grep -qx "Google-OAUTH" <<<"$idp_ids"; then
  echo "Google identity provider exists. Rotating its secret is not handled here."
else
  require GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
  if confirmed; then
    # The secret reaches az through a pipe (process substitution): never argv, stdout or a file on disk.
    az rest --method post --url "$GRAPH/identity/identityProviders" --output none --body @<(jq -n \
      '{"@odata.type": "microsoft.graph.socialIdentityProvider", displayName: "Google", identityProviderType: "Google",
        clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET}')
  else
    echo "DRY RUN, would create the Google identity provider Google-OAUTH (secret not shown)."
  fi
fi

# 3. Sign-up/sign-in user flow with EmailPassword and Google.
# https://learn.microsoft.com/en-us/graph/api/identitycontainer-post-authenticationeventsflows?view=graph-rest-1.0
flow_id="$(jq -r --arg name "$USER_FLOW_NAME" 'first(.value[] | select(.displayName == $name) | .id) // empty' <<<"$flows_json")"
if [[ -z "$flow_id" ]]; then
  flow_body="$(jq -nc --arg name "$USER_FLOW_NAME" '{
    "@odata.type": "#microsoft.graph.externalUsersSelfServiceSignUpEventsFlow",
    displayName: $name,
    onInteractiveAuthFlowStart: {
      "@odata.type": "#microsoft.graph.onInteractiveAuthFlowStartExternalUsersSelfServiceSignUp",
      isSignUpAllowed: true},
    onAuthenticationMethodLoadStart: {
      "@odata.type": "#microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp",
      identityProviders: [{id: "EmailPassword-OAUTH"}, {id: "Google-OAUTH"}]}}')"
  if confirmed; then
    flow_id="$(az rest --method post --url "$GRAPH/identity/authenticationEventsFlows" --body "$flow_body" | jq -r .id)"
  else
    echo "DRY RUN, would create user flow '$USER_FLOW_NAME' with EmailPassword-OAUTH and Google-OAUTH."
  fi
else
  echo "User flow '$USER_FLOW_NAME' exists: $flow_id"
  # https://learn.microsoft.com/en-us/graph/api/onauthenticationmethodloadstartexternalusersselfservicesignup-post-identityproviders?view=graph-rest-1.0
  flow_idps_url="$GRAPH/identity/authenticationEventsFlows/${flow_id}/microsoft.graph.externalUsersSelfServiceSignUpEventsFlow/onAuthenticationMethodLoadStart/microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp/identityProviders"
  if ! az rest --method get --url "$flow_idps_url" | jq -e '.value[] | select(.id == "Google-OAUTH")' >/dev/null; then
    run az rest --method post --url "${flow_idps_url}/\$ref" --output none \
      --body '{"@odata.id": "https://graph.microsoft.com/v1.0/identityProviders/Google-OAUTH"}'
  fi
fi

# 4. Link the app to the flow. An app can be linked to one user flow only.
# https://learn.microsoft.com/en-us/graph/api/authenticationconditionsapplications-post-includeapplications?view=graph-rest-1.0
if [[ -n "$flow_id" && -n "$app_id" ]]; then
  flow_apps_url="$GRAPH/identity/authenticationEventsFlows/${flow_id}/conditions/applications/includeApplications"
  if az rest --method get --url "$flow_apps_url" | jq -e --arg app "$app_id" '.value[] | select(.appId == $app)' >/dev/null; then
    echo "App already linked to the user flow."
  else
    run az rest --method post --url "$flow_apps_url" --output none \
      --body "$(jq -nc --arg app "$app_id" '{"@odata.type": "#microsoft.graph.authenticationConditionApplication", appId: $app}')"
  fi
else
  echo "DRY RUN, would link the app to the user flow."
fi

echo
echo "App settings (create AUTH_AZURE_CLIENT_SECRET as the runbook shows; never paste it into chat):"
echo "AUTH_AZURE_TENANT_ID=$ENTRA_TENANT_ID"
echo "AUTH_AZURE_CLIENT_ID=${app_id:-<created on the confirmed run>}"
echo "AUTH_ISSUER=$issuer"
echo "AUTH_AZURE_WELLKNOWN=$wellknown"
if ! confirmed; then
  echo "Dry run only. Rerun with CONFIRM_ENTRA=YES to apply."
fi
