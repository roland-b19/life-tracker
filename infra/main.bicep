targetScope = 'resourceGroup'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short environment name used in resource names and tags.')
@minLength(1)
@maxLength(12)
param environment string

@description('Project tag and resource name prefix.')
param project string = 'life-tracker'

@description('Resource owner tag.')
param owner string

@description('Immutable container image tag already pushed to ACR.')
param imageTag string

@description('PostgreSQL administrator login used only during bootstrap.')
param dbAdminLogin string

@secure()
@description('PostgreSQL administrator password. Supply from a secret-aware deployment mechanism.')
param dbAdminPassword string

@secure()
@minLength(1)
@description('Runtime PostgreSQL URL stored in Key Vault. Supply from a secret-aware deployment mechanism.')
param databaseUrl string

@secure()
@minLength(1)
@description('Auth.js signing secret stored in Key Vault. Supply from a secret-aware deployment mechanism.')
param nextAuthSecret string

@secure()
@minLength(1)
@description('Entra client secret stored in Key Vault. Supply from a secret-aware deployment mechanism.')
param authAzureClientSecret string

@minLength(1)
@description('Public URL used by Auth.js for OIDC callbacks.')
param nextAuthUrl string

@minLength(1)
@description('Entra External ID tenant identifier.')
param authAzureTenantId string

@minLength(1)
@description('Entra External ID application client identifier.')
param authAzureClientId string

@minLength(1)
@description('Entra External ID issuer URL.')
param authIssuer string

var suffix = '${project}-${environment}'
var tags = {
  project: project
  env: environment
  owner: owner
}
var vnetName = '${suffix}-vnet'
var postgresName = replace('${suffix}-pg', '-', '')
var registryName = replace('${suffix}acr', '-', '')
var keyVaultName = replace('${suffix}-kv', '-', '')
var workspaceName = '${suffix}-logs'
var containerEnvName = '${suffix}-cae'
var containerAppName = '${suffix}-app'
var postgresDnsName = 'privatelink.postgres.database.azure.com'
var containerImage = '${registryName}.azurecr.io/life-tracker:${imageTag}'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.20.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'container-apps'
        properties: {
          addressPrefix: '10.20.0.0/23'
          delegations: [
            {
              name: 'container-apps-delegation'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.20.2.0/28'
          delegations: [
            {
              name: 'postgres-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
      {
        name: 'private-endpoints'
        properties: {
          addressPrefix: '10.20.2.16/28'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

resource postgresDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: postgresDnsName
  location: 'global'
  tags: tags
}

resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: postgresDns
  name: '${vnetName}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource registryDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.azurecr.io'
  location: 'global'
  tags: tags
}

resource registryDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: registryDns
  name: '${vnetName}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource vaultDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.vaultcore.azure.net'
  location: 'global'
  tags: tags
}

resource vaultDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: vaultDns
  name: '${vnetName}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: dbAdminLogin
    administratorLoginPassword: dbAdminPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, 'postgres')
      privateDnsZoneArmResourceId: postgresDns.id
      publicNetworkAccess: 'Disabled'
    }
    authConfig: {
      passwordAuth: 'Enabled'
      activeDirectoryAuth: 'Enabled'
      tenantId: subscription().tenantId
    }
    version: '16'
  }
  dependsOn: [
    postgresDnsLink
  ]
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Premium'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Disabled'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: true
    publicNetworkAccess: 'Disabled'
    sku: {
      family: 'A'
      name: 'standard'
    }
  }
}

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'database-url'
  properties: {
    value: databaseUrl
  }
}

resource nextAuthSecretSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'nextauth-secret'
  properties: {
    value: nextAuthSecret
  }
}

resource authAzureClientSecretSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'auth-azure-client-secret'
  properties: {
    value: authAzureClientSecret
  }
}

resource registryPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${registryName}-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, 'private-endpoints')
    }
    privateLinkServiceConnections: [
      {
        name: '${registryName}-connection'
        properties: {
          privateLinkServiceId: registry.id
          groupIds: [
            'registry'
          ]
        }
      }
    ]
  }
  dependsOn: [
    registryDnsLink
  ]
}

resource registryPrivateDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: registryPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'registry'
        properties: {
          privateDnsZoneId: registryDns.id
        }
      }
    ]
  }
}

resource vaultPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${keyVaultName}-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, 'private-endpoints')
    }
    privateLinkServiceConnections: [
      {
        name: '${keyVaultName}-connection'
        properties: {
          privateLinkServiceId: keyVault.id
          groupIds: [
            'vault'
          ]
        }
      }
    ]
  }
  dependsOn: [
    vaultDnsLink
  ]
}

resource vaultPrivateDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: vaultPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'vault'
        properties: {
          privateDnsZoneId: vaultDns.id
        }
      }
    ]
  }
}

resource containerEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerEnvName
  location: location
  tags: tags
  properties: {
    vnetConfiguration: {
      infrastructureSubnetId: resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, 'container-apps')
      internal: false
    }
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
  dependsOn: [
    vnet
  ]
}

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
      }
      registries: [
        {
          server: '${registryName}.azurecr.io'
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'database-url'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/database-url'
          identity: 'system'
        }
        {
          name: 'nextauth-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/nextauth-secret'
          identity: 'system'
        }
        {
          name: 'auth-azure-client-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/auth-azure-client-secret'
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: containerImage
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'NEXTAUTH_SECRET'
              secretRef: 'nextauth-secret'
            }
            {
              name: 'NEXTAUTH_URL'
              value: nextAuthUrl
            }
            {
              name: 'AUTH_DEV'
              value: 'false'
            }
            {
              name: 'AUTH_AZURE_TENANT_ID'
              value: authAzureTenantId
            }
            {
              name: 'AUTH_AZURE_CLIENT_ID'
              value: authAzureClientId
            }
            {
              name: 'AUTH_AZURE_CLIENT_SECRET'
              secretRef: 'auth-azure-client-secret'
            }
            {
              name: 'AUTH_ISSUER'
              value: authIssuer
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              periodSeconds: 30
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    registry
  ]
}

resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, containerApp.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    principalId: containerApp.identity.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86e6e6'
    )
    principalType: 'ServicePrincipal'
  }
}

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, containerApp.id, 'acrpull')
  scope: registry
  properties: {
    principalId: containerApp.identity.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
    principalType: 'ServicePrincipal'
  }
}

output resourceGroupName string = resourceGroup().name
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output postgresServerName string = postgres.name
