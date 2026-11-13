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

@minLength(71)
@maxLength(71)
@description('Immutable container image digest already pushed to ACR (sha256:<64 lowercase hex characters>).')
param imageDigest string

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

@description('PostgreSQL compute SKU.')
param postgresSku string = 'Standard_B1ms'

@description('Optional explicit container registry name to allow regional and conflict-free naming.')
param registryName string = ''

@description('Optional explicit Key Vault name to allow regional and conflict-free naming.')
param keyVaultName string = ''

@description('Optional budget alert amount in USD for the resource group (0 to disable).')
param budgetAmount int = 25

@description('Contact email for budget alerts and monitoring alerts.')
param budgetContactEmail string = owner

@minLength(71)
@maxLength(71)
@description('Immutable digest of the reminder worker image already pushed to ACR (sha256:<64 lowercase hex characters>).')
param workerImageDigest string

@minLength(1)
@description('VAPID public key (not secret) the browsers subscribe with; the worker signs web push with the private half.')
param vapidPublicKey string

@minLength(1)
@description('VAPID contact for the push services, a mailto: or https: URL.')
param vapidSubject string

@secure()
@minLength(1)
@description('VAPID private key stored in Key Vault. Supply from a secret-aware deployment mechanism.')
param vapidPrivateKey string

var suffix = '${project}-${environment}'
var tags = {
  project: project
  env: environment
  owner: owner
}
var vnetName = '${suffix}-vnet'
var postgresName = replace('${suffix}-pg', '-', '')
var effectiveRegistryName = !empty(registryName) ? registryName : replace('${suffix}acr', '-', '')
var defaultKeyVaultName = take(replace('${suffix}kv${uniqueString(resourceGroup().id, location)}', '-', ''), 24)
var effectiveKeyVaultName = !empty(keyVaultName) ? keyVaultName : defaultKeyVaultName
var workspaceName = '${suffix}-logs'
var containerEnvName = '${suffix}-cae'
var containerAppName = '${suffix}-app'
var postgresDnsName = 'privatelink.postgres.database.azure.com'
var containerImage = '${effectiveRegistryName}.azurecr.io/life-tracker@${imageDigest}'
var workerImage = '${effectiveRegistryName}.azurecr.io/life-tracker-worker@${workerImageDigest}'
var storageAccountName = take('lt${toLower(replace(suffix, '-', ''))}st${uniqueString(resourceGroup().id, location)}', 24)
var queueDnsName = 'privatelink.queue.${az.environment().suffixes.storage}'
var reminderQueueName = 'reminders'

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

resource queueDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: queueDnsName
  location: 'global'
  tags: tags
}

resource queueDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: queueDns
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
    name: postgresSku
    tier: startsWith(postgresSku, 'Standard_B') ? 'Burstable' : 'GeneralPurpose'
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
  name: effectiveRegistryName
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
  name: effectiveKeyVaultName
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

resource workloadIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${suffix}-identity'
  location: location
  tags: tags
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
  name: '${effectiveRegistryName}-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, 'private-endpoints')
    }
    privateLinkServiceConnections: [
      {
        name: '${effectiveRegistryName}-connection'
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
  name: '${effectiveKeyVaultName}-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, 'private-endpoints')
    }
    privateLinkServiceConnections: [
      {
        name: '${effectiveKeyVaultName}-connection'
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

// Reminder pipeline: a private storage account whose queue carries "this task is due" messages from the enqueue job to the send job.
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    allowSharedKeyAccess: false
    allowBlobPublicAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'None'
    }
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource reminderQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: reminderQueueName
}

resource storagePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${storageAccountName}-pe'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: resourceId('Microsoft.Network/virtualNetworks/subnets', vnetName, 'private-endpoints')
    }
    privateLinkServiceConnections: [
      {
        name: '${storageAccountName}-connection'
        properties: {
          privateLinkServiceId: storage.id
          groupIds: [
            'queue'
          ]
        }
      }
    ]
  }
  dependsOn: [
    queueDnsLink
  ]
}

resource storagePrivateDnsGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: storagePrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'queue'
        properties: {
          privateDnsZoneId: queueDns.id
        }
      }
    ]
  }
}

