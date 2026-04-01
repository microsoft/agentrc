using './main.bicep'

param namePrefix = 'agentrc'
param containerImageTag = 'latest'
param useAcrAdminCredentials = true
param enableSharing = true
param enableAppInsights = true
param containerStartupStrategy = 'keep-warm'
// To bind a custom domain, set e.g. customDomain = 'agentrc.isainative.dev'
param customDomain = ''
param customDomainCertReady = false // Set to true after DNS CNAME + TXT records are verified
param tags = {
  application: 'agentrc-webapp'
  managedBy: 'bicep'
  environment: 'production'
}
