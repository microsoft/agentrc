import path from "path";

import { safeWriteFile } from "../utils/fs";

import { detectWorkspaces } from "./analyzer";
import type { Area } from "./analyzer";
import type { AgentrcConfig, AgentrcConfigArea } from "./analyzer/config";
export type ScaffoldConfigResult = {
  wrote: boolean;
  configPath: string;
};

/**
 * Scaffolds agentrc.config.json from a list of detected areas.
 * Detects workspaces automatically and maps standalone areas.
 * Returns null if there are no areas to write (nothing to scaffold).
 */
export async function scaffoldAgentrcConfig(
  repoPath: string,
  areas: Area[],
  force = false
): Promise<ScaffoldConfigResult | null> {
  if (areas.length === 0) return null;

  const configPath = path.join(repoPath, "agentrc.config.json");
  const workspaces = await detectWorkspaces(repoPath, areas);

  const workspacePaths = workspaces.map((ws) => ws.path + "/");

  const standaloneAreas: AgentrcConfigArea[] = areas
    .filter((a) => {
      if (!a.path) return true;
      const rel = path.relative(repoPath, a.path).replace(/\\/gu, "/");
      return !workspacePaths.some((prefix) => rel.startsWith(prefix));
    })
    .map((a) => ({
      name: a.name,
      applyTo: a.applyTo,
      ...(a.description ? { description: a.description } : {})
    }));

  const agentrcConfig: AgentrcConfig = {};
  if (workspaces.length > 0) agentrcConfig.workspaces = workspaces;
  if (standaloneAreas.length > 0) agentrcConfig.areas = standaloneAreas;

  if (!agentrcConfig.workspaces && !agentrcConfig.areas) return null;

  const configContent = JSON.stringify(agentrcConfig, null, 2) + "\n";
  const { wrote } = await safeWriteFile(configPath, configContent, force);
  return { wrote, configPath };
}
