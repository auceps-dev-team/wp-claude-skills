# wp-claude-skills

A WordPress development skill suite for [Claude Code](https://claude.com/claude-code). Sixteen skills covering theme development (classic, hybrid and block), plugin architecture, security auditing, performance, design systems, accessibility, i18n and release packaging.

Two zero-dependency Node scripts do the mechanical work: a security scanner and an architecture detector.

## Why these skills exist

They were written against three real commercial WordPress themes representing three generations of architecture — a Customizer-driven theme with a PHP CSS pipeline, a theme with a home-made options framework and a swappable skins layer, and a 38-class OOP framework with Kirki and a 54-element WPBakery library. The patterns, the failure modes and the scanner rules all come from that codebase rather than from documentation.

The measurements that shaped the security skill, across ~717 PHP files:

| Signal | Count |
|---|---|
| `esc_html__` / `esc_attr` / `wp_kses` | 5691 / 2404 / 745 |
| `add_action( 'wp_ajax_*' )` | 34 |
| `check_ajax_referer` | **0** |
| `wp_verify_nonce` | 6 |
| Raw superglobal reads | ~330 |
| `sanitize_text_field` | 18 |

Output escaping is thorough; input validation and authorization are close to absent. The scanner targets that gap specifically, because `phpcs --standard=WordPress` does not see it.

## Install

**As a plugin** (recommended — all skills at once):

```bash
git clone https://github.com/<you>/wp-claude-skills.git
```

Then add the directory as a plugin source in Claude Code, or copy the skills directly:

**Globally**, available in every project:

```bash
cp -r wp-claude-skills/skills/* ~/.claude/skills/
```

**Per project**:

```bash
cp -r wp-claude-skills/skills/* /path/to/project/.claude/skills/
```

Skills trigger automatically from what you ask. You can also invoke one by name: `/wp-security-audit`.

## The skills

### Foundation

| Skill | Covers |
|---|---|
| **wp-standards** | Escaping, sanitizing, nonces and capabilities, prefixing, i18n, hooks, PHP compatibility. Every other skill defers to this one. |
| **wp-project-analyze** | Fingerprint an unfamiliar codebase before touching it: architecture generation, naming convention, options system, page builder, build chain, what gets overwritten on compile. |

### Themes

| Skill | Covers |
|---|---|
| **wp-theme-classic** | Template hierarchy, the loop, template parts, hooks, enqueueing, navigation, widget areas, conditional tags. |
| **wp-theme-block-fse** | theme.json v3, HTML block templates, patterns, style variations, hybrid themes, editor parity. |
| **wp-theme-multipurpose** | Variant explosion, skins, front-page sections, TGMPA, demo importers, builder element libraries, marketplace submission. |
| **wp-theme-options** | Customizer API, sanitize callbacks, live preview, the options→CSS pipeline, per-section override layers, Kirki. |
| **wp-child-theme** | Correct enqueueing, what overrides and what does not, pluggable functions, and when a child theme is the wrong tool. |

### Plugins

| Skill | Covers |
|---|---|
| **wp-plugin-architecture** | Lifecycle hooks, PSR-4 autoloading, CPTs and taxonomies, Settings API, metaboxes, REST, cron, custom tables and migrations. |
| **wp-blocks-gutenberg** | block.json, static vs dynamic blocks, InnerBlocks, variations vs styles vs new blocks, block bindings, the Interactivity API. |
| **wp-woocommerce** | Hook-first customization, template overrides, product CRUD, classic vs block checkout, HPOS, store performance. |

### Quality

| Skill | Covers |
|---|---|
| **wp-security-audit** | Vulnerability classes with real examples, an audit workflow, a report format, and a scanner. |
| **wp-performance** | Finding the actual bottleneck, conditional assets, N+1 queries, autoloaded options, caching layers, Core Web Vitals. |
| **wp-accessibility** | WCAG 2.2, semantic templates, keyboard navigation, forms, focus management, `accessibility-ready`, structured data. |

### Design and delivery

| Skill | Covers |
|---|---|
| **wp-design-system** | One source of truth for design tokens, palettes with contrast constraints, fluid typography, spacing scales, dark mode, editor parity. |
| **wp-i18n-rtl** | Text domains, translation functions, POT and JSON generation, WPML/Polylang config, logical CSS properties and RTL generation. |
| **wp-release** | Pre-flight checks, version bumping, readme.txt, asset builds, ZIP packaging, wordpress.org and marketplace requirements. |

## Scripts

Both are plain Node (18+) with no dependencies.

### Security scanner

```bash
node skills/wp-security-audit/scripts/wp-scan.mjs <path> [--format text|json|md] [--min-severity critical]
```

Detects unguarded AJAX endpoints, `$wpdb->prepare()` calls with no placeholders, unprepared queries, reflected and stored XSS (including one-hop taint tracking through a variable), REST routes without `permission_callback`, unguarded save handlers, unsafe uploads, dangerous functions and missing ABSPATH guards.

Bundled third-party libraries (TGMPA, Kirki, Redux, CMB2) are skipped — findings there are not actionable and bury the real ones. Exit code 1 on findings, so it gates CI.

On the three reference themes it reports 7, 2 and 1 criticals across 356, 83 and 278 files — small enough to triage by hand, which is the design goal.

### Architecture detector

```bash
node skills/wp-project-analyze/scripts/wp-detect.mjs <path> [--format text|json|md]
```

Reports kind, architecture generation, header metadata, naming convention (functions, classes **and** constants — OOP themes prefix classes, not functions), options system, page builders, build chain with entry points, i18n state, and every registration.

## Requirements

- Node 18+ for the scripts
- Optional but recommended: `composer` for PHPCS, `wp` (WP-CLI) for i18n and diagnostics, `rg` (ripgrep) for the manual reconnaissance commands

The skills degrade gracefully without them — the guidance stands on its own.

## Contributing

Rules of the house: every claim should be checkable against real code; scanner rules need a fixture that proves they fire; prefer explaining *why* over prescribing rules, because a reader who understands the reason can handle the case you did not anticipate.

## Licence

MIT for the skills. The WordPress code patterns they describe are GPL-compatible by nature.
