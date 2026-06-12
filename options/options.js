/**
 * @file options.js
 * @description Dashboard orchestration for T&C Lens.
 */

import {
  analyze,
  estimateCost,
  getProviders,
  listAvailableModels,
  prepareTextForAI,
} from "../lib/ai-client.js";
import { parse } from "../lib/parser.js";
import {
  clearHistory,
  getHistory,
  getLatestAnalysisForUrl,
  getSettings,
  saveAnalysis,
  saveSettings,
} from "../lib/storage.js";

const providers = getProviders();
const state = {
  settings: null,
  targetTab: null,
  targetTabId: null,
};

const el = {};

/* ─── Bootstrap ──────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();
  populateProviderOptions();
  await loadInitialState();
});

/* ─── Element binding ────────────────────────────────────────── */

function bindElements() {
  el.views = Array.from(document.querySelectorAll(".view"));
  el.viewButtons = Array.from(document.querySelectorAll("[data-view-button]"));

  // Dashboard
  el.dashboardMessage = document.getElementById("dashboard-message");
  el.targetStatus = document.getElementById("target-status");
  el.targetTitle = document.getElementById("target-title");
  el.targetUrl = document.getElementById("target-url");
  el.apiStatus = document.getElementById("api-status");
  el.providerName = document.getElementById("provider-name");
  el.providerStatus = document.getElementById("provider-status");
  el.lastAnalysis = document.getElementById("last-analysis");
  el.analyzeButton = document.getElementById("btn-analyze");
  el.openSettingsBtn = document.getElementById("btn-open-settings");

  // Analysis
  el.backDashboardBtn = document.getElementById("btn-back-dashboard");
  el.reanalyzeBtn = document.getElementById("btn-reanalyze");
  el.analysisResults = document.getElementById("analysis-results");

  // Settings
  el.settingsForm = document.getElementById("settings-form");
  el.providerSelect = document.getElementById("provider-select");
  el.modelSelect = document.getElementById("model-select");
  el.refreshModelsBtn = document.getElementById("btn-refresh-models");
  el.apiKeyInput = document.getElementById("api-key-input");
  el.costEstimate = document.getElementById("cost-estimate");
  el.settingsMessage = document.getElementById("settings-message");
  el.historyList = document.getElementById("history-list");
  el.clearHistoryBtn = document.getElementById("btn-clear-history");

  // Loading
  el.loadingOverlay = document.getElementById("loading-overlay");
  el.loadingMessage = document.getElementById("loading-message");
}

/* ─── Event wiring ───────────────────────────────────────────── */

function bindEvents() {
  for (const btn of el.viewButtons) {
    btn.addEventListener("click", () => showView(btn.dataset.viewButton));
  }

  el.openSettingsBtn.addEventListener("click", () => showView("settings-view"));
  el.backDashboardBtn.addEventListener("click", () =>
    showView("dashboard-view"),
  );
  el.reanalyzeBtn.addEventListener("click", () => {
    showView("dashboard-view");
    analyzeCurrentPage();
  });

  el.analyzeButton.addEventListener("click", analyzeCurrentPage);

  el.providerSelect.addEventListener("change", () => {
    handleProviderChange();
    updateCostEstimate();
  });
  el.modelSelect.addEventListener("change", updateCostEstimate);
  el.apiKeyInput.addEventListener("input", updateCostEstimate);

  el.refreshModelsBtn.addEventListener("click", refreshAvailableModels);
  el.settingsForm.addEventListener("submit", handleSettingsSubmit);
  el.clearHistoryBtn.addEventListener("click", handleClearHistory);
}

/* ─── Initial load ───────────────────────────────────────────── */

async function loadInitialState() {
  state.settings = await getSettings();
  applySettingsToForm(state.settings);
  state.settings = { ...state.settings, model: el.modelSelect.value };

  const stored = await chrome.storage.local.get("targetTabId");
  state.targetTabId = stored.targetTabId;
  state.targetTab = await getTargetTab(state.targetTabId);

  await renderDashboard();
  updateCostEstimate();
  await renderHistory();
}

/* ─── Provider / model selects ───────────────────────────────── */

function populateProviderOptions() {
  el.providerSelect.innerHTML = Object.entries(providers)
    .map(
      ([id, p]) =>
        `<option value="${escapeHTML(id)}">${escapeHTML(p.name)}</option>`,
    )
    .join("");
}

function populateModelOptions(providerId, selectedModel) {
  const provider = providers[providerId] || providers.gemini;
  el.modelSelect.innerHTML = provider.models
    .map(
      (m) =>
        `<option value="${escapeHTML(m.id)}">${escapeHTML(m.name)}</option>`,
    )
    .join("");

  const has = provider.models.some((m) => m.id === selectedModel);
  el.modelSelect.value = has ? selectedModel : provider.models[0].id;
}

