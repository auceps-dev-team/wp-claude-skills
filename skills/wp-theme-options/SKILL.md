---
name: wp-theme-options
description: Build WordPress theme option systems — Customizer API panels, sections, controls, sanitize callbacks, selective refresh and live preview, plus the options-to-CSS pipeline, custom option accessors with defaults, and per-section override layers. Use this whenever adding a theme setting, working with the Customizer, get_theme_mod, Kirki or Redux, generating dynamic CSS from user options, or debugging why a theme option does not save or apply.
---

# Theme options

An options system has four parts, and most bugs live in the seams between them: **declaration** (what the user sees), **storage** (where the value goes), **retrieval** (with defaults), and **application** (usually CSS). Get the accessor right first — it is the piece everything else depends on.

## Where options live

| Storage | API | Notes |
|---|---|---|
| `theme_mods_{theme}` option | `get_theme_mod()` / `set_theme_mod()` | Per-theme. **Lost on theme switch.** The Customizer default. |
| `wp_options` row | `get_option()` / `update_option()` | Survives theme switches. Right for anything a user would expect to keep. |
| Serialized blob | Redux, custom frameworks | One row, all options. Fast to read, awkward to migrate. |

The theme-switch behaviour is the deciding factor. Colours and layout in theme mods is correct — they are theme-specific. An API key or a Google Analytics ID in theme mods disappears when the user tries another theme, which reads as data loss.

## Always write an accessor

Never call `get_theme_mod()` directly throughout a theme. One accessor holding the defaults means the default is defined once, and it gives you somewhere to add caching and filtering later.

```php
/**
 * @param string $key     Option key, without prefix.
 * @param mixed  $default Fallback when unset.
 */
function mytheme_get_option( $key, $default = null ) {
    static $defaults = null;
    if ( null === $defaults ) {
        $defaults = mytheme_option_defaults();
    }
    $fallback = $default ?? ( $defaults[ $key ] ?? '' );
    $value    = get_theme_mod( $key, $fallback );

    return apply_filters( 'mytheme_option', $value, $key, $fallback );
}

function mytheme_option_defaults() {
    return array(
        'primary_color'  => '#0a4bc1',
        'container_width'=> 1200,
        'header_layout'  => 'centered',
        'sticky_header'  => false,
    );
}
```

The `apply_filters()` line costs nothing and turns your options into a supported extension point — child themes and plugins can then adjust values without editing your code.

Commercial themes take this further, and it is worth recognizing when you meet one: an accessor used 400–600 times across the codebase, layering defaults, caching *and* per-section overrides. Read that function before changing anything, because calling `get_theme_mod()` next to it will not return the same value.

## Customizer API

```php
add_action( 'customize_register', 'mytheme_customize_register' );
function mytheme_customize_register( WP_Customize_Manager $wp_customize ) {

    $wp_customize->add_panel( 'mytheme_layout', array(
        'title'    => esc_html__( 'Layout', 'mytheme' ),
        'priority' => 30,
    ) );

    $wp_customize->add_section( 'mytheme_header', array(
        'title' => esc_html__( 'Header', 'mytheme' ),
        'panel' => 'mytheme_layout',
    ) );

    $wp_customize->add_setting( 'header_layout', array(
        'default'           => 'centered',
        'sanitize_callback' => 'mytheme_sanitize_header_layout',
        'transport'         => 'postMessage',
    ) );

    $wp_customize->add_control( 'header_layout', array(
        'label'   => esc_html__( 'Header layout', 'mytheme' ),
        'section' => 'mytheme_header',
        'type'    => 'select',
        'choices' => array(
            'centered' => esc_html__( 'Centered', 'mytheme' ),
            'split'    => esc_html__( 'Split', 'mytheme' ),
        ),
    ) );
}
```

Three separate objects: **panel** contains sections, **section** contains controls, **setting** is the stored value. A control without a setting renders nothing; a setting without a control stores a value invisible to the user (occasionally useful).

### sanitize_callback is not optional

A setting without `sanitize_callback` is an option that anyone with `edit_theme_options` can write freely — and Customizer values very often end up in a `<style>` block, where an unvalidated value is stored XSS. WordPress will not warn you.

