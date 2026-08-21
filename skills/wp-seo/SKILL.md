---
name: wp-seo
description: WordPress-specific technical SEO — permalink and canonical handling, XML sitemaps, robots and indexing controls, structured data without plugin conflicts, pagination and archive bloat, Core Web Vitals in a WordPress stack, and migrations that preserve rankings. Use this whenever a WordPress site has indexing, canonical, sitemap or duplicate-content problems, when configuring or auditing Yoast/Rank Math/SEOPress, when a theme needs schema output, or when planning a URL change, domain move or replatform.
---

# WordPress SEO

Most SEO advice is platform-neutral and stays true here. This skill covers only what WordPress does differently — the places where the CMS itself creates or solves the problem, and where a theme or plugin can quietly undo the work.

## When to use

- Pages are not indexed, or the wrong URL is indexed
- Duplicate content from archives, pagination, attachments or query parameters
- Configuring or auditing an SEO plugin, or resolving conflicts between two of them
- A theme needs to emit structured data, canonicals or meta
- A URL structure, domain or platform change is planned
- Core Web Vitals are failing on a WordPress stack

## When NOT to use

- **Keyword research, content strategy, competitor analysis** — these are not WordPress problems. Use a dedicated SEO skill; nothing here helps.
- **Pure performance work** with no indexing dimension → `wp-performance`
- **Semantic markup, headings, alt text and accessibility** → `wp-accessibility`, which also covers the schema basics for a single post type
- **Escaping the values you output** → `wp-standards`

## Required inputs

Before auditing, get these. Without them you are guessing:

| Input | Why |
|---|---|
| Site URL and whether it is live | Staging sites are usually `noindex`; a "not indexed" report often ends here |
| Which SEO plugin is active, if any | Determines who owns canonicals, sitemaps and schema |
| Search Console access, or an export | The only source of truth for what Google actually did |
| Whether a migration happened recently | Reframes everything |
| Multisite / multilingual? | Changes sitemap and canonical handling entirely |

If Search Console is unavailable, say so in the report and mark every indexing claim as inferred. `site:` queries are a weak substitute and should be labelled as such.

## The WordPress-specific surface

### 1. Who owns the canonical

WordPress core emits `rel=canonical` via `rel_canonical()` on `wp_head`. Every SEO plugin **removes it and emits its own**. So there are three possible owners, and the failure mode is two of them running at once:

```bash
rg -n "rel_canonical|remove_action.*rel_canonical|rel=.canonical" --glob '*.php'
```

Two canonicals on a page is worse than none — Google picks one, and it will not be the one you intended. If a theme hard-codes a canonical in `header.php`, that is a bug, not a feature.

The same applies to `<title>`. A theme that outputs `<title>` directly instead of using `add_theme_support( 'title-tag' )` fights the plugin for it.

### 2. Indexing controls that actually apply

| Control | Scope | Notes |
|---|---|---|
| Settings → Reading → "Discourage search engines" | Whole site | Sets `noindex` **and** blocks via robots.txt. The single most common cause of "my site vanished" after launch. |
| SEO plugin per-post-type settings | Post type | Where archive/attachment noindex belongs |
| `wp_robots` filter | Programmatic | The modern hook (WP 5.7+); `wp_no_robots` is deprecated |

```php
add_filter( 'wp_robots', function ( $robots ) {
    if ( is_author() || is_date() ) {
        $robots['noindex'] = true;
    }
    return $robots;
} );
```

**`noindex` and `Disallow` do different things and interact badly.** A page disallowed in robots.txt cannot be crawled, so Google never sees the `noindex` and may index the URL anyway from links. To remove a page from the index: allow crawling, serve `noindex`, wait for recrawl, *then* disallow if you want.

### 3. Archive and pagination bloat

WordPress generates far more URLs than a site has content. By default each post appears under its permalink, plus category, tag, author, date (year/month/day), feed and attachment URLs. On a 500-post site this is thousands of thin, near-duplicate pages competing with the real ones.

Decide deliberately for each:

- **Category/tag archives** — index if they have unique intro copy and are genuinely useful; `noindex` otherwise
- **Author archives** — `noindex` on a single-author site; they duplicate the blog index exactly
- **Date archives** — almost always `noindex`; nobody searches by month
- **Attachment pages** — always redirect to the file or the parent post. SEO plugins do this; core does not.
- **Paginated archives** — self-canonical each page. Canonicalising page 2 to page 1 hides page 2's links from crawlers. `rel=next/prev` is no longer used by Google.

