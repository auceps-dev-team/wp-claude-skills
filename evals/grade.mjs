#!/usr/bin/env node
/**
 * grade.mjs — check the mechanically verifiable assertions for each eval run.
 *
 * Assertions that need judgment (e.g. "distinguishes exploitable from cosmetic")
 * are left null here and graded by a human/agent pass. Everything that can be
 * decided by inspecting the produced files is decided here, because a regex is
 * more consistent than eyeballing eight directories.
 *
 *   node grade.mjs <iteration-dir>
 *
 * Writes grading.json into each run directory.
 */

import fs from 'node:fs';
import path from 'node:path';

const ITER = process.argv[2];
if (!ITER || !fs.existsSync(ITER)) {
  console.error('usage: node grade.mjs <iteration-dir>');
  process.exit(2);
}

/** Read every output file of a run, concatenated, plus a per-file map. */
function readRun(runDir) {
  const outDir = path.join(runDir, 'outputs');
  const files = {};
  if (fs.existsSync(outDir)) {
    for (const f of fs.readdirSync(outDir)) {
      const p = path.join(outDir, f);
      if (fs.statSync(p).isFile()) {
        try { files[f] = fs.readFileSync(p, 'utf8'); } catch { /* skip */ }
      }
    }
  }
  return { files, all: Object.values(files).join('\n\n') };
}

const has = (s, re) => (re instanceof RegExp ? re.test(s) : s.includes(s ? re : re));
const countMatches = (s, re) => (s.match(re) || []).length;

/**
 * Each check returns { passed, evidence }. `null` passed = needs human judgment.
 */
