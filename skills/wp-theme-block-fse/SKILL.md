---
name: wp-theme-block-fse
description: Build block themes and full site editing (FSE) themes — theme.json settings and styles, HTML block templates and template parts, block patterns, style variations, and hybrid themes that mix theme.json with PHP templates. Use this whenever working with theme.json, templates/*.html, the Site Editor, global styles, block patterns, style variations, or when adding block editor support to a classic theme.
---

# Block themes and FSE

A block theme moves layout out of PHP and into HTML files made of block markup, with `theme.json` as the configuration layer. The mental shift: **you are not writing templates, you are declaring defaults that the Site Editor can override.** Anything a user changes in the Site Editor is stored in the database as a `wp_template` / `wp_global_styles` post and wins over your files from then on.

That last point catches people out constantly — "my theme.json change did nothing" almost always means the user has already customized that value in the Site Editor.

## Structure

```
mytheme/
├── style.css                # header block only
├── theme.json               # the configuration layer
├── functions.php            # optional but usually present
├── templates/
│   ├── index.html           # required
│   ├── single.html  page.html  archive.html  search.html  404.html
│   └── home.html
├── parts/
│   ├── header.html  footer.html
├── patterns/
│   └── hero.php             # PHP files with a header comment
└── styles/
    └── dark.json            # style variations
```

`templates/index.html` is the only strictly required template. The same hierarchy as classic themes applies, with `.html` instead of `.php`.

A theme is treated as a block theme when `templates/index.html` exists. Adding `theme.json` alone to a classic theme makes it *hybrid*, not block — a genuinely useful middle ground covered at the end.

## theme.json

Use schema version 3 (WP 6.6+). The `$schema` line gives you editor autocomplete and is worth including.

```json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "settings": {
    "appearanceTools": true,
    "useRootPaddingAwareAlignments": true,
    "layout": { "contentSize": "720px", "wideSize": "1200px" },
    "color": {
      "custom": false,
      "defaultPalette": false,
      "palette": [
        { "slug": "base",     "color": "#ffffff", "name": "Base" },
        { "slug": "contrast", "color": "#111111", "name": "Contrast" },
        { "slug": "primary",  "color": "#0a4bc1", "name": "Primary" }
      ]
    },
    "typography": {
      "fluid": true,
      "fontFamilies": [
        {
          "slug": "body",
          "name": "Body",
          "fontFamily": "Inter, sans-serif",
          "fontFace": [
            {
              "fontFamily": "Inter",
              "fontWeight": "400 700",
              "fontStyle": "normal",
              "fontStretch": "normal",
              "src": [ "file:./assets/fonts/inter.woff2" ]
            }
          ]
        }
      ],
      "fontSizes": [
        { "slug": "small",  "size": "0.875rem", "name": "Small" },
        { "slug": "medium", "size": "1rem",     "name": "Medium" },
        {
          "slug": "large",
          "size": "1.5rem",
          "name": "Large",
          "fluid": { "min": "1.25rem", "max": "2rem" }
        }
      ]
    },
    "spacing": {
      "spacingScale": { "steps": 0 },
      "spacingSizes": [
        { "slug": "30", "size": "1rem",   "name": "1" },
        { "slug": "50", "size": "2rem",   "name": "3" },
        { "slug": "70", "size": "4rem",   "name": "5" }
      ]
    }
  },
  "styles": {
    "color": { "background": "var(--wp--preset--color--base)", "text": "var(--wp--preset--color--contrast)" },
    "typography": { "fontFamily": "var(--wp--preset--font-family--body)", "lineHeight": "1.6" },
    "spacing": { "padding": { "left": "var(--wp--preset--spacing--50)", "right": "var(--wp--preset--spacing--50)" } },
    "elements": {
      "link":   { "color": { "text": "var(--wp--preset--color--primary)" },
                  ":hover": { "typography": { "textDecoration": "none" } } },
      "button": { "color": { "background": "var(--wp--preset--color--primary)", "text": "var(--wp--preset--color--base)" },
                  "border": { "radius": "4px" } },
      "h1":     { "typography": { "fontSize": "var(--wp--preset--font-size--large)" } }
    },
    "blocks": {
      "core/quote": { "border": { "left": { "width": "3px", "style": "solid", "color": "var(--wp--preset--color--primary)" } } }
    }
  },
  "templateParts": [
    { "name": "header", "title": "Header", "area": "header" },
    { "name": "footer", "title": "Footer", "area": "footer" }
  ],
  "customTemplates": [
    { "name": "page-full-width", "title": "Full width", "postTypes": [ "page" ] }
  ]
}
```

### settings vs styles

`settings` defines *what is available* — it generates CSS custom properties and populates the editor UI. `styles` defines *what is applied*. A palette entry in `settings.color.palette` creates `--wp--preset--color--primary` and a swatch; it changes nothing visually until something in `styles` (or a user) uses it.

### Generated CSS variables

Every preset becomes a variable following a fixed pattern:

```
--wp--preset--color--{slug}
--wp--preset--font-size--{slug}
--wp--preset--font-family--{slug}
--wp--preset--spacing--{slug}
--wp--custom--{path--in--kebab-case}
```

`settings.custom` is a free-form bag for your own tokens:

```json
"custom": { "layout": { "gutter": "1.5rem" } }
```
becomes `--wp--custom--layout--gutter`. Use it for values that are not first-class WordPress concepts.

### Locking the palette

`"custom": false` removes the arbitrary colour picker, `"defaultPalette": false` removes WordPress's own colours. Together they constrain users to your design system — the right default for a client site, usually the wrong one for a theme sold to the public.

### Fluid typography

`"fluid": true` under `typography` generates `clamp()` for every font size automatically. Per-size `fluid.min`/`fluid.max` overrides the calculation where the automatic range is wrong. This replaces hand-written media queries for type.

## Hybrid themes

Adding `theme.json` to a classic theme is often the highest-value change available: you get editor colour and spacing controls, consistent block styling, and generated CSS variables, without rewriting templates.

The discipline that makes it work is **one source of truth for design tokens**. A theme that defines `#0a4bc1` in `theme.json`, again in SCSS, and again in a Customizer default will drift. Pick `theme.json` as the origin and consume it elsewhere:

```css
.legacy-component { color: var(--wp--preset--color--primary); }
```

Commercial hybrid themes often invert this, defining their own `--theme-color-*` variables and referencing them from `theme.json`:

```json
"color": { "background": "var(--theme-color-bg)" }
```

That works and keeps an existing Customizer pipeline authoritative, but it creates two dependencies that are easy to miss. A real hybrid theme, measured:

**The variables must exist wherever the block CSS applies.** That theme's `theme.json` references `var(--theme-color-text_link)` and six siblings, ten references in total. Those variables are defined in `skins/default/css/style.css` — inside a *swappable skin*. So the block button's background depends on which skin is active, and a skin that omits the variable silently produces an unstyled button. In the editor it works only as long as the `add_editor_style()` chain happens to pull that skin's CSS in. When you bridge `theme.json` to your own variables, define them in a file that is unconditionally loaded in **both** contexts — `enqueue_block_assets` is the hook that covers both — not in an optional layer.

**Do not declare the palette twice.** The same theme calls `add_theme_support( 'editor-color-palette', $colors )` *and* ships a palette in `theme.json`. Since WordPress 5.9 `theme.json` wins, so the PHP call is dead code — and worse than dead, because the two lists can disagree. A maintainer editing the PHP array sees no effect and has no error to explain why.

The same supersession applies across the board:

| `add_theme_support()` | Superseded by `theme.json` |
|---|---|
| `editor-color-palette` | `settings.color.palette` |
| `editor-font-sizes` | `settings.typography.fontSizes` |
| `editor-gradient-presets` | `settings.color.gradients` |
| `disable-custom-colors` | `settings.color.custom: false` |
| `disable-custom-font-sizes` | `settings.typography.customFontSize: false` |
| `align-wide` | `settings.layout` |
| `custom-line-height` | `settings.typography.lineHeight` |
| `appearance-tools` | `settings.appearanceTools: true` |

When you add `theme.json` to a classic theme, delete these calls in the same commit. Leaving them is how a theme ends up with two palettes and no way to tell which one is live.

Note that in a hybrid theme `theme.json` does **not** give you the Site Editor. Users still edit content in the block editor and layout in PHP.

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/templates-and-patterns.md`](references/templates-and-patterns.md) | HTML template markup, pattern registration, style variations, editor parity |
| [`references/adoption.md`](references/adoption.md) | Symptom-to-cause table for theme.json problems, and the safe migration order |
