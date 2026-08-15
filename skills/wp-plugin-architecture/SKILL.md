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

## The companion plugin pattern

Commercial themes split themselves in two: the theme handles presentation, a companion plugin registers everything that must survive a theme switch. Moody's Insight Core is a representative example — it registers five post types (`case_study`, `portfolio`, `project`, `service`, `testimonial`) and seven taxonomies, while the theme itself registers **none**.

That is the pattern working as intended. It also creates two obligations people miss:

**The content now depends on the plugin, not the theme.** Deactivate Insight Core and the portfolio disappears, along with the footer — which in that theme is a post of a plugin-registered CPT rendered through `the_content()`. When you inherit such a site, establish which component owns the content before touching either.

**A companion plugin is a plugin, with a plugin's obligations.** These tend to be the least reviewed code in the package: they arrive as a ZIP, install through TGMPA, and update only when the theme author ships a new theme release. Measured on two real companions, they carry substantially more risk than the themes they support — Insight Core alone scans with 17 critical findings across 276 files against 7 for its 356-file theme.

If you are writing one:

- Register post types with `show_in_rest => true` and a stable key. The key is written into every row of `wp_posts`; renaming it orphans all content.
- Do not vendor whole frameworks into it. Insight Core bundles complete copies of Kirki (129 classes) and CMB2 (67 classes); those copies never receive upstream security fixes and no dependency scanner can see them. Require the library through Composer, or depend on the plugin.
- Give it its own version, changelog and update path, independent of the theme.
- Prefix its hooks and treat them as public API — the theme will call them, and so will the customer's site-specific code.

## What a well-maintained plugin looks like

Most WordPress plugin code you will read is not good, so it helps to have a concrete reference point. Envato Market 2.0.12 — a small, vendor-maintained updater plugin — is the cleanest package in the corpus these skills were built from, and the comparison against a theme companion plugin of similar age is instructive:

| Signal | Envato Market (29 files) | A theme companion (82 files) |
|---|---|---|
| `current_user_can` | 29 — **one per file** | 4 — one per 20 files |
| `check_admin_referer` / `check_ajax_referer` | 7 | 1 |
| HTTP via `wp_remote_*` | 15 | 3 (rest use `file_get_contents`) |
| `@since` docblocks | 189 | **0** |
| `esc_html` / `esc_attr` | 133 — 4.6 per file | 4376 — **53 per file** |
| Critical scanner findings | **0** | 1, plus 20 high |

The last two rows are the important ones, and they point the opposite way from intuition. The companion plugin escapes **eleven times more per file** and is far less safe. Escaping density measures how much markup a file emits, not how carefully it was written. What separates the two is one capability check per file versus one per twenty.

Structurally, Envato Market does four things worth copying:

- **One class per file, named `class-{thing}.php`** — the WordPress core convention, so any WordPress developer can navigate it cold.
- **Views separated from logic.** `inc/admin/view/` splits into `partials/`, `notice/` and `callback/`, and contains no business logic. The classes never emit markup.
- **A dedicated API class.** All remote calls go through `class-envato-market-api.php` rather than being scattered — which is why every one of them uses `wp_remote_*` and honours the site's proxy and timeout settings.
- **`@since` on everything.** 189 docblocks recording when each piece was introduced. This is what makes a deprecation policy possible; without it, nobody can tell what is safe to remove.

Copy the discipline, not the size. A capability check on every entry point costs one line each.

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

## Extensibility

Expose hooks. A plugin with no hooks forces users to fork it.

```php
$items = apply_filters( 'myplugin_items', $items, $context );
do_action( 'myplugin_before_render', $item );
```

Prefix every hook name, document the arguments, and treat them as a public API — renaming a filter breaks every integration silently.

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/data-and-admin.md`](references/data-and-admin.md) | Custom post types and taxonomies, Settings API, admin pages, metaboxes |
| [`references/rest-cron-tables.md`](references/rest-cron-tables.md) | REST route registration and schemas, scheduled events, custom tables and migrations |
