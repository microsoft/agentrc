/**
 * URL parsing and browser history management for repo references.
 */

const OWNER_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse various GitHub reference formats into "owner/repo" or null.
 */
export function parseGitHubReference(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // owner/repo shorthand
  if (!trimmed.includes("://")) {
    const parts = trimmed.split("/").filter(Boolean);
    if (parts.length === 2 && OWNER_RE.test(parts[0]) && REPO_RE.test(parts[1])) {
      return `${parts[0]}/${parts[1]}`;
    }
    return null;
  }

  // Full URL
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    const parts = url.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (parts.length === 2 && OWNER_RE.test(parts[0]) && REPO_RE.test(parts[1])) {
      return `${parts[0]}/${parts[1]}`;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Normalize a repo reference: trim, lower owner, return "owner/repo" or null.
 */
export function normalizeRepoReference(value) {
  const ref = parseGitHubReference(value);
  return ref || null;
}

/**
 * Extract repo reference from URL pathname like /owner/repo.
 */
export function getRepoFromPath(pathname) {
  if (!pathname || pathname === "/") return null;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 2 && OWNER_RE.test(parts[0]) && REPO_RE.test(parts[1])) {
    return `${parts[0]}/${parts[1]}`;
  }
  return null;
}

/**
 * Extract shared report ID from pathname like /_/report/{uuid}.
 */
export function getSharedReportId(pathname) {
  if (!pathname) return null;
  const match = pathname.match(/^\/_\/report\/([^/]+)$/);
  if (match && UUID_RE.test(match[1])) return match[1];
  return null;
}

/**
 * Push the scanned repo path into browser history.
 */
export function syncRepoPathInBrowser(repoReference) {
  if (!repoReference) return;
  const newPath = `/${repoReference}`;
  if (window.location.pathname !== newPath) {
    window.history.pushState({ repo: repoReference }, "", newPath);
  }
}
