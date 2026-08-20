# theme.json reference

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
