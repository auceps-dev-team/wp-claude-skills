---
name: wp-theme-classic
description: Build and modify classic PHP WordPress themes — template hierarchy, template parts, the loop, hooks, conditional tags, asset enqueueing, navigation walkers, widget areas and comments. Use this whenever creating a theme from scratch, adding or changing a template file (single.php, archive.php, page templates, 404), working with get_template_part, fixing why the wrong template renders, or customizing markup in any non-block WordPress theme.
---

# Classic WordPress themes

Classic themes resolve a URL to a PHP file through the template hierarchy, then render the loop. Everything else — options, builders, frameworks — is built on top of that. Get the hierarchy right and the rest follows.

## Minimum viable theme

Two files make a valid theme: `style.css` with a header block, and `index.php`. Everything beyond that is specialization.

```
mytheme/
├── style.css          # header block; may hold no CSS at all
├── index.php          # ultimate fallback for every request
├── functions.php      # setup, enqueues, registrations
├── screenshot.png     # 1200×900
├── header.php  footer.php  sidebar.php
├── front-page.php  home.php
├── single.php  page.php  archive.php  search.php  404.php
├── comments.php  searchform.php
├── template-parts/
│   ├── content.php  content-none.php
│   └── header/  footer/
├── inc/               # PHP that is not a template
└── assets/            # css, js, images, fonts
```

`style.css` header — `Text Domain` must match the folder name for translations to load from `wp-content/languages/themes/`:

```css
/*
Theme Name: My Theme
Theme URI: https://example.com/mytheme
Author: Name
Description: One clear sentence.
Version: 1.0.0
Requires at least: 6.0
Requires PHP: 7.4
Tested up to: 6.7
License: GNU General Public License v2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html
Text Domain: mytheme
Tags: custom-menu, featured-images, translation-ready
*/
```

## Template hierarchy

WordPress walks from most specific to least, taking the first file that exists. Knowing the order is how you answer "why is the wrong template rendering?".

| Request | Order |
|---|---|
| Single post | `single-post-{slug}.php` → `single-post.php` → `single.php` → `singular.php` → `index.php` |
| Single CPT | `single-{post_type}-{slug}.php` → `single-{post_type}.php` → `single.php` → `singular.php` → `index.php` |
| Page | custom template → `page-{slug}.php` → `page-{id}.php` → `page.php` → `singular.php` → `index.php` |
| Category | `category-{slug}.php` → `category-{id}.php` → `category.php` → `archive.php` → `index.php` |
| Custom taxonomy | `taxonomy-{tax}-{term}.php` → `taxonomy-{tax}.php` → `taxonomy.php` → `archive.php` → `index.php` |
| CPT archive | `archive-{post_type}.php` → `archive.php` → `index.php` |
| Blog index | `home.php` → `index.php` |
| Front page | `front-page.php` → (`home.php` or `page.php` per Settings → Reading) |
| Search | `search.php` → `index.php` |
| 404 | `404.php` → `index.php` |

Two traps worth naming:

- `front-page.php` wins over **both** the static page template and `home.php`. A theme with `front-page.php` ignores the user's Reading settings, which surprises everyone. Only ship it if the front page is genuinely special — and if you do, handle the case where Reading is still on *latest posts*, because the main query is then the **blog loop, not a page**. A `front-page.php` that assumes a page and calls `the_content()` on that loop prints every post's full body end to end, with no titles and no links. That is what a fresh install shows until the front page is assigned, so it is the first thing a client sees:

  ```php
  if ( ! is_page() ) {
      // Reading is on "latest posts": render the post list, not page content.
      while ( have_posts() ) : the_post();
          get_template_part( 'template-parts/content/content', get_post_type() );
      endwhile;
      return;
  }
  ```
- `home.php` is the *blog posts index*, not the homepage. The naming is historical.

Debug with `template_include`:

```php
add_filter( 'template_include', function ( $template ) {
    if ( current_user_can( 'manage_options' ) && isset( $_GET['whichtemplate'] ) ) {
        echo '<!-- template: ' . esc_html( $template ) . ' -->';
    }
    return $template;
}, 999 );
```

## The loop

```php
<?php if ( have_posts() ) : ?>
    <?php while ( have_posts() ) : the_post(); ?>
        <?php get_template_part( 'template-parts/content', get_post_type() ); ?>
    <?php endwhile; ?>
    <?php the_posts_pagination( array(
        'mid_size'  => 2,
        'prev_text' => esc_html__( 'Previous', 'mytheme' ),
        'next_text' => esc_html__( 'Next', 'mytheme' ),
    ) ); ?>
<?php else : ?>
    <?php get_template_part( 'template-parts/content', 'none' ); ?>
<?php endif; ?>
```

`the_post()` sets up the global `$post` and post data — without it, `the_title()` and friends read whatever was last set.

**Never modify the main query with `query_posts()`.** It replaces the global query, breaks pagination and conditional tags, and is effectively deprecated. To change what the main query returns, filter it:

```php
add_action( 'pre_get_posts', function ( $query ) {
    if ( is_admin() || ! $query->is_main_query() ) {
        return;
    }
    if ( $query->is_post_type_archive( 'portfolio' ) ) {
        $query->set( 'posts_per_page', 12 );
        $query->set( 'orderby', 'menu_order' );
    }
} );
```

The `is_admin() || ! $query->is_main_query()` guard is mandatory — without it you also rewrite every widget query, every menu query and the admin list tables.

For a *secondary* loop, use `WP_Query` and always reset:

```php
$related = new WP_Query( array(
    'post_type'           => 'post',
    'posts_per_page'      => 3,
    'post__not_in'        => array( get_the_ID() ),
    'ignore_sticky_posts' => true,
    'no_found_rows'       => true,   // skip the COUNT query when not paginating
) );
if ( $related->have_posts() ) {
    while ( $related->have_posts() ) {
        $related->the_post();
        get_template_part( 'template-parts/content', 'card' );
    }
    wp_reset_postdata();   // restores the global $post — omitting this corrupts everything after
}
```

## Template parts

`get_template_part()` is child-theme aware and cannot escape the theme directory, which is why it is preferable to `include`.

```php
get_template_part( 'template-parts/content', get_post_format() );
// looks for content-{format}.php, falls back to content.php

get_template_part( 'template-parts/card', 'product', array( 'columns' => 3 ) );
// third argument (WP 5.5+) arrives as $args in the part
```

Inside the part:

```php
<?php
$columns = $args['columns'] ?? 4;
?>
<div class="card card--<?php echo esc_attr( $columns ); ?>col">
```

Granularity is a real design decision. One commercial theme ships `loop/blog-classic/format-video.php`, `loop/blog-feature/format-quote.php` and so on — style × post-format, dozens of near-identical files. It is trivially customizable and miserable to maintain: one markup fix means editing thirty files. Prefer parameterized parts, and split only when the markup genuinely diverges.

## What to hand off to other skills

- Options, Customizer, per-section overrides → `wp-theme-options`
- `theme.json`, block editor integration, patterns → `wp-theme-block-fse`
- Skins, demo import, header/footer builders, multi-layout architecture → `wp-theme-multipurpose`
- Overriding a parent theme → `wp-child-theme`
- Escaping and sanitizing rules → `wp-standards`

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/setup.md`](references/setup.md) | functions.php organisation, theme supports, enqueueing, header.php and footer.php |
| [`references/components.md`](references/components.md) | wp_nav_menu and walkers, widget areas, conditional tags and their traps |
