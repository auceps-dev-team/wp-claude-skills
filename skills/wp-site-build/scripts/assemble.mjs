#!/usr/bin/env node
/**
 * assemble.mjs — build every mockup page from one <head>, header and footer (phase 3).
 *
 *   node assemble.mjs [mockup-dir] [--format text|json]
 *
 * Reads <mockup-dir>/source, writes <mockup-dir>/site:
 *
 *   source/head.html       the page frame, with tokens:
 *                          {{title}} {{class}} {{banner}} {{header}} {{content}} {{footer}}
 *   source/parts/*.html    header.html, footer.html, optional banner.html — ONE source each
 *   source/pages/*.html    first line: <!-- file: about.html | title: About · Brand | class: page-about | menu: About -->
 *
 * Header and footer therefore come out byte-identical on every page; in phase 4
 * they become parts/header.html and parts/footer.html.
 *
 * `menu` names the header entry to mark as current. The header marks its
 * entries with data-menu="About" on the <li>; the script adds class
 * "is-current" to that <li> and aria-current="page" to its first link. It fails
 * when the entry does not exist, so a renamed menu item cannot silently lose its
 * active state. It also fails on any token left unreplaced.
 *
 * Exit 0 = pages written, 1 = a page is malformed, 2 = bad invocation.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node assemble.mjs [mockup-dir] [--format text|json]\nBuilds <dir>/site/*.html from <dir>/source (head.html, parts/, pages/).');
  process.exit(0);
}
const fmtIdx = args.indexOf('--format');
const format = fmtIdx >= 0 ? args[fmtIdx + 1] : 'text';
const dir = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--format') || '.');

const SOURCE = path.join(dir, 'source');
const SITE = path.join(dir, 'site');

for (const need of ['head.html', 'parts', 'pages']) {
  if (!fs.existsSync(path.join(SOURCE, need))) {
    console.error(`error: ${path.join(SOURCE, need)} is missing`);
    process.exit(2);
  }
}
fs.mkdirSync(SITE, { recursive: true });

const read = (p) => fs.readFileSync(path.join(SOURCE, p), 'utf8');
const head = read('head.html');
const parts = Object.fromEntries(
  fs.readdirSync(path.join(SOURCE, 'parts'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => [path.basename(f, '.html'), read('parts/' + f).trimEnd()]),
);
for (const p of ['header', 'footer']) {
  if (parts[p] === undefined) { console.error(`error: source/parts/${p}.html is missing`); process.exit(2); }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const written = [];
const errors = [];

for (const f of fs.readdirSync(path.join(SOURCE, 'pages')).filter((x) => x.endsWith('.html')).sort()) {
  const raw = read('pages/' + f);
  const m = raw.match(/^<!--(.*?)-->\r?\n/);
  if (!m) { errors.push(`${f}: first-line metadata comment is missing`); continue; }
  const meta = Object.fromEntries(
    m[1].split('|').map((s) => s.split(':')).map(([k, ...v]) => [k.trim(), v.join(':').trim()]),
  );
  if (!meta.file || !meta.title) { errors.push(`${f}: "file" and "title" are required`); continue; }

  let header = parts.header;
  if (meta.menu) {
    const li = new RegExp(`<li([^>]*?)\\sdata-menu="${escapeRe(meta.menu)}"([^>]*)>`);
    const hit = header.match(li);
    if (!hit) { errors.push(`${f}: menu entry "${meta.menu}" not found in the header (data-menu)`); continue; }
    const start = hit.index;
    let tag = hit[0];
    tag = /\sclass="/.test(tag) ? tag.replace(/\sclass="/, ' class="is-current ') : tag.replace('<li', '<li class="is-current"');
    header = header.slice(0, start) + tag + header.slice(start + hit[0].length);
    const aAt = header.indexOf('<a ', start);
    if (aAt >= 0) header = header.slice(0, aAt) + '<a aria-current="page" ' + header.slice(aAt + 3);
  }

  const html = head
    .replace('{{title}}', () => meta.title)
    .replace('{{class}}', () => meta.class || '')
    .replace('{{banner}}', () => parts.banner || '')
    .replace('{{header}}', () => header)
    .replace('{{footer}}', () => parts.footer)
    .replace('{{content}}', () => raw.slice(m[0].length).trimEnd());

  const left = html.match(/\{\{\w+\}\}/);
  if (left) { errors.push(`${f}: token ${left[0]} was not replaced`); continue; }
  fs.writeFileSync(path.join(SITE, meta.file), html);
  written.push(meta.file);
}

if (format === 'json') {
  console.log(JSON.stringify({ written, errors }, null, 2));
} else {
  console.log(`${written.length} page(s) assembled: ${written.join(', ')}`);
  for (const e of errors) console.log(`ERROR  ${e}`);
}
process.exit(errors.length ? 1 : 0);
