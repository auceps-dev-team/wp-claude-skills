<?php
/**
 * wp-core-update.php — finish a WordPress core update from the CLI when the web request keeps dying.
 *
 *   php scripts/wp-core-update.php --wp=/path/to/wordpress [--version=7.1.5]      core update, official package
 *   php scripts/wp-core-update.php --wp=/path/to/wordpress --db                   database upgrade only, NEW process
 *
 * Measured on XAMPP/Windows, 18/11/2026: the automatic minor update ran in an Apache request (cron), put the site in
 * maintenance (WP_Automatic_Updater enables it BEFORE upgrading, since 6.6) and died on "Maximum execution time of 300
 * seconds exceeded" in update-core.php, during the md5 check of the current files — before copying anything. On Windows
 * PHP counts wall-clock time. The site stayed in maintenance for ten minutes, and the next attempt would have done the
 * same, or worse, died half-way through the copy.
 * update_core() imposes set_time_limit(300) itself. This tool lifts it at every step through the update_feedback filter,
 * which update_core() calls before the file check and before the copy — no PHP function disabled — and times each step.
 * The same update from the CLI took 93 s (download + unzip 55 s, check 12 s, copy 6 s).
 * BEFORE: back up the database. AFTER: php scripts/wp-core-verify.php (official checksums). CLI only, localhost only.
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
$opt = getopt('', array('wp:', 'version:', 'db'));
// Not "$wp": WordPress keeps its main object in the global $wp, and wp-settings.php would find a string there.
$racine_wp = rtrim($opt['wp'] ?? getcwd(), '/\\');
if (!is_file("$racine_wp/wp-load.php")) { fwrite(STDERR, "usage: php wp-core-update.php --wp=/path/to/wordpress [--version=X.Y.Z] [--db]\n"); exit(2); }
define('WP_USE_THEMES', false);
define('DISABLE_WP_CRON', true);
require "$racine_wp/wp-load.php";
$hote = wp_parse_url(home_url(), PHP_URL_HOST);
if (!in_array($hote, array('localhost', '127.0.0.1'), true) && !preg_match('/\.(localhost|test)$/', $hote)) { fwrite(STDERR, "local sites only ($hote)\n"); exit(1); }
require_once ABSPATH . 'wp-admin/includes/admin.php';
require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
$admin = get_users(array('role' => 'administrator', 'number' => 1))[0] ?? null;
if ($admin) { wp_set_current_user($admin->ID); }
global $wp_version, $wp_db_version;

if (isset($opt['db'])) { // a new process: the one that copied the files still holds the old $wp_db_version
    $avant = (int) get_option('db_version');
    if ($avant === (int) $wp_db_version) { printf("database already up to date (%d)\n", $avant); exit(0); }
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    wp_upgrade();
    wp_cache_delete('db_version', 'options');
    printf("database: %d → %d\n", $avant, (int) get_option('db_version'));
    exit((int) get_option('db_version') === (int) $wp_db_version ? 0 : 1);
}

$t0 = microtime(true);
// Priority 1: before the upgrader skin, which hooks the same filter and returns nothing.
add_filter('update_feedback', function ($m) use ($t0) {
    if (function_exists('set_time_limit')) { set_time_limit(0); }
    if (is_string($m) && $m !== '') { printf("[%6.1f s] %s\n", microtime(true) - $t0, html_entity_decode(wp_strip_all_tags($m), ENT_QUOTES, 'UTF-8')); }
    return $m;
}, 1);

wp_version_check(array(), true);
$voulue = $opt['version'] ?? null;
$offre = null;
foreach ((array) get_core_updates() as $o) {
    if ('upgrade' === $o->response && get_locale() === $o->locale && (!$voulue || $voulue === $o->current)) { $offre = $o; break; }
}
if (!$offre) { printf("no %supdate offered for %s (installed: %s)\n", $voulue ? "$voulue " : '', get_locale(), $wp_version); exit(1); }
printf("installed %s · offered %s (%s)\npackage %s\n", $wp_version, $offre->current, $offre->locale, $offre->download);
$skin = new Automatic_Upgrader_Skin();
$res = (new Core_Upgrader($skin))->upgrade($offre, array('pre_check_md5' => false, 'attempt_rollback' => true, 'clear_update_cache' => true));
printf("[%6.1f s] done\n", microtime(true) - $t0);
if (is_wp_error($res)) {
    printf("FAILED: %s — %s\n%s\n", $res->get_error_code(), $res->get_error_message(), implode("\n", array_map('wp_strip_all_tags', $skin->get_upgrade_messages())));
    exit(1);
}
$src = file_get_contents(ABSPATH . WPINC . '/version.php');
preg_match('/^\$wp_version\s*=\s*\'([^\']+)\'/m', $src, $v);
preg_match('/^\$wp_db_version\s*=\s*(\d+)/m', $src, $d);
printf("version.php %s · database expected %s, stored %s · maintenance %s\n", $v[1] ?? '?', $d[1] ?? '?', get_option('db_version'), file_exists(ABSPATH . '.maintenance') ? 'STILL ON' : 'off');
if (($d[1] ?? '') !== (string) get_option('db_version')) { echo "→ run again with --db\n"; }
