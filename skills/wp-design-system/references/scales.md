# Type and spacing scales

## Typography

### Fluid scale

`theme.json` generates `clamp()` automatically with `"fluid": true`, which removes most typographic media queries:

```json
"typography": {
  "fluid": true,
  "fontSizes": [
    { "slug": "small",   "size": "0.875rem", "name": "Small" },
    { "slug": "medium",  "size": "1rem",     "name": "Medium" },
    { "slug": "large",   "size": "1.5rem",   "name": "Large",
      "fluid": { "min": "1.25rem", "max": "1.75rem" } },
    { "slug": "x-large", "size": "2.25rem",  "name": "Extra large",
      "fluid": { "min": "1.75rem", "max": "3rem" } }
  ]
}
```

Without `theme.json`, write it by hand:

```css
:root {
  --font-size-md: 1rem;
  --font-size-lg: clamp(1.25rem, 1.1rem + 0.75vw, 1.75rem);
  --font-size-xl: clamp(1.75rem, 1.4rem + 1.75vw, 3rem);
}
```

Always include a `rem` term in the middle argument. A pure `vw` value does not respond to browser zoom, which is a WCAG 1.4.4 failure.

### Line height and measure

Line height scales inversely with font size: ~1.6 for body, ~1.1–1.25 for large headings. A single line-height applied everywhere is the most visible sign of an unconsidered type system.

Constrain measure to 60–75 characters. In `theme.json` that is `settings.layout.contentSize` — roughly `65ch`, or 680–780px for typical body sizes.

### Loading fonts

Self-host. Google Fonts served from `fonts.googleapis.com` adds a third-party connection, a render-blocking request, and a GDPR problem that has produced actual fines in the EU. WordPress ships `wp_get_font_dir()` and `theme.json` `fontFace` for local fonts:

```json
"fontFamilies": [{
  "slug": "body",
  "name": "Inter",
  "fontFamily": "Inter, system-ui, sans-serif",
  "fontFace": [{
    "fontFamily": "Inter",
    "fontWeight": "400 700",
    "fontStyle": "normal",
    "src": [ "file:./assets/fonts/inter-var.woff2" ]
  }]
}]
```

A variable font with a `fontWeight` range replaces four to six static files. Add `font-display: swap` (the default for `fontFace`) and preload only the one face used above the fold — preloading everything defeats the purpose.

A system font stack costs nothing and renders instantly; propose it before assuming a custom typeface is required.

## Spacing

One scale, used everywhere. Disable the generated scale and declare explicit steps so the names are meaningful:

```json
"spacing": {
  "spacingScale": { "steps": 0 },
  "spacingSizes": [
    { "slug": "20", "size": "0.5rem",  "name": "1" },
    { "slug": "30", "size": "1rem",    "name": "2" },
    { "slug": "40", "size": "1.5rem",  "name": "3" },
    { "slug": "50", "size": "2rem",    "name": "4" },
    { "slug": "60", "size": "3rem",    "name": "5" },
    { "slug": "70", "size": "4.5rem",  "name": "6" }
  ]
}
```

Numeric slugs leave room to insert steps later; `small`/`medium`/`large` runs out immediately. Section padding should also be fluid — `clamp(2rem, 6vw, 6rem)` — so mobile does not inherit desktop's generous vertical rhythm.
