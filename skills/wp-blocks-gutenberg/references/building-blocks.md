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

## A declared asset that does not exist

`register_block_type( __DIR__ )` does not verify that the files `block.json`
names actually exist. Declaring `"editorScript": "file:./index.js"` and
`"style": "file:./style.css"` with neither file on disk registers cleanly, logs
nothing, and produces a failure split across two contexts:

| Where | What happens |
|---|---|
| Front end | **Renders correctly.** A dynamic block draws from `render.php`, which is present. |
| Editor | *"Your site doesn't include support for this block."* |
| Network | One 404 per declared-but-missing stylesheet |

The asymmetry is what makes it survive review. The page looks right, so the
block looks done — and the defect only surfaces when someone opens that page in
the editor, which on a client build is often after handover.

Check it directly rather than trusting the metadata:

```bash
# Every file: reference in a block.json, and whether it exists.
for j in $(find . -name block.json); do
  d=$(dirname "$j")
  grep -oE '"file:\./[^"]+"' "$j" | tr -d '"' | sed 's|file:\./||' | while read -r f; do
    [ -f "$d/$f" ] || echo "missing: $d/$f"
  done
done
```

### index.asset.php when there is no build step

`@wordpress/scripts` emits `index.asset.php` next to the bundle, declaring its
script dependencies. A hand-written block has no build step and therefore no
asset file — and **a missing asset file does not mean "unknown dependencies", it
means "no dependencies".** WordPress enqueues the script bare, it runs before
`wp.blockEditor` exists, `registerBlockType` never happens, and the block reports
as unsupported. Same symptom as the missing file, different cause.

Write it by hand. It is eight lines and removes the whole class of problem:

```php
<?php
// blocks/stat/index.asset.php
return array(
	'dependencies' => array(
		'wp-blocks', 'wp-element', 'wp-block-editor',
		'wp-components', 'wp-i18n', 'wp-server-side-render',
	),
	'version' => '1.0.0',
);
```

`wp-server-side-render` is the one people miss: core does **not** load it in the
editor by default, and it is what lets a dynamic block preview itself through
its own `render.php` instead of a JavaScript reimplementation that drifts from
the server on the first change.

### Where a block's own stylesheet ends, and the theme's begins

A block shipped in a plugin should still be usable if the theme changes — that
is usually the reason it is in a plugin at all. But its stylesheet loads *after*
the theme's, so anything it declares wins ties against the theme's brand layer.

Split on that boundary:

- **Block `style.css`** — structure only: list resets, `min-width: 0`,
  `display`. Nothing the theme would want to override.
- **Theme stylesheet** — palette, type scale, and any grid the design fixes.

Concretely: a process-steps block that sets
`grid-template-columns: repeat(auto-fit, …)` in its own stylesheet silently
overrode a theme that pinned six columns to match an approved design, and the
sixth step wrapped onto its own line. The block was not wrong in isolation; it
was asserting a decision that belonged to the theme.