```php
function mytheme_sanitize_checkbox( $value ) {
    return (bool) $value;
}

function mytheme_sanitize_select( $value, $setting ) {
    $choices = $setting->manager->get_control( $setting->id )->choices;
    return array_key_exists( $value, $choices ) ? $value : $setting->default;
}

function mytheme_sanitize_number( $value, $setting ) {
    $value = absint( $value );
    return $value ?: $setting->default;
}

function mytheme_sanitize_hex( $value ) {
    return sanitize_hex_color( $value ) ?: '';
}

function mytheme_sanitize_html( $value ) {
    return wp_kses_post( $value );
}

function mytheme_sanitize_image( $value ) {
    $ext     = pathinfo( $value, PATHINFO_EXTENSION );
    $allowed = array( 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg' );
    return in_array( strtolower( $ext ), $allowed, true ) ? esc_url_raw( $value ) : '';
}
```

`mytheme_sanitize_select()` deriving choices from the control means adding an option to the `choices` array cannot desynchronize the validator.

### Live preview

`transport => 'refresh'` (default) reloads the whole preview on every keystroke — slow and jarring. Two better options:

**postMessage** for values that map to a CSS property:

```php
add_action( 'customize_preview_init', function () {
    wp_enqueue_script( 'mytheme-customizer', get_template_directory_uri() . '/assets/js/customizer.js', array( 'customize-preview' ), MYTHEME_VERSION, true );
} );
```

```js
wp.customize( 'primary_color', function ( value ) {
    value.bind( function ( to ) {
        document.documentElement.style.setProperty( '--mytheme-primary', to );
    } );
} );
```

Setting a CSS custom property is far simpler than rewriting rules, which is a strong argument for building the CSS pipeline on variables (below).

**Selective refresh** for values that change markup:

```php
$wp_customize->selective_refresh->add_partial( 'blogname', array(
    'selector'            => '.site-title a',
    'container_inclusive' => false,
    'render_callback'     => function () { return get_bloginfo( 'name', 'display' ); },
) );
```

With `postMessage` you must keep the JS and the PHP output in sync — a mismatch means the preview lies. Selective refresh re-renders from PHP, so it cannot drift.

## Options → CSS

This is where themes most often go wrong, both in security and in performance.

**Never echo a raw option into a style block.** `esc_attr()` does not protect a CSS context — `}` and `<` both survive it. Validate by shape (see `wp-standards/references/escaping-cheatsheet.md`), then emit through `wp_add_inline_style()` so the CSS participates in the dependency graph and concatenation:

```php
add_action( 'wp_enqueue_scripts', 'mytheme_inline_css', 20 );
function mytheme_inline_css() {
    wp_add_inline_style( 'mytheme', mytheme_build_css() );
}

function mytheme_build_css() {
    $primary = sanitize_hex_color( mytheme_get_option( 'primary_color' ) ) ?: '#0a4bc1';
    $width   = absint( mytheme_get_option( 'container_width' ) ) ?: 1200;

    $vars = array(
        '--mytheme-primary'   => $primary,
        '--mytheme-container' => $width . 'px',
    );

    $css = ':root{';
    foreach ( $vars as $name => $value ) {
        $css .= sprintf( '%s:%s;', $name, $value );
    }
    return $css . '}';
}
```

**Emit CSS custom properties, not rules.** A theme that generates hundreds of selectors from options produces a large inline block on every request and makes `postMessage` preview painful. A theme that emits twenty variables and references them from a static stylesheet keeps the inline payload tiny and makes live preview a one-line JS change.

### Caching generated CSS

If generation is genuinely expensive, cache it in an option and regenerate on save rather than computing per request:

```php
add_action( 'customize_save_after', function () {
    update_option( 'mytheme_generated_css', mytheme_build_css() );
} );
```

Do not use a transient for this — transients can be evicted by an object cache under memory pressure, and a site whose CSS vanishes intermittently is very hard to debug. An option row is stable and autoloaded.

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

## Debugging

| Symptom | Cause |
|---|---|
| Value never saves | Missing or over-strict `sanitize_callback` — returning `''` from the sanitizer discards the input silently. |
| Default not applied | `default` set on the control instead of the setting. It belongs on `add_setting()`. |
| Control missing | Section or panel ID mismatch, or `active_callback` returning false. |
| Preview does not update | `transport => 'postMessage'` with no JS binding. |
| Preview updates but front end does not | The JS and the PHP CSS generator disagree. |
| Options vanished | Theme was switched — theme mods are per-theme. |
| Value differs between contexts | An override layer is active; check what resolves on `wp_loaded`. |

Inspect the raw storage when the UI is lying to you:

```bash
wp option get theme_mods_mytheme --format=json
```
