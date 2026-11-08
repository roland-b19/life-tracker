# Entra External ID sign-in (runbook)

Users sign in through a Microsoft Entra External ID (CIAM) tenant, with email + password or Google.
Microsoft handles passwords, password reset and email verification. Apple sign-in is deferred.
The app code is unchanged apart from one optional setting, `AUTH_AZURE_WELLKNOWN`.

Cost: the Basic tier gives the first 50,000 monthly active users for free
([pricing](https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing)).
SMS/phone OTP and machine-to-machine add-ons are paid, and we do not use them. The tenant must be linked to a subscription.

`scripts/entra-external-id.sh` is a dry run unless `CONFIRM_ENTRA=YES` is set. Agents run neither mode without the user's OK.

## 1. Tenant (once)

You can create it in the [Entra admin center](https://entra.microsoft.com) (External Identities → External tenants), or with the script.
The script path uses the preview ARM API `ciamDirectories@2023-05-17-preview`. Run it while you are signed in to the subscription:

```bash
export ENTRA_CREATE_TENANT=YES ENTRA_TENANT_SUBDOMAIN=lifetrackerid ENTRA_TENANT_DISPLAY_NAME="Life Tracker"
./scripts/entra-external-id.sh                    # dry run
CONFIRM_ENTRA=YES ./scripts/entra-external-id.sh  # creates resource group lt-identity and the tenant
```

The tenant lives in `lt-identity`, not `life-tracker-<env>`, so `azure-teardown.sh` does not delete it.
Deleting it is a separate, deliberate step (admin center → Manage tenants).

Note the tenant ID (a GUID) and the subdomain (`<subdomain>.onmicrosoft.com`).

## 2. Google OAuth client (manual, Google Cloud Console)

Source: [Add Google as an identity provider](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers).

1. Create or select a project, then go to **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - Authorized domains: `ciamlogin.com` and `microsoftonline.com`.
   - Publish the app when you are ready for users outside the test-user list.
2. Go to **Credentials → Create credentials → OAuth client ID**. Choose **Web application** and add these authorized redirect URIs, replacing `<tenant-ID>` and `<subdomain>`:
   ```
   https://login.microsoftonline.com
   https://login.microsoftonline.com/te/<tenant-ID>/oauth2/authresp
   https://login.microsoftonline.com/te/<subdomain>.onmicrosoft.com/oauth2/authresp
   https://<tenant-ID>.ciamlogin.com/<tenant-ID>/federation/oidc/accounts.google.com
   https://<tenant-ID>.ciamlogin.com/<subdomain>.onmicrosoft.com/federation/oidc/accounts.google.com
   https://<subdomain>.ciamlogin.com/<tenant-ID>/federation/oauth2
   https://<subdomain>.ciamlogin.com/<subdomain>.onmicrosoft.com/federation/oauth2
   ```
3. Keep the client ID and secret in your password manager. Never put them in chat, the repo or shell history files.

## 3. Configure the tenant

Sign in to the external tenant. It has no subscription, which is expected:

```bash
az login --tenant <tenant-ID> --allow-no-subscriptions
export ENTRA_TENANT_ID=<tenant-ID> ENTRA_TENANT_SUBDOMAIN=<subdomain>
export NEXTAUTH_URL=https://<app-host>        # or http://localhost:3000
read -rs GOOGLE_CLIENT_ID && export GOOGLE_CLIENT_ID          # typed, not echoed, not in history
read -rs GOOGLE_CLIENT_SECRET && export GOOGLE_CLIENT_SECRET
./scripts/entra-external-id.sh                    # dry run: reads only, prints every change
CONFIRM_ENTRA=YES ./scripts/entra-external-id.sh  # applies
```

The script is idempotent and safe to rerun, for example after a deploy gives the app a new URL. Each run does the following, skipping whatever already exists:

1. Registers the single-tenant app `life-tracker`, or updates it. Its redirect URIs become `${NEXTAUTH_URL}/api/auth/callback/azure-ad` plus the localhost one. It creates the service principal, adds the delegated `openid profile email` permissions and grants admin consent. Customers cannot consent for themselves in an external tenant.
2. Adds Google as the identity provider `Google-OAUTH`. The secret goes to `az` through a pipe; it is never printed, never put in argv and never written to disk. Rotating the secret later is a manual step (admin center → External Identities → All identity providers → Google).
3. Creates the sign-up/sign-in user flow `life-tracker-sign-up-sign-in` with email + password and Google, or adds Google to the flow if it is missing.
4. Links the app to that user flow. An app can be linked to only one flow.

The required Entra roles are:
- External ID User Flow Administrator;
- External Identity Provider Administrator;
- Application Administrator.

The tenant creator holds Global Administrator, which covers all three.

### If Graph returns 403

The Azure CLI's Graph token may lack `IdentityProvider.ReadWrite.All` or `EventListener.ReadWrite.All`. The dry run already fails at the read-only preflight in that case. Do the same steps with either of these:
- **Microsoft Graph PowerShell:** `Connect-MgGraph -TenantId <tenant-ID> -Scopes IdentityProvider.ReadWrite.All,EventListener.ReadWrite.All,Application.ReadWrite.All`, then the same Graph calls with `Invoke-MgGraphRequest` (bodies as in the script).
- **The admin center:** External Identities → All identity providers → Google; then User flows → New user flow; then the flow → Applications → Add application.

## 4. Client secret

Write the secret straight into the git-ignored `.env.azure`, without printing it:

```bash
printf 'AUTH_AZURE_CLIENT_SECRET=%s\n' "$(az ad app credential reset --id <app-id> --display-name life-tracker --years 1 --query password -o tsv)" >> .env.azure
```

`credential reset` replaces existing secrets unless you add `--append`.

## 5. App settings

The script prints these at the end:

| Variable | Value |
|---|---|
| `AUTH_AZURE_TENANT_ID` | tenant ID |
| `AUTH_AZURE_CLIENT_ID` | app ID |
| `AUTH_AZURE_CLIENT_SECRET` | from step 4 |
| `AUTH_ISSUER` | the `issuer` of the metadata document, `https://<tenant-ID>.ciamlogin.com/<tenant-ID>/v2.0`. Check it with `curl -s "$AUTH_AZURE_WELLKNOWN" \| jq -r .issuer` |
| `AUTH_AZURE_WELLKNOWN` | `https://<subdomain>.ciamlogin.com/<tenant-ID>/v2.0/.well-known/openid-configuration` |

`AUTH_ISSUER` is the namespace for user records, which are keyed by `(issuer, subject)`. Changing it later orphans every existing user.
Token `iss` validation is done by openid-client against the discovered metadata, not against `AUTH_ISSUER`.

Users who sign in with Google still get tokens issued by the External ID tenant. Their `sub` is per-app, so the users table needs no change.

For Azure, `scripts/azure-deploy.sh` passes `AUTH_AZURE_WELLKNOWN` to the container. When the variable is set, the script skips its own redirect-URI update, because that app lives in the External ID tenant. Rerun step 3 with the deployed `NEXTAUTH_URL` instead.

## 6. Sign-in page

`app/signin/page.tsx` only drives the development credentials provider. In production it needs one **Continue** button that calls `signIn("azure-ad", { callbackUrl: "/" })`. Microsoft's hosted page then offers email + password and Google, so the app does not need separate per-provider buttons.
