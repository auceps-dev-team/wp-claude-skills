<?php
/**
 * audit-site.php — pre-launch pass, part 1: every published URL, read in the HTML the server actually sends.
 *
 *   php scripts/audit-site.php --wp=/path/to/wordpress [--user=local_admin] [--out=report.json] [--max=N]
 *
 * URLs come from the DATABASE, not from memory: published pages, every product category (empty ones too), every tag,
 * every product, plus the screens nobody lists — search with and without results, a 404, the account endpoints, the
 * cart, checkout, compare and wishlist pages WITH an item in them, the vendor store (Dokan), and a few visitor views.
 *
 * Per URL: HTTP status and redirect, <title>, meta description, h1 count, English UI words in visible text AND in what
 * screen readers say (aria-label, placeholder, title, alt, button values), "à préciser"/"à compléter" placeholders,
 * demo leftovers, images without alt. Then every internal link and image met on those pages is requested once.
 *
 * Logged in as a LOCAL administrator through a session WordPress generates itself (no password typed or stored), so a
 * store in "coming soon" mode is audited as it will be at launch; the admin bar is left out of the analysis. The
 * session's cart, compare list and wishlist receive one item. CLI only, localhost only.
 *
 * Measured on a Farmart + Dokan store, 19/11/2026: 208 URLs and 1 388 internal links in 9 minutes on XAMPP; it found a
 * public technical product, English left on second-level screens (filled wishlist and compare list, 13 share buttons),
 * a vendor URL carrying the agency's name, tag pages without description — none of them on a page the gates covered.
 * Read the English list with a human eye: brand names ("Forever Living Products") match the word list too.
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
$opt = getopt('', array('wp:', 'user:', 'out:', 'max:'));
// Not "$wp": WordPress keeps its main object in the global $wp, and wp-settings.php would find a string there.
$racine_wp = rtrim($opt['wp'] ?? getcwd(), '/\\');
if (!is_file("$racine_wp/wp-load.php")) { fwrite(STDERR, "usage: php audit-site.php --wp=/path/to/wordpress [--user=login] [--out=f.json] [--max=N]\n"); exit(2); }
define('WP_USE_THEMES', false);
define('DISABLE_WP_CRON', true);
require "$racine_wp/wp-load.php";
$hote = wp_parse_url(home_url(), PHP_URL_HOST);
if (!in_array($hote, array('localhost', '127.0.0.1'), true) && !preg_match('/\.(localhost|test)$/', $hote)) { fwrite(STDERR, "local sites only ($hote)\n"); exit(1); }
$MAX = (int) ($opt['max'] ?? 0);
set_time_limit(0);

// ---------- Local administrator session ----------
$u = !empty($opt['user']) ? get_user_by('login', $opt['user']) : (get_users(array('role' => 'administrator', 'number' => 1))[0] ?? null);
if (!$u) { fwrite(STDERR, "no local administrator found\n"); exit(1); }
$exp = time() + HOUR_IN_SECONDS;
$jeton = WP_Session_Tokens::get_instance($u->ID)->create($exp);
$jar = tempnam(sys_get_temp_dir(), 'audit');
$l = array('# Netscape HTTP Cookie File');
foreach (array(array(AUTH_COOKIE, 'auth', ADMIN_COOKIE_PATH), array(AUTH_COOKIE, 'auth', PLUGINS_COOKIE_PATH), array(LOGGED_IN_COOKIE, 'logged_in', COOKIEPATH)) as $c) {
    $l[] = implode("\t", array($hote, 'FALSE', $c[2], 'FALSE', $exp, $c[0], wp_generate_auth_cookie($u->ID, $exp, $c[1], $jeton)));
}
file_put_contents($jar, implode("\n", $l) . "\n");
register_shutdown_function(function () use ($jar, $u, $jeton) {
    @unlink($jar);
    WP_Session_Tokens::get_instance($u->ID)->destroy($jeton); // the session dies with the run
});

// ---------- URLs ----------
$urls = array();
foreach (get_posts(array('post_type' => 'page', 'post_status' => 'publish', 'numberposts' => -1)) as $p) { $urls[get_permalink($p)] = 'page'; }
foreach (array('product_cat' => 'category', 'product_tag' => 'tag') as $tx => $g) {
    if (taxonomy_exists($tx)) { foreach (get_terms(array('taxonomy' => $tx, 'hide_empty' => false)) as $t) { $urls[get_term_link($t)] = $g; } }
}
$produits = post_type_exists('product') ? get_posts(array('post_type' => 'product', 'post_status' => 'publish', 'numberposts' => -1, 'fields' => 'ids', 'orderby' => 'ID', 'order' => 'ASC')) : array();
foreach ($produits as $id) { $urls[get_permalink($id)] = 'product'; }
$urls[add_query_arg('s', 'a', home_url('/'))] = 'search';
$urls[add_query_arg('s', 'zzznothing', home_url('/'))] = 'search-empty';
$urls[home_url('/this-page-does-not-exist/')] = '404';
$remplis = array();
if (function_exists('wc_get_page_permalink')) {
    $compte = wc_get_page_permalink('myaccount');
    foreach (array('orders', 'downloads', 'edit-address', 'edit-account') as $ep) { $urls[wc_get_endpoint_url($ep, '', $compte)] = 'account'; }
    if ($produits) {
        $un = $produits[0];
        $remplis[add_query_arg('add-to-cart', $un, wc_get_cart_url())] = 'cart-filled';
        $remplis[wc_get_checkout_url()] = 'checkout-filled';
        if ($p = (int) get_option('wcboost_products_compare_page_id')) { $remplis[add_query_arg('add_to_compare', $un, get_permalink($p))] = 'compare-filled'; }
        if ($p = (int) get_option('wcboost_wishlist_page_id')) { $remplis[add_query_arg('add-to-wishlist', $un, get_permalink($p))] = 'wishlist-filled'; }
    }
}
if (function_exists('dokan_get_store_url')) {
    foreach (get_users(array('role__in' => array('seller', 'administrator'), 'number' => 3)) as $v) { $urls[dokan_get_store_url($v->ID)] = 'vendor-store'; }
}
if ($MAX) { $urls = array_slice($urls, 0, $MAX, true); }

// ---------- Analysis ----------
$EN = '/\b(Add to cart|Add to wishlist|Read more|Select options|View cart|Checkout|Proceed to checkout|Subtotal|Shipping|Billing|Update cart|Apply coupon|Coupon code|Related products|You may also like|Quick view|Sort by|Default sorting|Showing|results|No products|Load more|Show more|View all|Shop now|Buy now|Learn more|Back to top|Recently [Vv]iewed|Browse|Search|Wishlist|Compare|Login|Log in|Register|Sign in|Sign up|Username|Password|Remember me|Lost your password|Forgot|My [Aa]ccount|Dashboard|Downloads|Addresses|Account details|Logout|Log out|Hello|Welcome|Out of stock|In stock|Availability|Quantity|Price|Filter|Categories|Category|Reviews|Additional information|Vendor|Store|Sold by|Brand|Share|Email|Phone|Name|Submit|Send|Close|Previous|Next|Home|Shop|All Categories|Your cart|Cart|empty|Free shipping|Order|Orders|Product|Products|Save|Cancel|Edit|Remove|Update|Continue|Back|Optional|Required|Payment|Place order|Thank you|Page not found|Nothing found|Sorry|Please|Click|here|Rating|Weight|Dimensions|Copy link|Stock status|Uncategorized|Type your message)\b/';
$DEMO = '/Lorem ipsum|demo\.|themeforest|envato|Hello world!|Sample Page|Uncategorized/i';

function analyser($html, $EN, $DEMO) {
    $r = array('title' => '', 'description' => null, 'h1' => array(), 'english' => array(), 'placeholders' => 0, 'demo' => array(), 'img_no_alt' => 0, 'links' => array(), 'images' => array());
    if (preg_match_all($DEMO, $html, $m)) { $r['demo'] = array_values(array_unique($m[0])); }
    $d = new DOMDocument();
    libxml_use_internal_errors(true);
    $d->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NOWARNING | LIBXML_NOERROR);
    libxml_clear_errors();
    $x = new DOMXPath($d);
    $t = $x->query('//title')->item(0); $r['title'] = $t ? trim($t->textContent) : '';
    $md = $x->query('//meta[@name="description"]/@content')->item(0); $r['description'] = $md ? trim($md->nodeValue) : null;
    foreach ($x->query('//*[@id="wpadminbar"]|//script|//style|//noscript|//template') as $n) { $n->parentNode->removeChild($n); }
    foreach ($x->query('//h1') as $h) { $r['h1'][] = trim(preg_replace('/\s+/u', ' ', $h->textContent)); }
    $body = $x->query('//body')->item(0);
    $texte = $body ? preg_replace('/\s+/u', ' ', $body->textContent) : '';
    $r['placeholders'] = preg_match_all('/à préciser|à compléter|à vérifier|to be completed|TBD/u', $texte);
    $vus = array();
    foreach ($x->query('//body//text()[normalize-space()]') as $n) {
        $s = trim(preg_replace('/\s+/u', ' ', $n->nodeValue));
        if (preg_match_all($EN, $s, $m)) { foreach ($m[0] as $mot) { $vus["text|$mot|" . mb_substr($s, 0, 90)] = true; } }
    }
    foreach ($x->query('//*[@aria-label or @placeholder or @title or @alt or ((self::input or self::button) and @value)]') as $e) {
        foreach (array('aria-label', 'placeholder', 'title', 'alt', 'value') as $a) {
            if (!$e->hasAttribute($a)) { continue; }
            if ($a === 'value' && !in_array(strtolower($e->getAttribute('type')), array('submit', 'button', 'reset'), true)) { continue; }
            $s = trim($e->getAttribute($a));
            if ($s !== '' && preg_match_all($EN, $s, $m)) { foreach ($m[0] as $mot) { $vus["$a|$mot|" . mb_substr($s, 0, 90)] = true; } }
        }
    }
    $r['english'] = array_keys($vus);
    foreach ($x->query('//img') as $i) { if (!$i->hasAttribute('alt')) { $r['img_no_alt']++; } }
    foreach ($x->query('//a[@href]') as $a) { $r['links'][] = $a->getAttribute('href'); }
    foreach ($x->query('//img[@src]') as $i) { $r['images'][] = $i->getAttribute('src'); }
    $r['links'] = array_values(array_unique($r['links'])); $r['images'] = array_values(array_unique($r['images']));
    return $r;
}

function poignee($url, $jar, $corps) {
    $c = curl_init($url);
    curl_setopt_array($c, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5, CURLOPT_TIMEOUT => 120,
        CURLOPT_NOBODY => !$corps, CURLOPT_ENCODING => '', CURLOPT_USERAGENT => 'wp-site-build-audit'));
    if ($jar) { curl_setopt($c, CURLOPT_COOKIEFILE, $jar); }
    return $c;
}

// Three requests at a time: a slow local server is not drowned (and is not a load test).
function recuperer(array $liste, $jar, $corps = true, $par = 3) {
    $res = array(); $file = $liste; $actifs = array(); $mh = curl_multi_init();
    while ($file || $actifs) {
        while ($file && count($actifs) < $par) { $url = array_shift($file); $h = poignee($url, $jar, $corps); curl_multi_add_handle($mh, $h); $actifs[(int) $h] = array($h, $url); }
        do { $st = curl_multi_exec($mh, $encours); } while ($st === CURLM_CALL_MULTI_PERFORM);
        curl_multi_select($mh, 1.0);
        while ($info = curl_multi_info_read($mh)) {
            $h = $info['handle']; list(, $url) = $actifs[(int) $h];
            $res[$url] = array('code' => curl_getinfo($h, CURLINFO_RESPONSE_CODE), 'final' => curl_getinfo($h, CURLINFO_EFFECTIVE_URL), 'html' => $corps ? curl_multi_getcontent($h) : '');
            curl_multi_remove_handle($mh, $h); curl_close($h); unset($actifs[(int) $h]);
        }
    }
    curl_multi_close($mh);
    return $res;
}

$t0 = microtime(true);
$rapport = array('date' => wp_date('Y-m-d H:i'), 'site' => home_url('/'), 'urls' => array(), 'broken' => array(), 'visitor' => array());
foreach ($remplis as $url => $g) { // sequential: same session, the cart must be filled before checkout
    $r = recuperer(array($url), $jar, true, 1)[$url];
    $rapport['urls'][$url] = array('template' => $g, 'code' => $r['code'], 'final' => $r['final']) + analyser($r['html'], $EN, $DEMO);
}
fwrite(STDERR, count($urls) . " URLs…\n");
foreach (recuperer(array_keys($urls), $jar) as $url => $r) {
    $rapport['urls'][$url] = array('template' => $urls[$url], 'code' => $r['code'], 'final' => $r['final']) + analyser($r['html'], $EN, $DEMO);
}
$vis = array_filter(array(home_url('/'), function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : null, $produits ? get_permalink($produits[0]) : null));
foreach (recuperer($vis, null) as $url => $r) {
    $a = analyser($r['html'], $EN, $DEMO);
    $rapport['visitor'][$url] = array('code' => $r['code'], 'title' => $a['title'], 'english' => $a['english'], 'coming_soon' => (bool) preg_match('/coming-soon/i', $r['html']));
}
$deja = array(); foreach ($rapport['urls'] as $a) { $deja[strtok($a['final'], '#')] = true; }
$a_verifier = array(); $origine = array();
foreach ($rapport['urls'] as $url => $a) {
    foreach (array_merge($a['links'], $a['images']) as $lien) {
        $lien = html_entity_decode(trim($lien));
        if ($lien === '' || $lien[0] === '#' || preg_match('/^(mailto|tel|javascript|data):/i', $lien)) { continue; }
        $abs = WP_Http::make_absolute_url($lien, $url);
        if (wp_parse_url($abs, PHP_URL_HOST) !== $hote) { continue; }
        // Action links would change state (add to cart, log out…): never followed.
        if (preg_match('/[?&](add-to-cart|add-to-wishlist|add_to_compare|remove_item|undo_item|_wpnonce|action|wc-ajax|replytocom|orderby|min_price|max_price|filter_|rating_filter)=|\/wp-admin\/|customer-logout|\/feed\/|\/wp-json\//', $abs)) { continue; }
        $abs = strtok($abs, '#');
        if (isset($deja[$abs])) { continue; }
        $a_verifier[$abs] = true; $origine[$abs][] = $url;
    }
}
fwrite(STDERR, count($a_verifier) . " internal links and images…\n");
foreach (recuperer(array_keys($a_verifier), $jar, false, 4) as $lien => $r) {
    if ($r['code'] >= 400 || $r['code'] === 0) { $rapport['broken'][] = array('url' => $lien, 'code' => $r['code'], 'on' => array_slice(array_unique($origine[$lien]), 0, 5)); }
}
foreach ($rapport['urls'] as &$a) { unset($a['links'], $a['images']); }
unset($a);

$out = $opt['out'] ?? (sys_get_temp_dir() . '/audit-site-' . wp_date('Y-m-d') . '.json');
file_put_contents($out, wp_json_encode($rapport, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$A = $rapport['urls'];
$codes = array(); foreach ($A as $a) { $codes[$a['code']] = ($codes[$a['code']] ?? 0) + 1; }
printf("%d URLs in %d s · status codes %s\n", count($A), microtime(true) - $t0, json_encode($codes));
foreach ($A as $u2 => $a) { if ($a['code'] != 200 && $a['template'] !== '404') { printf("  %s %s → %s\n", $a['code'], $u2, $a['final']); } }
foreach ($A as $u2 => $a) { if ($a['code'] == 200 && count($a['h1']) !== 1) { printf("  %d h1 on %s %s\n", count($a['h1']), $u2, json_encode($a['h1'], JSON_UNESCAPED_UNICODE)); } }
$sd = array_keys(array_filter($A, fn($a) => !$a['description'] && $a['code'] == 200)); printf("no meta description: %d %s\n", count($sd), json_encode(array_slice($sd, 0, 12)));
foreach ($A as $u2 => $a) { if ($a['demo']) { printf("  demo leftovers on %s: %s\n", $u2, implode(', ', $a['demo'])); } }
$ph = array(); foreach ($A as $a) { if ($a['placeholders']) { $ph[$a['template']] = ($ph[$a['template']] ?? 0) + 1; } }
printf("pages with client placeholders, by template: %s\n", json_encode($ph));
printf("images without alt: %d\n", array_sum(array_column($A, 'img_no_alt')));
$en = array(); foreach ($A as $a) { foreach ($a['english'] as $k) { $en[$k][] = $a['template']; } }
uasort($en, fn($x, $y) => count($y) <=> count($x));
printf("English UI words (distinct): %d\n", count($en));
foreach (array_slice($en, 0, 60, true) as $k => $g) { printf("  %3d × [%s] %s\n", count($g), implode(',', array_slice(array_unique($g), 0, 3)), $k); }
printf("broken internal links/images: %d\n", count($rapport['broken']));
foreach ($rapport['broken'] as $b) { printf("  %s %s (on %s)\n", $b['code'], $b['url'], implode(', ', $b['on'])); }
foreach ($rapport['visitor'] as $u2 => $v) { printf("visitor %s %s — %s%s\n", $v['code'], $u2, $v['title'], $v['coming_soon'] ? ' [coming soon]' : ''); }
echo "report: $out\n";
