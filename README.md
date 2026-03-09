# Literature Discovery

A GitHub Pages-friendly literature dashboard for daily journal digests.

## Live Site

Primary usage is now through GitHub Pages:

- Production site: `https://jim-xu.github.io/ref_auto_push/`
- Daily workflow: open the site, sign in locally in your browser, then refresh the digest

`npm start` is no longer the main way to use the project. It is only for local preview during development.

## What Changed

- The home page is now a focused `Daily Digest` view with a refresh button and time mode.
- Journal subscriptions moved to a dedicated `Journal Subscriptions` page.
- The daily digest is now journal-first and derives keyword filters automatically from returned papers.
- The app now ships with seeded atmospheric science journals.
- Journal search supports title or ISSN lookup through Crossref.
- A browser-local sign-in layer separates subscriptions for different users on the same published site.
- Source toggles moved to a dedicated `Source Settings` page.
- GitHub Pages deployment is configured through [deploy-pages.yml](.github/workflows/deploy-pages.yml).

## Local Preview

This app is now a static multi-page site under [public](public). That means:

- GitHub Pages can publish it directly.
- The browser calls public APIs directly.
- Local preview is optional and still works with:

```bash
npm start
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Pages and Navigation

- [index.html](public/index.html): daily digest
- [journals.html](public/journals.html): journal subscription management
- [topics.html](public/topics.html): source settings

## Data Sources

- `Crossref`: live in the current static build
- `PubMed`: wired into the browser client as an experimental source
- `arXiv`: wired into the browser client as an experimental source

The current fetch logic lives in [crossref.js](public/shared/crossref.js).

## Journal Management

Seeded atmospheric science journals are defined in [catalog.js](public/shared/catalog.js).

Users can:

- subscribe or unsubscribe seeded journals
- search Crossref by journal title or ISSN
- add custom journals from search results into their own directory

## Sign-In Model

The published GitHub Pages version uses a browser-local account system:

- accounts are stored in `localStorage`
- passwords are hashed in the browser before storage
- subscriptions are isolated per browser profile
- source toggles are also stored per user profile

This is compatible with GitHub Pages, but it is not a real shared backend auth system. If you later want cross-device accounts, shared sync, or secure server-side auth, the next upgrade path should be Supabase, Firebase, or another hosted backend.

## GitHub Pages Setup

The workflow is already added. In the GitHub repository settings:

1. Open `Settings`
2. Open `Pages`
3. Set `Source` to `GitHub Actions`

After that, every push to `main` will deploy the contents of [public](public).

If you keep the default project-pages URL, the published address is:

- `https://jim-xu.github.io/ref_auto_push/`

## Current Limitations

- Crossref browser access still depends on public API availability and CORS behavior.
- `PubMed` and `arXiv` are now available as experimental browser-side sources, but they may still fail depending on browser CORS behavior or upstream availability.
- The current sign-in model is browser-local, not cloud-backed.
