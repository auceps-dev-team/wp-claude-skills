---
name: wp-i18n-rtl
description: Internationalize and localize WordPress themes and plugins — translation functions, text domains, POT generation with WP-CLI, JavaScript translations, WPML and Polylang configuration, and RTL stylesheet generation with logical CSS properties. Use this whenever preparing a theme or plugin for translation, fixing strings that will not translate, generating .pot files, adding multilingual plugin support, or adding right-to-left language support.
---

# Internationalization and RTL

Two separate jobs that get conflated: **i18n** is making strings translatable (developer work, done once), **l10n** is producing the translations (translator work, ongoing). Getting i18n wrong means the translator cannot do their job at all, and the failure is silent — the string simply never appears in the POT file.

## Text domain

The text domain must be a **literal string** matching the `Text Domain:` header, which for a wordpress.org theme or plugin must match the directory slug.

```php
esc_html_e( 'Read more', 'mytheme' );        // extractable
esc_html_e( 'Read more', $domain );          // invisible to the extractor
esc_html_e( 'Read more', MYTHEME_DOMAIN );   // also invisible
```

Variables and constants look tidier and break the entire toolchain. This is the most common i18n bug, and the reason a detector reporting *two* text domains in one project is worth acting on immediately — strings under the wrong domain never translate.

Since WordPress 4.6, `load_theme_textdomain()` / `load_plugin_textdomain()` are no longer needed for anything hosted on wordpress.org — translations load automatically from `wp-content/languages/`. Keep the call for commercial products shipping their own `.mo` files:

```php
add_action( 'after_setup_theme', function () {
    load_theme_textdomain( 'mytheme', get_template_directory() . '/languages' );
} );
```

Calling it later than `after_setup_theme` means any string translated before that point silently falls back to English.

## Translation functions

```php
__( 'Text', 'mytheme' )                        // returns
_e( 'Text', 'mytheme' )                        // echoes
esc_html__( 'Text', 'mytheme' )                // returns, escaped
esc_html_e( 'Text', 'mytheme' )                // echoes, escaped
esc_attr__( 'Text', 'mytheme' )                // for attributes

_n( '%s item', '%s items', $count, 'mytheme' ) // plural
_x( 'Post', 'noun', 'mytheme' )                // disambiguate
_nx( '%s post', '%s posts', $count, 'blog', 'mytheme' )
```

Prefer the `esc_*` variants — they escape and translate in one call, which is one fewer thing to forget.

### Placeholders

Use numbered placeholders whenever there is more than one, so translators can reorder for their language's syntax:

```php
printf(
    /* translators: 1: post title, 2: author name */
    esc_html__( '%1$s by %2$s', 'mytheme' ),
    esc_html( get_the_title() ),
    esc_html( get_the_author() )
);
```

The `/* translators: */` comment must be on the line **immediately above** the call, or the extractor will not attach it. Without it the translator sees `%1$s by %2$s` with no idea what the values are.

### Never concatenate

```php
// Broken: word order is not universal, and each fragment is untranslatable alone.
echo __( 'Posted on ', 'mytheme' ) . $date . __( ' by ', 'mytheme' ) . $author;

// Correct: one string, the translator controls the order.
printf(
    /* translators: 1: date, 2: author */
    esc_html__( 'Posted on %1$s by %2$s', 'mytheme' ),
    esc_html( $date ),
    esc_html( $author )
);
```

### Plurals

`_n()` handles languages with more than two plural forms (Russian has three, Arabic six). Always pass the number to both the function and the format:

```php
printf(
    esc_html( _n( '%s comment', '%s comments', $count, 'mytheme' ) ),
    number_format_i18n( $count )
);
```

`number_format_i18n()` applies the locale's thousands and decimal separators — `1,234` in English, `1 234` in French.

Dates need the same treatment: `wp_date( get_option( 'date_format' ), $timestamp )` respects both the locale and the site timezone. `date()` and `date_i18n()` do not (the latter is legacy).

## Generating the POT

```bash
wp i18n make-pot . languages/mytheme.pot --domain=mytheme --exclude=node_modules,vendor,tests
```

For a theme, add `--headers='{"Report-Msgid-Bugs-To":"https://example.com/support"}'`. Regenerate on every release; a stale POT means new strings are untranslatable.

Verify your work — this is the fastest way to catch non-literal domains:

```bash
# Strings the extractor found
grep -c '^msgid' languages/mytheme.pot

# Translation calls in the source
rg -c "__\(|_e\(|_n\(|_x\(" --glob '*.php' | awk -F: '{s+=$2} END {print s}'
```

A large gap between the two means strings are escaping extraction.

## JavaScript translations

```php
wp_set_script_translations( 'mytheme-script', 'mytheme', get_template_directory() . '/languages' );
```

