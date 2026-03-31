/**
 * GitHub URL parser with SSRF protection.
 * Only allows github.com URLs and owner/repo shorthand.
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

const OWNER_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;

/**
 * Parse a GitHub repo reference into { owner, repo, url }.
 * Accepts: "owner/repo", "https://github.com/owner/repo", "https://github.com/owner/repo.git"
 * Rejects non-GitHub URLs (SSRF protection).
 */
export function parseRepoUrl(input) {
  if (!input || typeof input !== "string") {
    throw new ValidationError("repo_url is required");
  }

  const trimmed = input.trim();

  // Shorthand: owner/repo
  if (!trimmed.includes("://")) {
    const parts = trimmed.split("/");
    if (parts.length !== 2) {
      throw new ValidationError('Invalid repo reference. Expected "owner/repo" or a GitHub URL.');
    }
    const [owner, repo] = parts;
    validateOwnerRepo(owner, repo);
    return {
      owner,
      repo,
      url: `https://github.com/${owner}/${repo}.git`
    };
  }

  // Full URL
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError("Invalid URL format.");
  }

  // SSRF protection: only github.com
  if (parsed.hostname !== "github.com") {
    throw new ValidationError("Only github.com repositories are supported.");
  }

  if (parsed.protocol !== "https:") {
    throw new ValidationError("Only HTTPS URLs are supported.");
  }

  // Reject query params and hash
  if (parsed.search || parsed.hash) {
    throw new ValidationError("URL must not contain query parameters or hash.");
  }

  // Extract owner/repo from path
  const pathParts = parsed.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (pathParts.length !== 2) {
    throw new ValidationError("URL must point to a repository: https://github.com/owner/repo");
  }

  const [owner, repo] = pathParts;
  validateOwnerRepo(owner, repo);

  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}.git`
  };
}

function validateOwnerRepo(owner, repo) {
  if (!OWNER_RE.test(owner)) {
    throw new ValidationError(`Invalid GitHub owner: "${owner}"`);
  }
  if (!REPO_RE.test(repo)) {
    throw new ValidationError(`Invalid GitHub repository name: "${repo}"`);
  }
}
