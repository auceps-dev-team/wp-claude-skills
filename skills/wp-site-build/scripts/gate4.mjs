#!/usr/bin/env node
/**
 * gate4.mjs — acceptance gate 4: pixel fidelity, measured. Same components, mockup vs site.
 *
 *   node gate4.mjs <mockup-url> <site-url> --sel ".hero,.card,.footer" [--width 1440] [--tolerance 2]
 *                  [--site-prefix js-] [--chrome path] [--format text|json]
 *   node gate4.mjs <mockup-url> <site-url> --sel-file selectors.json
 *
 * selectors.json is either an array of selectors, looked up unchanged on both pages, or an object of
 * pairs { "<mockup selector>": "<site selector>" } for a build where the site keeps another
 * theme's markup (references/third-party-theme.md, "What the gates become"): the mockup's
 * .hero__title is the site's .js-hero .elementor-heading-title. The mockup selector stays the key
 * in the report and in --ignore, so the criterion does not move when the site's markup does.
 * A pair whose value is "" or null falls back to the rule below.
 *
 * --site-prefix js- covers the common case without a pair: every class of a mockup selector is
 * looked up on the site with that prefix (.hero__title → .js-hero__title, ".card .price" →
 * ".js-card .js-price"). An explicit pair always wins over the prefix.
 *
 * A selector found on neither page is a failure, not a pass: a typo in a pair would otherwise
 * make the gate green while measuring nothing.
 *
 * Criterion (references/acceptance.md): page height within ±tolerance px, no component off by
 * more than ±tolerance px, no diverging computed property. Exit 1 otherwise.
 *
 * Works on a block theme and on Elementor alike. On Elementor the class sits on the widget's
 * div, which carries the layout, while the text lives in an inner element: geometry is read on
 * the class holder, typography on .elementor-heading-title, and a button is measured on its
 * link (.elementor-button), which is what the mockup's <a> became.
 *
 * --ignore "selector:property,…" accepts a divergence you have explained; it is printed as
 * accepted, never hidden. The usual one on Elementor: a section container is always flex
 * (display "block"→"flex"), with no geometric effect when every position matches.
 */
import fs from 'node:fs';
import { launch } from './capture.mjs';

const args = process.argv.slice(2);
if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
  console.log('usage: node gate4.mjs <mockup-url> <site-url> --sel ".a,.b" | --sel-file f.json [--site-prefix js-] [--width 1440] [--tolerance 2] [--ignore ".a:display"] [--chrome path] [--format text|json]\n'
    + 'Gate 4: geometry and computed styles of the same components on mockup and site. Exit 1 on any divergence.\n'
    + 'f.json: ["<selector>", …] (same selector on both pages) or {"<mockup selector>": "<site selector>", …} (pairs).');
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 2);
}
const opt = { width: 1440, tolerance: 2, format: 'text' };
const pos = [];
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i]; else pos.push(args[i]); }
const [mockup, site] = pos;
const raw = opt['sel-file'] ? JSON.parse(fs.readFileSync(opt['sel-file'], 'utf8')) : String(opt.sel || '').split(',').map((s) => s.trim()).filter(Boolean);
// Site selector for a mockup selector with no explicit pair: itself, or every class prefixed.
const PREFIX = opt['site-prefix'] ? String(opt['site-prefix']) : '';
// A class that already carries the prefix is left as it is (no ".js-js-").
const onSite = (s) => (PREFIX ? s.replace(/\.(-?[_a-zA-Z][\w-]*)/g, (m, c) => (c.startsWith(PREFIX) ? m : `.${PREFIX}${c}`)) : s);
// PAIRS: [mockup selector (the key), site selector].
const PAIRS = Array.isArray(raw) ? raw.map((s) => [s, onSite(s)])
  : raw && typeof raw === 'object' ? Object.entries(raw).map(([k, v]) => [k, v ? String(v) : onSite(k)])
  : [];
if (!PAIRS.length) { console.error('give the selectors to compare: --sel or --sel-file (an array, or an object of pairs)'); process.exit(2); }
const SEL = PAIRS.map(([k]) => k);
const SITE = Object.fromEntries(PAIRS);
const TOL = Number(opt.tolerance);
const IGNORE = new Set(String(opt.ignore || '').split(',').map((x) => x.trim()).filter(Boolean));
const accepted = [];
// The properties of references/acceptance.md, gate 4, plus borderRadius.
const P = ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor',
  'display', 'gridTemplateColumns', 'gap', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'borderRadius'];
