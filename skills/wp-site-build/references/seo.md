# The SEO step: titles, descriptions, sitemap, sharing

Measured on the store build behind `store.md`, 6 November 2026: All in One SEO (AIOSEO) 5.0.5, free edition, on WordPress 7.1.4 and WooCommerce 11.2.2. The general rules — who owns canonicals, sitemaps and schema, how to migrate without losing rankings — are in `wp-seo`; this file is the build step and what it measured.

## Contents

- [When it runs](#when-it-runs)
- [What the tool writes](#what-the-tool-writes)
- [Writing the texts](#writing-the-texts)
- [AIOSEO from a script](#aioseo-from-a-script)
- [What the free edition does not do](#what-the-free-edition-does-not-do)
- [Checks](#checks)

## When it runs

Phase 4, once pages and catalogue are final, as `tools/configure-seo.php`. The tool takes `--dry-run`: it prints every title and description it would write. Read that output before writing — on this build the first dry run had wrong gender agreement, redundant phrases and a bathrobe described as a bed sheet, none of which a length check would catch.

Like `install-site.php`, the tool stops being replayable once the client edits SEO fields in wp-admin: it would overwrite them. Say so in the editing guide.

## What the tool writes

| Scope | Setting |
|---|---|
| Global | Separator, site title, default description; organisation name, logo, phone and email — facts the client confirmed, nothing else |
| Sharing | Featured image first, a hero photo as fallback for pages without one |
| Content types | Pages and products: `#post_title #separator_sa #site_title`. Attachments hidden and redirected to their parent. Posts, MailPoet pages, tags and blog categories hidden when the site has no blog |
| Sitemap | Pages, products and product categories only; author and date archives off |
| Each page | Title (60 characters at most), description (160 at most) |
| Utility pages | Cart, checkout, account, order tracking: `noindex`, plus a one-line description |
| Each product | Title and description, generated (next section) |
| Each product category | Its term description — visible under the category title, and the only per-category text the free edition uses |
| Sample content | WordPress's "Hello world!" post and "Sample page" go to the trash before a sitemap advertises them |

## Writing the texts

- **Nothing the site does not already state.** No price (it changes and the meta description does not), no delivery zone or delay (still to be supplied), no review. Facts flagged "to check" on the site stay out of meta descriptions: a search result is a bad place for an unconfirmed promise.
- **Unique.** The tool records every description and flags duplicates. On this build the one left is two products both named "Couette", identical in category and colour: the fix is a rename by the client, not more text.
- **Names that are codes** (`WA0029`, `8711`, `-1 place`) keep `#post_title` and gain what the product is and its colour after it — `#post_title – parure de lit enfant, coloris bleu` — so a later rename updates the title. A name that is a slug (`parure-ensemble-housse-de-couette-unie`) is replaced in the title by what the product is, and flagged for renaming.
- **French colours without agreement.** "coloris bleu et blanc" reads correctly after a masculine or feminine noun and with two colours; "parure bleu" or "drap bleue" do not.
- **Only data that belongs to the product.** Composition text was copied from the old site; one bathrobe there carried a bed-sheet description. The tool only uses composition for bed linen, and the mismatch is reported to the client.
- **Too long → a shorter variant, never "…".** Try full text, then without the brand tail, then without the category sentence, until it fits 160 characters.

## AIOSEO from a script

All measured on 5.0.5, from the PHP CLI.

1. **`product` settings are missing.** The dynamic options are built before WooCommerce registers `product`, so writing `searchAppearance->postTypes->product->title` fails with "Attempt to modify property "product" on null". Call `aioseo()->dynamicOptions->refresh()` first.
2. **Option objects keep the path they walked.** `$d = aioseo()->dynamicOptions->searchAppearance; $d->postTypes->page->title = …;` works once; the next `$d->postTypes` is null. Start every write from `aioseo()->…`.
3. **`Models\Post::savePost($id, $data)` takes the editor's keys, not column names**: `title`, `description`, `default`, `noindex`, `nofollow`. `robots_noindex` is silently ignored — the utility pages stayed indexable until the keys were fixed.
4. **A title equal to the default format is stored as null** (64 of 113 titles here). That is intended: the default applies, and a later change of format updates those pages too.
5. **No description means the first sentence of the content.** The cart page described itself as "You may be interested in…", the cross-sell heading.
6. **Activation from the CLI installs no language pack**: the admin stays in English. Install it from translate.wordpress.org with `Language_Pack_Upgrader`, as WordPress's own updater does.

```php
use AIOSEO\Plugin\Common\Models\Post as SeoPost;
aioseo()->dynamicOptions->refresh();
aioseo()->dynamicOptions->searchAppearance->postTypes->product->title = '#post_title #separator_sa #site_title';
SeoPost::savePost($cartId, ['description' => 'Votre panier.', 'default' => false, 'noindex' => true, 'nofollow' => false]);
```

## What the free edition does not do

- No SEO title or description per category: the term description is used, and it is also printed on the category page.
- No share image per category: category pages share without an image.

## Checks

Measured on this build, and part of acceptance gate 3 (`acceptance.md`):

| Check | Result |
|---|---|
| `<title>`, meta description, canonical, robots meta | exactly one each on home, page, product and category |
| Utility pages | `noindex` on cart, checkout, account, order tracking |
| Product structured data | one `Product`, in AIOSEO's graph — no WooCommerce duplicate |
| Core sitemap | `/wp-sitemap.xml` answers 302 to `/sitemap.xml`: one sitemap |
| Sitemap contents | 13 pages, 99 products (the draft excluded), 17 categories (the empty one excluded) — equal to the database |
| Cookies to an anonymous visitor | none |
| `robots.txt`, `llms.txt` | 404 on the local copy, because WordPress only serves them at a domain root and the copy lives in a subfolder; check them on production |

```bash
for u in "" "about/" "product/<slug>/" "product-category/<slug>/" "cart/"; do
  curl -s "https://site/$u" > /tmp/p.html
  printf '/%-30s title:%s desc:%s canonical:%s robots:%s\n' "$u" \
    "$(grep -c '<title>' /tmp/p.html)" "$(grep -c 'name="description"' /tmp/p.html)" \
    "$(grep -o 'rel="canonical"' /tmp/p.html | wc -l)" "$(grep -o 'name=.robots. content=.[^"]*' /tmp/p.html)"
done
```

After deployment: verify the domain in Google Search Console, paste the verification code in AIOSEO's webmaster tools, submit `/sitemap.xml`, and check `robots.txt` lists it.
