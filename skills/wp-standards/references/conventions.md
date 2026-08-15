# Conventions: i18n, hooks, paths, PHP and tooling

## Contents

- [Internationalization](#internationalization)
- [Hooks](#hooks)
- [File and path conventions](#file-and-path-conventions)
- [PHP compatibility](#php-compatibility)
- [Tooling](#tooling)

## Internationalization

Every user-facing string passes through a translation function with a **literal** text domain matching the `Text Domain:` header — variables and constants break the string extractor:

```php
esc_html_e( 'Read more', 'mytheme' );              // good
esc_html_e( 'Read more', $domain );                // invisible to WP-CLI i18n make-pot
_n( '%s comment', '%s comments', $count, 'mytheme' );
_x( 'Post', 'noun', 'mytheme' );                   // disambiguate homographs
```

Add `/* translators: */` comments directly above any string with placeholders — translators otherwise see `%1$s %2$s` with no context. Use numbered placeholders (`%1$s`) whenever there is more than one, so translators can reorder them.

Details on POT generation, WPML/Polylang and RTL live in the `wp-i18n-rtl` skill.

## Hooks

Use `after_setup_theme` for theme supports and menus, `init` for post types and taxonomies, `wp_enqueue_scripts` for front-end assets, `admin_enqueue_scripts` for admin. Registering a post type on `after_setup_theme` is too early for some integrations; on `wp_loaded` it is too late for rewrite rules.

Never enqueue by echoing `<script>` or `<link>` into `wp_head` — that bypasses dependency resolution, versioning and the concatenation layer:

```php
add_action( 'wp_enqueue_scripts', 'mytheme_assets' );
function mytheme_assets() {
    wp_enqueue_style( 'mytheme', get_template_directory_uri() . '/style.css', array(), MYTHEME_VERSION );
    wp_enqueue_script( 'mytheme', get_template_directory_uri() . '/js/main.js', array(), MYTHEME_VERSION, true );
    wp_localize_script( 'mytheme', 'myThemeData', array(
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( 'mytheme_ajax' ),
    ) );
}
```

Version assets with the theme/plugin version constant, not `time()` — `time()` defeats browser caching permanently.

## File and path conventions

- Guard every PHP file that could be requested directly: `if ( ! defined( 'ABSPATH' ) ) { exit; }`
- `get_template_directory()` for parent-theme paths, `get_stylesheet_directory()` for child-aware paths. Mixing them up is the single most common child-theme bug.
- Use `_uri()` variants for URLs, plain variants for filesystem paths. `get_template_directory_uri()` in a `require` is broken code that sometimes appears to work.
- Never `require` a file whose path comes from user input.

## PHP compatibility

Declare `Requires PHP:` in the theme/plugin header and mean it. Check what the target version supports before using: arrow functions (7.4), null coalescing assignment `??=` (7.4), named arguments and `match` (8.0), readonly properties (8.1), typed constants (8.3). If you support 7.4, run the linter against 7.4 — not against your local PHP.

## Tooling

```bash
composer require --dev wp-coding-standards/wpcs dealerdirect/phpcodesniffer-composer-installer
vendor/bin/phpcs --standard=WordPress --extensions=php .
vendor/bin/phpcbf --standard=WordPress .
```

`phpcs` with the `WordPress` standard catches most escaping and prefixing violations automatically. It does **not** catch missing capability checks, fake `prepare()` calls, or unsafe `nopriv` endpoints — those need the review discipline above, or the scanner in the `wp-security-audit` skill.

For deeper reference material, read `references/escaping-cheatsheet.md` for a full context→function mapping, and `references/capabilities.md` for the capability map.
