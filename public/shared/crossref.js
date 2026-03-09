import { SOURCE_REGISTRY } from "./catalog.js";
import { getJournalLibrary } from "./storage.js";

const CROSSREF_BASE_URL = "https://api.crossref.org";
const PUBMED_BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const ARXIV_BASE_URL = "https://export.arxiv.org/api/query";
const MAX_QUERY_COUNT = 12;

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

function mapCrossrefPaper(item, journalTitle, matchedTopics) {
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
    matchedTopics,
    sourceId: "crossref",
    sourceLabel: SOURCE_REGISTRY.crossref.label,
    score: 0
  };
}

function rankPaper(paper, topics, toDate) {
  const blob = normalizeText(`${paper.title} ${paper.abstract} ${paper.journal}`);
  const matchedTopics = topics.filter((topic) => blob.includes(normalizeText(topic)));
  const publicationDate = paper.publishedAt ? new Date(paper.publishedAt) : null;
  const latestDate = new Date(toDate);
  const recencyBoost = publicationDate
    ? Math.max(0, 14 - Math.floor((latestDate - publicationDate) / 86400000)) / 10
    : 0;

  return {
    ...paper,
    matchedTopics,
    score: matchedTopics.length * 5 + 2 + recencyBoost
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
    throw new Error(`Crossref request failed: ${response.status}`);
  }

  return response.json();
}

