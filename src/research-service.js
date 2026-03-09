const DEFAULT_MAX_RESULTS = 20;
const MAX_QUERY_COUNT = 12;
const CROSSREF_ROWS_PER_QUERY = 20;
const CROSSREF_MAILTO = process.env.CROSSREF_MAILTO || "local-demo@example.com";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const ENGLISH_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "based", "by", "for", "from", "in", "into", "is",
  "of", "on", "or", "the", "to", "using", "with", "without", "via", "after", "before",
  "during", "study", "analysis", "review", "toward", "through", "within", "among", "over",
  "new", "novel", "latest", "journal", "clinical", "research", "approach", "effects",
  "effect", "role", "patient", "patients", "model", "models", "data"
]);

function parseList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

function escapeHtmlTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateParts(dateParts) {
  if (!Array.isArray(dateParts) || dateParts.length === 0) {
    return null;
  }

  const [year, month = 1, day = 1] = dateParts;
  const safeMonth = String(month).padStart(2, "0");
  const safeDay = String(day).padStart(2, "0");
  return `${year}-${safeMonth}-${safeDay}`;
}

function extractPublishedDate(item) {
  const published =
    item["published-print"]?.["date-parts"]?.[0] ||
    item["published-online"]?.["date-parts"]?.[0] ||
    item.issued?.["date-parts"]?.[0];

  return formatDateParts(published);
}

function toTitleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .map((segment) => (segment ? segment[0].toUpperCase() + segment.slice(1) : ""))
    .join(" ");
}

function getDateWindow(filters) {
  const today = new Date();
  const mode = filters.timePreset === "range" ? "range" : "latest";

  if (mode === "range") {
    if (!filters.fromDate || !filters.toDate) {
      throw new Error("Range mode requires both a start date and an end date.");
    }

    return {
      mode,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      label: `${filters.fromDate} to ${filters.toDate}`
    };
  }

  const latestDays = Math.max(1, Math.min(Number(filters.latestDays || 30), 365));
  const fromDateObject = new Date(today);
  fromDateObject.setDate(today.getDate() - latestDays);

  const fromDate = fromDateObject.toISOString().slice(0, 10);
  const toDate = today.toISOString().slice(0, 10);

  return {
    mode,
    fromDate,
    toDate,
    label: `Last ${latestDays} days`
  };
}

function buildQueries(keywords, journals) {
  if (keywords.length === 0) {
    throw new Error("At least one keyword is required.");
  }

  const queries = [];

  if (journals.length === 0) {
    for (const keyword of keywords) {
      queries.push({ keyword, journal: "" });
    }
  } else {
    for (const keyword of keywords) {
      for (const journal of journals) {
        queries.push({ keyword, journal });
      }
    }
  }

  return queries.slice(0, MAX_QUERY_COUNT);
}

function isJournalMatch(articleJournal, journals) {
  if (journals.length === 0) {
    return true;
  }

  const normalizedArticleJournal = normalizeText(articleJournal);
  return journals.some((journal) => {
    const normalizedJournal = normalizeText(journal);
    return normalizedArticleJournal.includes(normalizedJournal) || normalizedJournal.includes(normalizedArticleJournal);
  });
}

function computeKeywordMatches(article, keywords) {
  const searchBlob = normalizeText([article.title, article.abstract, article.journal, article.subjects.join(" ")].join(" "));

  return keywords.filter((keyword) => searchBlob.includes(normalizeText(keyword)));
}

function computeArticleScore(article, journals, keywords, toDate) {
  const matchedKeywords = computeKeywordMatches(article, keywords);
  const journalBoost = journals.length > 0 && isJournalMatch(article.journal, journals) ? 3 : 0;
  const publicationDate = article.publishedAt ? new Date(article.publishedAt) : null;
  const latestDate = new Date(toDate);
  const recencyBoost = publicationDate
    ? Math.max(0, 30 - Math.floor((latestDate - publicationDate) / (1000 * 60 * 60 * 24))) / 10
    : 0;

  return {
    matchedKeywords,
    score: matchedKeywords.length * 4 + journalBoost + recencyBoost
  };
}

