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
  if (pillars.length > 50) {
    throw new ReportValidationError("pillars array too large.");
  }
  for (const p of pillars) {
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      throw new ReportValidationError("Each pillar must be a non-null object.");
    }
    if (typeof p.id !== "string" || p.id.length > 200) {
      throw new ReportValidationError("Pillar id must be a string (max 200 chars).");
    }
    if (typeof p.name !== "string" || p.name.length > MAX_STRING_LEN) {
      throw new ReportValidationError("Pillar name must be a string within length limits.");
    }
    p.passed = typeof p.passed === "number" && Number.isFinite(p.passed) ? p.passed : 0;
    p.total = typeof p.total === "number" && Number.isFinite(p.total) ? p.total : 0;
    p.passRate = typeof p.passRate === "number" && Number.isFinite(p.passRate) ? p.passRate : 0;
  }

  if (!Array.isArray(levels)) {
    throw new ReportValidationError("levels must be an array.");
  }
  if (levels.length > 10) {
    throw new ReportValidationError("levels array too large.");
  }
  for (const l of levels) {
    if (!l || typeof l !== "object" || Array.isArray(l)) {
      throw new ReportValidationError("Each level must be a non-null object.");
    }
    if (typeof l.level !== "number" || !Number.isInteger(l.level) || l.level < 0 || l.level > 5) {
      throw new ReportValidationError("Level.level must be an integer 0-5.");
    }
    if (typeof l.name !== "string" || l.name.length > MAX_STRING_LEN) {
      throw new ReportValidationError("Level name must be a string within length limits.");
    }
    if (typeof l.achieved !== "boolean") {
      throw new ReportValidationError("Level.achieved must be a boolean.");
    }
    l.passed = typeof l.passed === "number" && Number.isFinite(l.passed) ? l.passed : 0;
    l.total = typeof l.total === "number" && Number.isFinite(l.total) ? l.total : 0;
    l.passRate = typeof l.passRate === "number" && Number.isFinite(l.passRate) ? l.passRate : 0;
  }

  if (!Array.isArray(criteria)) {
    throw new ReportValidationError("criteria must be an array.");
  }
  if (criteria.length > 500) {
    throw new ReportValidationError("criteria array too large.");
  }

  // Validate and whitelist criteria fields to prevent XSS via unvalidated nested objects
  const ALLOWED_CRITERIA_KEYS = new Set([
    "id", "title", "pillar", "level", "scope", "impact", "effort",
    "status", "reason", "evidence", "passRate",
    "appSummary", "areaSummary", "appFailures", "areaFailures"
  ]);
  for (let i = 0; i < criteria.length; i++) {
    const c = criteria[i];
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      throw new ReportValidationError("Each criteria item must be a non-null object.");
    }
    // Strip unknown keys
    for (const key of Object.keys(c)) {
      if (!ALLOWED_CRITERIA_KEYS.has(key)) {
        delete c[key];
      }
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
    // Coerce appSummary/areaSummary to { passed: number, total: number } or remove
    if (c.appSummary !== undefined) {
      if (c.appSummary && typeof c.appSummary === "object" && !Array.isArray(c.appSummary)) {
        const passed = Number(c.appSummary.passed);
        const total = Number(c.appSummary.total);
        c.appSummary = {
          passed: Number.isFinite(passed) ? passed : 0,
          total: Number.isFinite(total) ? total : 0
        };
      } else {
        delete c.appSummary;
      }
    }
    if (c.areaSummary !== undefined) {
      if (c.areaSummary && typeof c.areaSummary === "object" && !Array.isArray(c.areaSummary)) {
        const passed = Number(c.areaSummary.passed);
        const total = Number(c.areaSummary.total);
        c.areaSummary = {
          passed: Number.isFinite(passed) ? passed : 0,
          total: Number.isFinite(total) ? total : 0
        };
      } else {
        delete c.areaSummary;
      }
    }
    // Coerce appFailures/areaFailures to arrays of strings or remove
    if (c.appFailures !== undefined) {
      if (Array.isArray(c.appFailures)) {
        c.appFailures = c.appFailures.filter((f) => typeof f === "string").map((f) => f.slice(0, MAX_STRING_LEN));
      } else {
        delete c.appFailures;
      }
    }
    if (c.areaFailures !== undefined) {
      if (Array.isArray(c.areaFailures)) {
        c.areaFailures = c.areaFailures.filter((f) => typeof f === "string").map((f) => f.slice(0, MAX_STRING_LEN));
      } else {
        delete c.areaFailures;
      }
    }
    // Coerce evidence to array of strings or remove
    if (c.evidence !== undefined) {
      if (Array.isArray(c.evidence)) {
        c.evidence = c.evidence.filter((e) => typeof e === "string").map((e) => e.slice(0, MAX_STRING_LEN));
      } else {
        delete c.evidence;
      }
    }
    // Coerce passRate to finite number or remove
    if (c.passRate !== undefined) {
      const pr = Number(c.passRate);
      c.passRate = Number.isFinite(pr) ? pr : undefined;
      if (c.passRate === undefined) delete c.passRate;
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
