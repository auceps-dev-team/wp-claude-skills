---
name: wp-standards
description: Core WordPress coding conventions — output escaping, input sanitizing, nonces and capabilities, prefixing, internationalization, hook usage, and PHP compatibility. Use this whenever writing or reviewing any WordPress PHP code, whether in a theme, a plugin, a mu-plugin or a snippet, even for a small change. Other WordPress skills defer to this one for the escaping/sanitizing/nonce rules, so consult it before writing PHP that touches user input, database queries, or HTML output.
---

# WordPress Coding Standards

This skill holds the rules that every other WordPress skill in this suite assumes. It is deliberately short: it covers the decisions that go wrong most often in real themes and plugins, not the whole WPCS ruleset.

## The one mental model that matters

WordPress security is not a checklist bolted on at the end — it is a discipline about **direction of data flow**:

```
INPUT  →  sanitize/validate  →  [ store / query ]  →  escape  →  OUTPUT
                                      ↑
                          nonce + capability guard the write
```

Three separate obligations, three separate mistakes:

| Obligation | Where | Failure mode |
|---|---|---|
| [`references/escaping-cheatsheet.md`](references/escaping-cheatsheet.md) | Output context to escaping function, input source to sanitizer, the functions that only look like sanitizers |
| [`references/capabilities.md`](references/capabilities.md) | Capability per action, meta capabilities and object IDs, the canonical save_post guard, CPT capabilities |
| Sanitize/validate | data coming *in* from `$_GET`, `$_POST`, `$_REQUEST`, `$_COOKIE`, REST, APIs | stored XSS, SQL injection, option poisoning |
| Escape | data going *out* to HTML, attributes, JS, URLs | reflected XSS |
| Authorize | any state change | privilege escalation, CSRF |

Real audits of commercial themes show the escaping obligation is usually met while the other two are ignored. Escaping alone does not make code safe. When you review, check all three independently.

## Escaping on output

Escape as late as possible, at the point of output, matched to the context:

```php
echo esc_html( $title );                            // text node
printf( '<a href="%s">', esc_url( $link ) );        // URL
printf( '<div class="%s">', esc_attr( $class ) );   // HTML attribute
printf( '<script>var x = %s;</script>', wp_json_encode( $data ) ); // inline JS data
echo wp_kses_post( $rich_html );                    // HTML you intend to keep
echo esc_textarea( $value );                        // textarea contents
```

`esc_js()` is for values inside a *single-quoted* JS string only, and is easy to misuse — prefer `wp_json_encode()`, or `wp_localize_script()` / `wp_add_inline_script()` to pass data to JS.

Translation functions have escaping variants; use them instead of wrapping:

```php
esc_html_e( 'Read more', 'textdomain' );
echo esc_attr__( 'Search', 'textdomain' );
printf( esc_html__( 'Posted on %s', 'textdomain' ), esc_html( $date ) );
```

For `printf`-style strings with markup, escape the *placeholders*, not the whole result:

```php
printf(
    /* translators: %s: author name */
    wp_kses_post( __( 'Written by <strong>%s</strong>', 'textdomain' ) ),
    esc_html( $author )
);
```

## Sanitizing on input

Never read a superglobal and use the value directly. Pick the sanitizer that matches the *expected shape*, not the one that looks safest:

```php
$id     = absint( $_GET['id'] ?? 0 );
$search = sanitize_text_field( wp_unslash( $_GET['s'] ?? '' ) );
$email  = sanitize_email( wp_unslash( $_POST['email'] ?? '' ) );
$slug   = sanitize_key( $_POST['view'] ?? '' );
$url    = esc_url_raw( wp_unslash( $_POST['url'] ?? '' ) );  // esc_url_raw for storage, esc_url for output
$html   = wp_kses_post( wp_unslash( $_POST['bio'] ?? '' ) );
```

`wp_unslash()` matters: WordPress adds slashes to superglobals, so skipping it stores literal backslashes.

For a fixed set of values, validate against a whitelist rather than sanitizing — sanitizing accepts anything that *looks* clean, validating accepts only what you actually support:

```php
$layout   = $_POST['layout'] ?? 'grid';
$allowed  = array( 'grid', 'list', 'masonry' );
$layout   = in_array( $layout, $allowed, true ) ? $layout : 'grid';
```

## Database access

