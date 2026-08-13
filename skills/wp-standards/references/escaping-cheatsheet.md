# Escaping & sanitizing cheatsheet

Two tables. The first answers "I am printing a value — which function?". The second answers "I received a value — which function?".

## Output context → escaping function

| Output context | Function | Notes |
|---|---|---|
| HTML text node | `esc_html()` | Default choice. Converts `< > & " '`. |
| HTML attribute | `esc_attr()` | Also correct for `data-*`, `title`, `alt`, `value`. |
| URL in `href`/`src` | `esc_url()` | Strips invalid protocols. Only allows a safe protocol list. |
| URL for storage/redirect | `esc_url_raw()` | Same validation, no entity encoding. Use before `update_option`, `wp_redirect`. |
| Inside `<textarea>` | `esc_textarea()` | Preserves newlines correctly. |
| Data passed to JS | `wp_json_encode()` | Preferred. Emits valid JSON, safe in a `<script>` block. |
| Value in single-quoted JS string | `esc_js()` | Narrow use case; easy to misuse. Prefer `wp_json_encode()`. |
| Rich HTML you want to keep | `wp_kses_post()` | Allows the post-content tag set. |
| Rich HTML, custom tag set | `wp_kses( $html, $allowed )` | Define `$allowed` explicitly. |
| XML node | `esc_xml()` | WP 5.5+. |
| CSS value | `esc_attr()` + validate | There is no `esc_css()`. Validate against expected shape (see below). |
| Translated string, text node | `esc_html__()` / `esc_html_e()` | |
| Translated string, attribute | `esc_attr__()` / `esc_attr_e()` | |

### CSS values need validation, not escaping

Theme option → CSS pipelines are a classic injection point, because `esc_attr()` on a CSS value does not stop `}` from closing the rule. Validate by shape:

```php
// Color
$color = sanitize_hex_color( $raw );                 // returns null if invalid
$color = $color ? $color : '#000000';

// Length with unit
$size = preg_match( '/^\d+(\.\d+)?(px|em|rem|%|vh|vw)$/', $raw ) ? $raw : '16px';

// Keyword from a known set
$align = in_array( $raw, array( 'left', 'center', 'right' ), true ) ? $raw : 'left';

// Font family — quote it and strip everything structural
$font = "'" . str_replace( array( "'", '"', ';', '}', '{' ), '', $raw ) . "'";
```

Then emit through `wp_add_inline_style()` rather than echoing a `<style>` block, so the CSS participates in the dependency graph.

## Input source → sanitizing function

| Expected value | Function |
|---|---|
| Plain single-line text | `sanitize_text_field()` |
| Multi-line text | `sanitize_textarea_field()` |
| Integer, non-negative | `absint()` |
| Integer, signed | `intval()` |
| Float | `floatval()` |
| Email | `sanitize_email()` |
| URL for storage | `esc_url_raw()` |
| Slug / key (lowercase, `a-z0-9_-`) | `sanitize_key()` |
| Post slug | `sanitize_title()` |
| Filename | `sanitize_file_name()` |
| HTML content | `wp_kses_post()` |
| Hex color | `sanitize_hex_color()` |
| CSS class list | `sanitize_html_class()` (single class) |
| Fixed set of options | `in_array( $v, $allowed, true )` — validate, don't sanitize |
| Array of values | `array_map( 'sanitize_text_field', (array) $raw )` |

Always `wp_unslash()` superglobals before sanitizing. WordPress applies `addslashes` to `$_GET`, `$_POST`, `$_REQUEST` and `$_COOKIE` on load; skipping `wp_unslash()` stores literal backslashes that accumulate on every save.

```php
$value = sanitize_text_field( wp_unslash( $_POST['field'] ?? '' ) );
```

## Functions that do NOT sanitize

These are frequently mistaken for sanitizers:

| Function | What it actually does |
|---|---|
| `stripslashes()` | Removes slashes. No sanitizing. |
| `trim()` | Whitespace only. |
| `htmlspecialchars()` | Escapes, but without WP's charset handling — use `esc_html()`. |
| `strip_tags()` | Removes tags but leaves attributes-turned-text and does not handle encoded payloads. |
| `sanitize_title()` | For slugs. Destroys normal text. |
| `esc_html()` on input | Escapes at the wrong end of the pipeline. Stores encoded entities in the DB, then double-encodes on output. |

## Settings API sanitizing

`register_setting()` takes a `sanitize_callback` — this is the correct place for option sanitizing, because it runs on every write path including the REST-based block editor:

```php
register_setting( 'mytheme_options', 'mytheme_layout', array(
    'type'              => 'string',
    'default'           => 'grid',
    'sanitize_callback' => function ( $value ) {
        return in_array( $value, array( 'grid', 'list' ), true ) ? $value : 'grid';
    },
    'show_in_rest'      => false,
) );
```

Customizer settings take the same idea via `sanitize_callback` on `add_setting()`. A Customizer setting without a `sanitize_callback` is a writable option with no validation — see the `wp-theme-options` skill.

## Escaping in template files

Templates are where escaping discipline slips, because the code looks like HTML. The rule does not change:

```php
<article <?php post_class(); ?> id="post-<?php the_ID(); ?>">
    <h2 class="entry-title">
        <a href="<?php the_permalink(); ?>"><?php the_title(); ?></a>
    </h2>
    <div class="entry-meta">
        <?php echo esc_html( get_the_date() ); ?>
        <?php echo esc_html( get_the_author() ); ?>
    </div>
    <div class="entry-content"><?php the_content(); ?></div>
</article>
```

`the_title()`, `the_permalink()`, `the_content()`, `post_class()` and `the_ID()` escape internally — wrapping them is redundant and `esc_html( the_title() )` is actively wrong (it echoes early and escapes an empty string). But their `get_` counterparts return raw values and **do** need escaping:

```php
echo esc_html( get_the_title() );
echo esc_url( get_permalink() );
echo esc_attr( get_post_meta( $id, 'subtitle', true ) );
```

Post meta is never escaped for you. Neither is anything from `get_option()`, `get_theme_mod()`, or a Customizer value.
