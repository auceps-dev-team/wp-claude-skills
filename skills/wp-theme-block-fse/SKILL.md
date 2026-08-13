---
name: wp-theme-block-fse
description: Build block themes and full site editing (FSE) themes — theme.json settings and styles, HTML block templates and template parts, block patterns, style variations, and hybrid themes that mix theme.json with PHP templates. Use this whenever working with theme.json, templates/*.html, the Site Editor, global styles, block patterns, style variations, or when adding block editor support to a classic theme.
---

# Block themes and FSE

A block theme moves layout out of PHP and into HTML files made of block markup, with `theme.json` as the configuration layer. The mental shift: **you are not writing templates, you are declaring defaults that the Site Editor can override.** Anything a user changes in the Site Editor is stored in the database as a `wp_template` / `wp_global_styles` post and wins over your files from then on.

That last point catches people out constantly — "my theme.json change did nothing" almost always means the user has already customized that value in the Site Editor.

## Structure

```
mytheme/
├── style.css                # header block only
├── theme.json               # the configuration layer
├── functions.php            # optional but usually present
├── templates/
│   ├── index.html           # required
│   ├── single.html  page.html  archive.html  search.html  404.html
│   └── home.html
├── parts/
│   ├── header.html  footer.html
├── patterns/
│   └── hero.php             # PHP files with a header comment
└── styles/
    └── dark.json            # style variations
```

`templates/index.html` is the only strictly required template. The same hierarchy as classic themes applies, with `.html` instead of `.php`.

A theme is treated as a block theme when `templates/index.html` exists. Adding `theme.json` alone to a classic theme makes it *hybrid*, not block — a genuinely useful middle ground covered at the end.

## theme.json

Use schema version 3 (WP 6.6+). The `$schema` line gives you editor autocomplete and is worth including.

```json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "settings": {
    "appearanceTools": true,
    "useRootPaddingAwareAlignments": true,
    "layout": { "contentSize": "720px", "wideSize": "1200px" },
    "color": {
      "custom": false,
      "defaultPalette": false,
      "palette": [
        { "slug": "base",     "color": "#ffffff", "name": "Base" },
        { "slug": "contrast", "color": "#111111", "name": "Contrast" },
        { "slug": "primary",  "color": "#0a4bc1", "name": "Primary" }
      ]
    },
    "typography": {
      "fluid": true,
      "fontFamilies": [
        {
          "slug": "body",
          "name": "Body",
          "fontFamily": "Inter, sans-serif",
          "fontFace": [
            {
              "fontFamily": "Inter",
              "fontWeight": "400 700",
              "fontStyle": "normal",
              "fontStretch": "normal",
              "src": [ "file:./assets/fonts/inter.woff2" ]
            }
          ]
        }
      ],
      "fontSizes": [
        { "slug": "small",  "size": "0.875rem", "name": "Small" },
        { "slug": "medium", "size": "1rem",     "name": "Medium" },
        {
          "slug": "large",
          "size": "1.5rem",
          "name": "Large",
          "fluid": { "min": "1.25rem", "max": "2rem" }
        }
      ]
    },
    "spacing": {
      "spacingScale": { "steps": 0 },
      "spacingSizes": [
        { "slug": "30", "size": "1rem",   "name": "1" },
        { "slug": "50", "size": "2rem",   "name": "3" },
        { "slug": "70", "size": "4rem",   "name": "5" }
      ]
    }
  },
  "styles": {
    "color": { "background": "var(--wp--preset--color--base)", "text": "var(--wp--preset--color--contrast)" },
    "typography": { "fontFamily": "var(--wp--preset--font-family--body)", "lineHeight": "1.6" },
    "spacing": { "padding": { "left": "var(--wp--preset--spacing--50)", "right": "var(--wp--preset--spacing--50)" } },
    "elements": {
      "link":   { "color": { "text": "var(--wp--preset--color--primary)" },
                  ":hover": { "typography": { "textDecoration": "none" } } },
      "button": { "color": { "background": "var(--wp--preset--color--primary)", "text": "var(--wp--preset--color--base)" },
                  "border": { "radius": "4px" } },
      "h1":     { "typography": { "fontSize": "var(--wp--preset--font-size--large)" } }
    },
    "blocks": {
      "core/quote": { "border": { "left": { "width": "3px", "style": "solid", "color": "var(--wp--preset--color--primary)" } } }
    }
  },
  "templateParts": [
    { "name": "header", "title": "Header", "area": "header" },
    { "name": "footer", "title": "Footer", "area": "footer" }
  ],
  "customTemplates": [
    { "name": "page-full-width", "title": "Full width", "postTypes": [ "page" ] }
  ]
}
```

### settings vs styles

`settings` defines *what is available* — it generates CSS custom properties and populates the editor UI. `styles` defines *what is applied*. A palette entry in `settings.color.palette` creates `--wp--preset--color--primary` and a swatch; it changes nothing visually until something in `styles` (or a user) uses it.

### Generated CSS variables

Every preset becomes a variable following a fixed pattern:

```
--wp--preset--color--{slug}
--wp--preset--font-size--{slug}
--wp--preset--font-family--{slug}
--wp--preset--spacing--{slug}
--wp--custom--{path--in--kebab-case}
```

`settings.custom` is a free-form bag for your own tokens:

```json
"custom": { "layout": { "gutter": "1.5rem" } }
```
becomes `--wp--custom--layout--gutter`. Use it for values that are not first-class WordPress concepts.

### Locking the palette

`"custom": false` removes the arbitrary colour picker, `"defaultPalette": false` removes WordPress's own colours. Together they constrain users to your design system — the right default for a client site, usually the wrong one for a theme sold to the public.

### Fluid typography

`"fluid": true` under `typography` generates `clamp()` for every font size automatically. Per-size `fluid.min`/`fluid.max` overrides the calculation where the automatic range is wrong. This replaces hand-written media queries for type.

## HTML templates

Block markup is HTML comments with JSON attributes. Attribute order and the exact comment format matter — hand-editing is error-prone, so build the layout in the Site Editor and export it (Tools → Export), then commit the result.

```html
<!-- wp:template-part {"slug":"header","area":"header","tagName":"header"} /-->

<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
    <!-- wp:query {"queryId":0,"query":{"perPage":10,"postType":"post","inherit":true}} -->
    <div class="wp-block-query">
        <!-- wp:post-template -->
            <!-- wp:post-title {"isLink":true,"level":2} /-->
            <!-- wp:post-excerpt /-->
        <!-- /wp:post-template -->

        <!-- wp:query-no-results -->
            <!-- wp:paragraph --><p>Nothing found.</p><!-- /wp:paragraph -->
        <!-- /wp:query-no-results -->

        <!-- wp:query-pagination -->
            <!-- wp:query-pagination-previous /-->
            <!-- wp:query-pagination-numbers /-->
            <!-- wp:query-pagination-next /-->
        <!-- /wp:query-pagination -->
    </div>
    <!-- /wp:query -->
</main>
<!-- /wp:group -->

<!-- wp:template-part {"slug":"footer","area":"footer","tagName":"footer"} /-->
```

`"inherit":true` on the Query Loop makes it use the main query — that is what you want in `index.html`, `archive.html` and `search.html`. Set it false only for secondary loops with their own parameters.

Strings inside HTML templates cannot be translated. Anything user-facing that needs translating belongs in a pattern (PHP) instead.

## Patterns

Patterns are PHP files in `patterns/`, registered automatically from a header comment. Because they are PHP, they can be translated:

```php
<?php
/**
 * Title: Hero
 * Slug: mytheme/hero
 * Categories: featured, banner
 * Keywords: hero, header, intro
 * Block Types: core/group
 * Viewport Width: 1400
 * Inserter: true
 */
