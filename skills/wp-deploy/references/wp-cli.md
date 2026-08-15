# WP-CLI for deployment and diagnosis

WP-CLI is the difference between a WordPress site you can automate and one you have to click through. Everything here runs from the WordPress root, or with `--path=/var/www/site`.

## Contents

- [Safety first](#safety-first)
- [Database](#database)
- [Search-replace](#search-replace)
- [Core, themes and plugins](#core-themes-and-plugins)
- [Users](#users)
- [Content](#content)
- [Diagnosis](#diagnosis)
- [Multisite](#multisite)
- [Scripting](#scripting)

## Safety first

Two habits prevent nearly every serious WP-CLI incident.

**Confirm which site you are on before anything destructive:**

```bash
wp option get siteurl
```

**Take a rollback point immediately before, not "recently":**

```bash
wp db export rollback-$(date +%F-%H%M%S).sql
```

Useful global flags:

| Flag | Effect |
|---|---|
| `--dry-run` | Supported by `search-replace`; use it every time |
| `--path=` | Target a specific install — essential when several live on one server |
| `--allow-root` | Only in containers. On a normal server, running as root creates files the web user cannot manage. |
| `--skip-plugins` / `--skip-themes` | Bypass a fatal error that blocks WP-CLI itself |
| `--quiet` / `--format=json` | For scripting |

## Database

```bash
wp db export backup.sql --add-drop-table
wp db import backup.sql
wp db size --tables --human-readable        # find what is actually large
wp db optimize
wp db check
wp db query "SELECT COUNT(*) FROM $(wp db prefix)posts WHERE post_type='revision';"
```

`--add-drop-table` makes the dump idempotent — importing it twice gives the same result rather than failing on duplicate keys.

Clean-up that reliably reduces a bloated database:

```bash
wp post delete $(wp post list --post_type=revision --format=ids) --force
wp transient delete --expired
wp db optimize
```

## Search-replace

The command that makes WordPress migration possible. See the main skill for why SQL `REPLACE` must never be used.

```bash
wp search-replace 'https://old.com' 'https://new.com' --all-tables --dry-run
wp search-replace 'https://old.com' 'https://new.com' --all-tables --precise --report-changed-only
wp search-replace '/home/old/public_html' '/var/www/new' --all-tables --precise
```

| Flag | Why |
|---|---|
| `--all-tables` | Includes tables outside the prefix convention — builders and form plugins create them |
| `--precise` | Unserializes in PHP instead of the regex fast path. Slower, correct on nested arrays. |
| `--dry-run` | Reports per-table change counts without writing |
| `--report-changed-only` | Cuts the noise on a large site |
| `--export=out.sql` | Write the transformed dump instead of modifying the database — useful for producing a target-ready dump on the source |

Do the protocol change as a separate pass; combining it with the domain change misses `http://new.com` occurrences.

## Core, themes and plugins

```bash
wp core version --extra
wp core update && wp core update-db
wp core verify-checksums                    # detects modified core files — run this on any site you inherit

wp plugin list --update=available --format=table
wp plugin update --all --dry-run
wp plugin deactivate <slug> && wp plugin delete <slug>

wp theme list --status=active
wp theme activate mytheme-child
```

`wp core verify-checksums` is the fastest compromise check available: core files should be byte-identical to the release. Any modification is either malware or someone editing core, and both need investigating.

Before a bulk update on a live site: back up, update, then check the front page and admin. `--dry-run` on `plugin update` shows what would change without doing it.

## Users

```bash
wp user list --role=administrator --fields=ID,user_login,user_email,user_registered
wp user create editor1 e@example.com --role=editor
wp user update 5 --user_pass="$(openssl rand -base64 24)"
wp user reset-password 5
```

Listing administrators is the first thing to run on an inherited or possibly-compromised site — an unexpected admin account created recently is the classic backdoor.

Never pass a password you intend to keep as a literal on the command line; it lands in shell history.

## Content

```bash
wp post list --post_type=page --format=csv --fields=ID,post_title,post_status
wp post create --post_type=page --post_title='About' --post_status=publish
wp post meta list 42
wp option get home
wp option update blogname 'New name'
wp option list --search='mytheme_*' --format=table

wp media regenerate --only-missing      # after changing add_image_size()
wp rewrite flush
wp cache flush
```

`wp media regenerate` without `--only-missing` reprocesses every attachment, which on a large library takes hours and can exhaust memory. Start with `--only-missing`.

## Diagnosis

```bash
wp --info                                     # PHP version, config path, WP-CLI version
wp cli check-update
wp eval 'echo get_num_queries() . " queries\n";'
wp eval 'global $wpdb; echo size_format( $wpdb->get_var("SELECT SUM(LENGTH(option_value)) FROM $wpdb->options WHERE autoload IN (\"yes\",\"on\")") ) . " autoloaded\n";'
wp cron event list
wp cron event run --due-now
wp transient delete --all
```

When WP-CLI itself fatals, the offending plugin is usually the cause:

```bash
wp --skip-plugins --skip-themes plugin list
```

That gets you a working CLI on a broken site, which is often enough to deactivate the culprit.

## Multisite

```bash
wp site list --fields=blog_id,url
wp --url=https://example.com/sub option get siteurl
wp site empty --yes                     # destroys content on one site; take a backup first
```

Almost every command accepts `--url=` to target one site in the network. Without it you operate on the main site, which is rarely what you meant.

`wp search-replace` on multisite needs `--network` **and** care: each site has its own URL, so a single replacement pair is usually wrong.

## Scripting

```bash
#!/usr/bin/env bash
set -euo pipefail

SITE=/var/www/site
cd "$SITE"

# Refuse to run against the wrong environment.
EXPECTED="https://staging.example.com"
ACTUAL="$(wp option get siteurl)"
[ "$ACTUAL" = "$EXPECTED" ] || { echo "refusing: siteurl is $ACTUAL, expected $EXPECTED"; exit 1; }

wp db export "backup-$(date +%F-%H%M%S).sql" --add-drop-table
wp plugin update --all
wp core update-db
wp cache flush
```

`set -euo pipefail` and the environment guard are what turn a convenient script into a safe one. The guard has prevented more incidents than any amount of care.