async function fetchCrossrefWorks(query, dateWindow) {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("filter", `from-pub-date:${dateWindow.fromDate},until-pub-date:${dateWindow.toDate},type:journal-article`);
  url.searchParams.set("rows", String(CROSSREF_ROWS_PER_QUERY));
  url.searchParams.set("sort", "published");
  url.searchParams.set("order", "desc");
  url.searchParams.set("mailto", CROSSREF_MAILTO);
  url.searchParams.set(
    "select",
    "DOI,title,URL,abstract,published-print,published-online,issued,container-title,author,subject"
  );
  url.searchParams.set("query.bibliographic", query.keyword);

  if (query.journal) {
    url.searchParams.set("query.container-title", query.journal);
  }

  let response;

  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": `ref-auto-push/0.1 (mailto:${CROSSREF_MAILTO})`
      }
    });
  } catch (error) {
    throw new Error(`Crossref network request failed: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Crossref request failed: ${response.status}`);
  }

  const payload = await response.json();
  return Array.isArray(payload.message?.items) ? payload.message.items : [];
}

function mapCrossrefItem(item) {
  const authors = Array.isArray(item.author)
    ? item.author.map((author) => [author.given, author.family].filter(Boolean).join(" ").trim()).filter(Boolean)
    : [];

  return {
    doi: item.DOI || "",
    id: item.DOI || item.URL || `article-${Math.random().toString(36).slice(2)}`,
    title: Array.isArray(item.title) ? item.title[0] || "Untitled" : "Untitled",
    journal: Array.isArray(item["container-title"]) ? item["container-title"][0] || "Unknown Journal" : "Unknown Journal",
    abstract: escapeHtmlTags(item.abstract || ""),
    publishedAt: extractPublishedDate(item),
    url: item.URL || "",
    authors,
    subjects: Array.isArray(item.subject) ? item.subject : []
  };
}

function dedupeArticles(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const dedupeKey = item.doi || item.url || item.title;
    if (!dedupeKey || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    output.push(item);
  }

  return output;
}

function getTopTerms(articles) {
  const frequencies = new Map();

  for (const article of articles) {
    const text = normalizeText(`${article.title} ${article.abstract}`);
    const tokens = text.split(/\s+/).filter((token) => token.length >= 4 && !ENGLISH_STOPWORDS.has(token));

    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    }
  }

  return Array.from(frequencies.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([token, count]) => ({
      label: token,
      count
    }));
}

function summarizeJournalSpread(articles) {
  const counts = new Map();

  for (const article of articles) {
    counts.set(article.journal, (counts.get(article.journal) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([journal, count]) => ({ journal, count }));
}

function buildLocalSummary(articles, filters, journalSpread, topTerms) {
  if (articles.length === 0) {
    return {
      overview: "No papers matched the current filters. Try broadening the journal list, adding synonym keywords, or expanding the date range.",
      signals: [
        "The current filters are narrow and returned zero results.",
        "A practical first pass is the last 90 days with 2 to 3 core keywords."
      ],
      recommendations: [
        "Check whether the journal names match the Crossref container titles.",
        "Add English keywords, especially synonyms and abbreviations."
      ]
    };
  }

  const latestArticle = articles
    .filter((article) => article.publishedAt)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))[0];

  const dominantJournal = journalSpread[0];
  const themeText = topTerms.slice(0, 4).map((item) => toTitleCase(item.label)).join(", ") || "no clear topic cluster";

  return {
    overview: `The system identified ${articles.length} high-relevance papers within ${filters.dateLabel}. Themes cluster around ${themeText}, and ${
      dominantJournal ? `${dominantJournal.journal} is the most active source` : "the journal distribution is relatively diffuse"
    }.${latestArticle ? ` The newest paper was published on ${latestArticle.publishedAt}.` : ""}`,
    signals: [
      dominantJournal
        ? `${dominantJournal.journal} is the most active source in this run with ${dominantJournal.count} papers.`
        : "No single journal dominates this result set.",
      topTerms[0]
        ? `${toTitleCase(topTerms[0].label)} is the leading recurring topic, suggesting elevated recent attention.`
        : "No stable hotspot emerged from the title and abstract terms.",
      articles[0]
        ? `The top-ranked paper is "${articles[0].title}" with ${articles[0].matchedKeywords.length} keyword matches.`
        : "No representative paper could be ranked."
    ],
    recommendations: [
      "Start with the top 3 ranked papers to confirm the direction fits your research question.",
      "Add 2 to 3 synonyms around the hotspot themes and run a second pass to widen recall.",
      "For a weekly digest, keep the journal list fixed and set the time window to the last 7 days."
    ]
  };
}

