# Sections, bundled plugins and demo import

## Contents

- [Front-page sections](#front-page-sections)
- [Bundled plugins (TGMPA)](#bundled-plugins-tgmpa)
- [Demo import](#demo-import)

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
