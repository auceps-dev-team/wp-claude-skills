---
name: wp-release
description: Prepare a WordPress theme or plugin for release — pre-flight checks, Theme Check and Plugin Check, PHPCS with WordPress standards, asset builds, version bumping, changelogs, readme.txt, packaging a clean ZIP, and the wordpress.org and ThemeForest submission requirements. Use this whenever shipping a version, packaging a theme or plugin for distribution, preparing a marketplace submission, setting up a build pipeline, or when the user mentions release, deploy, submit, or packaging.
---

# Releasing a WordPress theme or plugin

A release has three parts: **verify** (does it meet the standard?), **build** (are the artifacts current?), **package** (does the ZIP contain the right files?). Most failed submissions are packaging mistakes, not code quality — a stale minified file or a `node_modules` directory in the ZIP.

## Pre-flight

Run in this order; each catches a different class of problem.

```bash
# 1. Coding standards
composer require --dev wp-coding-standards/wpcs dealerdirect/phpcodesniffer-composer-installer
vendor/bin/phpcs --standard=WordPress --extensions=php --ignore=vendor,node_modules .

# 2. PHP compatibility against your declared minimum
composer require --dev phpcompatibility/phpcompatibility-wp
vendor/bin/phpcs --standard=PHPCompatibilityWP --runtime-set testVersion 7.4- .

# 3. Security — the classes phpcs cannot see
node skills/wp-security-audit/scripts/wp-scan.mjs . --min-severity high

# 4. i18n extraction, and the gap check
wp i18n make-pot . languages/mytheme.pot --domain=mytheme --exclude=node_modules,vendor
```

Then the official checkers, which encode the review rules:

- **Theme Check** plugin, or `wp plugin install theme-check --activate` then Appearance → Theme Check
- **Plugin Check** (`wp plugin install plugin-check --activate`) — now the authoritative pre-submission tool for wordpress.org plugins

`vendor/bin/phpcbf --standard=WordPress .` auto-fixes formatting, but review the diff — it reformats aggressively and occasionally changes intent in ternaries.

## Version bumping

Version lives in several places and drifting is the most common release bug:

| Artifact | Location |
|---|---|
| Theme | `style.css` header |
| Plugin | main file header **and** the version constant |
| Both | `readme.txt` `Stable tag` |
| Both | `package.json` if present |
| Both | git tag |

The most robust fix is to have exactly one source and derive the rest:

```php
define( 'MYTHEME_VERSION', wp_get_theme()->get( 'Version' ) );
```

For plugins, the header cannot be read before the plugin loads, so keep the constant and add a CI check that the two agree.

Semantic versioning, applied honestly: **major** for breaking changes (a removed hook, a renamed shortcode, a dropped PHP version), **minor** for features, **patch** for fixes. Renaming a filter is a breaking change even though nothing errors — integrations fail silently.

## readme.txt

Required for wordpress.org, and the parser is strict:

```
=== My Theme ===
Contributors: yourname
Tags: blog, portfolio, custom-menu
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.2.0
License: GPLv2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html

Short description, max 150 characters, single line.

== Description ==
...

== Changelog ==

= 1.2.0 =
* Added: dark mode style variation
* Fixed: menu not closing on Escape
* Security: nonce verification on the load-more endpoint

== Upgrade Notice ==

= 1.2.0 =
Security fix. Update recommended.
```

`Stable tag` is what wordpress.org actually serves for plugins — a mismatch with the SVN tag means users get the wrong version or none at all. `Tested up to` must reference a released WordPress version.

Validate against the official readme validator before submitting.

## Changelog

Write for the person deciding whether to update, not for git. Group by impact and lead with anything security-related:

```markdown
## 1.2.0 — 2026-08-13

### Security
- Load-more AJAX endpoint now verifies a nonce (was reachable unauthenticated).

### Breaking
- `mytheme_header_layout` filter renamed to `mytheme_layout_header`.
  The old name is deprecated and will be removed in 2.0.

### Added
- Dark mode style variation.

### Fixed
- Mobile menu not closing on Escape.
```

Never remove a hook in the same release you deprecate it. Deprecate, ship, remove one major version later:

```php
$layout = apply_filters_deprecated(
    'mytheme_header_layout',
    array( $layout ),
    '1.2.0',
    'mytheme_layout_header'
);
```

## Building assets

Every generated artifact must be regenerated, and the dual-file schemes are where releases go wrong:

```bash
npm ci                       # ci, not install — respects the lockfile
npm run build

npx rtlcss style.css style-rtl.css
npx sass assets/scss/style.scss:style.css --style=compressed --no-source-map

wp i18n make-pot . languages/mytheme.pot --domain=mytheme
wp i18n make-json languages/ --no-purge

composer install --no-dev --optimize-autoloader
```

The traps, all of which ship silently:

