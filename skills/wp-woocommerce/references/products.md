# Product loops and product data

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
