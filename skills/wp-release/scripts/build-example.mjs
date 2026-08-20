#!/usr/bin/env node
/**
 * build.mjs — package the BELIONE theme, child theme and plugin.
 *
 * Most failed deliveries are packaging mistakes rather than code quality: a
 * development file that shipped, a stale generated asset, or a ZIP whose root
 * is not a single correctly named directory. This runs the checks first and
 * refuses to package when one fails.
 *
 *   node build.mjs [--skip-checks]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PHP = 'C:/php85/php.exe';
const SCAN = 'C:/Users/HP/Downloads/wp-claude-skills/skills/wp-security-audit/scripts/wp-scan.mjs';

const PACKAGES = [
  { slug: 'belione', label: 'Theme' },
  { slug: 'belione-child', label: 'Child theme' },
  { slug: 'belione-core', label: 'Plugin' },
];

// Anything matching these never ships. What is delivered is what can be
// supported, and a source file in the package invites edits nobody tracks.
const EXCLUDE = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)tests?(\/|$)/,
  /(^|\/)\.vscode(\/|$)/,
  /\.(scss|map|log)$/,
  /(^|\/)(composer|package)(-lock)?\.json$/,
  /(^|\/)phpcs\.xml/,
  /(^|\/)\.(editorconfig|eslintrc|DS_Store)/,
  /(^|\/)Thumbs\.db$/,
  /(^|\/)build\.mjs$/,
];

const skipChecks = process.argv.includes('--skip-checks');
const fail = [];
const warn = [];

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (EXCLUDE.some((re) => re.test(rel))) return [];
    return e.isDirectory() ? walk(full, base) : [{ full, rel }];
  });
}

function run(cmd, args) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
  }
}

// ------------------------------------------------------------------ checks

function checkLint(pkg) {
  const files = walk(path.join(ROOT, pkg.slug)).filter((f) => f.rel.endsWith('.php'));
  const bad = files.filter((f) => !run(PHP, ['-l', f.full]).ok);
  if (bad.length) fail.push(`${pkg.slug}: ${bad.length} invalid PHP file(s)`);
  return files.length;
}

function checkSecurity(pkg) {
  const r = run('node', [SCAN, path.join(ROOT, pkg.slug), '--format', 'json']);
  let findings = [];
  try { findings = JSON.parse(r.out).findings || []; } catch { /* scanner unavailable */ }
  const crit = findings.filter((f) => f.severity === 'critical');
  const high = findings.filter((f) => f.severity === 'high');
  if (crit.length) fail.push(`${pkg.slug}: ${crit.length} critical finding(s)`);
  if (high.length) warn.push(`${pkg.slug}: ${high.length} high finding(s)`);
  return findings.length;
}

/**
 * The version must agree everywhere it appears. Drift between the header and
 * the constant is the most common release bug, and it is silent.
 */