?>
<!-- wp:cover {"dimRatio":40,"minHeight":60,"minHeightUnit":"vh"} -->
<div class="wp-block-cover" style="min-height:60vh">
    <span aria-hidden="true" class="wp-block-cover__background has-primary-background-color has-background-dim"></span>
    <div class="wp-block-cover__inner-container">
        <!-- wp:heading {"textAlign":"center","level":1} -->
        <h1 class="wp-block-heading has-text-align-center"><?php echo esc_html_x( 'Welcome', 'Hero title', 'mytheme' ); ?></h1>
        <!-- /wp:heading -->
    </div>
</div>
<!-- /wp:cover -->
```

`Inserter: false` hides a pattern from the inserter while keeping it available for use inside templates — the standard way to ship template scaffolding without cluttering the UI.

**Patterns can be locked into templates.** Setting `templateLock` on a group prevents users from removing structural blocks while leaving content editable — useful for client sites.

## Style variations

A JSON file in `styles/` with the same shape as `theme.json` (only `settings` and `styles`) appears as a selectable global style:

```json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "title": "Dark",
  "settings": {
    "color": {
      "palette": [
        { "slug": "base",     "color": "#0d0d0d", "name": "Base" },
        { "slug": "contrast", "color": "#f5f5f5", "name": "Contrast" }
      ]
    }
  }
}
```

Variations are merged over `theme.json`, so declare only what changes. Since WP 6.6 you can also ship *partial* variations that only affect colours or only typography, by including just those sections — they then appear in the separate colour/typography pickers.

## Hybrid themes

Adding `theme.json` to a classic theme is often the highest-value change available: you get editor colour and spacing controls, consistent block styling, and generated CSS variables, without rewriting templates.

The discipline that makes it work is **one source of truth for design tokens**. A theme that defines `#0a4bc1` in `theme.json`, again in SCSS, and again in a Customizer default will drift. Pick `theme.json` as the origin and consume it elsewhere:

