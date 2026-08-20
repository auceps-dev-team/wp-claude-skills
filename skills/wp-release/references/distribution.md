# Distribution and directory requirements

## Contents

- [readme.txt](#readmetxt)
- [Changelog](#changelog)
- [Building assets](#building-assets)
- [wordpress.org requirements](#wordpressorg-requirements)
- [Marketplace (ThemeForest and similar)](#marketplace-themeforest-and-similar)
- [Automating](#automating)

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

## Building the ZIP on Windows

`zip` does not exist on Windows, and the two obvious substitutes both produce
archives WordPress rejects — silently, because the file opens fine in Explorer
and only the installer complains about a missing top-level folder.

| Method | Result |
|---|---|
| `zip -r` | not installed |
| `Compress-Archive` | writes `\` separators in older PowerShell |
| `[System.IO.Compression.ZipFile]::CreateFromDirectory` | **also writes `\`** under PowerShell 5.1 / .NET Framework |
| PHP `ZipArchive` with explicit entry names | correct |

The ZIP spec requires forward slashes in entry names. Build the entry list
yourself rather than trusting a directory-walking helper:

```php
$zip = new ZipArchive();
$zip->open( $archive, ZipArchive::CREATE | ZipArchive::OVERWRITE );
foreach ( $entries as $e ) {
    // name is always slug/relative/path/with/forward/slashes
    $zip->addFile( $e['disk'], $e['name'] );
}
$zip->close();
```

Then verify, because this failure is invisible until an install fails:

```bash
unzip -Z1 mytheme.zip | grep -c '\'          # must be 0
unzip -Z1 mytheme.zip | cut -d/ -f1 | sort -u   # must print exactly one name
```

One more Windows detail: deleting the build directory itself can fail with
`EPERM` immediately after writing archives into it, because the handle is not
released instantly. Empty the directory's contents instead of removing the
directory.
