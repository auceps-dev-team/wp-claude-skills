<?php
/**
 * wp-core-verify.php — every core file against the official checksums (api.wordpress.org), like
 * `wp core verify-checksums`, for the installed version AND locale ($wp_local_package in version.php).
 *
 *   php scripts/wp-core-verify.php --wp=/path/to/wordpress
 *
 * Reports matching / different / missing files outside wp-content, and files in wp-admin and wp-includes that are not in
 * the official list (left over from an older version, or added). Exit 1 if a file differs or is missing.
 * Run it BEFORE an update too: it tells a half-updated core from a clean one. Measured 18/11/2026: after a dead automatic
 * update, 3 338/3 338 files still matched 7.1.4 — the only file rewritten (update-core.php) is identical in 7.1.5.
 * Reads version.php from disk, not the global: a process that has just updated still holds the old value.
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
$opt = getopt('', array('wp:'));
// Not "$wp": WordPress keeps its main object in the global $wp, and wp-settings.php would find a string there.
$racine_wp = rtrim($opt['wp'] ?? getcwd(), '/\\');
if (!is_file("$racine_wp/wp-load.php")) { fwrite(STDERR, "usage: php wp-core-verify.php --wp=/path/to/wordpress\n"); exit(2); }
define('WP_USE_THEMES', false);
define('DISABLE_WP_CRON', true);
require "$racine_wp/wp-load.php";
require_once ABSPATH . 'wp-admin/includes/update.php';
$src = file_get_contents(ABSPATH . WPINC . '/version.php');
preg_match('/^\$wp_version\s*=\s*\'([^\']+)\'/m', $src, $v);
preg_match('/^\$wp_local_package\s*=\s*\'([^\']+)\'/m', $src, $l);
$version = $v[1] ?? ''; $locale = $l[1] ?? 'en_US';
$sums = get_core_checksums($version, $locale);
if (!is_array($sums) || !$sums) { fwrite(STDERR, "no official checksums for $version / $locale\n"); exit(2); }
$ok = 0; $diff = array(); $missing = array(); $n = 0; $t0 = microtime(true);
foreach ($sums as $f => $md5) {
    if (0 === strpos($f, 'wp-content/')) { continue; }
    $n++;
    if (!file_exists(ABSPATH . $f)) { $missing[] = $f; continue; }
    if (md5_file(ABSPATH . $f) === $md5) { $ok++; } else { $diff[] = $f; }
}
$extra = array();
foreach (array('wp-admin', 'wp-includes') as $dir) {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(ABSPATH . $dir, FilesystemIterator::SKIP_DOTS)) as $f) {
        if (!$f->isFile()) { continue; }
        $rel = str_replace('\\', '/', substr($f->getPathname(), strlen(ABSPATH)));
        if (!isset($sums[$rel])) { $extra[] = $rel; }
    }
}
$liste = fn(array $a) => $a ? "\n    " . implode("\n    ", array_slice($a, 0, 20)) : '';
printf("WordPress %s (%s) — %d official files outside wp-content, checked in %.1f s\n  matching: %d\n  different: %d%s\n  missing: %d%s\n  extra in wp-admin/wp-includes: %d%s\n",
    $version, $locale, $n, microtime(true) - $t0, $ok, count($diff), $liste($diff), count($missing), $liste($missing), count($extra), $liste($extra));
exit(($diff || $missing) ? 1 : 0);
