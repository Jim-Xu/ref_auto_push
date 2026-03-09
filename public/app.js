const form = document.querySelector("#search-form");
const timePresetField = document.querySelector("#timePreset");
const latestFields = document.querySelector("#latest-fields");
const rangeFields = document.querySelector("#range-fields");
const loadingCard = document.querySelector("#loading");
const resultsWrapper = document.querySelector("#results");
const statusLine = document.querySelector("#status-line");

function toggleTimeFields() {
  const isRange = timePresetField.value === "range";
  latestFields.classList.toggle("is-hidden", isRange);
  rangeFields.classList.toggle("is-hidden", !isRange);
}

function createListItem(text) {
  const li = document.createElement("li");
  li.textContent = text;
  return li;
}

function renderStats(stats, filters) {
  const statsGrid = document.querySelector("#stats-grid");
  const items = [
    { label: "Papers", value: stats.total },
    { label: "Journals", value: stats.journalsCovered },
    { label: "Queries", value: stats.queriesExecuted },
    { label: "Analysis", value: stats.analysisMode }
  ];

  statsGrid.innerHTML = items
    .map(
      (item) => `
        <article class="stat-card">
          <span>${item.label}</span>
          <strong>${item.value}</strong>
          <small>${filters.dateLabel}</small>
        </article>
      `
    )
    .join("");
}

function renderChips(targetSelector, items, formatter) {
  const container = document.querySelector(targetSelector);
  container.innerHTML = "";

  items.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = formatter(item);
    container.appendChild(chip);
  });
}

function renderHighlights(highlights) {
  const container = document.querySelector("#highlights");
  container.innerHTML = "";

  highlights.forEach((item) => {
    const article = document.createElement("article");
    article.className = "highlight-card";
    article.innerHTML = `
      <div class="highlight-topline">
        <span>TOP ${item.rank}</span>
        <span>${item.publishedAt || "Date unavailable"}</span>
      </div>
      <h4>${item.title}</h4>
      <p>${item.journal}</p>
      <p class="muted">${item.rationale}</p>
      ${item.url ? `<a href="${item.url}" target="_blank" rel="noreferrer">Open paper</a>` : ""}
    `;
    container.appendChild(article);
  });
}

function renderArticles(articles) {
  const container = document.querySelector("#articles");
  container.innerHTML = "";

  articles.forEach((article) => {
    const card = document.createElement("article");
    card.className = "article-card";
    const authors = article.authors.length > 0 ? article.authors.join(", ") : "Author metadata unavailable";
    const abstract = article.abstract || "Crossref did not return an abstract. Open the paper link for full details.";
    card.innerHTML = `
      <div class="article-meta">
        <span>${article.journal}</span>
        <span>${article.publishedAt || "Date unavailable"}</span>
        <span>Score ${article.score}</span>
      </div>
      <h4>${article.title}</h4>
      <p class="muted">${authors}</p>
      <p>${abstract}</p>
      <div class="chips inline-chips">
        ${article.matchedKeywords.map((keyword) => `<span class="chip">${keyword}</span>`).join("")}
      </div>
      ${article.url ? `<a href="${article.url}" target="_blank" rel="noreferrer">Open paper</a>` : ""}
    `;
    container.appendChild(card);
  });
}

function renderSummary(summary) {
  document.querySelector("#overview").textContent = summary.overview || "";

  const signals = document.querySelector("#signals");
  signals.innerHTML = "";
  (summary.signals || []).forEach((signal) => signals.appendChild(createListItem(signal)));

  const recommendations = document.querySelector("#recommendations");
  recommendations.innerHTML = "";
  (summary.recommendations || []).forEach((item) => recommendations.appendChild(createListItem(item)));
}

function renderResult(result) {
  const warningText = result.warnings && result.warnings.length > 0 ? ` Warning: ${result.warnings[0]}` : "";
  statusLine.textContent = `Completed: ${result.filters.dateLabel}. Returned ${result.stats.total} papers.${warningText}`;
  renderStats(result.stats, result.filters);
  renderSummary(result.summary);
  renderChips("#themes", result.themes, (item) => `${item.label} · ${item.count}`);
  renderChips("#journal-spread", result.journalSpread, (item) => `${item.journal} · ${item.count}`);
  renderHighlights(result.highlights);
  renderArticles(result.articles);
  resultsWrapper.classList.remove("is-hidden");
}

async function handleSubmit(event) {
  event.preventDefault();
  loadingCard.classList.remove("is-hidden");
  resultsWrapper.classList.add("is-hidden");
  statusLine.textContent = "Request sent. Searching the literature...";

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Search failed.");
    }

    renderResult(result);
  } catch (error) {
    statusLine.textContent = error.message;
  } finally {
    loadingCard.classList.add("is-hidden");
  }
}

timePresetField.addEventListener("change", toggleTimeFields);
form.addEventListener("submit", handleSubmit);
toggleTimeFields();
