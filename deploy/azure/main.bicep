// Azure Container Apps deployment for the Azure DevOps MCP server (HTTP transport).
//
// The platform ingress terminates TLS and provides the public FQDN; the
// container listens on 0.0.0.0:targetPort over plain HTTP inside the
// environment. DNS rebinding protection is pinned to the app's own FQDN, which
// is derived from the managed environment's default domain. No Azure DevOps
// credentials are stored here: the server uses token pass-through, so each
// request must carry the caller's bearer token.
//
// The image is pulled from Azure Container Registry using a user-assigned
// managed identity granted the AcrPull role — no registry username/password is
// stored anywhere.

@description('Base name for the Container App and supporting resources.')
param appName string = 'ado-mcp'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Fully qualified container image reference, e.g. myregistry.azurecr.io/ado-mcp:1.0.0')
param containerImage string

@description('Azure DevOps organization name the server is scoped to.')
param adoOrg string

@description('Name of the existing Azure Container Registry to pull the image from.')
param acrName string

@description('Resource group of the ACR. Defaults to this deployment\'s resource group; set it when reusing a registry that lives in another resource group.')
param acrResourceGroup string = resourceGroup().name

@description('Whether to create the AcrPull role assignment for the app identity. Requires the deployer to have permission to manage role assignments (e.g. Owner or User Access Administrator) on the registry. Set to false to assign the role out-of-band (e.g. when the ACR is in another resource group you do not control).')
param assignAcrPullRole bool = true

@description('HTTP auth mode: "passthrough" (clients send their own Azure DevOps bearer token) or "oauth" (server runs an OAuth authorization server bridging sign-in to Entra ID).')
@allowed([
  'passthrough'
  'oauth'
])
param authMode string = 'passthrough'

@description('Entra tenant ID (required when authMode is "oauth").')
param entraTenantId string = ''

@description('Entra confidential app (client) ID (required when authMode is "oauth").')
param entraClientId string = ''

@description('Entra confidential app client secret (required when authMode is "oauth").')
@secure()
param entraClientSecret string = ''

@description('Tool domains to enable (space-separated), or "all".')
param enabledDomains string = 'all'

@description('Optional space-separated browser Origin allow-list. Leave empty for non-browser clients only.')
param allowedOrigins string = ''

@description('Container port the server listens on.')
param targetPort int = 3000

@description('Minimum number of replicas. 0 enables scale-to-zero (lowest cost; adds cold-start latency to the first request after idle).')
param minReplicas int = 0

@description('Maximum number of replicas.')
param maxReplicas int = 3

@description('CPU cores per replica.')
param cpu string = '0.5'

@description('Memory per replica.')
param memory string = '1Gi'

// Built-in AcrPull role definition ID.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

// Registry login server. Derived from the name (public cloud convention
// "<name>.azurecr.io") rather than read from the registry resource, so the
// deploying identity needs no control-plane read on the registry — which may
// live in another resource group it cannot read.
var acrLoginServer = '${acrName}.azurecr.io'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${appName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${appName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// User-assigned identity the Container App uses to pull from ACR. Created (and
// granted AcrPull) before the app so the first revision can pull successfully.
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${appName}-id'
  location: location
}

// Grant the app identity AcrPull on the registry. Done via a module so it works
// even when the ACR lives in another resource group. Skipped when
// assignAcrPullRole is false (e.g. the grant is made out-of-band by a registry
// admin you do not have rights over).
module acrPullAssignment 'acr-pull-role.bicep' = if (assignAcrPullRole) {
  name: 'acrPullAssignment'
  scope: resourceGroup(acrResourceGroup)
  params: {
    acrName: acrName
    principalId: identity.properties.principalId
    roleId: acrPullRoleId
  }
}

// Public FQDN of the app: "<appName>.<environment default domain>". This is the
// Host header callers send, so it is exactly what DNS rebinding protection must
// allow.
var appFqdn = '${appName}.${environment.properties.defaultDomain}'

var isOAuth = authMode == 'oauth'

var baseEnv = [
  { name: 'AZURE_DEVOPS_ORG', value: adoOrg }
  { name: 'MCP_TRANSPORT', value: 'http' }
  { name: 'MCP_HOST', value: '0.0.0.0' }
  { name: 'MCP_PORT', value: string(targetPort) }
  { name: 'MCP_ALLOWED_HOSTS', value: appFqdn }
  { name: 'MCP_ALLOWED_ORIGINS', value: allowedOrigins }
  { name: 'MCP_DOMAINS', value: enabledDomains }
  { name: 'MCP_AUTH', value: authMode }
]

// OAuth mode keeps its authorization state (client registrations, codes) in
// memory, so it must run as a single, always-warm replica.
var oauthEnv = isOAuth
  ? [
      { name: 'ENTRA_TENANT_ID', value: entraTenantId }
      { name: 'ENTRA_CLIENT_ID', value: entraClientId }
      { name: 'ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret' }
      { name: 'MCP_PUBLIC_URL', value: 'https://${appFqdn}/' }
    ]
  : []

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  // Ensure the AcrPull role exists before the app attempts its first image pull.
  dependsOn: [
    acrPullAssignment
  ]
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: acrLoginServer
          identity: identity.id
        }
      ]
      secrets: isOAuth
        ? [
            {
              name: 'entra-client-secret'
              value: entraClientSecret
            }
          ]
        : []
    }
    template: {
      containers: [
        {
          name: appName
          image: containerImage
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          env: concat(baseEnv, oauthEnv)
        }
      ]
      scale: {
        minReplicas: isOAuth ? 1 : minReplicas
        maxReplicas: isOAuth ? 1 : maxReplicas
      }
    }
  }
}

@description('Public FQDN of the deployed MCP server.')
output fqdn string = containerApp.properties.configuration.ingress.fqdn

@description('MCP endpoint URL to configure in clients.')
output mcpUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}/mcp'
