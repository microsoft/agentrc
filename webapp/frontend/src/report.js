/**
 * Report renderer — mirrors the CLI `readiness --html` visual report structure.
 *
 * Sections: Hero → Fix First → AI Tooling → Pillar Performance →
 *           Maturity Model → Pillar Details → Area Breakdown →
 *           (Service Information collapsed)
 */
import { shareReport } from "./api.js";

const LEVEL_NAMES = {
  1: "Functional",
  2: "Documented",
  3: "Standardized",
  4: "Optimized",
  5: "Autonomous"
};
const LEVEL_DESCRIPTIONS = {
  1: "Repo builds, tests run, and basic tooling (linter, lockfile) is in place. AI agents can clone and get started.",
  2: "README, CONTRIBUTING guide, and custom instructions exist. Agents understand project context and conventions.",
  3: "CI/CD, security policies, CODEOWNERS, and observability are configured. Agents operate within well-defined guardrails.",
  4: "MCP servers, custom agents, and AI skills are set up. Agents have deep integration with project-specific tools and workflows.",
  5: "Full AI-native development: agents can independently plan, implement, test, and ship changes with minimal human oversight."
};

const PILLAR_GROUPS = {
  "style-validation": "repo-health",
  "build-system": "repo-health",
  testing: "repo-health",
  documentation: "repo-health",
  "dev-environment": "repo-health",
  "code-quality": "repo-health",
  observability: "repo-health",
  "security-governance": "repo-health",
  "ai-tooling": "ai-setup"
};

const PILLAR_GROUP_LABELS = { "repo-health": "Repo Health", "ai-setup": "AI Setup" };

const AI_ICONS = {
  "custom-instructions": "📝",
  "mcp-config": "🔌",
  "custom-agents": "🤖",
  "copilot-skills": "⚡"
};

// =====================================================================
// Main entry
// =====================================================================

export function renderReport(report, { sharingEnabled = false, shared = false } = {}) {
  const container = document.getElementById("report");
  if (!container) return;
  container.innerHTML = "";

  // Snapshot banner for shared reports
  if (shared) container.appendChild(buildSnapshotBanner(report));

  // Hero
  container.appendChild(buildHero(report));

  // Share button
  if (sharingEnabled) container.appendChild(buildShareButton(report));

  // Fix First
  container.appendChild(buildFixFirst(report));

  // AI Tooling Readiness
  const aiHtml = buildAiToolingHero(report);
  if (aiHtml) container.appendChild(aiHtml);

  // Pillar Performance
  if (report.pillars?.length) container.appendChild(buildPillarPerformance(report));

  // Maturity Model
  container.appendChild(buildMaturityModel(report));

  // Pillar Details (expandable)
  if (report.pillars?.length) container.appendChild(buildPillarDetails(report));

  // Area Breakdown
  if (report.areaReports?.length) container.appendChild(buildAreaBreakdown(report));

  // Service Information (collapsed in footer)
  const svcInfo = buildServiceInfo(report);
  if (svcInfo) {
    const footer = document.querySelector(".footer");
    if (footer) footer.insertBefore(svcInfo, footer.firstChild);
    else container.appendChild(svcInfo);
  }
}

// =====================================================================
// Hero section
// =====================================================================

function buildHero(report) {
  const level = report.achievedLevel || 1;
  const name = LEVEL_NAMES[level] || `Level ${level}`;
  const levelClass = level >= 4 ? "level-high" : level >= 2 ? "level-mid" : "level-low";

  const totalPassed = (report.pillars || []).reduce((s, p) => s + p.passed, 0);
  const totalChecks = (report.pillars || []).reduce((s, p) => s + p.total, 0);

  const nextLevel = (report.levels || []).find((l) => l.level === level + 1);
  let nextHtml = "";
  if (nextLevel && !nextLevel.achieved) {
    const nextName = LEVEL_NAMES[nextLevel.level] || `Level ${nextLevel.level}`;
    const remaining = nextLevel.total - nextLevel.passed;
    nextHtml = `<div class="hero-next">Next: <strong>Level ${nextLevel.level} — ${esc(nextName)}</strong> (${remaining} more check${remaining !== 1 ? "s" : ""} needed)</div>`;
  } else if (level === 5) {
    nextHtml = `<div class="hero-next hero-next-done">✓ Maximum level achieved</div>`;
  }

  const repoLabel = report.repo_name || report.repo_url || "";
  const meta = [];
  if (report.durationMs) meta.push(`${(report.durationMs / 1000).toFixed(1)}s`);
  if (report.isMonorepo) meta.push(`Monorepo (${(report.apps || []).length} apps)`);
  if (report.generatedAt) meta.push(new Date(report.generatedAt).toLocaleString());

  const el = createElement("div", "hero");
  el.innerHTML = `
    <div class="hero-level ${levelClass}">${level}</div>
    <div class="hero-info">
      <div class="hero-name">${report.repo_url && isGitHubUrl(report.repo_url) ? `<a href="${esc(report.repo_url)}" target="_blank" rel="noopener">${esc(repoLabel)}</a>` : esc(repoLabel)}</div>
      <div class="hero-subtitle">Level ${level}: ${esc(name)} — ${totalPassed} of ${totalChecks} checks passing</div>
      ${meta.length ? `<div class="hero-meta">${esc(meta.join(" · "))}</div>` : ""}
      ${nextHtml}
    </div>
  `;
  return el;
}

