/**
 * Main application logic — orchestrates scanning, rendering, and routing.
 */
import { fetchConfig, scanRepo, fetchSharedReport } from "./api.js";
import { renderReport } from "./report.js";
import {
  parseGitHubReference,
  getRepoFromPath,
  getSharedReportId,
  syncRepoPathInBrowser
} from "./repo-location.js";

let appConfig = { sharingEnabled: false, githubTokenProvided: false };
let currentAbortController = null;

document.addEventListener("DOMContentLoaded", async () => {
  initThemeToggle();

  // Fetch runtime config
  try {
    appConfig = await fetchConfig();
  } catch {
    // Continue with defaults
  }

  setupForm();

  // Check for shared report URL
  const reportId = getSharedReportId(window.location.pathname);
  if (reportId) {
    await loadSharedReport(reportId);
    return;
  }

  // Check for auto-scan from URL path or query
  const repoFromPath = getRepoFromPath(window.location.pathname);
  const repoFromQuery = new URLSearchParams(window.location.search).get("repo");
  const autoRepo = repoFromPath || parseGitHubReference(repoFromQuery);

  if (autoRepo) {
    document.getElementById("repo-input").value = autoRepo;
    await executeScan(autoRepo);
  }
});

// Handle browser back/forward
window.addEventListener("popstate", async (e) => {
  if (e.state?.repo) {
    document.getElementById("repo-input").value = e.state.repo;
    await executeScan(e.state.repo);
  }
});

function setupForm() {
  const form = document.getElementById("scan-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("repo-input").value.trim();
    const ref = parseGitHubReference(input);
    if (!ref) {
      showError('Invalid repository. Enter "owner/repo" or a GitHub URL.');
      return;
    }
    await executeScan(ref);
  });

  const dismissBtn = document.getElementById("error-dismiss");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", hideError);
  }
}

async function executeScan(repoRef) {
  // Abort any in-progress scan
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();

  hideError();
  clearReport();
  hideDescription();
  showProgress("Cloning repository…", 15);
  setFormBusy(true);

  try {
    showProgress("Running readiness scan…", 45);

    const report = await scanRepo(repoRef, currentAbortController.signal);

    syncRepoPathInBrowser(repoRef);
    showProgress("Rendering report…", 90);
    renderReport(report, { sharingEnabled: appConfig.sharingEnabled });

    hideProgress();
  } catch (err) {
    if (err.name === "AbortError") return;
    hideProgress();
    showError(err.message || "Scan failed. Please try again.");
  } finally {
    setFormBusy(false);
    currentAbortController = null;
  }
}

async function loadSharedReport(id) {
  hideDescription();
  showProgress("Loading shared report…", 50);
  setFormBusy(true);

  try {
    const report = await fetchSharedReport(id);
    if (!report) {
      hideProgress();
      showError("Shared report not found or has expired.");
      return;
    }
    hideProgress();
    renderReport(report, { sharingEnabled: false, shared: true });

    if (report.repo_name) {
      document.getElementById("repo-input").value = report.repo_name;
    }
  } catch (err) {
    hideProgress();
    showError(err.message || "Failed to load shared report.");
  } finally {
    setFormBusy(false);
  }
}

// ===== UI Helpers =====

function showProgress(text, percent) {
  const area = document.getElementById("progress");
  const fill = document.getElementById("progress-fill");
  const textEl = document.getElementById("progress-text");
  area.hidden = false;
  fill.style.width = `${percent}%`;
  textEl.textContent = text;
}

function hideProgress() {
  const area = document.getElementById("progress");
  area.hidden = true;
  document.getElementById("progress-fill").style.width = "0%";
}

function showError(message) {
  const banner = document.getElementById("error-banner");
  const msg = document.getElementById("error-message");
  banner.hidden = false;
  msg.textContent = message;
}

function hideError() {
  document.getElementById("error-banner").hidden = true;
}

function clearReport() {
  document.getElementById("report").innerHTML = "";
}

function hideDescription() {
  const desc = document.getElementById("scan-description");
  if (desc) desc.classList.add("hidden");
  document.querySelector(".container").classList.add("scanning");
}

function setFormBusy(busy) {
  const btn = document.getElementById("scan-btn");
  const input = document.getElementById("repo-input");
  const label = btn.querySelector(".btn-label");
  const spinner = btn.querySelector(".btn-spinner");

  btn.disabled = busy;
  input.disabled = busy;
  label.textContent = busy ? "Scanning…" : "Scan";
  spinner.style.display = busy ? "inline-block" : "none";
}

// ===== Theme Toggle =====

function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  updateThemeIcon(btn);

  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    document.querySelector('meta[name="theme-color"]').content =
      next === "dark" ? "#0d1117" : "#ffffff";
    updateThemeIcon(btn);
  });
}

function updateThemeIcon(btn) {
  const theme = document.documentElement.getAttribute("data-theme");
  btn.textContent = theme === "dark" ? "☀️" : "🌙";
}
