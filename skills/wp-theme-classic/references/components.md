# Navigation, widgets and conditionals

## Contents

- [Navigation](#navigation)
- [Widget areas](#widget-areas)
- [Conditional tags](#conditional-tags)

## Navigation

```php
wp_nav_menu( array(
    'theme_location' => 'primary',
    'container'      => 'nav',
    'container_class'=> 'main-nav',
    'menu_class'     => 'menu',
    'depth'          => 3,
    'fallback_cb'    => false,   // render nothing rather than a page list when unassigned
) );
```

Write a custom `Walker_Nav_Menu` subclass only when the markup genuinely cannot be produced by classes and filters — walkers are the hardest part of a theme to maintain, and `nav_menu_css_class`, `nav_menu_item_args` and `walker_nav_menu_start_el` cover most needs. For megamenus, prefer storing configuration in menu item meta over subclassing the edit walker.

## Widget areas

```php
add_action( 'widgets_init', 'mytheme_widgets' );
function mytheme_widgets() {
    register_sidebar( array(
        'name'          => esc_html__( 'Sidebar', 'mytheme' ),
        'id'            => 'sidebar-1',
        'description'   => esc_html__( 'Appears on posts and archives.', 'mytheme' ),
        'before_widget' => '<section id="%1$s" class="widget %2$s">',
        'after_widget'  => '</section>',
        'before_title'  => '<h2 class="widget-title">',
        'after_title'   => '</h2>',
    ) );
}
```

The `%1$s` / `%2$s` placeholders in `before_widget` are required — omit them and widget IDs and classes disappear, breaking most widget CSS.

## Conditional tags

`is_front_page()` vs `is_home()`: the first is the site's front page, the second is the blog posts index. On a default install both are true for `/`; on a site with a static front page they are different pages. Getting this backwards is the most common template bug.

`is_singular()` covers posts, pages and CPTs. `is_single()` excludes pages. `is_page()` covers only pages.

Conditional tags are unreliable before `wp` runs — inside `after_setup_theme` or `init` the query does not exist yet, and calling them there returns false and emits a notice on modern WordPress.
