/**
 * POST + GET /api/report — Share and retrieve readiness reports.
 */
import { Router } from "express";
import { normalizeSharedReportResult } from "../services/report-validator.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createReportRouter(runtime) {
  const router = Router();

  // POST / — Save a shared report
  router.post("/", async (req, res, next) => {
    try {
      if (!runtime.sharingEnabled) {
        return res.status(503).json({ error: "Report sharing is not enabled." });
      }

      const normalized = normalizeSharedReportResult(req.body.result ?? req.body);
      const id = await runtime.storage.saveReport(normalized);
      const url = `/_/report/${id}`;

      res.status(201).json({ id, url });
    } catch (err) {
      next(err);
    }
  });

  // GET /:id — Retrieve a shared report
  router.get("/:id", async (req, res, next) => {
    try {
      if (!runtime.sharingEnabled) {
        return res.status(503).json({ error: "Report sharing is not enabled." });
      }

      const { id } = req.params;
      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: "Invalid report ID format." });
      }

      const report = await runtime.storage.getReport(id);
      if (!report) {
        return res.status(404).json({ error: "Report not found." });
      }

      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
