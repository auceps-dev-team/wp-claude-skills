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

For a plugin (not a theme) providing templates, use `wc_get_template_part()` and the `woocommerce_locate_template` filter rather than shipping into the theme's namespace.

## Product loops

Change the main shop query through `pre_get_posts` or WooCommerce's own filters, never `query_posts()`:

```php
add_filter( 'loop_shop_per_page', fn() => 12, 20 );
add_filter( 'loop_shop_columns', fn() => 3, 20 );

add_action( 'pre_get_posts', function ( $q ) {
    if ( is_admin() || ! $q->is_main_query() ) {
        return;
    }
    if ( is_shop() || is_product_taxonomy() ) {
        $q->set( 'orderby', 'menu_order' );
    }
} );
```

Custom product loop:

```php
$products = new WP_Query( array(
    'post_type'      => 'product',
    'posts_per_page' => 8,
    'no_found_rows'  => true,
    'tax_query'      => array( array(
        'taxonomy' => 'product_visibility',
        'field'    => 'name',
        'terms'    => 'exclude-from-catalog',
        'operator' => 'NOT IN',
    ) ),
) );

if ( $products->have_posts() ) {
    woocommerce_product_loop_start();
    while ( $products->have_posts() ) {
        $products->the_post();
        wc_get_template_part( 'content', 'product' );
    }
    woocommerce_product_loop_end();
    wp_reset_postdata();
}
```

The `product_visibility` tax query is what excludes hidden products — a plain `WP_Query` on `product` shows catalog-hidden items, which is a common bug on custom homepages.

## Product data

Use the CRUD API. Direct meta access bypasses caching, validation, and works differently for variations:

```php
$product = wc_get_product( $post_id );

$product->get_price();
$product->get_regular_price();
$product->get_stock_quantity();
$product->is_in_stock();
$product->is_type( 'variable' );

$product->set_regular_price( '19.99' );
$product->save();                       // required — setters do not persist
```

`wc_get_product()` returns the correct subclass (`WC_Product_Variable`, `WC_Product_Simple`…). `get_post_meta( $id, '_price', true )` returns something that looks right and is wrong for variable products.

Always `->save()`. Forgetting it is the most common WooCommerce data bug.

### Custom product fields

```php
add_action( 'woocommerce_product_options_general_product_data', function () {
    woocommerce_wp_text_input( array(
        'id'          => '_mytheme_supplier',
        'label'       => __( 'Supplier code', 'mytheme' ),
        'desc_tip'    => true,
        'description' => __( 'Internal reference.', 'mytheme' ),
    ) );
} );

add_action( 'woocommerce_admin_process_product_object', function ( $product ) {
    // WooCommerce has already verified the nonce and capability for this hook.
    $product->update_meta_data( '_mytheme_supplier', sanitize_text_field( wp_unslash( $_POST['_mytheme_supplier'] ?? '' ) ) );
} );
```

`woocommerce_admin_process_product_object` is preferable to `save_post`: it runs inside WooCommerce's own save flow, so the nonce and capability checks are already done and the object is saved for you.

## Cart and checkout

WooCommerce now has two checkout implementations. **Find out which the store uses before changing anything** — the classic shortcode `[woocommerce_checkout]` and the Checkout block share almost no customization surface.

**Classic checkout** — PHP hooks and filters:

```php
add_filter( 'woocommerce_checkout_fields', function ( $fields ) {
    unset( $fields['billing']['billing_company'] );
    $fields['billing']['billing_phone']['required'] = true;
    $fields['order']['order_comments']['placeholder'] = __( 'Delivery notes', 'mytheme' );
    return $fields;
} );

add_action( 'woocommerce_checkout_process', function () {
    if ( empty( $_POST['billing_phone'] ) ) {
        wc_add_notice( __( 'Phone number is required.', 'mytheme' ), 'error' );
    }
} );
```

**Block checkout** — additional fields go through the Store API:

