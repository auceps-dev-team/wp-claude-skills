#!/usr/bin/env node
/**
 * elementor-data.mjs — write Elementor page data from the mockup, and check it (gate 1 offline).
 *
 * As a module (phase 4, Elementor branch):
 *   import { container, heading, text, image, button, icon, iconList, finalise, resetIds } from './elementor-data.mjs';
 *   resetIds('h');                                   // stable ids per page: replays produce identical JSON
 *   const page = finalise([ container('hero', [ heading('Title', 'h1', 'hero__title'), button('Quote', '@page:quote', 'pill pill--dark') ], { tag: 'section' }) ]);
 *
 *   Only containers and native widgets; the mockup's classes go on them and the theme styles
 *   them (references/elementor.md). Placeholders resolved by the PHP installer at install time,
 *   so a replay on production produces production URLs and media ids:
 *     "@page:<slug>"                   permalink of that page
 *     image({ $file: 'x.jpg' })        id and url of the media imported from the mockup
 *
 * As a CLI (gate 1, before anything reaches WordPress):
 *   node elementor-data.mjs check <page.json>… [--allow eael-contact-form-7] [--format text|json]
 *   Fails (exit 1) on: a widget outside the allow-list (html and shortcode are never allowed),
 *   an image with neither $file nor a numeric id, a duplicate element id, a nested container
 *   not flagged isInner. Notes, without failing, a [shortcode] inside a text widget: allowed
 *   for a generated legal document (a cookie policy), never for layout.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/* ------------------------------------------------------------------ builders */
let counter = 0, prefix = 'a';
/** Ids only need to be unique within a page; a per-page prefix keeps them stable across runs. */
export function resetIds(p) { counter = 0; prefix = String(p); }
const nid = () => (prefix + (counter++).toString(36)).padStart(7, '0').slice(-7);
const link = (url) => (url ? { url, is_external: /^https?:/.test(url) ? 'on' : '', nofollow: '', custom_attributes: '' } : undefined);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
const fr = (n) => ({ unit: 'fr', size: n, sizes: [] });

/**
 * Container. opts: row (flex row; column again on mobile unless rowMobile), wrap, grid (columns),
 * gridTablet, gridMobile, tag (section, header…), url (container as a link), settings (raw extras).
 * Responsive values are Elementor settings, so the client sees and edits them in the panel.
 */
export function container(classes, children, opts = {}) {
  const s = { content_width: 'full', css_classes: classes };
  if (opts.row) {
    s.flex_direction = 'row';
    if (opts.rowTablet === false) s.flex_direction_tablet = 'column';
    if (opts.rowMobile !== true) s.flex_direction_mobile = 'column';
    if (opts.wrap) s.flex_wrap = 'wrap';
  }
  if (opts.grid) {
    s.container_type = 'grid';
    s.grid_columns_grid = fr(opts.grid);
    s.grid_columns_grid_tablet = fr(opts.gridTablet || Math.min(opts.grid, 2));
    s.grid_columns_grid_mobile = fr(opts.gridMobile || Math.min(opts.grid, 2));
    s.grid_rows_grid = fr(1);
  }
  if (opts.tag) s.html_tag = opts.tag;
  if (opts.url) { s.html_tag = 'a'; s.link = link(opts.url); }
  return { id: nid(), elType: 'container', isInner: false, settings: clean({ ...s, ...(opts.settings || {}) }), elements: children.filter(Boolean) };
}
const widget = (type, settings) => ({ id: nid(), elType: 'widget', widgetType: type, isInner: false, settings: clean(settings), elements: [] });
export const heading = (html, tag, classes, url) => widget('heading', { title: html, header_size: tag, _css_classes: classes, link: link(url) });
export const text = (html, classes) => widget('text-editor', { editor: html, _css_classes: classes });
export const image = (file, alt, classes, url) => widget('image', {
  image: { url: '', id: '', alt, source: 'library', $file: file }, image_size: 'full',
  _css_classes: classes, link_to: url ? 'custom' : undefined, link: link(url),
});
/** icon: { value: 'fas fa-arrow-right', library: 'fa-solid' } — Font Awesome ships with Elementor. */
export const button = (label, url, classes, iconSpec, after = true) => widget('button', {
  text: label, link: link(url), _css_classes: classes, selected_icon: iconSpec, icon_align: iconSpec ? (after ? 'row-reverse' : 'row') : undefined,
});
export const icon = (iconSpec, classes) => widget('icon', { selected_icon: iconSpec, _css_classes: classes });
export const iconList = (items, classes, inline) => widget('icon-list', {
  view: inline ? 'inline' : undefined, _css_classes: classes,
  icon_list: items.map(([label, iconSpec]) => ({ _id: nid(), text: label, selected_icon: iconSpec })),
});
/** Flag nested containers as isInner, as the editor does when it saves. */
export function finalise(elements, depth = 0) {
  for (const e of elements) { e.isInner = depth > 0 && e.elType === 'container'; finalise(e.elements, depth + 1); }
  return elements;
}

