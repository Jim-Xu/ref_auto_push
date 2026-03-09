import { bootstrapSession } from "./shared/session-ui.js";
import { addCustomJournal, getCurrentUser, getJournalLibrary, getSourceRegistry, toggleJournalSubscription } from "./shared/storage.js";
import { searchCrossrefJournals } from "./shared/crossref.js";

const journalTable = document.querySelector("#journal-table");
const remoteResults = document.querySelector("#remote-results");
const journalStatus = document.querySelector("#journal-status");
const resultsBanner = document.querySelector("#journal-results-banner");
const searchForm = document.querySelector("#journal-search-form");
const searchField = document.querySelector("#journal-search");

let activeUser = null;

function renderSourcePill(sourceId) {
  const registry = getSourceRegistry();
  const source = registry[sourceId] || { label: sourceId, status: "planned" };
  const className = source.status === "live" ? "source-pill" : "source-pill is-planned";
  return `<span class="${className}">${source.label}</span>`;
}

function renderLibrary() {
  const library = getJournalLibrary(activeUser);
  const filterTerm = searchField.value.trim().toLowerCase();
  const filtered = library.filter((journal) => {
    const blob = `${journal.title} ${journal.issn}`.toLowerCase();
    return !filterTerm || blob.includes(filterTerm);
  });

  journalTable.innerHTML = "";

  filtered.forEach((journal) => {
    const row = document.createElement("article");
    row.className = "table-row";
    const checked = activeUser.preferences.subscribedJournalIds.includes(journal.id) ? "checked" : "";
    const seedLabel = journal.seeded ? "Seeded" : "Custom";
    row.innerHTML = `
      <div class="table-primary">
        <input class="table-check" type="checkbox" data-journal-id="${journal.id}" ${checked} />
        <div>
          <div class="table-title">${journal.title}</div>
          <div class="table-meta">
            <span>${journal.issn || "ISSN unavailable"}</span>
            <span>${seedLabel}</span>
            ${renderSourcePill(journal.source)}
          </div>
        </div>
      </div>
    `;
    journalTable.appendChild(row);
  });

  journalTable.querySelectorAll("[data-journal-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      activeUser = toggleJournalSubscription(event.target.dataset.journalId);
      renderLibrary();
    });
  });
}

function renderRemoteResults(results) {
  remoteResults.innerHTML = "";

  if (results.length === 0) {
    remoteResults.innerHTML = `<div class="empty-state">No remote journal results yet.</div>`;
    return;
  }

  results.forEach((journal) => {
    const row = document.createElement("article");
    row.className = "table-row";
    row.innerHTML = `
      <div class="table-primary">
        <div>
          <div class="table-title">${journal.title}</div>
          <div class="table-meta">
            <span>${journal.issn || "ISSN unavailable"}</span>
            ${renderSourcePill(journal.source)}
          </div>
        </div>
      </div>
      <button class="tiny-button" type="button">Add Journal</button>
    `;

    row.querySelector("button").addEventListener("click", () => {
      activeUser = addCustomJournal(journal);
      journalStatus.textContent = `${journal.title} was added to your directory and subscribed.`;
      renderLibrary();
    });

    remoteResults.appendChild(row);
  });
}

bootstrapSession({
  onAuthenticated(user) {
    activeUser = getCurrentUser() || user;
    renderLibrary();
    renderRemoteResults([]);
  },
  onSignedOut() {
    activeUser = null;
    journalTable.innerHTML = "";
    remoteResults.innerHTML = "";
  }
});

searchField.addEventListener("input", () => {
  if (activeUser) {
    renderLibrary();
  }
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  resultsBanner.classList.add("is-hidden");

  try {
    const results = await searchCrossrefJournals(searchField.value);
    renderRemoteResults(results);
    journalStatus.textContent = `${results.length} journal results loaded from Crossref search and title fallback.`;
  } catch (error) {
    resultsBanner.textContent = error.message;
    resultsBanner.classList.remove("is-hidden");
  }
});
