---
name: wp-security-audit
description: Audit WordPress themes and plugins for security vulnerabilities — unguarded AJAX endpoints, missing nonces and capability checks, SQL injection, XSS, unsafe file uploads, and open REST routes. Includes a zero-dependency scanner script. Use this whenever the user asks to review, audit, harden, or check the security of WordPress code, whenever they are about to ship or submit a theme or plugin, whenever they inherit a third-party or nulled theme, and whenever you are reviewing PHP that handles form submissions, AJAX, file uploads, or database queries.
---

# WordPress Security Audit

## Why the usual review misses things

Commercial WordPress themes are usually *good* at escaping output — you will find thousands of `esc_html__()` calls — and *bad* at everything else. Escaping is visible in templates and gets caught by `phpcs`. Missing nonces, missing capability checks and fake `prepare()` calls live in PHP files nobody reads, and no linter flags them.

A measured example from three commercial themes (Bizix 2.2.3, Stratego 1.4.0, TM Moody 2.6.1), ~717 PHP files:

| Signal | Count |
|---|---|
| `esc_html__` / `esc_attr` / `wp_kses` | 5691 / 2404 / 745 |
| `add_action( 'wp_ajax_*' )` | 34 |
| `check_ajax_referer` | **0** |
| `wp_verify_nonce` | 6 |
| Raw superglobal reads | ~330 |
| `sanitize_text_field` | 18 |

So: **assume output escaping is fine and go hunting for the authorization and input layers.** That is where the real findings are.

## Run the scanner first

```bash
node skills/wp-security-audit/scripts/wp-scan.mjs <path-to-theme-or-plugin>
```

Options: `--format text|json|md`, `--min-severity low|medium|high|critical`. Exit code 1 means findings exist, so it drops into CI directly.

Start at `--min-severity critical` to get the short list, then widen. On a 356-file theme this typically surfaces under ten criticals — small enough to triage by hand, which is the point. The scanner intentionally skips bundled third-party libraries (TGMPA, Kirki, Redux, CMB2), because findings there are not actionable by the theme author and drown the real ones.

Then **read each finding in context before reporting it.** The scanner does one-hop taint tracking and brace-matched body extraction, not real dataflow analysis. It will occasionally flag a `$wpdb` call whose input is a hard-coded constant. Your judgment is what turns its output into an audit.

## What the scanner cannot see

Run these checks yourself; they need reasoning the regexes cannot do.

**Capability semantics.** The scanner sees *a* `current_user_can()` call and stops asking. You need to check it is the *right* capability, and that meta capabilities carry the object ID:

```php
current_user_can( 'edit_posts' )              // any contributor passes
current_user_can( 'edit_post', $post_id )     // this user, this post
current_user_can( 'administrator' )           // a role, not a capability — breaks with custom roles
```

**Option and meta values as an attack surface.** `get_option()` output printed unescaped is only exploitable if a lower-privileged user can write that option. Trace backwards: which handler writes it, and who can reach that handler? A theme option written only by an administrator through a nonce-guarded form is low risk. The same option written by an unguarded AJAX endpoint is a stored XSS delivering to every page view.

**Business logic in AJAX endpoints.** A `nopriv` endpoint with a valid nonce is still public — nonces are not secret, and any visitor's page contains one. Ask what the endpoint *does*: if it can be called 10,000 times to run an expensive `WP_Query`, that is a denial-of-service lever regardless of the nonce.

**Redirects and SSRF.** `wp_redirect( $_GET['return'] )` is an open redirect; use `wp_safe_redirect()`, which restricts to the site host. Any `wp_remote_get()` whose URL comes from user input needs an allowlist.

**Deserialization sources.** `unserialize( get_post_meta( ... ) )` is object injection *if* a lower-privileged user can write that meta. `maybe_unserialize()` is barely better — it still deserializes. Prefer JSON for anything crossing a trust boundary.

## Audit workflow

1. **Establish the trust model.** Who can reach this code — anonymous visitor, subscriber, editor, admin? Every finding's severity depends on the answer. Write it down before you look at code.
2. **Run the scanner** at `--min-severity critical`, then `high`.
3. **Enumerate every entry point** — this is the part that finds what the scanner misses:
   ```bash
   rg -n "add_action\(\s*['\"]wp_ajax" --glob '*.php'
   rg -n "register_rest_route" --glob '*.php'
   rg -n "admin_post_|admin_post_nopriv_" --glob '*.php'
   rg -n "\\\$_(GET|POST|REQUEST|COOKIE|FILES)" --glob '*.php' -c | sort -t: -k2 -rn | head -20
   ```
   The last command ranks files by superglobal density — a fast way to find the files worth reading.
4. **For each entry point, answer four questions:** Can an anonymous user reach it? Is there a nonce? Is there a capability check appropriate to the action? Is every input sanitized to its expected shape?
5. **Follow the writes.** For each `update_option` / `update_post_meta` / `update_user_meta`, find who can trigger it. Then find where that value is read and printed.
6. **Check the packaging** — see `references/hardening.md` for file permissions, version disclosure, debug constants and directory listing.

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
