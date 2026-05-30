import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Mock @agentrc/core modules before importing routes
vi.mock("@agentrc/core/services/git", () => ({
  cloneRepo: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@agentrc/core/services/readiness", () => ({
  runReadinessReport: vi.fn().mockResolvedValue({
    repoPath: "/tmp/fake",
    generatedAt: "2025-01-15T12:00:00.000Z",
    isMonorepo: false,
    apps: [],
    pillars: [
      { id: "documentation", name: "Documentation", passed: 2, total: 3, passRate: 0.67 },
      { id: "testing", name: "Testing", passed: 1, total: 2, passRate: 0.5 }
    ],
    levels: [
      { level: 1, name: "Functional", passed: 3, total: 4, passRate: 0.75, achieved: true },
      { level: 2, name: "Documented", passed: 2, total: 3, passRate: 0.67, achieved: true },
      { level: 3, name: "Standardized", passed: 0, total: 2, passRate: 0, achieved: false }
    ],
    achievedLevel: 2,
    criteria: [],
    extras: []
  })
}));

// We need to mock cleanup too since scanner uses it
vi.mock("../src/utils/cleanup.js", () => ({
  createTempDir: vi.fn().mockResolvedValue("/tmp/agentrc-scan-fake"),
  removeTempDir: vi.fn().mockResolvedValue(undefined),
  sweepStaleTempDirs: vi.fn().mockResolvedValue(0)
}));

const { createApp, createRuntime } = await import("../src/server.js");
const { createStorage } = await import("../src/services/storage.js");

/** Start Express on an ephemeral port and return base URL + close handle */
function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ base: `http://127.0.0.1:${port}`, server });
    });
  });
}

