#!/usr/bin/env node
/**
 * capture-elements.mjs — screenshots of ELEMENTS of served pages, at full resolution, optionally hovered.
 *
 *   node scripts/capture-elements.mjs <spec.json> <out-dir> [--cookies session.json]
 *
 * spec.json: [{ "name", "url", "width" (1366), "height" (900), "selector", "margin" (16), "hover": "<selector>",
 *               "admin": true|false, "js": "<code run before the capture>" }]
 * Why: a browser pane inside an app scales a 1366 px page to ~500 px — a 1 px border, an underline or a 6 px gap
 * cannot be judged there. This captures the element itself, 1:1. Fixed overlays (admin bar, consent banner, admin-only
 * notices) are hidden first; with "hover", the capture stays inside the viewport, because capturing beyond it resizes
 * the page and the hover is lost (measured: the hover buttons of a product card vanished).
 * Cookies are cleared between entries, so "admin": false really is a visitor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './capture.mjs';

const args = process.argv.slice(2);
if (args.length < 2) { console.error('usage: node capture-elements.mjs <spec.json> <out-dir> [--cookies session.json]'); process.exit(2); }
const [specFile, outDir] = args;
const i = args.indexOf('--cookies');
const cookies = i > -1 ? JSON.parse(fs.readFileSync(args[i + 1], 'utf8')) : null;
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const b = await launch();
let missing = 0;
try {
  for (const s of spec) {
    const width = s.width || 1366, height = s.height || 900, margin = s.margin ?? 16;
    await b.send('Network.clearBrowserCookies');
    await b.goto(s.url, { width, height, cookies: s.admin ? cookies : null });
    await b.evaluate(`(() => { const st = document.createElement('style'); st.textContent = '.cmplz-cookiebanner, .cmplz-soft-cookiewall, #wpadminbar, .woocommerce-store-notice, #coming-soon-footer-banner { display: none !important; }'; document.head.appendChild(st); return 1; })()`);
    if (s.js) await b.evaluate(`(async () => { ${s.js} })()`);
    if (s.hover) {
      const p = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(s.hover)}); if (!e) return null;
        e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (p) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await new Promise((r) => setTimeout(r, 900)); }
    }
    const r = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(s.selector)}); if (!e) return null; const r = e.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, pageW: document.documentElement.scrollWidth }; })()`);
    if (!r || !r.w || !r.h) { console.log(`${s.name.padEnd(34)} not found: ${s.selector}`); missing++; continue; }
    const x = Math.max(0, r.x - margin), y = Math.max(0, r.y - margin);
    const w = Math.min(r.pageW - x, r.w + 2 * margin), h = r.h + 2 * margin;
    const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !s.hover, clip: { x, y, width: w, height: h, scale: 1 } });
    fs.writeFileSync(path.join(outDir, `${s.name}.png`), Buffer.from(shot.data, 'base64'));
    console.log(`${s.name.padEnd(34)} ${Math.round(w)} × ${Math.round(h)} px  (${width} px, ${s.admin ? 'administrator' : 'visitor'})`);
  }
} finally { await b.close(); }
process.exit(missing ? 1 : 0);
