---
name: wp-plugin-architecture
description: Build WordPress plugins with sound architecture — main file headers, activation/deactivation/uninstall lifecycle, PSR-4 autoloading, custom post types and taxonomies, the Settings API, admin pages, metaboxes, REST endpoints, cron, custom database tables and migrations. Use this whenever creating a plugin from scratch, adding a custom post type or taxonomy, building an admin settings screen, registering REST routes or scheduled tasks, or restructuring plugin code that has outgrown a single file.
---

# Plugin architecture

The rule that decides most structure questions: **content and functionality belong in a plugin, presentation belongs in a theme.** A custom post type registered in a theme makes its content invisible the moment the user switches themes. If you are unsure where something goes, ask what should survive a theme change.

## Main file

```php
<?php
/**
 * Plugin Name:       My Plugin
 * Plugin URI:        https://example.com/my-plugin
 * Description:       One sentence describing what it does.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Name
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       my-plugin
 * Domain Path:       /languages
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'MYPLUGIN_VERSION', '1.0.0' );
define( 'MYPLUGIN_FILE', __FILE__ );
define( 'MYPLUGIN_PATH', plugin_dir_path( __FILE__ ) );
define( 'MYPLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once MYPLUGIN_PATH . 'vendor/autoload.php';

register_activation_hook( __FILE__, array( \MyPlugin\Lifecycle::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( \MyPlugin\Lifecycle::class, 'deactivate' ) );

add_action( 'plugins_loaded', array( \MyPlugin\Plugin::class, 'instance' ) );
```

Keep the main file to metadata and bootstrapping. Everything else lives in `includes/`.

Guard against unsupported PHP *before* loading code that would fatal on it — a white screen tells the user nothing:

```php
if ( version_compare( PHP_VERSION, '7.4', '<' ) ) {
    add_action( 'admin_notices', function () {
        printf(
            '<div class="notice notice-error"><p>%s</p></div>',
            esc_html__( 'My Plugin requires PHP 7.4 or higher.', 'my-plugin' )
        );
    } );
    return;
}
```

## Structure

```
my-plugin/
├── my-plugin.php
├── uninstall.php
├── composer.json
├── includes/
│   ├── class-plugin.php
│   ├── class-lifecycle.php
│   ├── PostTypes/  Admin/  Rest/  Frontend/
├── assets/  languages/  templates/
└── tests/
```

Use Composer PSR-4 autoloading rather than a `require` list — it scales and gives you a real namespace:

```json
{
  "autoload": { "psr-4": { "MyPlugin\\": "includes/" } },
  "config": { "optimize-autoloader": true }
}
```

Run `composer dump-autoload -o` for releases. If you cannot ship `vendor/`, write a small SPL autoloader — but never a growing list of `require_once` calls.

## Lifecycle

The three hooks do different things and are easy to confuse.

```php
namespace MyPlugin;

class Lifecycle {

    public static function activate() {
        if ( ! current_user_can( 'activate_plugins' ) ) {
            return;
        }
        self::create_tables();
        PostTypes\Book::register();   // register CPTs before flushing
        flush_rewrite_rules();
        add_option( 'myplugin_db_version', MYPLUGIN_VERSION );
    }

    public static function deactivate() {
        flush_rewrite_rules();
        wp_clear_scheduled_hook( 'myplugin_daily_task' );
    }
}
```

**Activation runs once, before `init`.** Post types registered on `init` do not exist yet, so you must register them explicitly before `flush_rewrite_rules()` or the permalinks 404 until the user re-saves permalinks. This is the classic "my CPT gives 404" bug.

**Never flush rewrite rules on `init`.** It is an expensive write on every request. Flush on activation only.

**Deactivation is not uninstall.** Do not delete data here — the user may be troubleshooting.

**Uninstall** goes in `uninstall.php`, which WordPress runs in isolation:

```php
<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) { exit; }
if ( ! current_user_can( 'delete_plugins' ) ) { return; }

if ( ! get_option( 'myplugin_delete_data_on_uninstall' ) ) {
    return;   // default to keeping data
}

delete_option( 'myplugin_settings' );
delete_option( 'myplugin_db_version' );

global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}myplugin_items" );
$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE %s", $wpdb->esc_like( '_myplugin_' ) . '%' ) );
```

