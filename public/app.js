import { bootstrapSession } from "./shared/session-ui.js";
import { getJournalLibrary, getSourceRegistry, getCurrentUser } from "./shared/storage.js";
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

function toggleTimeFields() {
  const showRange = timeModeField.value === "range";
  fromDateWrapper.classList.toggle("is-hidden", !showRange);
  toDateWrapper.classList.toggle("is-hidden", !showRange);
}

function renderChips(target, values, format) {
  const container = document.querySelector(target);
  container.innerHTML = "";

  if (!values || values.length === 0) {
    container.innerHTML = `<span class="chip is-muted">None</span>`;
    return;
  }

  values.forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = format ? format(value) : value;
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
    const matchedTopics = paper.matchedTopics.length > 0
      ? paper.matchedTopics.map((topic) => `<span class="chip">${topic}</span>`).join("")
      : `<span class="chip is-muted">Journal-only match</span>`;

    card.innerHTML = `
      <div class="paper-topline">
        <span>${paper.journal}</span>
        <span>${paper.publishedAt || "Date unavailable"}</span>
        <span>${paper.sourceLabel}</span>
      </div>
      <h4>${paper.title}</h4>
      <p class="muted">${authors}</p>
      <p>${abstract}</p>
      <div class="chips">${matchedTopics}</div>
      <div class="paper-footer">
        <span class="score-pill">Score ${paper.score.toFixed(1)}</span>
        ${paper.url ? `<a href="${paper.url}" target="_blank" rel="noreferrer">Open paper</a>` : ""}
      </div>
    `;
    paperGrid.appendChild(card);
  });
}

function renderDigestHeader(user) {
  const library = getJournalLibrary(user);
  const subscribedJournals = library.filter((journal) => user.preferences.subscribedJournalIds.includes(journal.id));
  paperCount.textContent = "0";
  journalCount.textContent = String(subscribedJournals.length);
  topicCount.textContent = String(user.preferences.topics.length);
  renderChips("#journal-chips", subscribedJournals, (journal) => journal.title);
  renderChips("#topic-chips", user.preferences.topics);

  const sources = Object.values(getSourceRegistry()).filter((source) => user.preferences.sources[source.id]);
  renderChips("#source-chips", sources, (source) => `${source.label} · ${source.status}`);
}

function getFilters() {
  return {
    timeMode: timeModeField.value,
    fromDate: fromDateField.value,
    toDate: toDateField.value
  };
}

async function refreshDigest() {
  if (!activeUser) {
    return;
  }

  loadingState.classList.remove("is-hidden");
  warningBanner.classList.add("is-hidden");
  paperGrid.innerHTML = "";
  emptyState.classList.add("is-hidden");
  digestStatus.textContent = "Searching your sources...";

  try {
    const result = await loadDailyDigest({
      user: activeUser,
      filters: getFilters()
    });

    paperCount.textContent = String(result.papers.length);
    digestStatus.textContent = `Updated ${result.updatedAtLabel}. ${result.papers.length} papers across ${result.journalsUsed} journals.`;
    renderPaperCards(result.papers);

    if (result.warnings.length > 0) {
      warningBanner.textContent = result.warnings[0];
      warningBanner.classList.remove("is-hidden");
    }
  } catch (error) {
    warningBanner.textContent = error.message;
    warningBanner.classList.remove("is-hidden");
    digestStatus.textContent = "Digest refresh failed.";
    paperGrid.innerHTML = "";
    emptyState.classList.remove("is-hidden");
  } finally {
    loadingState.classList.add("is-hidden");
  }
}

bootstrapSession({
  onAuthenticated(user) {
    activeUser = getCurrentUser() || user;
    renderDigestHeader(activeUser);
    refreshDigest();
  },
  onSignedOut() {
    activeUser = null;
    paperGrid.innerHTML = "";
    paperCount.textContent = "0";
    digestStatus.textContent = "Sign in to load your digest.";
    emptyState.classList.remove("is-hidden");
  }
});

timeModeField.addEventListener("change", toggleTimeFields);
refreshButton.addEventListener("click", refreshDigest);
toggleTimeFields();
