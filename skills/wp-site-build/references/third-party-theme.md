# Keeping a third-party theme

Rule 8 says no third-party theme under the design. A client can waive it — on this build they did, in those words: *"Personnaliser Fana"*. This file is what that costs and how to pay it, measured on a store handed over preconfigured: Fana 1.1.33 (Thembay, ThemeForest), Elementor 4.4.0 free, WooCommerce 11.3.0, WordPress 7.1.4, 12–14 active plugins, November 2026.

Read it with `elementor.md` — a multipurpose theme of this kind ships its own Elementor widgets, and those widgets are the reason to keep it.

## Contents

- [When the waiver is worth it](#when-the-waiver-is-worth-it)
- [The starting point is not empty](#the-starting-point-is-not-empty)
- [Everything lives in the child theme](#everything-lives-in-the-child-theme)
- [Four ways to change a parent theme, in order of preference](#four-ways-to-change-a-parent-theme-in-order-of-preference)
- [The output buffer, and how to keep it honest](#the-output-buffer-and-how-to-keep-it-honest)
- [The theme's own settings](#the-themes-own-settings)
- [Translating a theme that ships no translation](#translating-a-theme-that-ships-no-translation)
- [Accessibility of a theme you do not own](#accessibility-of-a-theme-you-do-not-own)
- [What the gates become](#what-the-gates-become)
- [What to tell the client](#what-to-tell-the-client)

## When the waiver is worth it

Keeping the theme is defensible when the client bought it, its demo *is* the visual reference, and its widgets carry shop behaviour you would otherwise rebuild: product tabs by category, mega menu, mini-cart drawer, banner effects, filter sidebars. On this build that was eight widgets the client keeps editing after handover.

It is not defensible to save time. You pay the saving back in the four sections below, and you inherit every defect the theme has — on this one: links with no destination, buttons with no accessible name, a 2.16:1 badge, English strings hard-coded outside any translation function.

**Decide it with the client, in writing, before phase 4.** Then record in the project notes that rule 8 is waived and why.

## The starting point is not empty

A preconfigured site is a used site. Before anything else, inventory it and write down what you found — the demo content is not yours to keep, and some of it is dangerous.

| Found on this build | What it meant |
|---|---|
| Hosting plugins from the previous host | A fatal error at boot: WordPress would not start until they were removed, which had to be done **in the database**, without `wp-load.php` |
| WP Reset, active | One click wipes the whole site. Deactivate before anything else |
| Revolution Slider, active | A `preconnect` to Google Fonts on every page. Unused once the home page is rebuilt |
| 32 demo products, 8 demo orders, 184 demo media | Deleted after a verified backup, keeping what options still referenced |
| One administrator, password hashed | Unusable. Add an account **in the database**, never by typing a password |
| `woocommerce_coming_soon = yes` | Anonymous visitors see nothing — every capture and gate run needs it off, then back on |

Back up before the first deletion, and verify the backup by restoring it into a scratch database and comparing row counts table by table (`phases.md`). On this build: 76 tables, 0 discrepancies.

## Everything lives in the child theme

Never edit the parent. An update overwrites it, silently, and the site you measured stops being the site you shipped.

```
fana-child/
  functions.php          enqueues, filters, replaced parent functions
  style.css              theme header only
  css/mockup.css         GENERATED from the mockup stylesheet — never edited by hand
  css/adaptation.css     what reconciles the theme, WooCommerce and Elementor with the mockup
  js/app.js              interactions the mockup had
  js/a11y.js             what only the browser can fix
  inc/accessibility.php  corrections to the parent's markup
  languages/             the .mo the parent does not ship
  elementor_templates/   parent widget templates you override
  woocommerce/           WooCommerce templates you override
```

**Specificity is the whole game.** The parent's stylesheet is long and specific. Three rules that came out of measuring, not guessing:

- prefix every generated class (`.btn` → `.js-btn`) so the mockup never restyles the theme's own Bootstrap;
- prefix every generated selector with `:root` — one extra class of specificity, enough to win at equal weight. Without it, footer headings stayed at the parent's 20 px;
- wrap your own base rules in `:where()` so they lose to your component rules.

Enqueue at priority 10000, after the parent and after `elementor-frontend`, and declare `elementor-frontend` as a dependency when it is registered.

**The parent sets the root font size.** Fana sets `html` to 20 px; a mockup written in `rem` came out 1.25× too large. The generator converts `rem` to `px` (×16) on the way in — measured by gate 4: 48 px had become 60 px.

## Four ways to change a parent theme, in order of preference

Try them in this order. Each one later in the list is harder to keep working across updates.

**1. A filter the theme provides.** Grep for `apply_filters` near the markup you want to change. Fana filters its own mobile menu button (`fana_tbay_get_button_mobile_menu`), so turning an `<a href="javascript:void(0)">` into a `<button>` is three lines and survives updates.

**2. A function guarded by `function_exists`.** Multipurpose themes wrap most of their functions that way, and the child's `functions.php` loads first — define it yourself and the parent skips its own. Read what else lives inside that guard: on this build the parent's `add_action( 'wp_footer', … )` sat *inside* the `if`, so replacing the function silently removed the hook too, and the child had to add it back.

**3. A template the theme locates.** Fana loads its Elementor widget views through `locate_template()`, and WooCommerce templates through `wc_get_template()` — both check the child theme first. Copy only the file you must change, and say in its header what the single difference is, so the next person can re-sync it.

**4. An output buffer over the finished page.** Last resort — see below.

## The output buffer, and how to keep it honest

Some themes write the same defect in six places: an Elementor widget class, a mobile header part, a footer bar, a dropdown — spread across templates *and* functions with no filter. Copying six parent files into the child freezes 200 lines of someone else's theme, and an update makes them stale without a word.

A buffer over the rendered page is smaller and survives updates, but it is a blunt instrument. Three conditions make it acceptable:

- **start it late and narrowly** — `template_redirect`, and only for the public site: not admin, not AJAX, not REST, not feeds, not `?elementor-preview=`;
- **bail on anything that is not a page** — if the buffer does not contain `</html>`, return it untouched; a fatal error or a redirect must not be rewritten;
- **count every substitution, and notice when the count is zero.** This is what makes it honest: if the theme changes its markup, the fix stops applying, and silence is the worst outcome. Log the misses under `WP_DEBUG`, and expose the tally behind a query parameter for an administrator.

```php
add_action( 'template_redirect', function () {
    if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || is_feed() ) return;
    if ( isset( $_GET['elementor-preview'] ) ) return;
    ob_start( 'my_fix_page' );
}, 1 );
```

**Attribute order and quote style are not yours to assume.** Two measured misses on this build: the parent writes `href` before `class` in one template and after it in another, so a fixed-order pattern fixed one case in two — use a lookahead and remove the attribute wherever it sits. And `wp_dropdown_categories()` writes its attributes in **single quotes** (`name='product_cat'`), so a pattern in double quotes matched nothing while looking perfectly correct.

## The theme's own settings

A multipurpose theme keeps its settings in one serialised option — Fana uses Redux, in `fana_tbay_theme_options`. Write it from a replayable tool, like every other configuration, and:

- **save the previous value of every key you touch** to a dated JSON file, on the first run only, so the tool stays replayable without destroying the record;
- **read the option back** after writing and compare, key by key;
- **read the code before trusting a key's name.** `mobile_footer` sounds like the mobile tab bar. It is not: at `0` the theme adds `body.mbhd-ft-desktop`, which hides the **site footer** below 768 px — legal pages unreachable on a phone, found only by looking at a 390 px screenshot. The tab bar is `mobile_footer_icon`.

Read the character set when you read the option from the CLI, or `unserialize()` fails on accents and looks like corruption: `--default-character-set=utf8mb4`.

## Translating a theme that ships no translation

Fana ships `fana.pot` and no `.mo`. The visible strings are few; compile your own from a JSON map into `languages/fana-fr_FR.mo` and load it on `after_setup_theme` at priority 0.

Two things that file cannot reach:

- **strings outside any translation function.** `aria-label="Close"` is written literally in three of Fana's templates. No `.mo` will ever translate it — the output buffer will.
- **a word used for two different things.** Fana prints "Page" in the breadcrumb of every page; a `gettext_<domain>` filter that returns the page title when `is_page()` fixes it without touching the parent.

Plugins have the same gap: WOOF ships no French, so a short `gettext_woocommerce-products-filter` map covers its visible labels.

## Accessibility of a theme you do not own

Measure with Lighthouse before you believe anything. On this build, before: 73–83 accessibility, 92 SEO. After: 97–100 and 100, with corrections only in the child theme.

What came up, and the principle behind each fix:

| Defect | Fix |
|---|---|
| `<a href="javascript:void(0)">` on cart, account, category tabs | **Give them a real destination.** The click still opens the drawer (Bootstrap `data-bs-toggle`), but the link works without JavaScript, and a crawler can follow it |
| `<a>` that opens a menu or switches a view | A `<button>`. It is a command, not a destination |
| Search button, close buttons, quantity steppers with no name | `aria-label`, server-side wherever the server writes them |
| `<select>` from `wc_product_dropdown_categories()` with no label | Same, by buffer: the function takes no free attribute |
| Badge at 2.16:1, product meta at 3.54:1 | Charter colours: 5.43:1 and 5.81:1. Compute the ratio, do not judge it by eye |
| `<h3>` section heading straight after the `<h1>` | `<h2>` — the styling hangs off the class, not the tag |
| 401 in every visitor's console | A wishlist plugin asking for lists with no session. Return an empty list rather than an error: nothing is disclosed, since there is nothing to read |

**Fix on the server when the server writes it.** A JavaScript fix raises the Lighthouse score — Lighthouse runs scripts before auditing — while leaving the HTML a crawler reads unchanged. Keep the script for what only the browser builds: carousel slides, a lightbox, a React widget, a filter slider.

**And check it still works.** After turning two links into buttons, only a keyboard test in a real browser showed the view switcher still worked: the theme bound it by `id`, so the tag change was safe. A gate would not have told you.

## What the gates become

The five gates hold, with three adjustments measured on this build.

- **Gate 4 takes pairs of selectors.** The mockup's `.hero__title` is the site's `.js-hero .elementor-heading-title`. Keep the mockup selector as the key so the criterion does not move, and pass `--site-prefix js-` for the common case.
- **Gate 5 must look at the page's own document.** The editor preview is "ready" as soon as the theme's header renders, and four different pages each reported "ok, 17 widgets" — the header and footer, with none of their content. Scope every query to `.elementor-<id>`, and treat zero widgets as a failure, not a pass.
- **Gate 5 must wait for server-rendered widgets.** A theme's widgets render over AJAX in the editor and carry `elementor-loading` while they do. Counting empty widgets before that finishes reported a mini-cart as empty when it was still in flight. Wait for `elementor-loading` to disappear, with a timeout, and report what is still loading.

That mini-cart was a real defect once the gate stopped lying: the theme only prints it when `WC()->cart` exists, and WooCommerce does not load the cart in the editor's AJAX requests. Loading it for those requests is a one-line fix in the child theme — and it is the kind of thing the client would have found, in the editor, after handover.

## What to tell the client

Say it once, plainly, and write it in the handover note:

- the theme is a paid product; its licence and updates are theirs to keep current, and the site depends on it;
- every customisation lives in the child theme and is listed — an update to the parent cannot silently undo them, but it can make an override stale, and the counted substitutions are how you find out;
- the widgets they keep editing are the theme's own, so the editing guide names them in the theme's own words, in the panel's own language;
- what you did not fix, and why. On this build: two carousel slides that the theme's slick re-hides during the measurement, worth 3 points of Lighthouse and no user-visible defect.