Defaulting to *keeping* data is the respectful choice — an accidental deactivate-delete-reinstall cycle should not destroy a year of content. Offer the opt-in in settings.

On multisite, `uninstall.php` runs once for the network; iterate sites explicitly if you stored per-site data.

## Custom post types

```php
add_action( 'init', 'myplugin_register_book' );
function myplugin_register_book() {
    register_post_type( 'myplugin_book', array(
        'labels'       => array(
            'name'          => esc_html__( 'Books', 'my-plugin' ),
            'singular_name' => esc_html__( 'Book', 'my-plugin' ),
        ),
        'public'       => true,
        'has_archive'  => true,
        'rewrite'      => array( 'slug' => 'books', 'with_front' => false ),
        'menu_icon'    => 'dashicons-book',
        'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt', 'custom-fields' ),
        'show_in_rest' => true,          // required for the block editor
        'taxonomies'   => array( 'myplugin_genre' ),
    ) );
}
```

Decisions that are effectively permanent:

- **The post type key.** Max 20 characters, prefixed, and it is stored in every row of `wp_posts`. Renaming orphans all content.
- **`show_in_rest`.** Without it, the block editor falls back to the classic editor for that type.
- **`rewrite.slug`.** Changing it breaks every existing URL. Plan redirects before you do.
- **`capability_type`.** Default maps to `post` capabilities, so anyone who can edit posts can edit your CPT. To separate, set `capability_type` **and** `map_meta_cap => true`, then grant the new capabilities on activation — see `wp-standards/references/capabilities.md`.

Taxonomies follow the same shape; register them **before** the post types that reference them.

## Settings API

```php
add_action( 'admin_init', 'myplugin_settings' );
function myplugin_settings() {
    register_setting( 'myplugin_group', 'myplugin_settings', array(
        'type'              => 'array',
        'sanitize_callback' => 'myplugin_sanitize_settings',
        'default'           => array( 'per_page' => 10, 'layout' => 'grid' ),
    ) );

    add_settings_section( 'myplugin_general', esc_html__( 'General', 'my-plugin' ), '__return_false', 'myplugin' );

    add_settings_field( 'per_page', esc_html__( 'Items per page', 'my-plugin' ), 'myplugin_field_per_page', 'myplugin', 'myplugin_general' );
}

function myplugin_sanitize_settings( $input ) {
    return array(
        'per_page' => min( max( absint( $input['per_page'] ?? 10 ), 1 ), 100 ),
        'layout'   => in_array( $input['layout'] ?? '', array( 'grid', 'list' ), true ) ? $input['layout'] : 'grid',
    );
}
```

The Settings API handles the nonce and the capability check for you when you use `settings_fields()` in the form — which is the main reason to prefer it over a hand-rolled admin form. Roll your own only when you need something it cannot express, and then do the nonce and capability work yourself.

Store related settings as **one array option**, not twenty rows. Twenty autoloaded rows is twenty entries in the alloptions cache on every request.

## Admin pages

```php
add_action( 'admin_menu', function () {
    add_menu_page(
        esc_html__( 'My Plugin', 'my-plugin' ),
        esc_html__( 'My Plugin', 'my-plugin' ),
        'manage_options',                  // capability, enforced by WordPress
        'myplugin',
        'myplugin_render_page',
        'dashicons-admin-generic',
        60
    );
} );
```

The capability argument controls menu visibility **and** access, but only for the page callback. Any form handler you write is a separate entry point and needs its own check.

Enqueue admin assets only on your own screen — loading them everywhere is a common cause of conflicts with other plugins:

```php
add_action( 'admin_enqueue_scripts', function ( $hook ) {
    if ( 'toplevel_page_myplugin' !== $hook ) {
        return;
    }
    wp_enqueue_script( 'myplugin-admin', MYPLUGIN_URL . 'assets/js/admin.js', array( 'wp-element' ), MYPLUGIN_VERSION, true );
} );
```

## Metaboxes

