# Advanced block techniques

## Contents

- [Block bindings (WP 6.5+)](#block-bindings-wp-65)
- [Converting a shortcode](#converting-a-shortcode)
- [Fixing "invalid content"](#fixing-invalid-content)
- [Server-side and editor styles](#server-side-and-editor-styles)
- [Interactivity API (WP 6.5+)](#interactivity-api-wp-65)

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
