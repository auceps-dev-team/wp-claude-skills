---
name: wp-theme-multipurpose
description: Architect multipurpose and commercial WordPress themes — skins and style variants, header/footer builders with multiple layouts, front-page section systems, per-section option overrides, demo content importers, bundled plugin management with TGMPA, and page-builder element libraries. Use this whenever building or maintaining a theme sold on a marketplace, a theme with switchable demos or skins, a theme with many header/footer/layout variants, or when the user mentions ThemeForest, multipurpose themes, demo import, or bundled plugins.
---

# Multipurpose theme architecture

A multipurpose theme is a *product*, and it fails for product reasons rather than code reasons: unmaintainable variant explosion, a demo importer that breaks on someone's host, a bundled plugin with a known CVE, and an update that overwrites customer changes.

The architectural question underneath all of it: **what varies, and how is variation stored?** Answer that badly and everything else compounds.

## The variant explosion problem

Real themes ship 9 header variants, 13 footer layouts, and template parts crossed by style × post-format producing thirty near-identical files. Each is a separate PHP file. A markup fix means editing all of them, and in practice they drift.

Three strategies, in order of preference:

**1. One template, data-driven.** The variants differ in arrangement, not in substance:

```php
// parts/header.php
$layout = mytheme_get_option( 'header_layout', 'centered' );
$zones  = mytheme_header_zones( $layout );   // returns ['left'=>[...], 'center'=>[...], 'right'=>[...]]
?>
<header class="site-header site-header--<?php echo esc_attr( $layout ); ?>">
    <?php foreach ( $zones as $zone => $elements ) : ?>
        <div class="site-header__<?php echo esc_attr( $zone ); ?>">
            <?php foreach ( $elements as $el ) {
                get_template_part( 'parts/header/element', $el );
            } ?>
        </div>
    <?php endforeach; ?>
</header>
```

Now a layout is a data structure, adding one is an array entry, and a markup fix happens once. This handles the large majority of real "variants".

**2. Composition.** Small parts assembled differently per layout. More files than (1), but each is small and single-purpose.

**3. Separate templates.** Only when a variant genuinely shares no markup with the others. If two files are 80% identical, they should not both exist.

The same reasoning applies to CSS: emit a layout modifier class and style it, rather than shipping a stylesheet per variant.

## Skins

A skin bundles a palette, typography, layout defaults, extra styles and its own demo content. A well-built skin system looks like:

```
skins/
├── skins.json                # registry: name, version, screenshot, requirements
├── skins.php                 # loader, switcher, upgrade checks
├── skins-options.php
└── default/
    ├── skin.php              # bootstrap, hooks
    ├── skin-setup.php        # theme supports and defaults for this skin
    ├── skin-options.php      # option overrides
    ├── skin-plugins.php      # required plugins for this skin
    ├── skin-demo-importer.php
    ├── css/  front-page/  plugins/
    └── skin.jpg
```

Design rules that keep it maintainable:

- **A skin overrides defaults; it does not own user data.** Switching skins must not destroy customizations. Store skin defaults separately from user values and resolve `user value → skin default → theme default`.
- **Skins declare their plugin requirements** rather than the theme requiring the union of everything.
- **Per-skin, per-plugin styling belongs in the skin.** `skins/default/plugins/elementor/elementor.scss`, `.../contact-form-7/`, `.../woocommerce/`. This is verbose but correct: styling for a plugin that may not be installed should never load unconditionally.
- **Ship a version marker per skin** so upgrades can migrate skin-specific options.

Guard the loading:

```php
add_action( 'wp_enqueue_scripts', function () {
    if ( defined( 'ELEMENTOR_VERSION' ) ) {
        wp_enqueue_style( 'mytheme-elementor', mytheme_skin_uri() . '/plugins/elementor/elementor.css', array( 'mytheme' ), MYTHEME_VERSION );
    }
} );
```

## Front-page sections

Section-based front pages predate page builders and remain useful for themes targeting non-technical users:

```php
$sections = apply_filters( 'mytheme_front_page_sections', array(
    'title', 'about', 'features', 'team', 'testimonials', 'blog', 'contacts',
) );

foreach ( $sections as $section ) {
    if ( ! mytheme_get_option( "section_{$section}_enabled", true ) ) {
        continue;
    }
    get_template_part( 'front-page/section', $section );
}
```

Making the list filterable is what lets child themes reorder or insert sections without touching the parent.

If the theme also ships page-builder support, be explicit about which system owns the front page — offering both an Elementor front page and a sections front page, with no clear precedence, produces support tickets rather than flexibility.

## Bundled plugins (TGMPA)

TGM Plugin Activation is the de-facto standard for recommending and bundling plugins.

