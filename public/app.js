import { bootstrapSession } from "./shared/session-ui.js";
import { getCurrentUser, getJournalLibrary } from "./shared/storage.js";
import { loadDailyDigest } from "./shared/crossref.js";

const timeModeField = document.querySelector("#time-mode");
const fromDateField = document.querySelector("#from-date");
const toDateField = document.querySelector("#to-date");
const fromDateWrapper = document.querySelector("#from-date-field");
const toDateWrapper = document.querySelector("#to-date-field");
const refreshButton = document.querySelector("#refresh-button");
const digestStatus = document.querySelector("#digest-status");
const paperGrid = document.querySelector("#paper-grid");
const emptyState = document.querySelector("#empty-state");
const loadingState = document.querySelector("#loading-state");
const warningBanner = document.querySelector("#warning-banner");
const paperCount = document.querySelector("#paper-count");
const journalCount = document.querySelector("#journal-count");
const topicCount = document.querySelector("#topic-count");

let activeUser = null;
let digestResult = null;
let activeJournalFilter = null;
let activeKeywordFilter = null;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toggleTimeFields() {
  const showRange = timeModeField.value === "range";
  fromDateWrapper.classList.toggle("is-hidden", !showRange);
  toDateWrapper.classList.toggle("is-hidden", !showRange);
}

function renderChips(target, values, options = {}) {
  const container = document.querySelector(target);
  container.innerHTML = "";

  if (!values || values.length === 0) {
    container.innerHTML = `<span class="chip is-muted">None</span>`;
    return;
  }

  values.forEach((value) => {
    const chip = document.createElement(options.onClick ? "button" : "span");
    chip.className = `chip${options.isActive?.(value) ? " is-active" : ""}`;
    chip.textContent = options.format ? options.format(value) : value;

    if (options.onClick) {
      chip.type = "button";
      chip.addEventListener("click", () => options.onClick(value));
    }

    container.appendChild(chip);
  });
}

function renderPaperCards(papers) {
  paperGrid.innerHTML = "";

  if (papers.length === 0) {
    emptyState.classList.remove("is-hidden");
    return;
  }

  emptyState.classList.add("is-hidden");

  papers.forEach((paper) => {
    const card = document.createElement("article");
    card.className = "paper-card";
    const authors = paper.authors.length > 0 ? paper.authors.join(", ") : "Author metadata unavailable";
    const abstract = paper.abstract || "No abstract available from the selected public source.";
    const detectedKeywords = paper.detectedKeywords.length > 0
      ? paper.detectedKeywords.map((keyword) => `<span class="chip">${keyword}</span>`).join("")
      : `<span class="chip is-muted">No keyword signal</span>`;

    card.innerHTML = `
      <div class="paper-topline">
        <span>${paper.journal}</span>
        <span>${paper.publishedAt || "Date unavailable"}</span>
        <span>${paper.sourceLabel}</span>
      </div>
      <h4>${paper.title}</h4>
      <p class="muted">${authors}</p>
      <p>${abstract}</p>
      <div class="chips">${detectedKeywords}</div>
      <div class="paper-footer">
        <span class="score-pill">Score ${paper.score.toFixed(1)}</span>
        ${paper.url ? `<a href="${paper.url}" target="_blank" rel="noreferrer">Open paper</a>` : ""}
      </div>
    `;

    paperGrid.appendChild(card);
  });
}

function getFilters() {
  return {
    timeMode: timeModeField.value,
    fromDate: fromDateField.value,
    toDate: toDateField.value
  };
}

function renderJournalFilters() {
  const library = getJournalLibrary(activeUser);
  const subscribedJournals = library.filter((journal) => activeUser.preferences.subscribedJournalIds.includes(journal.id));
  journalCount.textContent = String(subscribedJournals.length);

  renderChips("#journal-chips", subscribedJournals, {
    format: (journal) => journal.title,
    isActive: (journal) => activeJournalFilter === journal.id,
    onClick: (journal) => {
      activeJournalFilter = activeJournalFilter === journal.id ? null : journal.id;
      applyFilters();
    }
  });
}

