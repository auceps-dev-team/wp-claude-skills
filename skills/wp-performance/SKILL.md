---
name: wp-performance
description: Diagnose and fix WordPress performance problems — asset loading and conditional enqueueing, database query optimization, object caching and transients, image delivery, Core Web Vitals (LCP, CLS, INP), autoloaded options and page caching. Use this whenever a WordPress site is slow, when auditing a theme or plugin for performance, when working on PageSpeed or Core Web Vitals scores, or when reviewing code that runs queries in a loop.
---

# WordPress performance

Measure before changing anything. WordPress performance work fails when it becomes a checklist of plugins instead of finding the actual bottleneck — and the actual bottleneck is usually one of four things: too many queries, uncached expensive work, oversized assets, or no page cache.

## Find the bottleneck first

```bash
# Query count and time for a request
wp eval 'echo get_num_queries() . " queries, " . timer_stop() . "s\n";'

# Autoloaded option weight — over ~1MB is a real problem, it loads on every request
wp eval 'global $wpdb; $r = $wpdb->get_results("SELECT option_name, LENGTH(option_value) AS len FROM $wpdb->options WHERE autoload IN (\"yes\",\"on\") ORDER BY len DESC LIMIT 20"); foreach ($r as $o) printf("%8s  %s\n", size_format($o->len), $o->option_name);'

# Total autoload size
wp eval 'global $wpdb; echo size_format( $wpdb->get_var("SELECT SUM(LENGTH(option_value)) FROM $wpdb->options WHERE autoload IN (\"yes\",\"on\")") ) . "\n";'

# Transients that never expire and accumulate
wp eval 'global $wpdb; echo $wpdb->get_var("SELECT COUNT(*) FROM $wpdb->options WHERE option_name LIKE \"_transient_%\"") . "\n";'
```

Install Query Monitor on a staging copy. It shows queries by caller, hooks by time, HTTP requests and PHP errors — it will identify the problem in minutes where guessing takes days.

A useful baseline: a healthy WordPress page is under 60 queries and under 400ms of PHP time. Multipurpose themes with page builders routinely hit 300+ queries, and that is where the work is.

## Assets

The dominant theme problem is loading everything everywhere. A theme with a slider, a lightbox, a carousel, an icon font and a map library loads all of them on a blog post that uses none.

```php
add_action( 'wp_enqueue_scripts', function () {
    wp_enqueue_style( 'mytheme', get_stylesheet_uri(), array(), MYTHEME_VERSION );

    // Load only where used.
    if ( is_singular() && has_block( 'core/gallery' ) ) {
        wp_enqueue_script( 'mytheme-lightbox', MYTHEME_URI . '/assets/js/lightbox.js', array(), MYTHEME_VERSION, true );
    }
    if ( is_page_template( 'templates/contact.php' ) ) {
        wp_enqueue_script( 'mytheme-map', MYTHEME_URI . '/assets/js/map.js', array(), MYTHEME_VERSION, true );
    }
} );
```

`has_block()` and `has_shortcode()` make this precise for block and shortcode features. For custom blocks, `viewScript` in `block.json` gives you conditional loading for free.

### Duplicate icon fonts

Themes ship Font Awesome; Elementor ships its own copies; a plugin ships a third. Several megabytes of overlapping icons:

```php
add_action( 'elementor/frontend/after_register_styles', function () {
    foreach ( array( 'elementor-icons-fa-solid', 'elementor-icons-fa-regular', 'elementor-icons-fa-brands', 'elementor-icons-fa-shared-0' ) as $handle ) {
        wp_dequeue_style( $handle );
    }
}, 20 );
```

Better still: use inline SVG for the ten icons you actually use and drop the font entirely. An icon font is typically 60–200KB to render a handful of glyphs, and it blocks text rendering.

### jQuery

Core still ships jQuery, but most theme JS no longer needs it. Removing the dependency is worth ~30KB and a parse cost. Check honestly:

```bash
rg -n "jQuery|\\\$\(" --glob '*.js' --glob '!*.min.js' | head -20
```