### 4. Sitemaps

Core ships XML sitemaps at `/wp-sitemap.xml` since WP 5.5. Every SEO plugin also ships one, and does **not** always disable core's — leaving two sitemaps advertising different URL sets.

```php
// Turn off core's when a plugin owns sitemaps
add_filter( 'wp_sitemaps_enabled', '__return_false' );
```

Check which one is in robots.txt and which one Search Console has. A sitemap should list only canonical, indexable, 200-status URLs — if it lists `noindex` pages, that is a contradiction Google reports as an error.

### 5. Structured data without conflicts

Yoast and Rank Math emit a complete schema **graph** (Organization, WebSite, WebPage, Article, BreadcrumbList, all `@id`-linked). A theme that adds its own partial `Article` block creates two competing entities describing the same page.

So: detect before emitting.

```php
add_action( 'wp_head', function () {
    if ( defined( 'WPSEO_VERSION' ) || class_exists( 'RankMath' ) || defined( 'SEOPRESS_VERSION' ) ) {
        return;   // the plugin owns the graph
    }
    // ... emit your own JSON-LD
} );
```

Better still, extend rather than duplicate — Yoast exposes `wpseo_schema_graph`, Rank Math `rank_math/json_ld`. Adding a node to the existing graph keeps one coherent entity set.

Only mark up what is visibly on the page. Invisible FAQ or Review markup is a manual-action risk.

### 6. Migrations

The highest-risk SEO operation in WordPress, and the one most often done without a plan.

1. **Crawl the old site first** and keep the URL inventory. You cannot verify a migration you did not baseline.
2. **Map every old URL to a new one.** Redirect to the equivalent page, never wholesale to the homepage — that is treated as a soft 404.
3. **Use 301, server-side.** A redirect plugin storing thousands of rules in the database adds a query to every 404; at scale move them into nginx/Apache.
4. **Changing the permalink structure rewrites every URL on the site.** Treat it as a migration even though nothing else changed.
5. **After launch:** verify robots.txt, submit the new sitemap, watch Search Console coverage for four weeks. Ranking dips of 2–4 weeks are normal; flat-lining is not.

### 7. Core Web Vitals, WordPress-flavoured

The metrics are generic; the causes are predictable here. LCP is usually the hero image or a web font; CLS comes from images without dimensions and late-injected banners; INP is jQuery-heavy themes doing work on every scroll event. Diagnosis and fixes live in `wp-performance` — this skill only notes that field data in Search Console, not a lab score, is what affects ranking.

## Workflow

1. Establish the inputs above, and **who owns canonicals, titles, sitemaps and schema**. Most findings resolve to a conflict between two owners.
2. Fetch the homepage and one of each template as Googlebot sees it — check for `noindex`, canonical count, title source.
3. Compare the sitemap's URL set against what should be indexable.
4. Enumerate the archive types the site generates and confirm each has a deliberate index/noindex decision.
5. Check Search Console coverage for the pattern: *Excluded by noindex*, *Duplicate without canonical*, *Crawled — currently not indexed*. Each names its own cause.
6. Report, with the trust model of who can change what.

## Failure patterns

| Symptom | Usual cause |
|---|---|
| Whole site deindexed after launch | Settings → Reading "Discourage search engines" still ticked |
| "Duplicate, Google chose a different canonical" | Two canonical tags, or archives competing with posts |
| Sitemap errors in Search Console | Two sitemaps, or a sitemap listing `noindex` URLs |
| Rankings dropped after a redesign | Permalink structure changed with no redirect map |
| Rich results disappeared | Theme and plugin both emitting schema |
| New posts indexed slowly | Thin archive URLs consuming crawl budget |
| Staging site outranking production | Staging not `noindex`, and linked from somewhere |

## Output format

```markdown
# SEO audit — <site>

## Setup
Active SEO plugin, who owns canonical/title/sitemap/schema, data sources used.

## Findings
### [severity] <title>
**Evidence:** URL, header or markup observed — quote it.
**Impact:** what it costs in indexing or ranking terms.
**Fix:** the specific change, and who has to make it.

## Not problems
Things that look wrong and are not, with the reason.
```

Severity here means *ranking or indexing impact*, not tidiness. A missing meta description is not a finding; a `noindex` on a money page is.

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/plugin-conflicts.md`](references/plugin-conflicts.md) | Yoast / Rank Math / SEOPress: what each takes over, how to extend rather than duplicate, migration between them |
