#!/usr/bin/env node
/**
 * audit-render.mjs — pre-launch pass, part 2: one URL per template, rendered at 1366 and 390 px.
 *
 *   node scripts/audit-render.mjs <list.json> <out-dir> --cookies session.json [--accent "#F59005"] [--widths 1366,390]
 *
 * list.json: [{ "name", "url" }], visited in order in ONE browser profile — put "?add-to-cart=<id>" on the cart URL and
 * the checkout after it, and both are audited filled. session.json: the cookies of tools/test-session.php
 * (references/elementor.md, "Editor gates without a password"); delete it after the run.
 *
 * Per page and width: horizontal overflow, broken images, JavaScript errors (window.onerror, console.error, rejected
 * promises — recorded from before the first script runs), text in the accent colour (--accent: the colour the register
 * forbids as text on light backgrounds), text contrast under 4.5:1 (3:1 when large), and a full-page screenshot capped
 * at 9 000 px for reading. Admin bar, consent banner and admin-only notices are hidden before measuring.
 *
 * Measured false positives (Farmart + Dokan store, 19/11/2026) — triage them, do not "fix" them:
 *  - a visually-hidden element (clip on its PARENT, e.g. the site title next to a logo) is reported as visible;
 *  - slick dots (buttons with font-size 0) report a 1:1 contrast;
 *  - contrast over a semi-transparent overlay (rgba 0.65 black on a banner) is computed against the colour under it;
 *  - a WooCommerce cart/checkout BLOCK can still show its skeleton when captured: it fetches the Store API after load,
 *    and a slow local server answers after the screenshot. Check it in a real browser before reporting it;
 *  - a slick carousel can come out empty in a full-page capture while it renders in a real browser.
 * Real defects found the same day by reading the screenshots, which no measure flagged: text clipped on the left on
 * phones only (theme grid with negative margins inside an Elementor container), "Next" written vertically (fixed-width
 * pagination), white text on a light banner photo (demo colours kept after the image was replaced).
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './capture.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : d; };
if (args.length < 2 || args[0].startsWith('--')) { console.error('usage: node audit-render.mjs <list.json> <out-dir> --cookies session.json [--accent "#F59005"] [--widths 1366,390]'); process.exit(2); }
const [listFile, outDir] = args;
const cookies = opt('cookies') ? JSON.parse(fs.readFileSync(opt('cookies'), 'utf8')) : null;
const accent = (opt('accent', '') || '').replace('#', '');
const accentRgb = accent.length === 6 ? `rgb(${parseInt(accent.slice(0, 2), 16)}, ${parseInt(accent.slice(2, 4), 16)}, ${parseInt(accent.slice(4, 6), 16)})` : '';
const widths = opt('widths', '1366,390').split(',').map(Number);
const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const SPY = `(() => { window.__err = []; const p = (m) => window.__err.push(String(m).slice(0, 200));
  window.addEventListener('error', (e) => p('error: ' + (e.message || (e.target && (e.target.src || e.target.href)) || '?')), true);
  window.addEventListener('unhandledrejection', (e) => p('promise: ' + (e.reason && e.reason.message || e.reason)));
  const ce = console.error; console.error = function (...a) { p('console: ' + a.map(String).join(' ')); return ce.apply(this, a); }; })();`;

const MEASURE = `(() => {
  const st = document.createElement('style'); st.textContent = '#wpadminbar, .cmplz-cookiebanner, #coming-soon-footer-banner, .woocommerce-store-notice { display: none !important; } html { margin-top: 0 !important; }'; document.head.appendChild(st);
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const rgb = (s) => { const m = s.match(/[\\d.]+/g); return m ? m.map(Number) : null; };
  const bg = (e) => { while (e && e !== document.documentElement) { const c = getComputedStyle(e); if (c.backgroundImage !== 'none') return null; const b = rgb(c.backgroundColor); if (b && (b.length < 4 || b[3] > .9)) return b; e = e.parentElement; } return [255, 255, 255]; };
  const visible = (e) => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; const c = getComputedStyle(e); return c.visibility !== 'hidden' && +c.opacity > .1; };
  const out = { width: innerWidth, overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), broken_images: [], accent_text: [], low_contrast: [] };
  document.querySelectorAll('img').forEach((i) => { if (i.complete && i.naturalWidth === 0 && visible(i)) out.broken_images.push((i.currentSrc || i.src).split('/').slice(-2).join('/')); });
  const seen = new Set();
  document.querySelectorAll('body *').forEach((e) => {
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !visible(e)) return;
    const c = getComputedStyle(e); if (c.clipPath === 'inset(50%)' || c.clip === 'rect(1px, 1px, 1px, 1px)') return;
    const t = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').slice(0, 50);
    const f = rgb(c.color); const b = bg(e); if (!f || !b) return;
    const a = f.length > 3 ? f[3] : 1; const fg = f.slice(0, 3).map((v, k) => v * a + b[k] * (1 - a));
    const l1 = lum(...fg), l2 = lum(...b.slice(0, 3)); const ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
    const size = parseFloat(c.fontSize), bold = +c.fontWeight >= 700; const large = size >= 24 || (bold && size >= 18.66);
    const key = e.tagName + '.' + String(e.className).trim().split(/\\s+/).slice(0, 2).join('.') + ' « ' + t + ' »';
    if (seen.has(key)) return; seen.add(key);
    if (${JSON.stringify(accentRgb)} && c.color === ${JSON.stringify(accentRgb)}) out.accent_text.push(key);
    if (ratio < (large ? 3 : 4.5)) out.low_contrast.push(ratio.toFixed(2) + ' ' + c.color + ' on rgb(' + b.slice(0, 3).join(', ') + ') ' + size + 'px ' + key);
  });
  out.js_errors = window.__err || [];
  out.height = document.documentElement.scrollHeight;
  return out;
})()`;

const b = await launch();
const res = {};
try {
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
  let first = true;
  for (const w of widths) {
    for (const p of list) {
      await b.goto(p.url, { width: w, height: w < 768 ? 844 : 900, cookies: first ? cookies : null });
      first = false;
      const m = await b.evaluate(MEASURE);
      const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(m.height, 9000), scale: 1 } });
      fs.writeFileSync(path.join(outDir, `${p.name}-${w}.png`), Buffer.from(shot.data, 'base64'));
      res[`${p.name}-${w}`] = { url: p.url, ...m };
      const pb = [m.overflow && `overflows by ${m.overflow} px`, m.broken_images.length && `${m.broken_images.length} broken image(s)`,
        m.js_errors.length && `${m.js_errors.length} JS error(s)`, m.accent_text.length && `${m.accent_text.length} accent-coloured text(s)`,
        m.low_contrast.length && `${m.low_contrast.length} low contrast(s)`].filter(Boolean);
      console.log(`${(p.name + '-' + w).padEnd(30)} ${pb.length ? pb.join(' · ') : 'nothing to report'}`);
    }
  }
} finally { await b.close(); }
fs.writeFileSync(path.join(outDir, 'audit-render.json'), JSON.stringify(res, null, 1));
console.log(`report: ${path.join(outDir, 'audit-render.json')} — then read every screenshot (scripts/contact-sheet.php)`);
