export const SOURCE_REGISTRY = {
  crossref: {
    id: "crossref",
    label: "Crossref",
    status: "live"
  },
  pubmed: {
    id: "pubmed",
    label: "PubMed",
    status: "experimental"
  },
  arxiv: {
    id: "arxiv",
    label: "arXiv",
    status: "experimental"
  }
};

export const SEEDED_JOURNALS = [
  { id: "science", title: "Science", issn: "0036-8075", source: "crossref", seeded: true },
  { id: "nature", title: "Nature", issn: "1476-4687", source: "crossref", seeded: true },
  { id: "pnas", title: "Proceedings of the National Academy of Sciences", issn: "1091-6490", source: "crossref", seeded: true },
  { id: "grl", title: "Geophysical Research Letters", issn: "1944-8007", source: "crossref", seeded: true },
  { id: "acp", title: "Atmospheric Chemistry and Physics", issn: "1680-7324", source: "crossref", seeded: true },
  { id: "ae", title: "Atmospheric Environment", issn: "1352-2310", source: "crossref", seeded: true },
  { id: "ast", title: "Aerosol Science and Technology", issn: "1521-7388", source: "crossref", seeded: true },
  { id: "jas", title: "Journal of Aerosol Science", issn: "0021-8502", source: "crossref", seeded: true },
  { id: "gmd", title: "Geoscientific Model Development", issn: "1991-9603", source: "crossref", seeded: true },
  { id: "jgr-atm", title: "Journal of Geophysical Research: Atmospheres", issn: "2169-8996", source: "crossref", seeded: true },
  { id: "amt", title: "Atmospheric Measurement Techniques", issn: "1867-8548", source: "crossref", seeded: true },
  { id: "est", title: "Environmental Science & Technology", issn: "0013-936X", source: "crossref", seeded: true },
  { id: "ep", title: "Environmental Pollution", issn: "0269-7491", source: "crossref", seeded: true },
  { id: "stotenv", title: "Science of the Total Environment", issn: "0048-9697", source: "crossref", seeded: true },
  { id: "jcp", title: "Journal of Cleaner Production", issn: "0959-6526", source: "crossref", seeded: true },
  { id: "chemosphere", title: "Chemosphere", issn: "0045-6535", source: "crossref", seeded: true }
];

export const DEFAULT_JOURNAL_IDS = [
  "acp",
  "ae",
  "ast",
  "jas",
  "gmd",
  "jgr-atm"
];

export const SUGGESTED_TOPICS = [
  "aerosol modeling",
  "aerosol microphysics",
  "chemical transport model",
  "WRF-Chem",
  "GEOS-Chem",
  "CMAQ",
  "PM2.5",
  "secondary organic aerosol",
  "aerosol-cloud interaction",
  "source apportionment"
];
