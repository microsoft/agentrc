using './main.bicep'

param namePrefix = 'agentrc'
param containerImageTag = 'latest'
param enableSharing = true
param enableAppInsights = true
param containerStartupStrategy = 'keep-warm'
param tags = {
  application: 'agentrc-webapp'
  managedBy: 'bicep'
  environment: 'production'
}
