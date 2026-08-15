# Override layers, Kirki and migrations

## Contents

- [Override layers](#override-layers)
- [Kirki](#kirki)
- [Migrating options](#migrating-options)

## Override layers

Multipurpose themes let each content section carry its own values: the blog uses one sidebar layout, the shop another. Implemented as a resolution chain:

```
section-specific value  →  global value  →  theme default
```

The subtlety is **timing**. The override set is not known until the query context is, so resolution happens on `wp_loaded` or later. Any option read before that returns the unoverridden value — which is why a theme that works everywhere can break in one callback that runs on `init`.

```php
add_action( 'wp_loaded', 'mytheme_detect_override_context', 1 );
function mytheme_detect_override_context() {
    $context = 'global';
    if ( function_exists( 'is_woocommerce' ) && is_woocommerce() ) {
        $context = 'shop';
    } elseif ( is_home() || is_singular( 'post' ) || is_category() ) {
        $context = 'blog';
    }
    mytheme_set_context( apply_filters( 'mytheme_override_context', $context ) );
}
```

Document the timing constraint prominently. It is the single most confusing property of these systems.

## Kirki

Kirki wraps the Customizer with array-declared fields and can generate CSS from an `output` array:

```php
Kirki::add_field( 'mytheme', array(
    'type'      => 'color',
    'settings'  => 'primary_color',
    'label'     => esc_html__( 'Primary color', 'mytheme' ),
    'section'   => 'mytheme_colors',
    'default'   => '#0a4bc1',
    'transport' => 'auto',
    'output'    => array(
        array( 'element' => ':root', 'property' => '--mytheme-primary' ),
    ),
) );
```

`transport => 'auto'` gives postMessage live preview without writing JS, and `output` generates the CSS. That combination is most of Kirki's value.

Two cautions. Kirki has had breaking changes between major versions (3.x → 4.x moved field registration and dropped fields), so pin the version and read the changelog before upgrading. And themes that bundle Kirki rather than requiring the plugin end up shipping a copy that never gets security updates — check which approach a theme you inherit uses.

## Migrating options

Renaming an option key orphans every stored value. When you must:

```php
add_action( 'after_setup_theme', function () {
    if ( get_theme_mod( 'mytheme_schema_version' ) >= 2 ) {
        return;
    }
    $old = get_theme_mod( 'header_color' );
    if ( false !== $old ) {
        set_theme_mod( 'header_background_color', $old );
        remove_theme_mod( 'header_color' );
    }
    set_theme_mod( 'mytheme_schema_version', 2 );
} );
```

A version marker is what makes this idempotent. Without it the migration runs on every page load and can undo a user's later change.
