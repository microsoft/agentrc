// @agentrc/core barrel — re-exports all public API surface

// Config
export { DEFAULT_MODEL, DEFAULT_JUDGE_MODEL } from "./config";

// Services
export {
  analyzeRepo,
  detectWorkspaces,
  loadAgentrcConfig,
  sanitizeAreaName
} from "./services/analyzer";
export type {
  RepoApp,
  Area,
  RepoAnalysis,
  InstructionStrategy,
  AgentrcConfig,
  AgentrcConfigArea,
  AgentrcConfigWorkspace
} from "./services/analyzer";

export {
  createPullRequest as createAzurePullRequest,
  getRepo as getAzureDevOpsRepo
} from "./services/azureDevops";

export {
  processGitHubRepo,
  processAzureRepo,
  runBatchHeadlessGitHub,
  runBatchHeadlessAzure,
  processBatchReadinessRepo,
  sanitizeError
} from "./services/batch";

export {
  assertCopilotCliReady,
  listCopilotModels,
  buildExecArgs,
  logCopilotDebug
} from "./services/copilot";
export type { CopilotCliConfig } from "./services/copilot";

export {
  loadCopilotSdk,
  createCopilotClient,
  attachDefaultPermissionHandler
} from "./services/copilotSdk";

export { generateEvalScaffold } from "./services/evalScaffold";

export { runEval } from "./services/evaluator";

export { generateConfigs } from "./services/generator";
export type { FileAction, GenerateResult, GenerateOptions } from "./services/generator";

export {
  isGitRepo,
  cloneRepo,
  setRemoteUrl,
  checkoutBranch,
  commitAll,
  buildAuthedUrl,
  pushBranch
} from "./services/git";

export {
  getGitHubToken,
  createGitHubClient,
  listAccessibleRepos,
  getRepo as getGitHubRepo,
  createPullRequest,
  listUserOrgs,
  listOrgRepos,
  checkRepoHasInstructions,
  checkReposForInstructions
} from "./services/github";
export type { GitHubRepo, GitHubOrg } from "./services/github";

export {
  generateCopilotInstructions,
  generateAreaInstructions,
  generateNestedInstructions,
  generateNestedAreaInstructions,
  writeAreaInstruction,
  writeNestedInstructions,
  detectExistingInstructions,
  buildExistingInstructionsSection,
  stripMarkdownFences
} from "./services/instructions";

export { setBuiltinSkillsDir, getSkillDirectory } from "./services/skills";
export type { BuiltinSkillName } from "./services/skills";

export { parsePolicySources, loadPolicy, resolveChain } from "./services/policy";

export {
  runReadinessReport,
  groupPillars,
  getLevelName,
  getLevelDescription,
  buildCriteria
} from "./services/readiness";
export type {
  ReadinessReport,
  ReadinessCriterionResult,
  ReadinessExtraResult
} from "./services/readiness";

export { generateVisualReport } from "./services/visualReport";

// Utils
export {
  ensureDir,
  safeWriteFile,
  validateCachePath,
  fileExists,
  safeReadDir,
  readJson,
  buildTimestampedName
} from "./utils/fs";
export type { WriteResult } from "./utils/fs";

export { prettyPrintSummary } from "./utils/logger";

export {
  createProgressReporter,
  shouldLog,
  outputResult,
  deriveFileStatus,
  outputError
} from "./utils/output";
export type { CommandResult, ProgressReporter } from "./utils/output";

export { isAgentrcFile, buildInstructionsPrBody, buildFullPrBody } from "./utils/pr";
export { GITHUB_REPO_RE, AZURE_REPO_RE } from "./utils/repo";