```php
add_action( 'woocommerce_init', function () {
    woocommerce_register_additional_checkout_field( array(
        'id'       => 'mytheme/delivery-window',
        'label'    => __( 'Preferred delivery window', 'mytheme' ),
        'location' => 'order',
        'type'     => 'select',
        'options'  => array(
            array( 'value' => 'am', 'label' => __( 'Morning', 'mytheme' ) ),
            array( 'value' => 'pm', 'label' => __( 'Afternoon', 'mytheme' ) ),
        ),
    ) );
} );
```

`woocommerce_checkout_fields` has **no effect** on the block checkout. That mismatch is behind a large share of "my checkout customization stopped working" reports after a store migrates.

Cart totals and fees work in both:

```php
add_action( 'woocommerce_cart_calculate_fees', function ( $cart ) {
    if ( is_admin() && ! wp_doing_ajax() ) {
        return;
    }
    if ( $cart->get_subtotal() < 50 ) {
        $cart->add_fee( __( 'Small order fee', 'mytheme' ), 4.95 );
    }
} );
```

## HPOS (High-Performance Order Storage)

Orders moved from `wp_posts`/`wp_postmeta` to dedicated tables. New stores default to HPOS; any code reading orders via post meta is broken there.

Declare compatibility, or WooCommerce warns the user and may disable HPOS:

```php
add_action( 'before_woocommerce_init', function () {
    if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
            'custom_order_tables', __FILE__, true
        );
    }
} );
```

Then use the CRUD API exclusively:

```php
$order = wc_get_order( $order_id );
$order->get_billing_email();
$order->get_items();
$order->update_meta_data( '_mytheme_ref', $ref );
$order->save();

$orders = wc_get_orders( array( 'status' => 'processing', 'limit' => 20 ) );
```

Never `get_post_meta( $order_id, ... )`, never `new WP_Query( array( 'post_type' => 'shop_order' ) )`. Both silently return nothing under HPOS.

Audit an existing codebase:

```bash
rg -n "shop_order|get_post_meta\(\s*\\\$order" --glob '*.php'
```

## Emails

```php
add_filter( 'woocommerce_email_order_meta_fields', function ( $fields, $sent_to_admin, $order ) {
    $fields['delivery_window'] = array(
        'label' => __( 'Delivery window', 'mytheme' ),
        'value' => $order->get_meta( '_mytheme_delivery_window' ),
    );
    return $fields;
}, 10, 3 );
```

Email templates override into `themes/mytheme/woocommerce/emails/`. Email HTML must be table-based with inline styles — WooCommerce runs an inliner over `emails/email-styles.php`, so put CSS there rather than in a `<style>` block that clients will strip.

## Performance

Stores get slow in predictable ways:

- **Cart fragments** (`wc-cart-fragments`) fire an uncached AJAX request on every page load. If the header has no live cart count, dequeue it outside cart and checkout — it is one of the biggest single wins on a WooCommerce site.
- **Never cache cart, checkout or account pages.** Exclude them at the page-cache layer, and make sure `WOOCOMMERCE_CART`-type cookies bust the cache.
- **Product meta queries are expensive.** Filtering by attribute across thousands of products needs proper taxonomy terms, not meta.
- **`wc_get_products()` with `'limit' => -1`** on a large catalog will exhaust memory. Paginate.

```php
add_action( 'wp_enqueue_scripts', function () {
    if ( ! is_cart() && ! is_checkout() ) {
        wp_dequeue_script( 'wc-cart-fragments' );
    }
}, 20 );
```

## Debugging

- **WooCommerce → Status** shows outdated template overrides, the HPOS state and environment problems. Read it first.
- `wc_get_logger()->debug( $msg, array( 'source' => 'mytheme' ) )` writes to WooCommerce → Status → Logs.
- A hook that "doesn't fire" is usually the wrong priority on `remove_action`, or code running before `woocommerce_init`.
- If a change works on the classic checkout and not the block one, that is the expected behaviour — see above.
