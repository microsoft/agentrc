/**
 * POST /api/scan — Clone a GitHub repo and run readiness report.
 */
import { Router } from "express";
import { parseRepoUrl } from "../utils/url-parser.js";
import { scanGitHubRepo } from "../services/scanner.js";

export function createScanRouter(runtime) {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const { repo_url } = req.body;

      // Validate URL
      const { owner, repo } = parseRepoUrl(repo_url);

      // Run scan
      const report = await scanGitHubRepo(owner, repo, {
        token: runtime.githubToken,
        timeoutMs: runtime.cloneTimeoutMs,
        maxConcurrent: runtime.maxConcurrentScans
      });

      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
