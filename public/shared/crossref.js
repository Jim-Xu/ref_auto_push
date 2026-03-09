import { SOURCE_REGISTRY } from "./catalog.js";
import { getJournalLibrary } from "./storage.js";

const CROSSREF_BASE_URL = "https://api.crossref.org";
const PUBMED_BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const MAX_QUERY_COUNT = 12;
const KEYWORD_LIMIT = 10;
const STOPWORDS = new Set([
  "about", "across", "after", "among", "analysis", "approach", "based", "between", "both", "data",
  "during", "effect", "effects", "from", "have", "into", "journal", "latest", "model", "models",
  "paper", "papers", "recent", "research", "results", "review", "study", "their", "these", "using",
  "with", "without", "within", "that", "this", "were", "which", "into", "over", "under", "than",
  "aerosol", "atmospheric", "using", "simulation"
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function getDateWindow(filters) {
  const today = new Date();
  const toDate = today.toISOString().slice(0, 10);

  if (filters.timeMode === "range") {
    if (!filters.fromDate || !filters.toDate) {
      throw new Error("Range mode requires both a start date and an end date.");
    }

    return {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      label: `${filters.fromDate} to ${filters.toDate}`
    };
  }

  return {
    fromDate: toDate,
    toDate,
    label: "today"
  };
}

function extractPublishedDate(item) {
  const dateParts =
    item["published-print"]?.["date-parts"]?.[0] ||
    item["published-online"]?.["date-parts"]?.[0] ||
    item.issued?.["date-parts"]?.[0];

  if (!Array.isArray(dateParts) || dateParts.length === 0) {
    return "";
  }

  const [year, month = 1, day = 1] = dateParts;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function mapCrossrefPaper(item, journalTitle) {
  const authors = Array.isArray(item.author)
    ? item.author.map((author) => [author.given, author.family].filter(Boolean).join(" ").trim()).filter(Boolean)
    : [];

  return {
    id: item.DOI || item.URL || `${journalTitle}-${item.title?.[0] || crypto.randomUUID()}`,
    doi: item.DOI || "",
    title: Array.isArray(item.title) ? item.title[0] || "Untitled" : "Untitled",
    journal: Array.isArray(item["container-title"]) ? item["container-title"][0] || journalTitle : journalTitle,
    abstract: stripTags(item.abstract || ""),
    authors,
    publishedAt: extractPublishedDate(item),
    url: item.URL || "",
    detectedKeywords: [],
    sourceId: "crossref",
    sourceLabel: SOURCE_REGISTRY.crossref.label,
    score: 0
  };
}

function mapPubMedPaper(summary) {
  const articleIds = Array.isArray(summary.articleids) ? summary.articleids : [];
  const doiEntry = articleIds.find((entry) => entry.idtype === "doi");
  const authors = Array.isArray(summary.authors) ? summary.authors.map((author) => author.name).filter(Boolean) : [];

  return {
    id: `pubmed-${summary.uid}`,
    doi: doiEntry?.value || "",
    title: summary.title || "Untitled",
    journal: summary.fulljournalname || summary.source || "PubMed",
    abstract: "",
    authors,
    publishedAt: summary.pubdate || "",
    url: `https://pubmed.ncbi.nlm.nih.gov/${summary.uid}/`,
    detectedKeywords: [],
    sourceId: "pubmed",
    sourceLabel: SOURCE_REGISTRY.pubmed.label,
    score: 0
  };
}

function rankPaper(paper, toDate) {
  const publicationDate = paper.publishedAt ? new Date(paper.publishedAt) : null;
  const latestDate = new Date(toDate);
  const recencyBoost = publicationDate
    ? Math.max(0, 14 - Math.floor((latestDate - publicationDate) / 86400000)) / 10
    : 0;
  const abstractBoost = paper.abstract ? 0.6 : 0;
  const keywordBoost = (paper.detectedKeywords?.length || 0) * 0.8;

  return {
    ...paper,
    score: 2 + recencyBoost + abstractBoost + keywordBoost
  };
}

function dedupePapers(papers) {
  const seen = new Set();
  return papers.filter((paper) => {
    const key = paper.doi || paper.url || `${paper.title}:${paper.journal}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchJson(url) {
  let response;

  try {
    response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });
  } catch (error) {
    throw new Error(`Network request failed: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

function buildJournalQueryUrl(journal, dateWindow) {
  const url = journal.issn
    ? new URL(`${CROSSREF_BASE_URL}/journals/${encodeURIComponent(journal.issn)}/works`)
    : new URL(`${CROSSREF_BASE_URL}/works`);

  url.searchParams.set("filter", `from-pub-date:${dateWindow.fromDate},until-pub-date:${dateWindow.toDate},type:journal-article`);
  url.searchParams.set("rows", "8");
  url.searchParams.set("sort", "published");
  url.searchParams.set("order", "desc");
  url.searchParams.set("select", "DOI,title,URL,abstract,published-print,published-online,issued,container-title,author");

  if (!journal.issn) {
    url.searchParams.set("query.container-title", journal.title);
  }

  return url;
}

export async function searchCrossrefJournals(term) {
  const cleaned = term.trim();
  if (!cleaned) {
    return [];
  }

  const url = new URL(`${CROSSREF_BASE_URL}/journals`);
  url.searchParams.set("query", cleaned);
  url.searchParams.set("rows", "10");

  const payload = await fetchJson(url);
  const items = Array.isArray(payload.message?.items) ? payload.message.items : [];

  return items.map((item) => ({
    title: item.title || "Untitled journal",
    issn: Array.isArray(item.ISSN) ? item.ISSN[0] || "" : "",
    source: "crossref"
  }));
}

function buildPubMedTerm(journal, dateWindow) {
  return `("${journal.title}"[jour]) AND ("${dateWindow.fromDate}"[Date - Publication] : "${dateWindow.toDate}"[Date - Publication])`;
}

function buildPubMedSearchUrl(term) {
  const url = new URL(`${PUBMED_BASE_URL}/esearch.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("sort", "pub_date");
  url.searchParams.set("retmax", "6");
  url.searchParams.set("term", term);
  return url;
}

function buildPubMedSummaryUrl(ids) {
  const url = new URL(`${PUBMED_BASE_URL}/esummary.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("id", ids.join(","));
  return url;
}

async function loadPubMedPapers({ subscribedJournals, dateWindow }) {
  const papers = [];
  const warnings = [];

  for (const journal of subscribedJournals.slice(0, 6)) {
    try {
      const searchPayload = await fetchJson(buildPubMedSearchUrl(buildPubMedTerm(journal, dateWindow)));
      const ids = Array.isArray(searchPayload.esearchresult?.idlist) ? searchPayload.esearchresult.idlist : [];

      if (ids.length === 0) {
        continue;
      }

      const summaryPayload = await fetchJson(buildPubMedSummaryUrl(ids.slice(0, 6)));
      const summaries = ids
        .map((id) => summaryPayload.result?.[id])
        .filter(Boolean)
        .map((summary) => mapPubMedPaper(summary));

      papers.push(...summaries);
    } catch (error) {
      warnings.push(`PubMed · ${journal.title}: ${error.message}`);
    }
  }

  return { papers, warnings };
}

function collectCandidateTerms(text) {
  const tokens = normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
  const candidates = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];

    if (current) {
      candidates.push(current);
    }

    if (current && next && next.length >= 4 && !STOPWORDS.has(next)) {
      candidates.push(`${current} ${next}`);
    }
  }

  return candidates;
}

function toKeywordLabel(term) {
  return term
    .split(" ")
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

function deriveKeywordSummary(papers) {
  const frequencyMap = new Map();

  papers.forEach((paper) => {
    const blob = `${paper.title} ${paper.abstract}`;
    collectCandidateTerms(blob).forEach((term) => {
      frequencyMap.set(term, (frequencyMap.get(term) || 0) + 1);
    });
  });

  return Array.from(frequencyMap.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, KEYWORD_LIMIT)
    .map(([term, count]) => ({
      key: term,
      label: toKeywordLabel(term),
      count
    }));
}

function attachDetectedKeywords(papers, keywordSummary) {
  return papers.map((paper) => {
    const blob = normalizeText(`${paper.title} ${paper.abstract}`);
    return {
      ...paper,
      detectedKeywords: keywordSummary
        .filter((keyword) => blob.includes(keyword.key))
        .map((keyword) => keyword.label)
    };
  });
}

export async function loadDailyDigest({ user, filters }) {
  const library = getJournalLibrary(user);
  const subscribedJournals = library.filter((journal) => user.preferences.subscribedJournalIds.includes(journal.id));
  const enabledSources = user.preferences.sources || {};
  const dateWindow = getDateWindow(filters);
  const warnings = [];
  const papers = [];

  if (subscribedJournals.length === 0) {
    throw new Error("No journals are subscribed yet. Add journals on the Journal Subscriptions page first.");
  }

  if (!Object.values(enabledSources).some(Boolean)) {
    throw new Error("Enable at least one data source on the Source Settings page.");
  }

  if (enabledSources.crossref) {
    for (const journal of subscribedJournals.slice(0, MAX_QUERY_COUNT)) {
      try {
        const payload = await fetchJson(buildJournalQueryUrl(journal, dateWindow));
        const items = Array.isArray(payload.message?.items) ? payload.message.items : [];
        items.forEach((item) => {
          papers.push(mapCrossrefPaper(item, journal.title));
        });
      } catch (error) {
        warnings.push(`Crossref · ${journal.title}: ${error.message}`);
      }
    }
  }

  if (enabledSources.pubmed) {
    const pubMedResult = await loadPubMedPapers({ subscribedJournals, dateWindow });
    papers.push(...pubMedResult.papers);
    warnings.push(...pubMedResult.warnings);
  }

  if (enabledSources.arxiv) {
    warnings.push("arXiv is currently skipped in journal-first mode because it is not journal-scoped.");
  }

  const dedupedPapers = dedupePapers(papers);
  const keywordSummary = deriveKeywordSummary(dedupedPapers);
  const enrichedPapers = attachDetectedKeywords(dedupedPapers, keywordSummary);
  const rankedPapers = enrichedPapers
    .map((paper) => rankPaper(paper, dateWindow.toDate))
    .sort((left, right) => right.score - left.score)
    .slice(0, 24);

  return {
    updatedAtLabel: `${new Date().toLocaleDateString()} · ${dateWindow.label}`,
    papers: rankedPapers,
    keywordSummary,
    warnings,
    journalsUsed: subscribedJournals.length
  };
}
