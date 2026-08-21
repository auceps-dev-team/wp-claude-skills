---
name: wp-deploy
description: Deploy and migrate WordPress sites — local/staging/production environments, WP-CLI operations, database migration with serialized-data-safe search-replace, media sync, wp-config per environment, deployment pipelines, rollback, and the safety rules for destructive operations. Use this whenever moving a WordPress site between environments, changing domain or URL structure, setting up staging, automating a deploy, restoring a backup, or before running anything that drops tables or overwrites a database.
---

# WordPress deployment and migration

WordPress makes deployment harder than most stacks for one reason: **the database contains absolute URLs, and many of them are inside PHP-serialized strings.** A naive find-and-replace corrupts them silently — the string length prefix no longer matches, PHP fails to unserialize, and widgets, theme options and page-builder layouts vanish with no error.

Everything else follows from that, plus a second fact: in WordPress, content and configuration live in the same database. There is no clean "code deploys forward, data stays put" split, so every deployment needs an explicit decision about which direction data moves.

## When to use

- Moving a site between local, staging and production
- Changing domain, protocol (http→https) or the site's directory
- Setting up a staging environment or a deployment pipeline
- Restoring from backup, or rolling back a bad release
- Before any operation that drops tables, empties uploads, or overwrites a database

## When NOT to use

- **Building the theme or plugin being deployed** → the `wp-theme-*` / `wp-plugin-architecture` skills
- **Packaging a theme or plugin for distribution** (ZIP, wordpress.org, marketplace) → `wp-release`. That is shipping a product; this is deploying a site.
- **Server hardening, permissions and headers** → `wp-security-audit`, `references/hardening.md`
- **Redirect mapping and preserving rankings across a URL change** → `wp-seo`, which covers the SEO half of the same migration

## Required inputs

Do not start without these:

| Input | Why |
|---|---|
| Source and target URLs, exactly | Including protocol and any subdirectory. `https://x.com` and `https://www.x.com` are different replacements. |
| Which direction content moves | Production content down to staging, or staging content up to production — never assume |
| Whether the target has content that must survive | The answer changes the whole procedure |
| Table prefix on both sides | They differ more often than expected |
| Multisite? | Changes every command |
| A verified backup of the target | Not "a backup exists" — one you have confirmed restores |

If you cannot answer "what happens if this goes wrong", stop and take a backup first.

## Environments

Three environments, one codebase, per-environment configuration:

```php
// wp-config.php — environment-aware
define( 'WP_ENVIRONMENT_TYPE', getenv( 'WP_ENV' ) ?: 'production' );  // local|development|staging|production

if ( 'production' !== wp_get_environment_type() ) {
    define( 'WP_DEBUG', true );
    define( 'WP_DEBUG_LOG', true );
    define( 'WP_DEBUG_DISPLAY', false );
    define( 'DISALLOW_INDEXING', true );   // WP 5.5+ — noindex on non-production
}
```

`wp_get_environment_type()` (WP 5.5+) is the supported way to branch. Plugins read it too, so setting it correctly fixes more than your own code.

**Non-production must be `noindex` and access-restricted.** A crawlable staging copy competes with production in search results — see `wp-seo`. HTTP auth at the server is the reliable control; the "Discourage search engines" setting is not, because it is a database value that a migration will happily copy to production.

What belongs in version control: themes, plugins you author, `composer.json`, deployment config. What does not: `wp-config.php` with real credentials, `wp-content/uploads`, `vendor/` (unless you cannot run Composer on the target).

## Database migration

### Never use SQL find-and-replace

```sql
UPDATE wp_options SET option_value = REPLACE(option_value, 'old.com', 'new.com');  -- corrupts data
```

This is the single most common way to break a WordPress site. Serialized values look like `s:19:"https://old.com/img"` — the `19` is a byte count. Change the string without changing the count and PHP cannot unserialize it. The value does not error; it returns `false`, and whatever depended on it silently disappears.

Use a serialization-aware tool. WP-CLI is the standard one:

```bash
# Always dry-run first — it reports what would change, per table
wp search-replace 'https://old.com' 'https://new.com' --all-tables --dry-run

wp search-replace 'https://old.com' 'https://new.com' --all-tables --precise --report-changed-only

# Protocol change is a separate pass
wp search-replace 'http://new.com' 'https://new.com' --all-tables
```

