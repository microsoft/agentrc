import { PILLAR_GROUPS, PILLAR_GROUP_NAMES, getLevelName, getLevelDescription } from "./readiness";
import type { AreaReadinessReport, PillarGroup, ReadinessReport } from "./readiness";

type VisualReportOptions = {
  reports: Array<{ repo: string; report: ReadinessReport; error?: string }>;
  title?: string;
  generatedAt?: string;
};

export function generateVisualReport(options: VisualReportOptions): string {
  const { reports, title = "Readiness Report", generatedAt = new Date().toISOString() } = options;

  const successfulReports = reports.filter((r) => !r.error);
  const failedReports = reports.filter((r) => r.error);

  const totalRepos = reports.length;
  const successfulRepos = successfulReports.length;
  const avgLevel =
    successfulReports.length > 0
      ? successfulReports.reduce((sum, r) => sum + r.report.achievedLevel, 0) /
        successfulReports.length
      : 0;

  const pillarStats = calculatePillarStats(successfulReports);
  const aiToolingData = calculateAiToolingData(successfulReports);

  return `<!DOCTYPE html>
<html lang="en" data-color-mode="dark" data-dark-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root, [data-theme="dark"], body.vscode-dark {
      --color-canvas-default: #0d1117;
      --color-canvas-subtle: #161b22;
      --color-canvas-inset: #010409;
      --color-border-default: #30363d;
      --color-border-muted: #21262d;
      --color-fg-default: #e6edf3;
      --color-fg-muted: #8b949e;
      --color-fg-subtle: #6e7681;
      --color-accent-fg: #58a6ff;
      --color-accent-emphasis: #1f6feb;
      --color-success-fg: #3fb950;
      --color-success-emphasis: #238636;
      --color-danger-fg: #f85149;
      --color-danger-emphasis: #da3633;
      --color-attention-fg: #d29922;
      --color-done-fg: #a371f7;
    }

    [data-theme="light"], body.vscode-light, body.vscode-high-contrast-light {
      --color-canvas-default: #ffffff;
      --color-canvas-subtle: #f6f8fa;
      --color-canvas-inset: #eff2f5;
      --color-border-default: #d0d7de;
      --color-border-muted: #d8dee4;
      --color-fg-default: #1f2328;
      --color-fg-muted: #656d76;
      --color-fg-subtle: #6e7781;
      --color-accent-fg: #0969da;
      --color-accent-emphasis: #0550ae;
      --color-success-fg: #1a7f37;
      --color-success-emphasis: #116329;
      --color-danger-fg: #cf222e;
      --color-danger-emphasis: #a40e26;
      --color-attention-fg: #9a6700;
      --color-done-fg: #8250df;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
      background: var(--color-canvas-default);
      color: var(--color-fg-default);
      padding: 24px;
      line-height: 1.5;
      font-size: 14px;
    }

    .container { max-width: 1280px; margin: 0 auto; }

    /* Header */
    .header {
      background: var(--color-canvas-subtle);
      border: 1px solid var(--color-border-default);
      padding: 20px 24px;
      border-radius: 6px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-logo { width: 32px; height: 32px; flex-shrink: 0; }
    .header-text h1 { font-size: 20px; font-weight: 600; color: var(--color-fg-default); }
    .header .subtitle { color: var(--color-fg-muted); font-size: 12px; }

    /* Summary Cards (multi-repo) */
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }
    .card {
      background: var(--color-canvas-subtle);
      border: 1px solid var(--color-border-default);
      padding: 16px;
      border-radius: 6px;
    }
    .card-title { font-size: 12px; color: var(--color-fg-muted); font-weight: 500; margin-bottom: 4px; }
    .card-value { font-size: 32px; font-weight: 600; color: var(--color-accent-fg); }
    .card-subtitle { font-size: 12px; color: var(--color-fg-subtle); margin-top: 4px; }

    /* Single-repo Hero */
    .hero {
      background: var(--color-canvas-subtle);
      border: 1px solid var(--color-border-default);
      padding: 24px;
      border-radius: 6px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .hero-level {
      width: 80px; height: 80px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 28px; font-weight: 700; flex-shrink: 0;
    }
    .hero-level.level-high { background: rgba(63,185,80,0.12); border: 2px solid var(--color-success-fg); color: var(--color-success-fg); }
    .hero-level.level-mid { background: rgba(210,153,34,0.12); border: 2px solid var(--color-attention-fg); color: var(--color-attention-fg); }
    .hero-level.level-low { background: rgba(88,166,255,0.12); border: 2px solid var(--color-accent-fg); color: var(--color-accent-fg); }
    .hero-info { flex: 1; }
    .hero-name { font-size: 20px; font-weight: 600; color: var(--color-fg-default); margin-bottom: 2px; }
    .hero-subtitle { color: var(--color-fg-muted); font-size: 14px; }
    .hero-next { margin-top: 8px; font-size: 13px; color: var(--color-fg-subtle); }
    .hero-next strong { color: var(--color-fg-muted); }

    /* Fix First */
    .fix-first {
      background: var(--color-canvas-subtle);
      border: 1px solid var(--color-border-default);
      padding: 24px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    .fix-first .section-title { color: var(--color-attention-fg); }
    .fix-list { display: grid; gap: 8px; }
    .fix-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 6px;
      background: var(--color-canvas-default);
      border: 1px solid var(--color-border-muted);
    }
    .fix-item-icon {
      width: 24px; height: 24px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; flex-shrink: 0; font-weight: 700;
      background: rgba(248,81,73,0.12); color: var(--color-danger-fg);
    }
    .fix-item-text { flex: 1; min-width: 0; }
    .fix-item-title { font-weight: 600; font-size: 13px; color: var(--color-fg-default); }
    .fix-item-reason { font-size: 12px; color: var(--color-fg-muted); margin-top: 2px; }
    .fix-item-badges { display: flex; gap: 6px; margin-top: 4px; }
    .fix-badge {
      font-size: 11px;
      padding: 1px 8px;
      border-radius: 2em;
      border: 1px solid transparent;
    }
    .fix-badge.impact-high { color: var(--color-danger-fg); background: rgba(248,81,73,0.08); border-color: rgba(248,81,73,0.2); }
    .fix-badge.impact-medium { color: var(--color-attention-fg); background: rgba(210,153,34,0.08); border-color: rgba(210,153,34,0.2); }
    .fix-badge.impact-low { color: var(--color-fg-muted); background: rgba(139,148,158,0.08); border-color: rgba(139,148,158,0.15); }
    .fix-badge.effort-low { color: var(--color-success-fg); background: rgba(63,185,80,0.08); border-color: rgba(63,185,80,0.2); }
    .fix-badge.effort-medium { color: var(--color-attention-fg); background: rgba(210,153,34,0.08); border-color: rgba(210,153,34,0.2); }
    .fix-badge.effort-high { color: var(--color-fg-muted); background: rgba(139,148,158,0.08); border-color: rgba(139,148,158,0.15); }

    /* Sections */
    .section {
      background: var(--color-canvas-subtle);
      border: 1px solid var(--color-border-default);
      padding: 24px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--color-fg-default);
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--color-border-muted);
    }

    /* Pillar Grid */
    .pillar-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
    }
    .pillar-card {
      padding: 12px 16px;
      border-radius: 6px;
      background: var(--color-canvas-default);
      border: 1px solid var(--color-border-muted);
    }
    .pillar-card.all-passing {
      opacity: 0.7;
    }
    .pillar-card.has-failures {
      border-color: var(--color-attention-fg);
    }
    .pillar-card.all-passing .pillar-name::before {
      content: '\\2713 ';
      color: var(--color-success-fg);
    }
    .pillar-name { font-size: 13px; font-weight: 600; color: var(--color-fg-default); margin-bottom: 8px; }
    .pillar-stats { display: flex; align-items: center; gap: 12px; }
    .progress-bar { flex: 1; height: 8px; background: var(--color-border-muted); border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
    .progress-fill.low { background: var(--color-danger-fg); }
    .progress-fill.medium { background: var(--color-attention-fg); }
    .progress-fill.high { background: var(--color-success-fg); }
    .pillar-stats span { font-size: 12px; color: var(--color-fg-muted); white-space: nowrap; }

    /* Repo List */
    .repo-list { display: grid; gap: 12px; }
    .repo-item {
      padding: 16px;
      border-radius: 6px;
      background: var(--color-canvas-default);
      border: 1px solid var(--color-border-muted);
    }
    .repo-item.error { border-color: var(--color-danger-emphasis); }
    .repo-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .repo-name { font-size: 16px; font-weight: 600; color: var(--color-accent-fg); }
    .error-message { color: var(--color-danger-fg); font-size: 13px; margin-top: 8px; }

    /* Level Badges */
    .level-badge {
      padding: 2px 10px;
      border-radius: 2em;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid transparent;
    }
    .level-0 { background: rgba(139,148,158,0.1); color: var(--color-fg-muted); border-color: var(--color-border-default); }
    .level-1 { background: rgba(88,166,255,0.12); color: var(--color-accent-fg); border-color: rgba(88,166,255,0.3); }
    .level-2 { background: rgba(121,192,255,0.12); color: #79c0ff; border-color: rgba(121,192,255,0.3); }
    .level-3 { background: rgba(63,185,80,0.12); color: var(--color-success-fg); border-color: rgba(63,185,80,0.3); }
    .level-4 { background: rgba(210,153,34,0.12); color: var(--color-attention-fg); border-color: rgba(210,153,34,0.3); }
    .level-5 { background: rgba(163,113,247,0.12); color: var(--color-done-fg); border-color: rgba(163,113,247,0.3); }

    /* Repo Pillars (expandable) */
    .repo-pillars {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    .repo-pillar {
      background: var(--color-canvas-subtle);
      border: 1px solid var(--color-border-muted);
      border-radius: 6px;
      font-size: 13px;
      overflow: hidden;
    }
    .repo-pillar details { cursor: pointer; }
    .repo-pillar summary {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      list-style: none;
      user-select: none;
    }
    .repo-pillar summary::-webkit-details-marker { display: none; }
    .repo-pillar summary::before {
      content: '\\25B8';
      color: var(--color-fg-subtle);
      margin-right: 6px;
      font-size: 10px;
    }
    .repo-pillar details[open] summary::before { content: '\\25BE'; }
    .repo-pillar summary:hover { background: rgba(177,186,196,0.04); }
    .repo-pillar-name { color: var(--color-fg-muted); }
    .repo-pillar-value { font-weight: 600; color: var(--color-fg-default); font-size: 12px; }
    .pillar-criteria-list { padding: 4px 12px 8px; border-top: 1px solid var(--color-border-muted); }
    .criterion-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 12px;
      color: var(--color-fg-muted);
    }
    .criterion-row + .criterion-row { border-top: 1px solid rgba(33,38,45,0.5); }
    .criterion-status {
      font-size: 12px;
      font-weight: 500;
      padding: 1px 8px;
      border-radius: 2em;
      border: 1px solid transparent;
    }
    .criterion-status.pass { color: var(--color-success-fg); background: rgba(63,185,80,0.1); border-color: rgba(63,185,80,0.2); }
    .criterion-status.fail { color: var(--color-danger-fg); background: rgba(248,81,73,0.1); border-color: rgba(248,81,73,0.2); }
    .criterion-status.skip { color: var(--color-fg-muted); background: rgba(139,148,158,0.08); border-color: rgba(139,148,158,0.15); }

    /* Level Distribution */
    .level-distribution { display: flex; gap: 12px; margin: 8px 0 16px; align-items: flex-end; }
    .level-bar {
      flex: 1;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      min-height: 160px;
    }
    .level-bar-count { font-size: 14px; font-weight: 600; color: var(--color-accent-fg); margin-bottom: 4px; }
    .level-bar-fill {
      width: 100%;
      background: linear-gradient(180deg, var(--color-accent-fg), var(--color-accent-emphasis));
      border-radius: 6px 6px 0 0;
      transition: height 0.3s ease;
    }
    .level-bar-fill.empty { background: var(--color-border-muted); height: 3px !important; border-radius: 3px; }
    .level-bar-label { margin-top: 8px; font-size: 11px; color: var(--color-fg-muted); font-weight: 500; }

    /* Maturity Model */
    .maturity-descriptions { display: grid; gap: 8px; }
    .maturity-item {
      padding: 10px 14px;
      border-radius: 6px;
      background: var(--color-canvas-default);
      border: 1px solid var(--color-border-muted);
    }
    .maturity-item.has-repos { border-color: var(--color-accent-fg); }
    .maturity-header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .maturity-name { font-size: 14px; font-weight: 600; color: var(--color-fg-default); }
    .maturity-count { margin-left: auto; font-size: 12px; color: var(--color-fg-muted); }
    .maturity-desc { font-size: 12px; color: var(--color-fg-muted); line-height: 1.5; }

    /* AI Hero */
    .ai-hero {
      background: var(--color-canvas-subtle);
      border: 1px solid var(--color-border-default);
      padding: 24px;
      border-radius: 6px;
      margin-bottom: 16px;
      position: relative;
      overflow: hidden;
    }
    .ai-hero::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--color-accent-fg), var(--color-done-fg), var(--color-success-fg));
    }
    .ai-hero .section-title { color: var(--color-fg-default); }
    .ai-hero-subtitle { color: var(--color-fg-muted); font-size: 13px; margin-bottom: 16px; }
    .ai-score-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
    .ai-score-ring {
      width: 72px; height: 72px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 700; flex-shrink: 0;
    }
    .ai-score-ring.score-high { background: rgba(63,185,80,0.1); border: 2px solid var(--color-success-fg); color: var(--color-success-fg); }
    .ai-score-ring.score-medium { background: rgba(210,153,34,0.1); border: 2px solid var(--color-attention-fg); color: var(--color-attention-fg); }
    .ai-score-ring.score-low { background: rgba(248,81,73,0.1); border: 2px solid var(--color-danger-fg); color: var(--color-danger-fg); }
    .ai-score-detail { flex: 1; }
    .ai-score-label { font-size: 16px; font-weight: 600; color: var(--color-fg-default); margin-bottom: 2px; }
    .ai-score-desc { color: var(--color-fg-muted); font-size: 13px; }
    .ai-criteria-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px; }
    .ai-criterion {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 6px;
      background: var(--color-canvas-default);
      border: 1px solid var(--color-border-muted);
      transition: border-color 0.15s;
    }
    .ai-criterion:hover { border-color: var(--color-border-default); }
    .ai-criterion-icon {
      width: 28px; height: 28px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; flex-shrink: 0; font-weight: 700;
    }
    .ai-criterion-icon.pass { background: rgba(63,185,80,0.12); color: var(--color-success-fg); }
    .ai-criterion-icon.fail { background: rgba(248,81,73,0.12); color: var(--color-danger-fg); }
    .ai-criterion-text { flex: 1; min-width: 0; }
    .ai-criterion-title { font-weight: 600; font-size: 13px; color: var(--color-fg-default); }
    .ai-criterion-reason { font-size: 12px; color: var(--color-fg-muted); margin-top: 1px; }

    /* Footer */
    .footer {
      text-align: center;
      color: var(--color-fg-subtle);
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--color-border-muted);
      font-size: 12px;
    }
    .footer a { color: var(--color-accent-fg); text-decoration: none; }
    .footer a:hover { text-decoration: underline; }

    /* Compact Maturity Progress */
    .maturity-progress {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
      align-items: stretch;
      height: 8px;
    }
    .maturity-segment {
      flex: 1;
      border-radius: 4px;
      background: var(--color-border-muted);
      position: relative;
    }
    .maturity-segment.achieved { background: var(--color-accent-fg); }
    .maturity-segment.current { background: var(--color-accent-fg); box-shadow: 0 0 0 2px var(--color-accent-emphasis); }

    .maturity-labels {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
    }
    .maturity-label {
      flex: 1;
      text-align: center;
      font-size: 11px;
      color: var(--color-fg-subtle);
    }
    .maturity-label.current { color: var(--color-accent-fg); font-weight: 600; }

    /* Theme Toggle */
    .theme-toggle {
      margin-left: auto;
      background: var(--color-canvas-default);
      border: 1px solid var(--color-border-default);
      border-radius: 6px;
      padding: 4px 12px;
      cursor: pointer;
      color: var(--color-fg-muted);
      font-size: 12px;
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: border-color 0.15s;
    }
    .theme-toggle:hover {
      border-color: var(--color-accent-fg);
      color: var(--color-fg-default);
    }
    .theme-toggle-icon { font-size: 14px; }

    @media (max-width: 768px) {
      body { padding: 16px; }
      .summary-cards { grid-template-columns: 1fr; }
      .pillar-grid { grid-template-columns: 1fr; }
      .ai-criteria-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <svg class="header-logo" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.26-1.24-.55-1.49 1.81-.2 3.71-.89 3.71-4 0-.88-.31-1.61-.82-2.17.08-.2.36-1.02-.08-2.13 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.93-.08 2.13-.51.56-.82 1.28-.82 2.17 0 3.07 1.87 3.75 3.65 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
      </svg>
      <div class="header-text">
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">Generated ${new Date(generatedAt).toLocaleString()}</p>
      </div>
      <button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme">
        <span class="theme-toggle-icon" id="theme-icon">&#9789;</span>
        <span id="theme-label">Light</span>
      </button>
    </div>

    ${successfulReports.length === 1 ? buildSingleRepoHero(successfulReports[0]) : buildMultiRepoSummary(totalRepos, successfulRepos, failedReports.length, avgLevel)}

    ${
      successfulReports.length > 0
        ? `
    ${buildFixFirstHtml(successfulReports)}

    ${buildAiToolingHeroHtml(aiToolingData, successfulReports)}

    <div class="section">
      <h2 class="section-title">Pillar Performance</h2>
      ${buildGroupedPillarsHtml(pillarStats)}
    </div>

    ${buildCompactMaturityHtml(successfulReports)}
    `
        : ""
    }

    <div class="section">
      <h2 class="section-title">${successfulReports.length === 1 ? "Pillar Details" : "Repository Details"}</h2>
      <div class="repo-list">
        ${reports
          .map(({ repo, report, error }) => {
            if (error) {
              return `
              <div class="repo-item error">
                <div class="repo-header">
                  <div class="repo-name">${escapeHtml(repo)}</div>
                  <span class="level-badge level-0">Error</span>
                </div>
                <div class="error-message">${escapeHtml(error)}</div>
              </div>
            `;
            }

            return `
            <div class="repo-item">
              ${
                successfulReports.length > 1
                  ? `
              <div class="repo-header">
                <div class="repo-name">${escapeHtml(repo)}</div>
                <div class="level-badge level-${report.achievedLevel}">
                  Level ${report.achievedLevel}: ${getLevelName(report.achievedLevel)}
                </div>
              </div>`
                  : ""
              }
              ${report.isMonorepo ? `<div style="color: var(--color-fg-muted); font-size: 12px; margin-bottom: 8px;">Monorepo &middot; ${report.apps.length} apps</div>` : ""}
              <div class="repo-pillars">
                ${report.pillars
                  .map((pillar) => {
                    const pillarCriteria = report.criteria.filter((c) => c.pillar === pillar.id);
                    const allPass = pillar.passed === pillar.total;
                    return `
                  <div class="repo-pillar">
                    <details${allPass ? "" : " open"}>
                      <summary>
                        <span class="repo-pillar-name">${allPass ? "&#10003; " : ""}${escapeHtml(pillar.name)}</span>
                        <span class="repo-pillar-value" style="${allPass ? "color: var(--color-success-fg);" : ""}">${pillar.passed}/${pillar.total}${allPass ? "" : ` (${Math.round(pillar.passRate * 100)}%)`}</span>
                      </summary>
                      <div class="pillar-criteria-list">
                        ${pillarCriteria
                          .map(
                            (c) => `
                          <div class="criterion-row">
                            <span>${escapeHtml(c.title)}</span>
                            <span class="criterion-status ${c.status}">${c.status === "pass" ? "Pass" : c.status === "fail" ? "Fail" : "Skip"}</span>
                          </div>
                        `
                          )
                          .join("")}
                        ${pillarCriteria.length === 0 ? '<div class="criterion-row" style="color: var(--color-fg-subtle);">No criteria</div>' : ""}
                      </div>
                    </details>
                  </div>
                `;
                  })
                  .join("")}
              </div>
              ${buildAreaReportsHtml(report.areaReports)}
            </div>
          `;
          })
          .join("")}
      </div>
    </div>

    ${
      failedReports.length > 0
        ? `
    <div class="section">
      <h2 class="section-title">Failed Repositories</h2>
      <div class="repo-list">
        ${failedReports
          .map(
            ({ repo, error }) => `
          <div class="repo-item error">
            <div class="repo-name">${escapeHtml(repo)}</div>
            <div class="error-message">${escapeHtml(error || "Unknown error")}</div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
    `
        : ""
    }

    <div class="footer">
      <p>Generated with <a href="https://github.com/microsoft/agentrc">AgentRC</a> &middot; Readiness Tool</p>
    </div>
  </div>
  <script>
    function getPreferredTheme() {
      // In VS Code webviews, body classes are injected automatically
      if (document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light')) return 'light';
      if (document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')) return 'dark';
      const stored = localStorage.getItem('agentrc-report-theme');
      if (stored) return stored;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      const icon = document.getElementById('theme-icon');
      const label = document.getElementById('theme-label');
      if (icon) icon.innerHTML = theme === 'dark' ? '&#9789;' : '&#9788;';
      if (label) label.textContent = theme === 'dark' ? 'Light' : 'Dark';
    }
    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('agentrc-report-theme', next);
      applyTheme(next);
    }
    applyTheme(getPreferredTheme());
  </script>
</body>
</html>`;
}

// ── Helper Functions ──────────────────────────────────────────────────

function buildSingleRepoHero(entry: { repo: string; report: ReadinessReport }): string {
  const { repo, report } = entry;
  const level = report.achievedLevel;
  const name = getLevelName(level);
  const levelClass = level >= 4 ? "level-high" : level >= 2 ? "level-mid" : "level-low";

  const nextLevel = report.levels.find((l) => l.level === level + 1);
  let nextHtml = "";
  if (nextLevel && !nextLevel.achieved) {
    const nextName = getLevelName(nextLevel.level);
    const remaining = nextLevel.total - nextLevel.passed;
    nextHtml = `<div class="hero-next">Next: <strong>Level ${nextLevel.level} — ${nextName}</strong> (${remaining} more check${remaining !== 1 ? "s" : ""} needed)</div>`;
  } else if (level === 5) {
    nextHtml = `<div class="hero-next" style="color: var(--color-success-fg);">&#10003; Maximum level achieved</div>`;
  }

  const totalPassed = report.pillars.reduce((s, p) => s + p.passed, 0);
  const totalChecks = report.pillars.reduce((s, p) => s + p.total, 0);

  return `
    <div class="hero">
      <div class="hero-level ${levelClass}">${level}</div>
      <div class="hero-info">
        <div class="hero-name">${escapeHtml(repo)}</div>
        <div class="hero-subtitle">Level ${level}: ${name} — ${totalPassed} of ${totalChecks} checks passing</div>
        ${nextHtml}
      </div>
    </div>
  `;
}

function buildMultiRepoSummary(
  totalRepos: number,
  successfulRepos: number,
  failedCount: number,
  avgLevel: number
): string {
  return `
    <div class="summary-cards">
      <div class="card">
        <div class="card-title">Repositories</div>
        <div class="card-value">${totalRepos}</div>
        <div class="card-subtitle">${successfulRepos} analyzed successfully</div>
      </div>
      <div class="card">
        <div class="card-title">Avg Maturity</div>
        <div class="card-value">${avgLevel.toFixed(1)}</div>
        <div class="card-subtitle">${getLevelName(Math.round(avgLevel))}</div>
      </div>
      <div class="card">
        <div class="card-title">Success Rate</div>
        <div class="card-value">${totalRepos > 0 ? Math.round((successfulRepos / totalRepos) * 100) : 0}%</div>
        <div class="card-subtitle">${failedCount > 0 ? failedCount + " failed" : "All succeeded"}</div>
      </div>
    </div>
  `;
}

function buildFixFirstHtml(reports: Array<{ repo: string; report: ReadinessReport }>): string {
  // Collect all failing criteria across repos, deduplicate by id
  const failMap = new Map<string, { criterion: ReadinessReport["criteria"][0]; repos: string[] }>();
  for (const { repo, report } of reports) {
    for (const c of report.criteria) {
      if (c.status !== "fail") continue;
      const existing = failMap.get(c.id);
      if (existing) {
        existing.repos.push(repo);
      } else {
        failMap.set(c.id, { criterion: c, repos: [repo] });
      }
    }
  }

  const sorted = Array.from(failMap.values())
    .sort((a, b) => {
      const impactWeight = { high: 3, medium: 2, low: 1 };
      const effortWeight = { low: 1, medium: 2, high: 3 };
      const delta = impactWeight[b.criterion.impact] - impactWeight[a.criterion.impact];
      if (delta !== 0) return delta;
      return effortWeight[a.criterion.effort] - effortWeight[b.criterion.effort];
    })
    .slice(0, 5);

  if (sorted.length === 0) {
    return `
      <div class="section" style="border-color: var(--color-success-emphasis);">
        <h2 class="section-title" style="color: var(--color-success-fg);">&#10003; All Checks Passing</h2>
        <p style="color: var(--color-fg-muted); font-size: 13px;">This repository passes all readiness criteria.</p>
      </div>
    `;
  }

  const multiRepo = reports.length > 1;
  return `
    <div class="fix-first">
      <h2 class="section-title">&#9888; Fix First</h2>
      <div class="fix-list">
        ${sorted
          .map(
            ({ criterion: c, repos }) => `
          <div class="fix-item">
            <div class="fix-item-icon">&#10007;</div>
            <div class="fix-item-text">
              <div class="fix-item-title">${escapeHtml(c.title)}</div>
              ${c.reason ? `<div class="fix-item-reason">${escapeHtml(c.reason)}</div>` : ""}
              <div class="fix-item-badges">
                <span class="fix-badge impact-${c.impact}">${c.impact} impact</span>
                <span class="fix-badge effort-${c.effort}">${c.effort} effort</span>
                ${multiRepo ? `<span class="fix-badge impact-low">${repos.length} repo${repos.length > 1 ? "s" : ""}</span>` : ""}
              </div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function buildCompactMaturityHtml(
  reports: Array<{ repo: string; report: ReadinessReport }>
): string {
  const level =
    reports.length === 1
      ? reports[0].report.achievedLevel
      : Math.floor(reports.reduce((s, r) => s + r.report.achievedLevel, 0) / reports.length);

  return `
    <div class="section">
      <h2 class="section-title">Maturity Model</h2>
      <div class="maturity-progress">
        ${[1, 2, 3, 4, 5]
          .map(
            (l) =>
              `<div class="maturity-segment${l < level ? " achieved" : l === level ? " current" : ""}"></div>`
          )
          .join("")}
      </div>
      <div class="maturity-labels">
        ${[1, 2, 3, 4, 5]
          .map(
            (l) =>
              `<div class="maturity-label${l === level ? " current" : ""}">${l}. ${getLevelName(l)}</div>`
          )
          .join("")}
      </div>
      ${[level, level + 1]
        .filter((l) => l >= 1 && l <= 5)
        .map(
          (l) => `
        <div class="maturity-item${l === level ? " has-repos" : ""}">
          <div class="maturity-header">
            <span class="level-badge level-${l}">${l}</span>
            <span class="maturity-name">${getLevelName(l)}</span>
            ${l === level ? '<span class="maturity-count" style="color: var(--color-accent-fg);">Current</span>' : '<span class="maturity-count">Next</span>'}
          </div>
          <div class="maturity-desc">${getLevelDescription(l)}</div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function calculatePillarStats(reports: Array<{ repo: string; report: ReadinessReport }>): Array<{
  id: string;
  name: string;
  passed: number;
  total: number;
  passRate: number;
}> {
  const pillarMap = new Map<string, { name: string; passed: number; total: number }>();

  for (const { report } of reports) {
    for (const pillar of report.pillars) {
      const existing = pillarMap.get(pillar.id);
      if (existing) {
        existing.passed += pillar.passed;
        existing.total += pillar.total;
      } else {
        pillarMap.set(pillar.id, {
          name: pillar.name,
          passed: pillar.passed,
          total: pillar.total
        });
      }
    }
  }

  return Array.from(pillarMap.entries()).map(([id, stats]) => ({
    id,
    name: stats.name,
    passed: stats.passed,
    total: stats.total,
    passRate: stats.total > 0 ? stats.passed / stats.total : 0
  }));
}

function getProgressClass(passRate: number): string {
  if (passRate >= 0.8) return "high";
  if (passRate >= 0.5) return "medium";
  return "low";
}

// ── AI Tooling Hero ───────────────────────────────────────────────────

type AiToolingCriterionSummary = {
  id: string;
  title: string;
  passCount: number;
  totalRepos: number;
  status: "pass" | "fail";
  evidence: string[];
  reason: string;
};

type AiToolingData = {
  criteria: AiToolingCriterionSummary[];
  passed: number;
  total: number;
  passRate: number;
};

function calculateAiToolingData(
  reports: Array<{ repo: string; report: ReadinessReport }>
): AiToolingData {
  const criterionMap = new Map<string, AiToolingCriterionSummary>();

  for (const { report } of reports) {
    const aiCriteria = report.criteria.filter((c) => c.pillar === "ai-tooling");
    for (const c of aiCriteria) {
      const existing = criterionMap.get(c.id);
      if (existing) {
        existing.totalRepos += 1;
        if (c.status === "pass") existing.passCount += 1;
        if (c.evidence) existing.evidence.push(...c.evidence);
      } else {
        criterionMap.set(c.id, {
          id: c.id,
          title: c.title,
          passCount: c.status === "pass" ? 1 : 0,
          totalRepos: 1,
          status: c.status === "pass" ? "pass" : "fail",
          evidence: c.evidence ? [...c.evidence] : [],
          reason: c.reason || ""
        });
      }
    }
  }

  const criteria = Array.from(criterionMap.values()).map((c) => ({
    ...c,
    status: (c.passCount / c.totalRepos >= 0.5 ? "pass" : "fail") as "pass" | "fail",
    evidence: [...new Set(c.evidence)]
  }));

  const passed = criteria.filter((c) => c.status === "pass").length;
  return {
    criteria,
    passed,
    total: criteria.length,
    passRate: criteria.length > 0 ? passed / criteria.length : 0
  };
}

function getAiScoreClass(passRate: number): string {
  if (passRate >= 0.6) return "score-high";
  if (passRate >= 0.3) return "score-medium";
  return "score-low";
}

function getAiScoreLabel(passRate: number): string {
  if (passRate >= 0.8) return "Excellent";
  if (passRate >= 0.6) return "Good";
  if (passRate >= 0.4) return "Fair";
  if (passRate >= 0.2) return "Getting Started";
  return "Not Started";
}

function getAiCriterionIcon(id: string): string {
  const icons: Record<string, string> = {
    "custom-instructions": "&#128221;",
    "mcp-config": "&#128268;",
    "custom-agents": "&#129302;",
    "copilot-skills": "&#9889;"
  };
  return icons[id] || "&#128295;";
}

function buildAiToolingHeroHtml(
  data: AiToolingData,
  reports: Array<{ repo: string; report: ReadinessReport }>
): string {
  if (data.criteria.length === 0) return "";

  const pct = Math.round(data.passRate * 100);
  const scoreClass = getAiScoreClass(data.passRate);
  const scoreLabel = getAiScoreLabel(data.passRate);

  const multiRepo = reports.length > 1;
  const perRepoHtml = multiRepo
    ? `
    <div style="margin-top: 16px; border-top: 1px solid var(--color-border-muted); padding-top: 12px;">
      <div style="font-size: 12px; font-weight: 600; color: var(--color-fg-muted); margin-bottom: 8px;">Per Repository</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px;">
        ${reports
          .map(({ repo, report }) => {
            const aiPillar = report.pillars.find((p) => p.id === "ai-tooling");
            const repoPct = aiPillar ? Math.round(aiPillar.passRate * 100) : 0;
            const repoPass = aiPillar?.passed ?? 0;
            const repoTotal = aiPillar?.total ?? 0;
            return `<div style="display: flex; justify-content: space-between; padding: 6px 10px; background: var(--color-canvas-default); border: 1px solid var(--color-border-muted); border-radius: 6px; font-size: 12px;">
            <span style="color: var(--color-accent-fg);">${escapeHtml(repo)}</span>
            <span style="font-weight: 600; color: ${repoPct >= 60 ? "var(--color-success-fg)" : repoPct >= 30 ? "var(--color-attention-fg)" : "var(--color-danger-fg)"};">${repoPass}/${repoTotal} (${repoPct}%)</span>
          </div>`;
          })
          .join("")}
      </div>
    </div>
  `
    : "";

  return `
    <div class="ai-hero">
      <h2 class="section-title">AI Tooling Readiness</h2>
      <p class="ai-hero-subtitle">How well prepared ${multiRepo ? "your repositories are" : "this repository is"} for AI-assisted development</p>

      <div class="ai-score-header">
        <div class="ai-score-ring ${scoreClass}">${pct}%</div>
        <div class="ai-score-detail">
          <div class="ai-score-label">${scoreLabel}</div>
          <div class="ai-score-desc">${data.passed} of ${data.total} AI tooling checks passing${multiRepo ? ` across ${reports.length} repositories` : ""}</div>
        </div>
      </div>

      <div class="ai-criteria-grid">
        ${data.criteria
          .map(
            (c) => `
          <div class="ai-criterion">
            <div class="ai-criterion-icon ${c.status}">
              ${c.status === "pass" ? "&#10003;" : "&#10007;"}
            </div>
            <div class="ai-criterion-text">
              <div class="ai-criterion-title">${getAiCriterionIcon(c.id)} ${escapeHtml(c.title)}</div>
              <div class="ai-criterion-reason">${
                c.status === "pass"
                  ? multiRepo
                    ? `${c.passCount}/${c.totalRepos} repos`
                    : "Detected"
                  : escapeHtml(c.reason)
              }</div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
      ${perRepoHtml}
    </div>
  `;
}

function buildGroupedPillarsHtml(
  pillarStats: Array<{ id: string; name: string; passed: number; total: number; passRate: number }>
): string {
  const groups: PillarGroup[] = ["repo-health", "ai-setup"];
  return groups
    .map((group) => {
      const pillars = pillarStats.filter(
        (p) => PILLAR_GROUPS[p.id as keyof typeof PILLAR_GROUPS] === group
      );
      if (pillars.length === 0) return "";
      return `
        <h3 style="font-size: 13px; font-weight: 600; color: var(--color-fg-muted); margin-bottom: 8px; margin-top: 12px;">${escapeHtml(PILLAR_GROUP_NAMES[group])}</h3>
        <div class="pillar-grid">
          ${pillars
            .map((pillar) => {
              const allPass = pillar.passed === pillar.total;
              return `
            <div class="pillar-card${allPass ? " all-passing" : " has-failures"}">
              <div class="pillar-name">${escapeHtml(pillar.name)}</div>
              <div class="pillar-stats">
                <div class="progress-bar">
                  <div class="progress-fill ${getProgressClass(pillar.passRate)}" style="width: ${Math.max(pillar.passRate * 100, pillar.total > 0 ? 2 : 0)}%"></div>
                </div>
                <span>${allPass ? "All passing" : `${pillar.passed} of ${pillar.total}`}</span>
              </div>
            </div>
          `;
            })
            .join("")}
        </div>
      `;
    })
    .join("");
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function buildAreaReportsHtml(areaReports?: AreaReadinessReport[]): string {
  if (!areaReports?.length) return "";

  return `
    <div style="margin-top: 16px; border-top: 1px solid var(--color-border-muted); padding-top: 12px;">
      <div style="font-size: 12px; font-weight: 600; color: var(--color-fg-muted); margin-bottom: 8px;">Per-Area Breakdown</div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px;">
        ${areaReports
          .map((ar) => {
            const relevant = ar.criteria.filter((c) => c.status !== "skip");
            const passed = relevant.filter((c) => c.status === "pass").length;
            const total = relevant.length;
            const pct = total ? Math.round((passed / total) * 100) : 0;
            const sourceLabel = ar.area.source === "config" ? "config" : "auto";
            const applyTo = Array.isArray(ar.area.applyTo)
              ? ar.area.applyTo.join(", ")
              : ar.area.applyTo;

            return `
          <div style="background: var(--color-canvas-default); border: 1px solid var(--color-border-muted); border-radius: 6px; overflow: hidden;">
            <details>
              <summary style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; cursor: pointer; list-style: none; user-select: none;">
                <span style="font-weight: 600; font-size: 13px; color: var(--color-fg-default);">${escapeHtml(ar.area.name)}</span>
                <span style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 10px; padding: 1px 6px; border-radius: 2em; background: rgba(139,148,158,0.08); color: var(--color-fg-subtle); border: 1px solid var(--color-border-muted);">${sourceLabel}</span>
                  <span style="font-weight: 600; font-size: 12px; color: ${pct >= 80 ? "var(--color-success-fg)" : pct >= 50 ? "var(--color-attention-fg)" : "var(--color-danger-fg)"};">${passed}/${total} (${pct}%)</span>
                </span>
              </summary>
              <div style="padding: 4px 12px 8px; border-top: 1px solid var(--color-border-muted);">
                <div style="font-size: 11px; color: var(--color-fg-subtle); margin-bottom: 6px;">${escapeHtml(applyTo)}</div>
                ${ar.criteria
                  .map(
                    (c) => `
                  <div class="criterion-row">
                    <span>${escapeHtml(c.title)}</span>
                    <span class="criterion-status ${c.status}">${c.status === "pass" ? "Pass" : c.status === "fail" ? "Fail" : "Skip"}</span>
                  </div>
                `
                  )
                  .join("")}
              </div>
            </details>
          </div>
        `;
          })
          .join("")}
      </div>
    </div>
  `;
}
