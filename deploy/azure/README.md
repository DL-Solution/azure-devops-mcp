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

```bash
az deployment group create \
  --resource-group <my-rg> \
  --template-file deploy/azure/main.bicep \
  --parameters \
      appName=ado-mcp \
      adoOrg=<your-ado-org> \
      containerImage=<myregistry>.azurecr.io/ado-mcp:1.0.0 \
      registryServer=<myregistry>.azurecr.io \
      registryUsername=<acr-username> \
      registryPassword=<acr-password>
```

For a public image, omit the three `registry*` parameters.

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

- Keep ingress `allowInsecure: false` (HTTP is redirected to HTTPS).
- The server never logs tokens or request bodies.
- Scale-to-zero (`minReplicas: 0`) is possible but adds cold-start latency to
  the first request; the template defaults to `1`.
- Restrict who can reach the ingress with ACA IP restrictions or a private
  environment if you do not need public access.