Do not deregister core's jQuery to replace it with a CDN version — plugins depend on the bundled build and its `noConflict` setup.

### Render-blocking CSS

```php
add_action( 'wp_enqueue_scripts', function () {
    // Non-critical CSS loaded without blocking render
    wp_enqueue_style( 'mytheme-extra', MYTHEME_URI . '/assets/css/extra.css', array(), MYTHEME_VERSION );
    wp_style_add_data( 'mytheme-extra', 'media', 'print' );
} );
add_filter( 'style_loader_tag', function ( $tag, $handle ) {
    if ( 'mytheme-extra' === $handle ) {
        $tag = str_replace( "media='print'", "media='print' onload=\"this.media='all'\"", $tag );
    }
    return $tag;
}, 10, 2 );
```

Use this sparingly — it causes a flash of unstyled content if applied to anything above the fold.

### Version assets properly

```php
wp_enqueue_style( 'mytheme', $uri, array(), MYTHEME_VERSION );   // good
wp_enqueue_style( 'mytheme', $uri, array(), time() );            // never
```

`time()` makes every request a cache miss forever. It appears in themes as a "fix" for stale CSS during development; it must not ship.

### Minified variants

Themes that ship `style.css` and `style.min.css` with a runtime toggle have a trap: change the source, forget the minified build, and the site keeps serving old code with no error. Automate the build or drop the dual-file scheme.

## Queries

### N+1

The most expensive pattern, and it hides well:

```php
// 1 + 3N queries: each get_post_meta and get_the_terms hits the DB
foreach ( $posts as $post ) {
    echo get_post_meta( $post->ID, 'subtitle', true );
    echo get_the_terms( $post->ID, 'category' )[0]->name;
}
```

`WP_Query` primes meta and term caches for its own results automatically. The bug appears when you disable that, or when you loop over IDs from a custom query:

```php
$q = new WP_Query( array(
    'post_type'              => 'post',
    'posts_per_page'         => 20,
    'update_post_meta_cache' => true,   // default; do not disable if you read meta
    'update_post_term_cache' => true,
    'no_found_rows'          => true,   // skip SQL_CALC_FOUND_ROWS when not paginating
) );
```

For IDs from elsewhere, prime the caches yourself:

```php
_prime_post_caches( $ids, true, true );
```

### Query arguments that cost

| Argument | Cost |
|---|---|
| `'posts_per_page' => -1` | Unbounded. On a large table this exhausts memory. Always cap. |
| `'meta_query'` on unindexed keys | Full scan of `wp_postmeta`. Prefer taxonomies for filtering. |
| `'orderby' => 'meta_value'` | Forces a join and filesort. |
| `'s' => $term` | `LIKE '%term%'` — unindexable. Use a real search index above a few thousand posts. |
| `'post__not_in'` | Expensive `NOT IN`. Over-fetch and filter in PHP instead. |
| `'no_found_rows' => false` | Adds a `COUNT(*)`. Set true when not paginating. |
| `'fields' => 'ids'` | Much cheaper when you only need IDs. |

### Autoloaded options

Every autoloaded option is unserialized on every request. Plugins that store large blobs autoloaded are a common cause of a slow site with no slow query:

```php
update_option( 'mytheme_cache', $big_array, false );   // false = do not autoload
```

Audit with the command at the top of this skill. Anything over 100KB autoloaded deserves scrutiny.

## Caching

### Transients

For expensive work with a tolerable staleness window:

```php
function mytheme_popular_posts() {
    $key   = 'mytheme_popular';
    $posts = get_transient( $key );

    if ( false === $posts ) {
        $posts = get_posts( array(
            'posts_per_page' => 5,
            'meta_key'       => 'view_count',
            'orderby'        => 'meta_value_num',
            'fields'         => 'ids',
        ) );
        set_transient( $key, $posts, HOUR_IN_SECONDS );
    }
    return $posts;
}
```

Two cautions. Without a persistent object cache, transients live in `wp_options` and a transient set with no expiry is autoloaded — leaking rows indefinitely. And `false` is a valid cached value that is indistinguishable from a miss; cache `array()` or a sentinel rather than `false`.

