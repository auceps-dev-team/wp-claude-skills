# REST, cron and custom tables

## Contents

- [REST endpoints](#rest-endpoints)
- [Cron](#cron)
- [Custom tables](#custom-tables)

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
