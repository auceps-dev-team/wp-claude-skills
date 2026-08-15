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

## Update path

Customers modify parent themes. They should not, but they do. Reduce the damage:

- Ship a child theme in the package and point the documentation at it.
- Expose real extension points — `apply_filters()` around option values, `do_action()` at layout positions. A theme with no hooks forces file edits, which guarantees update pain.
- Wrap every public function in `if ( ! function_exists() )` so child themes can override it. An unwrapped function cannot be overridden at all, only worked around.
- Keep a versioned changelog and never silently change behaviour in a patch release.

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

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/packaging.md`](references/packaging.md) | Front-page section systems, TGMPA, demo importers and their security checklist |
| [`references/builders.md`](references/builders.md) | Custom builder elements, lazy registration, conditional asset loading |
