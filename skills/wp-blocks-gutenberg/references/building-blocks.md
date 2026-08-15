# Building a block

## Contents

- [Dynamic block render](#dynamic-block-render)
- [Edit component](#edit-component)
- [InnerBlocks](#innerblocks)

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
