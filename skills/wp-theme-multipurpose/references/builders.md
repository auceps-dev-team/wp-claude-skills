# Page-builder libraries and load cost

## Page-builder element libraries

Themes commonly ship 40–60 custom builder elements. For WPBakery each is a declaration/render pair:

```
vc-extend/
├── vc-maps/tm_pricing.php        # vc_map() — the field schema
└── vc-templates/tm_pricing.php   # the render callback
```

### Register elements lazily

The schema array for one element is large — every control, every dependency, every description string. Multiply by fifty and you are building a substantial data structure on **every request**, including front-end page views where the editor UI never renders.

WPBakery provides two registration functions for exactly this reason:

```php
vc_map( $attributes );                                  // eager: full array now
vc_lean_map( $tag, $settings_function, $settings_file ); // lazy: schema loaded on demand
```

`vc_lean_map()` registers the shortcode tag and defers the schema to a callback or file that runs only when the editor asks for it. WPBakery 8.2 uses it for 78 of its own 108 elements — 72%.

A theme measured against that: **42 `vc_map()` calls, zero `vc_lean_map()`**, all fired on `vc_after_init` with no `is_admin()` gate. The plugin that provides the API lazy-loads most of its elements; the theme extending it lazy-loads none, on every page load, for every visitor.

So: use the lazy variant, and gate registration to the contexts that need it. The same reasoning applies to Elementor widget registration — `elementor/widgets/register` fires in both contexts, and a widget whose controls are built eagerly costs the front end nothing useful.

### Learn the builder's extension surface before extending it

WPBakery exposes 206 `vc_*` filters and 74 `vc_*` actions. Before subclassing `WPBakeryShortCode` or overriding a template, check whether a filter already does what you need — a filter survives the builder's updates, an overridden template does not. The same holds for Elementor's controls and hooks API.

For Elementor, a widget class per element. Either way:

- **Put them in the companion plugin.** Elements in the theme mean every page a customer built breaks on theme switch.
- **Namespace the shortcode tags.** `[tm_pricing]` not `[pricing]` — generic tags collide with other plugins and break content permanently.
- **Never change a shortcode tag or drop a parameter after release.** The tag is a public data format stored in every customer's post content. Deprecate by ignoring, not by removing.
- **Escape in the render template.** Builder parameters are stored post content, and on a multi-author site an author who cannot be fully trusted can set them.

## Performance

Multipurpose themes are heavy by nature. Two habits that carry most of the benefit:

**Load conditionally.** Do not enqueue every slider, lightbox and icon font on every page. Detect what the page uses, or gate on the option that enables it.

**Load one icon font, once.** Themes commonly ship Font Awesome and also inherit Elementor's copies, loading several megabytes of overlapping icons. Dequeue the duplicates:

```php
add_action( 'elementor/frontend/after_register_styles', function () {
    foreach ( array( 'elementor-icons-fa-solid', 'elementor-icons-fa-regular', 'elementor-icons-fa-brands' ) as $handle ) {
        wp_dequeue_style( $handle );
    }
}, 20 );
```

Details in the `wp-performance` skill.
