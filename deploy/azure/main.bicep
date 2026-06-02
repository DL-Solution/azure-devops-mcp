// Azure Container Apps deployment for the Azure DevOps MCP server (HTTP transport).
//
// The platform ingress terminates TLS and provides the public FQDN; the
// container listens on 0.0.0.0:targetPort over plain HTTP inside the
// environment. DNS rebinding protection is pinned to the app's own FQDN, which
// is derived from the managed environment's default domain. No Azure DevOps
// credentials are stored here: the server uses token pass-through, so each
// request must carry the caller's bearer token.

@description('Base name for the Container App and supporting resources.')
param appName string = 'ado-mcp'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Fully qualified container image reference, e.g. myregistry.azurecr.io/ado-mcp:1.0.0')
param containerImage string

@description('Azure DevOps organization name the server is scoped to.')
param adoOrg string

@description('Tool domains to enable (space-separated), or "all".')
param enabledDomains string = 'all'

@description('Optional space-separated browser Origin allow-list. Leave empty for non-browser clients only.')
param allowedOrigins string = ''

@description('Container port the server listens on.')
param targetPort int = 3000

@description('Minimum number of replicas.')
param minReplicas int = 1

@description('Maximum number of replicas.')
param maxReplicas int = 3

@description('CPU cores per replica.')
param cpu string = '0.5'

@description('Memory per replica.')
param memory string = '1Gi'

@description('Container registry login server (e.g. myregistry.azurecr.io). Leave empty for a public image.')
param registryServer string = ''

@description('Container registry username. Leave empty when using a public image.')
param registryUsername string = ''

@description('Container registry password.')
@secure()
param registryPassword string = ''

var useRegistry = !empty(registryServer)

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

// Public FQDN of the app: "<appName>.<environment default domain>". This is the
// Host header callers send, so it is exactly what DNS rebinding protection must
// allow.
var appFqdn = '${appName}.${environment.properties.defaultDomain}'

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
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
      registries: useRegistry ? [
        {
          server: registryServer
          username: registryUsername
          passwordSecretRef: 'registry-password'
        }
      ] : []
      secrets: useRegistry ? [
        {
          name: 'registry-password'
          value: registryPassword
        }
      ] : []
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
          env: [
            {
              name: 'AZURE_DEVOPS_ORG'
              value: adoOrg
            }
            {
              name: 'MCP_TRANSPORT'
              value: 'http'
            }
            {
              name: 'MCP_HOST'
              value: '0.0.0.0'
            }
            {
              name: 'MCP_PORT'
              value: string(targetPort)
            }
            {
              name: 'MCP_ALLOWED_HOSTS'
              value: appFqdn
            }
            {
              name: 'MCP_ALLOWED_ORIGINS'
              value: allowedOrigins
            }
            {
              name: 'MCP_DOMAINS'
              value: enabledDomains
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

@description('Public FQDN of the deployed MCP server.')
output fqdn string = containerApp.properties.configuration.ingress.fqdn

@description('MCP endpoint URL to configure in clients.')
output mcpUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}/mcp'