```php
add_action( 'tgmpa_register', 'mytheme_register_required_plugins' );
function mytheme_register_required_plugins() {
    $plugins = array(
        array(
            'name'     => 'Elementor',
            'slug'     => 'elementor',
            'required' => false,          // recommended, from wordpress.org
        ),
        array(
            'name'     => 'My Theme Core',
            'slug'     => 'mytheme-core',
            'source'   => get_template_directory() . '/plugins/mytheme-core.zip',
            'required' => true,
            'version'  => '1.2.0',
        ),
    );
    tgmpa( $plugins, array( 'is_automatic' => true ) );
}
```

Three rules that matter more than the code:

**Functionality goes in a plugin, not the theme.** Custom post types, shortcodes and page-builder elements registered in a theme vanish when the user switches themes — their content becomes invisible. Ship a companion plugin. Marketplace reviewers now enforce this.

**Every bundled ZIP is your security responsibility.** A theme bundling an old Slider Revolution or an old TGMPA is shipping a known vulnerability to every customer. Track versions and re-bundle on each release. This has caused some of the largest WordPress compromises on record.

**Prefer `required => false`.** Hard requirements that block the admin until dismissed are a common review rejection and a bad first impression.

Keep TGMPA itself updated — it is a bundled library like any other.

## Demo import

The highest-risk component you will ship, because it legitimately writes files, creates content, activates plugins and runs SQL.

```php
add_filter( 'pt-ocdi/import_files', 'mytheme_demo_files' );
function mytheme_demo_files() {
    return array(
        array(
            'import_file_name'           => 'Business',
            'local_import_file'          => get_template_directory() . '/demo/business/content.xml',
            'local_import_widget_file'   => get_template_directory() . '/demo/business/widgets.wie',
            'local_import_customizer_file' => get_template_directory() . '/demo/business/customizer.dat',
            'import_preview_image_url'   => get_template_directory_uri() . '/demo/business/preview.jpg',
            'import_notice'              => esc_html__( 'Import replaces menus and front page settings.', 'mytheme' ),
        ),
    );
}

add_action( 'pt-ocdi/after_import', 'mytheme_after_import' );
function mytheme_after_import( $selected ) {
    $front = get_page_by_path( 'home' );
    if ( $front ) {
        update_option( 'show_on_front', 'page' );
        update_option( 'page_on_front', $front->ID );
    }
    $menu = get_term_by( 'name', 'Main Menu', 'nav_menu' );
    if ( $menu ) {
        set_theme_mod( 'nav_menu_locations', array( 'primary' => $menu->term_id ) );
    }
}
```

The security checklist for an importer — treat each as a release blocker:

- Capability-gated at `import` or `manage_options`, **and** nonce-protected.
- Demo files come from a hard-coded HTTPS URL or a bundled path, never from a request parameter. A URL parameter here is full SSRF plus arbitrary file write.
- Archive extraction rejects entry names containing `..`.
- URL-replacement SQL is genuinely prepared. Shipped importers have been found calling `$wpdb->prepare()` with the values already concatenated in and no placeholders — decorative, and a `_doing_it_wrong()` on WP 6.2+:

```php
$wpdb->query( $wpdb->prepare(
    "UPDATE {$wpdb->postmeta} SET meta_value = REPLACE( meta_value, %s, %s ) WHERE meta_key = %s",
    $from_url, $to_url, '_elementor_data'
) );
```

- Warn before overwriting, and never let the importer run twice silently on a live site.

Operationally: demo import is where most support load comes from. It fails on low `max_execution_time`, low memory, and hosts that block outbound HTTP. Batch the import, check `wp_remote_get()` results for `WP_Error`, and give a real error message instead of a blank screen.

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

## Update path

Customers modify parent themes. They should not, but they do. Reduce the damage:

- Ship a child theme in the package and point the documentation at it.
- Expose real extension points — `apply_filters()` around option values, `do_action()` at layout positions. A theme with no hooks forces file edits, which guarantees update pain.
- Wrap every public function in `if ( ! function_exists() )` so child themes can override it. An unwrapped function cannot be overridden at all, only worked around.
- Keep a versioned changelog and never silently change behaviour in a patch release.

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

## Marketplace submission

Common rejection reasons, in roughly the order they occur:

1. Functionality in the theme instead of a plugin (CPTs, shortcodes, builder elements).
2. Unprefixed functions, classes, options or globals.
3. Missing escaping on output, missing sanitizing on input.
4. Hard-coded text not passed through translation functions, or a non-literal text domain.
5. Scripts and styles output directly rather than enqueued.
6. Outdated bundled libraries with known vulnerabilities.
7. `Requires PHP` / `Tested up to` absent or wrong.
8. Demo content that ships copyrighted images without a license.

Run the Theme Check plugin and `phpcs --standard=WordPress` before submitting, and see the `wp-release` skill for the full pre-flight sequence.
