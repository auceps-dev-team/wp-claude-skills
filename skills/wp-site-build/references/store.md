# The store branch: WooCommerce on a block theme

Everything here was measured on one real build — a redesign of a home-linen store in Côte d'Ivoire, prices in XOF, on a custom block theme — between 4 and 5 November 2026, on a local stack: WordPress 7.1.4, WooCommerce 11.2.2, PHP 8.2.12 (XAMPP), MariaDB with `max_allowed_packet=1M`. Plugin versions are given where they matter. Where a statement was read in code rather than observed, it says so and names the file.

This closes, for one store, the gap `CONTRIBUTING.md` lists: a WooCommerce store on the block checkout rather than the shortcode one.

## Contents

- [What to ask before phase 4](#what-to-ask-before-phase-4)
- [Catalogue import](#catalogue-import)
- [Templates](#templates)
- [Product filters: colour and price](#product-filters-colour-and-price)
- [Cart, checkout and confirmation](#cart-checkout-and-confirmation)
- [Consent and cookies](#consent-and-cookies)
- [Legal pages](#legal-pages)
- [Newsletter](#newsletter)
- [Contact forms](#contact-forms)
- [Payments](#payments)
- [Help pages: about, FAQ, delivery and returns, care](#help-pages-about-faq-delivery-and-returns-care)
- [The local stack itself](#the-local-stack-itself)

## What to ask before phase 4

A store has facts a showcase site does not, and none of them can be invented. Ask once, early, and carry the unanswered ones as `à compléter`:

- payment providers and whether bank transfer is offered (and the account details);
- delivery zones, prices, free-delivery threshold, lead times;
- return window — and its unit: "10 days" and "10 working days" are different promises;
- legal identity: company name, form, address, registration number;
- analytics: which tool, which ID;
- what to do with products that look wrong (see below).

## Catalogue import

**Import idempotently, keyed on the origin.** Store the source ID on each product (`_origin_id`) and the source URL on each media item (`_origin_url`); look them up before creating. The import then replays on production and after every correction.

**Read the old catalogue before trusting it.** On this build, of 137 published products, the old site still carried the previous theme's demo products (electronics, toys, garden) next to the real ones, product names that were WhatsApp file names (`Drap de lit imprimé – WA0029`, `8711`, `-1 place`), and every colour variant as a separate simple product. Import the real ones (98 here), and list the rest for the client rather than deciding for them.

**Thumbnails need GD or Imagick.** On this XAMPP install `extension=gd` was commented out in `php.ini`; `media_handle_sideload()` then imports the original but generates no intermediate size. Check `extension_loaded('gd')` before importing hundreds of images.

**Compare the copy with the source, field by field.** WooCommerce's Store API is public and paginated (`/wp-json/wc/store/v1/products?per_page=100&page=N`), so the live catalogue can be compared without access to its admin. On this build, names, prices, images and categories matched; descriptions and short descriptions were missing on 69 products, because the first import never copied them; and two real products had been skipped — one with no category on the live site, one with no name at all. The nameless one was added as a draft with a placeholder name rather than published blank. Copy descriptions verbatim, but look at the bytes: the old site stored the Windows-1252 apostrophe as U+0092, an invisible control character that rendered "taies d’oreillers" as "taies doreillers" (`bin2hex` showed `c2 92`). Replacing U+0092 with `’` corrected the texts of 39 products.

**WooCommerce re-enables "coming soon" mode.** After activation, `woocommerce_coming_soon` was back to `yes`, and the shop was empty for every visitor while it looked fine to the logged-in admin. Set it to `no` in the install tool and check logged out.

## Templates

A block theme owns these, under `templates/`:

| Template | Holds |
|---|---|
| `archive-product.html`, `taxonomy-product_cat.html` | filters column + `woocommerce/product-collection` with `"inherit":true` |
| `single-product.html` | gallery, purchase column, related products |
| `page-cart.html`, `page-checkout.html` | header, `woocommerce/page-content-wrapper` around `post-content`, footer |
| `order-confirmation.html` | the "order received" screen — see below |

The cart and checkout *pages* keep WooCommerce's blocks as their content; the templates only frame them. Product cards are composed from `woocommerce/product-image`, `post-title` (with the WooCommerce namespace), `woocommerce/product-price` inside `woocommerce/product-template`.

Check for database copies before editing a template file: a template saved once in the site editor becomes a `wp_template` post that silently overrides the file. `get_posts(['post_type' => ['wp_template', 'wp_template_part'], 'post_status' => 'any'])` must be empty, or you are editing a file nobody sees.

## Product filters: colour and price

WooCommerce 11.2.2 ships a **Product Filters** block (`woocommerce/product-filters`) with children for active filters, price (`product-filter-price` + `product-filter-price-slider`), attributes (`product-filter-attribute` displayed as checkbox list or chips), taxonomies, rating and stock status. It works with a Product Collection that inherits the archive query, through URL parameters (`filter_colour=blue&query_type_colour=or`, `min_price`, `max_price`), and on mobile it collapses behind a "Filter products" button (`"overlayMode":"mobile"`, the default) with an "Apply" footer.

Do not hand-write its markup: let the editor produce it (`block-conversion.md`, "Blocks you should not hand-write"), then remove the children you do not want. Put the result in a PHP pattern, because the attribute filter needs the attribute's database ID, which differs between staging and production, and must be written explicitly (the `attributeId` trap, same file).

### Colour needs an attribute, and the attribute needs data

Price filters work on any catalogue. Colour does not exist until products have a colour attribute — on this build, none had one. Three steps:

**1 · Swatches.** WooCommerce has colour swatches for attribute terms behind the feature flag `wc-visual-attribute`, marked *experimental* in 11.2.2 (`src/Internal/Features/FeaturesController.php`), available since 10.9. Read in `src/Internal/ProductAttributes/VisualAttributeTermMeta.php`: an attribute of type `wc-visual` stores each term's swatch in term meta `color` (hex) or `image` (attachment ID), and the chips block renders them when the taxonomy is of that type — the type is read from the database, not from the flag, so if the flag is ever removed the filter falls back to plain names rather than breaking. Enable it with `FeaturesController::change_feature_enable('wc-visual-attribute', true)`, create the attribute with `wc_create_attribute(['type' => 'wc-visual', 'order_by' => 'menu_order', …])`, and register the taxonomy by hand for the rest of that request (it is only registered on the next `init`). A "multicolour" term takes an image swatch: a PNG of a conic gradient, rendered by headless Chrome, works.

**2 · Colours per product, with their source.** No colour was in the data, so each product's colour was read from its name where the name gives one and from its photo otherwise, and written to a CSV the client can correct and replay: `origin;name;colours;source;remark`, with `source` one of `name`, `photo`, `name+photo`. Up to two colours per product; prints with many colours get "multicolour". Three products had a name that contradicted their photo (a "green" set whose photo was the red one, a "pink" set shown in blue check, a "pink" set sharing another product's beige photo): the name was kept and the row flagged `À VÉRIFIER`. A contact sheet — an HTML grid of 20 product photos with their IDs, screenshotted by headless Chrome — made 98 products classifiable in five images.

**3 · The lookup table.** The new filter blocks query `wp_wc_product_attributes_lookup` directly (`src/Internal/ProductFilters/QueryClauses.php`, read), whatever the `woocommerce_attribute_lookup_enabled` option says — it was `no` here. That table is filled when a product is saved, sometimes through Action Scheduler. Fill it deterministically in the tool after saving each product:

```php
$product->set_attributes($attributes);
$product->save();
wc_get_container()->get(\Automattic\WooCommerce\Internal\ProductAttributesLookup\LookupDataStore::class)
  ->create_data_for_product($product);   // deletes then recreates this product's rows: replay-safe
```

Measured after the tool ran: 130 rows for 130 colour assignments on 98 products; filtering a category of 76 products on "blue" returned 20, exactly the blue products of that category; price 20 000–40 000 returned 12 and price plus "pink" 4, both equal to a direct `WP_Query`/`has_term()` count. Re-running the tool left 1 attribute, 13 terms and 130 rows.

### Layout notes

- Sort the swatches by `"sortOrder":"menu_order-asc"` and set term meta `order` in palette order (white, beige, brown, grey, black, pink, red, orange, yellow, green, blue, violet, multicolour); the default sorts by count.
- The chips block hides term names in swatch mode (`.is-style-swatch .wc-block-product-filter-chips__text` is visually hidden). A grid of four with the name under each swatch reads better; un-hide the text with `position: static; clip: auto; clip-path: none; width: auto; height: auto`.
- The price inputs are capped at `max-width: 60px` by WooCommerce, which truncates "16 000 FCFA". Do not fix it with a fixed width: two 112 px inputs in a 180 px column (measured at 1920 px) made the sticky filter column scroll sideways. Give the inputs `width: 100%; max-width: none` and the slider's grid `grid-template-columns: minmax(0, 1fr) 10px minmax(0, 1fr)`, then check `aside.scrollWidth === aside.clientWidth`.
- In the product gallery, `object-fit: contain` in a square frame leaves grey bands above and below landscape photos; a client reported it as a broken page. `cover` fills the frame and crops the edges of very elongated photos — say which in the editing guide.
- Put colour and price **above** a long category list, or they fall below the fold of a sticky column.

## Cart, checkout and confirmation

**Countries without postcodes.** WooCommerce required a postcode for Côte d'Ivoire and blocked the order with "Please enter a valid postcode" (measured, block checkout). The country does not use postcodes. Hide the field per country:

```php
add_filter('woocommerce_get_country_locale', function ($locales) {
  $locales['CI']['postcode'] = ['required' => false, 'hidden' => true];
  return $locales;
});
```

Do this for every country the store sells to that has no postcode system, and place a real test order per country before accepting.

**The confirmation screen ignores the theme.** With no `order-confirmation.html` in the theme, WooCommerce's own template rendered the "order received" page flush against the left edge, with none of the theme's frame. Add the template to the theme — WooCommerce's order-confirmation blocks inside your header, content wrapper and footer. Put `woocommerce/order-confirmation-additional-information` right after the summary: that is where bank-transfer instructions print, and it is what the customer needs first.

**Terms at checkout.** With `woocommerce_terms_page_id` empty the checkout says nothing about terms. Point it at the terms page; the block checkout then shows a line linking both the terms and the privacy policy (on this French store: « En continuant vos achats, vous acceptez nos Conditions générales et notre Politique de confidentialité »). It is text, not a mandatory checkbox — say so to the client.

**Test with a real order.** A bank-transfer order on staging went to *on hold* (measured), and the thank-you page printed the transfer instructions — without account details, because none had been given. Delete test orders afterwards and say so.

## Consent and cookies

Measured stack: Complianz GDPR 7.5.7, WP Consent API 2.1.0, Complianz Terms & Conditions 1.4.1.

**Without WP Consent API, WooCommerce tracks before consent.** WooCommerce's order attribution sets `sbjs_*` cookies on arrival. With WP Consent API active it waits for the `marketing` category (`allowTracking:false` until then). Measured: after "Refuse all", no `sbjs_*` and no `_ga`, even with `?utm_source=` in the URL; after "Accept all", `sbjs_*` set. Install WP Consent API alongside any consent manager on a store.

**Cookies measured for an anonymous visitor**: none on the home page, FAQ or a category page; adding to cart sets `woocommerce_items_in_cart`, `woocommerce_cart_hash` (session) and `wp_woocommerce_session_*` (two days, HttpOnly). Declare what you measured and say which entries were read from plugin documentation instead.

Complianz traps, all measured:

- On the CLI, `cmplz_update_option()` only exists if `CMPLZ_DOING_SYSTEM_STATUS` is defined before `wp-load.php`.
- Answering "no" to first-party marketing cookies removes the Marketing category — and with it the place where `sbjs_*` belongs.
- With no region for the store's country, applying the EU (GDPR) rules to all visitors is the strict choice; then fix the policy's sentence that limits its scope to the EEA (`cmplz_document_elements` filter).
- Without a cookiedatabase.org account the policy claims services are "not yet synchronised"; `add_filter('cmplz_use_cdb_reference', '__return_false')` removes it.
- Its banner CSS loads after the theme's: override with selectors as specific as Complianz's (`body .cmplz-cookiebanner …`).
- Decline its online scan, tips and newsletter sign-ups: they need an account with the vendor, and a local site cannot be scanned anyway.

## Legal pages

Terms are generated, not written. Complianz Terms & Conditions builds them from a questionnaire; fill it from a tool, and annotate every answer with its source: **FACT** (confirmed by the client), **OBSERVED** (measured on the site), **CHOICE** (a default taken for lack of an instruction — to be validated by the client or their lawyer). Then read the generated text: on this build it contained a liability cap ("limited to the total price paid") although the answer to the liability-cap question was no, and it said "10 days" where the site promised "10 working days". Report such gaps; do not edit the generated clauses.

Sections the generator does not cover (pricing and payment, ordering, delivery) stay as headed placeholders. Privacy and legal-notice pages are skeletons with one `à compléter` per section until the client supplies text.

## Newsletter

A Contact Form 7 "newsletter" form that emails each sign-up to the admin is not a newsletter: no list, no double opt-in, no unsubscribe — and the footer's "unsubscribe in one click" is then false. Use a list manager. MailPoet 5.45.1 was used: free, stores subscribers in the site, sends through the site's own mail by default (`SettingsController::DEFAULT_SENDING_METHOD = 'PHPMail'`, read) without a vendor account, and has a WooCommerce checkout opt-in.

Measured traps:

- **Activation aborts silently on a 1 MB `max_allowed_packet`.** Inserting its newsletter templates failed ("Got a packet bigger than 'max_allowed_packet'"), the populator stopped, and the plugin reported itself active with 3 settings, no list and no form. `SET GLOBAL max_allowed_packet=67108864` then deactivate/reactivate fixed it (149 templates, 3 segments, 14 settings). The global setting is lost on restart; hosting usually allows more, but check `SHOW VARIABLES LIKE 'max_allowed_packet'` before activating on production.
- **Defaults to change**: the sender is the WordPress admin address (an agency address here); the checkout opt-in is **enabled by default** with an English label; the welcome wizard (which offers usage-data sharing) shows while setting `version` is empty.
- **Tracking level.** `full` tracks opens and clicks and sets cookies on the site; `partial` tracks without cookies; `basic` tracks nothing. `basic` was chosen to stay consistent with GDPR-for-all; no MailPoet cookie was set to an anonymous visitor (measured from response headers).
- **Its form block is dynamic**: `<!-- wp:mailpoet/subscription-form-block {"formId":N} /-->`, rendered server-side (`lib/PostEditorBlocks/SubscriptionFormBlock.php`, read). Look the form up by name in a PHP pattern; IDs differ between staging and production. Give the form empty styles and style it from the theme.
- **Locally nothing is sent.** With no mail server, the subscriber is stored as *unconfirmed* and the form shows "an error occurred while sending the confirmation email". That is the expected local result, not a bug — say so in the report, and test real delivery on production.

## Contact forms

Contact Form 7 6.1.7 (6.2 needs PHP 8.3), with Flamingo 2.6.4 to keep every message in wp-admin — essential on a stack where mail can fail. Map Flamingo to your field names (`block-conversion.md`, "Forms"). Add a subject select (order, product, delivery, return, wholesale, other) and a one-line privacy notice under the button; route returns through it if the terms say returns go through the contact page.

## Payments

On this install, before any configuration, the three core gateways (bacs, cheque, cod) were all disabled (measured): a store set up by tools has no way to pay until a tool enables one.

- **Bank transfer (BACS)** — native. Title, description and instructions can be written now; account details (holder, bank, number, IBAN/BIC) only come from the client. Until then the thank-you page tells customers to transfer to an account it does not show: keep it disabled in production until the details exist.
- **Paystack** — "Paystack WooCommerce Payment Gateway" 5.8.6 by Paystack, from wordpress.org. Read in `includes/class-wc-gateway-paystack.php`: XOF is among the supported currencies (line 285), and `is_available()` returns false unless both the public and the secret key are set — so the gateway is enabled but invisible at checkout until the client pastes keys from their Paystack dashboard. It supports the block checkout (`class-wc-gateway-paystack-blocks-support.php`). Configure test mode, `payment_page` = `redirect` and no saved cards from a tool that never writes keys; keys are entered by the client. Which channels (card, mobile money) appear depends on the merchant account: leave that sentence `à compléter` in the FAQ.
- Declare the payment provider as a data recipient in the privacy policy.

## Help pages: about, FAQ, delivery and returns, care

Modelled on the reference's own pages, with the client's positioning as the only invented element:

- **About** — a collage of eight product photos around a centred title, the three reasons to buy, the story with its facts left `à compléter` (founding date, founder), and a "need help?" band.
- **FAQ** — topics in a two-column grid of `core/details` questions; every answer either quotes a known fact, points to the page that holds it, or is `à compléter`. Then the three contact channels.
- **Delivery and returns** — the return promise in the client's exact words, the procedure through the contact page, and placeholders for zones, prices, delays and refund method.
- **Care guide** — general advice for cotton is safe to write; temperatures and product-specific instructions are `à vérifier`, and the page opens with "the label comes first".

## The local stack itself

- **OPcache off makes every page slow.** XAMPP ships `;zend_extension=opcache`. With WooCommerce, MailPoet and Complianz active, every WordPress request took 9–10 s while a static file took 0.12 s; WordPress reached `plugins_loaded` 5.8 s into the request (timed with a temporary must-use plugin, since removed). MailPoet accounted for about half a second of it (9.0–9.4 s without, 9.5–9.8 s with). Enabling OPcache is a change to the developer's machine: propose it, do not make it.
- **No mail server.** Nothing listens on port 25 on a default XAMPP; every `wp_mail()` fails. That is also what makes local form and checkout tests safe to run.
- Back up the database (`mysqldump`) before each batch of tools: on this build each dump took seconds for a 2 MB database.
