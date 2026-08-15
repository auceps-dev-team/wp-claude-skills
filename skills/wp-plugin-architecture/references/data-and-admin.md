# Data models and admin surfaces

## Contents

- [Custom post types](#custom-post-types)
- [Settings API](#settings-api)
- [Admin pages](#admin-pages)
- [Metaboxes](#metaboxes)

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
