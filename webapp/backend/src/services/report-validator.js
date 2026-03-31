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
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
const GITHUB_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?\/[a-zA-Z0-9._-]{1,100}$/;

const ALLOWED_STATUS = new Set(["pass", "fail", "skip"]);
const ALLOWED_IMPACT = new Set(["high", "medium", "low"]);
const ALLOWED_EFFORT = new Set(["high", "medium", "low"]);

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

  // Validate string lengths and enum fields to prevent abuse
  for (const c of criteria) {
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      throw new ReportValidationError("Each criteria item must be a non-null object.");
    }
    if (c.title !== undefined) {
      if (typeof c.title !== "string") {
        delete c.title;
      } else if (c.title.length > MAX_STRING_LEN) {
        throw new ReportValidationError("Criteria title too long.");
      }
    }
    if (c.reason !== undefined) {
      if (typeof c.reason !== "string") {
        delete c.reason;
      } else if (c.reason.length > MAX_STRING_LEN) {
        throw new ReportValidationError("Criteria reason too long.");
      }
    }
    if (c.status !== undefined && !ALLOWED_STATUS.has(c.status)) {
      delete c.status;
    }
    if (c.impact !== undefined && !ALLOWED_IMPACT.has(c.impact)) {
      delete c.impact;
    }
    if (c.effort !== undefined && !ALLOWED_EFFORT.has(c.effort)) {
      delete c.effort;
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
    extras: Array.isArray(extras) ? extras.filter((e) => e && typeof e === "object" && !Array.isArray(e)) : []
  };

  // Sanitize extras enum fields
  for (const e of normalized.extras) {
    if (e.status !== undefined && !ALLOWED_STATUS.has(e.status)) {
      delete e.status;
    }
  }

  // Validate areaReports: must be an array of objects with { area, criteria[], pillars[] }
  if (areaReports != null) {
    if (!Array.isArray(areaReports) || areaReports.length > 50) {
      throw new ReportValidationError("areaReports must be an array with at most 50 entries.");
    }
    for (const ar of areaReports) {
      if (!ar || typeof ar !== "object" || Array.isArray(ar)) {
        throw new ReportValidationError("Each areaReport must be a non-null object.");
      }
      if (!ar.area || typeof ar.area !== "object" || Array.isArray(ar.area)) {
        throw new ReportValidationError("Each areaReport must have an area object.");
      }
      if (!Array.isArray(ar.criteria)) {
        throw new ReportValidationError("Each areaReport must have a criteria array.");
      }
      if (!Array.isArray(ar.pillars)) {
        throw new ReportValidationError("Each areaReport must have a pillars array.");
      }
    }
    normalized.areaReports = areaReports;
  }

  // Validate policies: must be { chain: string[], criteriaCount: number }
  if (policies != null) {
    if (!policies || typeof policies !== "object" || Array.isArray(policies)) {
      throw new ReportValidationError("policies must be a non-null object.");
    }
    if (!Array.isArray(policies.chain) || !policies.chain.every((c) => typeof c === "string")) {
      throw new ReportValidationError("policies.chain must be an array of strings.");
    }
    if (
      typeof policies.criteriaCount !== "number" ||
      !Number.isInteger(policies.criteriaCount) ||
      policies.criteriaCount < 0
    ) {
      throw new ReportValidationError("policies.criteriaCount must be a non-negative integer.");
    }
    normalized.policies = { chain: policies.chain, criteriaCount: policies.criteriaCount };
  }
  if (repo_url) {
    const urlStr = String(repo_url).slice(0, 500);
    if (GITHUB_URL_RE.test(urlStr)) normalized.repo_url = urlStr;
  }
  if (repo_name) normalized.repo_name = String(repo_name).slice(0, 200);
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) normalized.durationMs = durationMs;

  return normalized;
}