/* ------------------------------------------------------------------ check (gate 1 offline) */
const BASE_ALLOW = ['heading', 'text-editor', 'image', 'button', 'icon', 'icon-list'];

export function check(elements, allow = BASE_ALLOW) {
  const failures = [], notes = [], counts = {}, ids = new Set();
  const walk = (els, depth) => {
    for (const e of els) {
      if (ids.has(e.id)) failures.push(`duplicate element id ${e.id}`);
      ids.add(e.id);
      if (e.elType === 'container' && e.isInner !== (depth > 0)) failures.push(`container ${e.id}: isInner should be ${depth > 0}`);
      if (e.elType === 'widget') {
        const t = e.widgetType;
        counts[t] = (counts[t] || 0) + 1;
        if (t === 'html' || t === 'shortcode' || !allow.includes(t)) failures.push(`widget not allowed: ${t} (${e.id})`);
        if (t === 'image') {
          const img = e.settings?.image || {};
          if (!img.$file && !(Number(img.id) > 0)) failures.push(`image ${e.id} has neither $file nor a media id`);
        }
        if (t === 'text-editor' && /\[[a-z][\w-]*[\s\]]/i.test(e.settings?.editor || '')) notes.push(`shortcode in text widget ${e.id} (only for a generated document)`);
      }
      walk(e.elements || [], depth + 1);
    }
  };
  walk(elements, 0);
  return { failures, notes, counts };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h') || args[0] !== 'check') {
    console.log('usage: node elementor-data.mjs check <page.json>… [--allow widget,widget] [--format text|json]\n'
      + 'Gate 1 offline on generated Elementor data. Also a module: container, heading, text, image, button, icon, iconList, finalise, resetIds.');
    return args.includes('--help') || args.includes('-h') ? 0 : 2;
  }
  const opt = { allow: '', format: 'text' }; const files = [];
  for (let i = 1; i < args.length; i++) { if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i]; else files.push(args[i]); }
  const allow = [...BASE_ALLOW, ...opt.allow.split(',').map((s) => s.trim()).filter(Boolean)];
  const report = []; let failed = 0;
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const els = Array.isArray(j) ? j : (j.elementor || j.content || []);
    const r = check(els, allow);
    if (r.failures.length) failed++;
    report.push({ file: f, ...r });
  }
  if (opt.format === 'json') console.log(JSON.stringify({ files: report.length, failed, report }, null, 1));
  else {
    const total = {};
    for (const r of report) {
      for (const [k, v] of Object.entries(r.counts)) total[k] = (total[k] || 0) + v;
      for (const x of r.failures) console.log(`FAIL  ${r.file}: ${x}`);
      for (const x of r.notes) console.log(`note  ${r.file}: ${x}`);
    }
    console.log(`${report.length} file(s), widgets ${JSON.stringify(total)}, ${failed ? `${failed} failing` : 'gate 1 passed'}`);
  }
  return failed ? 1 : 0;
}

// process.argv[1] is undefined when imported from `node -e` (measured: pathToFileURL threw).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(2); });
