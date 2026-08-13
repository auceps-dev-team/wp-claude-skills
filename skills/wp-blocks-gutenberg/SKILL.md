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

## Dynamic block render

`render.php` receives `$attributes`, `$content` and `$block`:

```php
<?php
$post_id = $attributes['postId'] ?? 0;
if ( ! $post_id ) {
    return;
}
$wrapper = get_block_wrapper_attributes( array( 'class' => 'myplugin-card' ) );
?>
<div <?php echo $wrapper; ?>>
    <?php if ( ! empty( $attributes['showImage'] ) && has_post_thumbnail( $post_id ) ) : ?>
        <?php echo get_the_post_thumbnail( $post_id, 'medium', array( 'loading' => 'lazy' ) ); ?>
    <?php endif; ?>
    <h3><a href="<?php echo esc_url( get_permalink( $post_id ) ); ?>"><?php echo esc_html( get_the_title( $post_id ) ); ?></a></h3>
</div>
```

`get_block_wrapper_attributes()` is what applies everything declared in `supports` — alignment, colour, spacing, and the block's own class. A block that hand-writes its wrapper silently ignores every user setting. It returns pre-escaped output, so `echo` it directly.

## Edit component

```jsx
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { __ } from '@wordpress/i18n';

export default function Edit( { attributes, setAttributes } ) {
    const { postId, showImage } = attributes;
    const blockProps = useBlockProps( { className: 'myplugin-card' } );

    const post = useSelect(
        ( select ) => postId ? select( 'core' ).getEntityRecord( 'postType', 'post', postId ) : null,
        [ postId ]
    );

    return (
        <>
            <InspectorControls>
                <PanelBody title={ __( 'Card settings', 'my-plugin' ) }>
                    <ToggleControl
                        label={ __( 'Show image', 'my-plugin' ) }
                        checked={ showImage }
                        onChange={ ( v ) => setAttributes( { showImage: v } ) }
                    />
                </PanelBody>
            </InspectorControls>

            <div { ...blockProps }>
                <h3>{ post?.title?.rendered ?? __( 'Select a post', 'my-plugin' ) }</h3>
            </div>
        </>
    );
}
```

`useBlockProps()` is required in `apiVersion` 2+ — without it the block is not selectable and `supports` styles do not appear in the editor.

## InnerBlocks

```jsx
import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';

const TEMPLATE = [
    [ 'core/heading', { level: 3, placeholder: 'Title' } ],
    [ 'core/paragraph', { placeholder: 'Description' } ],
];

export default function Edit() {
    const blockProps = useBlockProps();
    const innerBlocksProps = useInnerBlocksProps( blockProps, {
        template: TEMPLATE,
        templateLock: false,
        allowedBlocks: [ 'core/heading', 'core/paragraph', 'core/image' ],
    } );
    return <div { ...innerBlocksProps } />;
}
```

For a **dynamic** block with inner blocks, `$content` in `render.php` holds the rendered children:

```php
<div <?php echo get_block_wrapper_attributes(); ?>>
    <?php echo $content; ?>
</div>
```

`$content` is already rendered and escaped by the block system — do not re-escape it, that would double-encode the markup.

`templateLock: 'all'` prevents adding, removing or moving; `'insert'` allows moving but not adding. Useful for client sites where structure must hold.

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

## Block bindings (WP 6.5+)

Connect core block attributes to custom data without writing a block at all — often the right answer for "I need a heading that shows a meta field":

```php
register_block_bindings_source( 'myplugin/meta', array(
    'label'              => __( 'Book meta', 'my-plugin' ),
    'get_value_callback' => function ( $source_args, $block_instance ) {
        return get_post_meta( $block_instance->context['postId'], $source_args['key'], true );
    },
    'uses_context'       => array( 'postId' ),
) );
```

```html
<!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"myplugin/meta","args":{"key":"_isbn"}}}}} -->
```

## Converting a shortcode

Keep the shortcode registered. Content already saved contains it, and removing it breaks existing posts permanently.

1. Extract the shortcode's rendering into a plain function.
2. Register a dynamic block whose `render.php` calls the same function.
3. Add a block transform so users can convert in the editor:

```js
transforms: {
    from: [ {
        type: 'shortcode',
        tag: 'myplugin_card',
        attributes: {
            postId: { type: 'number', shortcode: ( { named } ) => parseInt( named.id, 10 ) },
        },
    } ],
}
```

## Fixing "invalid content"

Static blocks only. In order:

1. **Do not change `save()` casually.** Any markup change invalidates saved instances.
2. When you must, add a `deprecated` entry with the old `save()` and an `attributes` snapshot. WordPress migrates transparently.
3. `isEligible` lets a deprecation apply conditionally.
4. Deprecations accumulate — every historical shape needs one. This is the concrete cost of choosing static, and the reason to prefer dynamic.

## Server-side and editor styles

- `style` in `block.json` → loads on front end **and** editor. Put shared visual styles here.
- `editorStyle` → editor only. Editor-specific affordances (placeholder outlines).
- `viewScript` → front end only, loaded only when the block is present on the page.

`viewScript` giving per-page conditional loading is a real performance advantage over enqueueing globally — the script only ships on pages that use the block.

## Interactivity API (WP 6.5+)

For front-end interaction without shipping a framework:

```json
"supports": { "interactivity": true },
"viewScriptModule": "file:./view.js"
```

```php
<div <?php echo get_block_wrapper_attributes(); ?>
     data-wp-interactive="myplugin"
     <?php echo wp_interactivity_data_wp_context( array( 'isOpen' => false ) ); ?>>
    <button data-wp-on--click="actions.toggle"><?php esc_html_e( 'Toggle', 'my-plugin' ); ?></button>
    <div data-wp-bind--hidden="!context.isOpen">…</div>
</div>
```

```js
import { store, getContext } from '@wordpress/interactivity';
store( 'myplugin', {
    actions: { toggle() { getContext().isOpen = ! getContext().isOpen; } },
} );
```

Worth it for accordions, filters and modals; unnecessary for a block with no interaction.
