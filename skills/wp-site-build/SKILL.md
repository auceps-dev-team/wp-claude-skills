---
name: wp-site-build
description: Build or redesign a whole WordPress site from a visual reference — brief, local HTML mockup, conversion to an editable block theme, local staging with replayable tools, a client-approved deployment and five measured acceptance gates — for showcase sites (block theme or Elementor free), WooCommerce stores (block cart and checkout, filters, consent, payments, newsletter, legal pages, SEO) and web apps. Use this whenever the user wants to create, rebuild or replace a WordPress site or theme, build its pages with Elementor, leave a page builder such as Divi, or sends a site brief with a reference image or URL.
---

# Building a WordPress site, end to end

## Why this method exists

An agent designs badly when its feedback loop is slow. Laying a page out inside WordPress costs three to five minutes per iteration — compose, save, serialise, purge, reload, look. In local HTML with a dev server the same loop takes five seconds, and design quality tracks the number of iterations far more reliably than any aesthetic instruction.

The second half is a delivery constraint: the client edits the site without writing code. That is what forbids raw HTML blocks and template-owned content — and it constrains the *conversion*, never the *drawing*.

> In one line: the design lives in files, not in page content. WordPress receives a finished theme, not layout instructions.

## The two rules that come first

**Rule 0 — draw phase 2 as if phase 4 did not exist.** No conversion constraint enters the mockup. Anticipating "no `core/html`" while drawing quietly removes depth, overlaps and the central object; the result converts perfectly and pleases nobody.

**Rule 0′ — no aesthetic freedom leaves the reference.** With a reference, a model drifts toward its own house style: warm beige where the reference is cold white, a characterful serif where it has one sans, an accent it never had. Seven *register invariants* are read off the reference and reproduced; changing one is a question for the client, asked before coding. The invariants, the register gate and the measuring script are in `references/register.md`.

## The ten rules

Each one comes from a mistake that was actually made.

1. Require a visual reference. Without one, output regresses to the statistical centre: neutral font, purple gradient, white page.
2. No mockup without real photos. A grey box reads as a broken image.
3. Nothing reaches WordPress production before two client approvals: the mockup, then the deployment plan.
4. The home page is a page, never a template — `front-page.html` holds header, `post-content`, footer.
5. Zero `core/html` blocks. Compose with groups, headings, paragraphs, images.
6. Images live in the media library, with an `id` on every `core/image`.
7. Interactive variants all live in the page; the script toggles a class.
8. No third-party theme under the design.
9. Accept in the editor, not on the front end — a page can render perfectly and be unusable in Gutenberg.
10. Pixel fidelity is measured, not eyeballed: computed styles and geometry, selector by selector.

## Phases and their gates

Do not start a phase until the previous gate is passed.

| Phase | Who | Exit gate |
|---|---|---|
| 0 · Workspace | Agent | Project in the user's working folder, write access tested |
| 1 · Brief | Client | Reference survey, palette and type taken *from* the reference, "what I add" list |
| 2 · Mockup | Iterative | Home page in HTML, register gate passed, **client approval** |
| 3 · Page set | Agent | Every page assembled from one header/footer source |
| 4 · Block theme (or Elementor pages) + staging | Agent | Theme built; local WordPress set up by replayable tools, SEO last; gates 1–5 pass on staging |
| 5 · Deployment | Agent, **after client approval of the plan** | Backup outside the web root, then the same tools run on production |
| 6 · Acceptance | Agent | Gates 1–5 pass on production, or back to phase 4 |

Phases 0–3 and the deployment plan: `references/phases.md`. HTML-to-blocks conversion: `references/block-conversion.md`. The five gates with their code: `references/acceptance.md`.

**Staging is local, and every change is a tool.** Content and configuration are written by idempotent PHP scripts (`tools/install-site.php`, `tools/configure-*.php`) run with the PHP CLI against a local copy, never typed into wp-admin. The same scripts replay on production at deployment, and replaying one twice changes nothing — that is checked, not assumed.