async function fetchText(url) {
  let response;

  try {
    response = await fetch(url.toString());
  } catch (error) {
    throw new Error(`Network request failed: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.text();
}

function buildJournalQueryUrl(journal, topic, dateWindow) {
  const url = journal.issn
    ? new URL(`${CROSSREF_BASE_URL}/journals/${encodeURIComponent(journal.issn)}/works`)
    : new URL(`${CROSSREF_BASE_URL}/works`);

  url.searchParams.set("filter", `from-pub-date:${dateWindow.fromDate},until-pub-date:${dateWindow.toDate},type:journal-article`);
  url.searchParams.set("rows", topic ? "6" : "8");
  url.searchParams.set("sort", "published");
  url.searchParams.set("order", "desc");
  url.searchParams.set("select", "DOI,title,URL,abstract,published-print,published-online,issued,container-title,author");

  if (!journal.issn) {
    url.searchParams.set("query.container-title", journal.title);
  }

  if (topic) {
    url.searchParams.set("query.bibliographic", topic);
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

function buildCrossrefPapers({ subscribedJournals, topics, dateWindow }) {
  const queries = [];
  if (topics.length === 0) {
    subscribedJournals.forEach((journal) => queries.push({ journal, topic: "" }));
  } else {
    subscribedJournals.forEach((journal) => {
      topics.forEach((topic) => queries.push({ journal, topic }));
    });
  }
  return queries.slice(0, MAX_QUERY_COUNT);
}

function buildPubMedTerm(journal, topics, dateWindow) {
  const topicTerm = topics.length > 0
    ? ` AND (${topics.map((topic) => `"${topic}"`).join(" OR ")})`
    : "";

  return `("${journal.title}"[jour])${topicTerm} AND ("${dateWindow.fromDate}"[Date - Publication] : "${dateWindow.toDate}"[Date - Publication])`;
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

function mapPubMedPaper(summary, topics) {
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
    matchedTopics: [],
    sourceId: "pubmed",
    sourceLabel: SOURCE_REGISTRY.pubmed.label,
    score: 0
  };
}

async function loadPubMedPapers({ subscribedJournals, topics, dateWindow }) {
  const papers = [];
  const warnings = [];

  for (const journal of subscribedJournals.slice(0, 6)) {
    try {
      const searchPayload = await fetchJson(buildPubMedSearchUrl(buildPubMedTerm(journal, topics, dateWindow)));
      const ids = Array.isArray(searchPayload.esearchresult?.idlist) ? searchPayload.esearchresult.idlist : [];

      if (ids.length === 0) {
        continue;
      }

      const summaryPayload = await fetchJson(buildPubMedSummaryUrl(ids.slice(0, 6)));
      const summaries = ids
        .map((id) => summaryPayload.result?.[id])
        .filter(Boolean)
        .map((summary) => mapPubMedPaper(summary, topics));

      papers.push(...summaries);
    } catch (error) {
      warnings.push(`PubMed · ${journal.title}: ${error.message}`);
    }
  }

  return { papers, warnings };
}

function buildArxivUrl(topic) {
  const url = new URL(ARXIV_BASE_URL);
  url.searchParams.set("search_query", `all:"${topic}"`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", "6");
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  return url;
}

function getTextFromTag(node, tagName) {
  return node.getElementsByTagName(tagName)?.[0]?.textContent?.trim() || "";
}

function mapArxivPaper(entry, topic) {
  const authors = Array.from(entry.getElementsByTagName("author"))
    .map((authorNode) => authorNode.getElementsByTagName("name")?.[0]?.textContent?.trim() || "")
    .filter(Boolean);
  const links = Array.from(entry.getElementsByTagName("link"));
  const alternateLink = links.find((link) => link.getAttribute("rel") === "alternate") || links[0];

  return {
    id: getTextFromTag(entry, "id") || `arxiv-${crypto.randomUUID()}`,
    doi: "",
    title: getTextFromTag(entry, "title") || "Untitled",
    journal: "arXiv",
    abstract: getTextFromTag(entry, "summary"),
    authors,
    publishedAt: getTextFromTag(entry, "published"),
    url: alternateLink?.getAttribute("href") || "",
    matchedTopics: [topic],
    sourceId: "arxiv",
    sourceLabel: SOURCE_REGISTRY.arxiv.label,
    score: 0
  };
}

async function loadArxivPapers(topics) {
  const papers = [];
  const warnings = [];

  for (const topic of topics.slice(0, 4)) {
    try {
      const xml = await fetchText(buildArxivUrl(topic));
      const parsed = new DOMParser().parseFromString(xml, "application/xml");
      const entries = Array.from(parsed.getElementsByTagName("entry"));
      entries.forEach((entry) => papers.push(mapArxivPaper(entry, topic)));
    } catch (error) {
      warnings.push(`arXiv · ${topic}: ${error.message}`);
    }
  }

  return { papers, warnings };
}

export async function loadDailyDigest({ user, filters }) {
  const library = getJournalLibrary(user);
  const subscribedJournals = library.filter((journal) => user.preferences.subscribedJournalIds.includes(journal.id));
  const topics = user.preferences.topics || [];
  const enabledSources = user.preferences.sources || {};
  const dateWindow = getDateWindow(filters);
  const warnings = [];
  const papers = [];

  if (subscribedJournals.length === 0) {
    throw new Error("No journals are subscribed yet. Add journals on the Journal Subscriptions page first.");
  }

  if (!Object.values(enabledSources).some(Boolean)) {
    throw new Error("Enable at least one data source on the Keyword Subscriptions page.");
  }

  if (enabledSources.crossref) {
    const queries = buildCrossrefPapers({ subscribedJournals, topics, dateWindow });

    for (const query of queries) {
      try {
        const payload = await fetchJson(buildJournalQueryUrl(query.journal, query.topic, dateWindow));
        const items = Array.isArray(payload.message?.items) ? payload.message.items : [];

        items.forEach((item) => {
          papers.push(mapCrossrefPaper(item, query.journal.title, query.topic ? [query.topic] : []));
        });
      } catch (error) {
        warnings.push(`Crossref · ${query.journal.title}: ${error.message}`);
      }
    }
  }

  if (enabledSources.pubmed) {
    const pubMedResult = await loadPubMedPapers({ subscribedJournals, topics, dateWindow });
    papers.push(...pubMedResult.papers);
    warnings.push(...pubMedResult.warnings);
  }

  if (enabledSources.arxiv && topics.length > 0) {
    const arxivResult = await loadArxivPapers(topics);
    papers.push(...arxivResult.papers);
    warnings.push(...arxivResult.warnings);
  }

  const rankedPapers = dedupePapers(papers)
    .map((paper) => rankPaper(paper, topics, dateWindow.toDate))
    .filter((paper) => topics.length === 0 || paper.matchedTopics.length > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 24);

  return {
    updatedAtLabel: `${new Date().toLocaleDateString()} · ${dateWindow.label}`,
    papers: rankedPapers,
    warnings,
    journalsUsed: subscribedJournals.length
  };
}
