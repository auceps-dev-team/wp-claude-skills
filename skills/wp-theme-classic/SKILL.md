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

- `front-page.php` wins over **both** the static page template and `home.php`. A theme with `front-page.php` ignores the user's Reading settings, which surprises everyone. Only ship it if the front page is genuinely special.
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

## functions.php

Keep it a table of contents, not an implementation. Anything longer than a screen belongs in `inc/`.

```php
<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'MYTHEME_VERSION', wp_get_theme()->get( 'Version' ) );
define( 'MYTHEME_DIR', get_template_directory() );
define( 'MYTHEME_URI', get_template_directory_uri() );

require_once MYTHEME_DIR . '/inc/setup.php';
require_once MYTHEME_DIR . '/inc/enqueue.php';
require_once MYTHEME_DIR . '/inc/template-tags.php';
require_once MYTHEME_DIR . '/inc/customizer.php';
```

Reading `Version` from the stylesheet header keeps one source of truth — hard-coding it in a constant guarantees it drifts from `style.css`.

### Theme setup

```php
add_action( 'after_setup_theme', 'mytheme_setup' );
function mytheme_setup() {
    load_theme_textdomain( 'mytheme', MYTHEME_DIR . '/languages' );

    add_theme_support( 'automatic-feed-links' );
    add_theme_support( 'title-tag' );
    add_theme_support( 'post-thumbnails' );
    add_theme_support( 'html5', array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' ) );
    add_theme_support( 'customize-selective-refresh-widgets' );
    add_theme_support( 'responsive-embeds' );
    add_theme_support( 'align-wide' );
    add_theme_support( 'editor-styles' );
    add_editor_style( 'assets/css/editor.css' );
    add_theme_support( 'custom-logo', array(
        'height'      => 60,
        'width'       => 200,
        'flex-width'  => true,
        'flex-height' => true,
    ) );

    register_nav_menus( array(
        'primary' => esc_html__( 'Primary Menu', 'mytheme' ),
        'footer'  => esc_html__( 'Footer Menu', 'mytheme' ),
    ) );

    add_image_size( 'mytheme-card', 600, 400, true );
}
```

`add_theme_support( 'title-tag' )` means you must **not** output a `<title>` in `header.php`. `html5` with `style` and `script` removes the obsolete `type` attributes.

### Enqueueing

```php
add_action( 'wp_enqueue_scripts', 'mytheme_assets' );
function mytheme_assets() {
    wp_enqueue_style( 'mytheme', get_stylesheet_uri(), array(), MYTHEME_VERSION );

    wp_enqueue_script( 'mytheme-nav', MYTHEME_URI . '/assets/js/navigation.js', array(), MYTHEME_VERSION, true );

    wp_localize_script( 'mytheme-nav', 'myThemeData', array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( 'mytheme_ajax' ),
    ) );

    if ( is_singular() && comments_open() && get_option( 'thread_comments' ) ) {
        wp_enqueue_script( 'comment-reply' );   // core handle; only load where needed
    }
}
```

`get_stylesheet_uri()` rather than `get_template_directory_uri() . '/style.css'` — the former resolves to the child theme's stylesheet when one is active.

Use the version constant, never `time()`. `time()` disables browser caching permanently and turns every page view into a fresh download.

## header.php and footer.php

```php
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link screen-reader-text" href="#content"><?php esc_html_e( 'Skip to content', 'mytheme' ); ?></a>
```

`wp_head()`, `wp_body_open()`, `wp_footer()`, `body_class()` and `language_attributes()` are all load-bearing — plugins, the admin bar and the block editor all inject through them. A theme missing `wp_footer()` breaks in ways that look unrelated.

## Navigation

```php
wp_nav_menu( array(
    'theme_location' => 'primary',
    'container'      => 'nav',
    'container_class'=> 'main-nav',
    'menu_class'     => 'menu',
    'depth'          => 3,
    'fallback_cb'    => false,   // render nothing rather than a page list when unassigned
) );
```

Write a custom `Walker_Nav_Menu` subclass only when the markup genuinely cannot be produced by classes and filters — walkers are the hardest part of a theme to maintain, and `nav_menu_css_class`, `nav_menu_item_args` and `walker_nav_menu_start_el` cover most needs. For megamenus, prefer storing configuration in menu item meta over subclassing the edit walker.

## Widget areas

```php
add_action( 'widgets_init', 'mytheme_widgets' );
function mytheme_widgets() {
    register_sidebar( array(
        'name'          => esc_html__( 'Sidebar', 'mytheme' ),
        'id'            => 'sidebar-1',
        'description'   => esc_html__( 'Appears on posts and archives.', 'mytheme' ),
        'before_widget' => '<section id="%1$s" class="widget %2$s">',
        'after_widget'  => '</section>',
        'before_title'  => '<h2 class="widget-title">',
        'after_title'   => '</h2>',
    ) );
}
```

The `%1$s` / `%2$s` placeholders in `before_widget` are required — omit them and widget IDs and classes disappear, breaking most widget CSS.

## Conditional tags

`is_front_page()` vs `is_home()`: the first is the site's front page, the second is the blog posts index. On a default install both are true for `/`; on a site with a static front page they are different pages. Getting this backwards is the most common template bug.

`is_singular()` covers posts, pages and CPTs. `is_single()` excludes pages. `is_page()` covers only pages.

Conditional tags are unreliable before `wp` runs — inside `after_setup_theme` or `init` the query does not exist yet, and calling them there returns false and emits a notice on modern WordPress.

## What to hand off to other skills

- Options, Customizer, per-section overrides → `wp-theme-options`
- `theme.json`, block editor integration, patterns → `wp-theme-block-fse`
- Skins, demo import, header/footer builders, multi-layout architecture → `wp-theme-multipurpose`
- Overriding a parent theme → `wp-child-theme`
- Escaping and sanitizing rules → `wp-standards`
