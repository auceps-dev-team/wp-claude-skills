# RTL support

## RTL

### Logical properties (preferred)

Modern CSS makes most RTL stylesheets unnecessary. Logical properties flip automatically with the document direction:

| Physical | Logical |
|---|---|
| `margin-left` | `margin-inline-start` |
| `padding-right` | `padding-inline-end` |
| `left: 0` | `inset-inline-start: 0` |
| `text-align: left` | `text-align: start` |
| `border-left` | `border-inline-start` |
| `width` | `inline-size` |

Write logical from the start and there is nothing to maintain. `float: left` has no logical equivalent — use flexbox or grid, where `flex-direction: row` already follows the writing direction.

### Generated rtl.css

For an existing physical-property stylesheet, generate rather than hand-write:

```bash
npm install --save-dev rtlcss
npx rtlcss style.css style-rtl.css
```

WordPress loads `rtl.css` (theme root) or `style-rtl.css` automatically when the locale is RTL, provided you enqueue with `wp_style_add_data`:

```php
wp_enqueue_style( 'mytheme', get_stylesheet_uri(), array(), MYTHEME_VERSION );
wp_style_add_data( 'mytheme', 'rtl', 'replace' );
```

`'replace'` swaps the file; `true` loads `-rtl.css` in addition. Regenerate on every CSS change — a hand-edited `rtl.css` drifts from its source within one release, and commercial themes routinely ship 185KB RTL files nobody has touched in a year.

### What must not flip

- Logos and brand marks
- Phone numbers, and code or terminal output
- Progress indicators for media playback
- Icons with inherent direction that is not reading direction (a play button still points right)

```css
/* rtlcss respects these directives */
/*rtl:ignore*/
.brand-logo { margin-left: 1rem; }
```

### Testing

```php
// Force RTL temporarily
add_filter( 'locale', fn() => 'ar' );
```

Or install Arabic or Hebrew from Settings → General. Check: text alignment, list bullets, form field order, dropdown positions, carousel direction, icon spacing, and anything absolutely positioned.
