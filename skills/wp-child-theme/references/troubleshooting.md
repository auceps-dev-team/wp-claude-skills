# Overrides, assets and troubleshooting

## Contents

- [Overriding assets and images](#overriding-assets-and-images)
- [Translations](#translations)
- [Debugging "my override isn't working"](#debugging-my-override-isnt-working)
- [Scaffold](#scaffold)

## Overriding assets and images

The parent's `get_template_directory_uri()` calls always point at the parent. To replace an image or script, either override the template that references it, or filter the URL if the parent offers a filter. Where neither exists, dequeue and re-enqueue:

```php
add_action( 'wp_enqueue_scripts', function () {
    wp_dequeue_script( 'mytheme-slider' );
    wp_enqueue_script( 'mytheme-child-slider', get_stylesheet_directory_uri() . '/assets/js/slider.js', array( 'jquery' ), '1.0.0', true );
}, 100 );   // late, so the parent has registered first
```

## Translations

```php
add_action( 'after_setup_theme', function () {
    load_child_theme_textdomain( 'mytheme-child', get_stylesheet_directory() . '/languages' );
} );
```

Strings you copy from a parent template keep the **parent's** text domain — leave them alone. Only strings you write yourself use the child's domain. Mixing domains within one file is normal and correct here.

## Debugging "my override isn't working"

Work through in this order:

1. **Is the child active?** Appearance → Themes. Activating the parent by accident after an update is common.
2. **Does `Template:` match the parent folder name exactly?** Case-sensitive, and it is the *directory*, not the display name.
3. **Is the file path identical?** `template-parts/content.php` and `template_parts/content.php` are different files.
4. **Is CSS load order right?** Inspect in the browser: the child's `style.css` must come after the parent's. If not, the dependency array is wrong.
5. **Is specificity the problem?** The child's rule may load last and still lose. Check the computed styles, and do not reach for `!important` before you have looked.
6. **Is the parent using `get_template_directory_uri()` for that asset?** Then it will never point at your child.
7. **Is the template even being used?** Confirm with `template_include` — see the `wp-theme-classic` skill.
8. **Is a caching layer serving stale CSS?** Bump the child version in `style.css` and purge.

## Scaffold

```php
<?php
/**
 * Child theme functions.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'MYTHEME_CHILD_VERSION', wp_get_theme()->get( 'Version' ) );

add_action( 'wp_enqueue_scripts', 'mytheme_child_enqueue', 20 );
function mytheme_child_enqueue() {
    wp_enqueue_style(
        'mytheme-child',
        get_stylesheet_directory_uri() . '/style.css',
        array( 'mytheme' ),
        MYTHEME_CHILD_VERSION
    );
}

add_action( 'after_setup_theme', function () {
    load_child_theme_textdomain( 'mytheme-child', get_stylesheet_directory() . '/languages' );
} );
```