// One identity for both jobs, kept apart from the web app's: it can use the queue and read its own secrets, nothing else.
resource workerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${suffix}-worker-identity'
  location: location
  tags: tags
}

resource vapidPrivateKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'vapid-private-key'
  properties: {
    value: vapidPrivateKey
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
    postgresDnsLink
    registryDnsLink
    vaultDnsLink
    queueDnsLink
  ]
}

resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${workloadIdentity.id}': {}
    }
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
          server: '${effectiveRegistryName}.azurecr.io'
          identity: workloadIdentity.id
        }
      ]
      secrets: [
        {
          name: 'database-url'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/database-url'
          identity: workloadIdentity.id
        }
        {
          name: 'nextauth-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/nextauth-secret'
          identity: workloadIdentity.id
        }
        {
          name: 'auth-azure-client-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/auth-azure-client-secret'
          identity: workloadIdentity.id
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
    registryPrivateEndpoint
    registryPrivateDnsGroup
    vaultPrivateEndpoint
    vaultPrivateDnsGroup
    keyVaultSecretsUserRole
    acrPullRole
    databaseUrlSecret
    nextAuthSecretSecret
    authAzureClientSecretSecret
  ]
}

resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, workloadIdentity.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    principalId: workloadIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'
    )
    principalType: 'ServicePrincipal'
  }
}

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, workloadIdentity.id, 'acrpull')
  scope: registry
  properties: {
    principalId: workloadIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
    principalType: 'ServicePrincipal'
  }
}

resource workerKeyVaultRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, workerIdentity.id, 'kv-secrets-user')
  scope: keyVault
  properties: {
    principalId: workerIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'
    )
    principalType: 'ServicePrincipal'
  }
}

resource workerAcrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, workerIdentity.id, 'acrpull')
  scope: registry
  properties: {
    principalId: workerIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
    principalType: 'ServicePrincipal'
  }
}

// Queue data roles are scoped to the one queue, not the account: Storage Queue Data Message Sender and Storage Queue Data Message Processor.
resource workerQueueSenderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(reminderQueue.id, workerIdentity.id, 'queue-sender')
  scope: reminderQueue
  properties: {
    principalId: workerIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a'
    )
    principalType: 'ServicePrincipal'
  }
}

resource workerQueueProcessorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(reminderQueue.id, workerIdentity.id, 'queue-processor')
  scope: reminderQueue
  properties: {
    principalId: workerIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '8a0f0c08-91a1-4084-bc3d-661d67233fed'
    )
    principalType: 'ServicePrincipal'
  }
}

var workerJobIdentity = {
  type: 'UserAssigned'
  userAssignedIdentities: {
    '${workerIdentity.id}': {}
  }
}
var workerJobRegistries = [
  {
    server: '${effectiveRegistryName}.azurecr.io'
    identity: workerIdentity.id
  }
]
var workerJobSecrets = [
  {
    name: 'database-url'
    keyVaultUrl: '${keyVault.properties.vaultUri}secrets/database-url'
    identity: workerIdentity.id
  }
  {
    name: 'vapid-private-key'
    keyVaultUrl: '${keyVault.properties.vaultUri}secrets/vapid-private-key'
    identity: workerIdentity.id
  }
]
var workerJobEnv = [
  {
    name: 'DATABASE_URL'
    secretRef: 'database-url'
  }
  {
    name: 'QUEUE_ACCOUNT'
    value: storage.name
  }
  {
    name: 'QUEUE_NAME'
    value: reminderQueueName
  }
  {
    name: 'AZURE_CLIENT_ID'
    value: workerIdentity.properties.clientId
  }
  {
    name: 'VAPID_SUBJECT'
    value: vapidSubject
  }
  {
    name: 'VAPID_PUBLIC_KEY'
    value: vapidPublicKey
  }
  {
    name: 'VAPID_PRIVATE_KEY'
    secretRef: 'vapid-private-key'
  }
]

