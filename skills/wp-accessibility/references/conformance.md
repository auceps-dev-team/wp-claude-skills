# Conformance, motion and structured data

## Contents

- [Colour and motion](#colour-and-motion)
- [WCAG 2.2 additions](#wcag-22-additions)
- [accessibility-ready](#accessibility-ready)
- [Structured data](#structured-data)

## Colour and motion

- Body text 4.5:1, large text and UI components 3:1. See the `wp-design-system` skill for building this into the palette.
- Never use colour as the only indicator — underline links in body text, or provide an icon.
- Respect reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

- Carousels that auto-advance need a pause control (WCAG 2.2.2). Better: do not auto-advance.

## WCAG 2.2 additions

Newer criteria that catch existing themes:

- **2.4.11 Focus Not Obscured** — a sticky header must not cover the focused element. Add `scroll-margin-top` matching the header height.
- **2.5.8 Target Size (Minimum)** — interactive targets at least 24×24 CSS pixels. Icon-only buttons and dense footer menus commonly fail.
- **3.3.7 Redundant Entry** — do not ask for the same information twice in a flow.
- **3.2.6 Consistent Help** — help mechanisms in the same relative position across pages.

## accessibility-ready

For wordpress.org themes, the `accessibility-ready` tag is audited by a human. Requirements include: keyboard navigation throughout, skip link, visible focus, correct headings, labelled forms, sufficient contrast, no keyboard traps, and no content that relies on hover alone. Read the current [Theme Review accessibility requirements](https://make.wordpress.org/themes/handbook/review/accessibility/) before claiming the tag — it is checked, and a failed claim blocks the submission.

## Structured data

Semantic markup and schema serve the same goal. Emit JSON-LD rather than microdata — it is easier to keep correct because it is not entangled with the markup:

```php
add_action( 'wp_head', function () {
    if ( ! is_singular( 'post' ) ) {
        return;
    }
    $schema = array(
        '@context'      => 'https://schema.org',
        '@type'         => 'BlogPosting',
        'headline'      => get_the_title(),
        'datePublished' => get_the_date( 'c' ),
        'dateModified'  => get_the_modified_date( 'c' ),
        'author'        => array( '@type' => 'Person', 'name' => get_the_author() ),
        'mainEntityOfPage' => array( '@type' => 'WebPage', '@id' => get_permalink() ),
    );
    printf( '<script type="application/ld+json">%s</script>', wp_json_encode( $schema ) );
} );
```

**Check whether an SEO plugin is already emitting this.** Yoast and Rank Math output a complete schema graph; a theme adding a second, partial one creates conflicting entities. Detect and defer:

```php
if ( defined( 'WPSEO_VERSION' ) || class_exists( 'RankMath' ) ) {
    return;
}
```

Structured data must describe what is actually on the page. Marking up reviews or FAQs that users cannot see is a manual-action risk, not a ranking trick.
