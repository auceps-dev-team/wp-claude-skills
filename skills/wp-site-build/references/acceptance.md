# Acceptance: five gates

No gate replaces another, and they run by default — the client never has to ask for them or point at a problem. Run them on staging at the end of phase 4, then on production in phase 6.

## Contents

- [Gate 1 · Block integrity, server side](#gate-1--block-integrity-server-side)
- [Gate 2 · Validity in the editor](#gate-2--validity-in-the-editor)
- [Gate 3 · Rendering, logged out](#gate-3--rendering-logged-out)
- [Gate 4 · Pixel fidelity](#gate-4--pixel-fidelity)
- [Gate 5 · Editor fidelity](#gate-5--editor-fidelity)
- [Replay check for tools](#replay-check-for-tools)
- [Measurement hygiene](#measurement-hygiene)

## Gate 1 · Block integrity, server side

```php
function count_blocks($blocks, &$n) {
  foreach ($blocks as $b) {
    if (empty($b['blockName'])) continue;
    $n[$b['blockName']] = ($n[$b['blockName']] ?? 0) + 1;
    if (!empty($b['innerBlocks'])) count_blocks($b['innerBlocks'], $n);
  }
}
$n = []; count_blocks(parse_blocks(get_page_by_path('home')->post_content), $n);
$allowed = ['core/', 'woocommerce/', 'mailpoet/', 'complianz/', 'complianztc/'];   // the plugins the plan named
return [
  'total'   => array_sum($n),
  'raw_html'=> $n['core/html'] ?? 0,                                                       // must be 0
  'foreign' => array_values(array_filter(array_keys($n), fn($k) => !array_filter($allowed, fn($p) => str_starts_with($k, $p)))),  // must be []
];
```

On a showcase site the allow-list is `core/` alone. On a store it also holds the plugins the deployment plan named — a block from anything else means content now depends on a plugin nobody agreed to.

## Gate 2 · Validity in the editor

The only check that sees blocks marked "unexpected or invalid content". For one page, open `post.php?post=ID&action=edit` and query the store:

```js
const flat = bs => bs.reduce((a, b) => a.concat([b], flat(b.innerBlocks || [])), []);
const all = flat(wp.data.select('core/block-editor').getBlocks());
({
  total: all.length,
  invalid: all.filter(b => b.isValid === false).map(b => b.name),   // must be []
  images: all.filter(b => b.name === 'core/image').length,
  imagesLinked: all.filter(b => b.name === 'core/image' && b.attributes.id).length,   // must equal images
});
```

The snippet ends with an expression, not `return`: a top-level `return` is a syntax error in a console.

**For a whole site at once**, parse every page, template and pattern from one editor screen. `wp.blocks.parse()` validates against the block types registered in that screen, plugins included:

```js
window.__gate2 = null;
(async () => {
  const check = blocks => { const bad = []; let n = 0;
    const walk = bs => bs.forEach(b => { n++; if (b.isValid === false) bad.push(b.name); walk(b.innerBlocks || []); });
    walk(blocks); return { n, bad }; };
  const out = {};
  for (const id of [/* page IDs */]) {
    const p = await wp.apiFetch({ path: `/wp/v2/pages/${id}?context=edit` });
    out[p.slug] = check(wp.blocks.parse(p.content.raw));
  }
  for (const slug of ['archive-product', 'taxonomy-product_cat', 'order-confirmation']) {
    const t = await wp.apiFetch({ path: `/wp/v2/templates/my-theme//${slug}?context=edit` });
    out[slug] = check(wp.blocks.parse(t.content.raw));
  }
  const patterns = await wp.apiFetch({ path: '/wp/v2/block-patterns/patterns' });
  for (const p of patterns.filter(p => p.name.startsWith('my-theme/'))) out[p.name] = check(wp.blocks.parse(p.content));
  window.__gate2 = out;
})().catch(e => window.__gate2 = { error: String(e) });
```

Read `window.__gate2` a few seconds later. Launching in the background and reading afterwards matters on slow stacks: on a local XAMPP without OPcache each REST call took about ten seconds, and a single `await` chain outran the tool's timeout. Criterion: every `bad` array empty. Measured on the store build: 305 blocks over six pages, 132 over three templates, 64 over two patterns, none invalid.

## Gate 3 · Rendering, logged out

- Every image served with HTTP 200 and a non-zero size.
- Fonts really applied: `getComputedStyle(document.body).fontFamily`, and no request to a font CDN.
- Interactions working **logged out** — in an admin session, host widgets can cover the mobile screen and the admin bar shifts fixed headers.
- No horizontal scroll at 390 px. Measure several pages from one tab with same-origin iframes:

```js
window.__overflow = {};
(async () => {
  for (const slug of ['about', 'faq', 'contact' /* … */]) {
    const f = Object.assign(document.createElement('iframe'), { style: 'position:fixed;left:0;top:0;width:375px;height:812px;opacity:0;border:0' });
    document.body.appendChild(f);
    await new Promise(r => { f.onload = r; f.src = `/${slug}/`; });
    const d = f.contentDocument;
    window.__overflow[slug] = { overflow: d.documentElement.scrollWidth - 375,
      wide: [...d.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 376).slice(0, 3).map(e => e.className) };
    f.remove();
  }
})();
```

  Closed off-canvas drawers (mini-cart, mobile menu) show up in `wide` without causing overflow; `overflow` is the number that must be 0.
- **Cookies set to an anonymous visitor**, read from the response headers rather than from `document.cookie` (which cannot see `HttpOnly`):

```bash
for u in "" "faq/" "product-category/sheets/"; do echo "== /$u"; curl -s -D - -o /dev/null "https://site/$u" | grep -i '^set-cookie' | cut -d= -f1; done
```

  On a page nobody has interacted with, the list should be empty. Anything there must be strictly necessary and declared in the cookie policy (`store.md`, consent).

## Gate 4 · Pixel fidelity

What the eye misses: margins zeroed by an over-broad reset, residual `blockGap`, a textarea at the wrong height. Measure geometry and computed styles of the **same selectors** on the local mockup and on the site, then diff.

```js
// Run unchanged on the mockup THEN on the site, same viewport (1440×900). Only adapt SEL.
document.documentElement.style.scrollBehavior = 'auto';
for (let y = 0; y < 12000; y += 800) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 120)); }
window.scrollTo({ top: 0, behavior: 'instant' }); await new Promise(r => setTimeout(r, 2500));

const SEL = ['.hero', '.hero-title', '.services', '.service-card', '.footer' /* every component class */];
const P = ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor',
           'display', 'gridTemplateColumns', 'gap', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom'];
const out = {};
for (const s of SEL) {
  const e = document.querySelector(s); if (!e) { out[s] = null; continue; }
  const c = getComputedStyle(e), r = e.getBoundingClientRect();
  out[s] = Object.fromEntries([['w', Math.round(r.width)], ['h', Math.round(r.height)], ['x', Math.round(r.x)], ...P.map(p => [p, c[p]])]);
}
out.__page = document.documentElement.scrollHeight;
JSON.stringify(out);
```

Criterion: page height equal within ±2 px, no component more than 2 px off, no diverging property. A gap is never "noise": +24 px repeated is residual blockGap; all margins at 0 is an over-broad reset; a few pixels per form field is CF7's wrapping `<span>`.

On a store, run it on the pages the mockup covered (home, category, product). WooCommerce block templates render their own markup inside your classes, so compare your components, not WooCommerce internals.

## Gate 5 · Editor fidelity

In `post.php?post=ID&action=edit`, measure inside the canvas — the modern editor lives in an iframe:

```js
const doc = document.querySelector('iframe[name="editor-canvas"]').contentDocument;
const m = s => { const e = doc.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
  return { pos: getComputedStyle(e).position, w: Math.round(r.width), h: Math.round(r.height) }; };
({ canvas: doc.documentElement.clientWidth, photo: m('.hero-photo'), wrapper: m('.hero .wrapper'), button: m('.wp-block-button') });
```

Out-of-flow layers must still be `absolute`, the wrapper must span the canvas, no button may be ~100 px wide (vertical text). If it fails, `assets/editor.css` is missing or not registered.

## Replay check for tools

Every `tools/*.php` script must leave the site in the same state when run twice. After the second run, count what could have been duplicated:

```sql
SELECT COUNT(*) FROM wp_woocommerce_attribute_taxonomies;              -- unchanged
SELECT COUNT(*) FROM wp_term_taxonomy WHERE taxonomy = 'pa_colour';      -- unchanged
SELECT post_name, COUNT(*) c FROM wp_posts WHERE post_type = 'page' AND post_status = 'publish' GROUP BY post_name HAVING c > 1;   -- no rows
```

A tool that is not replayable cannot be trusted at deployment, because deployment *is* a replay.

## Measurement hygiene

Test artefacts that have produced imaginary failures:

- **`scroll-behavior: smooth`** animates programmatic `scrollTo()`: black screenshots, measurements mid-scroll. Force `scrollBehavior = 'auto'` and `behavior: 'instant'` first.
- **Undecoded JPEGs** for about five seconds after load. Check `img.complete && img.naturalWidth > 0`.
- **Lazy images** in full-page screenshots: set `loading = 'eager'` on the images you are inspecting.
- **Reserved query vars.** `?m=`, `?p=`, `?s=`, `?cat=`, `?tag=` trigger archive queries. Cache-buster: `?fresh=<n>`.
- **A consent banner over the content.** Hide it for the screenshot (`.cmplz-cookiebanner{display:none}` from the console), never by accepting cookies — that changes what the next measurement sees.
- **Your own test data.** Submissions, subscribers and orders created by a test are deleted afterwards, and the report says so.
