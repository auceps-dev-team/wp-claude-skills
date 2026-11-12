#!/usr/bin/env node
/**
 * gate3.mjs — acceptance gate 3: rendering logged out, every page, one browser session.
 *
 *   node gate3.mjs <url> [<url>…] [--width 390] [--font "Open Sans"] [--chrome path] [--format text|json]
 *
 * Per page, in a fresh profile (an anonymous visitor):
 *   horizontal overflow (must be 0), images that failed or are empty, the font really applied,
 *   any stylesheet from a font CDN, <title> / meta description / h1 counts, and the cookies
 *   the visitor holds after the page — read from the browser's cookie store, HttpOnly included.
 * Exit 1 if any page fails.
 *
 * Pass FULL URLs. Measured on Windows Git Bash (November 2026): root-relative paths such as
 * /site/about/ are rewritten to C:/Program Files/Git/site/about/ before Node sees them, and
 * every page then "renders" empty.
 */
import { launch } from './capture.mjs';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  console.log('usage: node gate3.mjs <url> [<url>…] [--width 390] [--font "Open Sans"] [--chrome path] [--format text|json]\n'
    + 'Gate 3: overflow, images, font, font CDN, title/description/h1 and visitor cookies on every page. Exit 1 on failure.');
  process.exit(args.length ? 0 : 2);
}
const opt = { width: 390, font: '', chrome: undefined, format: 'text' };
const urls = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i]; else urls.push(args[i]);
}
const bad = urls.filter((u) => !/^https?:\/\//.test(u));
if (bad.length) { console.error(`not a full URL: ${bad.join(', ')}`); process.exit(2); }

const MEASURE = `(() => ({
  overflow: document.documentElement.scrollWidth - innerWidth,
  images: document.images.length,
  brokenImages: [...document.images].filter(i => !(i.complete && i.naturalWidth)).map(i => i.src.split('/').pop()).slice(0, 3),
  font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, ''),
  fontCdn: document.querySelectorAll('link[href*="fonts.googleapis"], link[href*="fonts.gstatic"], link[href*="use.typekit"]').length,
  titles: document.querySelectorAll('title').length,
  descriptions: document.querySelectorAll('meta[name="description"]').length,
  h1: document.querySelectorAll('h1').length,
}))()`;

const results = [];
const b = await launch({ chrome: opt.chrome });
let seen = new Set();
try {
  for (const url of urls) {
    try {
      await b.goto(url, { width: Number(opt.width), height: 844 });
      const m = await b.evaluate(MEASURE);
      const now = (await b.cookies()).map((c) => c.name);
      m.newCookies = now.filter((n) => !seen.has(n));
      seen = new Set(now);
      const problems = [];
      if (m.overflow > 0) problems.push(`overflow ${m.overflow}px`);
      if (m.brokenImages.length) problems.push(`broken images: ${m.brokenImages.join(', ')}`);
      if (opt.font && m.font !== opt.font) problems.push(`font ${m.font}`);
      if (m.fontCdn) problems.push(`${m.fontCdn} font CDN stylesheet(s)`);
      if (m.titles !== 1) problems.push(`${m.titles} <title>`);
      if (m.h1 !== 1) problems.push(`${m.h1} h1`);
      if (m.descriptions > 1) problems.push(`${m.descriptions} meta descriptions`);
      if (m.newCookies.length) problems.push(`cookies set: ${m.newCookies.join(', ')}`);
      results.push({ url, ok: !problems.length, problems, ...m });
    } catch (e) { results.push({ url, ok: false, problems: [`not measured: ${e.message.slice(0, 80)}`] }); }
    if (opt.format !== 'json') {
      const r = results.at(-1);
      console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${url}${r.images !== undefined ? ` · ${r.images} images${r.descriptions ? '' : ' · no meta description'}` : ''}${r.problems.length ? ' · ' + r.problems.join('; ') : ''}`);
    }
  }
} finally { await b.close(); }

const failed = results.filter((r) => !r.ok).length;
if (opt.format === 'json') console.log(JSON.stringify({ pages: results.length, failed, results }, null, 1));
else console.log(failed ? `${failed} of ${results.length} page(s) failed` : `gate 3 passed on ${results.length} page(s)`);
process.exit(failed ? 1 : 0);
