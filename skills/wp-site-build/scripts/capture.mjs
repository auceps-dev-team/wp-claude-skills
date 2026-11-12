#!/usr/bin/env node
/**
 * capture.mjs — screenshots and in-page measurements through headless Chrome and the
 * DevTools protocol. Zero dependencies (Node 22+ for the global WebSocket).
 *
 *   node capture.mjs <url> [--out dir] [--width 1440] [--slice 1000] [--name capture]
 *                    [--before <js>] [--eval <js>] [--measure] [--cookies file.json]
 *                    [--chrome path] [--format text|json]
 *
 *   default      full page in slices of --slice px: <name>-<width>-01.png, -02.png…
 *   --measure    no screenshot: page height and horizontal overflow; exit 1 if overflow > 0
 *   --eval <js>  no screenshot: evaluate the expression (may be async) and print its JSON
 *   --before     expression run before capturing (open a mega menu, a drawer…)
 *   --cookies    JSON array of cookies set before navigating (editor checks, see gate5)
 *
 * Why not the IDE's embedded browser: when its pane is hidden it returns stale frames, and
 * some panes refuse http://localhost:80 (measured on the services build, November 2026).
 * Below 768 px the device is emulated as a touch phone.
 *
 * Also a module: `launch()` returns { goto, evaluate, screenshot, cookies, close }, used by
 * gate3.mjs, gate4.mjs and gate5-elementor.mjs.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome(explicit) {
  const candidates = [explicit, process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  return candidates.find((c) => fs.existsSync(c)) || null;
}

/** Start a throwaway Chrome (fresh profile, deleted on close) and attach to its first tab. */
export async function launch({ chrome, startTimeoutMs = 30000 } = {}) {
  if (typeof WebSocket === 'undefined') throw new Error(`Node 22+ is needed (global WebSocket); this is ${process.version}`);
  const bin = findChrome(chrome);
  if (!bin) throw new Error('no Chrome found: pass --chrome or set CHROME');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-'));
  const proc = spawn(bin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  let port;
  // A loaded machine (two local sites, a migration running) took up to ~20 s to open the port.
  for (const t0 = Date.now(); !port && Date.now() - t0 < startTimeoutMs; await sleep(100)) {
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {}
  }
  if (!port) { proc.kill(); throw new Error('Chrome did not open its DevTools port'); }
  const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map(); const events = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else if (msg.method) events.push(msg.method);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  await send('Page.enable');
  await send('Network.enable');

  return {
    send, evaluate,
    /** Navigate, then make every image load: lazy ones far below the fold never do on their own. */
    async goto(url, { width = 1440, height = 900, cookies = null, loadTimeoutMs = 120000 } = {}) {
      const mobile = width < 768;
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      // Chrome rejects maxTouchPoints 0 ("must be between 1 and 16"): send it only to enable touch.
      await send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      if (cookies) await send('Network.setCookies', { cookies: cookies.map((c) => ({ httpOnly: true, ...c })) });
      events.length = 0;
      await send('Page.navigate', { url });
      for (const t0 = Date.now(); !events.includes('Page.loadEventFired') && Date.now() - t0 < loadTimeoutMs; ) await sleep(100);
      // Measured: switching loading="lazy" to "eager" was not enough, images far down stayed grey
      // in full-page shots until the page was scrolled through.
      await evaluate(`(async () => {
        document.documentElement.style.scrollBehavior = 'auto';
        document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; });
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
        scrollTo(0, 0);
        await Promise.race([
          Promise.all([...document.images].map(i => (i.complete && i.naturalWidth) ? 0 : new Promise(r => { i.onload = i.onerror = r; }))),
          new Promise(r => setTimeout(r, 15000)),
        ]);
        return 1;
      })()`);
      await sleep(1000);
    },
    async screenshot(file, { y = 0, width, height }) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y, width, height, scale: 1 } });
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    },
    async cookies() { return (await send('Network.getAllCookies')).cookies; },
    async close() {
      try { ws.close(); } catch {}
      proc.kill();
      await sleep(300);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    },
  };
}

/* ------------------------------------------------------------------ CLI */
function parse(argv) {
  const o = { out: 'captures', width: 1440, slice: 1000, name: 'capture', format: 'text', _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--measure') o.measure = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  o.width = Number(o.width); o.slice = Number(o.slice);
  return o;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log('usage: node capture.mjs <url> [--out dir] [--width 1440] [--slice 1000] [--name capture]\n'
      + '                        [--before js] [--eval js] [--measure] [--cookies file.json] [--chrome path] [--format text|json]\n'
      + 'Full-page screenshots in slices, or in-page measurements (--measure, --eval), through headless Chrome.');
    process.exit(args.length ? 0 : 2);
  }
  const o = parse(args);
  const url = o._[0];
  const b = await launch({ chrome: o.chrome });
  try {
    const cookies = o.cookies ? JSON.parse(fs.readFileSync(o.cookies, 'utf8')) : null;
    await b.goto(url, { width: o.width, height: o.slice, cookies });
    if (o.eval) { console.log(JSON.stringify(await b.evaluate(o.eval), null, o.format === 'json' ? 0 : 1)); return 0; }
    if (o.before) { await b.evaluate(o.before); await sleep(600); }
    const total = await b.evaluate('document.documentElement.scrollHeight');
    const overflow = await b.evaluate('document.documentElement.scrollWidth - innerWidth');
    const files = [];
    if (!o.measure) {
      fs.mkdirSync(o.out, { recursive: true });
      for (let y = 0, k = 1; y < total; y += o.slice, k++) {
        const f = path.join(o.out, `${o.name}-${o.width}-${String(k).padStart(2, '0')}.png`);
        await b.screenshot(f, { y, width: o.width, height: Math.min(o.slice, total - y) });
        files.push(f);
      }
    }
    const res = { url, width: o.width, height: total, overflow, files };
    console.log(o.format === 'json' ? JSON.stringify(res) : `${url} @${o.width}px: ${total}px tall, overflow ${overflow}px${files.length ? `, ${files.length} slice(s) in ${o.out}` : ''}`);
    return o.measure && overflow > 0 ? 1 : 0;
  } finally { await b.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(2); });
}
