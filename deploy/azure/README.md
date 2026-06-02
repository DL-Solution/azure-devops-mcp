# Deploying the Azure DevOps MCP server to Azure Container Apps

This directory contains everything needed to run the MCP server's **HTTP
transport** in production on [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/) (ACA).

## Architecture

```
                       HTTPS (443)
[MCP clients] ──TLS──► [ACA ingress] ──HTTP──► [container :3000 on 0.0.0.0]
  Authorization:        (managed TLS,            (token pass-through,
  Bearer <ADO token>     public FQDN)             DNS-rebinding protection)
```

- **TLS and the public hostname are provided by the ACA ingress** — there is no
  separate reverse proxy to manage.
- The container listens on `0.0.0.0:3000` so the ingress can reach it. External
  exposure is still controlled by the ingress, the bearer-token requirement, and
  Host-header (DNS rebinding) validation.
- **No Azure DevOps credentials are stored in the container.** The server uses
  token pass-through: every request must carry the caller's Azure DevOps bearer
  token, and each request acts as that user.
- `MCP_ALLOWED_HOSTS` is pinned to the app's own FQDN by the Bicep template, so
  only requests addressed to the real hostname are served.

One deployment serves **one** Azure DevOps organization (`adoOrg`). Deploy
multiple Container Apps for multiple organizations.

## Prerequisites

- Azure CLI (`az`) logged in to the target subscription.
- A resource group.
- A container registry the app can pull from (e.g. Azure Container Registry).

## 1. Build and push the image

Using Azure Container Registry (builds in the cloud, no local Docker needed):

```bash
az acr build \
  --registry <myregistry> \
  --image ado-mcp:1.0.0 \
  --file Dockerfile .
```

Or build locally and push:

```bash
docker build -t <myregistry>.azurecr.io/ado-mcp:1.0.0 .
docker push <myregistry>.azurecr.io/ado-mcp:1.0.0
```

## 2. Deploy

The image is pulled with a **user-assigned managed identity** that the template
grants the `AcrPull` role — no registry username/password is stored anywhere.

```bash
az deployment group create \
  --resource-group <my-rg> \
  --template-file deploy/azure/main.bicep \
  --parameters \
      appName=ado-mcp \
      adoOrg=<your-ado-org> \
      acrName=<myregistry> \
      containerImage=<myregistry>.azurecr.io/ado-mcp:1.0.0
```

> Creating the `AcrPull` role assignment requires the deployer to have
> permission to manage role assignments (e.g. **Owner** or **User Access
> Administrator** on the resource group). If you only have **Contributor**,
> pass `assignAcrPullRole=false` and create the assignment separately:
>
> ```bash
> APP_PID=$(az identity show -g <my-rg> -n ado-mcp-id --query principalId -o tsv)
> az role assignment create --assignee "$APP_PID" --role AcrPull \
>   --scope $(az acr show -n <myregistry> -g <my-rg> --query id -o tsv)
> ```
>
> (Run the deployment once with `assignAcrPullRole=false` to create the identity
> first, assign the role, then deploy again.)

### Reusing a registry in another resource group

If the ACR lives in a different resource group (one you may not fully control),
pass `acrResourceGroup` and assign `AcrPull` out-of-band:

```bash
# 1. Create the app identity up front so it can be granted AcrPull.
az identity create -n ado-mcp-id -g <my-rg> -l northeurope
APP_PID=$(az identity show -n ado-mcp-id -g <my-rg> --query principalId -o tsv)

# 2. A registry admin grants the identity pull access (one time):
az role assignment create --assignee-object-id "$APP_PID" \
  --assignee-principal-type ServicePrincipal --role AcrPull \
  --scope $(az acr show -n <registry> -g <registry-rg> --query id -o tsv)

# 3. Deploy, pointing at the cross-RG registry and skipping the role assignment.
az deployment group create \
  --resource-group <my-rg> \
  --template-file deploy/azure/main.bicep \
  --parameters \
      appName=ado-mcp \
      adoOrg=<your-ado-org> \
      acrName=<registry> \
      acrResourceGroup=<registry-rg> \
      assignAcrPullRole=false \
      containerImage=<registry>.azurecr.io/ado-mcp:1.0.0
```

The deployment outputs the public endpoint:

```bash
az deployment group show -g <my-rg> -n main \
  --query properties.outputs.mcpUrl.value -o tsv
# https://ado-mcp.<hash>.<region>.azurecontainerapps.io/mcp
```

> Using a **custom domain**? Add it to the allow-list by passing your own
> `MCP_ALLOWED_HOSTS` (the template defaults it to the ACA FQDN only).

## 3. Get an Azure DevOps bearer token

Clients authenticate with an Entra ID access token scoped to Azure DevOps:

```bash
az account get-access-token \
  --resource 499b84ac-1321-427f-aa17-267ca6975798 \
  --query accessToken -o tsv
```

> Note: the HTTP transport accepts **bearer tokens** (Entra ID). Personal Access
> Tokens are only supported by the local stdio transport.

## 4. Configure an MCP client

