import { AnalysisTreeProvider } from "./AnalysisTreeProvider.js";
import { ReadinessTreeProvider } from "./ReadinessTreeProvider.js";
import { WorkspaceStatusTreeProvider } from "./WorkspaceStatusTreeProvider.js";

export const analysisTreeProvider = new AnalysisTreeProvider();
export const readinessTreeProvider = new ReadinessTreeProvider();
export const workspaceStatusTreeProvider = new WorkspaceStatusTreeProvider();