`--all-tables` matters: `--all-tables-with-prefix` misses tables that page builders and form plugins create outside the prefix convention. `--precise` forces PHP-level unserialization rather than the faster regex path — slower, and correct on nested arrays.

Also replace **filesystem paths**, which differ between environments and appear in serialized options:

```bash
wp search-replace '/home/old/public_html' '/var/www/new' --all-tables --precise
```

### The full migration

```bash
# On the source
wp db export source.sql --add-drop-table
rsync -az wp-content/uploads/ user@target:/path/wp-content/uploads/

# On the target
wp db export rollback-$(date +%F-%H%M).sql        # take the rollback point FIRST
wp db import source.sql
wp search-replace 'https://old.com' 'https://new.com' --all-tables --precise
wp cache flush
wp rewrite flush
wp option get home; wp option get siteurl          # verify
```

`wp rewrite flush` is not optional — permalinks 404 until rewrite rules regenerate on the new host.

If the table prefix differs, change `$table_prefix` in `wp-config.php` to match the imported dump rather than renaming tables.

### Direction is a decision, not a default

| Moving | Typical rule |
|---|---|
| Production → staging | Full database and uploads copy. Safe: staging is disposable. |
| Staging → production | **Code only.** Content on production is newer and real. |
| Local → production, first launch | Full copy, once. After launch this direction becomes code-only. |

The dangerous case is pushing a staging database to a live site: every order, comment and content edit made since the staging copy was taken is destroyed. If content genuinely must move up, migrate the specific rows, not the database.

## Destructive operations

Anything that drops tables, truncates, empties uploads or overwrites a database gets the same treatment:

1. **Confirm the target.** `wp option get siteurl` before, every time. Running the right command on the wrong environment is the most common serious incident.
2. **Take a rollback point immediately before**, not "recently".
3. **Dry-run** where the tool supports it.
4. **Say what you are about to do and get explicit confirmation** when acting on someone else's site.

This applies to tooling you audit, too. Commercial demo-import plugins ship reset functions that drop every table, and at least one shipped implementation guards it with a nonce and `is_admin()` — which is a context check, not an authorization check — leaving any authenticated subscriber able to destroy the site. See `wp-security-audit`, `references/vulnerability-classes.md`. If you are deploying a site that includes such a plugin, remove it after the demo import rather than leaving it active.

## Workflow

1. Confirm inputs and **which environment you are pointed at**.
2. Take a rollback point on the target, and verify it is non-empty.
3. Move code.
4. Move database and uploads only if the direction calls for it.
5. `search-replace` with `--dry-run`, read the report, then run it.
6. Flush caches and rewrite rules.
7. Verify: front page, a permalink, an admin page, a form, and one page-builder layout — builder layouts are where serialization damage shows first.
8. Keep the rollback point until the site has been used for a day.

## Failure patterns

| Symptom | Cause |
|---|---|
| Widgets, theme options or builder layouts empty after migration | SQL `REPLACE` corrupted serialized data. Restore and redo with `search-replace`. |
| Every permalink 404s, homepage fine | Rewrite rules not flushed, or `.htaccess`/nginx config not migrated |
| Redirect loop to the old domain | `home`/`siteurl` not replaced, or a cached page. Set them with `wp option update`. |
| Mixed-content warnings | http→https pass not run over the content tables |
| Images 404 but exist on disk | Uploads path in the database still points at the old filesystem path |
| Site loads, admin white screen | Plugin fatal on the new PHP version — check `Requires PHP`, read the debug log |
| Staging appearing in search results | `DISALLOW_INDEXING` not set, or the database was copied from production with indexing on |
| "Error establishing a database connection" after deploy | `wp-config.php` overwritten by the deploy — it should be excluded |

## Output format

When reporting a migration, state what moved, what did not, and what to watch:

```markdown
## Migration: <source> → <target>
Direction: code only / full copy. Rollback point: <file>, taken <time>.

### Moved
Code, database, uploads — with what was excluded.

### Replacements applied
old → new, with the number of rows changed per table.

### Verified
Front page, permalink, admin, form, builder layout.

### Watch
Anything not verifiable now, and how long to keep the rollback point.
```

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/pipeline.md`](references/pipeline.md) | Automated deploy with rsync, zero-downtime symlink switching, schema migrations |
| [`references/wp-cli.md`](references/wp-cli.md) | The WP-CLI commands that matter for deployment, maintenance and diagnosis, with the flags that make them safe |