function applySettingsToForm(settings) {
  el.providerSelect.value = settings.provider;
  populateModelOptions(settings.provider, settings.model);
  el.apiKeyInput.value = settings.apiKey || "";
}

function handleProviderChange() {
  const provider = providers[el.providerSelect.value];
  populateModelOptions(el.providerSelect.value, provider.models[0].id);
}

function updateCostEstimate() {
  const provider = el.providerSelect.value;
  const model = el.modelSelect.value;
  const hasKey = Boolean(el.apiKeyInput.value.trim());

  if (!hasKey) {
    el.costEstimate.textContent = "";
    return;
  }

  const cost = estimateCost("", provider, model);
  if (!cost) {
    el.costEstimate.textContent = "";
    return;
  }

  if (cost.totalCost === 0) {
    el.costEstimate.textContent = "free tier";
  } else {
    el.costEstimate.textContent = `~$${cost.totalCost.toFixed(4)} / analysis`;
  }
}

/* ─── Model refresh ──────────────────────────────────────────── */

async function refreshAvailableModels() {
  const providerId = el.providerSelect.value;
  const apiKey = el.apiKeyInput.value.trim();

  if (!apiKey) {
    showMessage(
      el.settingsMessage,
      "Enter your API key before refreshing models.",
      "error",
    );
    return;
  }

  el.refreshModelsBtn.textContent = "Fetching…";
  el.refreshModelsBtn.disabled = true;

  try {
    const models = await listAvailableModels(providerId, apiKey);
    if (models.length === 0)
      throw new Error("No compatible models returned for this key.");

    providers[providerId].models = models;
    populateModelOptions(providerId, el.modelSelect.value);
    showMessage(
      el.settingsMessage,
      `${models.length} models loaded.`,
      "success",
    );
  } catch (error) {
    showMessage(el.settingsMessage, getUserMessage(error), "error");
  } finally {
    el.refreshModelsBtn.disabled = false;
    el.refreshModelsBtn.textContent = "Refresh available models";
  }
}

/* ─── Settings form ──────────────────────────────────────────── */

async function handleSettingsSubmit(event) {
  event.preventDefault();

  state.settings = await saveSettings({
    provider: el.providerSelect.value,
    model: el.modelSelect.value,
    apiKey: el.apiKeyInput.value.trim(),
  });

  showMessage(el.settingsMessage, "Saved.", "success");
  await renderDashboard();
}

/* ─── Dashboard rendering ────────────────────────────────────── */

/**
 * Renders the initial dashboard view.
 * Evaluates the current active tab and API key status to determine
 * whether the "Analyze This Page" button should be enabled.
 */
async function renderDashboard() {
  renderTargetCell();
  renderProviderCell();
  await renderLastAnalysis();
}

function renderTargetCell() {
  if (!state.targetTab) {
    el.targetStatus.className = "status-dot status-dot--danger";
    el.targetTitle.textContent = "No page selected";
    el.targetUrl.textContent =
      "Go to a Terms or Privacy page and click the extension icon.";
    el.analyzeButton.disabled = true;
    return;
  }

  el.targetStatus.className = "status-dot status-dot--ok";
  el.targetTitle.textContent = state.targetTab.title || "Untitled page";
  el.targetUrl.textContent = state.targetTab.url || "";
  el.analyzeButton.disabled = false;
}

function renderProviderCell() {
  const provider = providers[state.settings.provider];
  const hasKey = Boolean(state.settings.apiKey?.trim());
  const name = provider?.name || state.settings.provider;

  el.providerName.textContent = name;
  el.apiStatus.className = hasKey
    ? "status-dot status-dot--ok"
    : "status-dot status-dot--warn";
  el.providerStatus.textContent = hasKey
    ? `${el.modelSelect.value || state.settings.model}`
    : "No API key — go to Settings.";
}

async function renderLastAnalysis() {
  if (!state.targetTab?.url) {
    el.lastAnalysis.textContent = "";
    return;
  }

  const latest = await getLatestAnalysisForUrl(state.targetTab.url);
  el.lastAnalysis.textContent = latest
    ? `Last run ${formatDate(latest.analyzedAt)} · score ${latest.risk_score}`
    : "";
}

/* ─── Analysis flow ──────────────────────────────────────────── */

/**
 * Main orchestration function for analyzing a page.
 * 1. Validates API key and target tab.
 * 2. Injects scraper into the target tab and extracts text.
 * 3. Truncates text if necessary and calls the AI provider.
 * 4. Parses the response, saves to history, and updates the UI.
 */
