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
