/**
 * Express server factory and startup.
 * createRuntime() → createApp(runtime) → listen
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import { createScanRouter } from "./routes/scan.js";
import { createReportRouter } from "./routes/report.js";
import { createConfigRouter } from "./routes/config.js";
import { createScanRateLimiter, createReportRateLimiter } from "./middleware/rate-limiter.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { createStorage, startReportCleanup, stopReportCleanup } from "./services/storage.js";
import { startStaleDirSweeper, stopStaleDirSweeper } from "./services/scanner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Validate and normalise CUSTOM_DOMAIN to a bare hostname.
 * Strips protocol, path, port, and whitespace.  Throws on
 * clearly-invalid values so misconfigurations surface at startup.
 */
function parseCustomDomain(raw) {
  if (!raw) return "";
  let host = raw.trim();
  // Strip protocol prefix if provided (e.g. "https://example.com")
  host = host.replace(/^https?:\/\//i, "");
  // Strip path, query, fragment
  host = host.split("/")[0].split("?")[0].split("#")[0];
  // Strip port (e.g. "example.com:443")
  host = host.replace(/:\d+$/, "");
  if (!host || /\s/.test(host) || !/\./.test(host)) {
    throw new Error(
      `Invalid CUSTOM_DOMAIN: "${raw}". Expected a bare hostname (e.g. "app.example.com").`
    );
  }
  return host;
}

/** Load env vars and build computed runtime config. */
export function createRuntime() {
  const port = parseInt(process.env.PORT || "3000", 10);
  const githubToken = process.env.GH_TOKEN_FOR_SCAN || "";
  const sharingEnabled = process.env.ENABLE_SHARING === "true";
  const reportsDir = process.env.REPORTS_DIR || ":memory:";
  const frontendPath = resolve(__dirname, "../../frontend");
  const customDomain = parseCustomDomain(process.env.CUSTOM_DOMAIN);
  const siteUrl = customDomain ? `https://${customDomain}` : "";
  const appInsightsConnectionString =
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ||
    process.env.PUBLIC_APPLICATIONINSIGHTS_CONNECTION_STRING ||
    "";

  return {
    port,
    githubToken,
    githubTokenProvided: !!githubToken,
    sharingEnabled,
    reportsDir,
    frontendPath,
    siteUrl,
    appInsightsConnectionString,
    storage: createStorage(reportsDir),
    cloneTimeoutMs: parseInt(process.env.SCAN_CLONE_TIMEOUT_MS || "60000", 10),
    maxConcurrentScans: parseInt(process.env.MAX_CONCURRENT_SCANS || "5", 10),
    scanRateLimitWindowMs: parseInt(process.env.SCAN_RATE_LIMIT_WINDOW_MS || "900000", 10),
    scanRateLimitMax: parseInt(process.env.SCAN_RATE_LIMIT_MAX || "30", 10),
    reportRateLimitWindowMs: parseInt(process.env.REPORT_RATE_LIMIT_WINDOW_MS || "900000", 10),
    reportRateLimitMax: parseInt(process.env.REPORT_RATE_LIMIT_MAX || "60", 10)
  };
}

/** Build Express app from runtime config. */
export function createApp(runtime) {
  const app = express();

  // Trust one proxy hop (Azure Container Apps load balancer)
  app.set("trust proxy", 1);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"]
        }
      }
    })
  );

  const corsOrigin = process.env.CORS_ORIGIN || false;
  app.use(cors({ origin: corsOrigin, credentials: false }));
  app.use(express.json({ limit: "1mb" }));

  // API routes
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      githubTokenProvided: runtime.githubTokenProvided,
      sharingEnabled: runtime.sharingEnabled
    });
  });

  app.use("/api/config", createConfigRouter(runtime));
  app.use("/api/scan", createScanRateLimiter(runtime), createScanRouter(runtime));
  app.use("/api/report", createReportRateLimiter(runtime), createReportRouter(runtime));

  // Read the raw index.html template once at startup.
  // %SITE_URL% is replaced at request time so OG/Twitter tags always
  // contain absolute URLs — even when CUSTOM_DOMAIN is not configured.
  const rawIndexHtml = readFileSync(join(runtime.frontendPath, "index.html"), "utf-8");

  // If a custom domain is configured, pre-render once (fast path).
  // Otherwise, derive the base URL per-request from the Host header.
  const preRenderedHtml = runtime.siteUrl
    ? rawIndexHtml.replaceAll("%SITE_URL%", runtime.siteUrl)
    : null;

  function renderIndex(req) {
    if (preRenderedHtml) return preRenderedHtml;
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return rawIndexHtml.replaceAll("%SITE_URL%", baseUrl);
  }

  // Serve processed index.html for root requests
  app.get("/", (req, res) => {
    res.type("html").send(renderIndex(req));
  });

  // Static frontend files (other assets)
  app.use(express.static(runtime.frontendPath));

  // SPA catch-all: serve processed index.html for non-API routes
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.type("html").send(renderIndex(req));
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/** Start the server (only when run directly, not imported). */
function start() {
  const runtime = createRuntime();
  const app = createApp(runtime);

  startStaleDirSweeper();
  if (runtime.sharingEnabled) startReportCleanup();

  const server = app.listen(runtime.port, () => {
    console.log(`AgentRC webapp listening on http://localhost:${runtime.port}`);
    console.log(`  GitHub token: ${runtime.githubTokenProvided ? "provided" : "not set"}`);
    console.log(`  Sharing: ${runtime.sharingEnabled ? "enabled" : "disabled"}`);
    console.log(`  Reports dir: ${runtime.reportsDir}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    stopStaleDirSweeper();
    stopReportCleanup();
    server.close(() => {
      console.log("Server closed.");
      process.exit(0);
    });
    // Force exit after 10s
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// Auto-start when run directly
const isMain =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1].endsWith("server.js"));

if (isMain) {
  start();
}
