# Accessible markup patterns

The four places WordPress themes fail most often. Each entry is the markup, the rule behind it, and the failure it prevents.

## Contents

- [Headings](#headings)
- [Images](#images)
- [Navigation](#navigation)
- [Forms](#forms)

## Headings

One `<h1>` per page, and no skipped levels. Screen reader users navigate by heading, so a broken hierarchy is a broken table of contents.

```php
<h1 class="entry-title"><?php the_title(); ?></h1>   <!-- singular -->
<h2 class="entry-title"><a href="..."><?php the_title(); ?></a></h2>   <!-- in a loop -->
```

The common bug is a template used for both single and archive views emitting `<h1>` in a loop, producing twenty `<h1>` elements on an archive page.

Widget titles must follow the page's hierarchy too — `before_title => '<h2 class="widget-title">'` is right when widgets sit beside `<h2>` content, wrong when they are nested deeper. Style headings with CSS; never pick a level for its default size.

## Images

```php
<?php the_post_thumbnail( 'large', array( 'alt' => '' ) ); ?>
```

Alt text rules:

- **Informative image** → describe the information, not the picture. "Bar chart: sales doubled in Q4", not "chart".
- **Decorative image** → `alt=""` (empty, but present). An omitted `alt` makes screen readers read the filename.
  In WordPress the omission is worse than that: `wp_get_attachment_image()` with no `alt` argument falls back to the attachment's *stored* alt text, so a decorative background inherits whatever description the media library holds and gets announced ahead of the heading it sits behind. Pass `'alt' => ''` explicitly.
- **Image inside a link** → the alt describes the *destination*, since it is the link text.
- **Never** start with "image of" or "picture of" — the role is already announced.

WordPress uses the media library's alt field automatically. `the_post_thumbnail()` with no alt inherits it, which is usually what you want.

## Navigation

Keyboard access is where most theme menus fail. A dropdown that opens on `:hover` only is unreachable by keyboard.

```css
.menu-item > .sub-menu { display: none; }
.menu-item:hover > .sub-menu,
.menu-item:focus-within > .sub-menu { display: block; }
```

`:focus-within` is the minimum CSS-only fix. For a menu with a toggle button, manage state properly:

```html
<button aria-expanded="false" aria-controls="primary-menu">Menu</button>
<ul id="primary-menu">…</ul>
```

```js
button.addEventListener( 'click', () => {
    const open = button.getAttribute( 'aria-expanded' ) === 'true';
    button.setAttribute( 'aria-expanded', String( ! open ) );
} );
```

`aria-expanded` must reflect reality at all times — a static `aria-expanded="false"` is worse than none, because it actively misinforms.

Mark the current page: WordPress adds `.current-menu-item`, and `aria-current="page"` is the accessible equivalent:

```php
add_filter( 'nav_menu_link_attributes', function ( $atts, $item ) {
    if ( in_array( 'current-menu-item', (array) $item->classes, true ) ) {
        $atts['aria-current'] = 'page';
    }
    return $atts;
}, 10, 2 );
```

## Forms

Every control needs a real, programmatically associated label. Placeholder text is not a label — it disappears on input and often fails contrast.

```php
<form role="search" method="get" action="<?php echo esc_url( home_url( '/' ) ); ?>">
    <label for="search-field"><?php esc_html_e( 'Search', 'mytheme' ); ?></label>
    <input type="search" id="search-field" name="s" value="<?php echo esc_attr( get_search_query() ); ?>">
    <button type="submit"><?php esc_html_e( 'Search', 'mytheme' ); ?></button>
</form>
```

Where the visible design has no label, hide it visually rather than removing it:

```php
<label for="search-field" class="screen-reader-text"><?php esc_html_e( 'Search', 'mytheme' ); ?></label>
```

Errors must be announced, associated and specific:

```html
<input id="email" aria-invalid="true" aria-describedby="email-error">
<p id="email-error" role="alert">Enter a valid email address.</p>
```

`role="alert"` makes it announced immediately. Required fields need `required` and `aria-required="true"`; a red asterisk alone conveys nothing to a screen reader, and colour alone never carries meaning (WCAG 1.4.1).
