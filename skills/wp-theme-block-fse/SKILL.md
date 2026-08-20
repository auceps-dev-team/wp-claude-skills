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

## "Gutenberg theme" is a marketing label, not an architecture

Three commercial themes sold as Gutenberg themes were measured. None is a block theme:

| Signal | Carrino 1.8.7 | Cartify 1.4.0 | Gutentype 2.1.13 |
|---|---|---|---|
| `theme.json` | no | no | no |
| `templates/*.html` | 0 | 0 | 0 |
| `register_block_pattern` | **0** | **0** | **0** |
| `register_block_style` | **0** | **0** | **0** |
| CSS files styling `wp-block-*` | 6 | 4 | 9 |
| `align-wide` references | 41 | 23 | 31 |
| PHP files | 44 | 117 | 159 |

What the label actually denotes is **a classic PHP theme that ships CSS for core block classes and declares wide alignment**. That is a real and useful thing — it is what makes core blocks look native rather than unstyled — but it is not full site editing, it gives the user no Site Editor, and it contributes nothing to the global styles system.

So when a client says "we bought a Gutenberg theme", establish which of three things they have before planning anything:

| They have | Tell by | What you can change |
|---|---|---|
| Block theme | `templates/index.html` exists | Everything, in the Site Editor |
| Hybrid | `theme.json` plus PHP templates | Editor settings and global styles; layout stays in PHP |
| Block-styled classic | CSS targeting `wp-block-*`, no `theme.json` | PHP templates and CSS only |

The third is by far the most common on the commercial market, and it is the one where adding a `theme.json` is the highest-value change available — see *Hybrid themes* below.

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
| [`references/theme-json.md`](references/theme-json.md) | Full annotated example, settings vs styles, generated CSS variables, palette locking, fluid typography |