/** Gracefully close an HTTP server, resolving once the underlying handle is freed. */
function closeServer(s) {
  return new Promise((resolve, reject) => {
    if (!s) return resolve();
    s.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("API routes", () => {
  let app;
  let runtime;
  let base;
  let server;
  const savedCustomDomain = process.env.CUSTOM_DOMAIN;

  beforeEach(async () => {
    // Clear CUSTOM_DOMAIN so createRuntime()'s parseCustomDomain validation
    // never throws due to host-environment values (e.g. "localhost").
    delete process.env.CUSTOM_DOMAIN;

    runtime = {
      ...createRuntime(),
      githubToken: "",
      githubTokenProvided: false,
      sharingEnabled: true,
      reportsDir: ":memory:",
      frontendPath: resolve(dirname(fileURLToPath(import.meta.url)), "../../../webapp/frontend"),
      cloneTimeoutMs: 60000,
      maxConcurrentScans: 5,
      scanRateLimitWindowMs: 900000,
      scanRateLimitMax: 100,
      reportRateLimitWindowMs: 900000,
      reportRateLimitMax: 100,
      appInsightsConnectionString: ""
    };
    runtime.storage = createStorage(":memory:");
    app = createApp(runtime);
    ({ base, server } = await listen(app));
  });

  afterEach(async () => {
    await closeServer(server);
    // Restore original CUSTOM_DOMAIN so we don't leak state to other suites.
    if (savedCustomDomain !== undefined) {
      process.env.CUSTOM_DOMAIN = savedCustomDomain;
    } else {
      delete process.env.CUSTOM_DOMAIN;
    }
  });

  describe("GET /api/health", () => {
    it("returns ok status", async () => {
      const res = await fetch(`${base}/api/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /api/config", () => {
    it("returns config", async () => {
      const res = await fetch(`${base}/api/config`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("sharingEnabled");
      expect(body).toHaveProperty("githubTokenProvided");
    });
  });

  describe("POST /api/scan", () => {
    it("returns validation error for missing repo_url", async () => {
      const res = await fetch(`${base}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("required");
    });

    it("returns validation error for non-GitHub URL", async () => {
      const res = await fetch(`${base}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: "https://evil.com/hack/repo" })
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("github.com");
    });

    it("scans a valid repo reference", async () => {
      const res = await fetch(`${base}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: "microsoft/agentrc" })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("achievedLevel");
      expect(body).toHaveProperty("repo_url");
      expect(body).toHaveProperty("repo_name");
      expect(body.repoPath).toBeUndefined();
    });
  });

  describe("POST /api/report", () => {
    const validResult = {
      generatedAt: "2025-01-15T12:00:00.000Z",
      isMonorepo: false,
      apps: [],
      pillars: [
        { id: "documentation", name: "Documentation", passed: 2, total: 3, passRate: 0.67 },
        { id: "testing", name: "Testing", passed: 1, total: 2, passRate: 0.5 }
      ],
      levels: [
        { level: 1, name: "Functional", passed: 3, total: 4, passRate: 0.75, achieved: true },
        { level: 2, name: "Documented", passed: 2, total: 3, passRate: 0.67, achieved: true },
        { level: 3, name: "Standardized", passed: 0, total: 2, passRate: 0, achieved: false }
      ],
      achievedLevel: 2,
      criteria: [],
      extras: []
    };

    it("saves and retrieves a report", async () => {
      const postRes = await fetch(`${base}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: validResult })
      });
      expect(postRes.status).toBe(201);
      const postBody = await postRes.json();
      expect(postBody).toHaveProperty("id");
      expect(postBody).toHaveProperty("url");

      const getRes = await fetch(`${base}/api/report/${postBody.id}`);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.achievedLevel).toBe(2);
    });

    it("returns 503 when sharing is disabled", async () => {
      await closeServer(server);
      runtime.sharingEnabled = false;
      app = createApp(runtime);
      ({ base, server } = await listen(app));

      const res = await fetch(`${base}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: validResult })
      });
      expect(res.status).toBe(503);
    });

    it("returns 400 for invalid report", async () => {
      const res = await fetch(`${base}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: { bad: "data" } })
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown report ID", async () => {
      const res = await fetch(`${base}/api/report/00000000-0000-0000-0000-000000000000`);
      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid report ID format", async () => {
      const res = await fetch(`${base}/api/report/not-a-uuid`);
      expect(res.status).toBe(400);
    });

    it("saves and retrieves a report with achievedLevel 0", async () => {
      const levelZeroResult = { ...validResult, achievedLevel: 0 };
      const postRes = await fetch(`${base}/api/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: levelZeroResult })
      });
      expect(postRes.status).toBe(201);
      const postBody = await postRes.json();
      expect(postBody).toHaveProperty("id");

      const getRes = await fetch(`${base}/api/report/${postBody.id}`);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.achievedLevel).toBe(0);
    });
  });

  describe("index.html templating (%SITE_URL% replacement)", () => {
    it("replaces %SITE_URL% with runtime.siteUrl when CUSTOM_DOMAIN is configured", async () => {
      await closeServer(server);
      runtime.siteUrl = "https://app.example.com";
      app = createApp(runtime);
      ({ base, server } = await listen(app));

      const res = await fetch(`${base}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('content="https://app.example.com"');
      expect(html).toContain('content="https://app.example.com/assets/og-image.jpg"');
      expect(html).not.toContain("%SITE_URL%");
    });

    it("derives %SITE_URL% from the request host when siteUrl is empty", async () => {
      await closeServer(server);
      runtime.siteUrl = "";
      app = createApp(runtime);
      ({ base, server } = await listen(app));
      // Align runtime.port with the actual ephemeral port so renderIndex
      // produces a URL that matches the real server origin.
      runtime.port = server.address().port;

      const res = await fetch(`${base}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      // Should derive from localhost + the actual bound port
      expect(html).toContain(`http://localhost:${runtime.port}`);
      expect(html).not.toContain("%SITE_URL%");
    });

    it("replaces %SITE_URL% on SPA catch-all routes", async () => {
      await closeServer(server);
      runtime.siteUrl = "https://spa.example.com";
      app = createApp(runtime);
      ({ base, server } = await listen(app));

      const res = await fetch(`${base}/some/spa/route`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('content="https://spa.example.com"');
      expect(html).toContain('content="https://spa.example.com/assets/og-image.jpg"');
      expect(html).not.toContain("%SITE_URL%");
    });

    it("derives %SITE_URL% from request host on SPA catch-all when siteUrl is empty", async () => {
      await closeServer(server);
      runtime.siteUrl = "";
      app = createApp(runtime);
      ({ base, server } = await listen(app));
      // Align runtime.port with the actual ephemeral port so renderIndex
      // produces a URL that matches the real server origin.
      runtime.port = server.address().port;

      const res = await fetch(`${base}/report/abc`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain(`http://localhost:${runtime.port}`);
      expect(html).not.toContain("%SITE_URL%");
    });
  });
});