Invalidate on write, do not rely only on TTL:

```php
add_action( 'save_post', fn() => delete_transient( 'mytheme_popular' ) );
```

### Object cache

Redis or Memcached with a drop-in turns `wp_cache_*` into a real persistent cache and makes transients fast:

```php
$value = wp_cache_get( $key, 'mytheme' );
if ( false === $value ) {
    $value = expensive_operation();
    wp_cache_set( $key, $value, 'mytheme', HOUR_IN_SECONDS );
}
```

Without a drop-in, `wp_cache_*` is request-scoped only — still useful for avoiding repeated work within one page load, but nothing persists.

### Page caching

The largest single win for anonymous traffic, and it happens above your code: a full-page cache turns a 400ms PHP render into a static file served in single-digit milliseconds.

Rules: never cache logged-in users, never cache cart/checkout/account, and make sure cookies that change output bust the cache. Most performance plugins get this right by default; verify it rather than assuming.

## Images

```php
add_image_size( 'mytheme-card', 600, 400, true );
```

Every registered size is generated for **every** upload. Ten custom sizes on a site with 5,000 images is 50,000 files. Register only what the theme renders, and remove sizes you stopped using.

```php
// Trim core sizes you never output
add_filter( 'intermediate_image_sizes_advanced', function ( $sizes ) {
    unset( $sizes['medium_large'], $sizes['1536x1536'], $sizes['2048x2048'] );
    return $sizes;
} );
```

Serve responsive images — `the_post_thumbnail()` emits `srcset` and `sizes` automatically, which hand-written `<img>` tags do not. WordPress adds `loading="lazy"` by default; explicitly disable it on the LCP image, because lazy-loading the hero delays the metric you are trying to improve:

```php
the_post_thumbnail( 'large', array( 'loading' => 'eager', 'fetchpriority' => 'high' ) );
```

Prefer WebP or AVIF. WordPress 5.8+ supports WebP natively; conversion plugins or a CDN handle the rest.

## Core Web Vitals

**LCP (< 2.5s)** — usually the hero image or a web font. Preload the LCP image, `fetchpriority="high"`, no lazy loading, and make sure the page cache is serving it. Self-host fonts with `font-display: swap`.

**CLS (< 0.1)** — always set `width` and `height` on images so the browser reserves space (`the_post_thumbnail()` does this). Reserve space for ads, embeds and cookie banners. Avoid injecting elements above existing content after load.

**INP (< 200ms)** — replaced FID in 2024 and is where jQuery-heavy themes now fail. Break long tasks, debounce scroll and resize handlers, and remove work from the main thread. A theme that runs a layout calculation on every `scroll` event will fail INP no matter what else is optimized.

## Auditing a theme

```bash
# Everything enqueued unconditionally
rg -n "wp_enqueue_(script|style)" --glob '*.php' -A2 | rg -v "is_|has_" | head -40

# Queries inside template files — usually a smell
rg -n "new WP_Query|get_posts\(" --glob '*.php' | head -30

# Unbounded queries
rg -n "posts_per_page['\"]?\s*=>\s*-1" --glob '*.php'

# Cache-busting by timestamp
rg -n "time\(\)|filemtime\(" --glob '*.php' | rg "enqueue|register" 

# Total shipped asset weight
find . -name '*.css' -o -name '*.js' | xargs du -ch 2>/dev/null | tail -1
```

## What not to do

- **Do not stack performance plugins.** Two minifiers fight and produce broken CSS. Pick one.
- **Do not concatenate assets blindly** under HTTP/2 — multiplexing means many small files are fine, and one giant bundle hurts caching.
- **Do not remove the REST API or heartbeat wholesale.** The block editor and autosave depend on them. Throttle the heartbeat instead:
  ```php
  add_filter( 'heartbeat_settings', function ( $s ) { $s['interval'] = 60; return $s; } );
  ```
- **Do not chase a 100 PageSpeed score.** It measures a synthetic load, not your users. Field data in Search Console reflects reality.