// Every minute: queue one message per reminder that is due (task and user ids only).
resource enqueueJob 'Microsoft.App/jobs@2023-05-01' = {
  name: '${suffix}-enqueue'
  location: location
  tags: tags
  identity: workerJobIdentity
  properties: {
    environmentId: containerEnv.id
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 55
      replicaRetryLimit: 0
      scheduleTriggerConfig: {
        cronExpression: '* * * * *'
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: workerJobRegistries
      secrets: workerJobSecrets
    }
    template: {
      containers: [
        {
          name: 'enqueue'
          image: workerImage
          command: [
            'node'
          ]
          args: [
            'enqueue.mjs'
          ]
          env: workerJobEnv
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
  dependsOn: [
    workerKeyVaultRole
    workerAcrPullRole
    workerQueueSenderRole
    workerQueueProcessorRole
    registryPrivateDnsGroup
    vaultPrivateDnsGroup
    storagePrivateDnsGroup
    databaseUrlSecret
    vapidPrivateKeySecret
  ]
}

// Every minute: drain the queue and send each reminder as a web push.
// shortcut: a per-minute schedule instead of an event-driven job, because the GA jobs API has no managed-identity scale rule (a KEDA azure-queue rule would need a storage key, which this account forbids); switch when it does.
resource sendJob 'Microsoft.App/jobs@2023-05-01' = {
  name: '${suffix}-send'
  location: location
  tags: tags
  identity: workerJobIdentity
  properties: {
    environmentId: containerEnv.id
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 120
      replicaRetryLimit: 0
      scheduleTriggerConfig: {
        cronExpression: '* * * * *'
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: workerJobRegistries
      secrets: workerJobSecrets
    }
    template: {
      containers: [
        {
          name: 'send'
          image: workerImage
          command: [
            'node'
          ]
          args: [
            'send.mjs'
          ]
          env: workerJobEnv
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
  dependsOn: [
    workerKeyVaultRole
    workerAcrPullRole
    workerQueueSenderRole
    workerQueueProcessorRole
    registryPrivateDnsGroup
    vaultPrivateDnsGroup
    storagePrivateDnsGroup
    databaseUrlSecret
    vapidPrivateKeySecret
  ]
}

resource postgresDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${postgresName}-diag'
  scope: postgres
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource vaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${effectiveKeyVaultName}-diag'
  scope: keyVault
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource registryDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${effectiveRegistryName}-diag'
  scope: registry
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource queueDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${storageAccountName}-queue-diag'
  scope: queueService
  properties: {
    workspaceId: logAnalytics.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'Transaction'
        enabled: true
      }
    ]
  }
}

// Monitoring: one email action group, four alerts (web 5xx, web restarts, reminder backlog, failed worker run) and saved log queries.
resource alertGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (!empty(budgetContactEmail)) {
  name: '${suffix}-alerts'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'lt-alerts'
    enabled: true
    emailReceivers: [
      {
        name: 'owner'
        emailAddress: budgetContactEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

resource webServerErrorsAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(budgetContactEmail)) {
  name: '${suffix}-web-5xx'
  location: 'global'
  tags: tags
  properties: {
    description: 'The web app answered more than 5 requests with a 5xx status in 15 minutes.'
    severity: 2
    enabled: true
    scopes: [
      containerApp.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'server-errors'
          criterionType: 'StaticThresholdCriterion'
          metricNamespace: 'Microsoft.App/containerApps'
          metricName: 'Requests'
          dimensions: [
            {
              name: 'statusCodeCategory'
              operator: 'Include'
              values: [
                '5xx'
              ]
            }
          ]
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Total'
        }
      ]
    }
    actions: [
      {
        actionGroupId: alertGroup.id
      }
    ]
  }
}

resource webRestartsAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(budgetContactEmail)) {
  name: '${suffix}-web-restarts'
  location: 'global'
  tags: tags
  properties: {
    description: 'The web container restarted more than 3 times in 15 minutes.'
    severity: 2
    enabled: true
    scopes: [
      containerApp.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'restarts'
          criterionType: 'StaticThresholdCriterion'
          metricNamespace: 'Microsoft.App/containerApps'
          metricName: 'RestartCount'
          operator: 'GreaterThan'
          threshold: 3
          timeAggregation: 'Total'
        }
      ]
    }
    actions: [
      {
        actionGroupId: alertGroup.id
      }
    ]
  }
}

resource queueBacklogAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = if (!empty(budgetContactEmail)) {
  name: '${suffix}-queue-backlog'
  location: 'global'
  tags: tags
  properties: {
    description: 'More than 20 reminders have waited in the queue for 15 minutes: the send job is not keeping up or is failing.'
    severity: 2
    enabled: true
    scopes: [
      queueService.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'queue-depth'
          criterionType: 'StaticThresholdCriterion'
          metricNamespace: 'Microsoft.Storage/storageAccounts/queueServices'
          metricName: 'QueueMessageCount'
          operator: 'GreaterThan'
          threshold: 20
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [
      {
        actionGroupId: alertGroup.id
      }
    ]
  }
}

// The worker logs "<job> failed: <message>" and exits non-zero (worker/clients.mjs), so a failed run is searchable by that line.
resource workerFailureAlert 'Microsoft.Insights/scheduledQueryRules@2022-06-15' = if (!empty(budgetContactEmail)) {
  name: '${suffix}-worker-failed'
  location: location
  tags: tags
  properties: {
    displayName: '${suffix} reminder worker failed'
    description: 'A reminder job (enqueue or send) logged a failure in the last 10 minutes.'
    severity: 2
    enabled: true
    scopes: [
      logAnalytics.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT10M'
    criteria: {
      allOf: [
        {
          query: 'ContainerAppConsoleLogs_CL | where Log_s matches regex "(enqueue|send) failed:"'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        alertGroup.id
      ]
    }
  }
}

resource webErrorsQuery 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = {
  parent: logAnalytics
  name: 'life-tracker-web-errors'
  properties: {
    category: 'Life Tracker'
    displayName: 'Web app errors'
    query: 'ContainerAppConsoleLogs_CL | where ContainerAppName_s == "${containerAppName}" | where Log_s has_any ("error", "Error", "ERR") | order by TimeGenerated desc'
    version: 2
  }
}

resource workerRunsQuery 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = {
  parent: logAnalytics
  name: 'life-tracker-reminder-runs'
  properties: {
    category: 'Life Tracker'
    displayName: 'Reminder jobs: runs and failures'
    query: 'ContainerAppConsoleLogs_CL | where Log_s startswith "enqueued" or Log_s startswith "reminders sent" or Log_s has "failed:" | project TimeGenerated, Log_s | order by TimeGenerated desc'
    version: 2
  }
}

resource queueActivityQuery 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = {
  parent: logAnalytics
  name: 'life-tracker-queue-activity'
  properties: {
    category: 'Life Tracker'
    displayName: 'Queue operations by outcome'
    query: 'StorageQueueLogs | summarize count() by OperationName, StatusText, bin(TimeGenerated, 5m) | order by TimeGenerated desc'
    version: 2
  }
}

resource vaultAccessQuery 'Microsoft.OperationalInsights/workspaces/savedSearches@2020-08-01' = {
  parent: logAnalytics
  name: 'life-tracker-vault-access'
  properties: {
    category: 'Life Tracker'
    displayName: 'Key Vault access by caller and result'
    query: 'AzureDiagnostics | where ResourceProvider == "MICROSOFT.KEYVAULT" | summarize count() by OperationName, ResultSignature, CallerIPAddress, bin(TimeGenerated, 1h) | order by TimeGenerated desc'
    version: 2
  }
}

resource budget 'Microsoft.Consumption/budgets@2023-05-01' = if (budgetAmount > 0 && !empty(budgetContactEmail)) {
  name: '${suffix}-budget'
  properties: {
    timeGrain: 'Monthly'
    amount: budgetAmount
    timePeriod: {
      startDate: '2026-11-01T00:00:00Z'
    }
    category: 'Cost'
    notifications: {
      Actual_GreaterThan_80_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        contactEmails: [
          budgetContactEmail
        ]
      }
    }
  }
}

output resourceGroupName string = resourceGroup().name
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output postgresServerName string = postgres.name
output acrLoginServer string = registry.properties.loginServer
output queueAccountName string = storage.name
output reminderQueueName string = reminderQueue.name
output workerJobNames array = [
  enqueueJob.name
  sendJob.name
]
