# The pre-launch pass

The five gates measure the pages you chose. The client clicks on the others: the filled wishlist, the 404, the vendor link at the bottom of a product, the checkout terms, the account menu. Measured on a store built on a kept theme (Farmart 1.3.6, Elementor 4.4.0 free, WooCommerce 11.3.0, Dokan Lite 5.3.4), 19/11/2026: every gate was green, and a pass over **all 208 URLs** still found about thirty defects — not one of them on a page a gate covered.

So before the deployment plan is shown, and once more on production after deployment, the site is read **address by address**, then the agent reviews the security of its own changes.

## Contents

- [The inventory comes from the database](#the-inventory-comes-from-the-database)
- [HTML pass, every URL](#html-pass-every-url)
- [Render pass, one URL per template](#render-pass-one-url-per-template)
- [Lighthouse, with a session](#lighthouse-with-a-session)
- [What the pass finds](#what-the-pass-finds)
- [Security review of your own changes](#security-review-of-your-own-changes)
- [Before the export](#before-the-export)

## The inventory comes from the database

Not from the sitemap, not from memory. `scripts/audit-site.php` lists published pages, **every** product category (an empty default category is public too), every tag, every product, and the screens nobody lists:

- search with results and **without** results, a 404;
- the account endpoints (orders, addresses, account details);
- cart, checkout, compare list and wishlist **with an item in them** — empty, they hide most of their strings;
- each vendor store (Dokan);
- a few pages as a **visitor**, to see what a "coming soon" mode shows.

## HTML pass, every URL

```
php scripts/audit-site.php --wp=/path/to/wordpress --user=local_admin --out=releves/audit-site.json
```

It logs in through a session WordPress generates for the local administrator (no password; the session is destroyed at the end), so a store in "coming soon" mode is read as it will be at launch. Per URL: status and redirect, `<title>`, meta description, number of `h1`, client placeholders, demo leftovers, images without `alt`, and English UI words — in visible text **and** in what a screen reader says (`aria-label`, `placeholder`, `title`, `alt`, button values). Then every internal link and image met is requested once, action links excepted.

Read the English list by eye: brand names match the word list (`Forever Living Products`). What was real on the 19/11 run: `Email` on the share button of 121 products, `Price` / `Availability` / `Rating` / `Weight` / `N/A` in the compare table, `Product` / `Stock status` / `Copy link` / `Edit wishlist` / thirteen `Share on …` labels on the wishlist, `Type your message...` on the vendor contact form.

## Render pass, one URL per template

```
node scripts/audit-render.mjs list.json shots --cookies session.json --accent "#F59005"
php scripts/contact-sheet.php list.json shots 1366 3 600 3600
php scripts/contact-sheet.php list.json shots 390 6 300 4200
```

One representative per template — home, shop, category, empty category, tag, product, search, empty search, 404, empty and filled cart, checkout, account, compare, wishlist, every content page, vendor list, vendor dashboard, vendor store — at 1366 and 390 px, in **one** browser profile so the cart filled by the first URL is still filled at checkout.

The script measures overflow, broken images, JavaScript errors, text in the accent colour and low contrast. **Then read every sheet.** On the 19/11 run the measures found the contrast problems; the sheets found what no measure did:

- text clipped on the left **on phones only** — a theme widget's grid (`.row`, −15 px margins) inside an Elementor container with no padding: the block ran from −20 to 410 px on a 390 px screen. The page did not overflow, so the overflow measure stayed at 0;
- `Next` written vertically, one letter per line — Dokan's pagination fixes every cell at 35 px;
- white text on a banner whose photo had been replaced by a light one — the demo's colours had been kept;
- `L'aloe vera,chaque jour` on phones: a `<br class="hidden-xs">` hidden below 768 px, with no space before it;
- the phone number in the header cut in two at 1366 px, and only there.

The false positives are listed in the header of `audit-render.mjs` (visually hidden titles, slick dots, overlays, block cart skeletons, carousels in full-page captures). Check a suspected one in a real browser before reporting it — the empty cart of the capture was a full cart in Chrome.

## Lighthouse, with a session

A store in "coming soon" mode shows visitors a placeholder page. Lighthouse run without a session **audits the placeholder**: the 18/11 product report scored a page that was not the product. Pass the session as a header:

```
npx lighthouse@13.6.0 <url> --only-categories=accessibility --preset=desktop --extra-headers=headers.json
```

`headers.json` is `{"Cookie": "wordpress_logged_in_…=…"}`, built from the session file and deleted after the run. The admin bar then adds its own findings (`aria-required-children`, `listitem`, `link-name` on a plugin's menu): they exist only for administrators, say so, do not fix them.

## What the pass finds

Classes measured on the 19/11 run. Each is cheap to fix and expensive to discover after launch.

| Class | Measured | Fix |
|---|---|---|
| The agency in public URLs | Dokan's store URL is the account's `user_nicename`: `/vendor/dev-team…-agency/`, linked from "Sold by" on every product; the account's display name was its e-mail address | Change `user_nicename` and `display_name` — never the login, password or e-mail of someone else's account |
| The agency as e-mail sender | `woocommerce_email_from_address` was the agency's: order e-mails would have come from it | The client's address and name |
| Technical products in public | Dokan creates "Reverse Withdrawal Payment" and requires it to exist; catalogue-hidden, but its page is public | `noindex` and out of the sitemap, not deleted |
| Defaults left in English | Default category `Uncategorized`, tag `Best Sellers` | Rename (the default category cannot be deleted) |
| American dates on a French site | `date_format` `F j, Y`, `time_format` `g:i a` — orders, reviews, e-mails, legal pages | `j F Y`, `H:i`, an explicit `timezone_string` |
| Second-level screens untranslated | Filled wishlist and compare list, notices, vendor forms | `gettext_{domain}` tables, keyed by the exact source string read in the plugin's code |
| Dead networks | Share buttons for Google+ (closed 2019), StumbleUpon, Digg | Keep what the country uses (WhatsApp in West Africa) |
| Accent colour as text on rare screens | 404 links, checkout terms, "Add address" in the account, the compare "×", a vendor link | Same rule as the rest of the site |
| Theme greys under 4.5:1 | Category counts `#999`, sort label, inactive tabs `#888`, a white-on-light badge | The palette's text grey |
| Duplicate names across two category trees | "Immunité, Immunité" on 11 product pages | Rename one side, **keep the slug** |
| A date a plugin never wrote | Complianz printed "updated on January 1, 1970": `cmplz_publish_date` is written by its wizard, and the configuration tool had replaced the wizard | Call the plugin's own `update_cookie_policy_date()` once — and measure the page after the fix: a first, plausible cause read in the code changed nothing |

## Security review of your own changes

The client asks whether the work opened a door. Answer from measurements, in this order.

**1. The working folder.** Mockup, tools and reports usually sit inside the web root (`_maquette/`, `tools/`). A session tool served by Apache hands an administrator session to anyone who calls it — and XAMPP listens on every interface, so "anyone" is the whole local network. Two locks: a `.htaccess` with `Require all denied` in the folder, and `if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }` at the top of every tool that creates a session or writes. Check the lock **over HTTP with a harmless file** (expect 403); never test it by calling the session tool.

**2. Your theme code**, searched, not remembered:

```
grep -n '\$_\(GET\|POST\|REQUEST\|COOKIE\|SERVER\|FILES\)' functions.php inc/*.php
grep -nE '\b(eval|assert|base64_decode|shell_exec|exec|system|passthru|proc_open|unserialize|file_put_contents)\b *\(' functions.php inc/*.php
grep -nE 'wp_ajax|admin_post|register_rest_route|add_shortcode|nopriv' functions.php inc/*.php
grep -nE 'echo |printf\(' functions.php inc/*.php templates/*.php
```

Every request value only compared, never printed; every output through `esc_html`, `esc_attr`, `esc_url` or `wp_kses_post`; widget settings sanitised in `update()`. JSON-LD printed with `JSON_HEX_TAG | JSON_HEX_AMP`, so no value can close the `<script>` — `JSON_UNESCAPED_SLASHES` alone lets `</script>` through.

**3. What WordPress opens by itself**, read as a visitor with `curl`:

- `/wp-json/wp/v2/users` listed the administrator account whose **display name was its login e-mail**, and a second administrator's full name. Remove the `/wp/v2/users` routes for logged-out requests (`rest_endpoints`); the editor keeps them.
- `?author=1` and `/author/<slug>/` reveal account slugs: redirect author archives to the home page — **except Dokan stores**, which are built as author queries (`dokan-lite/includes/Rewrites.php`, `author_name`): without `dokan_is_store_page()` in the condition, every vendor store would have redirected to the home page. Found in the code before shipping, not after.
- XML-RPC: `xmlrpc_enabled` → false (login methods then answer 405), drop the `X-Pingback` header and the RSD link. Nothing on a store uses it; payment webhooks use the REST API.

**4. Accounts and configuration**: `WP_DEBUG` off; registration closed unless the store needs it; vendors approved by hand; pending plugin updates listed; the sessions your own tools opened destroyed at the end (`WP_Session_Tokens::destroy_all` for the local administrator — eleven were still alive on 19/11).

## Before the export

- Leave the working folder **out of the package** — the mockup is the client's, and the tools hold no business on production.
- Delete the local administrator account created for the build.
- Payment keys, newsletter API key, consent-banner cookie scan: on production, where they belong.
- Legal pages: a placeholder is fine on staging, never at launch. The pass counts them per template.
- On production: `DISALLOW_FILE_EDIT`, the host's real cron if `DISABLE_WP_CRON` is set, then the read-only parts of this pass again.
