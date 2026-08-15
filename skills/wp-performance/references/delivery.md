# Image and metric delivery

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