```js
import { __, sprintf, _n } from '@wordpress/i18n';
__( 'Loading…', 'mytheme' );
```

JS translations need `.json` files, not `.mo`:

```bash
wp i18n make-json languages/ --no-purge
```

The JSON filename embeds an MD5 of the script's relative path, which is why the files must be regenerated whenever a script moves. Forgetting this is why JS translations "stop working" after a refactor.

## WPML and Polylang

Ship a `wpml-config.xml` in the root. Both WPML and Polylang read it, so one file covers both:

```xml
<wpml-config>
    <custom-fields>
        <custom-field action="translate">_mytheme_subtitle</custom-field>
        <custom-field action="copy">_mytheme_layout</custom-field>
        <custom-field action="ignore">_mytheme_cache</custom-field>
    </custom-fields>
    <admin-texts>
        <key name="mytheme_options">
            <key name="footer_text" />
            <key name="copyright" />
        </key>
    </admin-texts>
    <custom-types>
        <custom-type translate="1">mytheme_portfolio</custom-type>
    </custom-types>
    <taxonomies>
        <taxonomy translate="1">mytheme_portfolio_category</taxonomy>
    </taxonomies>
</wpml-config>
```

Three actions with distinct meanings: `translate` — translator provides a value per language; `copy` — same value across all languages (layout choices, IDs); `ignore` — not synchronised at all (caches, timestamps). Marking a layout field `translate` produces a needless job for the translator; marking a subtitle `copy` makes it untranslatable. Both are common.

`<admin-texts>` is what makes Customizer and theme option strings translatable — without it, footer text set in the Customizer appears in one language on every version of the site.

For Polylang, register strings explicitly where they are not covered:

```php
if ( function_exists( 'pll_register_string' ) ) {
    pll_register_string( 'mytheme-footer', mytheme_get_option( 'footer_text' ), 'My Theme' );
}
```

Test with a real second language. Multilingual bugs — a hard-coded `home_url()`, a query missing the language filter — do not appear on a monolingual install.

## RTL

### Logical properties (preferred)

Modern CSS makes most RTL stylesheets unnecessary. Logical properties flip automatically with the document direction:

| Physical | Logical |
|---|---|
| `margin-left` | `margin-inline-start` |
| `padding-right` | `padding-inline-end` |
| `left: 0` | `inset-inline-start: 0` |
| `text-align: left` | `text-align: start` |
| `border-left` | `border-inline-start` |
| `width` | `inline-size` |

Write logical from the start and there is nothing to maintain. `float: left` has no logical equivalent — use flexbox or grid, where `flex-direction: row` already follows the writing direction.

### Generated rtl.css

For an existing physical-property stylesheet, generate rather than hand-write:

```bash
npm install --save-dev rtlcss
npx rtlcss style.css style-rtl.css
```

WordPress loads `rtl.css` (theme root) or `style-rtl.css` automatically when the locale is RTL, provided you enqueue with `wp_style_add_data`:

```php
wp_enqueue_style( 'mytheme', get_stylesheet_uri(), array(), MYTHEME_VERSION );
wp_style_add_data( 'mytheme', 'rtl', 'replace' );
```

`'replace'` swaps the file; `true` loads `-rtl.css` in addition. Regenerate on every CSS change — a hand-edited `rtl.css` drifts from its source within one release, and commercial themes routinely ship 185KB RTL files nobody has touched in a year.

### What must not flip

- Logos and brand marks
- Phone numbers, and code or terminal output
- Progress indicators for media playback
- Icons with inherent direction that is not reading direction (a play button still points right)

```css
/* rtlcss respects these directives */
/*rtl:ignore*/
.brand-logo { margin-left: 1rem; }
```

### Testing

```php
// Force RTL temporarily
add_filter( 'locale', fn() => 'ar' );
```

Or install Arabic or Hebrew from Settings → General. Check: text alignment, list bullets, form field order, dropdown positions, carousel direction, icon spacing, and anything absolutely positioned.

## Common failures

| Symptom | Cause |
|---|---|
| String absent from POT | Non-literal text domain, or the file was excluded from `make-pot`. |
| Translation exists but does not display | Domain mismatch between the call and the `.mo`, or the textdomain loaded too late. |
| Some strings translate, others do not | Two text domains in the project — check the header against the calls. |
| JS strings never translate | `wp_set_script_translations()` missing, or `.json` not regenerated after a file move. |
| Customizer text stays in one language | Missing `<admin-texts>` in `wpml-config.xml`. |
| RTL layout partly broken | `rtl.css` out of date with the source stylesheet. |
| Dates in the wrong language | `date()` or `date_i18n()` instead of `wp_date()`. |