```json
{
  "servers": {
    "ado-prod": {
      "type": "http",
      "url": "https://ado-mcp.<hash>.<region>.azurecontainerapps.io/mcp",
      "headers": {
        "Authorization": "Bearer ${input:ado_token}"
      }
    }
  }
}
```

## CI/CD (GitHub Actions)

The workflow `.github/workflows/deploy-aca.yml` builds the image on the runner,
pushes it to the registry (`docker push`), and deploys the Bicep template. It
runs on pushes to `main` that touch the app or deployment files, and can also be
triggered manually (`workflow_dispatch`). It authenticates to Azure with **OIDC
federated credentials**, so no cloud passwords are stored in GitHub.

### Required GitHub configuration

Under **Settings → Secrets and variables → Actions**:

| Kind     | Name                    | Example / meaning                             |
| -------- | ----------------------- | --------------------------------------------- |
| Secret   | `AZURE_CLIENT_ID`       | App registration (client) ID for OIDC         |
| Secret   | `AZURE_TENANT_ID`       | Entra tenant ID                               |
| Secret   | `AZURE_SUBSCRIPTION_ID` | Target subscription ID                        |
| Variable | `AZURE_RESOURCE_GROUP`  | RG to deploy into, e.g. `dev_sanbox`          |
| Variable | `ACR_NAME`              | Container Registry name, e.g. `tdsregistry`   |
| Variable | `ACR_RESOURCE_GROUP`    | RG that holds the registry, e.g. `Kubernetes` |
| Variable | `CONTAINER_APP_NAME`    | `ado-mcp`                                     |
| Variable | `ADO_ORG`               | Your Azure DevOps organization name           |

### One-time OIDC setup

```bash
# 1. Create an app registration (or reuse a service principal).
APP_ID=$(az ad app create --display-name "ado-mcp-deploy" --query appId -o tsv)
az ad sp create --id "$APP_ID"

# 2. Federated credential matching this repo's "production" environment.
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-prod",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:DL-Solution/azure-devops-mcp:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'

# 3. Grant it rights.
SUB=$(az account show --query id -o tsv)
# Contributor on the deployment RG: create the env/app/identity and deploy.
az role assignment create --assignee "$APP_ID" --role Contributor \
  --scope "/subscriptions/$SUB/resourceGroups/<deploy-rg>"
# AcrPush on the registry: push the built image (data-plane push/pull only).
az role assignment create --assignee "$APP_ID" --role AcrPush \
  --scope $(az acr show -n <registry> -g <registry-rg> --query id -o tsv)
```

> The workflow deploys with `assignAcrPullRole=false`, so the CI identity does
> **not** need rights to manage role assignments. Grant the app identity
> (`ado-mcp-id`) `AcrPull` on the registry separately (see "Reusing a registry
> in another resource group" above). If instead you want the template to assign
> `AcrPull` itself, also give the CI identity **Role Based Access Control
> Administrator** on the registry and deploy with `assignAcrPullRole=true`.

Then set `AZURE_CLIENT_ID=$APP_ID`, `AZURE_TENANT_ID`, and
`AZURE_SUBSCRIPTION_ID` as repository secrets.

> The workflow targets a GitHub **Environment** named `production`. Add
> required reviewers to that environment (Settings → Environments) if you want
> a manual approval gate before each production deploy. The federated
> credential `subject` above must match the environment name.

## Configuration reference

The image is configured entirely through environment variables (see
`deploy/docker-entrypoint.sh`):

| Variable              | Default   | Description                                                 |
| --------------------- | --------- | ----------------------------------------------------------- |
| `AZURE_DEVOPS_ORG`    | —         | **Required.** Azure DevOps organization name.               |
| `MCP_TRANSPORT`       | `http`    | Transport (`stdio`/`http`).                                 |
| `MCP_HOST`            | `0.0.0.0` | Bind interface (keep `0.0.0.0` in a container).             |
| `MCP_PORT`            | `3000`    | Listen port (match the ingress target port).                |
| `MCP_ALLOWED_HOSTS`   | app FQDN  | Space-separated Host allow-list (DNS rebinding protection). |
| `MCP_ALLOWED_ORIGINS` | _(none)_  | Space-separated browser Origin allow-list.                  |
| `MCP_DOMAINS`         | `all`     | Space-separated tool domains to enable.                     |

## Security notes

- The image is pulled via a **user-assigned managed identity** with the
  `AcrPull` role — no registry password is stored. You can keep the ACR admin
  user **disabled** (`az acr update -n <myregistry> --admin-enabled false`).
- Keep ingress `allowInsecure: false` (HTTP is redirected to HTTPS).
- The server never logs tokens or request bodies.
- The template defaults to **scale-to-zero** (`minReplicas: 0`) for lowest cost:
  with no traffic there are no running replicas. The first request after an idle
  period pays a cold-start delay (a few seconds). Set `minReplicas: 1` for an
  always-warm instance (instant response, higher cost).
- Restrict who can reach the ingress with ACA IP restrictions or a private
  environment if you do not need public access.
