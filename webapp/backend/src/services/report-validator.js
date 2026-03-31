/**
 * Shared report validation — normalizes and validates ReadinessReport
 * before persisting for sharing.
 */

export class ReportValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReportValidationError";
  }
}

const MAX_STRING_LEN = 10_000;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const GITHUB_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?\/[a-zA-Z0-9._-]{1,100}$/;

/**
 * Validate and normalize a ReadinessReport for sharing.
 * Strips internal fields and validates structure.
 */
export function normalizeSharedReportResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReportValidationError("Report must be a non-null object.");
  }

  // Prevent prototype pollution
  if (
    Object.prototype.hasOwnProperty.call(value, "__proto__") ||
    Object.prototype.hasOwnProperty.call(value, "prototype")
  ) {
    throw new ReportValidationError("Invalid report structure.");
  }

  const {
    generatedAt,
    isMonorepo,
    apps,
    pillars,
    levels,
    achievedLevel,
    criteria,
    extras,
    areaReports,
    policies,
    // Intentionally strip:
    repoPath: _repoPath,
    engine: _engine,
    // Allow pass-through of webapp-added fields:
    repo_url,
    repo_name,
    durationMs,
    ...rest
  } = value;

  // Reject unknown fields
  if (Object.keys(rest).length > 0) {
    throw new ReportValidationError(`Unknown fields: ${Object.keys(rest).join(", ")}`);
  }

  // Required fields
  if (!generatedAt || !ISO_DATE_RE.test(generatedAt)) {
    throw new ReportValidationError("generatedAt must be a valid ISO timestamp.");
  }

  if (typeof isMonorepo !== "boolean") {
    throw new ReportValidationError("isMonorepo must be a boolean.");
  }

  if (
    typeof achievedLevel !== "number" ||
    !Number.isInteger(achievedLevel) ||
    achievedLevel < 0 ||
    achievedLevel > 5
  ) {
    throw new ReportValidationError("achievedLevel must be an integer 0-5.");
  }

  if (!Array.isArray(pillars)) {
    throw new ReportValidationError("pillars must be an array.");
  }

  if (!Array.isArray(levels)) {
    throw new ReportValidationError("levels must be an array.");
  }

  if (!Array.isArray(criteria)) {
    throw new ReportValidationError("criteria must be an array.");
  }

  // Validate string lengths to prevent abuse
  for (const c of criteria) {
    if (c.title && c.title.length > MAX_STRING_LEN) {
      throw new ReportValidationError("Criteria title too long.");
    }
    if (c.reason && c.reason.length > MAX_STRING_LEN) {
      throw new ReportValidationError("Criteria reason too long.");
    }
  }

  const normalized = {
    generatedAt,
    isMonorepo,
    apps: Array.isArray(apps) ? apps : [],
    pillars,
    levels,
    achievedLevel,
    criteria,
    extras: Array.isArray(extras) ? extras : []
  };

  if (areaReports) normalized.areaReports = areaReports;
  if (policies) normalized.policies = policies;
  if (repo_url) {
    const urlStr = String(repo_url).slice(0, 500);
    if (GITHUB_URL_RE.test(urlStr)) normalized.repo_url = urlStr;
  }
  if (repo_name) normalized.repo_name = String(repo_name).slice(0, 200);
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) normalized.durationMs = durationMs;

  return normalized;
}
