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

## Scope the audit to the package, not the theme

The theme directory is rarely where the risk is. Commercial themes ship their functionality in a companion plugin and bundle third-party plugins as ZIPs under `plugins/` or `inc/plugins/`, and those carry most of the exposure. Measured across the same three packages:

| Component | Files | Critical | High |
|---|---|---|---|
| Bizix theme | 83 | 2 | — |
| ↳ its companion, Gyan Elements | 82 | 1 | 20 |
| Moody theme | 356 | 7 | — |
| ↳ its companion, Insight Core | 276 | **17** | 14 |
| Slider Revolution 6.7.29 | 146 | 11 | 66 |
| WPBakery 8.2 | 583 | 1 | 195 |

The companion plugin is consistently worse than the theme it ships with, and it is the component nobody audits — it arrives as a ZIP, installs itself through TGMPA, and updates only when the theme author publishes a new theme release.

So begin by unpacking everything:

```bash
find . -name '*.zip' -exec unzip -qo {} -d ./_audit/ \;
node .../wp-scan.mjs ./_audit/<plugin> --min-severity high
```

Two things to check on every bundled plugin:

- **Vendored libraries inside the plugin.** Insight Core ships a full copy of Kirki (129 classes) *and* CMB2 (67 classes) inside itself. Those copies never receive upstream security updates, and they are invisible to any dependency scanner because there is no manifest.
- **The version actually inside the ZIP**, not the version the theme declares in its TGMPA registration. They diverge, and the declared version is what audits usually cite by mistake.

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

## Reference files

The depth lives alongside this file. Read the one that matches the task rather than all of them:

| File | Covers |
|---|---|
| [`references/vulnerability-classes.md`](references/vulnerability-classes.md) | Eleven classes with real shipped examples, why each works, and the fix |
| [`references/hardening.md`](references/hardening.md) | wp-config constants, file permissions, server rules, headers, supply chain |
| [`references/reporting.md`](references/reporting.md) | Report template, severity calibration, the three most common fixes, security theatre to flag as cosmetic |