const TYPO = ['fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing', 'color'];

// The same measurement on both pages; results are keyed by the mockup selector, the element is
// found with the selector of that side.
const expr = (lookup) => `(() => {
  const LOOKUP = ${JSON.stringify(lookup)}, P = ${JSON.stringify(P)}, TYPO = ${JSON.stringify(TYPO)};
  const out = {};
  for (const [key, s] of LOOKUP) {
    const e0 = document.querySelector(s); if (!e0) { out[key] = null; continue; }
    const button = e0.classList.contains('elementor-widget-button') && e0.querySelector('.elementor-button');
    const inner = button || (e0.classList.contains('elementor-widget-heading') && e0.querySelector('.elementor-heading-title')) || e0;
    const box = button || e0;
    // Margins stay on the class holder: on Elementor the button's spacing is on the widget div.
    const cb = getComputedStyle(box), ct = getComputedStyle(inner), cm = getComputedStyle(e0), r = box.getBoundingClientRect();
    out[key] = Object.fromEntries([['x', Math.round(r.x)], ['y', Math.round(r.y + scrollY)], ['w', Math.round(r.width)], ['h', Math.round(r.height)],
      ...P.map(p => [p, (TYPO.includes(p) ? ct : p.startsWith('margin') ? cm : cb)[p]])]);
  }
  out.__page = document.documentElement.scrollHeight;
  return out;
})()`;

const b = await launch({ chrome: opt.chrome });
let a, s;
try {
  await b.goto(mockup, { width: Number(opt.width) }); a = await b.evaluate(expr(PAIRS.map(([k]) => [k, k])));
  await b.goto(site, { width: Number(opt.width) }); s = await b.evaluate(expr(PAIRS));
} finally { await b.close(); }

// gap "normal" is 0 on flex and grid containers and inert on a block, and Elementor writes 0px on
// every container (measured, 12/11/2026): compare them as equal. Multi-column layouts, where
// normal is 1em, are not measured here.
const same = (p, v) => (p === 'gap' && typeof v === 'string' ? v.replace(/\bnormal\b/g, '0px') : v);

const diffs = [];
if (Math.abs(a.__page - s.__page) > TOL) diffs.push({ sel: '(page)', what: [`height ${a.__page}→${s.__page}`] });
for (const sel of SEL) {
  if (!a[sel] && !s[sel]) { diffs.push({ sel, what: ['found on neither page'] }); continue; }
  if (!a[sel] || !s[sel]) { diffs.push({ sel, what: [`only on the ${a[sel] ? 'mockup' : 'site'}`] }); continue; }
  const w = [];
  for (const k of ['x', 'y', 'w', 'h']) if (Math.abs(a[sel][k] - s[sel][k]) > TOL) w.push(`${k} ${a[sel][k]}→${s[sel][k]}`);
  for (const p of P) if (same(p, a[sel][p]) !== same(p, s[sel][p])) {
    const d = `${p} "${a[sel][p]}"→"${s[sel][p]}"`;
    if (IGNORE.has(`${sel}:${p}`)) accepted.push(`${sel}: ${d}`); else w.push(d);
  }
  if (w.length) diffs.push({ sel, what: w });
}
// A paired selector is shown with its site counterpart, so the reader sees what was compared.
const label = (sel) => (SITE[sel] && SITE[sel] !== sel ? `${sel} (site: ${SITE[sel]})` : sel);
if (opt.format === 'json') console.log(JSON.stringify({ mockupHeight: a.__page, siteHeight: s.__page, pairs: SITE, diffs, accepted }, null, 1));
else {
  console.log(`page height: mockup ${a.__page} · site ${s.__page} · ${s.__page - a.__page} px`);
  console.log(diffs.length ? diffs.map((d) => `${d.sel === '(page)' ? d.sel : label(d.sel)}: ${d.what.join('; ')}`).join('\n') : `no difference beyond ${TOL} px and no diverging property`);
  for (const x of accepted) console.log(`accepted (--ignore): ${x}`);
}
process.exit(diffs.length ? 1 : 0);
