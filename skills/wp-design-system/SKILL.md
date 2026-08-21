---
name: wp-design-system
description: Build a coherent design system for a WordPress theme — design tokens mapped to theme.json and CSS custom properties, colour palettes with contrast validation, fluid typography scales, spacing rhythm, dark mode, and keeping the block editor visually identical to the front end. Use this whenever setting up a theme's colours, typography or spacing, converting a Figma or brand guide into a theme, defining CSS variables, or fixing why the editor looks different from the front end.
---

# Design systems for WordPress themes

The recurring failure is **duplicated truth**: the same colour defined in `theme.json`, again in SCSS, again as a Customizer default, and again hard-coded in a template. They drift within weeks and the editor stops matching the front end.

Fix it by choosing a single origin for every token and deriving everything else from it.

## Choosing the origin

| Theme type | Origin | Why |
|---|---|---|
| Block / FSE | `theme.json` | It generates the CSS variables and populates the editor UI. Nothing else can. |
| Hybrid | `theme.json` | Same, and PHP templates can consume `var(--wp--preset--*)` freely. |
| Classic with Customizer | The options accessor | The user's values must win; `theme.json` would be a second source. |
| Classic, no options | A CSS file of custom properties | Simplest thing that works. |

For a Customizer-driven theme, generate variables from options at runtime and let `theme.json` reference them — this keeps the Customizer authoritative while still giving the block editor correct colours:

```json
"styles": { "color": { "background": "var(--mytheme-bg)" } }
```

```php
// Emitted for both front end and editor, so the two cannot diverge.
function mytheme_root_css() {
    return sprintf(
        ':root{--mytheme-bg:%s;--mytheme-primary:%s;}',
        sanitize_hex_color( mytheme_get_option( 'bg_color' ) ) ?: '#ffffff',
        sanitize_hex_color( mytheme_get_option( 'primary_color' ) ) ?: '#0a4bc1'
    );
}
add_action( 'wp_enqueue_scripts', fn() => wp_add_inline_style( 'mytheme', mytheme_root_css() ), 20 );
add_action( 'enqueue_block_assets', fn() => wp_add_inline_style( 'mytheme', mytheme_root_css() ), 20 );
```

`enqueue_block_assets` fires in **both** contexts, which is exactly what editor parity requires.

## A component's colour is not its own

Two bugs from one bespoke build, both of which shipped looking fine in review
and rendered *invisible* on the page. Neither is a typo; both come from a
component asserting a colour it had no business asserting.

**A figure painted itself navy.** A stat block set
`color: var(--wp--preset--color--navy)` on its number. Placed on a white
section that is correct, and it is what the reviewer saw. Dropped into the
page's navy band it became navy on navy: the yellow caption still showed, the
number did not. The block had *no* missing style — it had one too many.

The rule that prevents it: **a component that can sit on more than one ground
inherits its foreground.** `color: inherit` — or nothing at all — and let the
band own the pairing. Assert a colour only where the component also owns the
background, so the pair is decided in one place.

```css
/* The band decides the pairing; the figure inside just follows it. */
.stat__value { color: inherit; }
.band--navy  { background: var(--wp--preset--color--navy);
               color: var(--wp--preset--color--base); }
```

**A modifier lost to its own base class.** `.button--primary` set the signature
background; `.button` set navy. Both are one class, so specificity is tied and
load order decides — and load order was not what the author assumed:

| Hook | When it fires |
|---|---|
| `enqueue_block_assets` | **before** `wp_enqueue_scripts` on the front end |
| `wp_enqueue_scripts` | after |

Core registers `wp_common_block_scripts_and_styles()` on `wp_enqueue_scripts`
during load, and it fires `enqueue_block_assets` from inside. A theme adding its
own callback on the same hook at the same priority is therefore queued *later*.
So the block stylesheet — the file most often chosen for editor parity — loses
every tie against the main stylesheet.

The fix is not to reorder, which makes the rule depend on a hook's internals.
Break the tie in the selector:

```css
.button.button--primary { background: var(--wp--preset--color--signature); }
```

Both bugs share a tell: **an element that is present in the DOM, correct in the
markup, and absent on screen.** When something renders but cannot be seen, check
the ground before you check the rule.

A photograph is the hardest ground of all, because it has no single colour to
pair against — see [`references/imagery.md`](references/imagery.md).

## Colour

Name tokens by **role**, not appearance. `--color-primary` survives a rebrand; `--color-blue` becomes a lie the first time the brand changes.

