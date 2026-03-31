import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    pillars: [{ name: "Documentation", passed: 2, failed: 1 }],
    levels: [{ level: 1, description: "Foundation" }],
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

describe("API routes", () => {
  let app;
  let runtime;
  let base;
  let server;

  beforeEach(async () => {
    runtime = {
      ...createRuntime(),
      githubToken: "",
      githubTokenProvided: false,
      sharingEnabled: true,
      reportsDir: ":memory:",
      frontendPath: import.meta.dirname + "/../../../webapp/frontend",
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

  afterEach(() => server?.close());

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
      pillars: [{ name: "Documentation", passed: 2, failed: 1 }],
      levels: [{ level: 1, description: "Foundation" }],
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
      server?.close();
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
});
