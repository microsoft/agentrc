import fs from "fs/promises";
import os from "os";
import path from "path";

import type { ReadinessProcessResult } from "@agentrc/core/services/batch";
import { processBatchReadinessRepo } from "@agentrc/core/services/batch";
import type { GitHubOrg, GitHubRepo } from "@agentrc/core/services/github";
import { listUserOrgs, listOrgRepos, listAccessibleRepos } from "@agentrc/core/services/github";
import { generateVisualReport } from "@agentrc/core/services/visualReport";
import { safeWriteFile, ensureDir, validateCachePath } from "@agentrc/core/utils/fs";
import { Box, Text, useApp, useInput, useIsScreenReaderEnabled } from "ink";
import React, { useEffect, useState } from "react";

import { StaticBanner } from "./AnimatedBanner";

type Props = {
  token: string;
  outputPath?: string;
  policies?: string[];
};

type Status =
  | "loading-orgs"
  | "select-orgs"
  | "loading-repos"
  | "select-repos"
  | "confirm"
  | "processing"
  | "complete"
  | "error";

export function BatchReadinessTui({ token, outputPath, policies }: Props): React.JSX.Element {
  const app = useApp();
  const accessible = useIsScreenReaderEnabled();
  const [status, setStatus] = useState<Status>("loading-orgs");
  const [message, setMessage] = useState<string>("Fetching organizations...");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Data
  const [orgs, setOrgs] = useState<GitHubOrg[]>([]);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedOrgIndices, setSelectedOrgIndices] = useState<Set<number>>(new Set());
  const [selectedRepoIndices, setSelectedRepoIndices] = useState<Set<number>>(new Set());
  const [cursorIndex, setCursorIndex] = useState(0);

  // Processing
  const [results, setResults] = useState<ReadinessProcessResult[]>([]);
  const [currentRepoIndex, setCurrentRepoIndex] = useState(0);
  const [processingMessage, setProcessingMessage] = useState("");

  // Load orgs on mount
  useEffect(() => {
    loadOrgs();
  }, []);

  async function loadOrgs() {
    try {
      const userOrgs = await listUserOrgs(token);
      const allOrgs: GitHubOrg[] = [
        { login: "__personal__", name: "Personal Repositories" },
        ...userOrgs
      ];
      setOrgs(allOrgs);
      setStatus("select-orgs");
      setMessage("Select organizations (space to toggle, enter to confirm)");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to fetch organizations");
    }
  }

  async function loadRepos() {
    setStatus("loading-repos");
    setMessage("Fetching repositories...");
    try {
      const selectedOrgs = Array.from(selectedOrgIndices).map((i) => orgs[i]);
      let allRepos: GitHubRepo[] = [];

      for (let idx = 0; idx < selectedOrgs.length; idx++) {
        const org = selectedOrgs[idx];
        setMessage(
          `Fetching repos from ${org.name ?? org.login} (${idx + 1}/${selectedOrgs.length})...`
        );

        if (org.login === "__personal__") {
          const personalRepos = await listAccessibleRepos(token);
          const userRepos = personalRepos
            .filter((r) => !orgs.some((o) => o.login !== "__personal__" && o.login === r.owner))
            .slice(0, 100);
          allRepos = [...allRepos, ...userRepos];
        } else {
          const orgRepos = await listOrgRepos(token, org.login, 100);
          allRepos = [...allRepos, ...orgRepos];
        }
      }

      setRepos(allRepos);
      setStatus("select-repos");
      setMessage(`Select repositories (${allRepos.length} available)`);
      setCursorIndex(0);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to fetch repositories");
    }
  }

  async function processRepos() {
    setStatus("processing");
    const selectedRepos = Array.from(selectedRepoIndices).map((i) => repos[i]);
    const results: ReadinessProcessResult[] = [];
    const tmpDir = path.join(os.tmpdir(), `agentrc-batch-readiness-${Date.now()}`);

    try {
      await ensureDir(tmpDir);

      for (let i = 0; i < selectedRepos.length; i++) {
        const repo = selectedRepos[i];
        setCurrentRepoIndex(i);
        setProcessingMessage(`Analyzing ${repo.fullName} (${i + 1}/${selectedRepos.length})`);

        const repoDir = validateCachePath(tmpDir, repo.owner, repo.name);
        const result = await processBatchReadinessRepo({
          repo,
          token,
          repoDir,
          policies,
          onProgress: (msg) => setProcessingMessage(msg)
        });
        results.push(result);
      }

      setResults(results);

      // Generate visual report
      const html = generateVisualReport({
        reports: results
          .filter((r) => r.report || r.error)
          .map((r) => ({
            repo: r.repo,
            report: r.report ?? {
              repoPath: r.repo,
              generatedAt: new Date().toISOString(),
              isMonorepo: false,
              apps: [],
              pillars: [],
              levels: [],
              achievedLevel: 0,
              criteria: [],
              extras: []
            },
            error: r.error
          })),
        title: "Batch Readiness Report",
        generatedAt: new Date().toISOString()
      });

      const finalOutputPath = outputPath ?? path.join(process.cwd(), "batch-readiness-report.html");
      const { wrote, reason } = await safeWriteFile(finalOutputPath, html, true);
      if (!wrote) throw new Error(reason === "symlink" ? "Path is a symlink" : "Write failed");

      setStatus("complete");
      setMessage(`Report generated: ${finalOutputPath}`);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to process repositories");
    } finally {
      // Clean up temp directory
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === "q") {
      app.exit();
      return;
    }

    if (status === "select-orgs") {
      if (key.upArrow) {
        setCursorIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setCursorIndex((prev) => Math.min(orgs.length - 1, prev + 1));
      } else if (input === " ") {
        setSelectedOrgIndices((prev) => {
          const next = new Set(prev);
          if (next.has(cursorIndex)) {
            next.delete(cursorIndex);
          } else {
            next.add(cursorIndex);
          }
          return next;
        });
      } else if (key.return) {
        if (selectedOrgIndices.size === 0) {
          setMessage("Please select at least one organization");
          return;
        }
        loadRepos().catch((err) => {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Failed to load repos");
        });
      } else if (input.toLowerCase() === "a") {
        setSelectedOrgIndices(new Set(orgs.map((_, i) => i)));
      }
    }

    if (status === "select-repos") {
      if (key.upArrow) {
        setCursorIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setCursorIndex((prev) => Math.min(repos.length - 1, prev + 1));
      } else if (input === " ") {
        setSelectedRepoIndices((prev) => {
          const next = new Set(prev);
          if (next.has(cursorIndex)) {
            next.delete(cursorIndex);
          } else {
            next.add(cursorIndex);
          }
          return next;
        });
      } else if (key.return) {
        if (selectedRepoIndices.size === 0) {
          setMessage("Please select at least one repository");
          return;
        }
        setStatus("confirm");
        setMessage(`Process ${selectedRepoIndices.size} repositories? (y/n)`);
      } else if (input.toLowerCase() === "a") {
        setSelectedRepoIndices(new Set(repos.map((_, i) => i)));
      }
    }

    if (status === "confirm") {
      if (input.toLowerCase() === "y") {
        processRepos().catch((err) => {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Processing failed");
        });
      } else if (input.toLowerCase() === "n") {
        setStatus("select-repos");
        setMessage(`Select repositories (${repos.length} available)`);
      }
    }

    if (status === "complete" || status === "error") {
      app.exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <StaticBanner />
      <Box marginTop={1}>
        <Text bold>Batch Readiness Report</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={status === "error" ? "red" : "cyan"}>{message}</Text>
      </Box>

      {status === "error" && errorMessage && (
        <Box marginTop={1}>
          <Text color="red">{errorMessage}</Text>
        </Box>
      )}

      {status === "select-orgs" && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Organizations:</Text>
          {orgs.slice(0, 20).map((org, i) => (
            <Text key={i}>
              {i === cursorIndex ? ">" : " "} [
              {selectedOrgIndices.has(i) ? (accessible ? "x" : "●") : " "}] {org.name ?? org.login}
            </Text>
          ))}
          <Box marginTop={1}>
            <Text dimColor>[Space] toggle • [A] select all • [Enter] confirm • [Q] quit</Text>
          </Box>
        </Box>
      )}

      {status === "select-repos" && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Repositories ({repos.length}):</Text>
          {repos
            .slice(Math.max(0, cursorIndex - 10), Math.min(repos.length, cursorIndex + 10))
            .map((repo, i) => {
              const actualIndex = Math.max(0, cursorIndex - 10) + i;
              return (
                <Text key={actualIndex}>
                  {actualIndex === cursorIndex ? ">" : " "} [
                  {selectedRepoIndices.has(actualIndex) ? (accessible ? "x" : "●") : " "}]{" "}
                  {repo.fullName}
                </Text>
              );
            })}
          <Box marginTop={1}>
            <Text dimColor>[Space] toggle • [A] select all • [Enter] confirm • [Q] quit</Text>
          </Box>
        </Box>
      )}

      {status === "processing" && (
        <Box marginTop={1} flexDirection="column">
          <Text>Processing repositories...</Text>
          <Text>{processingMessage}</Text>
          <Text>
            Progress: {currentRepoIndex + 1}/{Array.from(selectedRepoIndices).length}
          </Text>
        </Box>
      )}

      {status === "complete" && (
        <Box marginTop={1} flexDirection="column">
          <Text color="green">{accessible ? "OK" : "✓"} Complete!</Text>
          <Text>Total repositories: {results.length}</Text>
          <Text>Successful: {results.filter((r) => !r.error).length}</Text>
          <Text>Failed: {results.filter((r) => r.error).length}</Text>
        </Box>
      )}
    </Box>
  );
}