```css
.legacy-component { color: var(--wp--preset--color--primary); }
```

Commercial hybrid themes often invert this, defining their own `--theme-color-*` variables and referencing them from `theme.json`:

```json
"color": { "background": "var(--theme-color-bg)" }
```

That works and keeps an existing Customizer pipeline authoritative — just make sure those variables are defined before the block styles apply, or the editor renders unstyled.

Note that in a hybrid theme `theme.json` does **not** give you the Site Editor. Users still edit content in the block editor and layout in PHP.

## Editor parity

The editor must look like the front end, or users lose trust in it.

```php
add_action( 'after_setup_theme', function () {
    add_theme_support( 'editor-styles' );
    add_editor_style( 'assets/css/editor.css' );
    add_theme_support( 'wp-block-styles' );      // core block default styles
    add_theme_support( 'responsive-embeds' );
} );
```

`theme.json` styling applies to the editor automatically. `add_editor_style()` is only needed for CSS that `theme.json` cannot express.

## Common failures

| Symptom | Cause |
|---|---|
| theme.json change has no effect | The user customized that value in the Site Editor; DB wins. Reset via Site Editor → Styles → Revisions, or delete the `wp_global_styles` post. |
| Template edits have no effect | Same: an edited template is stored as a `wp_template` post. The Site Editor shows "Customized" and offers "Clear customizations". |
| Colours missing from the picker | `settings.color.palette` not set, or `defaultPalette: false` with no palette provided. |
| Editor looks different from front end | Front-end CSS not expressed in `theme.json` and not registered with `add_editor_style()`. |
| Fonts not loading | `fontFace.src` must use the `file:./` prefix for theme-relative paths. |
| Spacing presets absent | `spacingScale.steps` defaults to 7 generated steps; setting `steps: 0` without providing `spacingSizes` removes them entirely. |
| Wide/full alignment does nothing | `settings.layout` missing, or the block is not inside a `constrained` layout. |

## Migration order

Converting a classic theme to blocks, in the order that keeps the site working throughout:

1. Add `theme.json` with settings only (palette, sizes, spacing). Nothing breaks.
2. Move styling into `styles` progressively; delete the CSS it replaces.
3. Convert `header.php` / `footer.php` into `parts/*.html`.
4. Add `templates/index.html` — **this flips the theme to block mode**, so have the other templates ready.
5. Convert remaining templates.
6. Convert reusable layouts into patterns.
7. Add style variations last.

Step 4 is the point of no return in each release. Ship steps 1–3 first and let them settle.
