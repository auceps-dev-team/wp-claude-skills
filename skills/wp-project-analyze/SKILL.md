---
name: wp-project-analyze
description: Fingerprint an unfamiliar WordPress theme or plugin before modifying it — detect classic vs hybrid vs block architecture, the naming convention, where options live, which page builder it targets, the build chain, and what will be overwritten on the next compile. Includes a detector script. Use this whenever you open a WordPress codebase you did not write, whenever the user asks to customize, extend, debug or take over an existing theme or plugin, and before making the first edit to any inherited WordPress project.
---

# Analyze a WordPress project

## Why this comes first

WordPress has no single architecture. Three commercial themes from the same era can share nothing but the template hierarchy:

- one keeps options in the core Customizer and generates CSS from PHP files per zone
- one runs a home-made options framework with per-section overrides and a swappable "skins" layer
- one is 38 singleton classes with Kirki, and ships 54 custom page-builder elements

Editing any of them the way you would edit the others produces changes that get silently overwritten, options that never persist, or CSS that regenerates on the next save. So: identify the architecture, *then* work.

The single most expensive mistake is editing a compiled file. A theme with 164 `.scss` sources and matching `.css` output looks like it has editable CSS. It does not.

## Run the detector

```bash
node skills/wp-project-analyze/scripts/wp-detect.mjs <path-to-theme-or-plugin>
```

`--format json` for machine-readable output, `--format md` for a summary table.

It reports: kind (theme / child theme / plugin), architecture generation, header metadata, naming convention (functions, classes and constants — OOP themes prefix classes, not functions), options system, page builders, build chain with entry points, i18n state, and every registration (post types, taxonomies, menus, shortcodes, image sizes, widgets, AJAX actions, REST routes).

Read its output as a map, not a verdict. It tells you where to look; the next section is what to look *at*.

## The seven questions

### 1. Which generation?

| Signals | Generation | What it means for you |
|---|---|---|
| `templates/*.html` + `theme.json` | Block (FSE) | Layout lives in the Site Editor and the database. Editing PHP templates does nothing. Changes go in `templates/*.html`, `parts/*.html`, `theme.json` and patterns. |
| `theme.json` + `single.php`/`archive.php` | Hybrid | `theme.json` controls editor settings and global styles; layout comes from PHP. A change may need to happen in **both**. |
| PHP templates, no `theme.json` | Classic | Everything is PHP. Editor settings come from `add_theme_support()`. |

Hybrid is the most common shape in commercial themes and the easiest to get wrong, because a colour defined in `theme.json` and a colour defined in the theme's own CSS variables are two different systems that must agree.

### 2. What is the naming convention?

The detector ranks prefixes by kind. Procedural themes prefix functions (`swm_`, `stratego_`); OOP themes prefix classes and constants (`Insight_`, `INSIGHT_`) and may have almost no prefixed global functions. **Match whatever is there.** A `mytheme_` function dropped into a codebase of `Insight_*` classes is immediately foreign, and in a child theme it will not override anything.

### 3. Where do options actually live?

This determines whether your change persists. Look for, in order:

- A **custom accessor** — `swm_get_option()`, `stratego_get_theme_option()`. If the detector reports one used 400+ times, read its definition before anything else. These wrappers layer defaults, caching, and sometimes per-section overrides on top of `get_theme_mod()`. Calling `get_theme_mod()` directly around them bypasses the default and returns empty.
- **Kirki** — fields declared as arrays, often with `output` rules that generate CSS automatically. Adding a control means adding an array, not writing CSS.
- **Redux / CMB2 / ACF** — options in a single serialized row; changing the field key orphans the stored value.
- **Core Customizer / Settings API** — the straightforward case.

Then find the **override layer**, if any. Stratego resolves options on `wp_loaded` priority 1 so that blog, shop and portfolio sections can each redefine a global value. In a theme like that, "the option" has no single value — it depends on context, and reading it before `wp_loaded` gives you the unoverridden one.

