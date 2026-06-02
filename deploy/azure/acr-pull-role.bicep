// Grants the AcrPull role on an existing Azure Container Registry to a
// principal. Deployed as a module so the role assignment can target a registry
// in a different resource group than the main deployment.

@description('Name of the existing Azure Container Registry in this module\'s resource group.')
param acrName string

@description('Object (principal) ID to grant AcrPull.')
param principalId string

@description('AcrPull role definition GUID.')
param roleId string

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' existing = {
  name: acrName
}

resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, principalId, roleId)
  scope: acr
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleId)
    principalType: 'ServicePrincipal'
  }
}