```php
add_action( 'add_meta_boxes', function () {
    add_meta_box( 'myplugin_details', esc_html__( 'Details', 'my-plugin' ), 'myplugin_render_metabox', 'myplugin_book', 'side' );
} );

function myplugin_render_metabox( $post ) {
    wp_nonce_field( 'myplugin_save_meta', 'myplugin_meta_nonce' );
    $isbn = get_post_meta( $post->ID, '_myplugin_isbn', true );
    printf( '<input type="text" name="myplugin_isbn" value="%s" class="widefat">', esc_attr( $isbn ) );
}

add_action( 'save_post_myplugin_book', 'myplugin_save_meta' );
function myplugin_save_meta( $post_id ) {
    if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) { return; }
    if ( ! isset( $_POST['myplugin_meta_nonce'] )
         || ! wp_verify_nonce( sanitize_key( $_POST['myplugin_meta_nonce'] ), 'myplugin_save_meta' ) ) { return; }
    if ( ! current_user_can( 'edit_post', $post_id ) ) { return; }

    update_post_meta( $post_id, '_myplugin_isbn', sanitize_text_field( wp_unslash( $_POST['myplugin_isbn'] ?? '' ) ) );
}
```

All four guards are load-bearing. `current_user_can( 'edit_post', $post_id )` — with the ID — is what prevents a contributor writing meta onto another author's post.

Register meta for REST and the block editor:

```php
register_post_meta( 'myplugin_book', '_myplugin_isbn', array(
    'type'              => 'string',
    'single'            => true,
    'show_in_rest'      => true,
    'sanitize_callback' => 'sanitize_text_field',
    'auth_callback'     => fn( $allowed, $meta_key, $post_id ) => current_user_can( 'edit_post', $post_id ),
) );
```

A leading underscore hides meta from the custom-fields UI but does **not** make it private in REST — `auth_callback` is what controls that.

## REST endpoints

```php
add_action( 'rest_api_init', function () {
    register_rest_route( 'myplugin/v1', '/books/(?P<id>\d+)', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'myplugin_get_book',
        'permission_callback' => '__return_true',        // deliberately public
        'args'                => array(
            'id' => array(
                'required'          => true,
                'validate_callback' => fn( $v ) => is_numeric( $v ) && $v > 0,
                'sanitize_callback' => 'absint',
            ),
        ),
    ) );
} );
```

`permission_callback` is mandatory. `'__return_true'` is a decision to make the route public, not a placeholder. Use the `args` schema for validation — the REST layer rejects bad input before your callback runs, which is both safer and less code.

Version the namespace (`myplugin/v1`). It is a public contract.

## Cron

```php
if ( ! wp_next_scheduled( 'myplugin_daily_task' ) ) {
    wp_schedule_event( time(), 'daily', 'myplugin_daily_task' );
}
add_action( 'myplugin_daily_task', 'myplugin_run_daily' );
```

WP-Cron fires on page loads, so a low-traffic site runs it late and a high-traffic site runs it constantly. For anything that matters, disable the pseudo-cron and use a real one:

```php
define( 'DISABLE_WP_CRON', true );
// */5 * * * * curl -s https://example.com/wp-cron.php?doing_wp_cron >/dev/null
```

Always `wp_clear_scheduled_hook()` on deactivation, or the event keeps firing with no handler.

## Custom tables

Most data belongs in posts, meta, terms or options. A custom table is justified when you have high row counts with query patterns that meta cannot serve — logs, analytics, relational joins.

```php
function myplugin_create_tables() {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $table   = $wpdb->prefix . 'myplugin_items';
    $charset = $wpdb->get_charset_collate();

    dbDelta( "CREATE TABLE $table (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        post_id bigint(20) unsigned NOT NULL,
        value varchar(255) NOT NULL DEFAULT '',
        created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY  (id),
        KEY post_id (post_id)
    ) $charset;" );
}
```

`dbDelta` is fussy: two spaces after `PRIMARY KEY`, one field per line, `KEY` not `INDEX`. It also handles schema changes on re-run, which is how you migrate:

```php
add_action( 'plugins_loaded', function () {
    if ( version_compare( get_option( 'myplugin_db_version', '0' ), MYPLUGIN_VERSION, '<' ) ) {
        myplugin_create_tables();
        update_option( 'myplugin_db_version', MYPLUGIN_VERSION );
    }
} );
```

Every query against a custom table goes through `$wpdb->prepare()` with real placeholders.

## Extensibility

Expose hooks. A plugin with no hooks forces users to fork it.

```php
$items = apply_filters( 'myplugin_items', $items, $context );
do_action( 'myplugin_before_render', $item );
```

Prefix every hook name, document the arguments, and treat them as a public API — renaming a filter breaks every integration silently.
