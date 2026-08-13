#!/usr/bin/env node
/**
 * wp-detect.mjs — fingerprint a WordPress theme or plugin before working on it.
 *
 * Answers the questions you need before touching an unfamiliar codebase:
 * what kind of project is this, what generation of WordPress architecture, what
 * prefix does it use, where do options live, which page builder does it target,
 * and what has to be rebuilt when you change a source file.
 *
 * Zero dependencies. Node 18+.
 *
 *   node wp-detect.mjs <path> [--format text|json|md]
 */

import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', '.svn', '__pycache__']);

// ---------------------------------------------------------------------------

function walk(root, { exts = null, max = 20000 } = {}) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < max) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(full);
      } else if (!exts || exts.some((x) => e.name.endsWith(x))) {
        out.push(full);
      }
    }
  }
  return out;
}

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const exists = (root, ...rel) => fs.existsSync(path.join(root, ...rel));
const rel = (root, p) => path.relative(root, p).replace(/\\/g, '/');

/** Parse a WordPress file header block (style.css or the plugin main file). */
function parseHeader(src) {
  const head = src.slice(0, 4000);
  const fields = {};
  const keys = [
    'Theme Name', 'Plugin Name', 'Theme URI', 'Plugin URI', 'Author', 'Author URI',
    'Description', 'Version', 'License', 'Text Domain', 'Domain Path', 'Template',
    'Requires at least', 'Requires PHP', 'Tested up to', 'Tags', 'Network',
  ];
  for (const k of keys) {
    const m = new RegExp(`^[\\s*#]*${k}\\s*:\\s*(.+)$`, 'im').exec(head);
    if (m) fields[k] = m[1].trim();
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function detectKind(root) {
  if (exists(root, 'style.css') && /Theme Name\s*:/i.test(read(path.join(root, 'style.css')))) {
    const h = parseHeader(read(path.join(root, 'style.css')));
    return { kind: h.Template ? 'child-theme' : 'theme', header: h, headerFile: 'style.css' };
  }
  // Plugin: a PHP file in the root carrying a Plugin Name header.
  for (const f of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    if (!f.endsWith('.php')) continue;
    const src = read(path.join(root, f));
    if (/^[\s*#]*Plugin Name\s*:/im.test(src.slice(0, 4000))) {
      return { kind: 'plugin', header: parseHeader(src), headerFile: f };
    }
  }
  return { kind: 'unknown', header: {}, headerFile: null };
}

function detectThemeGeneration(root) {
  const hasThemeJson = exists(root, 'theme.json');
  const hasBlockTemplates = exists(root, 'templates') &&
    fs.existsSync(path.join(root, 'templates')) &&
    fs.readdirSync(path.join(root, 'templates')).some((f) => f.endsWith('.html'));
  const hasIndexPhp = exists(root, 'index.php');
  const hasClassicTemplates = ['single.php', 'archive.php', 'page.php', 'header.php', 'footer.php']
    .filter((f) => exists(root, f)).length;

  if (hasBlockTemplates && hasThemeJson) {
    return {
      generation: 'block (FSE)',
      detail: 'Block templates in templates/*.html with theme.json. Editing happens in the Site Editor; PHP templates are not the source of truth.',
    };
  }
  if (hasThemeJson && hasClassicTemplates >= 3) {
    return {
      generation: 'hybrid',
      detail: 'Classic PHP templates plus theme.json. theme.json controls editor settings and global styles; layout still comes from PHP. Changes may need to be made in both places.',
    };
  }
  if (hasClassicTemplates >= 3 || hasIndexPhp) {
    return {
      generation: 'classic',
      detail: 'PHP template hierarchy. No theme.json, so editor settings come from add_theme_support() calls.',
    };
  }
  return { generation: 'unknown', detail: '' };
}

// Verb-ish first segments that appear at the head of ordinary function names
// and are never a project prefix.
const NON_PREFIX = new Set([
  'wp', 'is', 'get', 'the', 'do', 'add', 'has', 'set', 'my', 'render', 'column',
  'enqueue', 'print', 'load', 'save', 'update', 'delete', 'register', 'display',
  'output', 'build', 'make', 'check', 'filter', 'admin', 'ajax', 'autocomplete',
  'portfolio', 'post', 'page', 'user', 'theme', 'custom', 'default', 'init',
]);

/**
 * Find the project's namespace convention. Procedural themes prefix functions
 * (`swm_`, `stratego_`); OOP themes prefix classes (`Insight_`, `TM_`) and have
 * almost no prefixed global functions, so looking only at functions misses them
 * entirely.
 */
function detectPrefix(root, phpFiles) {
  const fnCounts = new Map();
  const clsCounts = new Map();
  const constCounts = new Map();

  for (const f of phpFiles.slice(0, 500)) {
    const src = read(f);
    for (const m of src.matchAll(/\bfunction\s+([a-z][a-z0-9]*)_[a-z0-9_]+\s*\(/gi)) {
      const p = m[1].toLowerCase();
      if (NON_PREFIX.has(p)) continue;
      fnCounts.set(p, (fnCounts.get(p) || 0) + 1);
    }
    for (const m of src.matchAll(/\bclass\s+([A-Za-z][A-Za-z0-9]*)_[A-Za-z0-9_]+/g)) {
      const p = m[1];
      if (NON_PREFIX.has(p.toLowerCase())) continue;
      clsCounts.set(p, (clsCounts.get(p) || 0) + 1);
    }
    for (const m of src.matchAll(/\bdefine\s*\(\s*['"]([A-Z][A-Z0-9]*)_[A-Z0-9_]+['"]/g)) {
      constCounts.set(m[1], (constCounts.get(m[1]) || 0) + 1);
    }
  }

  const top = (map, kind) => [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([prefix, n]) => ({ prefix, count: n, kind }));

  return [
    ...top(fnCounts, 'functions'),
    ...top(clsCounts, 'classes'),
    ...top(constCounts, 'constants'),
  ].sort((a, b) => b.count - a.count).slice(0, 5);
}

const OPTION_SYSTEMS = [
  ['Kirki', /Kirki::add_(field|section|panel)|class-kirki|kirki_/i,
    'Kirki toolkit wrapping the Customizer. Fields are declared as arrays; output rules can generate CSS automatically.'],
  ['Redux Framework', /Redux::setSection|ReduxFramework|redux_/i,
    'Redux options framework. Options live in a single serialized option row.'],
  ['CMB2', /new_cmb2_box|CMB2_/i, 'CMB2 for metaboxes and option pages.'],
  ['Meta Box', /rwmb_meta|rwmb_meta_boxes/i, 'Meta Box plugin for custom fields.'],
  ['ACF', /get_field\s*\(|acf_add_local_field_group/i, 'Advanced Custom Fields.'],
  ['Customizer (core)', /\$wp_customize->add_(setting|section|control)/,
    'Core Customizer API used directly.'],
  ['Settings API', /register_setting\s*\(|add_settings_field/,
    'Core Settings API with admin option pages.'],
];

function detectOptions(root, phpFiles) {
  const found = [];
  const joined = phpFiles.slice(0, 600).map(read).join('\n');
  for (const [name, re, note] of OPTION_SYSTEMS) {
    if (re.test(joined)) found.push({ system: name, note });
  }
  // A custom framework: a getter used pervasively that is not one of the above.
  const getter = /function\s+(\w+_get_(?:theme_)?option)\s*\(/.exec(joined);
  if (getter) {
    const uses = (joined.match(new RegExp(`\\b${getter[1]}\\s*\\(`, 'g')) || []).length;
    if (uses > 20) {
      found.unshift({
        system: `Custom options layer — ${getter[1]}()`,
        note: `Theme-specific accessor used ${uses}+ times. Read its definition before changing any option: it usually layers defaults, per-section overrides and caching on top of get_theme_mod/get_option.`,
      });
    }
  }
  return found;
}

const BUILDERS = [
  ['Elementor', /elementor\/|elementor_|did_action\(\s*['"]elementor\/loaded/i],
  ['WPBakery (Visual Composer)', /vc_map\s*\(|WPBakery|js_composer|vc_lean_map/i],
  ['Gutenberg / block editor', /register_block_type|block\.json|enqueue_block_editor_assets/i],
  ['Beaver Builder', /FLBuilder/],
  ['Divi', /et_builder|ET_Builder/],
  ['Bricks', /bricks\/|\bBricks\\/],
  ['Oxygen', /oxygen_vsb|ct_builder/i],
];

function detectBuilders(root, phpFiles) {
  const joined = phpFiles.slice(0, 600).map(read).join('\n');
  const out = [];
  for (const [name, re] of BUILDERS) if (re.test(joined)) out.push(name);
  return out;
}

function detectBuildChain(root) {
  const notes = [];
  const files = walk(root, { exts: ['.scss', '.less', '.map', '.json', '.js'], max: 6000 });
  const scss = files.filter((f) => f.endsWith('.scss'));
  const maps = files.filter((f) => f.endsWith('.css.map'));
  const minified = walk(root, { exts: ['.css', '.js'] }).filter((f) => /[-.]min\.(css|js)$/.test(f));

  if (scss.length) {
    notes.push({
      tool: 'Sass',
      detail: `${scss.length} .scss source files${maps.length ? ` with ${maps.length} sourcemaps` : ''}. The .css files are build output — editing them directly will be overwritten on the next compile.`,
      entrypoints: scss.filter((f) => !path.basename(f).startsWith('_')).slice(0, 8).map((f) => rel(root, f)),
    });
  }
  if (minified.length) {
    notes.push({
      tool: 'Minification',
      detail: `${minified.length} pre-minified assets shipped alongside their sources. Themes that do this usually pick between them with a runtime option — grep for the enqueue to find the toggle, and remember to regenerate BOTH variants.`,
      entrypoints: minified.slice(0, 6).map((f) => rel(root, f)),
    });
  }
  for (const [file, tool] of [
    ['package.json', 'npm'], ['webpack.config.js', 'webpack'], ['gulpfile.js', 'gulp'],
    ['vite.config.js', 'Vite'], ['composer.json', 'Composer'], ['.nvmrc', 'nvm'],
    ['phpcs.xml', 'PHPCS'], ['phpcs.xml.dist', 'PHPCS'], ['.eslintrc.json', 'ESLint'],
  ]) {
    if (exists(root, file)) notes.push({ tool, detail: `${file} present.`, entrypoints: [file] });
  }
  if (exists(root, 'package.json')) {
    try {
      const pkg = JSON.parse(read(path.join(root, 'package.json')));
      if (pkg.scripts) {
        notes.push({ tool: 'npm scripts', detail: Object.keys(pkg.scripts).join(', '), entrypoints: [] });
      }
    } catch { /* malformed package.json is itself worth knowing but not fatal */ }
  }
  return notes;
}

function detectI18n(root, phpFiles) {
  const out = {};
  const langDir = ['languages', 'lang', 'i18n'].find((d) => exists(root, d));
  if (langDir) {
    const files = fs.readdirSync(path.join(root, langDir));
    out.directory = langDir;
    out.pot = files.filter((f) => f.endsWith('.pot'));
    out.translations = files.filter((f) => f.endsWith('.po') || f.endsWith('.mo')).length;
  }
  out.wpml = exists(root, 'wpml-config.xml');
  const joined = phpFiles.slice(0, 400).map(read).join('\n');
  out.polylang = /class_exists\s*\(\s*['"]Polylang['"]|pll_/.test(joined);
  out.rtl = walk(root, { exts: ['.css'] }).some((f) => /(^|[-/])rtl.*\.css$/i.test(rel(root, f)));
  const domains = [...new Set((joined.match(/__\(\s*['"][^'"]*['"]\s*,\s*['"]([\w-]+)['"]/g) || [])
    .map((s) => (/,\s*['"]([\w-]+)['"]/.exec(s) || [])[1]).filter(Boolean))];
  out.textDomainsUsed = domains.slice(0, 5);
  return out;
}

function detectRegistrations(root, phpFiles) {
  const joined = phpFiles.slice(0, 800).map(read).join('\n');
  const grab = (re) => [...new Set([...joined.matchAll(re)].map((m) => m[1]))];

  // Nav menu locations only make sense inside a register_nav_menus() call —
  // matching `'key' => __( 'Menu' )` anywhere in the file picks up every
  // unrelated options array in the theme.
  const menus = new Set();
  for (const m of joined.matchAll(/register_nav_menus?\s*\(/g)) {
    // Read only to the matching close paren — a fixed character window spills
    // into the next wp_nav_menu() call and collects its argument keys.
    let depth = 0;
    let end = m.index;
    for (let i = m.index + m[0].length - 1; i < joined.length && i < m.index + 4000; i += 1) {
      if (joined[i] === '(') depth += 1;
      else if (joined[i] === ')') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    for (const k of joined.slice(m.index, end).matchAll(/['"]([\w-]+)['"]\s*=>/g)) menus.add(k[1]);
  }

  return {
    postTypes: grab(/register_post_type\(\s*['"]([\w-]+)['"]/g),
    taxonomies: grab(/register_taxonomy\(\s*['"]([\w-]+)['"]/g),
    menus: [...menus],
    shortcodes: grab(/add_shortcode\(\s*['"]([\w-]+)['"]/g),
    imageSizes: grab(/add_image_size\(\s*['"]([\w@-]+)['"]/g),
    widgets: grab(/register_widget\(\s*['"]?([\w\\]+)/g),
    ajax: grab(/add_action\(\s*['"]wp_ajax_(?:nopriv_)?([\w-]+)['"]/g),
    rest: grab(/register_rest_route\(\s*['"]([\w\/-]+)['"]/g),
  };
}

function detectIntegrations(root, phpFiles) {
  const joined = phpFiles.slice(0, 800).map(read).join('\n');
  const out = [];
  const checks = [
    ['WooCommerce', /class_exists\s*\(\s*['"]WooCommerce['"]|woocommerce_/i, exists(root, 'woocommerce')],
    ['TGM Plugin Activation', /tgmpa\s*\(|TGM_Plugin_Activation/i, false],
    ['One Click Demo Import', /OCDI|ocdi_|pt-ocdi/i, false],
    ['Slider Revolution', /RevSlider|revslider/i, false],
    ['Contact Form 7', /wpcf7|contact-form-7/i, false],
    ['Yoast SEO', /WPSEO|wpseo_/i, false],
  ];
  for (const [name, re, dirHint] of checks) {
    if (re.test(joined) || dirHint) out.push(name);
  }
  return out;
}

function detectStructure(root) {
  const dirs = [];
  try {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
      const count = walk(path.join(root, e.name), { exts: ['.php'] }).length;
      dirs.push({ dir: e.name, phpFiles: count });
    }
  } catch { /* ignore */ }
  return dirs.sort((a, b) => b.phpFiles - a.phpFiles);
}

// ---------------------------------------------------------------------------

function analyze(root) {
  const phpFiles = walk(root, { exts: ['.php'] });
  const k = detectKind(root);
  const report = {
    path: root,
    kind: k.kind,
    header: k.header,
    headerFile: k.headerFile,
    counts: {
      php: phpFiles.length,
      css: walk(root, { exts: ['.css'] }).length,
      js: walk(root, { exts: ['.js'] }).length,
      scss: walk(root, { exts: ['.scss'] }).length,
    },
  };
  if (k.kind === 'theme' || k.kind === 'child-theme') {
    Object.assign(report, detectThemeGeneration(root));
  }
  report.prefixes = detectPrefix(root, phpFiles);
  report.optionSystems = detectOptions(root, phpFiles);
  report.pageBuilders = detectBuilders(root, phpFiles);
  report.buildChain = detectBuildChain(root);
  report.i18n = detectI18n(root, phpFiles);
  report.registrations = detectRegistrations(root, phpFiles);
  report.integrations = detectIntegrations(root, phpFiles);
  report.structure = detectStructure(root);
  return report;
}

function renderText(r) {
  const L = [];
  const h = r.header || {};
  L.push('='.repeat(72));
  L.push(`${h['Theme Name'] || h['Plugin Name'] || path.basename(r.path)}  ${h.Version || ''}`);
  L.push('='.repeat(72));
  L.push(`Kind          : ${r.kind}${h.Template ? ` (child of "${h.Template}")` : ''}`);
  if (r.generation) L.push(`Generation    : ${r.generation}`);
  if (r.detail) L.push(`                ${r.detail}`);
  L.push(`Text domain   : ${h['Text Domain'] || '(not declared)'}`);
  L.push(`Requires      : WP ${h['Requires at least'] || '?'} / PHP ${h['Requires PHP'] || '?'}   Tested: ${h['Tested up to'] || '?'}`);
  L.push(`Files         : ${r.counts.php} php, ${r.counts.css} css, ${r.counts.js} js, ${r.counts.scss} scss`);
  L.push('');

  if (r.prefixes?.length) {
    L.push('NAMESPACE CONVENTION');
    for (const p of r.prefixes) L.push(`  ${p.prefix}_${' '.repeat(Math.max(1, 16 - p.prefix.length))}${p.count} ${p.kind}`);
    L.push('');
  }
  if (r.optionSystems?.length) {
    L.push('OPTIONS');
    for (const o of r.optionSystems) { L.push(`  ${o.system}`); L.push(`      ${o.note}`); }
    L.push('');
  }
  if (r.pageBuilders?.length) { L.push('PAGE BUILDERS'); L.push(`  ${r.pageBuilders.join(', ')}`); L.push(''); }
  if (r.integrations?.length) { L.push('INTEGRATIONS'); L.push(`  ${r.integrations.join(', ')}`); L.push(''); }

  if (r.buildChain?.length) {
    L.push('BUILD CHAIN');
    for (const b of r.buildChain) {
      L.push(`  ${b.tool}: ${b.detail}`);
      for (const e of b.entrypoints || []) L.push(`      ${e}`);
    }
    L.push('');
  }

  const reg = r.registrations || {};
  const regLines = Object.entries(reg).filter(([, v]) => v.length);
  if (regLines.length) {
    L.push('REGISTRATIONS');
    for (const [key, vals] of regLines) {
      L.push(`  ${key.padEnd(12)}: ${vals.slice(0, 12).join(', ')}${vals.length > 12 ? ` … (+${vals.length - 12})` : ''}`);
    }
    L.push('');
  }

  const i = r.i18n || {};
  L.push('I18N');
  L.push(`  languages dir : ${i.directory || 'none'}   pot: ${(i.pot || []).join(', ') || 'none'}   po/mo: ${i.translations || 0}`);
  L.push(`  wpml-config   : ${i.wpml ? 'yes' : 'no'}    polylang hooks: ${i.polylang ? 'yes' : 'no'}    rtl css: ${i.rtl ? 'yes' : 'no'}`);
  if ((i.textDomainsUsed || []).length > 1) {
    L.push(`  ! multiple text domains in use: ${i.textDomainsUsed.join(', ')} — strings under the wrong domain never translate`);
  }
  L.push('');

  if (r.structure?.length) {
    L.push('STRUCTURE (php files per directory)');
    for (const s of r.structure.slice(0, 15)) L.push(`  ${String(s.phpFiles).padStart(4)}  ${s.dir}/`);
  }
  return L.join('\n');
}

function renderMd(r) {
  const h = r.header || {};
  const L = [`# ${h['Theme Name'] || h['Plugin Name'] || path.basename(r.path)} ${h.Version || ''}`, ''];
  L.push('| Field | Value |', '|---|---|');
  L.push(`| Kind | ${r.kind}${h.Template ? ` (child of ${h.Template})` : ''} |`);
  if (r.generation) L.push(`| Generation | ${r.generation} |`);
  L.push(`| Text domain | ${h['Text Domain'] || '—'} |`);
  L.push(`| Requires | WP ${h['Requires at least'] || '?'} / PHP ${h['Requires PHP'] || '?'} |`);
  L.push(`| Files | ${r.counts.php} php, ${r.counts.css} css, ${r.counts.js} js, ${r.counts.scss} scss |`);
  L.push(`| Prefix | ${(r.prefixes || []).map((p) => `\`${p.prefix}_\``).join(', ') || '—'} |`);
  L.push(`| Options | ${(r.optionSystems || []).map((o) => o.system).join(', ') || '—'} |`);
  L.push(`| Builders | ${(r.pageBuilders || []).join(', ') || '—'} |`);
  L.push('');
  if (r.detail) L.push(`> ${r.detail}`, '');
  return L.join('\n');
}

const args = process.argv.slice(2);
if (!args.length) {
  console.log('usage: node wp-detect.mjs <path-to-theme-or-plugin> [--format text|json|md]');
  process.exit(2);
}
const target = args[0];
if (!fs.existsSync(target)) {
  console.error(`error: path not found: ${target}`);
  process.exit(2);
}
const fmt = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'text';
const result = analyze(target);
if (fmt === 'json') console.log(JSON.stringify(result, null, 2));
else if (fmt === 'md') console.log(renderMd(result));
else console.log(renderText(result));