// =====================================================================
// Fix First section
// =====================================================================

function buildFixFirst(report) {
  const failing = (report.criteria || [])
    .filter((c) => c.status === "fail")
    .sort((a, b) => {
      const iw = { high: 3, medium: 2, low: 1 };
      const ew = { low: 1, medium: 2, high: 3 };
      const d = (iw[b.impact] || 0) - (iw[a.impact] || 0);
      return d !== 0 ? d : (ew[a.effort] || 0) - (ew[b.effort] || 0);
    })
    .slice(0, 5);

  const el = createElement("div", "section fix-first");
  if (failing.length === 0) {
    el.innerHTML = `
      <h2 class="section-title section-title-success">✓ All Checks Passing</h2>
      <p class="muted small">This repository passes all readiness criteria.</p>`;
    return el;
  }

  el.innerHTML = `
    <h2 class="section-title section-title-warn">⚠ Fix First</h2>
    <div class="fix-list">
      ${failing
        .map(
          (c) => `
        <div class="fix-item">
          <div class="fix-icon">✗</div>
          <div class="fix-text">
            <div class="fix-title">${esc(c.title)}</div>
            ${c.reason ? `<div class="fix-reason">${esc(c.reason)}</div>` : ""}
            <div class="fix-badges">
              ${c.impact ? `<span class="fix-badge impact-${c.impact}">${c.impact} impact</span>` : ""}
              ${c.effort ? `<span class="fix-badge effort-${c.effort}">${c.effort} effort</span>` : ""}
            </div>
          </div>
        </div>
      `
        )
        .join("")}
    </div>`;
  return el;
}

// =====================================================================
// AI Tooling Hero
// =====================================================================

function buildAiToolingHero(report) {
  const criteria = (report.criteria || []).filter((c) => c.pillar === "ai-tooling");
  if (criteria.length === 0) return null;

  const passed = criteria.filter((c) => c.status === "pass").length;
  const total = criteria.length;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const scoreClass = pct >= 60 ? "score-high" : pct >= 30 ? "score-medium" : "score-low";
  const scoreLabel =
    pct >= 80
      ? "Excellent"
      : pct >= 60
        ? "Good"
        : pct >= 40
          ? "Fair"
          : pct >= 20
            ? "Getting Started"
            : "Not Started";

  const el = createElement("div", "section ai-hero");
  el.innerHTML = `
    <h2 class="section-title">AI Tooling Readiness</h2>
    <p class="ai-hero-subtitle">How well prepared this repository is for AI-assisted development</p>
    <div class="ai-score-header">
      <div class="ai-score-ring ${scoreClass}">${pct}%</div>
      <div class="ai-score-detail">
        <div class="ai-score-label">${esc(scoreLabel)}</div>
        <div class="ai-score-desc">${passed} of ${total} AI tooling checks passing</div>
      </div>
    </div>
    <div class="ai-criteria-grid">
      ${criteria
        .map((c) => {
          const icon = AI_ICONS[c.id] || "🔧";
          return `
          <div class="ai-criterion">
            <div class="ai-criterion-icon ${c.status}">${c.status === "pass" ? "✓" : "✗"}</div>
            <div class="ai-criterion-text">
              <div class="ai-criterion-title">${icon} ${esc(c.title)}</div>
              <div class="ai-criterion-reason">${c.status === "pass" ? "Detected" : esc(c.reason || "")}</div>
            </div>
          </div>`;
        })
        .join("")}
    </div>`;
  return el;
}

// =====================================================================
// Pillar Performance (progress bars grouped by repo-health / ai-setup)
// =====================================================================

