# Pitfalls

Failures met on real builds, with the exact symptom, the cause and the fix. The first fourteen come from the showcase builds the method was written on, the store section from the store build recorded in `store.md`, and the Elementor section from the services build recorded in `elementor.md` (November 2026).

## Contents

- [Design failures no gate can see](#design-failures-no-gate-can-see)
- [Theme and conversion](#theme-and-conversion)
- [Workspace and tooling](#workspace-and-tooling)
- [Caches and testing](#caches-and-testing)
- [Store build](#store-build)
- [Elementor build](#elementor-build)
- [Remote access](#remote-access)
- [Preconfigured site, third-party theme](#preconfigured-site-third-party-theme)
- [Pre-launch pass](#pre-launch-pass)
- [Local infrastructure](#local-infrastructure)

## Design failures no gate can see

They are twins: the same design advice produces one when ignored and the other when applied literally in the presence of a reference.

### "It has nothing to do with my reference"

**Symptom.** The client, who sent an image, recognises nothing. Not "it's ugly" — "it's unrelated". Section order survived, often the dominant colour too; nothing else did.

**Cause.** The design requirements were read as instructions to the page while a reference existed. Each one pushes the same way — add a dominant element, a strong colour, depth, a display face — and when the reference is calm, dense, centred and accent-free, advice and reference contradict point by point. The text wins without the contradiction ever being stated. An earlier version made it worse by demanding "two or three deliberate deviations".

**Fix.** Reopen the reference and the screenshot in the same message and go through the seven invariants (`register.md`). Realign the surface; ask the client about anything that cannot be realigned; pass the register gate before sending again. This failure comes from taste, not oversight, and returns on every project looking like professional judgement.

### Flat mockup, approved without enthusiasm

**Symptom.** Clean, responsive, coherent — and no reaction. The client says "fine". All five gates pass.

**Cause.** The design was drawn with phase 4 constraints already on: overlap, overflow, central object and colour field each dropped "because of the blocks". No single renunciation is visible; their sum is a page with no intention.

**Diagnosis.** Can you name in one word what carries the page? Do two neighbouring sections share exactly the same template? Does the announced concept read without explanation?

**Fix.** Redo the composition, do not retouch it — the defect is in the structure of the decisions. Do not cure it by leaving the register: if the reference itself is calm and uniform, the page must be too.

## Theme and conversion

### White page after writing a theme option

"There has been a critical error on this website", nothing useful in the log. A typed option received an array where the theme expected a string (lived: `strtolower(): Argument #1 must be of type string, array given`). Reproduce the render in PHP to get file and line: `ob_start(); try { wp_head(); } catch (\Throwable $e) { return get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine(); }`. Read the default before writing and respect its type; retest in a fresh request, since the theme's static cache keeps the old value. Better: no third-party theme under a custom design (rule 8).

### All images broken after deployment

Alt text everywhere; URLs end without an extension. The pattern generator wrote `get_theme_file_uri('assets/img/name')` instead of `'assets/img/name.jpg'`. Fix, regenerate, and resend only the patterns archive.

### Home page impossible to edit

No "Home" in the page list; content only in the site editor. `front-page.html` calls `wp:pattern` directly, so content belongs to the template. Create a real page, reduce `front-page.html` to header + `post-content` + footer, set `show_on_front = page`. Rule 4 — a full rework when discovered late.

### Components unstyled after conversion

Grids stack, cards lose padding. The DOM changed (`figure.wp-block-image`, `div.wp-block-group`), so mockup selectors no longer match. Put the component classes on the blocks with `className` (`block-conversion.md`).

### Vertical rhythm disappears after conversion

Nothing looks broken, but the page is ~300 px shorter than the mockup, headings stick to paragraphs, a deliberately offset card is back in line. Only gate 4 shows it. Cause: `.wp-block-group > * { margin-block: 0 }` at (0,1,0) overriding every component margin — fourteen at once on one build. Fix: `blockGap: "0px"` in `theme.json` plus a reset at zero specificity with `:where()`.

### Mobile navigation opens white on white

The block prints its CSS after `style.css`, so at equal specificity it wins. Qualify the selector (`.wp-block-navigation.my-nav …`) and force `background-color` with `!important`.

### Collapsed columns and vertical-text buttons in the editor

Perfect site, broken canvas: Gutenberg forces `position: relative` on every block. Add `assets/editor.css` through `add_editor_style()` restoring the `absolute` layers; gate 5 checks it.

## Workspace and tooling

### The dev server refuses to start

`EPERM: operation not permitted, uv_cwd` (Node) or `PermissionError` (Python): the process's *current directory* is TCC-protected. Launch from `/tmp` with `ROOT` as an absolute path.

### "Why is my folder empty?"

The project was created outside the working folder "as a TCC precaution" without testing that the protection applied, and without saying so. Test access in phase 0; leave the folder only on a real failure. A precaution applied without checking breaks nothing, so nothing flags it — until the user loses trust.

### A layout iteration costs four minutes

Compose, queue, serialise, purge, reload. The design is being pushed into `post_content` instead of written in files. That is the whole point of the method: the block queue carries content, never layout.

### A spliced section vanished

A script replacing a section of a file with content read from another file: the source path was wrong, `file_get_contents()` returned `false` with a warning, the concatenation produced an empty string, and the section was deleted. Check the source exists and is non-empty before writing; diff the result.

## Caches and testing

### A CSS fix "does not take"

`curl` proves the file is fixed; the browser still shows the old render. Three caches stack: page cache, browser (`max-age=604800` from one host), and the theme-header cache that freezes `?ver=`. Bump `Version:`, purge, check byte for byte with `curl`, reload with `?fresh=<n>`.

### 404 on the whole site during tests

The cache-buster was a WordPress query var: `?m=1` asks for the archive of month "1". Same for `?p=`, `?s=`, `?cat=`, `?tag=`. Use `?fresh=<n>`.

### Black screenshots or wrong measurements

`scroll-behavior: smooth` turns every programmatic `scrollTo()` into an animation. Force `scrollBehavior = 'auto'` and `behavior: 'instant'`, then wait for images to decode.

### Horizontal scroll on mobile

The page scrolls sideways at 390 px; usually a carousel track wider than the viewport. Give each track `position: relative`, clip the site wrapper with `overflow-x: clip` (not `hidden`, which creates a scroll container and breaks sticky columns), and measure `scrollWidth - innerWidth` on every page.

## Store build

### The shop is empty for visitors

The admin sees products; a logged-out visitor sees "coming soon". WooCommerce set `woocommerce_coming_soon` back to `yes` after activation. Set it to `no` in the install tool and test logged out.

### The colour filter renders nothing

The heading shows, the swatches do not. The serialised block omitted `attributeId` because it equalled the editor's client-side default; the server's default is `0`, and the block renders nothing for `0`. Write the attribute explicitly, from a PHP pattern (`block-conversion.md`).

### A new pattern is invisible

The template references `my-theme/filters`, the page renders without it, the file is there. WordPress caches the list of pattern files. `wp_get_theme()->delete_pattern_cache()`, then a fresh request.

### The form sits under the first column

A two-column contact section shows the form below the details. The Shortcode block's `wpautop()` wrapped the form in `<p>`, and the browser left two empty paragraphs as grid items. Run the raw shortcode (`block-conversion.md`, "Forms").

### A plugin is "active" but half-installed

MailPoet active, no list, no form, three settings. Its activation hit MySQL's 1 MB `max_allowed_packet` inserting templates and stopped; only a database error in the CLI output said so. Raise the packet size, deactivate, reactivate, and count what the plugin should have created.

### The order is blocked on the postcode

"Please enter a valid postcode" for a country with no postcodes. Hide the field for that country through `woocommerce_get_country_locale` (`store.md`).

### Every page takes ten seconds locally

Static files are instant, WordPress pages take 9–10 s, and REST calls time out in the editor. OPcache is disabled in the local `php.ini`. Not a regression in the code — but propose enabling it, because gate 2 on a whole site becomes unusable.

### Tracking cookies before consent

`sbjs_*` cookies appear on the first visit despite a consent banner. WooCommerce order attribution only waits for consent through WP Consent API. Install it with the consent manager.

## Elementor build

### Every link points to `?page_id=`

The menus and buttons work, but every URL is `/?page_id=19` instead of `/services/flyers/`. The install tool resolved `@page:` links while permalinks were still plain, and `get_permalink()` returned what was true at that moment. Set the permalink structure and flush first, then install the pages; or simply replay the tool, since it is idempotent.

### Permalinks "flushed" and still 404

Every page except the home page answers 404 from Apache. `.htaccess` holds the `# BEGIN WordPress` markers with nothing between them. From the PHP CLI, `got_mod_rewrite()` is false (there is no `apache_get_modules()`), so `flush_rewrite_rules(true)` writes an empty block — and reports nothing. Add `add_filter('got_rewrite', '__return_true')` before flushing, then check for a real `RewriteRule . ` line. Checking that the markers exist is a false success: they are written either way.

### A widget is 420 px in the mockup and full width on the site

Elementor's `frontend.min.css` sets `max-width: 100%` through `.elementor.elementor .e-con > .elementor-widget`, four classes. A mockup class on the widget loses. Every override of this kind is in the table of `elementor.md`, "The adaptation layer"; the general cure is to measure (gate 4), then match the specificity Elementor uses rather than reaching for `!important`.

### "Access denied" when writing the tagline from the CLI

`update_option('blogdescription', …)` throws `Access denied.` from inside Elementor (measured). Elementor 4.3.6 hooks `update_option_blogname` and `update_option_blogdescription` to copy the value into its kit (`core/kits/manager.php`, read), and that kit save needs a user allowed to edit it; a CLI process has none. Run every tool through a bootstrap that sets the administrator as current user (`wp_set_current_user()`), and check that the kit's `site_description` followed.

### A third-party widget rewrites the form

The quote form's choice cards collapse into a list. Essential Addons Lite styles `.eael-contact-form-7 label { display: block }`, more specific than the mockup's `label.choice`. Prefix every form rule with the widget's own class. Same family as the block theme's navigation: a plugin's CSS printed after yours wins at equal specificity.

### Grey or stale screenshots

Two causes measured on the same build. Lazy images far below the fold stayed grey in full-page captures even after switching `loading` to `eager`: the page has to be scrolled through, which `scripts/capture.mjs` does. And the IDE's embedded browser returned old frames while its pane was hidden, and refused `http://localhost:80` in one setup — so the gates drive their own headless Chrome.

### Every page "renders" empty in a gate run

Gate 3 reports zero images and no title on every page. On Windows Git Bash, root-relative arguments such as `/site/about/` are rewritten to `C:/Program Files/Git/site/about/` before Node sees them. Pass full URLs; `gate3.mjs` refuses anything else. `MSYS_NO_PATHCONV=1` also stops the rewrite, but then breaks `curl -o /dev/null` (exit 23) in the same shell.

### A gate run dies silently

A gate run on 26 pages was killed by `timeout` with no output at all, because the script printed only at the end. The gates now print each page as it is measured; on a slow local stack, run them in the background and read the result once, rather than wrapping them in a short timeout.

### A gate summary nobody can re-check

The build's notes said that gate 4 was at 0 px and that "only `display` diverges". Six days later, the published script replayed on the same pages found a banner background that diverged on three pages. The raw output of the first run had not been kept, so nobody can tell whether that divergence was missed or appeared later. Write each gate's raw output to a dated file next to the summary. A summary is a reading of the output; it does not replace it.

### Two meta descriptions on one page

A check counting `name="description"` found two on the quote page. The second was the form's `<textarea name="description">`. Count `meta[name="description"]`, as `gate3.mjs` does. A plausible failure on a single page deserves a look at the markup before a fix.

### The consent banner is required with no tracking at all

The site sets no cookie, yet Complianz 7.5.7 decided a banner was needed. Its wizard answer `consent_for_anonymous_stats` defaults to `yes`. With no statistics tool, answer `no` in the configuration tool; `site_needs_cookie_warning('eu')` then returns false. If a banner is needed later, check that the banner table is not empty after a CLI configuration: the tool has to create the banner row itself.

## Remote access

- **MCP over HTTP** needs an `Mcp-Session-Id` header: `initialize`, read the ID from the response headers, send `notifications/initialized`, reuse the ID. `scripts/novamira.mjs` does this and reopens an expired session.
- **Streamed answers** arrive as `text/event-stream`: read the `data:` line before parsing JSON.
- **PHP writes are locked** outside Novamira's sandbox: `functions.php` and patterns travel in the theme archive; `style.css`, `theme.json` and `editor.css` can be edited directly.

## Preconfigured site, third-party theme

Measured on a store handed over with Fana 1.1.33 (Thembay), Elementor 4.4.0 free and 12 plugins already installed, November 2026. The branch itself is `third-party-theme.md`.

### WordPress will not boot at all

Fatal error before any hook: a plugin from the previous host (`Utils::$apiTokenFile`). You cannot deactivate it from wp-admin, and you cannot use `wp-load.php` either. Deactivate **in the database** with a small mysqli script that rewrites `active_plugins`, then remove the folders.

### A CSS fix that is correct and still loses

The rule is right, the file is loaded, nothing moves. A multipurpose theme's own stylesheet is long and specific. Prefix every generated selector with `:root` — one class of specificity, enough at equal weight — and enqueue at priority 10000 with `elementor-frontend` as a dependency.

### Every text is 1.25× too large after conversion

The mockup is in `rem` and the parent sets `html` to 20 px, not 16. Convert `rem` to `px` in the generator (×16). Gate 4 catches it: 48 px had become 60 px.

### The footer is gone on phones, and only there

A theme setting named `mobile_footer` set to `0` reads like "no mobile tab bar". On Fana it adds `body.mbhd-ft-desktop`, which hides the **site footer** below 768 px — legal pages unreachable on a phone. Read the theme's code before trusting a setting's name; the tab bar was `mobile_footer_icon`. Found on a 390 px screenshot, not by a gate.

### A string stays English whatever you put in the .mo

`aria-label="Close"` is written literally in the theme's templates, outside any translation function. No `.mo` reaches it. Translate it in the output buffer, or override that one template.

### A pattern that matches nothing while looking right

`wp_dropdown_categories()` writes its attributes in **single quotes** (`name='product_cat'`). A pattern in double quotes matches zero and the fix silently does nothing. Same family: the parent writes `href` before `class` in one template and after it in another, so a fixed-order pattern fixed one case in two.

### A REST filter that never sees the error it was written for

`rest_request_before_callbacks` runs **before** the permission check (`class-wp-rest-server.php`, 1256 against 1260), so it never receives its `WP_Error`. A 401 kept appearing in every visitor's console while the filter looked correct. `rest_request_after_callbacks` receives it.

### A plugin is active but its activation never ran

Installing from the CLI with `activate_plugin( $file, '', false, true )` activates it **silently**: WordPress skips the activation hooks. Complianz had therefore never granted administrators `manage_privacy`, and its banner table stayed empty. Activate non-silently, or replay `do_action( 'activate_' . $file )` for a plugin already active.

### Lighthouse says 100 and the feature is broken

Turning `<a href="javascript:void(0)">` into `<button>` raised the score. Only a keyboard test in a real browser showed the grid/list switch still worked — the theme bound it by `id`, so the change was safe, but no gate would have said so. And fixes applied by script raise the score while leaving the HTML a crawler reads unchanged: fix on the server whenever the server writes it.

## Pre-launch pass

Measured on the Farmart + Dokan store of `third-party-theme.md`, 18–19/11/2026. The pass itself is `pre-launch.md`.

### Every link in a list is underlined

A rule meant for links in running text — `.entry-content li a` — also matched every product card of the home page (title, brand, wishlist, compare, quick view: 34 cards), "View all" and the category list, because WooCommerce lists are lists. Scope text-link rules to lists without a class (`.entry-content :is(ul, ol):not([class]) > li a`) or to the content wrappers you own — and then exclude the WooCommerce account menu, whose `<ul>` has no class either.

### A plugin's button is dark on dark

The wishlist button showed black text on `#32373C`. WordPress gives every `.wp-element-button` the background of its default buttons; the plugin adds that class, the theme styles the text but not the background. `background-color: transparent` on that plugin's class, then the colours of the reference. The same padding made one icon of three 70 × 59 px in a column of hover buttons, and misaligned the other two.

### An underline Lighthouse does not see

`box-shadow: inset 0 -2px 0 <accent>` draws a perfect underline, and Lighthouse still fails `link-in-text-block` (1.31:1 and 2.81:1 against the surrounding text): only `text-decoration` counts as a non-colour cue. Use `text-decoration: underline` with `text-decoration-color` and `text-underline-offset`.

### A computed style that will not change

`getComputedStyle()` kept returning 30 px after a rule set 36 px, even with `!important` and an inline style. The theme animates the property (`transition: .5s`) and the tab was in the **background**, where animations do not advance: the value stays at the start of the transition. Measure in the foreground tab, or set `transition: none` in the test.

### The site says it is under maintenance and nobody turned it on

`.maintenance` at the root, timestamp a few minutes old: a WordPress **automatic** update, started by cron in an Apache request. Since 6.6 `WP_Automatic_Updater` enables maintenance before upgrading. On XAMPP/Windows it died on "Maximum execution time of 300 seconds exceeded" in `update-core.php`, during the md5 check of the current files — PHP counts wall-clock time on Windows — before copying anything. Read the error log before touching anything; if nothing was copied, remove `.maintenance` (WordPress ignores it after ten minutes anyway), back up, finish with `scripts/wp-core-update.php` and prove it with `scripts/wp-core-verify.php`. The same update took 93 s from the CLI.

### Text cut on the left, on phones only

A theme widget built on a Bootstrap grid (`.row` with −15 px margins) inside an Elementor container with no padding ran from −20 to 410 px on a 390 px screen. The page's own width did not grow past the viewport, so the overflow measure said 0; only the 390 px screenshot showed it. Zero the row's margins and the columns' padding below 992 px.

### A date of 1 January 1970 on a legal page

The cookie policy said "last updated on January 1, 1970". Complianz dates its documents two ways (`documents/class-document.php`, line 827): with a page ID, `strtotime( get_the_date( 'd F Y' ) )`; without one, the option `cmplz_publish_date`. The option was **missing**: Complianz writes it in `update_cookie_policy_date()`, which its own wizard calls — and a configuration tool that writes the wizard's options directly never runs it. Call that method once from the tool (not on every replay: the date would move without the policy changing).

The first branch has its own bug — in French `get_the_date` returns "18 novembre 2026", which `strtotime` cannot parse — and a filter for it was written first, on that reading of the code. The page still said 1970: the measure after the fix is what showed the cause was the other branch. The same page also exposed the site's American `date_format` (`F j, Y`), used by every other date on the site.

### Author pages redirected, and every vendor store with them

Redirecting author archives closes account enumeration — and Dokan builds each store page as an author query (`author_name`), so `is_author()` is true there. Exclude `dokan_is_store_page()` before redirecting. Found by reading `Rewrites.php` before shipping the rule.

## Local infrastructure

### "Maximum execution time of 120 seconds exceeded" in a plugin file

The file named is innocent — on this build, line 18 of a WooCommerce class, which is `defined( 'ABSPATH' ) || exit;`. PHP merely ran out of time there. Two causes, measured together: WordPress ran its cron **on page load** (7.5 s, and the whole queue after a night without visits), and OPcache was off (12 s per page, 330 SQL queries). The home page took 123 s and returned a 500. `DISABLE_WP_CRON` plus OPcache brought it to 3.9 s — but see the next entry before enabling OPcache.

With `DISABLE_WP_CRON`, schedule a real cron on the server (hPanel, cPanel, crontab) or deferred tasks never run again.

### Enabling OPcache makes every PHP page return nothing

Static files are served, PHP pages come back empty, and `error.log` shows `child process exited with status 3221225725` — 0xC00000FD, stack overflow. Apache's default thread stack on Windows is too small for WordPress plus a multipurpose theme and a dozen plugins once the code is cached. `ThreadStackSize 8388608` in the `mpm_winnt_module` block of `conf/extra/httpd-mpm.conf`. Restore `php.ini` first, check the site answers, then change both together.

A benign leftover: `VirtualProtect() failed [87]` repeats in `error.log` under Windows. No crash, no failed page — but the file grows fast, so purge it from time to time.

### MySQL will not start, and it is not the port

XAMPP reports "MySQL shutdown unexpectedly … blocked port, missing dependencies, improper privileges". Read `mysql/data/mysql_error.log` instead of guessing: on this machine it said `Cannot find checkpoint record at LSN` and `Aria recovery failed`. MariaDB's system tables (`mysql.plugin`, `mysql.db`) are **Aria** tables, so a corrupt Aria log stops the server before it opens anything.

The sequence that worked, after copying `data/mysql/` and the Aria logs somewhere safe:

1. delete `aria_log.########` and `aria_log_control` — MariaDB rebuilds them;
2. `aria_chk -o` (safe recover) on `data/mysql/*.MAI`. **Not** `aria_chk -r`: the sort-based repair failed on `aria_sort_buffer_size is too small`, ignored a `--sort_buffer_size` passed on the command line, and left two privilege tables worse than it found them;
3. start `mysqld` **in the foreground** with `--console`. The last line of the log file is not the last thing it says: the real error, `Can't open and lock privilege tables`, only appeared on the console.

Then a second corruption surfaced, in InnoDB and in a different database entirely — one unrelated project's table was enough to abort the whole server. Start with `--innodb_force_recovery=1`, dump every database while you can, and only then decide what to do with the broken one. Both corruptions came from an unclean shutdown; neither was visible until the next start.