async function buildAiSummary(articles, filters, journalSpread, topTerms) {
  if (!process.env.OPENAI_API_KEY || articles.length === 0) {
    return null;
  }

  const compactArticles = articles.slice(0, 12).map((article) => ({
    title: article.title,
    journal: article.journal,
    publishedAt: article.publishedAt,
    authors: article.authors.slice(0, 4),
    matchedKeywords: article.matchedKeywords,
    abstract: article.abstract.slice(0, 900)
  }));

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are a research intelligence assistant. Based on the provided paper list, return strict JSON summarizing current hotspots, key signals, and next-step recommendations. Do not invent facts."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(
                {
                  filters,
                  journalSpread,
                  topTerms,
                  articles: compactArticles
                },
                null,
                2
              )
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "literature_summary",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              overview: { type: "string" },
              signals: {
                type: "array",
                items: { type: "string" }
              },
              recommendations: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["overview", "signals", "recommendations"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const payload = await response.json();
  const outputText = payload.output_text;

  if (!outputText) {
    throw new Error("OpenAI did not return a parseable summary.");
  }

  return JSON.parse(outputText);
}

function pickHighlights(articles) {
  return articles.slice(0, 3).map((article, index) => ({
    rank: index + 1,
    title: article.title,
    journal: article.journal,
    publishedAt: article.publishedAt,
    url: article.url,
    authors: article.authors,
    rationale:
      article.matchedKeywords.length >= 2
        ? `Matched multiple keywords: ${article.matchedKeywords.join(", ")}.`
        : article.publishedAt
          ? "Recently published and aligned with the current filters."
          : "High relevance to the current keyword and journal filters."
  }));
}

async function searchLiterature(input) {
  const journals = parseList(input.journals);
  const keywords = parseList(input.keywords);
  const maxResults = Math.max(5, Math.min(Number(input.maxResults || DEFAULT_MAX_RESULTS), 50));
  const dateWindow = getDateWindow(input);
  const queries = buildQueries(keywords, journals);

  const fetchedArticles = [];
  const warnings = [];

  for (const query of queries) {
    try {
      const items = await fetchCrossrefWorks(query, dateWindow);
      for (const item of items) {
        const article = mapCrossrefItem(item);
        if (!isJournalMatch(article.journal, journals)) {
          continue;
        }
        fetchedArticles.push(article);
      }
    } catch (error) {
      warnings.push(`${query.keyword}${query.journal ? ` @ ${query.journal}` : ""}: ${error.message}`);
    }
  }

  if (fetchedArticles.length === 0 && warnings.length > 0) {
    throw new Error(`Literature search failed. Crossref is currently unreachable. ${warnings[0]}`);
  }

  const dedupedArticles = dedupeArticles(fetchedArticles);
  const scoredArticles = dedupedArticles
    .map((article) => {
      const scoreInfo = computeArticleScore(article, journals, keywords, dateWindow.toDate);
      return {
        ...article,
        matchedKeywords: scoreInfo.matchedKeywords,
        score: Number(scoreInfo.score.toFixed(2))
      };
    })
    .filter((article) => article.matchedKeywords.length > 0 || journals.length === 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxResults);

  const topTerms = getTopTerms(scoredArticles);
  const journalSpread = summarizeJournalSpread(scoredArticles);

  let summary = buildLocalSummary(
    scoredArticles,
    { dateLabel: dateWindow.label, journals, keywords },
    journalSpread,
    topTerms
  );
  let analysisMode = "local";

  try {
    const aiSummary = await buildAiSummary(
      scoredArticles,
      { dateLabel: dateWindow.label, journals, keywords },
      journalSpread,
      topTerms
    );

    if (aiSummary) {
      summary = aiSummary;
      analysisMode = `openai:${OPENAI_MODEL}`;
    }
  } catch (error) {
    console.error("AI summary fallback:", error.message);
  }

  return {
    filters: {
      journals,
      keywords,
      maxResults,
      timePreset: dateWindow.mode,
      fromDate: dateWindow.fromDate,
      toDate: dateWindow.toDate,
      dateLabel: dateWindow.label
    },
    stats: {
      total: scoredArticles.length,
      journalsCovered: journalSpread.length,
      queriesExecuted: queries.length,
      analysisMode
    },
    warnings,
    summary,
    themes: topTerms,
    journalSpread,
    highlights: pickHighlights(scoredArticles),
    articles: scoredArticles
  };
}

module.exports = {
  searchLiterature
};