function buildPillarPerformance(report) {
  const el = createElement("div", "section");
  let inner = `<h2 class="section-title">Pillar Performance</h2>`;

  for (const [group, label] of Object.entries(PILLAR_GROUP_LABELS)) {
    const pillars = (report.pillars || []).filter((p) => PILLAR_GROUPS[p.id] === group);
    if (pillars.length === 0) continue;

    inner += `<h3 class="group-label">${esc(label)}</h3><div class="pillar-grid">`;
    for (const p of pillars) {
      const allPass = p.passed === p.total;
      const pct = p.total > 0 ? Math.max((p.passed / p.total) * 100, 2) : 0;
      const cls =
        p.total > 0
          ? p.passed / p.total >= 0.8
            ? "high"
            : p.passed / p.total >= 0.5
              ? "medium"
              : "low"
          : "low";
      inner += `
        <div class="pillar-card${allPass ? " all-passing" : " has-failures"}">
          <div class="pillar-name">${esc(p.name)}</div>
          <div class="pillar-stats">
            <div class="progress-bar"><div class="progress-fill ${cls}" style="width:${pct.toFixed(0)}%"></div></div>
            <span>${allPass ? "All passing" : `${p.passed} of ${p.total}`}</span>
          </div>
        </div>`;
    }
    inner += `</div>`;
  }

  el.innerHTML = inner;
  return el;
}

// =====================================================================
// Maturity Model
// =====================================================================

function buildMaturityModel(report) {
  const level = report.achievedLevel || 1;

  const el = createElement("div", "section");
  el.innerHTML = `
    <h2 class="section-title">Maturity Model</h2>
    <div class="maturity-progress">
      ${[1, 2, 3, 4, 5].map((l) => `<div class="maturity-segment${l < level ? " achieved" : l === level ? " current" : ""}"></div>`).join("")}
    </div>
    <div class="maturity-labels">
      ${[1, 2, 3, 4, 5].map((l) => `<div class="maturity-label${l === level ? " current" : ""}">${l}. ${esc(LEVEL_NAMES[l])}</div>`).join("")}
    </div>
    ${[level, level + 1]
      .filter((l) => l >= 1 && l <= 5)
      .map(
        (l) => `
      <div class="maturity-item${l === level ? " active" : ""}">
        <div class="maturity-header">
          <span class="level-badge level-${l}">${l}</span>
          <span class="maturity-name">${esc(LEVEL_NAMES[l])}</span>
          <span class="maturity-count">${l === level ? "Current" : "Next"}</span>
        </div>
        <div class="maturity-desc">${esc(LEVEL_DESCRIPTIONS[l] || "")}</div>
      </div>
    `
      )
      .join("")}`;
  return el;
}

// =====================================================================
// Pillar Details (expandable per-pillar criterion lists)
// =====================================================================

function buildPillarDetails(report) {
  const el = createElement("div", "section");
  let inner = `<h2 class="section-title">Pillar Details</h2>`;

  if (report.isMonorepo) {
    inner += `<div class="muted small" style="margin-bottom:8px;">Monorepo · ${(report.apps || []).length} apps</div>`;
  }

  inner += `<div class="pillar-details-grid">`;
  for (const pillar of report.pillars || []) {
    const items = (report.criteria || []).filter((c) => c.pillar === pillar.id);
    const allPass = pillar.passed === pillar.total;
    inner += `
      <div class="repo-pillar">
        <details${allPass ? "" : " open"}>
          <summary>
            <span class="repo-pillar-name">${allPass ? "✓ " : ""}${esc(pillar.name)}</span>
            <span class="repo-pillar-value${allPass ? " passing" : ""}">${pillar.passed}/${pillar.total}${allPass ? "" : ` (${Math.round(pillar.passRate * 100)}%)`}</span>
          </summary>
          <div class="pillar-criteria-list">
            ${
              items.length > 0
                ? items
                    .map(
                      (c) => `
              <div class="criterion-row">
                <span class="criterion-row-title">${esc(c.title)}${c.appSummary ? ` <span class="muted small">(${c.appSummary.passed}/${c.appSummary.total} apps)</span>` : ""}${c.areaSummary ? ` <span class="muted small">(${c.areaSummary.passed}/${c.areaSummary.total} areas)</span>` : ""}</span>
                <span class="criterion-status ${c.status}">${c.status === "pass" ? "Pass" : c.status === "fail" ? "Fail" : "Skip"}</span>
              </div>
            `
                    )
                    .join("")
                : `<div class="criterion-row muted">No criteria</div>`
            }
          </div>
        </details>
      </div>`;
  }
  inner += `</div>`;

  // Extras
  if (report.extras?.length) {
    inner += `<h3 class="group-label" style="margin-top:16px;">Bonus Checks</h3><div class="pillar-criteria-list">`;
    for (const e of report.extras) {
      inner += `
        <div class="criterion-row">
          <span class="criterion-row-title">${esc(e.title || e.id)}</span>
          <span class="criterion-status ${e.status}">${e.status === "pass" ? "Pass" : e.status === "fail" ? "Fail" : "Skip"}</span>
        </div>`;
    }
    inner += `</div>`;
  }

  el.innerHTML = inner;
  return el;
}

// =====================================================================
// Area Breakdown
// =====================================================================