- A theme with `style.css` **and** `style.min.css` toggled by an option: forget the minified build and the site serves last release's code with no error.
- `rtl.css` regenerated from a stale source.
- `.pot` not regenerated, so new strings are untranslatable.
- `composer install` run **with** dev dependencies, shipping PHPUnit and PHPCS to every customer.
- Sourcemaps pointing at paths that do not exist in the package.

Add a `prerelease` script that runs all of it, so it cannot be skipped under time pressure.

## Packaging

The ZIP must contain a single top-level directory named exactly as the slug:

```
mytheme.zip
└── mytheme/
    ├── style.css
    └── ...
```

Exclude development files. What ships is what you can support:

```bash
zip -r mytheme.zip mytheme \
  -x '*/node_modules/*' \
  -x '*/.git/*' -x '*/.github/*' \
  -x '*/tests/*' -x '*/.vscode/*' -x '*/.idea/*' \
  -x '*/src/*' \
  -x '*.scss' -x '*.map' \
  -x '*/composer.json' -x '*/composer.lock' \
  -x '*/package.json' -x '*/package-lock.json' \
  -x '*/phpcs.xml*' -x '*/.editorconfig' -x '*/.eslintrc*' \
  -x '*/.DS_Store' -x '*/Thumbs.db'
```

Verify before uploading — this takes ten seconds and catches most packaging failures:

```bash
unzip -l mytheme.zip | head -30
unzip -l mytheme.zip | rg "node_modules|\.git|\.map|composer\.lock" && echo "!! development files present"
du -h mytheme.zip
```

A theme ZIP over ~10MB usually means uncompressed demo images or bundled fonts that should be subset. Marketplaces have hard limits.

Ship `.scss` sources only if customers are meant to compile. If you ship sources, ship the build config too — half a toolchain is worse than none.

## wordpress.org requirements

**Themes** — GPL-compatible licence for *everything* including bundled fonts and images, no admin/settings pages outside the Customizer, no functionality that belongs in a plugin, no hard-coded links, sanitized and escaped throughout, `screenshot.png` at 1200×900, correctly prefixed everything.

**Plugins** — unique slug, no external calls without disclosure and consent, no obfuscated code, no bundled premium upsells that phone home undisclosed, `readme.txt` with a valid `Stable tag`, no trademark misuse in the name.

Both are reviewed by humans. Read the [Theme Review](https://make.wordpress.org/themes/handbook/review/) and [Plugin Guidelines](https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/) handbooks — the rules change, and a rejection costs weeks in the queue.

## Marketplace (ThemeForest and similar)

Beyond the code, commercial marketplaces require: full documentation (HTML or PDF), a child theme in the package, demo content with **documented licences for every image** (this is a frequent rejection), a changelog, licensing files, and a support policy.

Recurring rejection reasons:

1. Functionality in the theme instead of a companion plugin.
2. Unprefixed globals.
3. Missing escaping or sanitizing.
4. Outdated bundled libraries with known CVEs — a bundled Slider Revolution or TGMPA that has not been updated ships the vulnerability to every buyer.
5. Demo images without licences.
6. Missing `Requires PHP` / `Tested up to`.

Re-bundle every third-party ZIP on every release. This is not optional maintenance — it is the most common way a commercial theme becomes an attack vector for thousands of sites.

## Release checklist

```markdown
- [ ] phpcs clean (WordPress + PHPCompatibilityWP)
- [ ] security scan: no critical, high triaged
- [ ] Theme Check / Plugin Check pass
- [ ] version bumped everywhere (header, constant, readme, package.json)
- [ ] changelog written, security items first
- [ ] assets rebuilt: css, min variants, rtl, pot, json
- [ ] composer install --no-dev
- [ ] bundled third-party libraries updated
- [ ] tested on the minimum declared PHP and WP versions
- [ ] tested update path from the previous version on a real site
- [ ] ZIP contents verified, no dev files, single top-level dir
- [ ] git tagged, tag pushed
```

The update-path test is the one people skip and the one that produces emergency patches: install the previous version, populate it with content and options, then update in place. Migration code that has never run against real data usually does not work.

## Automating

```yaml
name: Release
on:
  push:
    tags: [ 'v*' ]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '7.4' }
      - run: composer install
      - run: vendor/bin/phpcs --standard=WordPress .
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci && npm run build
      - run: node skills/wp-security-audit/scripts/wp-scan.mjs . --min-severity critical
      - run: composer install --no-dev --optimize-autoloader
      - run: |
          mkdir -p dist/mytheme
          rsync -a --exclude-from=.distignore ./ dist/mytheme/
          cd dist && zip -r ../mytheme.zip mytheme
      - uses: softprops/action-gh-release@v2
        with: { files: mytheme.zip }
```

`wp-scan.mjs` exits 1 on findings, so it gates the build. A `.distignore` file keeps the exclusion list in one place rather than duplicated between the zip command and CI.