const CHECKS = {
  'security-audit-bizix': {
    'Identifies the $wpdb->prepare() call with no placeholders in plugins/one-click-demo-import/swm-one-click-demo-import.php as a SQL injection risk': ({ all }) => {
      const file = /one-click-demo-import|swm-one-click-demo-import/i.test(all);
      const issue = /prepare\s*\(\)?[^.]{0,120}(placeholder|sans\s+placeholder|aucun\s+placeholder|no\s+placeholder)|injection\s+SQL|SQL\s+injection/i.test(all);
      return { passed: file && issue, evidence: `demo-importer file mentioned: ${file}; prepare/SQLi described: ${issue}` };
    },
    'Identifies swm_ajax_entries as an AJAX endpoint registered with wp_ajax_nopriv_ and lacking nonce verification': ({ all }) => {
      const named = /swm_ajax_entries/.test(all);
      const nonce = /nonce|check_ajax_referer|nopriv/i.test(all);
      return { passed: named && nonce, evidence: `endpoint named: ${named}; nonce/nopriv discussed: ${nonce}` };
    },
    'Cites at least three findings with a concrete file path and line number': ({ all }) => {
      const refs = new Set(all.match(/[\w\-/\\]+\.php\s*[:：]\s*\d+/g) || []);
      return { passed: refs.size >= 3, evidence: `${refs.size} distinct file:line references` };
    },
    'Assigns a severity level to each finding': ({ all }) => {
      const n = countMatches(all, /critique|critical|élevé|haute?\b|moyenne?\b|faible|high|medium|low/gi);
      return { passed: n >= 4, evidence: `${n} severity words` };
    },
    'Distinguishes exploitable findings from cosmetic or non-exploitable ones rather than reporting every signal at equal weight': ({ all }) => {
      const p = /non[- ]?(finding|exploitable|problème)|faux positif|cosmétique|théâtre de sécurité|security theatre|pas exploitable|sans impact|à ne pas corriger/i.test(all);
      return { passed: p, evidence: p ? 'explicit non-finding / non-exploitable section' : 'no triage section found' };
    },
    'States the trust model or who can reach the vulnerable code': ({ all }) => {
      const p = /(non[- ]?authentifié|anonyme|visiteur|abonné|subscriber|contributeur|administrateur|trust model|modèle de confiance|qui peut)/i.test(all);
      return { passed: p, evidence: p ? 'reachability/roles discussed' : 'no trust model' };
    },
  },

  'analyze-moody-architecture': {
    'Identifies the naming convention as class/constant based (Insight_ or INSIGHT_) rather than reporting a function prefix': ({ all }) =>
      ({ passed: /Insight_|INSIGHT_/.test(all), evidence: /Insight_|INSIGHT_/.test(all) ? 'Insight_/INSIGHT_ named' : 'convention not identified' }),
    'Identifies Kirki as the options/customizer layer': ({ all }) =>
      ({ passed: /kirki/i.test(all), evidence: /kirki/i.test(all) ? 'Kirki named' : 'Kirki absent' }),
    'Identifies WPBakery / Visual Composer as the page builder the theme extends': ({ all }) =>
      ({ passed: /wpbakery|visual composer|vc_map|vc-extend/i.test(all), evidence: 'builder mention' }),
    'Warns that the .css files are compiled from .scss sources and must not be edited directly': ({ all }) => {
      const p = /scss/i.test(all) && /(compil|générés?|ne pas (modifier|éditer)|écrasé|overwritten|do not edit)/i.test(all);
      return { passed: p, evidence: p ? 'scss->css compilation warning present' : 'no compiled-asset warning' };
    },
    'Classifies the theme as classic (PHP template hierarchy, no theme.json)': ({ all }) => {
      const p = /classique|classic/i.test(all) && /(theme\.json|hiérarchie|hierarchy|FSE|bloc)/i.test(all);
      return { passed: p, evidence: p ? 'classic classification with justification' : 'not classified' };
    },
    'Produces a CLAUDE.md file containing an explicit do-not-edit or generated-files section': ({ files }) => {
      const c = files['CLAUDE.md'];
      if (!c) return { passed: false, evidence: 'CLAUDE.md not produced' };
      const p = /ne pas (modifier|éditer|toucher)|do not edit|générés?|compilé|interdit/i.test(c);
      return { passed: p, evidence: p ? 'CLAUDE.md has a do-not-edit section' : 'CLAUDE.md present but no do-not-edit section' };
    },
    'Mentions the framework/ directory of singleton classes as the theme\'s core': ({ all }) =>
      ({ passed: /framework\//i.test(all), evidence: /framework\//i.test(all) ? 'framework/ referenced' : 'framework/ not referenced' }),
  },

  'customizer-color-option': {
    'Every add_setting() call includes a sanitize_callback argument': ({ files }) => {
      const php = Object.entries(files).filter(([k]) => k.endsWith('.php')).map(([, v]) => v).join('\n');
      const settings = countMatches(php, /add_setting\s*\(/g);
      const sanitizers = countMatches(php, /sanitize_callback/g);
      return { passed: settings > 0 && sanitizers >= settings, evidence: `${settings} add_setting, ${sanitizers} sanitize_callback` };
    },
    'The colour setting is validated with sanitize_hex_color or an equivalent shape check': ({ all }) =>
      ({ passed: /sanitize_hex_color/.test(all), evidence: /sanitize_hex_color/.test(all) ? 'sanitize_hex_color used' : 'no hex validation' }),
    'The width setting is validated as a bounded integer (absint plus a range check or equivalent)': ({ all }) => {
      const p = /absint|intval/.test(all) && /(min\s*\(|max\s*\(|<\s*\d{3}|>\s*\d{3}|clamp|born)/i.test(all);
      return { passed: p, evidence: p ? 'integer cast + bounding' : 'unbounded or uncast' };
    },
    'CSS is emitted via wp_add_inline_style rather than echoing a <style> block into wp_head': ({ all }) => {
      const good = /wp_add_inline_style/.test(all);
      const bad = /echo\s*['"<]*\s*<style|<style[^>]*>\s*['"]?\s*\.\s*\$|printf\s*\(\s*['"]<style/i.test(all);
      return { passed: good && !bad, evidence: `wp_add_inline_style: ${good}; raw <style> echo: ${bad}` };
    },
    'Generated CSS defines CSS custom properties rather than enumerating many hard-coded selectors': ({ all }) =>
      ({ passed: /--[a-z][\w-]*\s*:/.test(all) && /:root/.test(all), evidence: 'CSS custom properties on :root' }),
    'Uses transport => postMessage together with a JavaScript preview binding file': ({ files, all }) => {
      const t = /postMessage/.test(all);
      // The binding is commonly written against an aliased handle
      // ( function ( $, api ) { api( 'setting', ... ) } )( jQuery, wp.customize );
      // so matching only `wp.customize(` produces a false negative.
      const js = Object.keys(files).some((f) => f.endsWith('.js'))
        && /(wp\.customize|\bapi)\s*\(\s*['"]/.test(all);
      return { passed: t && js, evidence: `postMessage: ${t}; JS binding: ${js}` };
    },
    'All functions, settings and handles are prefixed with the theme slug (auceps)': ({ files }) => {
      const php = Object.entries(files).filter(([k]) => k.endsWith('.php')).map(([, v]) => v).join('\n');
      const fns = [...php.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]);
      const bad = fns.filter((f) => !/^auceps/i.test(f));
      return { passed: fns.length > 0 && bad.length === 0, evidence: `${fns.length} functions, ${bad.length} unprefixed${bad.length ? ': ' + bad.slice(0, 4).join(', ') : ''}` };
    },
    'No option value is interpolated into CSS without validation': () => ({ passed: null, evidence: 'needs review' }),
  },

  'child-theme-strategy': {
    'Notices that a child theme (stratego-child) already ships with the package and recommends using it rather than creating one from scratch': ({ all }) => {
      const p = /stratego-child/.test(all) && /(déjà|livré|fourni|existe|already|shipp)/i.test(all);
      return { passed: p, evidence: p ? 'existing child theme noticed' : 'did not notice shipped child' };
    },
    'States the correct Template: value for the child theme (stratego)': ({ all }) =>
      ({ passed: /Template:\s*stratego\b/.test(all), evidence: /Template:\s*stratego\b/.test(all) ? 'Template: stratego present' : 'Template header missing/wrong' }),
    'Explains that the child functions.php is additive and runs before the parent, not a replacement': ({ all }) => {
      const p = /(additif|s'ajoute|ne remplace pas|avant le parent|charge[nrt]?\s+(en\s+)?premier|before the parent|additive)/i.test(all);
      return { passed: p, evidence: p ? 'load order / additivity explained' : 'not explained' };
    },
    'Addresses whether the parent\'s functions are wrapped in function_exists, and what that implies for overriding them': ({ all }) =>
      ({ passed: /function_exists/.test(all), evidence: /function_exists/.test(all) ? 'function_exists discussed' : 'absent' }),
    'Explains that an overridden single.php becomes the maintainer\'s responsibility and must be re-synced against parent updates': ({ all }) => {
      const p = /single\.php/.test(all) && /(resync|re-?sync|resynchro|à jour|maintenir|figé|responsabilité|chaque mise à jour|recopi)/i.test(all);
      return { passed: p, evidence: p ? 'override maintenance cost stated' : 'not stated' };
    },
    // Reframed after reviewing the outputs: Stratego's parent enqueues the child
    // stylesheet itself (stratego_wp_styles_child, functions.php:348), so adding
    // the textbook wp_enqueue_style would double-load it. Demanding
    // get_stylesheet_directory_uri unconditionally punished the run that
    // correctly discovered this. The real requirement is that child assets are
    // never addressed through the parent path.
    'Child assets are addressed correctly: either via get_stylesheet_directory_uri, or the answer establishes that the parent already enqueues the child stylesheet': ({ all }) => {
      const usesChildPath = /get_stylesheet_directory_uri|STRATEGO_CHILD_URL/.test(all);
      const knowsParentLoads = /stratego_wp_styles_child|double\s*chargement|charge (lui-même|déjà)|parent.{0,40}charge/i.test(all);
      const wrongPath = /get_template_directory_uri\s*\(\s*\)\s*\.\s*['"]\/style\.css/.test(all);
      return {
        passed: (usesChildPath || knowsParentLoads) && !wrongPath,
        evidence: `child path: ${usesChildPath}; knows parent auto-enqueues: ${knowsParentLoads}; parent path misuse: ${wrongPath}`,
      };
    },
    'Inspects the actual theme files rather than answering generically': ({ all }) => {
      const refs = new Set(all.match(/[\w\-/\\]+\.php\s*[:：]\s*\d+/g) || []);
      return { passed: refs.size >= 2, evidence: `${refs.size} concrete file:line references into the real theme` };
    },
  },
};

let summary = [];
for (const evalName of Object.keys(CHECKS)) {
  for (const cfg of ['with_skill', 'without_skill', 'old_skill']) {
    const runDir = path.join(ITER, evalName, cfg);
    if (!fs.existsSync(runDir)) continue;
    const run = readRun(runDir);

    // A run that produced no artifacts has no data. Scoring it 0/N would read
    // as "failed every assertion", which is a different and much stronger
    // claim than "did not complete".
    if (Object.keys(run.files).length === 0) {
      fs.writeFileSync(path.join(runDir, 'grading.json'),
        JSON.stringify({ eval_name: evalName, configuration: cfg, status: 'no_output', expectations: [] }, null, 2));
      summary.push({ evalName, cfg, status: 'NO OUTPUT' });
      continue;
    }

    const expectations = [];
    for (const [text, fn] of Object.entries(CHECKS[evalName])) {
      let res;
      try { res = fn(run); } catch (e) { res = { passed: false, evidence: `check error: ${e.message}` }; }
      expectations.push({ text, passed: res.passed, evidence: res.evidence });
    }
    const auto = expectations.filter((e) => e.passed !== null);
    const passed = auto.filter((e) => e.passed).length;
    // Two consumers, two shapes: the viewer reads `expectations`, the
    // aggregator reads `summary`. Emit both rather than making either guess.
    const timingPath = path.join(runDir, 'timing.json');
    const timing = fs.existsSync(timingPath)
      ? JSON.parse(fs.readFileSync(timingPath, 'utf8'))
      : {};

    fs.writeFileSync(path.join(runDir, 'grading.json'), JSON.stringify({
      eval_name: evalName,
      configuration: cfg,
      status: 'graded',
      summary: {
        passed,
        failed: auto.length - passed,
        total: auto.length,
        pass_rate: auto.length ? passed / auto.length : 0,
        manual_review: expectations.length - auto.length,
      },
      timing,
      expectations,
    }, null, 2));
    summary.push({ evalName, cfg, passed, total: auto.length, manual: expectations.length - auto.length });
  }
}

console.log('eval'.padEnd(30), 'config'.padEnd(15), 'auto-graded');
for (const s of summary) {
  if (s.status) {
    console.log(s.evalName.padEnd(30), s.cfg.padEnd(15), s.status);
    continue;
  }
  const pct = s.total ? Math.round((s.passed / s.total) * 100) : 0;
  console.log(s.evalName.padEnd(30), s.cfg.padEnd(15),
    `${s.passed}/${s.total} (${pct}%)${s.manual ? ` +${s.manual} manual` : ''}`);
}
