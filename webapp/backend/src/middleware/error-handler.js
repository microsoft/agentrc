/**
 * Error handler middleware — maps known error types to HTTP status codes.
 * Never exposes stack traces or tokens.
 */
import { ValidationError } from "../utils/url-parser.js";
import { ReportValidationError } from "../services/report-validator.js";
import { ConcurrencyError, CloneTimeoutError, GitCloneError } from "../services/scanner.js";

const errorMap = [
  { type: ValidationError, status: 400 },
  { type: ReportValidationError, status: 400 },
  { type: ConcurrencyError, status: 429 },
  { type: CloneTimeoutError, status: 504 },
  { type: GitCloneError, status: 502 }
];

/** Express error handler — must have 4 params. */
export function errorHandler(err, _req, res, _next) {
  const match = errorMap.find((e) => err instanceof e.type);
  const status = match?.status ?? 500;
  const message = status === 500 ? "Internal server error" : err.message;

  // Log server errors
  if (status >= 500) {
    console.error("[error]", err.message);
  }

  res.status(status).json({ error: message });
}

/** 404 handler for unknown routes. */
export function notFoundHandler(_req, res) {
  res.status(404).json({ error: "Not found" });
}
