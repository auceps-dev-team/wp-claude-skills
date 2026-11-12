# Phase 4 on Elementor (free)

Use this branch when the client wants to edit their pages in Elementor, and the free version is what they have. The rest of the method doesn't change. Phases 0–3 are identical, and rule 0 still holds: the mockup is drawn as if Elementor did not exist. The deployment and the five gates are also identical. What changes is how the approved mockup becomes editable pages.

Everything below was measured on one build: a print-services showcase site of 26 pages, November 2026. The stack was WordPress 7.1.4, PHP 8.2.12, MariaDB 10.4.32, Elementor 4.3.6 (free, default experiments), Essential Addons Lite 6.8.8, Contact Form 7 6.1.7, Flamingo 2.6.4, All in One SEO 5.0.5 and Complianz 7.5.7. Each date in this file belongs to that build. Elementor Pro and its Theme Builder were not measured, and neither was a block theme under Elementor.

## Contents

- [The rules, translated](#the-rules-translated)
- [The principle: classes in the data, styles in the theme](#the-principle-classes-in-the-data-styles-in-the-theme)
- [Writing the data](#writing-the-data)
- [Installing it with a PHP tool](#installing-it-with-a-php-tool)
- [The adaptation layer](#the-adaptation-layer)
- [Header and footer without Pro](#header-and-footer-without-pro)
- [Interactions and forms](#interactions-and-forms)
- [Gates on Elementor](#gates-on-elementor)

## The rules, translated

| Rule | On a block theme | On Elementor free |
|---|---|---|
| 4 · home page is a page | `front-page.html` = header + `post-content` + footer | An Elementor page set as the static front page, template `elementor_header_footer` |
| 5 · no raw HTML | Zero `core/html` | Zero `html` and zero `shortcode` widgets. Only native widgets (heading, text-editor, image, button, icon, icon-list), plus third-party widgets named one by one in an allow-list |
| 6 · media library | `id` on every `core/image` | A numeric media `id` on every image widget |
| 8 · no third-party theme | Own block theme | Own minimal classic theme, not Hello Elementor. It carries the mockup's CSS, header and footer |
| 9 · accept in the editor | Gutenberg | The Elementor editor, through `scripts/gate5-elementor.mjs` |

A `shortcode` widget is the Elementor `core/html`. It renders, the gates on the front end pass, and the client sees an opaque box they can't edit. The one exception on the build was a generated legal document (the consent plugin's cookie policy shortcode, inside a text widget). `elementor-data.mjs check` reports that case as a note, not a failure.

## The principle: classes in the data, styles in the theme

Each container and widget receives the mockup's class names through `css_classes` (containers) or `_css_classes` (widgets). The theme loads the mockup's stylesheet unchanged, then a thin adaptation layer (`elementor.css`). The widgets themselves carry no style settings.

Why not restyle everything in Elementor's panels? The design would be retyped into hundreds of settings, one widget at a time. It would drift from the mockup, and every later CSS fix would become a data migration. With classes, gate 4 compares two renders of the same stylesheet, and a fix is one line in one file.

The trade-off goes to the client, in writing, at handover:

- **What the client edits in the editor:** text, images, links, order, and duplicating a card or a section.
- **What changes in the theme:** colours, sizes and spacing. A widget-level override in the panel still works, but it is the exception.

**Markup measured on Elementor 4.3.6, with default experiments (06/11/2026).** The class sits on the widget's `div`, and that div directly contains the element:

- `div.elementor-widget-heading.my-title > h2.elementor-heading-title`
- `div.elementor-widget-button.pill > a.elementor-button`

So a mockup rule written for `h2.my-title` or `a.pill` now matches the wrapper. Most of the adaptation layer exists because of this one fact.

## Writing the data

`scripts/elementor-data.mjs` is both a module and a CLI. A project script imports its builders, rewrites each mockup page as containers and widgets, and writes one JSON file per page. The PHP installer reads those files.

```js
import { container, heading, text, image, button, iconList, finalise, resetIds } from './elementor-data.mjs';

resetIds('h');   // per-page prefix: a replay produces byte-identical JSON
const page = finalise([
  container('hero', [
    image('hero-1.jpg', 'Printed banners', 'hero__photo'),   // file name in the mockup's img/ folder
    container('container hero__text', [
      heading('Printing that <strong>lasts</strong>', 'h1', 'hero__title'),
      text('<p>Quotes within 24 hours.</p>', 'hero__sub'),
      button('Ask for a quote', '@page:quote', 'pill pill--dark', { value: 'fas fa-arrow-right', library: 'fa-solid' }),
    ]),
  ], { tag: 'section' }),
  container('cards', cards.map(cardOf), { grid: 4, gridTablet: 2, gridMobile: 1 }),   // cardOf(): one container per card
]);
```

- **Placeholders are resolved at install time, not at build time.** `"@page:<slug>"` becomes that page's permalink. `image()` stores `$file`, the mockup's file name, which the installer swaps for the imported media's `id` and `url`. A replay on production therefore writes production URLs and production media ids from the same JSON.
- **Responsive behaviour belongs in Elementor settings** (`flex_direction_mobile`, `grid_columns_grid_tablet`…), so the client sees it in the panel. Media queries stay in the CSS only where they adjust the mockup's own components.
- **`finalise()` sets `isInner`** on nested containers, as the editor does when it saves. The check fails on a wrong flag.
- Run gate 1 offline before anything reaches WordPress:

  ```bash
  node scripts/elementor-data.mjs check tools/pages/*.json --allow eael-contact-form-7
  ```

  It fails on any widget outside the allow-list (`html` and `shortcode` are never allowed), on an image with neither `$file` nor a media id, on a duplicate element id, and on a wrong `isInner`.

## Installing it with a PHP tool

`tools/install-site.php` is the same idempotent tool as on the block branch, run with the PHP CLI. Per page it writes:

```php
wp_update_post(['ID' => $id, 'post_title' => $title, 'post_status' => 'publish',
    'post_content' => $fallback_text]);                 // headings and paragraphs, for search and excerpts
update_post_meta($id, '_elementor_edit_mode', 'builder');
update_post_meta($id, '_elementor_template_type', 'wp-page');
update_post_meta($id, '_elementor_version', ELEMENTOR_VERSION);
update_post_meta($id, '_elementor_data', wp_slash(wp_json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)));
update_post_meta($id, '_wp_page_template', 'elementor_header_footer');   // theme header/footer, full-width content
delete_post_meta($id, '_elementor_css');
delete_post_meta($id, '_elementor_element_cache');
// once, after every page:
\Elementor\Plugin::$instance->files_manager->clear_cache();
```

- **`wp_slash()` is required.** `update_metadata()` unslashes the value it receives (`wp-includes/meta.php`, read). JSON with an escaped quote would lose its backslash and the page would no longer parse.
- **Work in two passes.** First create every page, so that each slug has an id. Then resolve `@page:` links, and only once permalinks are active: links resolved before came out as `?page_id=` (pitfalls).
- **Import media once.** Key each attachment with a meta holding its source file name. A replay looks the file up and reuses the attachment. Count duplicates at the end of the tool: the build checks that the result is zero.
- **Write the global kit as data too.** The kit is the post named by the `elementor_active_kit` option, and its settings live in `_elementor_page_settings`. Write the palette (`system_colors`, `custom_colors`), the type (`system_typography`), `container_width` and `container_padding` from the mockup's tokens. Set `space_between_widgets` to 0, because the mockup's CSS owns spacing, as `blockGap: 0px` does on a block theme. The client then picks from the mockup's colours in every colour picker.
- **The fallback `post_content`** is plain text: headings and paragraphs. It feeds WordPress search and excerpts, and the page still says something if Elementor is ever deactivated.

## The adaptation layer

Each rule below answers a gap that gate 4 measured on 06/11/2026, on Elementor 4.3.6. Enqueue the theme's stylesheets with `elementor-frontend` as a dependency. They then print after Elementor's, and win at equal specificity. Several of Elementor's rules are more specific than a mockup class, and those need the doubled `.elementor.elementor` prefix Elementor uses itself.

| Symptom (measured) | Cause | Rule |
|---|---|---|
| A text column set to 420 px spans the full width | `.elementor.elementor .e-con > .elementor-widget { max-width: 100% }`: four classes | `.elementor.elementor .e-con > .elementor-widget.hero__sub { max-width: 420px }` |
| A card loses 18 px of spacing | Elementor resets `margin-bottom` on every widget except the last | Re-declare the margin at the same specificity |
| The 1200 px wrapper stretches to the full page | The container's own width rules beat `.container` | `.elementor.elementor .e-con.container { max-width: …; margin-inline: auto }` |
| A row of fixed 104 px logos becomes 6 × 1fr | The grid container writes `grid-template-columns` from its settings | `.elementor.elementor .e-con.e-grid.logos { grid-template-columns: repeat(6, 104px) }` |
| Headings show at the browser's default h2 size | The class sits on the div, and the inner `h2` keeps its UA style | `.elementor-heading-title { margin: 0; font: inherit; color: inherit; … }` |
| Grey, padded buttons | Elementor styles `.elementor-button`, and the mockup's `.pill` lands on the wrapper | Neutralise the wrapper; put the pill style on `.pill .elementor-button` |
| An icon list squeezed to 306 px instead of 628 | The mockup's grid was on the list, which is now the widget div | `display: block` on the widget; grid on `.elementor-icon-list-items` |
| Icons 19 px tall instead of 22 | Elementor's icon-list size | Size the `svg` explicitly |
| A legal text column sits left instead of centred | A column container centres with `align-items`, not `justify-content` | `.elementor.elementor .e-con.legal { align-items: center }` |
| The quote form's choices break | Essential Addons: `.eael-contact-form-7 label { display: block }` | Prefix every form rule with the widget's own class |
| A title banner loses its fallback grey (measured 12/11/2026) | The mockup's `background: linear-gradient(…), var(--photo) center / cover, #7a7a7a` relies on a variable the mockup sets inline. On the site the photo and overlay are the container's Elementor background settings, the variable is undefined, and the whole shorthand becomes invalid at computed-value time | `.e-con.banner { background-color: #7a7a7a }`. Keep the photo in Elementor's background setting, where the client can change it |
| A request to `fonts.googleapis.com` on every page | Elementor prints the kit's Google Fonts | `add_filter('elementor/frontend/print_google_fonts', '__return_false')`, with fonts self-hosted by the theme |

Gate 4 still reports one divergence after all of this: a section container is always flex, where the mockup's section was a block. That divergence changes no position, so declare it with `--ignore ".hero:display"`. `gate4.mjs` then prints it as accepted, which keeps it visible.

## Header and footer without Pro

Elementor free has no Theme Builder, so the header and footer are the theme's PHP (`header.php`, `footer.php`), written from the mockup's parts.

- **Menus** come from `wp_nav_menu()`. A mega menu needs a small walker, and the client edits it in Appearance › Menus. The install tool creates those menus.
- **Contact facts** (phones, address, opening hours, social links) are Customizer settings with documented defaults, and the client edits them in Appearance › Customise.
- **The page body** comes from `the_content()` under the `elementor_header_footer` template.

Say at handover where each part is edited: Elementor for pages, Menus for navigation, Customise for contact facts. A client who looks for the footer in Elementor and doesn't find it concludes the site is broken.

## Interactions and forms

**Sliders and galleries.** These have no `html` widget either. The slides are image widgets in one container, and the theme's script builds the dots or the thumbnails from them on the front end. In the editor (`body.elementor-editor-active`) the script builds nothing, and `elementor.css` puts every slide back in flow, visible and opaque. The client can then click each slide to change it, and gate 5 checks exactly that with `--visible ".hero__slide,.gallery__image"`.

**Forms.** Contact Form 7 creates the form, through a tool as on the block branch (`references/block-conversion.md`, "Forms"). The page shows it with Essential Addons Lite's Contact Form 7 widget: type `eael-contact-form-7`, setting `contact_form_list` holding the form's id. That widget is a dropdown the client understands, where a shortcode would be a string to type. Add `add_filter('wpcf7_autop_or_not', '__return_false')`, so that the form's own markup is not wrapped in paragraphs.

A measured limit: a CF7 radio choice holds text only. Choice cards with an icon and a subtitle in the mockup became text-only cards. The quote page came out 62 px shorter than the mockup, and that gap was recorded as accepted rather than hidden.

## Gates on Elementor

| Gate | Command | On the build (26 pages) |
|---|---|---|
| 1 · data | `node scripts/elementor-data.mjs check tools/pages/*.json --allow eael-contact-form-7`, then the same on `_elementor_data` exported from the database | Passed on both; 0 `html`, 0 `shortcode`, every image with a media id |
| 2 + 5 · editor | `node scripts/gate5-elementor.mjs http://localhost/site/wp-admin --cookies session.json --post 13,19,25 --visible ".hero__slide,.gallery__image"` | Passed on the 5 templates: widgets known, none empty, slides editable, no button under 110 px |
| 3 · logged out | `node scripts/gate3.mjs <26 full URLs> --font "Open Sans"` | 26/26: no overflow at 390 px, no font CDN, no visitor cookie |
| 4 · fidelity | `node scripts/gate4.mjs <mockup-url> <site-url> --sel-file selectors.json --ignore ".hero:display"` | 0 px and no diverging property on 5 templates, 38 selectors each; −62 px on the form page, explained above. The 12/11/2026 replay first found two divergences that the 06/11 summary had not reported, both fixed in the theme: a `gap` on a text-only button, and the banner grey above |

**Editor gates without a password.** `gate5-elementor.mjs` needs a logged-in administrator. The agent never types or stores a password. WordPress itself generates a short session for the local administrator, through a CLI tool that refuses any host other than localhost:

```php
<?php // tools/test-session.php — local only; prints the auth cookies as JSON
require __DIR__ . '/_bootstrap.php';                       // wp-load, current user = first administrator
$host = wp_parse_url(home_url(), PHP_URL_HOST);
if (!in_array($host, ['localhost', '127.0.0.1'], true)) { fwrite(STDERR, "local sites only\n"); exit(1); }
$id = get_current_user_id(); $exp = time() + HOUR_IN_SECONDS;
$token = WP_Session_Tokens::get_instance($id)->create($exp);
$c = fn($name, $scheme, $path) => ['name' => $name, 'value' => wp_generate_auth_cookie($id, $exp, $scheme, $token),
    'path' => $path, 'domain' => $host, 'expires' => $exp];
echo wp_json_encode([$c(AUTH_COOKIE, 'auth', ADMIN_COOKIE_PATH), $c(AUTH_COOKIE, 'auth', PLUGINS_COOKIE_PATH),
    $c(LOGGED_IN_COOKIE, 'logged_in', COOKIEPATH)]);
```

Write the output to a scratch file, run the gate, and delete the file. The token expires on its own an hour later.

**Pace the editor runs.** On XAMPP without OPcache, one page took 1–2 minutes to become ready in the editor, so run gate 5 on one page per template, not on the whole site. Run the browser gates one at a time, never in parallel: a slowed run times out and reads like a regression.
