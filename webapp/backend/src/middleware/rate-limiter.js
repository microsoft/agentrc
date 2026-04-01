/**
 * Rate limiting middleware using express-rate-limit.
 */
import rateLimit from "express-rate-limit";

/**
 * Create the scan endpoint rate limiter.
 */
export function createScanRateLimiter(runtime) {
  return rateLimit({
    windowMs: runtime.scanRateLimitWindowMs,
    max: runtime.scanRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    message: { error: "Too many scan requests. Please try again later." }
  });
}

/**
 * Create the report endpoint rate limiter.
 */
export function createReportRateLimiter(runtime) {
  return rateLimit({
    windowMs: runtime.reportRateLimitWindowMs,
    max: runtime.reportRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    message: { error: "Too many report requests. Please try again later." }
  });
}
