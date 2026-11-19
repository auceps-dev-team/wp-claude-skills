<?php
/**
 * contact-sheet.php — pre-launch pass, part 3: put the full-page screenshots of audit-render.mjs side by side, so a
 * person (or the agent) reads EVERY template at both widths in a dozen images instead of sixty.
 *
 *   php scripts/contact-sheet.php <list.json> <dir> <width> [per sheet] [column px] [max height]
 *   e.g. php scripts/contact-sheet.php list.json shots 1366 3 600 3600   ·   ... shots 390 6 300 4200
 *
 * Reads <dir>/<name>-<width>.png for every name of list.json, writes <dir>/sheets/<width>-NN.png. Needs GD.
 * Text is too small to proofread on a sheet — the measures of audit-render.mjs cover text; the sheet is for layout:
 * clipped blocks, vertical text, empty carousels, unreadable banners, a missing space where a <br> is hidden on phones.
 */
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
if ($argc < 4 || !extension_loaded('gd')) { fwrite(STDERR, "usage: php contact-sheet.php <list.json> <dir> <width> [per sheet=3] [column=600] [max height=3600] (GD required)\n"); exit(2); }
[$_, $liste, $dir, $w] = $argv;
$n = (int) ($argv[4] ?? 3); $col = (int) ($argv[5] ?? 600); $hmax = (int) ($argv[6] ?? 3600);
ini_set('memory_limit', '1024M');
$noms = array_column(json_decode(file_get_contents($liste), true), 'name');
@mkdir("$dir/sheets");
foreach (array_chunk($noms, $n) as $k => $lot) {
    $imgs = array(); $h = 0;
    foreach ($lot as $nom) {
        $f = "$dir/$nom-$w.png";
        if (!is_file($f)) { fwrite(STDERR, "missing $f\n"); continue; }
        $im = imagecreatefrompng($f); $r = $col / imagesx($im); $hh = min((int) (imagesy($im) * $r), $hmax);
        $imgs[] = array($nom, $im, $r, $hh); $h = max($h, $hh);
    }
    if (!$imgs) { continue; }
    $out = imagecreatetruecolor(count($imgs) * ($col + 12), $h + 22);
    imagefill($out, 0, 0, imagecolorallocate($out, 120, 120, 120));
    foreach ($imgs as $i => [$nom, $im, $r, $hh]) {
        imagecopyresampled($out, $im, $i * ($col + 12), 22, 0, 0, $col, $hh, imagesx($im), (int) ($hh / $r));
        imagestring($out, 4, $i * ($col + 12) + 4, 3, $nom, imagecolorallocate($out, 255, 255, 255));
    }
    $f = sprintf('%s/sheets/%s-%02d.png', $dir, $w, $k + 1);
    imagepng($out, $f);
    echo "$f : ", implode(', ', array_column($imgs, 0)), "\n";
}
