import { describe, it, expect, vi, afterEach } from "vitest";
import { createStorage, startReportCleanup, stopReportCleanup } from "../src/services/storage.js";

describe("storage (memory mode)", () => {
  afterEach(() => {
    stopReportCleanup();
  });

  it("saves and retrieves a report", async () => {
    const storage = createStorage(":memory:");
    const report = { achievedLevel: 3, generatedAt: "2025-01-01T00:00:00Z" };
    const id = await storage.saveReport(report);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const retrieved = await storage.getReport(id);
    expect(retrieved).toEqual(report);
  });

  it("returns null for unknown ID", async () => {
    const storage = createStorage(":memory:");
    const result = await storage.getReport("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("returns null for invalid UUID format", async () => {
    const storage = createStorage(":memory:");
    const result = await storage.getReport("not-a-uuid");
    expect(result).toBeNull();
  });

  it("cleanupExpired removes nothing when none expired", async () => {
    const storage = createStorage(":memory:");
    await storage.saveReport({ test: true });
    const cleaned = await storage.cleanupExpired();
    expect(cleaned).toBe(0);
  });

  it("startReportCleanup and stopReportCleanup run without errors", () => {
    createStorage(":memory:");
    startReportCleanup();
    // calling twice is a no-op
    startReportCleanup();
    stopReportCleanup();
    // stopping when already stopped is safe
    stopReportCleanup();
  });

  it("cleanup scheduler invokes cleanupExpired", async () => {
    const storage = createStorage(":memory:");
    const spy = vi.spyOn(storage, "cleanupExpired");

    // Advance past the 60-minute interval
    vi.useFakeTimers();
    startReportCleanup();
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);

    stopReportCleanup();
    vi.useRealTimers();
  });
});

describe("storage (file mode)", () => {
  it("auto-creates REPORTS_DIR on saveReport", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");

    const base = await mkdtemp(join(tmpdir(), "agentrc-test-"));
    const deepDir = join(base, "nested", "reports");

    try {
      const storage = createStorage(deepDir);
      const id = await storage.saveReport({ test: true });
      const result = await storage.getReport(id);
      expect(result).toEqual({ test: true });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
