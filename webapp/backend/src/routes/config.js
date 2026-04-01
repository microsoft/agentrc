/**
 * GET /api/config — Return public configuration for the frontend.
 */
import { Router } from "express";

export function createConfigRouter(runtime) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      sharingEnabled: runtime.sharingEnabled,
      githubTokenProvided: runtime.githubTokenProvided
    });
  });

  return router;
}
