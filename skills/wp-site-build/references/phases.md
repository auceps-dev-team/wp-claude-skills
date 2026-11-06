# Phases in detail

## Contents

- [Phase 0 — Workspace](#phase-0--workspace)
- [Phase 1 — Brief](#phase-1--brief)
- [Phase 2 — Mockup](#phase-2--mockup)
- [Phase 3 — Page set](#phase-3--page-set)
- [Phase 4 — Block theme and local staging](#phase-4--block-theme-and-local-staging)
- [Phase 5 — Deployment](#phase-5--deployment)

---

## Phase 0 — Workspace

**Create the project in the folder the user gave access to** — the session's working directory. A project placed elsewhere "as a precaution" ends as an empty folder the user cannot explain.

On macOS, `~/Documents` and `~/Desktop` are protected by TCC, but only when permission has not been granted — and it usually has been for the tool that just opened the folder. Test it rather than assume, in three seconds:

```bash
mkdir -p "$PWD/.tcc-test" \
  && node -e "process.chdir('$PWD/.tcc-test'); require('fs').writeFileSync('t','x'); console.log('access ok')" \
  ; rm -rf "$PWD/.tcc-test"
```

Only on `EPERM: uv_cwd` create the project outside (`~/wp-projects/<name>`), say so in the same message, and symlink it back into the working folder.

Layout used on the builds this skill comes from:

```
_mockup/
├── source/            page bodies, shared parts, <head> template (phase 3)
├── site/              assembled HTML, styles.css, app.js, img/ — never edited by hand
├── scripts/           serve.mjs, assemble.mjs
└── tools/             install-site.php, configure-*.php (phase 4 onwards)
wp-content/themes/<slug>/
```

## Phase 1 — Brief

The brief fits in one message. What matters is the reference, not the prose. The template the method's training material uses (in French, as clients send it):

```
Détail du site :
[Nom]
[Activité]
[Description]
[Contact]

Pages du site :
Accueil
[...]

Référence :
Image en pièce jointe
```

What the template does not say, the method decides — none of these are questions for the user:

- **Reference.** The attached image (or URL) *is* the visual reference. Without one, ask for it before writing code: it is the strongest lever in the method.
- **Copy.** Written from [Activité] and [Description]; anything real that is supplied ([Nom], [Contact]) is reused verbatim.
- **Photos.** The client's own first; their current site is a source. Unsplash otherwise.
- **WordPress.** Nothing goes there before mockup approval, then deployment-plan approval. Both are always asked.
- **Acceptance.** The five gates run by default.

**The one question that is mandatory when it arises:** touching any register invariant. And facts — reviews, numbers, delivery terms, legal identity — are never invented: they become placeholders (`SKILL.md`, "Facts belong to the client").

The plan announced before coding, its headings and its two checkpoints are in `register.md`.

When the brief is a redesign of an existing site, read the old site before drawing: products, categories, contact details, stated promises ("free delivery from…", "refund within…"). Everything taken from it is marked `à vérifier` — it was read, not confirmed. On the store build behind `store.md`, the old site's "About" and "FAQ" pages turned out to be theme demo content (lorem ipsum, fictitious team): reading them is how you find out they hold nothing.

## Phase 2 — Mockup

One page — the home page — in HTML and CSS, locally.

### Entry gates

Rule 0: *am I dropping this idea because it is bad, or because I wonder how it will convert?* If the second, the idea stays.

Rule 0′: *am I choosing this because the reference does it, or because I find it prettier?* If the second, it is not a decision, it is a question.

### Dev server

```bash
cd /tmp && ROOT=/abs/path/_mockup/site nohup node /abs/path/scripts/serve.mjs > /tmp/serve.log 2>&1 &
sleep 1 && tail -1 /tmp/serve.log   # the port actually used
```

Start it from `/tmp`: a process whose *current directory* is TCC-protected fails with `EPERM: uv_cwd`, whereas `ROOT` may point anywhere. If 4321 is busy the server moves to the next port; read the log rather than assume, and never kill whatever holds the port — it may be another project. In Claude Code's desktop app, declare it in `.claude/launch.json` instead and open it in the preview pane.

### Visuals

| Source | Cost | Coherence | When |
|---|---|---|---|
| Client photos (incl. their current site) | None | Highest | Whenever they exist |
| Unsplash | None | Medium | Demo, generic sector |
| Generated | Credits | High | Strongly typed direction |

For Unsplash, take IDs from a results page rather than guessing URLs:

```js
[...document.querySelectorAll('figure img[src*="images.unsplash.com/photo-"]')]
  .slice(0, 16).map(i => ({ id: (i.src.match(/photo-[\w-]+/) || [''])[0], alt: (i.alt || '').slice(0, 70) }));
```

Download: `https://images.unsplash.com/{id}?w=1200&q=80&fm=jpg&fit=crop`.

Leave out of the mockup any photo built around licensed characters (cartoon or film brands on children's bedding, for instance), and stock avatars posing as customers, even when they are in the client's catalogue: the mockup is shown and shared, the catalogue is the client's responsibility.

### Iteration protocol

1. Write the full page with real copy — never lorem.
2. Take **one** screenshot; fix what it shows.
3. **One design pass before showing the client**: push the page instead of repairing it. *Pushing means bringing it closer to the reference*, never adding a family, colour or geometry it lacks.
4. **Pass the register gate** (`register.md`) — before sending, never after.
5. Show the client, who names precisely what is wrong.
6. Two or three rounds at most; beyond that the brief is at fault.

Screenshots taken less than about five seconds after load often show missing images: large JPEGs are not decoded yet. Check `img.complete && img.naturalWidth > 0` before concluding to a bug.

### Checkpoints before approval

- No composition decision was taken with conversion in mind (rule 0).
- Register gate passed: seven invariants, seven verdicts, no "close" (rule 0′).
- The reference was reopened next to the screenshot in this round.
- The main title fits on two lines at most, with `hyphens: none` and `text-wrap: balance`.
- No empty rectangle or placeholder fill.
- Components of the same type share padding and baselines.
- No horizontal scroll at 390 px — measured with `document.documentElement.scrollWidth - innerWidth`, not eyeballed. Carousels are the usual culprit: give each track `position: relative` and clip the site wrapper with `overflow-x: clip` (not `hidden`, which creates a scroll container and breaks sticky columns).

## Phase 3 — Page set

The approved home page fixes the design system; inner pages reopen no aesthetic debate.

Generate pages from one skeleton rather than by hand, so the header and footer are byte-identical everywhere. `scripts/assemble.mjs` does this:

```
source/head.html        <head> and the body frame: {{title}} {{class}} {{banner}} {{header}} {{content}} {{footer}}
source/parts/*.html     banner, header, footer — ONE source each
source/pages/*.html     first line: <!-- file: x.html | title: … | class: … | menu: … -->
```

`menu` names the header entry to mark as current; the script fails if that entry does not exist, so a renamed menu item cannot silently lose its active state. It also fails on any unreplaced `{{token}}`.

```bash
node scripts/assemble.mjs _mockup          # reads _mockup/source, writes _mockup/site
```

| Mockup | Becomes in phase 4 |
|---|---|
| shared header (one source) | `parts/header.html`, usually through a PHP pattern |
| shared footer | `parts/footer.html` |
| each section | a pattern in `patterns/`, or blocks in a page |
| `styles.css` | `theme.json` tokens + `style.css` |
| `app.js` | `assets/app.js` |

For a store, the mockup also covers category, product, cart, checkout and account pages: they become WooCommerce block templates, not pages (`store.md`).

## Phase 4 — Block theme and local staging

HTML-to-blocks conversion is in `block-conversion.md`; the starting theme is `assets/theme-skeleton/`.

```
<slug>/                 the folder name IS the slug passed to switch_theme()
├── style.css           theme header + the mockup's CSS + Gutenberg adaptations
├── theme.json          tokens — and blockGap "0px"
├── functions.php       fonts (site AND editor), styles, script, pattern category, small filters
├── parts/              header.html, footer.html
├── templates/          front-page.html and page.html: header + post-content + footer
├── patterns/           one .php per reusable section, or per piece that needs computed IDs
└── assets/
    ├── app.js          selectors by class, never by id
    ├── editor.css      canvas-only fixes (gate 5)
    ├── fonts/          self-hosted: scripts/fetch-fonts.mjs
    └── img/            theme-owned images
```

### Self-hosted fonts

Loading fonts from `fonts.googleapis.com` sends each visitor's IP to Google; under GDPR that has been ruled to need consent (LG München I, 20 January 2022, 3 O 17493/20). Self-hosting removes the question:

```bash
node scripts/fetch-fonts.mjs "https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,400..800;1,400&family=Fraunces:wght@600..800&display=swap" wp-content/themes/<slug>/assets/fonts
```

It writes `fonts.css` and the `.woff2` files next to it; enqueue `assets/fonts/fonts.css` and pass the same file to `add_editor_style()` so the client composes in the real typeface. The store build behind `store.md` measured no request to Google after the switch.

### Staging: a local WordPress, written only by tools

Build against a local copy (XAMPP, Local, wp-env) before touching production. Every piece of content or configuration is written by a PHP script run with the CLI — never typed into wp-admin — so it can be read, reviewed, replayed on production and replayed again after a correction.

The bootstrap every tool shares:

```php
<?php
$_SERVER['HTTP_HOST'] = 'localhost';   // WordPress reads both before it loads
$_SERVER['REQUEST_URI'] = '/';
require dirname(__DIR__, 2) . '/wp-load.php';

// On the CLI there is no user: kses then strips markup as it would for a visitor.
$admin = get_users(['role' => 'administrator', 'number' => 1, 'fields' => 'ids']);
if ($admin) wp_set_current_user((int) $admin[0]);
kses_remove_filters();
```

Three habits make a tool safe to replay:

- **Find before you create.** Pages by `get_page_by_path()`, media by a meta key you set at import (`_origin_url`, `_mockup_file`), products by their origin ID, forms by title. Update when found, insert otherwise.
- **Print what you did, and check it.** End each tool with counts — pages written, media reused, duplicates found — and run it twice: the second run must report the same state and create nothing.
- **Back up the database before each batch** (`mysqldump --default-character-set=utf8mb4 db > before-<step>.sql`). Locally it costs seconds; a tool that misfires on a production-shaped database is cheaper to undo than to repair.

Page content is built with small helpers that emit exact block markup (`group()`, `heading()`, `para()`, `image()` with the media `id`, `buttons()`, `details()`), so the markup is right by construction and gate 2 has nothing to find. Splicing a generated section into an existing file with a script is fine — but check the source exists first: a `file_get_contents()` on a missing path returns `false`, concatenates as an empty string, and silently deletes the section being replaced.

Typical tool set: `import-catalogue.php` (stores), `install-site.php` (media, forms, pages, front page, theme switch), then one `configure-<topic>.php` per concern — consent, terms, filters, newsletter, payments — each owning its own options, and `configure-seo.php` last, once every page and product it describes exists (`seo.md`).

For a redesign, compare the imported catalogue with the live one field by field before the SEO step: name, price, images, categories, description, short description. On the store build that comparison found 69 products whose descriptions the import had dropped, and two real products it had skipped (one with no category, one with no name), among 37 theme demo products correctly left out.

## Phase 5 — Deployment

### Access

WP-CLI over SSH is the simplest: upload the theme and `tools/`, then `wp eval-file tools/install-site.php` replays exactly what ran on staging. Where only HTTP access exists, the Novamira plugin exposes PHP execution and file abilities; `scripts/novamira.mjs` calls one without registering an MCP server:

```bash
WP_API_URL=https://site/wp-json/mcp/novamira WP_API_USERNAME=… WP_API_PASSWORD=… \
  node scripts/novamira.mjs novamira/execute-php '{"code":"return get_option(\"blogname\");"}'
```

Credentials stay in environment variables. Register the MCP server instead only if the user asks, with scope `local` (never `user`: every session on the machine would get PHP execution on the client's site) and a pinned package version (never `@latest`). An application password that travelled over an untrusted channel is revoked afterwards.

### 0 · Back up what exists

The target site is never assumed empty. Before any write, serialise content and settings and record what the deployment gate will show — including slug collisions: an existing `contact` page will be overwritten and survive only in the backup.

**Never in `uploads/`.** It is served publicly at a guessable address, and the backup holds drafts and private content. Write it outside the web root; if the host forbids that, into an unguessable folder closed by `.htaccess`, checked with `curl`, deleted after acceptance.

```php
global $wpdb;
$sep = DIRECTORY_SEPARATOR;
$webroot = rtrim((!empty($_SERVER['DOCUMENT_ROOT']) ? realpath($_SERVER['DOCUMENT_ROOT']) : false) ?: realpath(ABSPATH), $sep);
$outside = fn($p) => strpos(realpath($p) . $sep, $webroot . $sep) !== 0;

$dir = dirname($webroot) . $sep . 'wp-backups';
$fallback = !(wp_mkdir_p($dir) && is_writable($dir) && $outside($dir));
if ($fallback) {
  $dir = WP_CONTENT_DIR . '/backup-' . wp_generate_password(32, false);
  wp_mkdir_p($dir);
  file_put_contents("$dir/.htaccess", "Require all denied\n");
  file_put_contents("$dir/index.php", "<?php // Silence.\n");
}
$rows = $wpdb->get_results("SELECT ID, post_name, post_title, post_status, post_type, post_content
  FROM {$wpdb->posts} WHERE post_type IN ('page','post') AND post_status NOT IN ('auto-draft','revision')", ARRAY_A);
$json = wp_json_encode(['date' => current_time('mysql'), 'theme' => get_stylesheet(),
  'show_on_front' => get_option('show_on_front'), 'page_on_front' => get_option('page_on_front'),
  'permalinks' => get_option('permalink_structure'), 'content' => $rows], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

// A failed write must not pass for a backup.
$file = $dir . '/before-theme-' . gmdate('Ymd-His') . '.json';
if ($json === false || file_put_contents($file, $json) !== strlen($json)) return "FAILED: no backup in $dir. Stop.";

$project_slugs = ['home', 'contact' /* , … */];
return ['file' => $file, 'fallback' => $fallback,
  'test_url' => $fallback ? content_url(basename($dir) . '/' . basename($file)) : null,
  'theme' => get_stylesheet(), 'permalinks' => get_option('permalink_structure'),
  'plugins' => get_option('active_plugins'),
  'collisions' => array_values(array_filter($project_slugs, 'get_page_by_path'))];
```

If `fallback` is true, measure: `curl -s -o /dev/null -w '%{http_code}' "<test_url>"`. 403 means `.htaccess` holds; 200 means only the random name protects the backup (typically nginx) — tell the client at the gate. For a store, back up the whole database with the host's tool as well: orders and customers are not in this JSON.

### The deployment gate

Steps 1–6 replace the theme of a production site, overwrite colliding pages, install plugins and may change permalinks. None of it runs without an **explicit yes** from the client, given after reading what will change. Mockup approval does not cover it: it approved a drawing, not its consequences.

| What changes | Before | After |
|---|---|---|
| Target site | URL | — |
| Active theme | `theme` | `<slug>`; the old theme stays installed |
| Overwritten pages | each slug in `collisions` | the mockup's content |
| Plugins | `plugins` | each one to install, named, with its version |
| Permalinks | `permalinks` | `/%postname%/` only if they were plain (`''`) |
| Backup | — | `file`; if `fallback`, the HTTP code measured |

An agreement given for another site, or before this table existed, does not count. A partial refusal applies line by line.

### Whole-site migration instead

When the client confirms nothing on the live site must be kept — no orders, accounts or subscribers — the staging copy can replace production whole, with a migration plugin such as Duplicator, instead of steps 1–4. It is faster and it is destructive: the live database is gone, so take the same plugin's package of the live site first and keep it off the server. Three things to settle on staging before packaging:

- **Exclude the mockup and tools folders.** `tools/*.php` bootstrap WordPress and act as an administrator; uploaded inside the web root, anyone could run them by URL. Exclude `_mockup/`, `.claude/` and any backup of `.htaccess` from the package.
- **Permalinks.** A local stack often runs on `/index.php/%postname%/`; switch staging to `/%postname%/` before packaging, regenerate content links by replaying the tools, and flush rewrite rules in a *fresh* request — flushed in the same request as the switch, the product-category rules kept the old prefix and every category page returned 404.
- **What the copy cannot bring.** Image sizes the local PHP could not generate, mail delivery, payment keys: list them as post-migration tasks.

### 1 · Package and upload the theme

```bash
zip -rq <slug>.zip <slug> -x '*.DS_Store'
```

The archive must contain a folder named exactly the slug. With Novamira, PHP files cannot be written one by one outside its sandbox, so the archive is the only route for `functions.php` and patterns; upload it with `novamira/create-upload-link` and a `curl -X PUT`.

### 2 · Unpack and activate

Empty the versioned folders first (`patterns/`, `templates/`, `parts/`), otherwise deleted patterns survive. Then `unzip_file()`, `wp_clean_themes_cache()`, `switch_theme('<slug>')`.

### 3 · Run the tools, in staging order

Media import, forms, pages, front page, then each `configure-*` tool. They are the same files that ran on staging. Plugins install from wordpress.org only, at the version tested on staging.

### 4 · Static front page and permalinks

```php
update_option('show_on_front', 'page');
update_option('page_on_front', get_page_by_path('home')->ID);
if (get_option('permalink_structure') === '') {   // only plain permalinks: changing a chosen structure breaks links and SEO
  global $wp_rewrite;
  $wp_rewrite->set_permalink_structure('/%postname%/');
  $wp_rewrite->flush_rules();
}
```

### 5 · Purge, version, check what is really served

Three caches stack, and each one has made a fix look ineffective: the page cache (LiteSpeed), the browser (one host served HTML with `max-age=604800`), and WordPress's own cache of theme headers and patterns.

After **every** change to `style.css` or `theme.json`:

1. bump `Version:` in `style.css` — it drives the `?ver=` of the assets;
2. purge the host's page cache, plus `wp_clean_themes_cache(true); wp_cache_flush();` and, if `theme.json` changed, `WP_Theme_JSON_Resolver::clean_cached_data();` — after adding or renaming a pattern file, also `wp_get_theme()->delete_pattern_cache()`;
3. check with `curl` that the served file matches the local one byte for byte, and that the HTML references the new version;
4. reload with a neutral cache-buster — `?fresh=<n>`, never `?m=`, `?p=`, `?s=`, `?cat=` or `?tag=`, which are WordPress query vars (`?m=1` returns an archive 404 that looks like a broken site).

### 6 · Clean up

Delete transfer files (`theme.zip`, `content.json`) — they sit in public `uploads/`. Keep the backup until acceptance; delete it then if it had to fall back inside the web root.

Then run the five gates on production (`acceptance.md`), and finish the SEO step where only production can: Search Console verification, sitemap submission, `robots.txt` at the domain root (`seo.md`).
