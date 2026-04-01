/**
 * HTTP client for the AgentRC webapp API.
 */

/** Fetch public config from the backend. */
export async function fetchConfig(signal) {
  const res = await fetch("/api/config", { signal });
  if (!res.ok) throw new Error("Failed to fetch config");
  return res.json();
}

/** Scan a repository. */
export async function scanRepo(repoUrl, signal) {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_url: repoUrl }),
    signal
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Scan failed (${res.status})`);
  }
  return res.json();
}

/** Share a report for public access. */
export async function shareReport(result, signal) {
  const res = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result }),
    signal
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Share failed (${res.status})`);
  }
  return res.json();
}

/** Fetch a shared report by ID. */
export async function fetchSharedReport(id, signal) {
  const res = await fetch(`/api/report/${encodeURIComponent(id)}`, { signal });
  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Fetch failed (${res.status})`);
  }
  return res.json();
}
