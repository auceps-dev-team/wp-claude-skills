# Converting HTML into native blocks

The goal is that no `core/html` block survives: that is what keeps content visually editable.

## Contents

- [The two facts that govern everything](#the-two-facts-that-govern-everything)
- [The conversion principle](#the-conversion-principle)
- [Mapping table and markup](#mapping-table-and-markup)
- [Five non-obvious substitutions](#five-non-obvious-substitutions)
- [Blocks you should not hand-write](#blocks-you-should-not-hand-write)
- [Patterns that need computed values](#patterns-that-need-computed-values)
- [Forms](#forms)
- [Interactions without injection](#interactions-without-injection)
- [Neutralising automatic spacing without destroying yours](#neutralising-automatic-spacing-without-destroying-yours)
- [The editor must preview the site](#the-editor-must-preview-the-site)
- [Validation traps](#validation-traps)

## The two facts that govern everything

1. **Hand-written markup must match exactly what the block's `save()` would produce**, otherwise the editor shows "This block contains unexpected or invalid content".
2. **WordPress prints a block's CSS when it renders the block, so after `style.css`.** At equal specificity the block wins whatever its position. Overriding a block style takes *more specificity*, not a later rule.

## The conversion principle

**Put the component's CSS classes directly on the block with `className`.** The class `shot` on a `core/image` produces `figure.wp-block-image.shot`, and the mockup's selector works unchanged.

**Leave all layout to CSS: `"layout":{"type":"default"}` on every group.** Gutenberg's flex and grid layouts inject computed classes into saved markup (`is-content-justification-*`, `is-nowrap`) that would have to be reproduced exactly — a permanent source of invalidation. With `default`, the output is always `<div class="wp-block-group my-class">`, predictable to the character, and the theme's CSS does flex and grid exactly as in the mockup.

## Mapping table and markup

| HTML | Native block | Output |
|---|---|---|
| Container | `core/group` | `div.wp-block-group.my-class` |
| Heading | `core/heading` | `h2.wp-block-heading` |
| Text | `core/paragraph` | `p.my-class` |
| Image | `core/image` | `figure.wp-block-image` |
| Button | `core/buttons` + `core/button` | `a.wp-block-button__link` |
| List | `core/list` + `core/list-item` | `ul.wp-block-list` |
| Menu | `core/navigation` + `core/navigation-link` | `a.wp-block-navigation-item__content` |
| Quote | `core/quote` | `blockquote.wp-block-quote` |
| Accordion / FAQ | `core/details` | `details.wp-block-details` |
| Form | `core/shortcode` | Contact Form 7 |

```html
<!-- wp:group {"className":"my-class","layout":{"type":"default"}} -->
<div class="wp-block-group my-class"><!-- content --></div>
<!-- /wp:group -->

<!-- wp:image {"id":14,"sizeSlug":"full","linkDestination":"none","className":"shot"} -->
<figure class="wp-block-image size-full shot"><img src="https://site/wp-content/uploads/2026/09/photo.jpg" alt="Description" class="wp-image-14"/></figure>
<!-- /wp:image -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button {"className":"b-solid"} -->
<div class="wp-block-button b-solid"><a class="wp-block-button__link wp-element-button" href="/contact/">Book a visit</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->

<!-- wp:details {"className":"question"} -->
<details class="wp-block-details question"><summary>Can I return an item?</summary><!-- wp:paragraph -->
<p>Yes, within …</p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->
```

- **Image:** the custom class goes on the figure, never the img — crop rules target `.shot img`. Declare `img { height: auto }`, otherwise the tag's `height="1500"` beats any `aspect-ratio` and thumbnails render at natural height.
- **Button:** the class lands on the wrapper `div.wp-block-button`, not the link. Style `.wp-block-button.b-solid .wp-block-button__link`, and neutralise the wrapper (`display:inline-block; background:none; border:0; padding:0`) or it inherits the mockup's button rules and doubles them. To hide a button on mobile, hide the `core/buttons` container.
- **Navigation:** style `.my-nav .wp-block-navigation-item__content`; the current item carries `.current-menu-item` on the `<li>`. The mobile overlay opens white-on-white unless overridden with a qualified selector and `!important` on `background-color` — the one place in a theme where it is justified, because the rule it beats is printed by the block. Test it logged out: host widgets in an admin session can cover the whole mobile screen.
- **Details:** the native accordion for FAQs. Hide the marker (`summary::-webkit-details-marker { display:none }`, `list-style:none`) and draw `+`/`–` with `summary::after`, switched by `details[open]`.

## Five non-obvious substitutions

1. **Inline SVG icons → CSS masks.** An SVG is not a native block and carries nothing editable. `::before` with `mask: url("data:image/svg+xml,…") center / contain no-repeat` and `background: currentColor`.
2. **Decorative graphics → pure CSS.** Range bars, dividers, badges: pseudo-elements and gradients, no markup.
3. **Tab buttons → editable paragraphs.** A `<button>` is not a block. Use a `core/paragraph` with the class; the script adds `role="button"`, `tabindex="0"` and keyboard handling.
4. **Typographic accent → bare `<em>`.** `<em class="accent">` is invalidated: a class on an inline element belongs to no registered RichText format. Use a bare `<em>` and style it by context (`.hero-title em { font-family: var(--serif) }`).
5. **Decorative layers → pseudo-elements.** Every empty `<div>` of the mockup (veils, glows, gradients) becomes a `::before`/`::after` of its parent. An empty group is an empty block in the editor; the client selects it, does not understand it, and deletes it.

## Blocks you should not hand-write

Blocks with large default inner templates — WooCommerce's Product Filters, Product Collection, cart and checkout — have serialisations too long and too version-dependent to type. **Let the editor produce them.** In any editor screen (a new, unsaved page is enough):

```js
const { createBlock, serialize } = wp.blocks;
const editor = wp.data.dispatch('core/block-editor');
editor.resetBlocks([]);
editor.insertBlocks([createBlock('woocommerce/product-filters')]);
await new Promise(r => setTimeout(r, 4000));      // the default inner template is applied asynchronously
serialize(wp.data.select('core/block-editor').getBlocks());
```

Then reshape the tree in the same session — drop the inner blocks you do not want, set attributes, add your own headings — with `createBlock()` and `resetBlocks()`, serialise again, and check every block's `isValid` before copying the markup into a template or pattern. That is how the filter column in `store.md` was produced, and it validated first time.

Leave the page unsaved afterwards: the point was the markup, not a post.

**Attributes with client-side defaults.** Serialising drops any attribute equal to its default — and some blocks compute the default in JavaScript differently from `block.json`. Measured on WooCommerce 11.2.2: `woocommerce/product-filter-attribute` has `attributeId` default `0` in `block.json` (server) but the editor sets it to the first attribute's ID, so serialising a block with `attributeId: 1` *omits* it. The server then renders nothing (`ProductFilterAttribute::render()` returns `''` on an empty ID). Write such attributes explicitly, and check the front end, not only the editor.

## Patterns that need computed values

A block template is static HTML. When markup needs a value that differs between staging and production — an attribute ID, a form ID, a page URL — put it in a PHP pattern (`patterns/filters.php`, `patterns/footer.php`) and reference the pattern from the template:

```html
<!-- wp:pattern {"slug":"my-theme/filters"} /-->
```

```php
<?php
/**
 * Title: Collection filters
 * Slug: my-theme/filters
 * Inserter: no
 */
$colour = function_exists('wc_attribute_taxonomy_id_by_name') ? (int) wc_attribute_taxonomy_id_by_name('colour') : 0;
?>
<!-- wp:woocommerce/product-filter-attribute {"attributeId":<?php echo $colour; ?>, … } -->
```

WordPress caches the list of theme pattern files: a **new** pattern file is invisible until `wp_get_theme()->delete_pattern_cache()` runs (or the theme version changes). Editing an existing pattern needs nothing.

## Forms

There is no native form block. `core/shortcode` + Contact Form 7, with the mockup's classes in the form template:

- fix textarea rows: `[textarea* message 40x6]` — CF7 defaults to 10, about 100 px too tall;
- `display: block` on `.wpcf7-form-control-wrap`, otherwise the wrapping `<span>` keeps baseline space: +5 to 13 px per field;
- style `.wpcf7-not-valid-tip` and `.wpcf7-response-output`, hide `.wpcf7-spinner` if the design has none;
- `add_filter('wpcf7_autop_or_not', '__return_false')` — the field grid comes from the theme.

**The Shortcode block wraps its output in a paragraph.** Its render callback runs `wpautop()`, which turns `[contact-form-7 …]` into `<p>[…]</p>`; once the shortcode expands, the browser closes the `<p>` before the form's `<div>` and leaves two empty paragraphs as siblings. In a two-column grid that pushes the form under the first column. Measured on WordPress 7.1.4 on two pages of the same build. Run the raw shortcode instead:

```php
add_filter('render_block_core/shortcode', function ($html, $block) {
  return do_shortcode(trim($block['innerHTML'] ?? $html));
}, 10, 2);
```

This also makes shortcodes work inside template parts, where WordPress runs shortcodes *before* expanding patterns.

**Keep the messages.** Contact Form 7 only emails; when mail fails — always, on a local stack with no SMTP server — the visitor sees an error and the message is gone. Flamingo stores every submission in wp-admin. It expects CF7's default field names (`your-email`, `your-subject`); with your own names, tell it in the form's additional settings, or every message is titled `[your-subject]`:

```
flamingo_email: "[email]"
flamingo_name: "[name]"
flamingo_subject: "[subject] – [name]"
```

Who receives the mail is a client decision: by default it is `[_site_admin_email]`, which on an agency-built site is often the agency.

## Interactions without injection

All variants are in the page; the script toggles a class, so every variant stays editable.

```js
function wire(triggerSel, targets) {
  const items = [...document.querySelectorAll(triggerSel)];
  items.forEach((el, i) => {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    const activate = () => {
      items.forEach(x => x.classList.remove('is-active'));
      el.classList.add('is-active');
      Object.entries(targets).forEach(([sel, prefix]) =>
        document.querySelectorAll(sel).forEach(c => c.classList.toggle('is-active', c.classList.contains(prefix + (i + 1)))));
    };
    el.addEventListener('click', activate);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
  });
}
```

Select by **class**, never by `id`: a `core/group` does not serialise an `id` predictably.

## Neutralising automatic spacing without destroying yours

The naive version is a trap:

```css
/* do not write this */
.wp-block-group > *, .wp-block-buttons { margin-block: 0 }
```

At specificity (0,1,0) late in the sheet it overrides **every** margin your components declare. Measured on the build this method comes from: fourteen margins zeroed at once, 307 px of vertical rhythm lost, invisible to the eye and caught only by gate 4.

1. Cut spacing at the source, in `theme.json`: `"settings": {"spacing": {"blockGap": true}}`, `"styles": {"spacing": {"blockGap": "0px"}}`.
2. If you want a CSS safety net, write it at zero specificity:

```css
:where(.wp-block-group) > :where(*), :where(.wp-block-buttons) { margin-block: 0 }
figure.wp-block-image { margin: 0 }
```

Step 1 is not optional: without it, the zero-specificity reset loses to WordPress's default `blockGap`, +24 px between every block.

## The editor must preview the site

`add_editor_style('style.css')` is not enough: Gutenberg forces `position: relative` on every block to anchor its toolbars. Any layer the mockup takes out of the flow falls back in, steals space, and columns collapse down to a button rendered as vertical text, one letter per line.

```php
add_editor_style(['assets/fonts/fonts.css', 'style.css', 'assets/editor.css']);
```

```css
/* assets/editor.css — canvas-only fixes */
.hero-photo, .hero-marker { position: absolute !important; }
.editor-styles-wrapper { background: var(--background); }
```

Gate 5 checks this.

## Validation traps

- `core/image`: the custom class goes on the figure.
- `core/quote`: `<cite>` comes after the inner blocks, inside the `blockquote`.
- `core/button`: both `wp-block-button__link` and `wp-element-button` are required on the link.
- `core/list`: each `<li>` is a `core/list-item` with its own delimiters.
- `core/heading`: no inline element with a class.
- Default attribute values are omitted from the comment; a non-default value that is missing makes the block invalid.

Gate 2 is the only reliable check for all of this.
