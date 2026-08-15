---
name: wp-woocommerce
description: Customize WooCommerce in themes and plugins — template overrides, the hook system, product loops and single product pages, cart and checkout (classic and block), HPOS order storage, custom product data and fields, and theme support declarations. Use this whenever working on a WooCommerce store, overriding shop templates, changing product or checkout markup, adding custom product fields, hooking into orders, or when the user mentions WooCommerce, shop, cart, checkout or products.
---

# WooCommerce customization

WooCommerce is a large plugin with its own template system, hook layer and data store. The order of preference for any change is fixed, and following it is what keeps a store upgradeable:

**1. Hook → 2. Filter → 3. Template override → 4. Fork (never)**

Template overrides are the tool everyone reaches for first and they carry the highest maintenance cost: every override you keep is a file you must re-check on every WooCommerce release.

## Declare theme support

```php
add_action( 'after_setup_theme', function () {
    add_theme_support( 'woocommerce', array(
        'thumbnail_image_width' => 400,
        'single_image_width'    => 800,
        'product_grid'          => array(
            'default_rows'    => 3,
            'min_rows'        => 1,
            'default_columns' => 4,
            'min_columns'     => 1,
            'max_columns'     => 6,
        ),
    ) );
    add_theme_support( 'wc-product-gallery-zoom' );
    add_theme_support( 'wc-product-gallery-lightbox' );
    add_theme_support( 'wc-product-gallery-slider' );
} );
```

Without `add_theme_support( 'woocommerce' )` the shop renders inside WooCommerce's fallback wrapper and looks unstyled. The three gallery supports are opt-in: declaring none gives a plain gallery, which is sometimes what you want.

## Hooks first

Almost all of WooCommerce's front-end output is emitted from action hooks, so rearranging a product page is usually removing and re-adding actions rather than touching a template:

```php
// Move the price above the title on single product pages
remove_action( 'woocommerce_single_product_summary', 'woocommerce_template_single_price', 10 );
add_action( 'woocommerce_single_product_summary', 'woocommerce_template_single_price', 4 );

// Remove the sale flash everywhere
remove_action( 'woocommerce_before_shop_loop_item_title', 'woocommerce_show_product_loop_sale_flash', 10 );

// Add something of your own after the add-to-cart button
add_action( 'woocommerce_after_add_to_cart_button', function () {
    echo '<p class="delivery-note">' . esc_html__( 'Ships in 2–3 days', 'mytheme' ) . '</p>';
} );
```

Key positions on the single product page (`woocommerce_single_product_summary`): title 5, rating 10, price 10, excerpt 20, add to cart 30, meta 40, sharing 50.

Removing a core action requires the **exact** priority it was added with, or `remove_action()` silently does nothing. This is the number one reason "my remove_action doesn't work".

Hooks added inside a class need the object instance to remove. WooCommerce stores most of its singletons on `WC()`, so `remove_action( 'x', array( WC()->cart, 'method' ) )` works where a bare function name would not.

## Template overrides

Copy from `wp-content/plugins/woocommerce/templates/` into `wp-content/themes/mytheme/woocommerce/`, preserving the path:

```
plugins/woocommerce/templates/content-product.php
→ themes/mytheme/woocommerce/content-product.php
```

Rules that keep this survivable:

- **Copy the minimum.** Overriding `single-product.php` to change one line means re-syncing the whole file forever.
- **Record the version.** Each template header carries `@version`. When WooCommerce updates it, your copy is stale and WooCommerce → Status flags it under "Templates". Check that page after every WooCommerce update.
- **Never override `cart/cart.php` or `checkout/form-checkout.php` unless you must.** These change often and carry payment logic.
- **Keep the `do_action()` calls.** They are the template's contract with every other plugin.

### What override drift actually looks like

A shipped commercial theme, audited in 2026, carries 32 WooCommerce overrides. All of them declare `@version`, which looks disciplined until you read the values:

| Declared `@version` | Files |
|---|---|
| 1.x | 3 |
| 2.x | 3 |
| 3.x | 6 |
| 4.x | 1 |
| 7.x–9.x | 19 |

Twelve of thirty-two — more than a third — are stamped at WooCommerce 4.0 or older, and three at `1.6.4`, a release from 2012. One of those three is `single-product.php`, the main product template.

Two lessons from that spread. First, the theme author clearly *does* re-sync on WooCommerce releases (nineteen files sit at 7.x–9.x, and the changelog shows resyncs for 9.4 through 9.7) — but re-syncs the files that visibly break, while the quiet ones drift for a decade. Second, and worse: **17 of the 32 overrides contain no `do_action()` at all.** That theme's `single-product.php` has dropped `woocommerce_before_main_content`, `woocommerce_after_main_content` and `woocommerce_sidebar` in favour of the theme's own layout.

The consequence is not cosmetic. Any plugin that extends the product page by hooking those actions — badges, subscriptions, wishlists, B2B pricing — renders nothing, with no error. The customer reports "this plugin does not work with my theme", and the cause is an override written years ago.

So when auditing overrides, diff against the stock template for **missing hooks**, not just for markup:

```bash
# Which overrides dropped the action hooks entirely?
for f in $(find woocommerce -name '*.php'); do
  grep -q "do_action(" "$f" || echo "no hooks: $f"
done

# How stale is each one?
grep -rHoE "@version[[:space:]]+[0-9.]+" woocommerce/ | sort -t: -k3 -V
```

For a plugin (not a theme) providing templates, use `wc_get_template_part()` and the `woocommerce_locate_template` filter rather than shipping into the theme's namespace.

## Debugging

- **WooCommerce → Status** shows outdated template overrides, the HPOS state and environment problems. Read it first.
- `wc_get_logger()->debug( $msg, array( 'source' => 'mytheme' ) )` writes to WooCommerce → Status → Logs.
- A hook that "doesn't fire" is usually the wrong priority on `remove_action`, or code running before `woocommerce_init`.
- If a change works on the classic checkout and not the block one, that is the expected behaviour — see above.

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/products.md`](references/products.md) | Shop and archive queries, the CRUD API, custom product fields |
| [`references/checkout-and-orders.md`](references/checkout-and-orders.md) | Classic vs block checkout, cart fees, HPOS order storage, transactional emails, store performance |