function renderKeywordFilters() {
  renderChips("#topic-chips", digestResult?.keywordSummary || [], {
    format: (keyword) => `${keyword.label} · ${keyword.count}`,
    isActive: (keyword) => activeKeywordFilter === keyword.label,
    onClick: (keyword) => {
      activeKeywordFilter = activeKeywordFilter === keyword.label ? null : keyword.label;
      applyFilters();
    }
  });
}

function doesPaperMatchJournalFilter(paper) {
  if (!activeJournalFilter) {
    return true;
  }

  const library = getJournalLibrary(activeUser);
  const journal = library.find((entry) => entry.id === activeJournalFilter);
  if (!journal) {
    return true;
  }

  const normalizedPaper = normalizeText(paper.journal);
  const normalizedJournal = normalizeText(journal.title);
  return normalizedPaper.includes(normalizedJournal) || normalizedJournal.includes(normalizedPaper);
}

function doesPaperMatchKeywordFilter(paper) {
  if (!activeKeywordFilter) {
    return true;
  }

  return paper.detectedKeywords.includes(activeKeywordFilter);
}

function applyFilters() {
  if (!digestResult || !activeUser) {
    return;
  }

  const filteredPapers = digestResult.papers.filter((paper) => {
    return doesPaperMatchJournalFilter(paper) && doesPaperMatchKeywordFilter(paper);
  });

  paperCount.textContent = String(filteredPapers.length);
  renderJournalFilters();
  renderKeywordFilters();
  renderPaperCards(filteredPapers);
}

function renderDigestHeader() {
  paperCount.textContent = "0";
  topicCount.textContent = digestResult ? String(digestResult.keywordSummary.length) : "0";
  renderJournalFilters();
  renderKeywordFilters();
}

async function refreshDigest() {
  if (!activeUser) {
    return;
  }

  loadingState.classList.remove("is-hidden");
  warningBanner.classList.add("is-hidden");
  paperGrid.innerHTML = "";
  emptyState.classList.add("is-hidden");
  digestStatus.textContent = "Searching your subscribed journals...";

  try {
    const result = await loadDailyDigest({
      user: activeUser,
      filters: getFilters()
    });

    digestResult = result;
    activeJournalFilter = null;
    activeKeywordFilter = null;
    topicCount.textContent = String(result.keywordSummary.length);
    digestStatus.textContent = `Updated ${result.updatedAtLabel}. ${result.papers.length} papers across ${result.journalsUsed} journals. Click Journals or Keywords to filter the queue.`;
    applyFilters();

    if (result.warnings.length > 0) {
      warningBanner.textContent = result.warnings[0];
      warningBanner.classList.remove("is-hidden");
    }
  } catch (error) {
    digestResult = null;
    warningBanner.textContent = error.message;
    warningBanner.classList.remove("is-hidden");
    digestStatus.textContent = "Digest refresh failed.";
    paperGrid.innerHTML = "";
    emptyState.classList.remove("is-hidden");
    renderDigestHeader();
  } finally {
    loadingState.classList.add("is-hidden");
  }
}

bootstrapSession({
  onAuthenticated(user) {
    activeUser = getCurrentUser() || user;
    renderDigestHeader();
    refreshDigest();
  },
  onSignedOut() {
    activeUser = null;
    digestResult = null;
    activeJournalFilter = null;
    activeKeywordFilter = null;
    paperGrid.innerHTML = "";
    paperCount.textContent = "0";
    journalCount.textContent = "0";
    topicCount.textContent = "0";
    renderChips("#journal-chips", []);
    renderChips("#topic-chips", []);
    digestStatus.textContent = "Sign in to load your digest.";
    emptyState.classList.remove("is-hidden");
  }
});

timeModeField.addEventListener("change", toggleTimeFields);
refreshButton.addEventListener("click", refreshDigest);
toggleTimeFields();