function buildAreaBreakdown(report) {
  const el = createElement("div", "section");
  let inner = `
    <h2 class="section-title">Per-Area Breakdown</h2>
    <div class="area-grid">`;

  for (const ar of report.areaReports) {
    const relevant = ar.criteria.filter((c) => c.status !== "skip");
    const passed = relevant.filter((c) => c.status === "pass").length;
    const total = relevant.length;
    const pct = total ? Math.round((passed / total) * 100) : 0;
    const areaName = ar.area?.name || (typeof ar.area === "string" ? ar.area : "Area");
    const sourceLabel = ar.area?.source === "config" ? "config" : "auto";
    const applyTo = ar.area?.applyTo
      ? Array.isArray(ar.area.applyTo)
        ? ar.area.applyTo.join(", ")
        : ar.area.applyTo
      : "";

    inner += `
      <div class="area-item">
        <details>
          <summary>
            <span class="area-name">${esc(areaName)}</span>
            <span class="area-summary">
              <span class="area-source">${esc(sourceLabel)}</span>
              <span class="area-score${pct >= 80 ? " score-good" : pct >= 50 ? " score-mid" : " score-bad"}">${passed}/${total} (${pct}%)</span>
            </span>
          </summary>
          <div class="area-detail">
            ${applyTo ? `<div class="area-apply-to">${esc(applyTo)}</div>` : ""}
            ${ar.criteria
              .map(
                (c) => `
              <div class="criterion-row">
                <span class="criterion-row-title">${esc(c.title)}</span>
                <span class="criterion-status ${c.status}">${c.status === "pass" ? "Pass" : c.status === "fail" ? "Fail" : "Skip"}</span>
              </div>
            `
              )
              .join("")}
          </div>
        </details>
      </div>`;
  }

  inner += `</div>`;
  el.innerHTML = inner;
  return el;
}

// =====================================================================
// Service Information (collapsed)
// =====================================================================

function buildServiceInfo(report) {
  const blocks = [];

  if (report.policies) {
    blocks.push(
      `<div class="svc-block"><h5>Policy Chain</h5><p>${esc((report.policies.chain || []).join(" → "))}</p><p>Criteria count: ${report.policies.criteriaCount ?? "—"}</p></div>`
    );
  }

  if (report.engine?.signals?.length) {
    const rows = report.engine.signals
      .map(
        (s) =>
          `<tr><td>${esc(s.id)}</td><td>${esc(s.label)}</td><td>${esc(s.kind)}</td><td class="status-${s.status}">${esc(s.status)}</td></tr>`
      )
      .join("");
    blocks.push(
      `<div class="svc-block"><h5>Signals (${report.engine.signals.length})</h5><table class="svc-table"><thead><tr><th>ID</th><th>Label</th><th>Kind</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`
    );
  }

  if (report.engine?.policyWarnings?.length) {
    const items = report.engine.policyWarnings
      .map(
        (w) => `<li><strong>[${esc(w.stage)}]</strong> ${esc(w.pluginName)}: ${esc(w.message)}</li>`
      )
      .join("");
    blocks.push(
      `<div class="svc-block"><h5>Policy Warnings (${report.engine.policyWarnings.length})</h5><ul>${items}</ul></div>`
    );
  }

  if (report.engine && typeof report.engine.score === "number") {
    blocks.push(
      `<div class="svc-block"><h5>Engine</h5><p>Score: ${report.engine.score}${report.engine.grade ? ` · Grade: ${esc(report.engine.grade)}` : ""}</p></div>`
    );
  }

  if (!blocks.length) return null;

  const section = document.createElement("details");
  section.className = "service-info";
  section.innerHTML = `<summary>Service Information</summary><div class="service-info-body">${blocks.join("")}</div>`;
  return section;
}

// =====================================================================
// Snapshot banner (shared reports)
// =====================================================================

function buildSnapshotBanner(report) {
  const el = createElement("div", "snapshot-banner");
  const ts = report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "unknown date";
  el.innerHTML = `
    <span class="snapshot-icon">📸</span>
    <span class="snapshot-text">This is a snapshot of the readiness report generated on <strong>${esc(ts)}</strong>. Results may differ if the repository has changed since then.</span>
  `;
  return el;
}

// =====================================================================
// Share button + toast
// =====================================================================

function buildShareButton(report) {
  const wrap = createElement("div", "share-area");
  const btn = document.createElement("button");
  btn.className = "btn btn-secondary";
  btn.textContent = "Share Report";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Sharing…";
    try {
      const { url } = await shareReport(report);
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
      showToast("Link copied to clipboard!");
    } catch (err) {
      showToast(`Share failed: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Share Report";
    }
  });
  wrap.appendChild(btn);
  return wrap;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.hidden = true;
    }, 200);
  }, 3000);
}

// =====================================================================
// Helpers
// =====================================================================

function createElement(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isGitHubUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "github.com";
  } catch {
    return false;
  }
}
