// AgentRC Web App Infrastructure — Azure Container Apps (Consumption plan)
// Resources: Log Analytics → App Insights (optional) → Container Apps Environment → Storage (optional) → Container App

@description('Name prefix for all resources (lowercase letters and numbers only, max 10 chars)')
@minLength(1)
@maxLength(10)
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

@description('Custom domain (optional, leave empty to skip). Requires DNS to be configured first — see outputs.')
param customDomain string = ''

@description('Set to true only after DNS records (CNAME + TXT) are verified. First deploy with false to get verification ID.')
param customDomainCertReady bool = false

@description('Use ACR admin credentials instead of managed identity (set to true when the deploying SP lacks role-assignment write permissions)')
param useAcrAdminCredentials bool = false

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
  name: take(toLower(replace('${namePrefix}st${uniqueString(resourceGroup().id)}', '-', '')), 24)
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

// ===== User-Assigned Managed Identity (for ACR pull) =====
resource acrPullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-acr-pull'
  location: location
  tags: tags
}

// ===== Azure Container Registry =====
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: take(toLower(replace('${namePrefix}webapp', '-', '')), 50)
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: useAcrAdminCredentials
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

// ===== Managed Certificate for Custom Domain =====
resource managedCert 'Microsoft.App/managedEnvironments/managedCertificates@2024-03-01' = if (!empty(customDomain) && customDomainCertReady) {
  parent: containerAppsEnv
  name: 'cert-${replace(customDomain, '.', '-')}'
  location: location
  tags: tags
  properties: {
    subjectName: customDomain
    domainControlValidation: 'CNAME'
  }
}

// ===== AcrPull Role Assignment (user-assigned managed identity) =====
@description('AcrPull built-in role')
var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')

resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!useAcrAdminCredentials) {
  name: guid(acr.id, acrPullIdentity.id, acrPullRoleId)
  scope: acr
  properties: {
    principalId: acrPullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-webapp'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${acrPullIdentity.id}': {}
    }
  }
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
            bindingType: customDomainCertReady ? 'SniEnabled' : 'Disabled'
            ...(customDomainCertReady ? {
              certificateId: managedCert.id
            } : {})
          }
        ] : []
      }
      registries: useAcrAdminCredentials ? [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ] : [
        {
          server: acr.properties.loginServer
          identity: acrPullIdentity.id
        }
      ]
      secrets: concat(
        useAcrAdminCredentials ? [
          {
            name: 'acr-password'
            value: acr.listCredentials().passwords[0].value
          }
        ] : [],
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
          !empty(customDomain) && customDomainCertReady ? [
            {
              name: 'CUSTOM_DOMAIN'
              value: customDomain
            }
          ] : [],
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
  dependsOn: enableSharing
    ? (useAcrAdminCredentials ? [envStorage] : [acrPullRoleAssignment, envStorage])
    : (useAcrAdminCredentials ? [] : [acrPullRoleAssignment])
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

@description('Custom domain verification ID (use as TXT record value for asuid.{subdomain})')
output domainVerificationId string = containerAppsEnv.properties.customDomainConfiguration.customDomainVerificationId
