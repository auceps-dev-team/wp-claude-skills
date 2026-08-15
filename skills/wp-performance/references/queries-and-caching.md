# Queries and caching

## Queries

### N+1

The most expensive pattern, and it hides well:

```php
// 1 + 3N queries: each get_post_meta and get_the_terms hits the DB
foreach ( $posts as $post ) {
    echo get_post_meta( $post->ID, 'subtitle', true );
    echo get_the_terms( $post->ID, 'category' )[0]->name;
}
```

`WP_Query` primes meta and term caches for its own results automatically. The bug appears when you disable that, or when you loop over IDs from a custom query:

```php
$q = new WP_Query( array(
    'post_type'              => 'post',
    'posts_per_page'         => 20,
    'update_post_meta_cache' => true,   // default; do not disable if you read meta
    'update_post_term_cache' => true,
    'no_found_rows'          => true,   // skip SQL_CALC_FOUND_ROWS when not paginating
) );
```

For IDs from elsewhere, prime the caches yourself:

```php
_prime_post_caches( $ids, true, true );
```

### Query arguments that cost

| Argument | Cost |
|---|---|
| `'posts_per_page' => -1` | Unbounded. On a large table this exhausts memory. Always cap. |
| `'meta_query'` on unindexed keys | Full scan of `wp_postmeta`. Prefer taxonomies for filtering. |
| `'orderby' => 'meta_value'` | Forces a join and filesort. |
| `'s' => $term` | `LIKE '%term%'` — unindexable. Use a real search index above a few thousand posts. |
| `'post__not_in'` | Expensive `NOT IN`. Over-fetch and filter in PHP instead. |
| `'no_found_rows' => false` | Adds a `COUNT(*)`. Set true when not paginating. |
| `'fields' => 'ids'` | Much cheaper when you only need IDs. |

### Autoloaded options

Every autoloaded option is unserialized on every request. Plugins that store large blobs autoloaded are a common cause of a slow site with no slow query:

```php
update_option( 'mytheme_cache', $big_array, false );   // false = do not autoload
```

Audit with the command at the top of this skill. Anything over 100KB autoloaded deserves scrutiny.

## Caching

### Transients

For expensive work with a tolerable staleness window:

```php
function mytheme_popular_posts() {
    $key   = 'mytheme_popular';
    $posts = get_transient( $key );

    if ( false === $posts ) {
        $posts = get_posts( array(
            'posts_per_page' => 5,
            'meta_key'       => 'view_count',
            'orderby'        => 'meta_value_num',
            'fields'         => 'ids',
        ) );
        set_transient( $key, $posts, HOUR_IN_SECONDS );
    }
    return $posts;
}
```

Two cautions. Without a persistent object cache, transients live in `wp_options` and a transient set with no expiry is autoloaded — leaking rows indefinitely. And `false` is a valid cached value that is indistinguishable from a miss; cache `array()` or a sentinel rather than `false`.

Invalidate on write, do not rely only on TTL:

```php
add_action( 'save_post', fn() => delete_transient( 'mytheme_popular' ) );
```

### Object cache

Redis or Memcached with a drop-in turns `wp_cache_*` into a real persistent cache and makes transients fast:

```php
$value = wp_cache_get( $key, 'mytheme' );
if ( false === $value ) {
    $value = expensive_operation();
    wp_cache_set( $key, $value, 'mytheme', HOUR_IN_SECONDS );
}
```

Without a drop-in, `wp_cache_*` is request-scoped only — still useful for avoiding repeated work within one page load, but nothing persists.

### Page caching

The largest single win for anonymous traffic, and it happens above your code: a full-page cache turns a 400ms PHP render into a static file served in single-digit milliseconds.

Rules: never cache logged-in users, never cache cart/checkout/account, and make sure cookies that change output bust the cache. Most performance plugins get this right by default; verify it rather than assuming.
