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


## The three sources a naive extractor misses

Scanning PHP for `__()` and friends finds most strings and misses three sets that are all user-visible. Validated by diffing a hand-rolled extractor against `wp i18n make-pot` on a real theme and plugin — the gap was 22 strings on the theme and 14 on the plugin before these were added:

| Source | Fields | Where the client sees them |
|---|---|---|
| `theme.json`, `styles/*.json` | `name` on palette, gradients, duotone, fontSizes, fontFamilies, spacingSizes; `title` on customTemplates, templateParts, style variations | The block editor's colour, typography and spacing pickers |
| `style.css` / plugin main file | Theme Name, Plugin Name, Description, Author, Theme URI, Plugin URI | The Themes and Plugins screens |
| `block.json` | `title`, `description`, `keywords`, `styles[].label`, `variations[].*` | The block inserter and its search |

None of them is a PHP call, so none appears in a grep for gettext functions. A plugin that ships blocks and skips `block.json` has an inserter that stays English on every localised site, and nobody notices until a client asks why.

Core keeps the authoritative field lists in `theme-i18n.json` and `block-i18n.json`.

```bash
wp i18n make-pot . languages/slug.pot --domain=slug

# Without WP-CLI:
node skills/wp-i18n-rtl/scripts/make-pot.mjs . languages/slug.pot --domain=slug
```

The bundled script reads all three sources and produces the same string set as WP-CLI. It also reports two things WP-CLI does not: how many calls used a **non-literal** text or domain argument (invisible to every extractor, core's included), and which **other text domains** appear in the source — the fastest way to catch strings quietly filed under the wrong domain.

## Generating the POT

```bash
wp i18n make-pot . languages/mytheme.pot --domain=mytheme --exclude=node_modules,vendor,tests
```

For a theme, add `--headers='{"Report-Msgid-Bugs-To":"https://example.com/support"}'`. Regenerate on every release; a stale POT means new strings are untranslatable.


Where WP-CLI is unavailable, this suite ships a stand-in that reads the same call signatures core does:

```bash
node skills/wp-i18n-rtl/scripts/make-pot.mjs <src> <out.pot> --domain=slug --package="Name"
```

It keeps `translators:` comments attached, records every `file:line` reference, and handles `_n()` plurals and `_x()` contexts. The part that earns its keep is what it reports at the end: calls whose text or domain is a **variable**, and strings found under a **different text domain**. Those two categories are precisely the silent failures, so seeing the count is the point.

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

## When the source language is not English

WordPress treats the `msgid` as the source string, whatever language it is in.
A French-primary site with French source strings therefore needs **no `fr_FR`
catalogue at all** — with no translation, WordPress falls back to the msgid,
which is already correct. Shipping an identity `fr_FR.po` is work that buys
nothing and drifts the moment a string changes.

Only the *other* languages need catalogues. On a FR/EN project the deliverable
is `en_US.po`, and the plural rule differs from the source: French is
`nplurals=2; plural=(n > 1)` while English is `nplurals=2; plural=(n != 1)`.
Copying the header from the POT without changing that line gives wrong plurals
at n=0.

Two consequences for the code itself. Write source strings in the primary
language, not in English "for convention" — a translator working from an
English string you invented is translating your paraphrase rather than the real
copy. And keep the `/* translators: */` comments in the source language too;
they are read by whoever writes the catalogue, who in this arrangement is
usually you.

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/rtl.md`](references/rtl.md) | Logical CSS properties, generating rtl.css, what must not flip, testing |
| [`references/multilingual.md`](references/multilingual.md) | wpml-config.xml actions, admin-texts, Polylang string registration |