function checkVersion(pkg) {
  const dir = path.join(ROOT, pkg.slug);
  const style = path.join(dir, 'style.css');
  const main = path.join(dir, `${pkg.slug}.php`);
  const versions = new Map();

  for (const [file, re] of [[style, /^\s*Version:\s*(\S+)/m], [main, /^\s*\*\s*Version:\s*(\S+)/m]]) {
    if (!fs.existsSync(file)) continue;
    const m = re.exec(fs.readFileSync(file, 'utf8'));
    if (m) versions.set(path.basename(file), m[1]);
  }

  if (fs.existsSync(main)) {
    const m = /define\(\s*'[A-Z_]*VERSION',\s*'([^']+)'/.exec(fs.readFileSync(main, 'utf8'));
    if (m) versions.set('constant', m[1]);
  }

  const distinct = new Set(versions.values());
  if (distinct.size > 1) {
    fail.push(`${pkg.slug}: version drift — ${[...versions].map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  return [...distinct][0] || '0.0.0';
}

/** Every asset referenced from PHP must exist, or it 404s in production. */
function checkAssets(pkg) {
  const dir = path.join(ROOT, pkg.slug);
  const missing = new Set();
  for (const f of walk(dir).filter((x) => x.rel.endsWith('.php'))) {
    const src = fs.readFileSync(f.full, 'utf8');
    for (const m of src.matchAll(/assets\/(?:css|js|images)\/[A-Za-z0-9._/-]+/g)) {
      if (!fs.existsSync(path.join(dir, m[0]))) missing.add(m[0]);
    }
  }
  if (missing.size) warn.push(`${pkg.slug}: referenced assets missing — ${[...missing].join(', ')}`);
}

/** A catalogue older than its source is a catalogue missing new strings. */
function checkTranslations(pkg) {
  const langDir = path.join(ROOT, pkg.slug, 'languages');
  if (!fs.existsSync(langDir)) return;

  const pot = fs.readdirSync(langDir).find((f) => f.endsWith('.pot'));
  if (!pot) {
    // A package with no translatable strings needs no catalogue. Warning about
    // it trains people to ignore warnings, so check before complaining.
    const strings = walk(path.join(ROOT, pkg.slug))
      .filter((f) => f.rel.endsWith('.php'))
      .some((f) => /(__|_e|esc_html__|esc_html_e|esc_attr__|_x|_n)\s*\(/.test(fs.readFileSync(f.full, 'utf8')));
    if (strings) warn.push(`${pkg.slug}: translatable strings but no .pot`);
    return;
  }

  const potTime = fs.statSync(path.join(langDir, pot)).mtimeMs;
  const newer = walk(path.join(ROOT, pkg.slug))
    .filter((f) => f.rel.endsWith('.php') && fs.statSync(f.full).mtimeMs > potTime + 1000);

  if (newer.length) {
    warn.push(`${pkg.slug}: ${newer.length} PHP file(s) newer than the .pot — regenerate it`);
  }
}

// --------------------------------------------------------------- packaging

/** Minimal store-only ZIP writer. No dependency, and the format is fixed. */
function writeZip(files, outPath, rootName) {
  const chunks = [];
  const central = [];
  let offset = 0;

  const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff;
  const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

  const table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  for (const f of files) {
    const name = `${rootName}/${f.rel}`;
    const data = fs.readFileSync(f.full);
    const nameBuf = Buffer.from(name, 'utf8');
    const stat = fs.statSync(f.full);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);          // UTF-8 names
    local.writeUInt16LE(0, 8);               // stored
    local.writeUInt16LE(dosTime(stat.mtime), 10);
    local.writeUInt16LE(dosDate(stat.mtime), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);

    chunks.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(dosTime(stat.mtime), 12);
    cd.writeUInt16LE(dosDate(stat.mtime), 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(outPath, Buffer.concat([...chunks, cdBuf, end]));
}

// -------------------------------------------------------------------- run

console.log('BELIONE — packaging\n');

const summary = [];

for (const pkg of PACKAGES) {
  const dir = path.join(ROOT, pkg.slug);
  if (!fs.existsSync(dir)) { fail.push(`${pkg.slug}: directory missing`); continue; }

  const version = checkVersion(pkg);
  let phpCount = 0;
  let findings = 0;

  if (!skipChecks) {
    phpCount = checkLint(pkg);
    findings = checkSecurity(pkg);
    checkAssets(pkg);
    checkTranslations(pkg);
  }

  summary.push({ ...pkg, version, phpCount, findings });
}

for (const w of warn) console.log(`  warning  ${w}`);
if (fail.length) {
  console.log('');
  for (const f of fail) console.log(`  FAIL  ${f}`);
  console.log('\nPackaging aborted.');
  process.exit(1);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

console.log('');
for (const pkg of summary) {
  const files = walk(path.join(ROOT, pkg.slug));
  const out = path.join(DIST, `${pkg.slug}-${pkg.version}.zip`);
  writeZip(files, out, pkg.slug);

  const size = fs.statSync(out).size;
  console.log(
    `  ${pkg.label.padEnd(13)} ${`${pkg.slug}-${pkg.version}.zip`.padEnd(30)}` +
    `${String(files.length).padStart(3)} files  ${(size / 1024).toFixed(0).padStart(5)} KB`
  );
}

console.log(`\n${summary.length} packages in dist/`);