```json
"palette": [
  { "slug": "base",       "color": "#ffffff", "name": "Base" },
  { "slug": "contrast",   "color": "#111318", "name": "Contrast" },
  { "slug": "primary",    "color": "#0a4bc1", "name": "Primary" },
  { "slug": "primary-alt","color": "#083a97", "name": "Primary hover" },
  { "slug": "accent",     "color": "#fb582a", "name": "Accent" },
  { "slug": "surface",    "color": "#f4f8fa", "name": "Surface" },
  { "slug": "border",     "color": "#d3dce0", "name": "Border" }
]
```

Keep the palette small. Seven to ten roles covers almost every theme; a palette of thirty means the roles are not doing their job and users will pick inconsistently.

### Contrast is a constraint, not a review step

Check pairs as you choose them, not after the design is finished:

| Use | Minimum ratio |
|---|---|
| Body text | 4.5:1 |
| Large text (≥24px, or ≥19px bold) | 3:1 |
| UI borders, icons, focus rings | 3:1 |
| Disabled elements | exempt, but should still read |

Note the pair that fails most often: a mid-tone brand colour as a button background with white text. Brand blues around `#0a4bc1` pass; anything lighter usually does not, and the fix is a darker `-alt` token for interactive use rather than abandoning the brand colour.

If the theme lets users pick colours, either constrain the palette (`"custom": false`) or accept that users will create unreadable combinations. The honest middle ground is to ship accessible defaults and warn in the docs.

### Dark mode

Redefine tokens in a media query; never restate component rules:

```css
:root {
  --color-base: #ffffff;
  --color-contrast: #111318;
  --color-surface: #f4f8fa;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-base: #0d0f13;
    --color-contrast: #f2f4f7;
    --color-surface: #171a21;
  }
}
:root[data-theme="dark"] {
  --color-base: #0d0f13;
  --color-contrast: #f2f4f7;
  --color-surface: #171a21;
}
```

The `:not([data-theme="light"])` and the explicit `[data-theme]` selectors together let a manual toggle override the system preference in both directions — with only the media query, a user who chooses light on a dark-scheme OS gets nothing.

Dark mode is not inversion. Pure `#000` backgrounds with `#fff` text cause halation; large brand-colour fills usually need desaturating. Re-check contrast on the dark palette separately.

## Editor parity

Users judge the editor's fidelity harshly, and rightly. Three sources of divergence:

1. **Styles not expressed in `theme.json`.** Anything in a stylesheet the editor does not load. Fix by moving it into `theme.json`, or register it with `add_editor_style()`.
2. **Wrapper-dependent selectors.** `.site-main .entry-content h2` never matches in the editor, which has a different DOM. Style the element or the block class instead: `h2`, `.wp-block-heading`.
3. **Runtime-generated CSS enqueued only on the front end.** Hook `enqueue_block_assets` as well, as shown above.

```php
add_action( 'after_setup_theme', function () {
    add_theme_support( 'editor-styles' );
    add_editor_style( 'assets/css/editor.css' );
    add_theme_support( 'wp-block-styles' );
} );
```

Verify by opening a post in the editor next to the published page. If they differ, the design system has two sources of truth somewhere.

## From a brand guide to a theme

1. Extract the tokens: colours by role, type scale, spacing scale, radii, shadows.
2. Check every text/background pair for contrast **before** committing them. Adjust now, not after implementation.
3. Write `theme.json` `settings` first — palette, font sizes, spacing. Nothing renders differently yet.
4. Add `styles` for global defaults, then `styles.elements` for links, buttons and headings.
5. Add `styles.blocks` only for blocks that genuinely deviate.
6. Write component CSS last, consuming variables exclusively. If you type a hex value in a component, a token is missing.
7. Open the editor and compare.

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/brand-assets.md`](references/brand-assets.md) | Auditing a supplied logo, generating web variants including the inverse, wiring it into a theme, and the self-hosted font decision |
| [`references/auditing.md`](references/auditing.md) | Finding hard-coded colours, off-scale font sizes and magic spacing in a theme you inherited |
| [`references/scales.md`](references/scales.md) | Fluid typography with clamp, line height and measure, loading fonts, the spacing scale |
| [`references/imagery.md`](references/imagery.md) | Veils over photographs, gradient direction, the color-mix fallback, decorative alt, image sizes, and placeholder photography |
| [`references/fidelity.md`](references/fidelity.md) | Working from client mockups: the drift catalogue, extracting exact tokens, self-hosting the named fonts, casing and scale, animation rules, and a pre-review checklist |
