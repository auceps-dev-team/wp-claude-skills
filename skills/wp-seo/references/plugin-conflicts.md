# SEO plugin conflicts

Four plugins cover most WordPress sites: Yoast SEO, Rank Math, SEOPress and All in One SEO. They solve the same problems and each assumes it is the only one installed. Almost every WordPress SEO bug that is not a content problem is a conflict between one of these and either the theme or another plugin.

## Contents

- [What each plugin takes over](#what-each-plugin-takes-over)
- [Detecting which one is active](#detecting-which-one-is-active)
- [Extending instead of duplicating](#extending-instead-of-duplicating)
- [Two SEO plugins at once](#two-seo-plugins-at-once)
- [Theme conflicts](#theme-conflicts)
- [Migrating between plugins](#migrating-between-plugins)
- [Premium add-ons are separate plugins](#premium-add-ons-are-separate-plugins)

## What each plugin takes over

All three remove core's output and replace it. Anything in this table is **not** yours to emit once a plugin is active:

| Output | Core | With an SEO plugin |
|---|---|---|
| `<title>` | `add_theme_support( 'title-tag' )` | Plugin filters `pre_get_document_title` |
| `rel=canonical` | `rel_canonical()` on `wp_head` | Plugin removes it, emits its own |
| Meta description | none | Plugin |
| Open Graph / Twitter cards | none | Plugin |
| XML sitemap | `/wp-sitemap.xml` (5.5+) | Plugin, usually at `/sitemap_index.xml` |
| robots meta | `wp_robots` filter | Plugin, per post type and per post |
| JSON-LD schema graph | none | Plugin, `@id`-linked graph |

The sitemap row is the one that bites: core's sitemap is **not** always disabled by the plugin, so a site can serve two sitemaps listing different URL sets. Check both URLs directly.

## Detecting which one is active

```php
$seo = false;
if ( defined( 'WPSEO_VERSION' ) )        { $seo = 'yoast'; }
elseif ( class_exists( 'RankMath' ) )     { $seo = 'rankmath'; }
elseif ( defined( 'SEOPRESS_VERSION' ) )  { $seo = 'seopress'; }
elseif ( defined( 'AIOSEO_VERSION' ) )    { $seo = 'aioseo'; }
```

From the shell, when auditing a package rather than a live site:

```bash
rg -l "WPSEO_VERSION|RankMath|SEOPRESS_VERSION|AIOSEO_VERSION" --glob '*.php'
```

Guard every piece of SEO output a theme emits behind this check. A theme that emits schema unconditionally is a theme that breaks rich results on most of the sites that install it.

## Extending instead of duplicating

Adding a node to the plugin's existing graph keeps one coherent set of entities. Emitting a second graph creates two.

**Yoast** — `wpseo_schema_graph` filters the whole graph:

```php
add_filter( 'wpseo_schema_graph', function ( $graph, $context ) {
    if ( ! is_singular( 'recipe' ) ) {
        return $graph;
    }
    $graph[] = array(
        '@type'           => 'Recipe',
        '@id'             => get_permalink() . '#recipe',
        'name'            => get_the_title(),
        'recipeIngredient'=> get_post_meta( get_the_ID(), '_ingredients', true ),
        'isPartOf'        => array( '@id' => $context->canonical . '#webpage' ),
    );
    return $graph;
}, 10, 2 );
```

The `isPartOf` link back to the plugin's `#webpage` node is what makes it one graph rather than two.

Yoast also exposes narrower filters worth knowing: `wpseo_canonical`, `wpseo_title`, `wpseo_metadesc`, `wpseo_robots`, `wpseo_sitemap_exclude_post_type`.

**Rank Math** — `rank_math/json_ld`:

```php
add_filter( 'rank_math/json_ld', function ( $data, $jsonld ) {
    $data['myRecipe'] = array( '@type' => 'Recipe', /* ... */ );
    return $data;
}, 99, 2 );
```

Plus `rank_math/frontend/canonical`, `rank_math/frontend/title`, `rank_math/sitemap/exclude_post_type`.

**SEOPress** — `seopress_titles_canonical`, `seopress_titles_title`, `seopress_schemas_json_ld`.

**All in One SEO** — the schema entry point is `aioseo_schema_output`, with `aioseo_schema_disable` to suppress it entirely and `aioseo_schema_breadcrumbs_home` for the breadcrumb root. Sitemap control goes through `aioseo_sitemap_posts`, `aioseo_sitemap_post` and `aioseo_sitemap_additional_pages`; `aioseo_rest_api_disable` turns off its REST surface. Verified against All in One SEO Pack Pro 4.9.9.

## Two SEO plugins at once

This happens more than it should — a site inherits Yoast, someone installs Rank Math to try it, and neither is removed. The symptoms are unmistakable once you know them:

- Two `<title>` tags, or a title containing the site name twice
- Two `rel=canonical` tags
- Two Open Graph blocks, so social previews pick arbitrarily
- Two schema graphs, so rich results fail validation
- Two sitemaps in robots.txt

Fix by choosing one and **fully deleting** the other, not merely deactivating it — deactivated plugins leave their post meta, which the next migration tool may pick up. Export the settings and the per-post meta first.

Verify with a raw fetch rather than a browser view:

```bash
curl -s https://example.com | grep -c 'rel="canonical"'   # must be 1
curl -s https://example.com | grep -c '<title'            # must be 1
```

## Theme conflicts

Themes commonly do three things they should not:

**Hard-code a canonical or a `<title>` in `header.php`.** Both fight the plugin. Remove them and use `add_theme_support( 'title-tag' )`.

**Emit Open Graph tags unconditionally.** Duplicates the plugin's. Guard or drop.

**Ship a partial schema block.** The most common case, usually an `Article` or `BreadcrumbList` copied from a tutorial. Combined with a plugin's graph it produces two `Article` entities for one page, and Google reports the structured data as invalid.

Audit a theme for all three at once:

```bash
rg -n "rel=.canonical|<title>|og:|application/ld\+json" --glob '*.php'
```

## Migrating between plugins

Each plugin stores its data in its own post meta keys (`_yoast_wpseo_*`, `rank_math_*`, `_seopress_*`). Switching without migrating loses every hand-written title, description and per-post robots setting.

Order that works:

1. **Back up the database.** This is a bulk meta rewrite; there is no undo.
2. Run the target plugin's built-in importer (all three ship one) **before** deactivating the old plugin — importers read the old meta, which requires it to still be present.
3. Verify a sample of pages: titles, descriptions, canonicals, noindex flags.
4. Compare the old and new sitemap URL sets. A difference in count is the thing to explain before going further.
5. Only then delete the old plugin, and clean up its meta once you are confident.
6. Resubmit the sitemap in Search Console and watch coverage for a few weeks.

Redirects are **not** carried over by these importers if they lived in the old plugin's premium redirect module. Export them separately, and prefer moving them to the server config anyway.


## Premium add-ons are separate plugins

Yoast SEO Premium, Rank Math Pro and AIOSEO Pro are **add-ons**, not replacements. The filters that matter for integration — canonical, title, schema graph — live in the free plugin; the add-on ships the extra features. Two consequences:

- Grepping a Premium package for `wpseo_schema_graph` finds nothing, because that filter is in the free plugin. Confirm which package you are looking at before concluding a hook does not exist.
- Deactivating the free plugin disables the Premium one entirely.

### Redirects live outside the usual meta

Yoast Premium 28.3 stores redirects in dedicated option rows, not post meta: `wpseo-premium-redirects`, `wpseo-premium-redirects-regex`, plus separate `-export-plain` and `-export-regex` options.

This is what makes the migration advice concrete. A plugin-to-plugin importer that walks post meta will not carry redirects across, because they were never in post meta. Export them explicitly.

Yoast also ships `classes/redirect/exporters/redirect-htaccess-exporter.php` — the vendor's own path for moving redirects into the server config. Taking it is the right call at any scale: a database-backed redirect table adds a lookup to every 404, and the export exists precisely because that stops being acceptable.
