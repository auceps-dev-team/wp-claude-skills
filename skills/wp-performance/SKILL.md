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

Measured across three commercial themes, the shape of the problem is consistent:

| Theme | `wp_enqueue_*` calls | Guarded by a conditional | CSS | JS | Fonts & icons |
|---|---|---|---|---|---|
| A | 36 | 2 (6%) | 205 KB | 52 KB | **2.2 MB** |
| B | 176 | 20 (11%) | **13 MB** | 833 KB | 1.7 MB |
| C | 76 | 8 (11%) | 1.3 MB | 1.6 MB | **7.7 MB** |

Two things fall out of that table.

**Roughly 90% of enqueues are unconditional** — no `is_singular()`, no `has_block()`, no option check. Every visitor downloads the map library on the privacy policy page.

**The fonts outweigh the code.** Theme A ships 2.2 MB of font and icon files against 257 KB of CSS and JS combined — 8.5× more font than code. Theme C ships 7.7 MB. This is almost always icon fonts: a full Font Awesome set to render a dozen glyphs, frequently duplicated because the theme ships one copy and the page builder ships another.

So before optimizing anything clever, count what the theme actually ships:

```bash
find . -name '*.woff*' -o -name '*.ttf' -o -name '*.eot' | du -ch --files0-from=- 2>/dev/null | tail -1
rg -c "wp_enqueue_(script|style)\(" --glob '*.php'
rg -B2 "wp_enqueue_(script|style)\(" --glob '*.php' | rg -c "is_|has_block|has_shortcode"
```

The ratio of the second number to the third is the single best predictor of how much easy performance work is available.

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

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/queries-and-caching.md`](references/queries-and-caching.md) | N+1 patterns, expensive query arguments, autoloaded options, transients, object and page cache |
| [`references/delivery.md`](references/delivery.md) | Image sizes and responsive markup, Core Web Vitals (LCP, CLS, INP) |