**SEO is the last tool of phase 4**, once pages and catalogue are final: titles and descriptions for every page, product and category, sitemap, sharing image, `noindex` on cart and account pages. It runs as a dry run first, and a person reads every generated line before it is written: `references/seo.md`.

## Choose the branch

The method is the same for every site; what differs is phase 4 onwards.

| Site | What changes | Read |
|---|---|---|
| Showcase | Pages, forms (Contact Form 7 + Flamingo), legal pages | this file and the phases |
| Showcase on Elementor free | Pages are Elementor data written by a tool, mockup classes on widgets, styles in the theme; header and footer in PHP; rules 4–6 and 9 in widget terms; gates in the Elementor editor | `references/elementor.md` |
| Store | WooCommerce block templates, catalogue import, product filters, cart/checkout blocks, consent, payments, newsletter, order confirmation | `references/store.md` |
| Web app | Custom post types, roles, REST, dynamic blocks, account flows — the mockup still drives every public screen | `references/web-app.md` |

`references/store.md` is measured on a real build (WooCommerce 11.2.2, block checkout, block theme), and so is `references/elementor.md` (Elementor 4.3.6 free, 26 pages). `references/web-app.md` is not: it says so, and routes to the skills that are.

## Facts belong to the client

The mockup invents copy from the brief; it never invents facts. Reviews, ratings, customer counts, press logos, delivery times, prices of services, legal clauses and company identity stay as visible placeholders — `à compléter` for what only the client can supply, `à vérifier` for what was read on the old site and may be stale. A fabricated review passes every gate and is the one defect that can cost the client legally.

In comments, commit messages and reports, say which claims were **measured** (with the date) and which were **read** (with the source).

## Tooling

| File | When |
|---|---|
| `scripts/serve.mjs` | Phase 2 — zero-dependency static server, tries the next port when one is taken |
| `scripts/assemble.mjs` | Phase 3 — builds every page from one `<head>`, header and footer source |
| `scripts/fetch-fonts.mjs` | Phase 4 — self-hosts Google Fonts: no request to Google from visitors, nothing to declare under GDPR |
| `scripts/novamira.mjs` | Phase 5 — calls a Novamira ability over HTTP without registering an MCP server |
| `scripts/capture.mjs` | Phases 2–6 — full-page screenshots and in-page measurements through headless Chrome (Node 22+); the module the gates share |
| `scripts/gate3.mjs` | Gate 3 — overflow, images, font, font CDN, title / description / h1, visitor cookies on every page; full URLs only |
| `scripts/gate4.mjs` | Gate 4 — same selectors on mockup and site, geometry and computed styles; `--ignore` prints an explained divergence as accepted |
| `scripts/elementor-data.mjs` | Elementor branch — builders for page data, and `check`: gate 1 offline on the JSON |
| `scripts/gate5-elementor.mjs` | Elementor branch — gates 2 and 5 in the real editor, with a session WordPress generates locally |
| `assets/theme-skeleton/` | Phase 4 — minimal block theme: `theme.json` with `blockGap: 0px`, `editor.css`, fonts in the editor |

## References

| File | Read it |
|---|---|
| `references/register.md` | Before phase 1, and before showing any mockup |
| `references/phases.md` | Phases 0–3, then the deployment sequence of phase 5 |
| `references/block-conversion.md` | During phase 4, every time |
| `references/acceptance.md` | Phases 4 and 6 — the five gates and measurement hygiene |
| `references/store.md` | Any WooCommerce site |
| `references/seo.md` | At the end of phase 4, and after deployment for Search Console |
| `references/elementor.md` | Phase 4 when the pages are built with Elementor free |
| `references/web-app.md` | Membership, booking, dashboards, anything with logged-in users doing work |
| `references/pitfalls.md` | As soon as a symptom surprises you |

Related skills: `wp-theme-block-fse` for theme.json and templates, `wp-design-system` for tokens, `wp-woocommerce` for hooks and HPOS, `wp-seo` for canonical, sitemap and schema ownership, `wp-deploy` for migrations, `wp-plugin-architecture` and `wp-blocks-gutenberg` for application code, `wp-accessibility` and `wp-performance` before acceptance.
