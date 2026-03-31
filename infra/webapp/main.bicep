// AgentRC Web App Infrastructure — Azure Container Apps (Consumption plan)
// Resources: Log Analytics → App Insights (optional) → Container Apps Environment → Storage (optional) → Container App

@description('Name prefix for all resources')
param namePrefix string = 'agentrc'

@description('Azure region')
param location string = resourceGroup().location

@description('Container image to deploy (tag only — registry is derived from the ACR resource)')
param containerImageTag string = 'latest'

@description('Enable Application Insights')
param enableAppInsights bool = true

@description('Enable report sharing (requires Azure Files)')
param enableSharing bool = true

@description('GitHub token for scanning private repos')
@secure()
param ghTokenForScan string = ''

@description('Container startup strategy')
@allowed(['scale-to-zero', 'keep-warm'])
param containerStartupStrategy string = 'keep-warm'

@description('Custom domain (optional, leave empty to skip)')
param customDomain string = ''

@description('Tags for all resources')
param tags object = {}

// ===== Log Analytics Workspace =====
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ===== Application Insights (optional) =====
resource appInsights 'Microsoft.Insights/components@2020-02-02' = if (enableAppInsights) {
  name: '${namePrefix}-insights'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ===== Container Apps Environment =====
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env'
  location: location
  tags: tags
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

// ===== Storage Account + File Share (for report sharing) =====
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = if (enableSharing) {
  name: toLower(replace('${namePrefix}st${uniqueString(resourceGroup().id)}', '-', ''))
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = if (enableSharing) {
  parent: storageAccount
  name: 'default'
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = if (enableSharing) {
  parent: fileService
  name: 'reports'
  properties: {
    shareQuota: 1 // 1 GB
  }
}

// ===== Azure Container Registry =====
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: toLower(replace('${namePrefix}webapp', '-', ''))
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ===== Container Apps Environment Storage (for Azure Files mount) =====
resource envStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = if (enableSharing) {
  parent: containerAppsEnv
  name: 'reportsshare'
  properties: {
    azureFile: {
      accountName: storageAccount!.name
      accountKey: storageAccount!.listKeys().keys[0].value
      shareName: 'reports'
      accessMode: 'ReadWrite'
    }
  }
}

// ===== Container App =====
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-webapp'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
        customDomains: !empty(customDomain) ? [
          {
            name: customDomain
            bindingType: 'SniEnabled'
          }
        ] : []
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: concat(
        [
          {
            name: 'acr-password'
            value: acr.listCredentials().passwords[0].value
          }
        ],
        !empty(ghTokenForScan) ? [
          {
            name: 'gh-token-for-scan'
            value: ghTokenForScan
          }
        ] : [],
        enableAppInsights ? [
          {
            name: 'app-insights-connection-string'
            value: appInsights!.properties.ConnectionString
          }
        ] : []
      )
    }
    template: {
      containers: [
        {
          name: 'webapp'
          image: '${acr.properties.loginServer}/agentrc-webapp:${containerImageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: concat([
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'ENABLE_SHARING'
              value: enableSharing ? 'true' : 'false'
            }
            {
              name: 'REPORTS_DIR'
              value: enableSharing ? '/app/data/reports' : ':memory:'
            }
          ],
          !empty(ghTokenForScan) ? [
            {
              name: 'GH_TOKEN_FOR_SCAN'
              secretRef: 'gh-token-for-scan'
            }
          ] : [],
          enableAppInsights ? [
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: 'app-insights-connection-string'
            }
          ] : [])
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 3000
              }
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 3000
              }
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
          volumeMounts: enableSharing ? [
            {
              volumeName: 'reportsdata'
              mountPath: '/app/data'
            }
          ] : []
        }
      ]
      volumes: enableSharing ? [
        {
          name: 'reportsdata'
          storageName: 'reportsshare'
          storageType: 'AzureFile'
        }
      ] : []
      scale: {
        minReplicas: containerStartupStrategy == 'keep-warm' ? 1 : 0
        maxReplicas: 4
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
  dependsOn: enableSharing ? [envStorage] : []
}

// ===== Outputs =====
@description('Container App FQDN')
output appFqdn string = containerApp.properties.configuration.ingress.fqdn

@description('Container App URL')
output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'

@description('ACR login server')
output acrLoginServer string = acr.properties.loginServer

@description('Application Insights connection string')
output appInsightsConnectionString string = enableAppInsights ? appInsights!.properties.ConnectionString : ''

@description('Log Analytics Workspace ID')
output logAnalyticsWorkspaceId string = logAnalytics.id
