# Docs system

The in-app Docs (`/docs`) explain every Ledger feature with an article, built the same way as Noirly Flow's Docs. This file is how it fits together and how to keep it current.

## Pieces

| Piece | Where | What it is |
| --- | --- | --- |
| Articles | `src/docs/content/*.ts` | One typed `DocArticle` per feature or guide (`src/docs/types.ts`). Plain data: no React, no server code. |
| Registry | `src/docs/registry.ts` | Category order, sidebar tree, URLs, previous/next, related links, media lookup. |
| Search | `src/docs/search.ts` | Client-side index over titles, summaries, steps, options, troubleshooting and FAQs. |
| Media manifest | `src/docs/media.json` | Screenshots and video per article. Empty until the capture pipeline is ported (below). |
| Inventory | `src/docs/inventory.json` | Written by `pnpm docs:scan --write`: every article with its sources and fingerprint, plus every page, API route, feature module and e2e spec found in the code. The reviewed baseline. |
| UI | `app/(docs)/**`, `src/features/docs/*` | Public pages (`proxy.ts` lets signed-out visitors read them), linked from the landing page header and the app sidebar. In the app shell when signed in, under the marketing header when not. |
| Coverage scan | `docs-pipeline/scan.ts` | Compares the code with the articles. |

An article's `id` is its URL segment (`/docs/<category>/<id>`) and names its video and screenshot folder. `sources` lists the files it describes; their fingerprint (`docs-pipeline/lib/fingerprint.ts`) tells the scan when an article may be out of date. Each e2e spec maps to an article in `specCovered` in the scan.

## Categories

Getting started, Accounts & money, Transactions, Budgets, Bills & subscriptions, Goals & debt, Teams & shared money, Reports & insights, Automations & integrations, Security & data, Help.

## Article shape

Feature articles carry all eleven sections: introduction, problem, solution (with highlights), use cases, step-by-step guide, video walkthrough, options, permissions, advanced capabilities, troubleshooting and related features. Guides pick their own. `src/docs/docs.test.ts` fails if a feature section is missing, a related link or source file doesn't exist, a video is named after another article, or search stops finding the obvious answers.

Write only what the code does, and use the labels on screen: check them against the components and e2e specs before writing a step.

A feature that can't be recorded safely has `video: { unavailable: "<why>" }` and the page says so. Nothing is faked: sign-in (Noirly Identity popup), the Flow link (a second app), and emailed receipts (a real mail relay).

## Videos and screenshots

Flow's capture and render pipeline (`docs-pipeline/capture`, `docs-pipeline/video`, `docs-pipeline/render.ts`, `playwright.docs.config.ts`) isn't ported yet. Ledger already has what it needs: the isolated e2e server and fixtures in `e2e/`. To port it, copy Flow's pipeline, point it at `e2e/env.ts` and `e2e/global-setup.ts`, and write one scenario per article named in `video.scenario`. Until then, those articles show "Video coming soon".

Videos would be hosted like Flow's: `R2_PUBLIC_URL` → `<R2_PUBLIC_URL>/doc-videos/<article-id>.mp4` (`src/docs/video-host.ts`), with that origin added to the CSP's `media-src`.

## Keeping it current

1. `pnpm docs:scan` lists articles whose sources changed (review the text), code no article covers (a new feature?), and articles whose sources are gone.
2. Update the affected articles by hand (or ask Claude Code to, from the diff).
3. `pnpm docs:scan --write` once the text is reviewed. Nothing is ever marked current automatically.
4. `pnpm test src/docs/docs.test.ts`.

`NOT_DOCUMENTED` in `docs-pipeline/scan.ts` lists code with no user-facing feature of its own, and why.