### 4. Which page builder owns the layout?

If the theme ships 54 WPBakery elements or an Elementor widget set, the builder — not the template hierarchy — is where users actually construct pages. Two consequences: the PHP templates you are reading may render almost nothing, and adding a feature usually means adding a builder element, not a template part.

Check `vc-extend/`, `elementor/`, `widgets/`, or `blocks/` before assuming a change belongs in `single.php`.

### 5. What gets overwritten on build?

Cross-reference the detector's build-chain section against what you are about to edit:

- `.scss` present → **never edit the matching `.css`**. Find the compile command (`package.json` scripts, `gulpfile.js`, or the theme docs).
- `.css.map` present → confirms compiled output even where the `.scss` sits elsewhere.
- `*.min.css` / `*.min.js` shipped next to sources → the theme picks between them at runtime. Grep the enqueue for the toggle, and regenerate **both** variants or the minified path silently keeps the old code:
  ```bash
  rg -n "min\.(css|js)|get_option\(\s*'\w*minif" --glob '*.php'
  ```
- `rtl.css` present → generated from the LTR stylesheet. Regenerate it rather than hand-editing, or the two drift.

### 6. Is there a child theme, and does it work?

If a child theme exists, all customization belongs there. Check its `functions.php` enqueues the parent stylesheet correctly and check whether the parent's functions are wrapped in `if ( ! function_exists() )` — unwrapped functions cannot be overridden, which changes your whole approach. See the `wp-child-theme` skill.

### 7. What is the update path?

Ask before writing anything: **will this theme be updated?** If yes, every parent-theme edit is temporary and the work belongs in a child theme or a site-specific plugin. Commercial themes with a bundled updater (`envato-market`, `theme-updates-allowed`, a `skin-upgrade.json`) will overwrite your changes on the next release.

## Manual reconnaissance

The commands worth running by hand after the detector:

```bash
# Bootstrap: what loads, in what order
sed -n '1,120p' functions.php

# Where the code actually is
find . -name '*.php' -not -path '*/node_modules/*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -20

# Filters and actions the theme exposes — its real extension API
rg -n "apply_filters\(\s*['\"]" --glob '*.php' -o | head -40
rg -n "do_action\(\s*['\"]"    --glob '*.php' -o | head -40

# Template parts, so you know the granularity
rg -n "get_template_part\(" --glob '*.php' -o | sort -u | head -30

# Anything reading request data — the audit shortlist
rg -c "\\\$_(GET|POST|REQUEST|COOKIE)" --glob '*.php' | sort -t: -k2 -rn | head -15
```

The `apply_filters` list matters most. A theme's own filters are its supported extension points; using them survives updates, while editing the function they wrap does not.

## Write it down

End the analysis by writing a `CLAUDE.md` at the project root so the next session starts informed. Keep it factual and short — this is a map, not documentation:

```markdown
# <Theme name> <version>

Architecture: hybrid (theme.json + PHP templates) · Prefix: `stratego_` · PHP 7.0+

## Do not edit
- `**/*.css` — compiled from `.scss`. Build: `npm run build`
- `rtl.css` — generated
- Anything in `skins/` unless changing the skin itself

## Options
`stratego_get_theme_option( $key )` — do not call `get_theme_mod()` directly.
Per-section overrides resolve on `wp_loaded` priority 1, so values read earlier
are the unoverridden ones.

## Layout
Pages are built with Elementor. `single.php` renders very little.

## Extension points
`stratego_filter_content_width`, `stratego_filter_register_nav_menus`, …

## Customization goes in
`stratego-child/` — the parent ships an updater and will be overwritten.
```

Then pick the skill that matches what you found: `wp-theme-classic`, `wp-theme-block-fse`, `wp-theme-multipurpose`, `wp-theme-options`, `wp-child-theme` or `wp-plugin-architecture`. Run `wp-security-audit` on anything you inherited from a third party before you trust it.
