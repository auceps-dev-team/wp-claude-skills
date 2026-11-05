#!/usr/bin/env node
/**
 * fetch-fonts.mjs — self-host Google Fonts for a theme (phase 4).
 *
 *   node fetch-fonts.mjs "<fonts.googleapis.com css2 URL>" <out-dir> [--format text|json]
 *
 * Downloads the stylesheet Google serves to a current browser (woff2 only),
 * every .woff2 it references, and writes <out-dir>/fonts.css pointing at the
 * local files. Enqueue that file in functions.php and pass it to
 * add_editor_style() so the editor composes in the real typeface.
 *
 * Why: loading fonts from fonts.googleapis.com sends each visitor's IP address
 * to Google, which a German court held to require consent under GDPR
 * (LG München I, 20.01.2022, 3 O 17493/20). Self-hosted fonts need no consent
 * and no entry in the cookie policy.
 *
 * Node 18+ (global fetch). Exit 0 = written, 1 = download failed, 2 = bad invocation.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.filter((a) => !a.startsWith('--')).length < 2) {
  console.log('usage: node fetch-fonts.mjs "<https://fonts.googleapis.com/css2?family=…>" <out-dir> [--format text|json]');
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 2);
}
const fmtIdx = args.indexOf('--format');
const format = fmtIdx >= 0 ? args[fmtIdx + 1] : 'text';
const [cssUrl, outDir] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--format');

let url;
try { url = new URL(cssUrl); } catch { console.error(`error: not a URL: ${cssUrl}`); process.exit(2); }
if (url.hostname !== 'fonts.googleapis.com') {
  console.error('error: expected a fonts.googleapis.com URL');
  process.exit(2);
}

// Google serves woff2 with unicode-range subsets only to browsers it recognises.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(u, binary) {
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${u}`);
  return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
}

try {
  const css = await get(url.href, false);
  fs.mkdirSync(outDir, { recursive: true });

  // Each @font-face block is preceded by a /* subset */ comment.
  const faces = [...css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g)];
  if (!faces.length) throw new Error('no @font-face in the response — check the family names in the URL');

  const files = [];
  let out = `/* Self-hosted fonts (SIL Open Font License), downloaded ${new Date().toISOString().slice(0, 10)}\n   from ${url.href}\n   No request to Google from visitors. */\n`;
  let i = 0;
  for (const [, subset = 'all', body] of faces) {
    const family = (body.match(/font-family:\s*'([^']+)'/) || [])[1] || 'font';
    const style = (body.match(/font-style:\s*(\w+)/) || [])[1] || 'normal';
    const weight = ((body.match(/font-weight:\s*([\d ]+)/) || [])[1] || '400').trim().replace(/\s+/g, '-');
    const src = (body.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
    if (!src) continue;
    const name = `${family.toLowerCase().replace(/\s+/g, '-')}-${style}-${weight}-${subset}-${i++}.woff2`;
    fs.writeFileSync(path.join(outDir, name), await get(src, true));
    files.push(name);
    out += `/* ${subset} */\n@font-face {${body.replace(/url\(https:[^)]+\.woff2\)/, `url(${name})`)}}\n`;
  }
  fs.writeFileSync(path.join(outDir, 'fonts.css'), out);

  if (format === 'json') console.log(JSON.stringify({ css: path.join(outDir, 'fonts.css'), files }, null, 2));
  else console.log(`${files.length} font file(s) and fonts.css written to ${outDir}`);
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
