# Block templates, patterns and variations

## Contents

- [HTML templates](#html-templates)
- [Patterns](#patterns)
- [Style variations](#style-variations)
- [Editor parity](#editor-parity)

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
