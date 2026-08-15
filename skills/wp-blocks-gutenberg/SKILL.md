---
name: wp-blocks-gutenberg
description: Build custom Gutenberg blocks — block.json metadata, static and dynamic blocks, the @wordpress/scripts build, InnerBlocks, block variations, block styles, editor controls, block bindings and interactivity. Use this whenever creating a custom block, registering block types, working with block.json or @wordpress/create-block, converting a shortcode to a block, fixing block validation errors, or extending existing core blocks.
---

# Custom Gutenberg blocks

Two kinds of block, and choosing wrongly is the most expensive mistake available:

| | Static | Dynamic |
|---|---|---|
| Markup stored | In post content | Regenerated on render |
| Defined by | `save()` in JS | `render_callback` / `render` in PHP |
| Changing markup later | **Invalidates every existing instance** | Free |
| Right for | Fixed content: headings, layout | Anything querying data, or that will evolve |

Static blocks serialize their output into `post_content`. When you later change `save()`, every previously saved instance no longer matches and the editor shows "This block contains unexpected or invalid content". Recovering means a deprecation entry per change, forever.

**Default to dynamic.** The performance cost is a PHP function call; the maintenance saving is large.

## Scaffold

```bash
npx @wordpress/create-block myplugin-card --variant dynamic
```

Gives you `block.json`, the build setup, and a working dynamic block. For an existing plugin:

```bash
npm install --save-dev @wordpress/scripts
```

```json
{
  "scripts": {
    "start": "wp-scripts start",
    "build": "wp-scripts build",
    "lint:js": "wp-scripts lint-js"
  }
}
```

`wp-scripts` handles JSX, SCSS, dependency extraction and asset versioning. It emits `build/index.asset.php` containing the exact `@wordpress/*` dependency list — using it is what keeps your block working across WordPress versions.

## block.json

The single source of truth. Registering from it means WordPress derives the PHP registration, the asset handles and the editor metadata from one file.

```json
{
  "$schema": "https://schemas.wp.org/trunk/block.json",
  "apiVersion": 3,
  "name": "myplugin/card",
  "title": "Card",
  "category": "widgets",
  "icon": "index-card",
  "description": "A card with an image, title and link.",
  "keywords": [ "card", "teaser" ],
  "textdomain": "my-plugin",
  "supports": {
    "html": false,
    "align": [ "wide", "full" ],
    "color": { "background": true, "text": true },
    "spacing": { "padding": true, "margin": true },
    "typography": { "fontSize": true, "lineHeight": true },
    "interactivity": true
  },
  "attributes": {
    "postId":    { "type": "number" },
    "showImage": { "type": "boolean", "default": true },
    "heading":   { "type": "string", "source": "html", "selector": "h3" }
  },
  "example": { "attributes": { "showImage": true } },
  "editorScript": "file:./index.js",
  "editorStyle":  "file:./index.css",
  "style":        "file:./style-index.css",
  "render":       "file:./render.php"
}
```

`apiVersion: 3` opts into the iframed editor canvas. If your block relies on the editor's document (measuring the window, jQuery plugins), it will break there — fix the block rather than downgrading the API version, since the iframe is the direction of travel.

`supports` is free functionality: colour, spacing and typography controls appear automatically and their values are applied by core. Reach for `supports` before writing a custom control.

`"render": "file:./render.php"` (WP 6.1+) replaces `render_callback` and keeps registration declarative.

## Registering

```php
add_action( 'init', function () {
    register_block_type( __DIR__ . '/build/card' );
} );
```

Point at the **build** directory, not `src`. For several blocks, `wp_register_block_types_from_metadata_collection()` (WP 6.7+) registers a whole directory in one manifest-driven call.

## Variations vs styles vs new blocks

Before writing a block, check whether you need one:

**Block style** — visual variant only, applies a class:

```php
register_block_style( 'core/quote', array(
    'name'         => 'fancy',
    'label'        => __( 'Fancy', 'my-plugin' ),
    'inline_style' => '.is-style-fancy { border-left: 4px solid currentColor; }',
) );
```

**Block variation** — same block, different default attributes and its own inserter entry:

```js
wp.blocks.registerBlockVariation( 'core/group', {
    name: 'myplugin/section',
    title: __( 'Section', 'my-plugin' ),
    attributes: { align: 'full', className: 'section' },
    scope: [ 'inserter' ],
} );
```

**New block** — only when behaviour or data differs. Most "custom blocks" in the wild should have been variations of `core/group` or `core/query`.

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/building-blocks.md`](references/building-blocks.md) | Dynamic render, the Edit component, InnerBlocks |
| [`references/advanced.md`](references/advanced.md) | Block bindings, shortcode migration, validation errors, asset scoping, Interactivity API |
