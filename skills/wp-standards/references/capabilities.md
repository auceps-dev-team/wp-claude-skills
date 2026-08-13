# Capabilities reference

`current_user_can()` takes a **capability**, not a role. Checking `current_user_can( 'administrator' )` works by accident on default installs and breaks with any custom role plugin. Always check the capability that describes the action.

## Capability by action

| Action | Capability |
|---|---|
| Change site settings, theme options | `manage_options` |
| Install/activate plugins | `activate_plugins`, `install_plugins` |
| Switch or install themes | `switch_themes`, `install_themes` |
| Edit theme/plugin files | `edit_themes`, `edit_plugins` |
| Publish posts | `publish_posts` |
| Edit any post regardless of author | `edit_others_posts` |
| Edit *this* post | `edit_post`, `$post_id` |
| Delete *this* post | `delete_post`, `$post_id` |
| Upload media | `upload_files` |
| Moderate comments | `moderate_comments` |
| Manage categories/tags | `manage_categories` |
| Create/edit users | `create_users`, `edit_users` |
| Export/import content | `export`, `import` |
| Network admin (multisite) | `manage_network`, `manage_network_options` |
| Unfiltered HTML in content | `unfiltered_html` |

## Meta capabilities need the object ID

`edit_post`, `delete_post`, `read_post` and `edit_term` are *meta* capabilities — they get mapped to primitive capabilities based on the object. Passing the ID is what makes the check meaningful:

```php
if ( ! current_user_can( 'edit_post', $post_id ) ) {   // correct
    return;
}
if ( ! current_user_can( 'edit_posts' ) ) {            // wrong: any contributor passes
    return;
}
```

This is the standard bug in `save_post` metabox handlers: checking `edit_posts` lets a contributor write meta onto someone else's post.

## The canonical save_post guard

```php
function mytheme_save_meta( $post_id ) {
    // 1. Autosave has no nonce and no user intent.
    if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
        return;
    }
    // 2. CSRF.
    if ( ! isset( $_POST['mytheme_meta_nonce'] )
         || ! wp_verify_nonce( sanitize_key( $_POST['mytheme_meta_nonce'] ), 'mytheme_save_meta' ) ) {
        return;
    }
    // 3. Authorization, for THIS post.
    if ( ! current_user_can( 'edit_post', $post_id ) ) {
        return;
    }
    // 4. Revisions duplicate the hook.
    if ( wp_is_post_revision( $post_id ) ) {
        return;
    }

    update_post_meta(
        $post_id,
        '_mytheme_subtitle',
        sanitize_text_field( wp_unslash( $_POST['mytheme_subtitle'] ?? '' ) )
    );
}
add_action( 'save_post', 'mytheme_save_meta' );
```

All four guards are load-bearing. Dropping the autosave check causes meta to be wiped on every autosave; dropping the revision check duplicates writes.

## Custom post type capabilities

By default a CPT maps to `post` capabilities, which means anyone who can edit posts can edit your CPT. To separate them:

```php
register_post_type( 'mytheme_portfolio', array(
    'capability_type' => array( 'portfolio', 'portfolios' ),
    'map_meta_cap'    => true,   // required, or meta caps won't resolve
    // ...
) );
```

`map_meta_cap => true` is not optional here — without it, `edit_post` never maps to `edit_portfolio` and permission checks silently fail open or closed depending on context. After changing this you must grant the new capabilities to roles explicitly, usually on plugin/theme activation.

## Multisite

On multisite, `manage_options` is per-site. Anything affecting the network needs `manage_network_options`, and file operations that touch shared directories need `manage_network`. Also note `unfiltered_html` is revoked for all non-super-admins on multisite — code that assumes an administrator can post raw HTML breaks there.

## Checking capability without a current user

In cron, WP-CLI and REST contexts there may be no logged-in user, so `current_user_can()` returns false. That is usually correct behaviour. If you need to check a specific user:

```php
$user = get_user_by( 'id', $user_id );
if ( $user && user_can( $user, 'edit_post', $post_id ) ) { ... }
```

Never work around an empty current user by skipping the check.