async function analyzeCurrentPage() {
  hideMessage(el.dashboardMessage);

  if (!state.settings.apiKey?.trim()) {
    showMessage(
      el.dashboardMessage,
      "Add your API key in Settings first.",
      "error",
    );
    showView("settings-view");
    return;
  }

  state.targetTab = await getTargetTab(state.targetTabId);
  if (!state.targetTab) {
    renderTargetCell();
    showMessage(
      el.dashboardMessage,
      "That page has been closed. Re-open it and click the extension icon again.",
      "error",
    );
    return;
  }

  try {
    setLoading("Extracting page content…");

    await sendBg({ type: "INJECT_SCRAPER", tabId: state.targetTabId });
    const extraction = await sendBg({
      type: "EXTRACT_PAGE_TEXT",
      tabId: state.targetTabId,
    });
    const text = (extraction.text || "").trim();

    if (!text) throw new Error("Could not extract text from this page.");

    const prepared = prepareTextForAI(text, getModelLimit(state.settings));

    setLoading("Analyzing with AI…");

    const raw = await analyze(prepared.text, state.settings);
    const analysis = parse(raw);

    hideLoading();

    if (analysis.is_terms === false) {
      showMessage(el.dashboardMessage, analysis.message, "error");
      showView("dashboard-view");
      return;
    }

    const entry = await saveAnalysis({
      ...analysis,
      url: state.targetTab.url,
      title: state.targetTab.title || "Untitled page",
      domain: getDomain(state.targetTab.url),
      analyzedAt: Date.now(),
      wasTruncated: prepared.wasTruncated,
    });

    await sendBg({
      type: "SET_BADGE",
      tabId: state.targetTabId,
      score: analysis.risk_score,
    });

    renderAnalysis(entry);
    document.getElementById("btn-export").onclick = () => exportAnalysis(entry);
    await renderDashboard();
    await renderHistory();
    showView("analysis-view");
  } catch (error) {
    hideLoading();
    showMessage(el.dashboardMessage, getUserMessage(error), "error");
    showView("dashboard-view");
  }
}

/* ─── Analysis rendering ─────────────────────────────────────── */

/**
 * Renders a completed AI analysis to the DOM.
 * Generates the HTML for the score, summary, and findings list,
 * and wires up the interactive "Copy" and "Export" buttons.
 *
 * @param {Object} analysis - The parsed analysis object to render.
 */
function renderAnalysis(analysis) {
  const riskLevel = getRiskLevel(analysis.risk_score);
  const findings = analysis.findings.map(renderFinding).join("");

  const truncationNotice = analysis.wasTruncated
    ? `<div class="truncation-notice">Document was too long — only the first portion was analyzed.</div>`
    : "";

  el.analysisResults.innerHTML = `
    <div class="analysis-header">
      <div class="score-block">
        <div class="score-number">${analysis.risk_score}</div>
        <div class="score-label">${riskLevel} risk</div>
        <div class="score-bar">
          <div class="score-bar-fill" style="width:${analysis.risk_score}%"></div>
        </div>
      </div>
      <div class="analysis-meta">
        <div class="analysis-title">${escapeHTML(analysis.title || analysis.domain || "Analysis")}</div>
        <p class="analysis-summary">${escapeHTML(analysis.summary)}</p>
        ${truncationNotice}
      </div>
    </div>
    <div class="findings-list">${findings}</div>
  `;

  // Wire copy buttons on quotes
  for (const btn of el.analysisResults.querySelectorAll("[data-copy]")) {
    btn.addEventListener("click", async (e) => {
      const text = btn.dataset.copy;
      await copyToClipboard(text);
      const original = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    });
  }
}

function renderFinding(finding) {
  const quoteHtml = finding.quote
    ? `<blockquote class="finding-quote">
        <span class="finding-quote-text">${escapeHTML(finding.quote)}</span>
        <button class="btn-copy" data-copy="${escapeHTML(finding.quote)}" title="Copy quote">Copy</button>
       </blockquote>`
    : "";

  return `
    <article class="finding">
      <div class="finding-header">
        <h2 class="finding-title">${escapeHTML(finding.title)}</h2>
        <span class="importance-tag importance-tag--${escapeHTML(finding.importance)}">${escapeHTML(finding.importance)}</span>
      </div>
      <p class="finding-description">${escapeHTML(finding.description)}</p>
      ${quoteHtml}
    </article>
  `;
}

/* ─── History ────────────────────────────────────────────────── */

