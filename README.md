# Literature Scout MVP

A local web prototype for literature discovery. It supports:

- Custom journal lists
- Custom keyword lists
- A "last N days" mode or a custom date range
- Automated paper lookup through Crossref
- Relevance ranking and summary generation
- A results dashboard with overview, signals, top papers, and the full paper list

## How to run

```bash
npm start
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

If you run `npm run`, npm will only list available scripts. The actual command for this app is `npm start` or `npm run start`.

## How to define journals

Enter journals in the `Journals` field:

- One journal per line, or separated by commas
- Prefer official journal titles such as `Nature`, `Science`, `Cell`, `The Lancet`, `Nature Biotechnology`
- Matching is based on the Crossref container title, so exact or near-exact names work best
- If you leave the journal field empty, the app searches broadly across journals

Examples:

```text
Nature
Science
Cell
Nature Biotechnology
```

## Optional environment variables

```bash
PORT=3000
HOST=127.0.0.1
CROSSREF_MAILTO=you@example.com
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
```

Notes:

- Without `OPENAI_API_KEY`, the app uses local rule-based summarization.
- With `OPENAI_API_KEY`, it will try to call the OpenAI Responses API for a more natural English summary, and automatically fall back to local analysis if that fails.

## Current limitations

- The current source is Crossref, which is suitable for a cross-journal MVP.
- Journal matching is based on normalized container-title matching, so naming differences across platforms can affect recall.
- Some records do not include abstracts; the UI keeps the metadata and links out to the paper.

## Obvious next steps

- Add PubMed, arXiv, OpenAlex, and publisher-specific APIs
- Save reusable search templates
- Add scheduled runs and digest delivery
- Extract richer structure such as research question, methods, findings, and limitations
