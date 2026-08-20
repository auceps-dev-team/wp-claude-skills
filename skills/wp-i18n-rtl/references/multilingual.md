# WPML and Polylang

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
