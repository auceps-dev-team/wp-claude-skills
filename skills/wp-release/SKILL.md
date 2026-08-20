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

A build script that runs the checks and refuses to package on failure removes the judgement call entirely. `scripts/build-example.mjs` in this skill is a working one — zero dependencies, and it gates on five things that are each a real shipped-defect class:

| Gate | Catches |
|---|---|
| PHP lint on every file | A parse error that only fires on the customer's PHP version |
| Security scan, critical = fail | The classes phpcs cannot see |
| Version agreement across header, constant and readme | Silent drift, the most common release bug |
| Referenced assets exist | A `wp_enqueue_style` pointing at a file that never shipped |
| Catalogue newer than the PHP | New strings that are untranslatable |

Two details worth copying. It writes the ZIP itself rather than shelling out, so the root directory name is guaranteed correct. And when a check has nothing to say it stays silent — a warning that fires on a package with no translatable strings teaches people to ignore warnings.

Verify before uploading — this takes ten seconds and catches most packaging failures:

```bash
unzip -l mytheme.zip | head -30
unzip -l mytheme.zip | rg "node_modules|\.git|\.map|composer\.lock" && echo "!! development files present"
du -h mytheme.zip
```

A theme ZIP over ~10MB usually means uncompressed demo images or bundled fonts that should be subset. Marketplaces have hard limits.

Ship `.scss` sources only if customers are meant to compile. If you ship sources, ship the build config too — half a toolchain is worse than none.

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

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/distribution.md`](references/distribution.md) | readme.txt, changelogs, asset builds, wordpress.org and marketplace rules, CI |
