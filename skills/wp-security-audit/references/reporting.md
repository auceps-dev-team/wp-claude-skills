# Writing the audit report

## Contents

- [Report format](#report-format)
- [Severity calibration](#severity-calibration)
- [Fixing what you find](#fixing-what-you-find)
- [Security theatre to push back on](#security-theatre-to-push-back-on)

## Report format

Use this structure. Severity is about **exploitability under the trust model**, not about how bad the code looks.

```markdown
# Security audit — <target> <version>

## Scope and trust model
What was scanned, what was excluded, and who can reach this code.

## Summary
| Severity | Count |
|---|---|
| Critical | n |

## Findings

### [CRITICAL] <one-line title>
**Location:** `path/to/file.php:123`
**Class:** Stored XSS / SQL injection / Missing authorization / ...

**What happens**
Two or three sentences of mechanism.

**Proof of exploitability**
The concrete path an attacker takes, with the role required. If you cannot
state this, the finding is not Critical — downgrade it.

**Fix**
```php
// before / after
```

## Non-findings
Things that look alarming but are not exploitable, with the reason. This
section is what makes the report trustworthy.
```

The "Non-findings" section matters more than it looks. An audit that reports everything the scanner said, without triage, teaches the reader to ignore the next one.

## Severity calibration

| Severity | Test |
|---|---|
| Critical | Unauthenticated user achieves code execution, SQL injection, stored XSS, or privilege escalation. |
| High | Authenticated low-privilege user (subscriber/contributor) escalates or injects. |
| Medium | Requires an editor/admin account, or is an information leak. |
| Low | Hardening gap with no direct exploit path — missing ABSPATH guard, version disclosure. |

Two rules keep reports honest: an admin-only issue is not Critical just because the impact would be large, and "requires social engineering" caps a finding at Medium.

## Fixing what you find

Apply fixes from the `wp-standards` skill, which holds the canonical patterns for escaping, sanitizing, nonces and capabilities. The three most common repairs:

```php
// 1. AJAX endpoint
function mytheme_load_more() {
    check_ajax_referer( 'mytheme_ajax', 'nonce' );
    $page = min( absint( $_POST['page'] ?? 1 ), 50 );   // bound it
    wp_send_json_success( mytheme_render( $page ) );
}

// 2. prepare() that was never really preparing
$wpdb->query( $wpdb->prepare(
    "UPDATE {$wpdb->postmeta} SET meta_value = REPLACE( meta_value, %s, %s ) WHERE meta_key = %s",
    $from, $to, '_elementor_data'
) );

// 3. Request data reaching inline JS
wp_add_inline_script(
    'mytheme',
    'var myThemeAuthor = ' . wp_json_encode( $author ) . ';',
    'before'
);
```

For the reasoning behind each, read `references/vulnerability-classes.md`. For deployment-level hardening — `wp-config.php` constants, file permissions, HTTP headers, `DISALLOW_FILE_EDIT` — read `references/hardening.md`.

## Security theatre to push back on

Themes routinely ship "security" features that cost real functionality and stop nobody:

- Removing the WP version from `<head>` and asset URLs. The version is trivially fingerprinted from asset content. Stripping `ver=` also breaks cache-busting on updates — a net loss.
- Hiding `/wp-admin` behind a renamed URL. Obscurity; scanners find it via `admin-ajax.php` and login redirects.
- Removing the REST API or `xmlrpc.php` wholesale. Breaks the block editor, the mobile app and Jetpack. Restrict specific routes instead.
- Blocking `user-enumeration` via `?author=1` while leaving the REST users endpoint open.

None of these are wrong to have, but flag them as **cosmetic** in your report rather than letting them count as the security work. Real gains come from: keeping software updated, enforcing strong authentication, least-privilege roles, and the input/authorization discipline above.