Use the WordPress APIs — `WP_Query`, `get_posts()`, `get_option()`, `update_post_meta()` — before reaching for `$wpdb`. When you do need `$wpdb`, `prepare()` is only protective if the values pass through placeholders:

```php
// Broken. This is prepare() in name only — the value is already in the string,
// and since WP 6.2 a prepare() call with no placeholders also emits a _doing_it_wrong notice.
$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->postmeta} SET meta_value = REPLACE(meta_value, '" . $from . "', '" . $to . "')" ) );

// Correct.
$wpdb->query( $wpdb->prepare(
    "UPDATE {$wpdb->postmeta} SET meta_value = REPLACE( meta_value, %s, %s ) WHERE meta_key = %s",
    $from,
    $to,
    '_elementor_data'
) );
```

Table names cannot be placeholders — build them from `$wpdb->prefix` or `$wpdb->postmeta`, never from user input. `%i` (WP 6.2+) handles identifiers when you genuinely need a dynamic column name.

## Authorization: nonce *and* capability

These answer different questions and you need both:

- **Nonce** — "did this request originate from our own UI?" (blocks CSRF)
- **Capability** — "is this user allowed to do it at all?" (blocks privilege escalation)

A nonce is not a permission check. An admin-only nonce still verifies for a subscriber who obtained one.

```php
// Form
wp_nonce_field( 'mytheme_save_settings', 'mytheme_nonce' );

// Handler
if ( ! isset( $_POST['mytheme_nonce'] )
     || ! wp_verify_nonce( sanitize_key( $_POST['mytheme_nonce'] ), 'mytheme_save_settings' ) ) {
    wp_die( esc_html__( 'Security check failed.', 'textdomain' ) );
}
if ( ! current_user_can( 'manage_options' ) ) {
    wp_die( esc_html__( 'Insufficient permissions.', 'textdomain' ) );
}
```

### AJAX handlers

This is where themes leak most often. Every `wp_ajax_*` callback needs verification, and `wp_ajax_nopriv_*` deserves extra thought — it is reachable by anyone on the internet:

```php
add_action( 'wp_ajax_mytheme_load_more',        'mytheme_load_more' );
add_action( 'wp_ajax_nopriv_mytheme_load_more', 'mytheme_load_more' );

function mytheme_load_more() {
    check_ajax_referer( 'mytheme_ajax', 'nonce' );        // dies on failure

    $page = absint( $_POST['page'] ?? 1 );
    $page = min( $page, 100 );                             // bound it: unbounded paging is a DoS vector

    wp_send_json_success( array( 'html' => mytheme_render_page( $page ) ) );
}
```

Register `nopriv` only when logged-out users genuinely need the endpoint. Ask what an attacker gains by calling it in a loop — if the answer is "expensive queries" or "sends email", add rate limiting or move it behind auth.

### REST routes

`permission_callback` is required — omitting it is a fatal-level mistake, and `'__return_true'` is a deliberate decision to make the route public, not a default to reach for:

```php
register_rest_route( 'mytheme/v1', '/settings', array(
    'methods'             => WP_REST_Server::EDITABLE,
    'callback'            => 'mytheme_update_settings',
    'permission_callback' => function () {
        return current_user_can( 'manage_options' );
    },
    'args'                => array(
        'layout' => array(
            'type'              => 'string',
            'enum'              => array( 'grid', 'list' ),
            'sanitize_callback' => 'sanitize_key',
        ),
    ),
) );
```

## Prefixing

Everything you introduce into the global namespace needs a unique prefix — functions, classes, constants, globals, hooks, option keys, meta keys, image sizes, post types, taxonomies, CSS handles. Use the theme/plugin slug; 3–4 characters is too short and collides.

```php
function mytheme_get_option( $key, $default = '' ) { ... }   // good
function get_option_value( $key ) { ... }                    // will eventually collide
```

Reserved prefixes to avoid: `wp_`, `__`, `_`, `WP_`. Post type and taxonomy keys are limited to 20 and 32 characters respectively and should stay stable forever — renaming one orphans all existing content.

Wrap pluggable declarations so child themes can override:

```php
if ( ! function_exists( 'mytheme_posted_on' ) ) {
    function mytheme_posted_on() { ... }
}
```

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/conventions.md`](references/conventions.md) | Translation functions, hook timing, path helpers, PHP compatibility, phpcs setup |