async function renderHistory() {
  const history = await getHistory();

  if (history.length === 0) {
    el.historyList.innerHTML = `<p class="history-empty">No analyses yet.</p>`;
    return;
  }

  el.historyList.innerHTML = history
    .map(
      (entry) => `
    <div class="history-item" data-history-id="${escapeHTML(entry.id)}">
      <div class="history-item-info">
        <div class="history-item-title">${escapeHTML(entry.title || entry.domain || entry.url)}</div>
        <div class="history-item-meta">${escapeHTML(entry.domain || "")} · ${formatDate(entry.analyzedAt)}</div>
      </div>
      <span class="history-item-score">${entry.risk_score}</span>
    </div>
  `,
    )
    .join("");

  for (const item of el.historyList.querySelectorAll("[data-history-id]")) {
    item.addEventListener("click", () =>
      openHistoryEntry(item.dataset.historyId, history),
    );
  }
}

function openHistoryEntry(id, history) {
  const entry = history.find((item) => item.id === id);
  if (!entry) return;
  renderAnalysis(entry);
  document.getElementById("btn-export").onclick = () => exportAnalysis(entry);
  showView("analysis-view");
}

async function handleClearHistory() {
  if (!confirm("Clear all saved analyses?")) return;
  await clearHistory();
  await renderHistory();
  renderDashboard();
}

/* ─── View switching ─────────────────────────────────────────── */

function showView(viewId) {
  for (const view of el.views) {
    view.classList.toggle("hidden", view.id !== viewId);
  }
  for (const btn of el.viewButtons) {
    btn.classList.toggle(
      "nav-button--active",
      btn.dataset.viewButton === viewId,
    );
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

/* ─── Loading ────────────────────────────────────────────────── */

function setLoading(message) {
  el.loadingMessage.textContent = message;
  el.loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  el.loadingOverlay.classList.add("hidden");
}

/* ─── Messages ───────────────────────────────────────────────── */

function showMessage(element, message, type) {
  element.textContent = message;
  element.className = type === "error" ? "message message--error" : "message";
}

function hideMessage(element) {
  element.textContent = "";
  element.className = "message hidden";
}

/* ─── Chrome messaging ───────────────────────────────────────── */

async function sendBg(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || response.success === false || response.error) {
    throw new Error(response?.error || "Extension message failed.");
  }
  return response;
}

/* ─── Tab helpers ────────────────────────────────────────────── */

async function getTargetTab(tabId) {
  if (!Number.isInteger(tabId)) return null;
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

/* ─── Model limit ────────────────────────────────────────────── */

function getModelLimit(settings) {
  const provider = providers[settings.provider];
  const model = provider?.models.find((m) => m.id === settings.model);

  if (provider?.analysisMaxInputTokens) return provider.analysisMaxInputTokens;
  if (model?.analysisMaxInputTokens) return model.analysisMaxInputTokens;
  if (!model) return 8000;

  // Cap at 8,000 tokens to prevent massive API credit drain.
  // 8k tokens ≈ 32,000 characters, enough for the vast majority of T&Cs.
  return Math.min(8000, Math.floor(model.maxTokens * 0.25));
}

/* ─── Utilities ──────────────────────────────────────────────── */

function getRiskLevel(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function getUserMessage(error) {
  const messages = {
    NO_API_KEY: "Add your API key in Settings first.",
    INVALID_PROVIDER: "Invalid AI provider selected.",
    INVALID_KEY: "API key rejected — check Settings.",
    RATE_LIMITED: "Rate limit reached. Wait a moment and try again.",
    NETWORK_ERROR: "Could not reach the AI service. Check your connection.",
    TIMEOUT: "The AI took too long to respond. Try again.",
    RESPONSE_ERROR: error.message,
  };

  if (error.message?.startsWith("PARSE_ERROR")) {
    return "Unexpected response from the AI. Try again.";
  }

  return messages[error.code] || error.message || "Something went wrong.";
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error("Failed to copy text: ", err);
  }
}

function exportAnalysis(analysis) {
  const lines = [
    `T&C Lens Analysis: ${analysis.title || analysis.domain}`,
    `URL: ${analysis.url}`,
    `Date: ${formatDate(analysis.analyzedAt)}`,
    `Risk Score: ${analysis.risk_score} (${getRiskLevel(analysis.risk_score)})`,
    "",
    `Summary: ${analysis.summary}`,
    "",
    "Findings:",
    ...analysis.findings.map((f, i) =>
      [
        `${i + 1}. ${f.title} [${f.importance.toUpperCase()} RISK]`,
        `   ${f.description}`,
        f.quote ? `   Quote: "${f.quote}"` : "",
      ]
        .filter(Boolean)
        .join("\\n"),
    ),
  ];

  const blob = new Blob([lines.join("\\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `tc-lens-analysis-${analysis.domain || "export"}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
