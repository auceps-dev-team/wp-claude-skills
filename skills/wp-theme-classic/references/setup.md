# Theme setup and document shell

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
