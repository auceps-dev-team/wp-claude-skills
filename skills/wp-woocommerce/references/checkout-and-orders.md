# Cart, checkout, orders and emails

## Contents

- [Cart and checkout](#cart-and-checkout)
- [HPOS (High-Performance Order Storage)](#hpos-high-performance-order-storage)
- [Emails](#emails)
- [Performance](#performance)

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
