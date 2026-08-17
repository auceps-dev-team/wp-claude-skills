# WordPress hardening reference

Deployment-level measures, separate from code-level vulnerabilities. Useful when the audit scope includes the installation, not only the theme.

## wp-config.php

```php
// Block the built-in theme/plugin file editors. A compromised admin session
// otherwise means immediate code execution.
define( 'DISALLOW_FILE_EDIT', true );

// Block plugin/theme installs and updates from the dashboard. Only for sites
// deployed via git/CI — it also blocks security updates, so do not set it on
// a site nobody maintains.
define( 'DISALLOW_FILE_MODS', true );

// Force SSL for the admin session.
define( 'FORCE_SSL_ADMIN', true );

// Debug settings for production: log, never display.
define( 'WP_DEBUG', false );
define( 'WP_DEBUG_LOG', '/var/log/wp/debug.log' );   // outside the web root
define( 'WP_DEBUG_DISPLAY', false );
@ini_set( 'display_errors', 0 );

// Limit post revisions and set a sane autosave interval.
define( 'WP_POST_REVISIONS', 10 );
define( 'AUTOSAVE_INTERVAL', 120 );

// Automatic background updates for minor releases.
define( 'WP_AUTO_UPDATE_CORE', 'minor' );
```

Regenerate the eight salt constants from `https://api.wordpress.org/secret-key/1.1/salt/` — rotating them invalidates all sessions, which is the correct response to a suspected compromise.

`wp-config.php` should be `0400` or `0440` and, where the host layout allows, moved one directory above the web root (WordPress checks the parent directory automatically).

## File permissions

| Target | Mode |
|---|---|
| Directories | `755` |
| Files | `644` |
| `wp-config.php` | `440` or `400` |
| `wp-content/uploads` | `755`, owned by the web user |

Nothing should be `777`. If a plugin demands it, that is a finding. Ownership matters more than mode: files owned by the web server user are writable by any compromised PHP process, which is why `DISALLOW_FILE_MODS` plus deploy-user ownership is the stronger setup.

## Block PHP execution in uploads

The single highest-value server rule. An uploaded `.php` file is inert if the server refuses to execute anything in `uploads/`.

**nginx**
```nginx
location ~* /wp-content/uploads/.*\.(php|phtml|php[0-9]|phar)$ {
    deny all;
}
```

**Apache** — `wp-content/uploads/.htaccess`
```apache
<FilesMatch "\.(?i:php|phtml|php[0-9]|phar)$">
    Require all denied
</FilesMatch>
```

Also deny direct access to `wp-config.php`, `readme.html`, `license.txt`, `xmlrpc.php` (if unused) and `.git`.

## Security headers

```nginx
add_header X-Content-Type-Options    "nosniff"           always;
add_header X-Frame-Options           "SAMEORIGIN"        always;
add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Permissions-Policy        "geolocation=(), microphone=(), camera=()" always;
```

Content-Security-Policy is worth having but hard to retrofit: the block editor, most page builders and many plugins use inline scripts and styles. Deploy it in `Content-Security-Policy-Report-Only` first and read the reports for a few weeks before enforcing. A CSP that forces `'unsafe-inline'` provides little XSS protection — be honest about that in a report rather than counting it as mitigation.

## Authentication

- Enforce 2FA for every account with `edit_posts` or above.
- Rate-limit `wp-login.php` and `xmlrpc.php` at the edge (fail2ban, Cloudflare, or a plugin).
- Disable XML-RPC only if nothing uses it — the mobile app and Jetpack do. Blocking just the `system.multicall` method removes the amplification vector while keeping the API.
- Application Passwords (core since 5.6) are per-application and revocable; prefer them to sharing a real password with an integration.

## Least privilege

Default roles are coarse. In particular, `Editor` and above hold `unfiltered_html` on single-site installs, which means they can inject scripts through post content — this is by design, not a vulnerability, but it means "an editor could do X" is rarely a finding worth escalating.

Audit custom roles for accidental grants:

```php
// List every role holding a sensitive capability
foreach ( wp_roles()->roles as $slug => $role ) {
    foreach ( array( 'manage_options', 'edit_users', 'activate_plugins', 'unfiltered_html', 'edit_files' ) as $cap ) {
        if ( ! empty( $role['capabilities'][ $cap ] ) ) {
            printf( "%s => %s\n", $slug, $cap );
        }
    }
}
```

## Database

- Change the `wp_` table prefix on new installs. This is mild obscurity — it defeats some automated injection payloads that hard-code table names, nothing more. Do not renumber an existing site for it.
- Use a dedicated DB user with only `SELECT, INSERT, UPDATE, DELETE` on the site's schema. `DROP`, `ALTER` and `CREATE` are needed only during updates — grant them temporarily.
- Back up and test the restore. An untested backup is not a backup.

## Where a firewall has to run

A security plugin that loads as a plugin cannot protect what loads before it. By the time `wp-content/plugins/` is read, WordPress core has bootstrapped, `wp-config.php` has run, and any plugin earlier in the load order has already executed. A request that exploits core or an earlier plugin is over before the firewall sees it.

Wordfence exposes this as two protection levels, and the difference is a single PHP setting:

```apache
# .htaccess or .user.ini — runs before WordPress, before everything
php_value auto_prepend_file "/path/to/wp-content/plugins/wordfence/waf/bootstrap.php"
```

With `auto_prepend_file` set, the firewall runs first and its `WFWAF_AUTO_PREPEND` constant is true. Without it, the same bootstrap is pulled in from the plugin's main file (`wordfence.php:136`) and only covers what loads afterwards. A `WFWAF_RUN_COMPLETE` guard stops it executing twice when both paths fire.

Two things follow. When auditing a site that has a security plugin, **check which mode it is in** — the dashboard usually says "extended protection" versus "basic", and most installs never complete the extended step. And when evaluating any WAF plugin, this is the first question to ask; a firewall without a pre-WordPress hook is an application-level filter, not a firewall.

The same mechanism is worth knowing for diagnosis: an `auto_prepend_file` left behind by an uninstalled security plugin produces a fatal on every request, and the path is in `.htaccess` or `.user.ini` rather than anywhere in WordPress.

## Monitoring

- File integrity monitoring on `wp-admin/`, `wp-includes/` and theme directories — core files should never change between updates.
- Log and alert on new administrator creation, plugin activation, and theme file edits.
- `wp core verify-checksums` (WP-CLI) detects modified core files in one command.

## Supply chain

Most real compromises arrive through an outdated plugin, not through the theme's own code.

- Track every plugin's last-update date and active install count. Abandoned plugins are the top risk.
- Never install nulled themes or plugins. They are the most reliable malware delivery channel in the ecosystem; if the audit target *is* a nulled package, that is the finding and everything else is secondary.
- Check bundled libraries inside the theme (`vendor/`, `framework/`, `includes/`) against known-vulnerable versions — themes ship copies of TGMPA, Kirki and image resizers that never get updated. TimThumb is the historical example; `aq_resizer` and old TGMPA releases have both had advisories.
- Subscribe to the WPScan or Patchstack feed for the plugins you depend on.
